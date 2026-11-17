// Real staged renders over file://: Route A uses Chrome's CLI; Route B uses CDP pipes.
import { writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const CHROME = '/home/hatch/workspace/tools/chrome-test/chrome-linux64/chrome';
const SHOTS = [['hero', '01-hero.jpg'], ['foot', '02-foot.jpg'], ['complete', '03-complete.jpg'], ['map', '04-map.jpg']];
const FLAGS = ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars', '--window-size=1280,720'];

function shotURL(mode) {
  const url = pathToFileURL(resolve(ROOT, 'game/index.html'));
  url.searchParams.set('shot', mode);
  return url.href;
}
function chromeEnvironment(scratch) {
  // Keep Chrome's profiles, caches and temporary files inside this repository.
  // The repository root keeps SingletonSocket below the 108-byte Unix socket path limit.
  return { ...process.env, TMPDIR: ROOT, XDG_CONFIG_HOME: resolve(scratch, 'config'), XDG_CACHE_HOME: resolve(scratch, 'cache') };
}
function commandLine(binary, args) {
  return [binary, ...args].map(value => "'" + value.replaceAll("'", "'\\''") + "'").join(' ');
}
async function run(binary, args, options = {}) {
  console.log(commandLine(binary, args));
  return new Promise((resolveRun, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${binary} exited ${code}, signal ${signal}\n${stdout}${stderr}`));
      else resolveRun({ stdout, stderr });
    });
  });
}
const CONVERT = `from PIL import Image
from pathlib import Path
import sys
source, target = sys.argv[1:]
with Image.open(source) as image:
    assert image.size == (1280, 720), image.size
    image.convert('RGB').save(target, 'JPEG', quality=85, optimize=True)
size = Path(target).stat().st_size
assert size <= 262144, f'{target}: {size} bytes exceeds 256 KiB'
print(f'{Path(target).name}: {size} bytes, 1280x720, JPEG quality 85')
`;

async function renderCLI(budget) {
  const scratch = await mkdtemp(resolve(ROOT, '.shots-A-'));
  try {
    for (const [mode, name] of SHOTS) {
      const png = resolve(scratch, mode + '.png');
      const args = [...FLAGS, '--virtual-time-budget=' + budget, '--screenshot=' + png,
        '--user-data-dir=' + resolve(scratch, 'profile-' + mode), '--no-first-run', '--no-default-browser-check', shotURL(mode)];
      const capture = await run(CHROME, args, { env: chromeEnvironment(scratch) });
      if (capture.stderr) console.log(capture.stderr.trim());
      const converted = await run('python3', ['-c', CONVERT, png, resolve(ROOT, 'screenshots', name)]);
      console.log(converted.stdout.trim());
    }
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

// Retain the integration runner's page API, with NUL-delimited CDP on FDs 3 and 4.
export class ChromePage {
  constructor(input, output) {
    this.input = input; this.serial = 0; this.sessionId = undefined; this.pending = new Map(); this.errors = [];
    let buffer = '';
    output.setEncoding('utf8');
    output.on('data', data => {
      buffer += data;
      let end;
      while ((end = buffer.indexOf('\0')) !== -1) {
        const message = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!message) continue;
        const packet = JSON.parse(message);
        if (packet.id) {
          const request = this.pending.get(packet.id); if (!request) continue;
          clearTimeout(request.timeout); this.pending.delete(packet.id);
          if (packet.error) request.reject(new Error(packet.error.message)); else request.resolve(packet.result);
        } else if (packet.method === 'Runtime.exceptionThrown') {
          const error = packet.params.exceptionDetails;
          this.errors.push(error.exception?.description || error.text);
        } else if (packet.method === 'Runtime.consoleAPICalled' && packet.params.type === 'error') {
          this.errors.push(packet.params.args.map(arg => arg.value || arg.description).join(' '));
        } else if (packet.method === 'Log.entryAdded' && packet.params.entry.level === 'error') {
          this.errors.push(packet.params.entry.text);
        }
      }
    });
    input.on('error', error => this.close(error));
    output.on('close', () => this.close(new Error('Chrome CDP pipe closed')));
  }
  async send(method, params = {}) {
    const id = ++this.serial;
    return new Promise((resolveRequest, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error('Chrome timed out: ' + method)); }, 20000);
      this.pending.set(id, { resolve: resolveRequest, reject, timeout });
      this.input.write(JSON.stringify({ id, method, params, sessionId: this.sessionId }) + '\0');
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async waitFor(expression, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try { if (await this.evaluate(expression)) return; } catch { /* Navigation can replace the execution context. */ }
      await delay(60);
    }
    throw new Error('Page never became ready: ' + expression);
  }
  async navigate(url) {
    this.errors.length = 0;
    const target = new URL(url);
    if (target.pathname.endsWith('/')) target.pathname += 'index.html';
    const result = await this.send('Page.navigate', { url: target.href });
    if (result.errorText) throw new Error(result.errorText);
    await this.waitFor(`location.href === ${JSON.stringify(target.href)} && window.__gameReady === true`);
    await this.evaluate('document.fonts.ready.then(() => true)');
  }
  close(error = new Error('Chrome closed')) {
    for (const request of this.pending.values()) { clearTimeout(request.timeout); request.reject(error); }
    this.pending.clear();
  }
}

export async function withChrome(work) {
  const scratch = await mkdtemp(resolve(ROOT, '.shots-B-'));
  const args = [...FLAGS, '--remote-debugging-pipe', '--user-data-dir=' + resolve(scratch, 'profile'), '--no-first-run', '--no-default-browser-check', 'about:blank'];
  console.log(commandLine(CHROME, args));
  const chrome = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], env: chromeEnvironment(scratch) });
  let stderr = '', launchError = null;
  chrome.stderr.setEncoding('utf8'); chrome.stderr.on('data', data => { stderr += data; });
  const page = new ChromePage(chrome.stdio[3], chrome.stdio[4]);
  chrome.once('error', error => { launchError = error; page.close(error); });
  chrome.once('exit', (code, signal) => page.close(new Error(`Chrome exited ${code}, signal ${signal}`)));
  try {
    const { targetId } = await page.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await page.send('Target.attachToTarget', { targetId, flatten: true });
    page.sessionId = sessionId;
    await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Log.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    return await work(page, pathToFileURL(resolve(ROOT, 'game')).href);
  } catch (error) {
    throw new Error(`Route B failed: ${launchError || error.message}\n${stderr}`, { cause: error });
  } finally {
    page.close();
    if (chrome.exitCode === null && chrome.signalCode === null) {
      chrome.kill('SIGTERM');
      await Promise.race([new Promise(resolveExit => chrome.once('exit', resolveExit)), delay(3000)]);
      if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
    }
    await rm(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

async function renderPipes() {
  await withChrome(async page => {
    for (const [mode, name] of SHOTS) {
      await page.navigate(shotURL(mode));
      await page.waitFor('window.__shotReady === true');
      if (page.errors.length) throw new Error(mode + ' has browser errors:\n' + page.errors.join('\n'));
      console.log(`Page.navigate ${shotURL(mode)}; Runtime.evaluate window.__shotReady === true; Page.captureScreenshot format=jpeg quality=85`);
      const capture = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85, fromSurface: true, captureBeyondViewport: false });
      const bytes = Buffer.from(capture.data, 'base64');
      if (bytes.length > 262144) throw new Error(name + ' exceeds 256 KiB: ' + bytes.length);
      await writeFile(resolve(ROOT, 'screenshots', name), bytes);
      console.log(name + ': ' + bytes.length + ' bytes, 1280x720, JPEG quality 85');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const route = process.argv.find(arg => arg.startsWith('--route='))?.split('=')[1] || 'A';
  const budget = Number(process.argv.find(arg => arg.startsWith('--virtual-time-budget='))?.split('=')[1] || 20000);
  if (!['A', 'B'].includes(route) || ![20000, 40000].includes(budget)) throw new Error('Use --route=A|B and --virtual-time-budget=20000|40000');
  mkdir(resolve(ROOT, 'screenshots'), { recursive: true })
    .then(() => route === 'A' ? renderCLI(budget) : renderPipes())
    .then(() => console.log('Route ' + route + ' completed'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
