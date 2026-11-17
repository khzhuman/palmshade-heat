'use strict';
// Live health, heat, objectives and two maps keep the city readable while you play.
function updateHUD() {
  hud.hidden = game.mode === 'title';
  setHUDText('cash', formatCash(game.cash));
  const health = Math.ceil(clamp(player.health, 0, 100));
  setHUDText('health-value', health);
  hudNodes['health-bar'].style.width = health + '%';
  hudNodes['health-bar'].style.background = health < 30 ? '#ff745e' : '#8fdbc2';
  hudNodes['health-bar'].parentElement.setAttribute('aria-valuenow', health);
  if (hudNodes.wanted.dataset.level !== String(wanted.level)) {
    hudNodes.wanted.innerHTML = '<span>' + '★'.repeat(wanted.level) + '</span><span class="empty-stars">' + '☆'.repeat(5 - wanted.level) + '</span>';
    hudNodes.wanted.dataset.level = wanted.level;
    hudNodes.wanted.setAttribute('aria-label', wanted.level + ' of 5 wanted stars');
  }
  setHUDText('heat-status', !wanted.level ? 'OFF THE RADAR' : wanted.seen ? 'POLICE IN PURSUIT' : 'SEARCHING · STAY HIDDEN');
  const minutes = Math.floor(clockMinutes() % 1440), hour = Math.floor(minutes / 60);
  setHUDText('clock', String(hour).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0'));
  setHUDText('clock-label', (hour >= 16 && hour < 19 ? 'GOLDEN HOUR' : hour >= 7 && hour < 19 ? 'SUNLIGHT' : 'AFTER DARK') + ' / DAY ' + String(1 + Math.floor(clockMinutes() / 1440)).padStart(2, '0'));
  setHUDText('district', districtAt(player.x, player.y).name.toUpperCase());
  setHUDText('street', streetAt(player.x, player.y));
  setHUDText('weapon', player.weapon === 'pistol' ? 'PISTOL · ' + player.ammo + ' ROUNDS [K]' : 'FISTS · J / CLICK');
  const car = player.car;
  setHUDText('car-status', car ? car.name.toUpperCase() + ' · ' + Math.round(Math.abs(car.speed) * .24) + ' MPH · BODY ' + Math.ceil(car.health) + '%' : 'ON FOOT · SHIFT TO SPRINT');
  hudNodes.bust.hidden = wanted.bust <= .01;
  hudNodes['bust-bar'].style.width = wanted.bust * 100 + '%';
  const nearby = !car ? findNearestCar() : null;
  let prompt = '';
  if (car && distance(player, shineShop) < shineShop.radius + 50) prompt = 'SHINE SHOP — SLOW DOWN · REPAIR + RESPRAY $500';
  else if (nearby) prompt = nearby.stolen ? 'E — ENTER ' + nearby.name.toUpperCase() : "E — STEAL '" + nearby.name.toUpperCase() + "' " + nearby.category;
  else if (car && Math.abs(car.speed) < 30) prompt = 'E — EXIT VEHICLE';
  hudNodes.prompt.hidden = !prompt;
  setHUDText('prompt', prompt);
  hudNodes.toast.hidden = !game.toast || game.time >= game.toastUntil;
  setHUDText('toast', game.toast);
  setHUDText('objective', missionObjective());
  setHUDText('mission-label', mission.active ? 'MARA VOSS / STORY JOB 0' + (mission.index + 1) + ' / ' + missionDefinitions[mission.index].name.toUpperCase() : 'MARA VOSS / ' + game.stats.missions + ' OF 5 JOBS COMPLETE');
  const marker = currentMissionMarker();
  setHUDText('mission-detail', marker ? marker.label + ' · ' + Math.round(distance(player, marker)) + ' m · Follow the gold diamond' : mission.active ? 'Police respond to crimes. Break their line of sight; the Shine Shop clears heat for $500.' : mission.index < 5 ? 'ENTER — Answer Mara’s next call · M — Full city map' : 'Steal a car, explore four districts, make your own trouble.');
  setHUDText('mission-timer', mission.active && (mission.index === 0 || (mission.index === 2 && mission.stage === 0)) ? formatTime(mission.timer) : '');
  drawMinimap();
  if (game.mode === 'map') drawWorldMap();
}

const hudNodes = Object.fromEntries(['cash', 'health-bar', 'health-value', 'wanted', 'heat-status', 'clock', 'clock-label', 'district', 'street', 'weapon', 'car-status', 'bust', 'bust-bar', 'prompt', 'toast', 'objective', 'mission-label', 'mission-detail', 'mission-timer'].map(id => [id, document.getElementById(id)]));
const minimapCanvas = document.getElementById('minimap');
const minimapContext = minimapCanvas.getContext('2d');

function setHUDText(id, value) {
  const text = String(value);
  if (hudNodes[id].textContent !== text) hudNodes[id].textContent = text;
}
function formatCash(amount) { return '$' + Math.round(amount).toLocaleString('en-US'); }
function formatTime(seconds) {
  seconds = Math.max(0, Math.ceil(seconds));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
function showToast(message, duration = 3.5) {
  game.toast = message; game.toastUntil = game.time + duration;
  document.getElementById('status').textContent = message;
}
function drawMapTerrain(ctx, view) {
  const { x, y, scale, width, height } = view;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
  ctx.fillStyle = '#132e38'; ctx.fillRect(0, 0, width, height);
  ctx.translate(-x * scale, -y * scale); ctx.scale(scale, scale);
  for (const d of districts) drawRect(ctx, d.x, d.y, d.w, d.h, d.mapTint);
  drawRect(ctx, 2840, 0, 360, 2800, '#316878');
  drawRect(ctx, park.x, park.y, park.w, park.h, '#627e5d');
  for (const road of city.roadsX) drawRect(ctx, road - 52, 0, 104, 2800, '#c0bda455');
  for (const road of city.roadsY) drawRect(ctx, 0, road - 52, 2839, 104, '#c0bda455');
  for (const b of city.buildings) drawRect(ctx, b.x, b.y, b.w, b.h, '#071c286e');
  ctx.restore();
}
function mapPosition(point, view, inset = 9) {
  return { x: clamp((point.x - view.x) * view.scale, inset, view.width - inset), y: clamp((point.y - view.y) * view.scale, inset, view.height - inset) };
}
function drawMapDiamond(ctx, p, size, color) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color; ctx.strokeStyle = '#10212a'; ctx.lineWidth = 2;
  ctx.fillRect(-size, -size, size * 2, size * 2); ctx.strokeRect(-size, -size, size * 2, size * 2); ctx.restore();
}
function drawMapPlayer(ctx, p, size = 9) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(player.angle);
  ctx.strokeStyle = '#09212a'; ctx.lineWidth = 3; ctx.fillStyle = '#b8ffe4';
  ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * .7, -size * .65); ctx.lineTo(-size * .3, 0); ctx.lineTo(-size * .7, size * .65); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
function drawPoliceBlip(ctx, p, index, large = false) {
  const flash = Math.sin(game.renderTime * 9 + index) > 0, r = large ? 6 : 5;
  ctx.save(); ctx.shadowBlur = 9; ctx.shadowColor = flash ? '#ff233c' : '#418dff';
  drawCircle(ctx, p.x, p.y, r + 2, '#071c28');
  drawRect(ctx, p.x - r, p.y - r, r, r * 2, flash ? '#ff3b51' : '#ff8190');
  drawRect(ctx, p.x, p.y - r, r, r * 2, flash ? '#91c1ff' : '#2b7bff'); ctx.restore();
}
function drawShineShopIcon(ctx, p, size = 7) {
  drawCircle(ctx, p.x, p.y, size + 3, '#11212e');
  drawMapDiamond(ctx, p, size, '#d9acff');
  drawText(ctx, 'S', p.x, p.y + 4, 11, '#2c233a', 'center');
}
function drawMinimap() {
  const ctx = minimapContext, width = 240, height = 180, scale = .205;
  ctx.save(); ctx.scale(minimapCanvas.width / width, minimapCanvas.height / height);
  const view = { x: player.x - width / (2 * scale), y: player.y - height / (2 * scale), scale, width, height };
  drawMapTerrain(ctx, view);
  for (const car of cars) {
    if (car === player.car || car.health <= 0 || car.ai === 'police') continue;
    const x = (car.x - view.x) * scale, y = (car.y - view.y) * scale;
    if (x > 3 && y > 3 && x < width - 3 && y < height - 3) drawCircle(ctx, x, y, 2.4, '#f9f9ef');
  }
  drawShineShopIcon(ctx, mapPosition(shineShop, view));
  const marker = currentMissionMarker();
  if (marker) {
    const p = mapPosition(marker, view, 13);
    if (distance(marker, shineShop) < 20) p.x = clamp(p.x - 18, 12, width - 12);
    drawMapDiamond(ctx, p, 5, '#ffd15f');
  }
  cars.filter(c => c.ai === 'police' && c.health > 0).forEach((car, i) => drawPoliceBlip(ctx, mapPosition(car, view), i));
  drawMapPlayer(ctx, { x: width / 2, y: height / 2 });
  ctx.strokeStyle = '#d5d2b755'; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, width - 1, height - 1);
  ctx.restore();
}
function showWorldMap() {
  game.mode = 'map'; resetInput();
  overlay.innerHTML = `<div class="map-shell"><div class="map-top"><div><small>FOUR DISTRICTS / ONE LIVING CITY</small><h1>PALMSHADE CITY MAP</h1></div><button class="btn" id="map-resume">RESUME / M</button></div><div class="map-layout"><canvas id="city-map" aria-label="Full city map with districts, police and objectives"></canvas><aside class="map-aside"><h3>LIVE MAP LEGEND</h3><div class="legend-item"><b>➤</b> You / your vehicle</div><div class="legend-item"><b>▣</b> Police / red + blue</div><div class="legend-item"><b>◆</b> Mission / gold</div><div class="legend-item"><b>◇</b> Shine Shop / $500</div><div class="map-job"><strong>${game.stats.missions}/5 STORY JOBS</strong>Five jobs from Mara Voss.<br>Steal and drive any car.<br>Police respond to your heat.<br><br>${missionObjective()}</div></aside></div><div class="map-footer"><span>WANTED ${'★'.repeat(wanted.level) || 'NONE'} · ${formatCash(game.cash)} · ${districtAt(player.x, player.y).name.toUpperCase()}</span><span>M / ESC / P — RETURN TO THE STREETS</span></div></div>`;
  document.getElementById('map-resume').onclick = resumeGame;
  drawWorldMap();
}
function drawWorldMap() {
  const map = document.getElementById('city-map'); if (!map) return;
  const rect = map.getBoundingClientRect(), width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
  if (map.width !== width * game.dpr || map.height !== height * game.dpr) { map.width = width * game.dpr; map.height = height * game.dpr; }
  const ctx = map.getContext('2d'); ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const scale = Math.min((width - 34) / city.width, (height - 24) / city.height), mapWidth = city.width * scale, mapHeight = city.height * scale;
  const offsetX = (width - mapWidth) / 2, offsetY = (height - mapHeight) / 2;
  ctx.save(); ctx.translate(offsetX, offsetY);
  const view = { x: 0, y: 0, scale, width: mapWidth, height: mapHeight };
  drawMapTerrain(ctx, view);
  ctx.strokeStyle = '#eddbaf55'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(1600 * scale, 0); ctx.lineTo(1600 * scale, mapHeight); ctx.moveTo(0, 1400 * scale); ctx.lineTo(mapWidth, 1400 * scale); ctx.stroke(); ctx.setLineDash([]);
  for (const d of districts) {
    const x = (d.x + d.w * .42) * scale, y = (d.y + d.h * .37) * scale;
    ctx.fillStyle = '#10202adc'; ctx.fillRect(x - 76, y - 18, 152, 30);
    drawText(ctx, d.name.toUpperCase(), x, y + 2, 14, '#ffe4b7', 'center');
  }
  cars.filter(c => c.ai === 'police' && c.health > 0).forEach((c, i) => drawPoliceBlip(ctx, mapPosition(c, view), i, true));
  const shop = mapPosition(shineShop, view); drawShineShopIcon(ctx, shop, 7);
  drawText(ctx, 'SHINE SHOP', shop.x + 16, shop.y + 4, 9, '#e8c4ff');
  const marker = currentMissionMarker(); if (marker) {
    const p = mapPosition(marker, view); if (distance(marker, shineShop) < 20) p.x -= 20;
    drawMapDiamond(ctx, p, 6, '#ffd15f');
  }
  drawMapPlayer(ctx, mapPosition(player, view), 10);
  drawText(ctx, 'YOU', player.x * scale, player.y * scale - 17, 10, '#b8ffe4', 'center');
  drawText(ctx, 'N ↑', mapWidth - 20, 22, 13, '#faf1d9', 'right');
  drawText(ctx, 'PALMSHADE BAY', mapWidth - 15, mapHeight - 18, 10, '#b1d8da', 'right');
  ctx.restore();
}
