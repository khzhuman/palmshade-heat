// Render the four staged game scenes with the VM's working Chrome; no packages required.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const CHROME = '/home/hatch/workspace/tools/chrome-test/chrome-linux64/chrome';
const SHOTS = [['hero', '01-hero.jpg'], ['foot', '02-foot.jpg'], ['complete', '03-complete.jpg'], ['map', '04-map.jpg']];

async function renderScreenshots() {
  await mkdir(resolve(ROOT, 'screenshots'), { recursive: true });
  await withChrome(async (page, baseURL) => {
    for (const [mode, name] of SHOTS) {
      await page.navigate(baseURL + '/?shot=' + mode);
      await page.waitFor('window.__shotReady === true');
      if (page.errors.length) throw new Error(mode + ' has browser errors:\n' + page.errors.join('\n'));
      let bytes, quality = 85;
      do {
        const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality, fromSurface: true, captureBeyondViewport: false });
        bytes = Buffer.from(shot.data, 'base64');
        if (bytes.length <= 262144) break;
        quality -= 5;
      } while (quality >= 60);
      if (bytes.length > 262144) throw new Error(name + ' exceeds 256 KiB');
      await writeFile(resolve(ROOT, 'screenshots', name), bytes);
      console.log(name + ': ' + bytes.length + ' bytes, 1280×720, JPEG ' + quality);
    }
  });
  for (const name of ['1-start.jpg', '2-play.jpg', '3-end.jpg']) await rm(resolve(ROOT, 'screenshots', name), { force: true });
}


export class ChromePage {
  constructor(socket) {
    this.socket = socket; this.serial = 0; this.pending = new Map(); this.errors = [];
    socket.addEventListener('message', event => {
      const packet = JSON.parse(event.data);
      if (packet.id) {
        const request = this.pending.get(packet.id);
        if (!request) return;
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
    });
  }
  async send(method, params = {}) {
    const id = ++this.serial;
    return new Promise((resolveRequest, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error('Chrome timed out: ' + method)); }, 20000);
      this.pending.set(id, { resolve: resolveRequest, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
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
      try { if (await this.evaluate(expression)) return; } catch { /* The navigation may still be replacing the execution context. */ }
      await delay(60);
    }
    throw new Error('Page never became ready: ' + expression);
  }
  async navigate(url) {
    this.errors.length = 0;
    await this.send('Page.navigate', { url });
    const expected = JSON.stringify(new URL(url).search);
    await this.waitFor(`location.search === ${expected} && window.__gameReady === true`);
    await this.evaluate('document.fonts.ready.then(() => true)');
  }
  close() {
    for (const request of this.pending.values()) { clearTimeout(request.timeout); request.reject(new Error('Chrome closed')); }
    this.pending.clear(); this.socket.close();
  }
}

export async function withChrome(work) {
  const gameRoot = resolve(ROOT, 'game'), profile = await mkdtemp('/tmp/palmshade-chrome-');
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(gameRoot, '.' + (path.endsWith('/') ? path + 'index.html' : path));
      if (!file.startsWith(gameRoot + sep)) { response.writeHead(403).end(); return; }
      const bytes = await readFile(file);
      const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[extname(file)] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }); response.end(bytes);
    } catch { response.writeHead(404).end('Not found'); }
  });
  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolveListen);
    });
  } catch (error) {
    await rm(profile, { recursive: true, force: true });
    throw new Error('Cannot serve game/ locally (' + error.code + '). Run shots.mjs in a runner that permits localhost and Chrome to start.', { cause: error });
  }
  const baseURL = 'http://127.0.0.1:' + server.address().port;
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*', '--window-size=1280,720', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '', launchError = null, page = null;
  chrome.stderr.on('data', data => { stderr = (stderr + data).slice(-12000); });
  chrome.on('error', error => { launchError = error; });
  try {
    let port;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (launchError) throw launchError;
      if (chrome.exitCode !== null) throw new Error('Chrome exited: ' + stderr);
      try { port = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (port) break; } catch { /* Chrome is starting. */ }
      await delay(80);
    }
    if (!port) throw new Error('Chrome did not start: ' + stderr);
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    const target = targets.find(item => item.type === 'page');
    if (!target) throw new Error('Chrome has no page target');
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    page = new ChromePage(socket);
    await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Log.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    return await work(page, baseURL);
  } finally {
    page?.close();
    if (chrome.exitCode === null) {
      chrome.kill('SIGTERM');
      await Promise.race([new Promise(resolveExit => chrome.once('exit', resolveExit)), delay(3000)]);
      if (chrome.exitCode === null) chrome.kill('SIGKILL');
    }
    server.closeAllConnections(); await new Promise(resolveClose => server.close(resolveClose));
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  renderScreenshots().catch(error => { console.error(error); process.exitCode = 1; });
}
