'use strict';
// Run Palmshade: input, saved story progress, camera, menus, sound and staged renders.
function startPalmshadeGame() {
  resizeGame(); initializeWorld(); installInput();
  if (game.shot) stageScreenshot(game.shot); else showTitleScreen();
  requestAnimationFrame(runGameFrame);
}

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d', { alpha: false });
const hud = document.getElementById('hud');
const overlay = document.getElementById('overlay');
const camera = { x: 1000, y: 1424, zoom: 1.35 };
const keys = new Set(), justPressed = new Set();
const mouse = { x: 0, y: 0, active: false, down: false };
const SAVE_KEY = 'palmshade-heat-save-v1';
const shotParameter = new URLSearchParams(location.search).get('shot');
const game = {
  mode: 'title', cash: 750, time: 0, renderTime: 0, worldMinutes: 1045,
  dpr: 1, width: 1280, height: 720, lastFrame: 0, renderedFrames: 0,
  shot: ['hero', 'foot', 'complete', 'map'].includes(shotParameter) ? shotParameter : null,
  toast: '', toastUntil: 0, lastEngine: -1, lastSiren: -4, shopCooldown: 0,
  saveTimer: 0, saveAvailable: true, audioMuted: false,
  stats: { missions: 0, topWanted: 0, carsStolen: 0, shotsFired: 0, pedestriansDown: 0, playTime: 0, earned: 0, scoreTaken: false },
  get health() { return player.health; },
  set health(value) { player.health = clamp(value, 0, 100); }
};
let audioContext = null, masterGain = null;

function initializeWorld() {
  if (!city.surface) buildCity();
  spawnVehicles(); spawnPedestrians(); resetPlayer(); resetMissions(); resetInput();
  Object.assign(wanted, { level: 0, top: 0, lastCrime: -100, unseen: 0, bust: 0, spawnTimer: 0, seen: false, reason: '', forced: false });
  game.toast = ''; game.toastUntil = 0; game.shopCooldown = 0; game.saveTimer = 0;
  game.lastEngine = -1; game.lastSiren = -4; game.lastFrame = 0;
}
function newGame() {
  initializeWorld();
  game.cash = 750; game.time = 0; game.worldMinutes = 1045;
  Object.assign(game.stats, { missions: 0, topWanted: 0, carsStolen: 0, shotsFired: 0, pedestriansDown: 0, playTime: 0, earned: 0, scoreTaken: false });
  camera.x = player.x; camera.y = player.y; camera.zoom = 1.4;
  clearWanted(); showMissionIntro(); saveGame();
}
function clockMinutes() { return game.shot ? 1045 : game.worldMinutes; }
function resizeGame() {
  game.dpr = Math.min(2, window.devicePixelRatio || 1);
  game.width = window.innerWidth; game.height = window.innerHeight;
  canvas.width = Math.round(game.width * game.dpr); canvas.height = Math.round(game.height * game.dpr);
}
function resetInput() { keys.clear(); justPressed.clear(); mouse.down = false; mouse.active = false; }
function keyDown(...names) { return names.some(name => keys.has(name)); }
function installInput() {
  window.addEventListener('resize', resizeGame);
  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'e', 'j', 'k', '1', '2', 'p', 'm', 'escape', 'enter'].includes(key)) event.preventDefault();
    if (!event.repeat) justPressed.add(key);
    keys.add(key);
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) mouse.active = false;
    unlockAudio();
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => {
    resetInput();
    if (game.mode === 'playing' && !game.shot) showPauseMenu();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing' && !game.shot) showPauseMenu();
    game.lastFrame = 0;
  });
  canvas.addEventListener('pointermove', event => {
    const rect = canvas.getBoundingClientRect(); mouse.x = event.clientX - rect.left; mouse.y = event.clientY - rect.top; mouse.active = true;
  });
  canvas.addEventListener('pointerdown', event => { if (event.button === 0 && game.mode === 'playing') mouse.down = true; });
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('pointerup', () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
}
function handleMenuInput() {
  if (justPressed.has('escape') || justPressed.has('p')) {
    if (game.mode === 'playing') showPauseMenu(); else if (game.mode === 'paused' || game.mode === 'map') resumeGame();
  } else if (justPressed.has('m')) {
    if (game.mode === 'playing' || game.mode === 'paused') showWorldMap(); else if (game.mode === 'map') resumeGame();
  }
  if (justPressed.has('enter')) {
    if (game.mode === 'playing' && !mission.active && mission.index < 5) showMissionIntro();
    else if (game.mode === 'title' || game.mode === 'card' || game.mode === 'busted' || game.mode === 'wasted' || game.mode === 'ending') {
      const focused = document.activeElement;
      const button = focused && focused.tagName === 'BUTTON' ? focused : overlay.querySelector('.btn.primary');
      if (button && !button.disabled) button.click();
    }
  }
}
function showTitleScreen() {
  game.mode = 'title'; hud.hidden = true;
  camera.x = 1020; camera.y = 1480; camera.zoom = 1.25;
  overlay.innerHTML = `<div class="title-screen"><div class="eyebrow">AN ORIGINAL OPEN WORLD / PALMSHADE COUNTY</div><h1 class="title-logo">PALMSHADE<span>HEAT</span></h1><p class="tagline">Salt air. Stolen wheels. One way out.<br>Build a name in a city that remembers.</p><div class="buttons"><button class="btn primary" id="new-game">NEW GAME →</button><button class="btn" id="continue-game" ${readSave() ? '' : 'disabled'}>CONTINUE</button></div><div class="title-features"><span>FIVE STORY JOBS FROM MARA VOSS</span><span>A WANTED SYSTEM WITH POLICE WHO RESPOND</span><span>STEAL AND DRIVE ANY CAR · A LIVING MINIMAP</span></div><div class="title-controls"><div><b>WASD / ARROWS</b> Move / drive</div><div><b>SHIFT / SPACE</b> Sprint / handbrake</div><div><b>E</b> Steal / enter / exit</div><div><b>J / K</b> Punch / fire pistol</div><div><b>MOUSE / 1 / 2</b> Aim / select weapon</div><div><b>ESC / P / M</b> Pause / city map</div></div><div class="title-stamp">FIVE JOBS<br>FOUR DISTRICTS<br>ONE WAY OUT</div><div class="title-footer"><span>ORIGINAL CITY · CODE-DRAWN ART · SYNTHESIZED SOUND</span><span>ENTER TO START / LOCAL SAVE</span></div></div>`;
  document.getElementById('new-game').onclick = newGame;
  document.getElementById('continue-game').onclick = continueGame;
}
function showPauseMenu() {
  game.mode = 'paused'; resetInput(); saveGame();
  overlay.innerHTML = `<div class="scrim"><section class="card pause-card"><div class="eyebrow">THE CITY CAN WAIT.</div><h1>PAUSED</h1><p class="lead">${districtAt(player.x, player.y).name} · ${formatCash(game.cash)}</p><div class="buttons"><button class="btn primary" id="resume-game">RESUME →</button><button class="btn" id="open-map">FULL CITY MAP / M</button><button class="btn" id="sound-toggle">SOUND ${game.audioMuted ? 'OFF' : 'ON'}</button><button class="btn" id="restart-game">RESTART STORY</button></div><p class="card-note">Progress saves here and after every job.<br>ESC / P resumes. M opens your living map.</p></section></div>`;
  document.getElementById('resume-game').onclick = resumeGame;
  document.getElementById('open-map').onclick = showWorldMap;
  document.getElementById('restart-game').onclick = newGame;
  document.getElementById('sound-toggle').onclick = () => {
    game.audioMuted = !game.audioMuted;
    if (masterGain) masterGain.gain.setValueAtTime(game.audioMuted ? 0 : .35, audioContext.currentTime);
    document.getElementById('sound-toggle').textContent = 'SOUND ' + (game.audioMuted ? 'OFF' : 'ON');
  };
}
function resumeGame() { game.mode = 'playing'; overlay.innerHTML = ''; resetInput(); game.lastFrame = 0; }
function endGame(reason) {
  if (game.mode !== 'playing') return;
  game.mode = reason === 'busted' ? 'busted' : 'wasted'; resetInput();
  const busted = game.mode === 'busted';
  saveGame(); playSound('crash');
  overlay.innerHTML = `<div class="scrim"><section class="card complete-card end-card"><div class="eyebrow">PALMSHADE COUNTY / ${busted ? 'IN CUSTODY' : 'RUN ENDED'}</div><h1>${busted ? 'BUSTED' : 'WASTED'}</h1><p class="lead">${busted ? 'The patrols boxed you in. Keep your speed up and break their line of sight.' : 'The city hit harder this time. Find green first-aid crates and repair your car at the Shine Shop.'}</p>${statsMarkup()}<p class="card-note">${game.stats.carsStolen} cars stolen · ${game.stats.shotsFired} shots fired · ${formatTime(game.stats.playTime)} on the streets<br>Your completed jobs are saved.</p><div class="buttons"><button class="btn primary" id="retry-run">RETRY THIS JOB →</button><button class="btn" id="end-restart">NEW GAME</button></div></section></div>`;
  document.getElementById('retry-run').onclick = () => {
    if (player.car) { player.car.vx = player.car.vy = player.car.speed = 0; player.car.ai = player.car.health > 0 ? 'parked' : 'wreck'; }
    resetPlayer(); clearWanted();
    mission.active = false; mission.stage = 0;
    camera.x = player.x; camera.y = player.y;
    if (mission.index >= 5) resumeGame(); else showMissionIntro();
  };
  document.getElementById('end-restart').onclick = newGame;
}
function serializeCar(car) {
  return car ? { type: car.type, x: car.x, y: car.y, angle: car.angle, body: car.body, health: car.health, stolen: car.stolen, missionCar: !!car.missionCar } : null;
}
function saveGame() {
  if (game.shot || game.mode === 'title') return;
  const ended = game.mode === 'wasted' || game.mode === 'busted';
  const data = {
    version: 1, cash: game.cash, health: ended ? 100 : player.health, ammo: player.ammo, weapon: player.weapon,
    time: game.time, worldMinutes: game.worldMinutes, stats: { ...game.stats },
    player: ended ? { x: 600, y: 1020, angle: 0 } : { x: player.x, y: player.y, angle: player.angle },
    car: ended ? null : serializeCar(player.car), target: serializeCar(cars.find(c => c.missionCar)),
    mission: { index: mission.index, stage: ended ? 0 : mission.stage, active: !ended && mission.active, timer: mission.timer, elapsed: mission.elapsed },
    wanted: { level: ended ? 0 : wanted.level, unseen: wanted.unseen, crimeAge: game.time - wanted.lastCrime, forced: !ended && wanted.forced },
    supplies: supplyCrates.map(c => ({ available: c.available, respawn: c.respawn || 0 }))
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); game.saveAvailable = true; }
  catch { game.saveAvailable = false; document.getElementById('status').textContent = 'Browser storage unavailable. You can still play this session.'; }
}
function readSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data || data.version !== 1 || !Number.isFinite(data.cash) || !data.mission || !Number.isInteger(data.mission.index) || data.mission.index < 0 || data.mission.index > 5 || !data.player || !Number.isFinite(data.player.x) || !Number.isFinite(data.player.y)) return null;
    return data;
  } catch { return null; }
}
function savedNumber(value, fallback, low = 0, high = 100000000) { return Number.isFinite(value) ? clamp(value, low, high) : fallback; }
function restoreCar(saved, fallback) {
  if (!saved || !Object.hasOwn(carDefinitions, saved.type)) return null;
  const car = fallback || spawnCar(saved.type, savedNumber(saved.x, 600, 60, 2800), savedNumber(saved.y, 1020, 60, 2740));
  Object.assign(car, carDefinitions[saved.type], { type: saved.type, x: savedNumber(saved.x, 600, 60, 2800), y: savedNumber(saved.y, 1020, 60, 2740), angle: savedNumber(saved.angle, 0, -1000, 1000), health: savedNumber(saved.health, 100, 1, 100), stolen: !!saved.stolen });
  if (/^#[a-f0-9]{6}$/i.test(saved.body)) car.body = saved.body;
  if (isBlocked(car.x, car.y, 21)) { car.x = 600; car.y = 1020; }
  return car;
}
function continueGame() {
  const data = readSave(); if (!data) { newGame(); return; }
  initializeWorld();
  game.cash = savedNumber(data.cash, 750); game.time = savedNumber(data.time, 0); game.worldMinutes = savedNumber(data.worldMinutes, 1045);
  for (const key of Object.keys(game.stats)) game.stats[key] = key === 'scoreTaken' ? !!data.stats?.[key] : savedNumber(data.stats?.[key], 0);
  game.stats.missions = data.mission.index; game.stats.topWanted = Math.round(clamp(game.stats.topWanted, 0, 5));
  player.x = savedNumber(data.player.x, 600, 45, 2820); player.y = savedNumber(data.player.y, 1020, 45, 2750); player.angle = savedNumber(data.player.angle, 0, -1000, 1000);
  if (isBlocked(player.x, player.y, 9)) { player.x = 600; player.y = 1020; }
  player.health = savedNumber(data.health, 100, 1, 100); player.ammo = Math.round(savedNumber(data.ammo, 48, 0, 999)); player.weapon = data.weapon === 'pistol' ? 'pistol' : 'fists';
  const originalTarget = cars.find(c => c.missionCar);
  const target = restoreCar(data.target, originalTarget) || originalTarget;
  if (target) { target.missionCar = true; mission.targetCarId = target.id; }
  player.car = restoreCar(data.car, data.car?.missionCar ? target : null);
  if (player.car) { player.car.ai = 'player'; player.car.siren = false; player.x = player.car.x; player.y = player.car.y; }
  mission.index = data.mission.index;
  const stages = [1, 1, 1, 4, 1, 0];
  mission.stage = Math.round(savedNumber(data.mission.stage, 0, 0, stages[mission.index]));
  mission.active = !!data.mission.active && mission.index < 5;
  mission.timer = savedNumber(data.mission.timer, mission.index === 0 ? 180 : 90, 0, 180); mission.elapsed = savedNumber(data.mission.elapsed, 0);
  wanted.level = Math.round(savedNumber(data.wanted?.level, 0, 0, 5)); wanted.top = game.stats.topWanted;
  wanted.unseen = savedNumber(data.wanted?.unseen, 0, 0, 17); wanted.lastCrime = game.time - savedNumber(data.wanted?.crimeAge, 100); wanted.forced = mission.active && !!data.wanted?.forced;
  supplyCrates.forEach((c, i) => { c.available = data.supplies?.[i]?.available !== false; c.respawn = savedNumber(data.supplies?.[i]?.respawn, 0, 0, 90); });
  camera.x = player.x; camera.y = player.y; camera.zoom = 1.4;
  game.mode = 'playing'; overlay.innerHTML = ''; showToast('WELCOME BACK · YOUR CITY, YOUR STORY');
  if (!mission.active && mission.index < 5) showMissionIntro();
}
function followPlayerCamera(dt) {
  const lead = player.car ? .55 : 0;
  const targetX = player.x + (player.car?.vx || 0) * lead, targetY = player.y + (player.car?.vy || 0) * lead;
  const blend = 1 - Math.exp(-5 * dt), desiredZoom = player.car ? 1.32 - Math.min(.22, Math.abs(player.car.speed) / 1400) : 1.5;
  camera.zoom += (desiredZoom - camera.zoom) * blend;
  const marginX = game.width / (2 * camera.zoom), marginY = game.height / (2 * camera.zoom);
  camera.x += (clamp(targetX, marginX - 30, city.width - marginX + 30) - camera.x) * blend;
  camera.y += (clamp(targetY, marginY - 30, city.height - marginY + 30) - camera.y) * blend;
}
function updateGame(dt) {
  game.time += dt; game.worldMinutes += dt * .6; game.stats.playTime += dt;
  updatePlayer(dt); if (game.mode !== 'playing') return;
  updateTraffic(dt); updateVehicles(dt); if (game.mode !== 'playing') return;
  updatePolice(dt); if (game.mode !== 'playing') return;
  updatePedestrians(dt); if (game.mode !== 'playing') return;
  updateMissions(dt); updateEffects(dt); followPlayerCamera(dt);
  game.saveTimer += dt; if (game.saveTimer >= 10) { saveGame(); game.saveTimer = 0; }
}
function sceneDarkness() {
  const hour = (clockMinutes() / 60) % 24;
  if (game.shot || (hour >= 7 && hour <= 18)) return 0;
  return hour > 18 && hour < 21 ? (hour - 18) / 3 * .56 : hour >= 5 && hour < 7 ? (7 - hour) / 2 * .56 : .56;
}
function drawWorld() {
  const time = game.renderTime, darkness = sceneDarkness();
  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  ctx.fillStyle = '#e5bf83'; ctx.fillRect(0, 0, game.width, game.height);
  ctx.save(); ctx.translate(game.width / 2, game.height / 2); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x, -camera.y);
  ctx.drawImage(city.surface, 0, 0);
  for (const mark of skidMarks) drawLine(ctx, mark.x1, mark.y1, mark.x2, mark.y2, '#302e285e', 3);
  drawSupplies(ctx, time);
  for (const car of cars) drawCar(ctx, car, time, darkness);
  for (const ped of pedestrians) drawPedestrian(ctx, ped, time);
  if (game.mode !== 'title') drawPlayer(ctx, time);
  for (const bullet of bullets) drawLine(ctx, bullet.x, bullet.y, bullet.x - bullet.vx * .015, bullet.y - bullet.vy * .015, '#fff3bf', 2);
  for (const tree of city.trees) drawTree(ctx, tree, time);
  for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1); drawCircle(ctx, p.x, p.y, p.size, p.color); } ctx.globalAlpha = 1;
  if (darkness > .08) for (const lamp of city.lamps) {
    const g = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 65); g.addColorStop(0, '#ffe5a653'); g.addColorStop(1, '#ffe5a600'); drawCircle(ctx, lamp.x, lamp.y, 65, g);
  }
  drawMissionMarker(ctx, time);
  for (const text of floatingTexts) { ctx.globalAlpha = Math.min(1, text.life); drawText(ctx, text.text, text.x, text.y, 15, text.color, 'center'); } ctx.globalAlpha = 1;
  ctx.restore();
  if (darkness) { ctx.fillStyle = `rgba(13, 27, 47, ${darkness})`; ctx.fillRect(0, 0, game.width, game.height); }
  else { ctx.fillStyle = '#ffbf4c0a'; ctx.fillRect(0, 0, game.width, game.height); }
}
function runGameFrame(now) {
  const dt = game.lastFrame ? Math.min(.05, (now - game.lastFrame) / 1000) : 1 / 60;
  game.lastFrame = now;
  handleMenuInput();
  if (!game.shot) {
    game.renderTime += dt;
    if (game.mode === 'playing') updateGame(dt);
  }
  justPressed.clear();
  drawWorld(); updateHUD();
  game.renderedFrames++;
  if (game.renderedFrames >= 3) { window.__gameReady = true; if (game.shot) window.__shotReady = true; }
  requestAnimationFrame(runGameFrame);
}
function stageScreenshot(mode) {
  // Freeze simulation and sun, so every screenshot is a reproducible render of real game objects.
  document.body.classList.add('shot-mode');
  minimapCanvas.width = 300; minimapCanvas.height = 225;
  game.time = 42; game.renderTime = 23.4; game.mode = 'playing'; game.cash = 12450;
  game.stats.missions = 3; game.stats.topWanted = 4; game.stats.carsStolen = 6; game.stats.shotsFired = 28; game.stats.playTime = 746;
  mission.index = 3; mission.stage = 4; mission.active = true;
  const hero = spawnCar('Manta', 1000, 1424, -.18, 'player');
  hero.body = '#ec9054'; hero.stolen = true; hero.health = 78; hero.speed = 238; hero.vx = 234; hero.vy = -43;
  player.car = hero; player.x = hero.x; player.y = hero.y; player.angle = hero.angle; player.health = 86; player.weapon = 'pistol'; player.ammo = 31;
  camera.x = 1080; camera.y = 1405; camera.zoom = 1.35;
  wanted.level = 3; wanted.seen = true; wanted.lastCrime = game.time; wanted.top = 4;
  const pursuitA = spawnCar('Patrol', 820, 1424, -.08, 'police'); pursuitA.speed = 220;
  const pursuitB = spawnCar('Patrol', 1000, 1260, Math.PI / 2 + .13, 'police'); pursuitB.speed = 190;
  if (mode === 'hero') {
    // Approach the Shine Shop past a busy crossing, with both patrols following east.
    Object.assign(hero, { x: 2190, y: 1824, angle: 0, body: '#8fdbc2', vx: 238, vy: 0 });
    player.x = hero.x; player.y = hero.y; player.angle = hero.angle;
    camera.x = 2160; camera.y = 1750; camera.zoom = 1.56; // 1.3x the previous cover zoom.
    for (const [car, gap] of [[pursuitA, 130], [pursuitB, 260]]) {
      Object.assign(car, { x: hero.x - gap, y: hero.y, angle: hero.angle, vx: car.speed, vy: 0 });
    }
    const pursuit = [hero, pursuitA, pursuitB];
    cars = cars.filter(car => pursuit.includes(car) || pursuit.every(staged => distance(car, staged) >= 80));
    for (let i = 0; i < 5; i++) pedestrians.push({ x: 2259, y: 1764 + i * 16, angle: Math.PI / 2, health: 60, flee: 0, hitFlash: 0, color: ['#f5dfb1', '#55b5aa', '#ec7958', '#a79cd1'][i % 4], pace: 25, phase: i });
  }
  spawnCar('Vulture', 1190, 1376, Math.PI, 'traffic'); spawnCar('Brine', 980, 1540, -Math.PI / 2, 'traffic');
  for (let i = 0; i < 18; i++) pedestrians.push({ x: 650 + (i % 9) * 74, y: i < 9 ? 1337 : 1462, angle: i % 2 ? 0 : Math.PI, health: 60, flee: i % 4 === 0 ? 4 : 0, hitFlash: 0, color: ['#f5dfb1', '#55b5aa', '#ec7958', '#a79cd1'][i % 4], pace: 25, phase: i });
  const skidX = mode === 'hero' ? hero.x - 225 : 775, skidY = mode === 'hero' ? hero.y + 7 : 1431;
  for (let i = 0; i < 45; i++) skidMarks.push({ x1: skidX + i * 5, y1: skidY + Math.sin(i * .09) * 12, x2: skidX + 5 + i * 5, y2: skidY + Math.sin((i + 1) * .09) * 12, life: 18 });
  if (mode === 'foot') {
    cars = cars.filter(c => c.ai !== 'police' && c !== hero); clearWanted();
    player.car = null; player.x = 659; player.y = 1776; player.angle = -.08; player.health = 100; player.weapon = 'fists';
    camera.x = 830; camera.y = 1748; camera.zoom = 1.55;
    const target = cars.find(c => c.missionCar);
    Object.assign(target, { x: 704, y: 1776, angle: 0, body: carDefinitions.Vulture.body, stolen: false });
    mission.index = 1; mission.stage = 0; mission.targetCarId = target.id;
    game.stats.missions = 1; game.cash = 2750;
    for (let i = 0; i < 12; i++) pedestrians.push({ x: 570 + i * 57, y: i % 2 ? 1758 : 1860, angle: i % 2 ? 0 : Math.PI, health: 60, flee: 0, hitFlash: 0, color: ['#e87959', '#f3dd8c', '#559b96'][i % 3], pace: 25, phase: i });
  } else if (mode === 'complete') {
    clearWanted(); game.cash = 8300; mission.index = 3; mission.active = false; player.health = 100;
    showCompletionCard(2);
  } else if (mode === 'map') showWorldMap();
}
function unlockAudio() {
  if (game.shot) return;
  try {
    if (!audioContext) {
      const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return;
      audioContext = new Audio(); masterGain = audioContext.createGain(); masterGain.gain.value = game.audioMuted ? 0 : .35; masterGain.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch { /* Sound is optional on browsers without WebAudio. */ }
}
function synthTone(frequency, duration, volume, type = 'sine', delay = 0, endFrequency = frequency) {
  const at = audioContext.currentTime + delay, oscillator = audioContext.createOscillator(), envelope = audioContext.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
  envelope.gain.setValueAtTime(.0001, at); envelope.gain.exponentialRampToValueAtTime(volume, at + .008); envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
  oscillator.connect(envelope); envelope.connect(masterGain); oscillator.start(at); oscillator.stop(at + duration + .02);
  oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
}
function synthNoise(duration, volume, cutoff) {
  const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * duration), audioContext.sampleRate), samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
  const source = audioContext.createBufferSource(), filter = audioContext.createBiquadFilter(), envelope = audioContext.createGain();
  source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff; envelope.gain.value = volume;
  source.connect(filter); filter.connect(envelope); envelope.connect(masterGain); source.start();
  source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
}
function playSound(name, speed = 0) {
  if (!audioContext || audioContext.state !== 'running' || game.audioMuted || game.shot) return;
  if (name === 'engine') synthTone(45 + speed * .18, .13, .09, 'triangle', 0, 40 + speed * .16);
  else if (name === 'siren') { synthTone(680, .16, .12, 'sine', 0, 980); synthTone(980, .16, .1, 'sine', .18, 680); }
  else if (name === 'pickup') { synthTone(660, .1, .2); synthTone(880, .1, .18, 'sine', .1); synthTone(1320, .17, .16, 'sine', .2); }
  else if (name === 'gun') { synthNoise(.11, .4, 4000); synthTone(150, .09, .18, 'triangle', 0, 35); }
  else if (name === 'crash') synthNoise(.19, .24, 1100);
  else if (name === 'punch') { synthNoise(.08, .12, 600); synthTone(90, .08, .1, 'sine', 0, 45); }
  else synthTone(440, .07, .12, 'sine', 0, 600);
}

startPalmshadeGame();
