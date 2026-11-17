'use strict';
// Advance five story jobs through pickups, vehicle delivery, pursuit and the final boat escape.
const missionDefinitions = [
  { name: 'First Run', reward: 1000, intro: 'You want a place in Palmshade? Earn it. Dock 07. Small package, long drive. Don’t ask what’s inside.', objective: 'Pick up the dock package. Deliver it across town in 3 minutes.', beat: '“You made the tide. Now let’s see if you can handle the streets.”', checkpoints: [{ x: 2780, y: 580 }, { x: 640, y: 2260 }] },
  { name: 'Borrowed Wheels', reward: 1800, intro: 'There’s a copper Vulture on Sunset Mile. Its owner owes me a favor. Bring it to the cannery with the body still straight.', objective: 'Steal the marked Vulture. Deliver it with less than 50% damage.', beat: '“Nice wheels. Better instincts. The cannery crew wants to meet you.”', checkpoints: [{ x: 704, y: 1776 }, { x: 2480, y: 1040 }] },
  { name: 'Heat', reward: 2500, intro: 'The port watch has our plates. Keep them looking at you for ninety seconds while my crew clears the dock. Then disappear.', objective: 'Survive a 3-star chase for 90 seconds, then lose the police.', beat: '“You kept them busy. The port is ours for one more tide.”', checkpoints: [] },
  { name: 'Hot Metal', reward: 4500, intro: 'Four districts. One case. The metal inside buys us a way out, and every patrol in Palmshade knows it. Follow my drops. Finish at the Shine Shop.', objective: 'Carry the case through all four districts under a 4-star response.', beat: '“The case is clean. One last door between us and a new life.”', checkpoints: [{ x: 2600, y: 1040 }, { x: 1000, y: 600 }, { x: 600, y: 1824 }, { x: 2200, y: 2224 }, { x: 2200, y: 1688 }] },
  { name: 'The Palmshade Score', reward: 10000, intro: 'Hillcrest’s vault house holds the port ledger and our payday. Go in on foot. Take it. I’ll be at Dock 09. Don’t bring the whole city to my boat.', objective: 'Take the score at Hillcrest. Escape 5-star heat to the Marina boat.', beat: '“Palmshade can keep its skyline. We’re taking the sunrise.”', checkpoints: [{ x: 2200, y: 2434 }, { x: 2790, y: 980 }] }
];
const mission = { index: 0, stage: 0, active: false, timer: 0, elapsed: 0, targetCarId: null, failed: false };
function resetMissions() { Object.assign(mission, { index: 0, stage: 0, active: false, timer: 0, elapsed: 0, targetCarId: null, failed: false }); }
function showMissionIntro() {
  if (mission.index >= 5) { showEnding(); return; }
  game.mode = 'card';
  const def = missionDefinitions[mission.index];
  overlay.innerHTML = `<div class="scrim"><section class="card"><div class="phone-header"><div class="portrait">M</div><div><strong>MARA VOSS</strong><small>ENCRYPTED / INCOMING MESSAGE</small></div><span class="signal">▂▄▆ 17:25</span></div><div class="eyebrow">STORY JOB / 0${mission.index + 1}</div><h1>${def.name}</h1><p class="lead">“${def.intro}”</p><div class="job-objective">◆ ${def.objective}</div><p class="card-note">PAYDAY $${def.reward.toLocaleString()} · Follow the gold marker. M opens your city map.<br>Shine Shop resprays and repairs your car for $500. Green crates heal; gold crates refill ammo.</p><button class="btn primary" id="accept-job">ACCEPT JOB →</button></section></div>`;
  document.getElementById('accept-job').onclick = startMission;
}
function startMission() {
  const def = missionDefinitions[mission.index];
  mission.stage = 0; mission.active = true; mission.failed = false; mission.elapsed = 0; mission.timer = mission.index === 0 ? 180 : mission.index === 2 ? 90 : 0;
  if (mission.index === 1) {
    let target = cars.find(c => c.missionCar);
    if (!target) { target = spawnCar('Vulture', 704, 1776, 0); target.missionCar = true; }
    if (target === player.car) player.car = null;
    Object.assign(target, { x: 704, y: 1776, health: 100, vx: 0, vy: 0, speed: 0, ai: 'parked', stolen: false });
    mission.targetCarId = target.id;
  }
  if (mission.index === 2) {
    if (!player.car) { const car = spawnCar('Manta', player.x + 45, player.y, 0); if (isBlocked(car.x, car.y, 22)) { car.x = 1000; car.y = 1424; } player.car = car; car.ai = 'player'; car.stolen = true; player.x = car.x; player.y = car.y; }
    addWanted(3, 'MARA’S DIVERSION'); wanted.forced = true;
  }
  game.mode = 'playing'; overlay.innerHTML = ''; showToast('JOB STARTED · ' + def.name.toUpperCase()); saveGame();
}
function currentMissionMarker() {
  if (game.shot === 'hero') return { x: 2200, y: 1688, label: 'SHINE SHOP', distance: 1140 };
  if (!mission.active || mission.index >= 5) return null;
  if (mission.index === 1 && mission.stage === 0) { const car = cars.find(c => c.id === mission.targetCarId); return car ? { x: car.x, y: car.y, label: 'VULTURE / TARGET' } : null; }
  const point = missionDefinitions[mission.index].checkpoints[mission.stage];
  if (!point) return null;
  const labels = [['DOCK 07 / PACKAGE', 'SOUTH QUAY / DELIVERY'], ['VULTURE / TARGET', 'CANNERY GARAGE'], [], ['CANNERY / HOT METAL', 'MARINA ROW / DROP', 'SUNSET MILE / DROP', 'HILLCREST / DROP', 'SHINE SHOP'], ['HILLCREST VAULT', 'DOCK 09 / ESCAPE']];
  return { ...point, label: labels[mission.index][mission.stage] };
}
function missionObjective() {
  if (game.shot === 'hero') return 'MISSION 4 — HOT METAL: lose the police, reach the Shine Shop';
  if (!mission.active) return mission.index >= 5 ? 'The city is yours. Free roam Palmshade.' : 'Mara Voss has a job for you.';
  if (mission.index === 0) return mission.stage === 0 ? 'Pick up the package at Marina Row Dock 07' : 'Deliver the package to South Quay before time runs out';
  if (mission.index === 1) return mission.stage === 0 ? 'Steal the marked Vulture sedan in Sunset Mile' : 'Deliver the Vulture to Old Cannery · keep damage under 50%';
  if (mission.index === 2) return mission.stage === 0 ? 'Survive the 3-star police chase for 90 seconds' : 'Lose the police · hide from patrols or use the Shine Shop';
  if (mission.index === 3) return ['Pick up the hot metal case in Old Cannery', 'Carry the case to Marina Row · 4-star escort response', 'Reach the Sunset Mile drop · keep moving', 'Cross Hillcrest with the case · patrols closing in', 'Lose the police, reach the Shine Shop'][mission.stage];
  return mission.stage === 0 ? 'Reach the Hillcrest vault house · take the score on foot' : wanted.level ? 'Escape 5-star heat · lose police, reach the Marina boat' : 'Meet Mara at Dock 09 · leave Palmshade behind';
}
function updateMissions(dt) {
  if (!mission.active || game.mode !== 'playing') return;
  mission.elapsed += dt;
  if (mission.index === 0) {
    mission.timer -= dt;
    if (mission.timer <= 0) { failMission('The tide turned. The buyer left without your package.'); return; }
  }
  if (mission.index === 1) {
    const car = cars.find(c => c.id === mission.targetCarId);
    if (!car || car.health <= 50) { failMission('The Vulture took too much damage. Mara needs it in one piece.'); return; }
    if (mission.stage === 0 && player.car === car) { mission.stage = 1; showToast('VULTURE ACQUIRED · DELIVER TO OLD CANNERY'); playSound('pickup'); }
    if (mission.stage === 1 && player.car === car && distance(player, missionDefinitions[1].checkpoints[1]) < 72 && Math.abs(car.speed) < 75) completeMission();
    return;
  }
  if (mission.index === 2) {
    if (mission.stage === 0) {
      wanted.level = Math.max(3, wanted.level); wanted.forced = true;
      mission.timer = Math.max(0, mission.timer - dt);
      if (mission.timer <= 0) { mission.stage = 1; wanted.forced = false; showToast('90 SECONDS SURVIVED · NOW LOSE THE HEAT'); }
    } else if (wanted.level === 0) completeMission();
    return;
  }
  const marker = currentMissionMarker();
  if (!marker || distance(player, marker) > 64) return;
  if (mission.index === 0) {
    if (mission.stage === 0) { mission.stage++; showToast('PACKAGE ACQUIRED · TIMER IS RUNNING'); playSound('pickup'); } else completeMission();
  } else if (mission.index === 3) {
    if (mission.stage === 0) { addWanted(4, 'HOT METAL INTERCEPT ORDER'); wanted.forced = true; }
    if (mission.stage === 3) wanted.forced = false;
    if (mission.stage < 4) { mission.stage++; showToast('DROP CONFIRMED · ' + districtAt(marker.x, marker.y).name.toUpperCase()); playSound('pickup'); }
    else if (wanted.level === 0) completeMission();
  } else if (mission.index === 4) {
    if (mission.stage === 0) {
      if (player.car) { showToast('VAULT ENTRY · EXIT YOUR CAR WITH E'); return; }
      mission.stage = 1; addWanted(5, 'HILLCREST VAULT BREACHED'); wanted.forced = true; game.stats.scoreTaken = true;
      showToast('SCORE TAKEN · FIVE STARS · GET TO THE BOAT'); playSound('pickup');
    } else {
      // The boat is the final escape route; reaching it with enough distance from patrols ends the chase.
      const nearbyPolice = cars.some(c => c.ai === 'police' && distance(c, player) < 260 && policeCanSee(c, player));
      if (!nearbyPolice) { clearWanted(); completeMission(); } else showToast('THE BOAT IS WAITING · SHAKE THE NEARBY PATROLS');
    }
  }
}
function completeMission() {
  const completed = mission.index, def = missionDefinitions[completed];
  game.cash += def.reward; game.stats.missions = completed + 1; game.stats.earned += def.reward;
  addFloatingText(player.x, player.y - 30, '+$' + def.reward.toLocaleString()); playSound('pickup');
  mission.active = false; mission.index++; mission.stage = 0; wanted.forced = false;
  saveGame();
  if (completed === 4) { showEnding(); return; }
  showCompletionCard(completed);
}
function showCompletionCard(index) {
  const def = missionDefinitions[index]; game.mode = 'card';
  overlay.innerHTML = `<div class="scrim"><section class="card complete-card"><div class="seal"><span>✓</span></div><div class="eyebrow">MARA VOSS / JOB CLOSED</div><h1>MISSION COMPLETE</h1><h2>0${index + 1} / ${def.name.toUpperCase()}</h2><div class="reward">+$${def.reward.toLocaleString()}</div><p class="lead">${def.beat}</p>${statsMarkup()}<div class="buttons"><button class="btn primary" id="next-job">NEXT JOB →</button><button class="btn" id="free-roam">FREE ROAM</button></div><p class="card-note">Progress saved · Palmshade remembers your name.</p></section></div>`;
  document.getElementById('next-job').onclick = showMissionIntro;
  document.getElementById('free-roam').onclick = () => { game.mode = 'playing'; overlay.innerHTML = ''; showToast('FREE ROAM · ENTER FOR MARA’S NEXT JOB'); };
}
function failMission(reason) {
  mission.active = false; mission.failed = true; wanted.forced = false; game.mode = 'card';
  overlay.innerHTML = `<div class="scrim"><section class="card"><div class="eyebrow">MARA VOSS / JOB INTERRUPTED</div><h1>RUN IT AGAIN.</h1><p class="lead">${reason}</p><p class="card-note">Your cash stays with you. The job restarts from its first objective.</p><button class="btn primary" id="retry-job">RETRY JOB →</button></section></div>`;
  document.getElementById('retry-job').onclick = () => { clearWanted(); player.health = 100; if (player.car) player.car.health = 100; startMission(); };
  saveGame();
}
function drawMissionMarker(ctx, time) {
  const marker = currentMissionMarker(); if (!marker) return;
  ctx.save(); ctx.translate(marker.x, marker.y);
  const pulse = Math.sin(time * 3) * 4;
  ctx.strokeStyle = '#ffc852aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 35 + pulse, 19 + pulse * .5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffcb533d'; ctx.fill();
  const beam = ctx.createLinearGradient(0, -85, 0, 0); beam.addColorStop(0, '#ffcd5500'); beam.addColorStop(1, '#ffc852aa'); drawRect(ctx, -16, -85, 32, 85, beam);
  ctx.save(); ctx.translate(0, -43 + pulse); ctx.rotate(Math.PI / 4); ctx.shadowColor = '#ffd05c'; ctx.shadowBlur = 17; drawRect(ctx, -9, -9, 18, 18, '#ffd05c'); drawRect(ctx, -4, -4, 8, 8, '#513c20'); ctx.restore();
  drawText(ctx, marker.label, 0, -75 + pulse, 10, '#ffeabb', 'center'); ctx.restore();
}
function statsMarkup() {
  return `<div class="stats"><div><small>MISSIONS</small><strong>${game.stats.missions}/5</strong></div><div><small>CASH</small><strong>$${game.cash.toLocaleString()}</strong></div><div><small>TOP WANTED</small><strong class="gold">${'★'.repeat(game.stats.topWanted) || '—'}</strong></div></div>`;
}
function showEnding() {
  game.mode = 'ending'; clearWanted(); saveGame();
  overlay.innerHTML = `<div class="scrim"><section class="card complete-card"><div class="eyebrow">05 / THE PALMSHADE SCORE</div><h1>THE SUNRISE<br>IS YOURS.</h1><div class="reward">+$10,000</div><p class="lead">“Palmshade can keep its skyline. We’re taking the sunrise.”<br>— Mara Voss, somewhere beyond the harbor</p>${statsMarkup()}<p class="card-note">${game.stats.carsStolen} cars stolen · ${game.stats.shotsFired} shots fired · ${formatTime(game.stats.playTime)} on the streets<br>Five jobs. Four districts. One way out.</p><div class="buttons"><button class="btn primary" id="ending-roam">RETURN TO THE CITY</button><button class="btn" id="ending-restart">NEW GAME</button></div></section></div>`;
  document.getElementById('ending-roam').onclick = () => { game.mode = 'playing'; overlay.innerHTML = ''; };
  document.getElementById('ending-restart').onclick = newGame;
}
