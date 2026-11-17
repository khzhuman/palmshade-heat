'use strict';
let pedestrians = [], supplyCrates = [];
function spawnPedestrians() {
  pedestrians = [];
  for (let i = 0; i < 100; i++) {
    const row = i % 7, col = Math.floor(i / 7) % 7;
    const horizontal = i % 2 === 0;
    pedestrians.push({ x: horizontal ? 90 + col * 400 + rand(0, 220) : 200 + col * 400 + (i % 3 ? 61 : -61), y: horizontal ? 200 + row * 400 + (i % 3 ? 62 : -62) : 100 + row * 400 + rand(0, 220), angle: horizontal ? (i % 3 ? 0 : Math.PI) : Math.PI / 2, health: 60, flee: 0, hitFlash: 0, color: ['#dfc08d', '#e19c8b', '#8fb7ac', '#a696bc', '#ced5bd'][i % 5], pace: rand(19, 33), phase: rand(0, 8) });
  }
  supplyCrates = [{ x: 560, y: 1045, type: 'health', available: true }, { x: 1280, y: 1660, type: 'ammo', available: true }, { x: 2430, y: 1370, type: 'health', available: true }, { x: 1580, y: 2260, type: 'ammo', available: true }];
}
function updateTraffic(dt) {
  for (const car of cars) {
    if (car.ai !== 'traffic' || car === player.car || car.health <= 0) continue;
    // Cardinal lanes bend through intersections, with a delay preventing repeated turns.
    const nearestX = city.roadsX.reduce((a, b) => Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a);
    const nearestY = city.roadsY.reduce((a, b) => Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a);
    const horizontal = Math.abs(Math.cos(car.angle)) > .7;
    if (car.turnCooldown <= 0 && Math.abs(car.x - nearestX) < 30 && Math.abs(car.y - nearestY) < 30) {
      car.turnCooldown = 2.5;
      if (random() < .36) {
        car.angle += random() < .5 ? Math.PI / 2 : -Math.PI / 2;
        car.angle = Math.round(car.angle / (Math.PI / 2)) * Math.PI / 2;
        const a = car.angle;
        if (Math.abs(Math.cos(a)) > .7) car.y = nearestY + (Math.cos(a) > 0 ? 24 : -24);
        else car.x = nearestX + (Math.sin(a) > 0 ? -24 : 24);
        car.vx = Math.cos(a) * 65; car.vy = Math.sin(a) * 65;
      }
    }
    const ahead = { x: car.x + Math.cos(car.angle) * 75, y: car.y + Math.sin(car.angle) * 75 };
    const obstacle = cars.some(other => other !== car && distance(other, ahead) < 43) || (!player.car && distance(player, ahead) < 30);
    const targetSpeed = obstacle ? 0 : 95 + car.id % 4 * 12;
    const speed = Math.max(0, car.speed + clamp(targetSpeed - car.speed, -230 * dt, 85 * dt));
    car.vx = Math.cos(car.angle) * speed; car.vy = Math.sin(car.angle) * speed;
    applyCarPhysics(car, 0, 0, obstacle, dt);
    if (car.x < 65 || car.x > 2800 || car.y < 65 || car.y > 2740) {
      car.angle += Math.PI; car.turnCooldown = 2; car.vx *= -1; car.vy *= -1;
      if (horizontal) car.y = nearestY + (Math.cos(car.angle) > 0 ? 24 : -24); else car.x = nearestX + (Math.sin(car.angle) > 0 ? -24 : 24);
    }
  }
}
function hurtPedestrian(ped, damage, angle) {
  if (ped.health <= 0) return;
  ped.health -= damage; ped.hitFlash = .3; ped.flee = 8; ped.angle = angle;
  moveWithCollision(ped, Math.cos(angle) * 12, Math.sin(angle) * 12, 7);
  addParticles(ped.x, ped.y, '#e5c39b', 6, 60); addWanted(2, 'CIVILIAN HIT');
  if (ped.health <= 0) { game.stats.pedestriansDown++; addFloatingText(ped.x, ped.y, 'CIVILIAN DOWN', '#ff9075'); }
  for (const other of pedestrians) if (distance(other, ped) < 230 && other.health > 0) { other.flee = 8; other.angle = Math.atan2(other.y - ped.y, other.x - ped.x); }
}
function updatePedestrians(dt) {
  for (const ped of pedestrians) {
    ped.hitFlash = Math.max(0, ped.hitFlash - dt);
    if (ped.health <= 0) continue;
    ped.flee = Math.max(0, ped.flee - dt);
    if (wanted.level > 0 && distance(ped, player) < 130 && ped.flee <= 0) { ped.flee = 5; ped.angle = Math.atan2(ped.y - player.y, ped.x - player.x); }
    const speed = ped.flee > 0 ? 110 : ped.pace;
    if (moveWithCollision(ped, Math.cos(ped.angle) * speed * dt, Math.sin(ped.angle) * speed * dt, 7)) ped.angle += Math.PI * .65;
    for (const car of cars) if (Math.abs(car.speed) > 40 && distance(ped, car) < 27) {
      if (car === player.car) hurtPedestrian(ped, Math.abs(car.speed) * .38, car.angle);
      else { ped.flee = 5; ped.angle = Math.atan2(ped.y - car.y, ped.x - car.x); moveWithCollision(ped, Math.cos(ped.angle) * 18, Math.sin(ped.angle) * 18, 7); }
      break;
    }
  }
  for (const crate of supplyCrates) if (crate.available && distance(crate, player) < 28 && !player.car) {
    crate.available = false;
    if (crate.type === 'health') { player.health = Math.min(100, player.health + 50); showToast('FIRST AID · +50 HEALTH'); }
    else { player.ammo += 30; showToast('PISTOL AMMO · +30 ROUNDS'); }
    playSound('pickup'); addParticles(crate.x, crate.y, '#9be0c2');
  }
}
function drawPedestrian(ctx, ped, time) {
  ctx.save(); ctx.translate(ped.x, ped.y); ctx.rotate(ped.angle);
  if (ped.health <= 0) {
    ctx.globalAlpha = .65; drawCircle(ctx, 0, 0, 11, '#6a4d4d'); drawRect(ctx, -9, -3, 18, 6, ped.color); drawCircle(ctx, 11, 0, 3, '#d6b592'); ctx.restore(); return;
  }
  drawCircle(ctx, 4, 4, 7, '#07171e80');
  const stride = Math.sin(time * (ped.flee ? 18 : 7) + ped.phase) * 3;
  drawRect(ctx, -7, -5 + stride, 6, 3, '#1b2d37'); drawRect(ctx, -7, 2 - stride, 6, 3, '#1b2d37');
  ctx.fillStyle = ped.hitFlash > 0 ? '#fff3cb' : ped.color; ctx.beginPath(); ctx.ellipse(0, 0, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
  drawCircle(ctx, 2, 0, 4, '#d8b599'); drawCircle(ctx, 1, -1, 3, '#493d3b'); ctx.restore();
  if (ped.flee > 0) drawText(ctx, '!', ped.x, ped.y - 14, 11, '#f3ce83', 'center');
}
function drawSupplies(ctx, time) {
  for (const crate of supplyCrates) if (crate.available) {
    ctx.save(); ctx.shadowColor = crate.type === 'health' ? '#8fdbc2' : '#f9ca74'; ctx.shadowBlur = 12;
    drawRect(ctx, crate.x - 8, crate.y - 8, 16, 16, '#152b35');
    drawText(ctx, crate.type === 'health' ? '+' : '≡', crate.x, crate.y + 5 + Math.sin(time * 3), 17, crate.type === 'health' ? '#8fdbc2' : '#f9ca74', 'center'); ctx.restore();
  }
}
