// Browser integration checks: real keyboard input, every story transition and all staged frames.
import assert from 'node:assert/strict';
import { withChrome } from './shots.mjs';

async function checkBrowserGame(page, name, expression, predicate = Boolean) {
  const value = await page.evaluate('(() => {' + expression + '})()');
  assert.ok(predicate(value), name + ': ' + JSON.stringify(value));
  assert.deepEqual(page.errors, [], name + ': browser console errors');
  console.log('PASS ' + name);
}
async function press(page, key, code, duration = 0) {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
  if (duration) await new Promise(resolve => setTimeout(resolve, duration));
  else await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
}

await withChrome(async (page, baseURL) => {
  await page.navigate(baseURL + '/');
  await checkBrowserGame(page, 'title / no console errors', `return game.mode === 'title' && hud.hidden && document.querySelector('.title-features').textContent.includes('POLICE WHO RESPOND');`);
  await checkBrowserGame(page, 'pedestrians and parked cars spawn on clear ground', `return pedestrians.every(p => !isBlocked(p.x, p.y, 7)) && cars.every(c => !isBlocked(c.x, c.y, 21));`);
  await press(page, 'Enter', 'Enter');
  await checkBrowserGame(page, 'new game introduces first job', `return game.mode === 'card' && mission.index === 0;`);
  await press(page, 'Enter', 'Enter');
  await press(page, 'e', 'KeyE');
  await checkBrowserGame(page, 'E steals nearby car', `return game.mode === 'playing' && player.car?.type === 'Manta' && game.stats.carsStolen === 1 && wanted.level === 1;`);
  const startX = await page.evaluate('player.x');
  await press(page, 'w', 'KeyW', 650);
  await checkBrowserGame(page, 'W drives the stolen car', `return player.x > ${startX} + 15 && Math.abs(player.car.speed) > 20;`);
  await press(page, 'p', 'KeyP');
  await checkBrowserGame(page, 'pause freezes game', `return game.mode === 'paused' && !!document.getElementById('open-map');`);
  await press(page, 'm', 'KeyM');
  await checkBrowserGame(page, 'map names all four districts', `return game.mode === 'map' && districts.map(d => d.name).join('|') === 'Marina Row|Old Cannery|Sunset Mile|Hillcrest' && overlay.textContent.includes('Shine Shop');`);
  await press(page, 'Escape', 'Escape');
  await checkBrowserGame(page, 'resume returns to driving', `return game.mode === 'playing';`);

  // Advance marker contacts directly to verify the complete state machine without waiting out a run.
  await checkBrowserGame(page, 'job 1 pickup and completion', `
    clearWanted(); player.car = null; player.x = 2780; player.y = 580; updateMissions(1 / 60);
    const pickedUp = mission.stage === 1; player.x = 640; player.y = 2260; updateMissions(1 / 60);
    return pickedUp && mission.index === 1 && game.stats.missions === 1 && game.cash === 1750;
  `);
  await checkBrowserGame(page, 'job 2 car is clear of buildings and deliverable', `
    startMission(); const target = cars.find(c => c.id === mission.targetCarId);
    const clear = !isBlocked(target.x, target.y, 21); player.x = target.x - 44; player.y = target.y;
    enterOrExitCar(); updateMissions(1 / 60);
    target.x = 2480; target.y = 1040; target.speed = target.vx = target.vy = 0;
    player.x = target.x; player.y = target.y; updateMissions(1 / 60);
    return clear && mission.index === 2 && game.stats.missions === 2 && game.cash === 3550;
  `);
  await checkBrowserGame(page, 'job 3 holds heat then releases escape', `
    startMission(); for (let i = 0; i < 90; i++) updateMissions(1);
    const survived = mission.stage === 1 && !wanted.forced;
    clearWanted(); updateMissions(1 / 60);
    return survived && mission.index === 3 && game.cash === 6050;
  `);
  await checkBrowserGame(page, 'job 4 district drops and Shine Shop completion', `
    startMission();
    for (let i = 0; i < 4; i++) {
      const p = missionDefinitions[3].checkpoints[i]; player.x = player.car.x = p.x; player.y = player.car.y = p.y;
      player.car.speed = player.car.vx = player.car.vy = 0; updateMissions(1 / 60);
    }
    player.x = player.car.x = shineShop.x; player.y = player.car.y = shineShop.y;
    game.shopCooldown = 0; updateShineShop(1 / 60); updateMissions(1 / 60);
    return mission.index === 4 && game.cash === 10050 && wanted.level === 0;
  `);
  await checkBrowserGame(page, 'job 5 on-foot gate, five stars and final ending', `
    startMission(); const p = missionDefinitions[4].checkpoints[0]; player.x = player.car.x = p.x; player.y = player.car.y = p.y;
    updateMissions(1 / 60); const gate = mission.stage === 0; enterOrExitCar(); player.x = p.x; player.y = p.y; updateMissions(1 / 60);
    const score = mission.stage === 1 && wanted.level === 5; player.x = 2790; player.y = 980;
    cars = cars.filter(c => c.ai !== 'police'); updateMissions(1 / 60);
    return gate && score && game.mode === 'ending' && game.stats.missions === 5 && game.cash === 20050;
  `);
  await checkBrowserGame(page, 'continue restores completed story', `
    saveGame(); const expected = game.cash; game.cash = 0; continueGame();
    return mission.index === 5 && game.stats.missions === 5 && game.cash === expected;
  `);
  await checkBrowserGame(page, 'wasted and busted restart screens', `
    game.mode = 'playing'; player.health = 0; updatePlayer(1 / 60); const wasted = game.mode === 'wasted';
    document.getElementById('retry-run').click(); const recovered = player.health === 100;
    game.mode = 'playing'; endGame('busted'); const busted = game.mode === 'busted'; document.getElementById('end-restart').click();
    return wasted && recovered && busted && mission.index === 0 && game.stats.missions === 0;
  `);
  for (const shot of ['hero', 'foot', 'complete', 'map']) {
    await page.navigate(baseURL + '/?shot=' + shot);
    await page.waitFor('window.__shotReady === true');
    await checkBrowserGame(page, shot + ' golden-hour scene / no console errors', `return window.__shotReady && sceneDarkness() === 0 && clockMinutes() === 1045;`);
    if (shot === 'hero') await checkBrowserGame(page, 'hero chase, air support and roadblock', `return wanted.level === 4 && wanted.bust > .5 && wanted.bust < 1 && player.car.speed > 200 && helicopter?.tactic === 'SPOTLIGHT' && dispatchUnits().filter(u => u.tactic === 'ROADBLOCK').length === 2 && !dispatchPanel.hidden && document.getElementById('objective').textContent.includes('HOT METAL');`);
    if (shot === 'foot') await checkBrowserGame(page, 'foot gunfight, Mara dialogue and theft prompt', `return !player.car && player.health < 100 && player.flash > 0 && !!pistolImpact && pedestrians.find(p => p.officer)?.health === 26 && !maraCard.hidden && document.getElementById('prompt').textContent === "E — STEAL 'VULTURE' SEDAN" && !document.getElementById('prompt').hidden && !!currentMissionMarker();`);
    if (shot === 'complete') await checkBrowserGame(page, 'mission 3 complete card', `return overlay.textContent.includes('+$2,500') && overlay.textContent.includes('3/5') && overlay.textContent.includes('★★★★');`);
    if (shot === 'map') await checkBrowserGame(page, 'world map and legend', `return game.mode === 'map' && !!document.getElementById('city-map') && overlay.textContent.includes('Shine Shop') && overlay.textContent.includes('Mission / gold');`);
  }
});
