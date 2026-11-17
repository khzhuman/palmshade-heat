'use strict';
// Build a seeded, sunlit coastal city with four districts, roof depth and road collision.
const city = { width: 3200, height: 2800, roadsX: [], roadsY: [], buildings: [], trees: [], lamps: [], surface: null };
const districts = [
  { name: 'Marina Row', x: 0, y: 0, w: 1600, h: 1400, tint: '#bac7a3', roof: '#e6d3a6', mapTint: '#4d6964' },
  { name: 'Old Cannery', x: 1600, y: 0, w: 1600, h: 1400, tint: '#d2b696', roof: '#deb394', mapTint: '#796759' },
  { name: 'Sunset Mile', x: 0, y: 1400, w: 1600, h: 1400, tint: '#dbb89a', roof: '#ecc3a1', mapTint: '#826c67' },
  { name: 'Hillcrest', x: 1600, y: 1400, w: 1600, h: 1400, tint: '#bec694', roof: '#e2d9ad', mapTint: '#647563' }
];
const streetNamesX = ['TIDELINE DRIVE', 'LANTERN STREET', 'CINDER AVENUE', 'VOSS BOULEVARD', 'FOUNDRY ROAD', 'PALM CREST', 'HARBOR DRIVE'];
const streetNamesY = ['GULL STREET', 'SALTWORKS ROAD', 'CRANE AVENUE', 'SUNSET BOULEVARD', 'MIRAGE STREET', 'ORCHID ROAD', 'SOUTH QUAY'];
const shineShop = { x: 2200, y: 1688, radius: 66, name: 'Shine Shop' };
const park = { x: 1670, y: 1870, w: 260, h: 260 };
let randomSeed = 71924;
function buildCity() {
  randomSeed = 71924;
  city.buildings = []; city.trees = []; city.lamps = [];
  city.roadsX = Array.from({ length: 7 }, (_, i) => 200 + i * 400);
  city.roadsY = Array.from({ length: 7 }, (_, i) => 200 + i * 400);
  buildCityBlocks();
  city.surface = document.createElement('canvas'); city.surface.width = city.width; city.surface.height = city.height;
  drawCityBase(city.surface.getContext('2d'));
}
function random() { randomSeed = (1664525 * randomSeed + 1013904223) >>> 0; return randomSeed / 4294967296; }
function rand(a, b) { return a + random() * (b - a); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleDifference(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
function districtAt(x, y) { return districts[(y >= 1400 ? 2 : 0) + (x >= 1600 ? 1 : 0)]; }
function streetAt(x, y) {
  let ix = Math.round((x - 200) / 400), iy = Math.round((y - 200) / 400);
  return Math.abs(x - (200 + ix * 400)) < Math.abs(y - (200 + iy * 400)) ? streetNamesX[clamp(ix, 0, 6)] : streetNamesY[clamp(iy, 0, 6)];
}
function circleHitsRect(x, y, radius, rect) {
  if (radius === 0) return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  return Math.hypot(x - clamp(x, rect.x, rect.x + rect.w), y - clamp(y, rect.y, rect.y + rect.h)) < radius;
}
function buildingAt(x, y, radius = 0) { return city.buildings.find(b => circleHitsRect(x, y, radius, b)); }
function isBlocked(x, y, radius = 10) {
  return x < radius + 35 || y < radius + 35 || x > 2840 - radius || y > city.height - 35 - radius || !!buildingAt(x, y, radius);
}
function moveWithCollision(entity, dx, dy, radius) {
  let collided = false;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10));
  for (let i = 0; i < steps; i++) {
    if (!isBlocked(entity.x + dx / steps, entity.y, radius)) entity.x += dx / steps; else collided = true;
    if (!isBlocked(entity.x, entity.y + dy / steps, radius)) entity.y += dy / steps; else collided = true;
  }
  return collided;
}
function drawRect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function drawLine(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function drawCircle(ctx, x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function drawText(ctx, text, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px Arial`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, x, y);
}
function buildCityBlocks() {
  const signs = ['GULL & GLASS', 'SALT RADIO', 'QUAY COFFEE', 'TIDEMARK ROOMS', 'TIN FIN', 'LANTERN MARKET', 'WAVEBOX RECORDS', 'BRIGHT FIZZ', 'DAY OWL', 'PEBBLE LAUNDRY', 'COPPER KITCHEN', 'MIRAGE ROOMS', 'VELVET STATIC', 'CINDER ARCADE', 'PALM SOCIAL', 'ORCHID & INK', 'VOSS STORAGE', 'QUAY DINER'];
  for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
    const bx = 270 + col * 400, by = 270 + row * 400;
    if (col === 4 && row === 4) continue;
    const d = districtAt(bx, by), split = random() > .3;
    const count = split ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const b = { x: bx + 7, y: by + 8 + i * 136, w: 246 + rand(-15, 8), h: split ? 110 : 248, district: d, sign: signs[(row * 7 + col * 3 + i) % signs.length], neon: ['#f7b674', '#78d5bf', '#dc88ac', '#93adcf'][(row + col + i) % 4], style: (row + col) % 4 };
      if (col === 1 && row === 3 && i === 0) b.sign = 'VELVET STATIC';
      if (col === 2 && row === 3 && i === 0) b.sign = 'CINDER ARCADE';
      if (col === 4 && row === 5 && i === 0) b.sign = 'VAULT / HILLCREST';
      city.buildings.push(b);
    }
    for (let n = 0; n < 3; n++) city.trees.push({ x: bx + n * 90 + 25, y: by - 12, palm: col % 2 === 0, scale: rand(.75, 1.2) });
    city.lamps.push({ x: bx - 9, y: by - 8 }, { x: bx + 282, y: by + 290 });
  }
  // The paint bay is open to the road, with no invisible building collision.
  city.buildings.push({ x: 2076, y: 1490, w: 246, h: 122, district: districts[3], sign: 'SHINE SHOP', neon: '#b592d8', style: 2 });
  city.buildings = city.buildings.filter(b => !(b.x > 2050 && b.x < 2350 && b.y > 1650 && b.y < 1770));
  for (let i = 0; i < 16; i++) city.trees.push({ x: 2790, y: 160 + i * 162, palm: true, scale: 1.15 });
  for (let i = 0; i < 18; i++) city.trees.push({ x: park.x + rand(15, 240), y: park.y + rand(15, 240), palm: i % 3 === 0, scale: rand(.7, 1.1) });
}
function drawCityBase(ctx) {
  for (const d of districts) drawRect(ctx, d.x, d.y, d.w, d.h, d.tint);
  // Fine paving texture is generated once and stays fixed in world space.
  for (let i = 0; i < 12000; i++) drawRect(ctx, rand(0, 2830), rand(0, 2800), rand(1, 3), 1, '#fff1ce22');
  drawRect(ctx, 2840, 0, 360, 2800, '#55aeb6');
  drawRect(ctx, 2840, 0, 46, 2800, '#efd497');
  drawRect(ctx, 2750, 0, 55, 2800, '#e0c391');
  drawLine(ctx, 2839, 0, 2839, 2800, '#ffe7ab', 4);
  for (let y = 100; y < 2800; y += 90) {
    drawLine(ctx, 2930, y, 3120, y - 26, '#d4f7e944', 2);
    for (let x = 2850; x < 2880; x += 6) drawRect(ctx, x, y, 2, 35, '#fff0c37a');
  }
  for (const x of city.roadsX) { drawRect(ctx, x - 70, 0, 140, 2800, '#e1c68f'); drawRect(ctx, x - 52, 0, 104, 2800, '#7b8079'); }
  for (const y of city.roadsY) { drawRect(ctx, 0, y - 70, 2820, 140, '#e1c68f'); drawRect(ctx, 0, y - 52, 2839, 104, '#7b8079'); }
  // Road grit, lane lines, gutters and zebra crossings.
  for (const x of city.roadsX) {
    drawLine(ctx, x - 49, 0, x - 49, 2800, '#686e66', 3); drawLine(ctx, x + 49, 0, x + 49, 2800, '#686e66', 3);
    for (let y = 10; y < 2800; y += 36) if (!city.roadsY.some(ry => Math.abs(ry - y) < 70)) {
      drawRect(ctx, x - 2, y, 1, 19, '#fff0b2cc'); drawRect(ctx, x + 2, y, 1, 19, '#fff0b2cc');
      drawRect(ctx, x - 27, y + 4, 1, 9, '#ece9cd66'); drawRect(ctx, x + 27, y + 4, 1, 9, '#ece9cd66');
    }
  }
  for (const y of city.roadsY) {
    drawLine(ctx, 0, y - 49, 2838, y - 49, '#686e66', 3); drawLine(ctx, 0, y + 49, 2838, y + 49, '#686e66', 3);
    for (let x = 10; x < 2840; x += 36) if (!city.roadsX.some(rx => Math.abs(rx - x) < 70)) {
      drawRect(ctx, x, y - 2, 19, 1, '#fff0b2cc'); drawRect(ctx, x, y + 2, 19, 1, '#fff0b2cc');
    }
  }
  for (const x of city.roadsX) for (const y of city.roadsY) {
    drawRect(ctx, x - 51, y - 51, 102, 102, '#7b8079');
    for (let n = -42; n < 46; n += 12) {
      drawRect(ctx, x + n, y - 65, 6, 12, '#fff3d5dd'); drawRect(ctx, x + n, y + 53, 6, 12, '#fff3d5dd');
      drawRect(ctx, x - 65, y + n, 12, 6, '#fff3d5dd'); drawRect(ctx, x + 53, y + n, 12, 6, '#fff3d5dd');
    }
    drawLine(ctx, x + 2, y + 78, x + 46, y + 78, '#fff3cfcc', 2);
    drawLine(ctx, x - 78, y + 2, x - 78, y + 46, '#fff3cfcc', 2);
    drawCircle(ctx, x - 74, y - 74, 4, '#d36f45');
  }
  for (let i = 0; i < 9000; i++) {
    const x = rand(0, 2810), y = rand(0, 2800);
    if (city.roadsX.some(v => Math.abs(x - v) < 46) || city.roadsY.some(v => Math.abs(y - v) < 46)) drawRect(ctx, x, y, 2, 1, '#fff3d922');
  }
  for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
    const x = 270 + col * 400, y = 270 + row * 400;
    for (let n = 0; n < 8; n++) { drawLine(ctx, x + 282, y + n * 34, x + 320, y + n * 34, '#fff1bf99'); }
    drawText(ctx, 'P', x + 294, y + 295, 17, '#fff0c0aa');
  }
  // Street names are painted into the pavement; the HUD names the nearest one too.
  for (let i = 0; i < 7; i++) for (let j = 0; j < 6; j++) {
    drawText(ctx, streetNamesY[i], 385 + j * 400, city.roadsY[i] - 31, 8, '#f7edceb0', 'center');
  }
  drawRect(ctx, park.x, park.y, park.w, park.h, '#98b476');
  ctx.strokeStyle = '#ddcb9499'; ctx.lineWidth = 14; ctx.beginPath(); ctx.ellipse(1800, 2000, 85, 83, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#56aaa7'; ctx.beginPath(); ctx.ellipse(1800, 2000, 42, 32, -.3, 0, Math.PI * 2); ctx.fill();
  drawText(ctx, 'ORCHID PARK', 1800, 2150, 12, '#fff0c5', 'center');
  for (const b of city.buildings) drawBuildingSunShadow(ctx, b);
  for (const b of city.buildings) drawBuilding(ctx, b);
  // Port piers and moored launch: accessible from Harbor Drive.
  for (const y of [580, 980]) {
    drawRect(ctx, 2790, y - 40, 235, 80, '#b99a6e');
    for (let x = 2800; x < 3025; x += 14) drawLine(ctx, x, y - 40, x, y + 40, '#785e4499');
    drawRect(ctx, 2990, y + 60, 89, 31, '#fff0cd'); drawRect(ctx, 3005, y + 63, 50, 24, '#428a97');
    drawText(ctx, 'DOCK ' + (y === 580 ? '07' : '09'), 2800, y - 50, 11, '#f8e3b4');
  }
  drawRect(ctx, 2140, 1630, 120, 110, '#79667d');
  ctx.strokeStyle = '#ead0ff'; ctx.lineWidth = 2; ctx.strokeRect(2140, 1630, 120, 110);
  drawText(ctx, 'RESPRAY / $500', 2200, 1660, 10, '#f8e5ff', 'center');
  drawText(ctx, '↓ DRIVE IN ↓', 2200, 1728, 11, '#f8e5ff', 'center');
}
function drawBuildingSunShadow(ctx, b) {
  const length = 45 + b.style * 10;
  ctx.fillStyle = '#66533a40'; ctx.beginPath();
  ctx.moveTo(b.x - 6, b.y - 8); ctx.lineTo(b.x + b.w - 6, b.y - 8);
  ctx.lineTo(b.x + b.w + length * .7, b.y + length);
  ctx.lineTo(b.x + b.w + length * .7, b.y + b.h + length);
  ctx.lineTo(b.x + length * .7, b.y + b.h + length);
  ctx.lineTo(b.x - 6, b.y + b.h - 8); ctx.closePath(); ctx.fill();
}
function drawBuilding(ctx, building) {
  // Roofs sit northwest of their footprints, exposing the sunlit south and east facades.
  drawRect(ctx, building.x, building.y, building.w, building.h, '#b48862');
  const b = { ...building, x: building.x - 6, y: building.y - 8 };
  drawRect(ctx, b.x - 3, b.y - 3, b.w + 6, b.h + 6, '#978267');
  drawRect(ctx, b.x, b.y, b.w, b.h, b.district.roof);
  drawRect(ctx, b.x + 6, b.y + 6, b.w - 12, b.h - 15, '#ad8d6040');
  drawLine(ctx, b.x + 2, b.y + 2, b.x + b.w - 2, b.y + 2, '#fff1bfc9', 3);
  drawLine(ctx, b.x + 2, b.y + 2, b.x + 2, b.y + b.h, '#fff1bf99', 2);
  for (let y = b.y + 14; y < b.y + b.h - 12; y += 12) drawLine(ctx, b.x + 8, y, b.x + b.w - 8, y, '#8c74562e');
  for (let x = b.x + 18; x < b.x + b.w - 12; x += 30) {
    drawRect(ctx, x, b.y + b.h - 8, 18, 5, b.neon + '99');
    drawRect(ctx, x, b.y + 8, 18, 5, '#fff1c399');
  }
  for (let i = 0; i < (b.h > 150 ? 4 : 2); i++) {
    const ax = b.x + 25 + i % 2 * 130, ay = b.y + 30 + Math.floor(i / 2) * 85;
    drawRect(ctx, ax + 4, ay + 5, 35, 30, '#755d444d'); drawRect(ctx, ax, ay, 35, 30, '#c8c5a9');
    drawCircle(ctx, ax + 18, ay + 14, 10, '#717c72'); drawCircle(ctx, ax + 18, ay + 14, 3, '#e6dec1');
    drawLine(ctx, ax + 10, ay + 14, ax + 25, ay + 14, '#aab69b');
    drawLine(ctx, ax + 18, ay + 6, ax + 18, ay + 23, '#aab69b');
  }
  if (b.style === 1) {
    drawRect(ctx, b.x + 76, b.y + 29, 70, 53, '#69aeb5');
    for (let x = b.x + 80; x < b.x + 144; x += 16) drawLine(ctx, x, b.y + 30, x, b.y + 81, '#ddf1d19c', 2);
  }
  const sy = b.y + b.h - 1;
  ctx.save(); ctx.shadowColor = b.neon; ctx.shadowBlur = 14;
  drawRect(ctx, b.x + 15, sy - 17, b.w - 30, 27, '#284449');
  drawLine(ctx, b.x + 17, sy + 10, b.x + b.w - 17, sy + 10, b.neon, 2);
  drawText(ctx, b.sign, b.x + b.w / 2, sy + 1, 14, b.neon, 'center'); ctx.restore();
  // Awnings, stoops, dumpsters and bollards make streets read at game scale.
  for (let x = b.x + 14; x < b.x + b.w - 12; x += 16) drawRect(ctx, x, sy + 13, 14, 7, (Math.floor(x / 16) % 2 ? b.neon + '66' : '#fff0cfbb'));
  drawRect(ctx, b.x + b.w / 2 - 14, sy + 21, 28, 9, '#b49e7c');
  drawRect(ctx, b.x + b.w + 7, b.y + 23, 16, 26, '#668b68');
  drawLine(ctx, b.x + b.w + 7, b.y + 26, b.x + b.w + 23, b.y + 26, '#d4dfa699', 2);
}
function drawTree(ctx, tree, time) {
  const { x, y, scale: s } = tree; ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  drawCircle(ctx, 9, 10, tree.palm ? 24 : 20, '#77603e44');
  drawRect(ctx, -2, -1, 4, 17, '#b2905d');
  if (tree.palm) {
    for (let i = 0; i < 7; i++) {
      ctx.save(); ctx.rotate(i * Math.PI * 2 / 7 + Math.sin(time * .35 + x) * .025);
      ctx.fillStyle = i % 2 ? '#76a064' : '#568355'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(17, -15, 33, -4); ctx.quadraticCurveTo(17, -1, 0, 4); ctx.fill();
      drawLine(ctx, 0, 0, 27, -6, '#c3c87799'); ctx.restore();
    }
    drawCircle(ctx, 0, 0, 4, '#dec782');
  } else { drawCircle(ctx, 0, 0, 22, '#5b884e'); drawCircle(ctx, -5, -5, 17, '#80a35e'); drawCircle(ctx, 6, -8, 9, '#a5ba74'); }
  ctx.restore();
}
function policeCanSee(a, b) {
  if (distance(a, b) > 510) return false;
  const steps = Math.ceil(distance(a, b) / 22);
  for (let i = 1; i < steps; i++) if (buildingAt(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps, 3)) return false;
  return true;
}
