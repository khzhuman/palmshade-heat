'use strict';
// Spawn original vehicles and simulate steering, skids, crashes and visible damage.
const carDefinitions = {
  Vulture: { name: 'Vulture', category: 'SEDAN', body: '#e59a56', maxSpeed: 320, acceleration: 230, length: 49, width: 26 },
  Manta: { name: 'Manta', category: 'COUPE', body: '#49aaa2', maxSpeed: 365, acceleration: 260, length: 47, width: 25 },
  Brine: { name: 'Brine', category: 'VAN', body: '#aab577', maxSpeed: 245, acceleration: 170, length: 57, width: 29 },
  Sundrift: { name: 'Sundrift', category: 'COUPE', body: '#e2a58e', maxSpeed: 340, acceleration: 245, length: 45, width: 25 },
  Patrol: { name: 'PSPD Interceptor', category: 'PATROL CAR', body: '#fff0d2', maxSpeed: 335, acceleration: 230, length: 53, width: 27 }
};
let cars = [], skidMarks = [], particles = [], floatingTexts = [], carSerial = 0;
function spawnCar(type, x, y, angle = 0, ai = 'parked') {
  const def = carDefinitions[type];
  const car = { id: ++carSerial, type, ...def, x, y, angle, vx: 0, vy: 0, speed: 0, health: 100, ai, crashCooldown: 0, turnCooldown: 0, smokeTimer: 0, route: [], routeTimer: 0, siren: type === 'Patrol', stolen: false };
  cars.push(car); return car;
}
function spawnVehicles() {
  cars = []; carSerial = 0; skidMarks = []; particles = []; floatingTexts = [];
  const types = ['Vulture', 'Manta', 'Brine', 'Sundrift'];
  for (let i = 0; i < 38; i++) {
    const ix = i % 7, iy = Math.floor(i / 7) % 6;
    spawnCar(types[i % 4], 318 + ix * 400, 247 + iy * 400, i % 2 ? 0 : Math.PI, 'parked');
  }
  for (let i = 0; i < 23; i++) {
    if (i % 2) spawnCar(types[i % 4], 200 + (i % 7) * 400 - 24, 350 + (i % 6) * 400, Math.PI / 2, 'traffic');
    else spawnCar(types[i % 4], 350 + (i % 6) * 400, 200 + (i % 7) * 400 + 24, 0, 'traffic');
  }
  spawnCar('Vulture', 704, 1776, 0, 'parked').missionCar = true;
  spawnCar('Manta', 637, 1018, 0, 'parked');
}
function addParticles(x, y, color, count = 10, force = 110) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), v = rand(force * .25, force);
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(.25, .7), maxLife: .7, color, size: rand(1, 3) });
  }
}
function addFloatingText(x, y, text, color = '#f9ca74') { floatingTexts.push({ x, y, text, color, life: 2.8 }); }
function damageCar(car, amount, source) {
  if (car.health <= 0) return;
  car.health = Math.max(0, car.health - amount);
  if (source === 'player' && car.type === 'Patrol') addWanted(3, 'ASSAULT ON POLICE');
  if (car.health === 0) {
    addParticles(car.x, car.y, '#ffb56b', 40, 180); playSound('crash');
    car.ai = 'wreck';
    if (player.car === car) { player.health = 0; endGame('wasted'); }
  }
}
function applyCarPhysics(car, throttle, steer, brake, dt) {
  const forwardSpeed = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
  const speedFraction = Math.min(1, Math.abs(forwardSpeed) / 140);
  car.angle += steer * (1.9 * speedFraction) * (forwardSpeed < -8 ? -1 : 1) * dt;
  let accel = throttle * car.acceleration;
  if (throttle < 0 && forwardSpeed > 12) accel *= 2.25;
  if (brake) { car.vx *= Math.exp(-3.5 * dt); car.vy *= Math.exp(-3.5 * dt); }
  car.vx += Math.cos(car.angle) * accel * dt; car.vy += Math.sin(car.angle) * accel * dt;
  // Lateral inertia allows a visible slide. Space holds the handbrake.
  const grip = brake ? 1.6 : 7;
  const lateral = -car.vx * Math.sin(car.angle) + car.vy * Math.cos(car.angle);
  const correction = lateral * (1 - Math.exp(-grip * dt));
  car.vx += Math.sin(car.angle) * correction; car.vy -= Math.cos(car.angle) * correction;
  const drag = Math.exp(-(throttle ? .42 : 1.15) * dt); car.vx *= drag; car.vy *= drag;
  let speed = Math.hypot(car.vx, car.vy), limit = car.health < 25 ? car.maxSpeed * .65 : car.maxSpeed;
  if (forwardSpeed < -5) limit *= .36;
  if (speed > limit) { car.vx *= limit / speed; car.vy *= limit / speed; }
  speed = Math.hypot(car.vx, car.vy);
  const oldX = car.x, oldY = car.y;
  if (moveWithCollision(car, car.vx * dt, car.vy * dt, 21)) {
    if (speed > 75 && car.crashCooldown <= 0) {
      damageCar(car, Math.max(3, (speed - 40) * .075), car === player.car ? 'player' : 'world');
      addParticles(car.x, car.y, '#ffd396', 13); playSound('crash'); car.crashCooldown = .5;
      if (car === player.car) player.health -= speed > 200 ? 3 : 1;
    }
    car.vx *= -.2; car.vy *= -.2; car.routeTimer = 0;
  }
  car.speed = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
  if (speed > 145 && (Math.abs(lateral) > 19 || brake || Math.abs(steer) > .6)) {
    for (const side of [-9, 9]) {
      const sx = -Math.sin(car.angle) * side, sy = Math.cos(car.angle) * side;
      skidMarks.push({ x1: oldX + sx, y1: oldY + sy, x2: car.x + sx, y2: car.y + sy, life: 24 });
    }
  }
}
function updateVehicles(dt) {
  for (const car of cars) {
    car.crashCooldown = Math.max(0, car.crashCooldown - dt);
    car.turnCooldown = Math.max(0, car.turnCooldown - dt);
    if (car === player.car && car.health > 0) {
      applyCarPhysics(car, (keyDown('w', 'arrowup') ? 1 : 0) - (keyDown('s', 'arrowdown') ? 1 : 0), (keyDown('d', 'arrowright') ? 1 : 0) - (keyDown('a', 'arrowleft') ? 1 : 0), keyDown(' '), dt);
      player.x = car.x; player.y = car.y; player.angle = car.angle;
      if (Math.abs(car.speed) > 15 && game.time - game.lastEngine > .14) { playSound('engine', Math.abs(car.speed)); game.lastEngine = game.time; }
    }
    if (car.health < 32) {
      car.smokeTimer -= dt;
      if (car.smokeTimer < 0) { car.smokeTimer = .12; particles.push({ x: car.x + Math.cos(car.angle) * 17, y: car.y + Math.sin(car.angle) * 17, vx: rand(-6, 6), vy: -18, life: 1.7, maxLife: 1.7, color: '#bcb3a1', size: 7, smoke: true }); }
    }
  }
  // Car contacts separate both bodies, transfer momentum and damage the striking car.
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j], d = distance(a, b);
    if (d > 39 || (!a.speed && !b.speed)) continue;
    const nx = d > .01 ? (a.x - b.x) / d : Math.cos(a.angle), ny = d > .01 ? (a.y - b.y) / d : Math.sin(a.angle), impact = Math.hypot(a.vx - b.vx, a.vy - b.vy);
    moveWithCollision(a, nx * (39 - d) * .5, ny * (39 - d) * .5, 21);
    moveWithCollision(b, -nx * (39 - d) * .5, -ny * (39 - d) * .5, 21);
    a.vx *= .5; a.vy *= .5; b.vx *= .55; b.vy *= .55;
    if (impact > 50 && a.crashCooldown <= 0 && b.crashCooldown <= 0) {
      const hitPolice = (a === player.car && b.type === 'Patrol') || (b === player.car && a.type === 'Patrol');
      if (hitPolice) addWanted(3, 'POLICE VEHICLE HIT');
      damageCar(a, impact * .04); damageCar(b, impact * .04);
      addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffc580', 14); playSound('crash');
      a.crashCooldown = b.crashCooldown = .65;
    }
  }
  for (const mark of skidMarks) mark.life -= dt;
  if (skidMarks.length > 1600) skidMarks.splice(0, skidMarks.length - 1600);
  skidMarks = skidMarks.filter(m => m.life > 0);
}
function updateEffects(dt) {
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-2 * dt); p.life -= dt; if (p.smoke) p.size += dt * 9; }
  particles = particles.filter(p => p.life > 0).slice(-600);
  for (const text of floatingTexts) { text.y -= 17 * dt; text.life -= dt; }
  floatingTexts = floatingTexts.filter(t => t.life > 0);
}
function drawCar(ctx, car, time, darkness) {
  ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
  const l = car.length, w = car.width;
  drawRect(ctx, -l / 2 + 4, -w / 2 + 5, l + 2, w + 3, '#65523f70');
  for (const x of [-l * .28, l * .28]) for (const y of [-w / 2 - 2, w / 2 - 3]) drawRect(ctx, x - 5, y, 11, 5, '#263b3c');
  if (darkness > .16 && car.health > 0) {
    const g = ctx.createLinearGradient(l / 2, 0, l / 2 + 160, 0); g.addColorStop(0, '#ffe5ad36'); g.addColorStop(1, '#ffe5ad00');
    ctx.fillStyle = g;
    for (const side of [-8, 8]) { ctx.beginPath(); ctx.moveTo(l / 2, side); ctx.lineTo(l / 2 + 170, side - 42); ctx.lineTo(l / 2 + 170, side + 42); ctx.closePath(); ctx.fill(); }
  }
  ctx.fillStyle = car.health === 0 ? '#655b4e' : car.body; ctx.beginPath(); ctx.roundRect(-l / 2, -w / 2, l, w, 5); ctx.fill();
  drawLine(ctx, -l / 2 + 6, -w / 2 + 2, l / 2 - 5, -w / 2 + 2, '#ffffff55', 2);
  drawRect(ctx, -l * .28, -w / 2 + 3, l * .44, w - 6, '#2b616b');
  drawRect(ctx, -l * .18, -w / 2 + 4, l * .28, w - 8, car.type === 'Patrol' ? '#17252e' : car.body);
  drawLine(ctx, l * .15, -w / 2 + 4, l * .15, w / 2 - 4, '#e0f0dccc', 2);
  drawRect(ctx, -l / 2 + 1, -w / 2 + 3, 3, 5, '#ed563f'); drawRect(ctx, -l / 2 + 1, w / 2 - 8, 3, 5, '#ed563f');
  drawRect(ctx, l / 2 - 2, -w / 2 + 3, 3, 5, '#fff7d7'); drawRect(ctx, l / 2 - 2, w / 2 - 8, 3, 5, '#fff7d7');
  drawLine(ctx, l / 2 - 2, -w / 2 + 8, l / 2 - 2, w / 2 - 8, '#405c59', 2);
  if (car.type === 'Patrol') {
    drawRect(ctx, -4, -w / 2 + 1, 5, w - 2, '#17252e');
    if (car.siren && car.ai === 'police') {
      ctx.save(); ctx.shadowBlur = 20;
      const flash = Math.sin(time * 11 + car.id) > 0;
      ctx.shadowColor = flash ? '#ff525d' : '#5197ff'; drawRect(ctx, -4, -10, 6, 8, flash ? '#ff616b' : '#672e43');
      ctx.shadowColor = flash ? '#5197ff' : '#ff525d'; drawRect(ctx, -4, 2, 6, 8, flash ? '#37598d' : '#65acff'); ctx.restore();
      if (car.health > 0) {
        ctx.globalAlpha = .16; drawCircle(ctx, 0, -18, 24, flash ? '#ff6265' : '#64a2ff'); ctx.globalAlpha = 1;
      }
    }
    drawText(ctx, 'PS', 15, 3, 7, '#24343d', 'center');
  }
  if (car.health < 65) { drawLine(ctx, 9, -8, 20, 8, '#202c35', 2); drawLine(ctx, 4, 5, 18, 1, '#202c35'); }
  ctx.restore();
  if (car === player.car) {
    ctx.save(); ctx.strokeStyle = '#0e635cab'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(car.x, car.y, 35, -.2, .8); ctx.stroke(); ctx.restore();
    drawText(ctx, 'YOU', car.x, car.y - 38, 8, '#e0fff3', 'center');
  }
}
