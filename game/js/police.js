'use strict';
// Respond to reported crimes with road-routed pursuit, searches, arrests and resprays.
const wanted = { level: 0, top: 0, lastCrime: -100, unseen: 0, bust: 0, spawnTimer: 0, seen: false, reason: '', forced: false };
let helicopter = null, palmSerial = 0, nextBlock = 0;
function resetDispatch() { helicopter = null; palmSerial = 0; nextBlock = 0; }
function registerUnit(unit, tactic = 'PURSUIT') {
  unit.callsign ||= 'PALM-' + ++palmSerial;
  unit.tactic = tactic;
  return unit;
}
function dispatchUnits() {
  return [...cars.filter(c => c.ai === 'police' && c.health > 0), ...pedestrians.filter(p => p.officer && p.health > 0 && wanted.level), ...(helicopter ? [helicopter] : [])];
}
function addWanted(stars, reason = 'CRIME REPORTED') {
  const previous = wanted.level;
  wanted.level = Math.min(5, Math.max(wanted.level, stars));
  // Repeated serious offenses escalate pressure, with a short anti-spam grace period.
  if (stars >= 2 && previous >= stars && game.time - wanted.lastCrime > 4) wanted.level = Math.min(5, previous + 1);
  wanted.lastCrime = game.time; wanted.unseen = 0; wanted.reason = reason;
  wanted.top = Math.max(wanted.top, wanted.level); game.stats.topWanted = Math.max(game.stats.topWanted, wanted.level);
  if (wanted.level > previous) { showToast(reason + ' · ' + wanted.level + ' STAR HEAT'); playSound('siren'); }
}
function clearWanted() {
  wanted.level = 0; wanted.unseen = 0; wanted.bust = 0; wanted.seen = false; wanted.forced = false; wanted.spawnTimer = 1.5;
  helicopter = null; nextBlock = 0;
  for (const car of cars) if (car.ai === 'police') { car.ai = 'traffic'; car.siren = false; car.blockUntil = 0; }
}
function nearestRoadPoint(point) {
  const x = city.roadsX.reduce((a, b) => Math.abs(b - point.x) < Math.abs(a - point.x) ? b : a);
  const y = city.roadsY.reduce((a, b) => Math.abs(b - point.y) < Math.abs(a - point.y) ? b : a);
  return Math.abs(x - point.x) < Math.abs(y - point.y) ? { x, y: clamp(point.y, 200, 2600), vertical: true } : { x: clamp(point.x, 200, 2600), y, vertical: false };
}
function adjacentRoadNodes(p) {
  const v = p.vertical ? p.y : p.x, i = clamp(Math.floor((v - 200) / 400), 0, 5);
  return [i, i + 1].map(n => p.vertical ? { x: p.x, y: 200 + n * 400 } : { x: 200 + n * 400, y: p.y });
}
function findRoadRoute(from, to) {
  const a = nearestRoadPoint(from), b = nearestRoadPoint(to);
  if ((a.vertical && b.vertical && a.x === b.x) || (!a.vertical && !b.vertical && a.y === b.y)) return [b, { x: to.x, y: to.y }];
  let best, cost = Infinity;
  for (const start of adjacentRoadNodes(a)) for (const end of adjacentRoadNodes(b)) {
    const c = distance(a, start) + Math.abs(start.x - end.x) + Math.abs(start.y - end.y) + distance(end, b);
    if (c < cost) { best = { start, end }; cost = c; }
  }
  const route = [];
  if (distance(from, a) > 40) route.push(a);
  route.push(best.start);
  // Manhattan road routing goes through an actual intersection, never through a roof.
  if (best.start.x !== best.end.x && best.start.y !== best.end.y) route.push({ x: best.end.x, y: best.start.y });
  route.push(best.end, b, { x: to.x, y: to.y });
  return route.filter((p, i, arr) => i === 0 || distance(p, arr[i - 1]) > 15);
}
function spawnPolice() {
  const road = nearestRoadPoint(player), side = random() > .5 ? 1 : -1;
  let x = road.x, y = road.y;
  if (road.vertical) y = clamp(y + side * rand(450, 650), 160, 2650); else x = clamp(x + side * rand(450, 650), 160, 2700);
  if (distance({ x, y }, player) < 250) { x = clamp(x + 400, 200, 2600); y = city.roadsY[Math.floor(random() * 7)]; }
  const car = spawnCar('Patrol', x, y, Math.atan2(player.y - y, player.x - x), 'police');
  car.role = cars.filter(c => c.ai === 'police').length % 3;
  return registerUnit(car);
}
function deployRoadblock(x, y, vertical) {
  const points = [-26, 26].map(offset => ({ x: x + (vertical ? offset : 0), y: y + (vertical ? 0 : offset) }));
  if (points.some(p => isBlocked(p.x, p.y, 22) || cars.some(c => c.health > 0 && distance(c, p) < 48))) return false;
  for (const p of points) {
    const unit = registerUnit(spawnCar('Patrol', p.x, p.y, vertical ? .12 : Math.PI / 2 + .12, 'police'), 'ROADBLOCK');
    unit.blockUntil = game.time + 13;
  }
  announceEvent({ x, y }, 'ROADBLOCK AHEAD');
  return true;
}
function updateAirSupport(dt) {
  if (wanted.level < 4) { helicopter = null; return; }
  helicopter ||= registerUnit({ x: player.x - 280, y: player.y - 180, angle: 0 }, 'SPOTLIGHT');
  const dx = player.x - 145 - helicopter.x, dy = player.y - 100 - helicopter.y;
  helicopter.angle = Math.atan2(player.y - helicopter.y, player.x - helicopter.x);
  helicopter.x += dx * Math.min(1, dt * 1.7); helicopter.y += dy * Math.min(1, dt * 1.7);
}
function drawAirSupport(ctx, time, beam) {
  if (!helicopter) return;
  const { x, y, angle } = helicopter;
  if (beam) {
    const glow = ctx.createLinearGradient(x, y, player.x, player.y);
    glow.addColorStop(0, '#fff3b632'); glow.addColorStop(1, '#fff3b684');
    const nx = -Math.sin(angle) * 44, ny = Math.cos(angle) * 44;
    ctx.fillStyle = glow; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(player.x + nx, player.y + ny); ctx.lineTo(player.x - nx, player.y - ny); ctx.closePath(); ctx.fill();
    const pool = ctx.createRadialGradient(player.x, player.y, 3, player.x, player.y, 49);
    pool.addColorStop(0, '#fff1b581'); pool.addColorStop(1, '#fff1b500'); drawCircle(ctx, player.x, player.y, 49, pool);
    return;
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  drawRect(ctx, -39, -3, 29, 6, '#e2d7b7'); drawRect(ctx, -37, -10, 5, 20, '#304652');
  drawLine(ctx, -20, -11, 16, -11, '#273b43', 3); drawLine(ctx, -20, 11, 16, 11, '#273b43', 3);
  drawCircle(ctx, 0, 0, 15, '#f0e2bb'); drawCircle(ctx, 9, 0, 10, '#365967');
  ctx.rotate(time * 21); drawLine(ctx, -38, 0, 38, 0, '#26383b9c', 4); drawCircle(ctx, 0, 0, 4, '#253940'); ctx.restore();
}
function updatePolice(dt) {
  const active = cars.filter(c => c.ai === 'police' && c.health > 0);
  updateAirSupport(dt);
  if (wanted.level >= 3 && player.car && Math.abs(player.car.speed) > 100 && game.time >= nextBlock) {
    const road = nearestRoadPoint(player.car), heading = road.vertical ? player.car.vy : player.car.vx;
    const gap = Math.sign(heading) * 460;
    const x = road.x + (road.vertical ? 0 : gap), y = road.y + (road.vertical ? gap : 0);
    nextBlock = Math.abs(heading) > 70 && deployRoadblock(x, y, road.vertical) ? game.time + 32 : game.time + 4;
  }
  wanted.spawnTimer -= dt;
  const targetCount = wanted.level ? Math.min(9, wanted.level * 2) : 0;
  if (active.length < targetCount && wanted.spawnTimer <= 0) { spawnPolice(); wanted.spawnTimer = 1.9; }
  wanted.seen = false;
  let arresting = false;
  for (const car of active) {
    if (!wanted.level) { car.ai = 'traffic'; continue; }
    const sight = policeCanSee(car, player), dist = distance(car, player);
    wanted.seen ||= sight;
    if (car.blockUntil > game.time && wanted.level >= 3) { car.speed = car.vx = car.vy = 0; continue; }
    car.blockUntil = 0;
    car.routeTimer -= dt;
    const velocity = player.car ? { x: player.car.vx, y: player.car.vy } : { x: 0, y: 0 };
    // Interceptors predict where a moving target will be; blockers converge ahead.
    let target = { x: player.x + velocity.x * (car.role === 1 ? .8 : .2), y: player.y + velocity.y * (car.role === 1 ? .8 : .2) };
    const pit = car.role === 2 && player.car && sight && dist < 180;
    if (pit) { target.x += Math.cos(player.angle + Math.PI / 2) * 35; target.y += Math.sin(player.angle + Math.PI / 2) * 35; }
    let goal = target;
    if (!sight || dist > 240) {
      if (car.routeTimer <= 0 || !car.route.length) { car.route = findRoadRoute(car, target); car.routeTimer = 1.2; }
      while (car.route.length > 1 && distance(car, car.route[0]) < 58) car.route.shift();
      goal = car.route[0] || target;
    }
    const desired = Math.atan2(goal.y - car.y, goal.x - car.x), turn = angleDifference(desired, car.angle);
    const steering = clamp(turn * 2.8, -1, 1);
    const closeStopped = dist < 64 && (!player.car || Math.abs(player.car.speed) < 22);
    const firing = !player.car && sight && wanted.level >= 3 && dist >= 80 && dist < 170;
    registerUnit(car, firing ? 'FIRING' : pit ? 'PIT' : player.car && sight && dist < 150 && !closeStopped ? 'RAMMING' : 'PURSUIT');
    if (firing && (car.nextShot || 0) <= game.time) {
      car.nextShot = game.time + 1.25; car.fireUntil = game.time + .1;
      if (!player.hitTimer) { player.health -= 5; player.hitTimer = .5; addParticles(player.x, player.y, '#ffdc98', 5); }
      scatterPedestrians(car, 185);
    }
    const targetSpeed = closeStopped ? 0 : Math.abs(turn) > .65 ? 87 : Math.min(car.maxSpeed, 210 + wanted.level * 19);
    const throttle = car.speed < targetSpeed - 5 ? 1 : car.speed > targetSpeed + 15 ? -1 : 0;
    applyCarPhysics(car, throttle, steering, closeStopped || Math.abs(turn) > 1.2, dt);
    if (closeStopped && Math.abs(car.speed) < 35 && sight) arresting = true;
    // A patrol too far away is recycled instead of leaving a giant population behind.
    if (dist > 1250 && !game.shot) { car.health = 0; car.ai = 'despawn'; }
  }
  cars = cars.filter(c => c.ai !== 'despawn');
  if (wanted.level) {
    if (wanted.seen) wanted.unseen = 0; else wanted.unseen += dt;
    if (!wanted.forced && wanted.unseen > 17 && game.time - wanted.lastCrime > 14) {
      wanted.level--; wanted.unseen = 0;
      if (!wanted.level) { clearWanted(); showToast('HEAT LOST · YOU ARE OFF THE RADAR'); }
    }
  }
  wanted.bust = clamp(wanted.bust + (arresting ? dt / 4.6 : -dt / 2.4), 0, 1);
  if (wanted.bust >= 1) endGame('busted');
  if (wanted.level && game.time - game.lastSiren > 2.6 && active.some(c => distance(c, player) < 600)) { playSound('siren'); game.lastSiren = game.time; }
  updateShineShop(dt);
}
function updateShineShop(dt) {
  game.shopCooldown = Math.max(0, game.shopCooldown - dt);
  if (player.car && distance(player, shineShop) < shineShop.radius && Math.abs(player.car.speed) < 85) {
    if (game.shopCooldown > 0) return;
    if (mission.active && mission.index === 2 && mission.stage === 0) { showToast('MARA NEEDS THE DIVERSION · KEEP THE POLICE BUSY'); game.shopCooldown = 4; return; }
    if (mission.active && mission.index === 3 && mission.stage < 4 && wanted.forced) { showToast('HOT METAL · FINISH MARA’S DROPS BEFORE THE RESPRAY'); game.shopCooldown = 4; return; }
    if (game.cash >= 500 && (wanted.level || player.car.health < 100)) {
      game.cash -= 500; clearWanted(); player.car.health = 100;
      player.car.body = ['#65b6a4', '#caa5d5', '#f0bf76'][Math.floor(random() * 3)];
      addParticles(player.x, player.y, '#edcaff', 30); playSound('pickup'); showToast('SHINE SHOP · NEW PAINT, NO HEAT · −$500'); game.shopCooldown = 4; saveGame();
    } else if (game.cash < 500 && wanted.level) { showToast('SHINE SHOP · $500 REQUIRED'); game.shopCooldown = 4; }
  }
}
