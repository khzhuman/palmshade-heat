'use strict';
// Move and aim the player, steal vehicles, fight on foot and trace pistol shots.
const player = { x: 600, y: 1020, angle: 0, health: 100, ammo: 48, weapon: 'fists', car: null, cooldown: 0, flash: 0, punch: 0, hitTimer: 0 };
let bullets = [], nearestCar = null;
function resetPlayer() {
  Object.assign(player, { x: 600, y: 1020, angle: 0, health: 100, ammo: 48, weapon: 'fists', car: null, cooldown: 0, flash: 0, punch: 0, hitTimer: 0 }); bullets = []; nearestCar = null;
}
function findNearestCar() {
  let best = null, d = 72;
  for (const car of cars) if (car.health > 0) { const cd = distance(player, car); if (cd < d) { d = cd; best = car; } }
  return best;
}
function enterOrExitCar() {
  if (player.car) {
    const car = player.car;
    if (Math.abs(car.speed) > 110) { showToast('SLOW DOWN TO EXIT'); return; }
    for (const angle of [car.angle + Math.PI / 2, car.angle - Math.PI / 2, car.angle + Math.PI, car.angle]) {
      const p = { x: car.x + Math.cos(angle) * 44, y: car.y + Math.sin(angle) * 44 };
      if (!isBlocked(p.x, p.y, 10) && !cars.some(c => c !== car && distance(p, c) < 35)) {
        player.x = p.x; player.y = p.y; player.car = null; car.ai = 'parked'; car.vx = car.vy = car.speed = 0; playSound('blip'); return;
      }
    }
    showToast('EXIT BLOCKED · MOVE TO OPEN SPACE'); return;
  }
  const car = findNearestCar();
  if (!car) return;
  if (!car.stolen) {
    addWanted(car.type === 'Patrol' ? 3 : 1, 'VEHICLE STOLEN'); car.stolen = true; game.stats.carsStolen++;
    if (car.ai === 'traffic') pedestrians.push({ x: car.x + 32, y: car.y + 35, angle: 1.2, health: 60, flee: 9, color: '#f0d09a', pace: 30, phase: 0, hitFlash: 0 });
  }
  car.ai = 'player'; car.siren = false; player.car = car; player.x = car.x; player.y = car.y; player.angle = car.angle; playSound('blip');
}
function punch() {
  if (player.car || player.cooldown > 0) return;
  player.weapon = 'fists'; player.cooldown = .4; player.punch = .2; playSound('punch');
  let hit = false;
  for (const ped of pedestrians) if (ped.health > 0 && distance(ped, player) < 50 && Math.abs(angleDifference(Math.atan2(ped.y - player.y, ped.x - player.x), player.angle)) < 1.3) { hurtPedestrian(ped, 35, player.angle); hit = true; break; }
  if (!hit) for (const car of cars) if (distance(car, player) < 54) { damageCar(car, 3, 'player'); addParticles(car.x, car.y, '#f5d7a2', 6); addWanted(car.type === 'Patrol' ? 3 : 1, 'PROPERTY DAMAGE'); break; }
}
function shootPistol() {
  if (player.car || player.cooldown > 0) return;
  player.weapon = 'pistol';
  if (player.ammo <= 0) { player.cooldown = .4; showToast('OUT OF AMMO · LOOK FOR GOLD AMMO CRATES'); playSound('blip'); return; }
  player.ammo--; player.cooldown = .23; player.flash = .075; game.stats.shotsFired++;
  const a = player.angle;
  bullets.push({ x: player.x + Math.cos(a) * 17, y: player.y + Math.sin(a) * 17, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: .9 });
  addWanted(2, 'SHOTS FIRED'); playSound('gun');
}
function updatePlayer(dt) {
  player.cooldown = Math.max(0, player.cooldown - dt); player.flash = Math.max(0, player.flash - dt); player.punch = Math.max(0, player.punch - dt); player.hitTimer = Math.max(0, player.hitTimer - dt);
  if (justPressed.has('e')) enterOrExitCar();
  if (!player.car) {
    let dx = (keyDown('d', 'arrowright') ? 1 : 0) - (keyDown('a', 'arrowleft') ? 1 : 0), dy = (keyDown('s', 'arrowdown') ? 1 : 0) - (keyDown('w', 'arrowup') ? 1 : 0);
    const speed = keyDown('shift') ? 212 : 132, n = Math.hypot(dx, dy);
    if (n) { dx /= n; dy /= n; if (!mouse.active) player.angle = Math.atan2(dy, dx); }
    if (mouse.active) player.angle = Math.atan2((mouse.y - canvas.height / (2 * game.dpr)) / camera.zoom + camera.y - player.y, (mouse.x - canvas.width / (2 * game.dpr)) / camera.zoom + camera.x - player.x);
    const before = { x: player.x, y: player.y };
    moveWithCollision(player, dx * speed * dt, dy * speed * dt, 9);
    for (const car of cars) {
      if (distance(player, car) < 30) {
        const a = Math.atan2(player.y - car.y, player.x - car.x);
        if (Math.abs(car.speed) > 80 && player.hitTimer <= 0) { player.health -= Math.min(22, Math.abs(car.speed) * .06); player.hitTimer = .8; addParticles(player.x, player.y, '#ffd8ad'); }
        if (!isBlocked(car.x + Math.cos(a) * 31, car.y + Math.sin(a) * 31, 9)) { player.x = car.x + Math.cos(a) * 31; player.y = car.y + Math.sin(a) * 31; } else { player.x = before.x; player.y = before.y; }
      }
    }
    if (keyDown('j')) punch();
    if (keyDown('k')) shootPistol();
    if (justPressed.has('1')) player.weapon = 'fists';
    if (justPressed.has('2')) player.weapon = 'pistol';
    if (mouse.down) player.weapon === 'pistol' ? shootPistol() : punch();
    nearestCar = findNearestCar();
  } else nearestCar = null;
  if (!wanted.level && player.health > 0) player.health = Math.min(100, player.health + dt * .7);
  if (player.health <= 0) endGame('wasted');
  updateBullets(dt);
}
function updateBullets(dt) {
  for (const bullet of bullets) {
    const steps = Math.ceil(900 * dt / 10);
    for (let s = 0; s < steps && bullet.life > 0; s++) {
      bullet.x += bullet.vx * dt / steps; bullet.y += bullet.vy * dt / steps;
      if (isBlocked(bullet.x, bullet.y, 2)) { bullet.life = 0; addParticles(bullet.x, bullet.y, '#ffdc98', 7); break; }
      const ped = pedestrians.find(p => p.health > 0 && distance(p, bullet) < 10);
      if (ped) { hurtPedestrian(ped, 65, Math.atan2(bullet.vy, bullet.vx)); bullet.life = 0; break; }
      const car = cars.find(c => c.health > 0 && distance(c, bullet) < 22);
      if (car) { damageCar(car, 11, 'player'); addParticles(bullet.x, bullet.y, '#ffe0a1', 8); bullet.life = 0; break; }
    }
    bullet.life -= dt;
  }
  bullets = bullets.filter(b => b.life > 0);
}
function drawPlayer(ctx, time) {
  if (player.car) return;
  ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle);
  drawCircle(ctx, 4, 5, 9, '#745d3d77');
  const moving = keyDown('w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'), stride = moving ? Math.sin(time * 13) * 4 : 0;
  drawRect(ctx, -8, -7 + stride, 8, 5, '#365e63'); drawRect(ctx, -8, 3 - stride, 8, 5, '#365e63');
  ctx.fillStyle = player.hitTimer > 0 ? '#ffe0a2' : '#f5c86d'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
  drawLine(ctx, -3, -6, -3, 6, '#ba7552', 3); drawCircle(ctx, 2, 0, 5, '#dba275'); drawCircle(ctx, 0, -1, 4, '#624b32');
  if (player.weapon === 'pistol') { drawRect(ctx, 7, 4, 10, 3, '#f7e6c6'); drawRect(ctx, 8, 4, 3, 6, '#486364'); }
  if (player.punch > 0) { drawCircle(ctx, 18, -4, 4, '#e3b27e'); drawLine(ctx, 5, -6, 16, -4, '#f5c86d', 5); }
  if (player.flash > 0) { ctx.save(); ctx.shadowColor = '#ffd679'; ctx.shadowBlur = 25; drawCircle(ctx, 21, 5, 8, '#ffce79'); drawCircle(ctx, 21, 5, 4, '#fff2bb'); ctx.restore(); }
  ctx.restore();
  ctx.strokeStyle = '#165f5b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(player.x, player.y, 17, 0, Math.PI * 2); ctx.stroke();
  drawText(ctx, 'YOU', player.x, player.y - 26, 8, '#f1fff3', 'center');
}
