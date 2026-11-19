// Everything the player sees: the city from above, the cars and people
// in it, the HUD (cash, health, ammo, wanted stars, clock, district,
// objective), the live minimap with its blips, and the title, pause,
// busted and wasted screens. The renderer never changes the world; it
// only paints what the world module says is there.

import { AVENUES, BEACH_X, COLORS, ROAD_HALF, STREETS, WATER_X, WORLD } from './config.js';
import { districtAt } from './city.js';
import { carCircles } from './entities.js';
import { currentMission, currentStep, missionObjective, missionTarget, storyFinished } from './missions.js';
import { MARA_OFFICE, wantedStars } from './world.js';

// The logical viewport the game is drawn in; the canvas scales it to fit
// the window, so the layout never depends on the screen size.
export const VIEW = { width: 1280, height: 720 };

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  // Fit the 1280x720 view into the window, letterboxed.
  function beginFrame() {
    const scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    const ox = (canvas.width - VIEW.width * scale) / 2;
    const oy = (canvas.height - VIEW.height * scale) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    return { scale, ox, oy };
  }

  function render(world, screen, extra = {}) {
    beginFrame();
    const camera = world.camera;
    const camX = clampCam(camera.x, VIEW.width);
    const camY = clampCam(camera.y, VIEW.height);
    drawWorld(ctx, world, camX, camY);
    drawLighting(ctx, world.hour);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      drawHud(ctx, world);
      drawMinimap(ctx, world);
    }
    if (screen === SCREEN_TITLE) drawTitle(ctx, world, extra.hasSave);
    if (screen === SCREEN_PAUSED) drawPause(ctx);
    if (screen === SCREEN_BUSTED) drawEndScreen(ctx, 'BUSTED', 'The CBPD took you in. Mara will post bail — press Enter to try again.');
    if (screen === SCREEN_WASTED) drawEndScreen(ctx, 'WASTED', 'Reno is down. Press Enter to try again.');
  }

  return { render, canvas, ctx };
}

function clampCam(value, viewSize) {
  const half = viewSize / 2;
  return Math.max(half - 200, Math.min(WORLD.width - half + 200, value));
}

// --- The world --------------------------------------------------------------

function drawWorld(ctx, world, camX, camY) {
  const x0 = camX - VIEW.width / 2;
  const y0 = camY - VIEW.height / 2;
  ctx.save();
  ctx.translate(-x0, -y0);

  drawGround(ctx, world, x0, y0);
  drawRoads(ctx, x0, y0);
  drawMarina(ctx, world);
  drawPark(ctx, world);
  drawSkidMarks(ctx, world);
  drawBuildings(ctx, world);
  drawTrees(ctx, world);
  drawMissionMarkers(ctx, world);
  drawCars(ctx, world);
  drawPeds(ctx, world);
  drawEnemies(ctx, world);
  drawBullets(ctx, world);
  drawPlayer(ctx, world);
  ctx.restore();
}

function drawGround(ctx, world, x0, y0) {
  const x1 = x0 + VIEW.width;
  const y1 = y0 + VIEW.height;
  // Grass everywhere first.
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(x0, y0, VIEW.width, VIEW.height);
  // Mow stripes for texture, cheap and deterministic.
  ctx.fillStyle = COLORS.grassDark;
  const stripe = 120;
  for (let sx = Math.floor(x0 / stripe) * stripe; sx < x1; sx += stripe * 2) {
    ctx.fillRect(sx, y0, stripe, VIEW.height);
  }
  // The beach and the sea on the eastern edge.
  if (x1 > BEACH_X) {
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(Math.max(x0, BEACH_X), y0, x1 - Math.max(x0, BEACH_X), VIEW.height);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(Math.max(x0, WATER_X), y0, x1 - Math.max(x0, WATER_X), VIEW.height);
    ctx.fillStyle = COLORS.waterDeep;
    for (let wy = Math.floor(y0 / 90) * 90; wy < y1; wy += 90) {
      ctx.fillRect(Math.max(x0, WATER_X) + 30, wy + 30, 90, 6);
    }
  }
}

function drawRoads(ctx, x0, y0) {
  const x1 = x0 + VIEW.width;
  const y1 = y0 + VIEW.height;
  ctx.fillStyle = COLORS.sidewalk;
  for (const ax of AVENUES) {
    if (ax + ROAD_HALF + 8 < x0 || ax - ROAD_HALF - 8 > x1) continue;
    ctx.fillRect(ax - ROAD_HALF - 8, y0, (ROAD_HALF + 8) * 2, VIEW.height);
  }
  for (const sy of STREETS) {
    if (sy + ROAD_HALF + 8 < y0 || sy - ROAD_HALF - 8 > y1) continue;
    ctx.fillRect(x0, sy - ROAD_HALF - 8, VIEW.width, (ROAD_HALF + 8) * 2);
  }
  ctx.fillStyle = COLORS.road;
  for (const ax of AVENUES) {
    if (ax + ROAD_HALF < x0 || ax - ROAD_HALF > x1) continue;
    ctx.fillRect(ax - ROAD_HALF, y0, ROAD_HALF * 2, VIEW.height);
  }
  for (const sy of STREETS) {
    if (sy + ROAD_HALF < y0 || sy - ROAD_HALF > y1) continue;
    ctx.fillRect(x0, sy - ROAD_HALF, VIEW.width, ROAD_HALF * 2);
  }
  // Centre dashes.
  ctx.fillStyle = COLORS.roadLine;
  for (const ax of AVENUES) {
    if (ax < x0 || ax > x1) continue;
    for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) {
      ctx.fillRect(ax - 2, y, 4, 22);
    }
  }
  for (const sy of STREETS) {
    if (sy < y0 || sy > y1) continue;
    for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) {
      ctx.fillRect(x, sy - 2, 22, 4);
    }
  }
}

function drawMarina(ctx, world) {
  for (const pier of world.city.piers) {
    ctx.fillStyle = '#6a5a42';
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
  }
  for (const boat of world.city.boats) {
    ctx.save();
    ctx.translate(boat.x, boat.y);
    ctx.rotate(boat.angle);
    ctx.fillStyle = boat.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e4a5a';
    ctx.fillRect(-8, -4, 14, 8);
    ctx.restore();
  }
}

function drawPark(ctx, world) {
  const pond = world.city.pond;
  ctx.fillStyle = COLORS.park;
  ctx.fillRect(1050, 1050, 400, 400);
  ctx.fillStyle = COLORS.water;
  ctx.beginPath();
  ctx.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c9b98a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(1050, 1250);
  ctx.lineTo(1450, 1250);
  ctx.moveTo(1250, 1050);
  ctx.lineTo(1250, 1450);
  ctx.stroke();
}

function drawSkidMarks(ctx, world) {
  ctx.fillStyle = 'rgba(20, 20, 24, 0.55)';
  for (const mark of world.skidMarks) {
    ctx.save();
    ctx.translate(mark.x, mark.y);
    ctx.rotate(mark.angle);
    ctx.globalAlpha = Math.min(1, mark.life / 2);
    ctx.fillRect(-22, -16, 44, 4);
    ctx.fillRect(-22, 12, 44, 4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawBuildings(ctx, world) {
  for (const b of world.city.buildings) {
    // Drop shadow.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Roof detail: a lighter inner slab and a glass strip.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    ctx.fillStyle = COLORS.glass;
    ctx.fillRect(b.x + 10, b.y + b.h / 2 - 6, b.w - 20, 12);
    if (b.landmark) {
      ctx.fillStyle = '#1d1a16';
      ctx.font = 'bold 13px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.landmark, b.x + b.w / 2, b.y + b.h / 2 + 24);
    }
  }
}

function drawTrees(ctx, world) {
  for (const t of world.city.trees) {
    ctx.fillStyle = COLORS.treeDark;
    ctx.beginPath();
    ctx.arc(t.x + 2, t.y + 3, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.tree;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMissionMarkers(ctx, world) {
  const player = world.player;
  // Mara's office marker, shown while a job waits to be started.
  const mission = currentMission(world.mission);
  if (mission && !world.mission.active && !storyFinished(world.mission)) {
    drawMarker(ctx, MARA_OFFICE.x, MARA_OFFICE.y, 'M', COLORS.mission);
    ctx.fillStyle = COLORS.mission;
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MARA — press E for the next job', MARA_OFFICE.x, MARA_OFFICE.y - 34);
  }
  // The active objective marker, pulsing.
  const target = missionTarget(world.mission);
  if (world.mission.active && target) {
    const pulse = 1 + Math.sin(world.time * 4) * 0.12;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = COLORS.mission;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.mission;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Cash stash markers during the cash-drop job.
  const step = world.mission.active ? currentStep(world.mission) : null;
  if (step && step.type === 'collect') {
    step.spots.forEach((spot, i) => {
      if (i < world.mission.collected) return;
      ctx.fillStyle = '#7ee081';
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d1a16';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', spot.x, spot.y + 1);
    });
  }
}

function drawMarker(ctx, x, y, label, color) {
  const pulse = 1 + Math.sin(Date.now() / 300) * 0.08;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d1a16';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 1);
  ctx.restore();
}

function drawCars(ctx, world) {
  for (const car of world.cars) {
    drawCar(ctx, car);
  }
}

function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(-32 + 3, -16 + 4, 64, 32);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -32, -16, 64, 32, 8);
  ctx.fill();
  // Cabin and windshield.
  ctx.fillStyle = car.police ? '#dfe6ee' : 'rgba(20, 30, 40, 0.75)';
  roundRect(ctx, -8, -13, 22, 26, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 200, 230, 0.7)';
  ctx.fillRect(14, -12, 6, 24);
  // Headlights and taillights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(30, -13, 3, 6);
  ctx.fillRect(30, 7, 3, 6);
  ctx.fillStyle = '#ff4d4d';
  ctx.fillRect(-33, -13, 3, 6);
  ctx.fillRect(-33, 7, 3, 6);
  if (car.police) {
    // Light bar.
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-2, -14, 8, 5);
    ctx.fillStyle = '#2f7bff';
    ctx.fillRect(-2, 9, 8, 5);
    ctx.fillStyle = '#f2f0e6';
    ctx.font = 'bold 9px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CBPD', 0, 2);
  }
  // Damage smoke.
  if (car.health < 45) {
    ctx.fillStyle = 'rgba(120, 120, 120, 0.6)';
    ctx.beginPath();
    ctx.arc(-10, 0, 8 + Math.sin(Date.now() / 120) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPeds(ctx, world) {
  for (const ped of world.peds) {
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, 10);
  }
  for (const cop of world.footCops) {
    drawPerson(ctx, cop.x, cop.y, cop.angle, cop.color, 11);
    // Navy cap.
    ctx.fillStyle = '#16233a';
    ctx.beginPath();
    ctx.arc(cop.x, cop.y - 3, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPerson(ctx, x, y, angle, color, radius) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.arc(2, 3, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  // Head and shoulders facing the direction of travel.
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath();
  ctx.arc(4, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemies(ctx, world) {
  for (const e of world.enemies) {
    drawPerson(ctx, e.x, e.y, e.angle, e.color, 11);
    // Health bar.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(e.x - 14, e.y - 24, 28, 4);
    ctx.fillStyle = COLORS.enemy;
    ctx.fillRect(e.x - 14, e.y - 24, 28 * Math.max(0, e.health / 100), 4);
    // Gun.
    ctx.strokeStyle = '#1d1a16';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.angle) * 20, e.y + Math.sin(e.angle) * 20);
    ctx.stroke();
  }
}

function drawBullets(ctx, world) {
  ctx.fillStyle = '#ffe9a8';
  for (const b of world.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer(ctx, world) {
  const player = world.player;
  if (player.inCar) return; // the car drawing shows the driver
  drawPerson(ctx, player.x, player.y, player.angle, '#e8a33d', 12);
  // The pistol, pointed at the aim.
  ctx.strokeStyle = '#1d1a16';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(player.x + Math.cos(player.angle) * 24, player.y + Math.sin(player.angle) * 24);
  ctx.stroke();
  // Reloading ring.
  if (player.reloadTimer > 0) {
    ctx.strokeStyle = COLORS.hudAccent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 20, -Math.PI / 2, -Math.PI / 2 + (1 - player.reloadTimer / 1.1) * Math.PI * 2);
    ctx.stroke();
  }
}

// --- Day and night ------------------------------------------------------------

function drawLighting(ctx, hour) {
  // Golden hour warms the scene; night darkens it; dawn lifts it again.
  let overlay = null;
  if (hour >= 17 && hour < 19.5) {
    overlay = `rgba(255, 150, 60, ${0.10 + (hour - 17) * 0.04})`;
  } else if (hour >= 19.5 || hour < 5.5) {
    overlay = 'rgba(10, 16, 48, 0.34)';
  } else if (hour >= 5.5 && hour < 7.5) {
    overlay = `rgba(255, 170, 90, ${0.12 - (hour - 5.5) * 0.05})`;
  }
  if (overlay) {
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
}

// --- HUD ----------------------------------------------------------------------

function drawHud(ctx, world) {
  const player = world.player;
  const stars = wantedStars(world);
  const hour = world.hour;
  const hh = Math.floor(hour) % 24;
  const mm = Math.floor((hour % 1) * 60);
  const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

  // Top-left panel: cash, health, ammo, stars.
  ctx.fillStyle = COLORS.hudBg;
  roundRect(ctx, 16, 14, 250, 118, 10);
  ctx.fill();
  ctx.fillStyle = '#7ee081';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`$${world.money.toLocaleString('en-US')}`, 30, 46);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(30, 56, 180, 12);
  ctx.fillStyle = player.health > 30 ? '#7ee081' : '#ff5a4d';
  ctx.fillRect(30, 56, 180 * Math.max(0, player.health / 100), 12);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('HP', 216, 67);
  // Ammo.
  ctx.fillStyle = player.mag === 0 ? '#ff5a4d' : COLORS.hudText;
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText(`AMMO ${player.mag} / ${12}`, 30, 94);
  // Wanted stars.
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < stars ? '#ffd34d' : 'rgba(255,255,255,0.25)';
    drawStar(ctx, 34 + i * 26, 116, i < stars);
  }

  // Top-right: clock and district.
  ctx.fillStyle = COLORS.hudBg;
  roundRect(ctx, VIEW.width - 236, 14, 220, 62, 10);
  ctx.fill();
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(clock, VIEW.width - 30, 42);
  ctx.font = '14px Arial, sans-serif';
  ctx.fillStyle = '#c9c4b4';
  ctx.fillText(districtAt(player.x, player.y), VIEW.width - 30, 64);

  // Bottom-left: objective and messages.
  const objective = world.mission.active
    ? missionObjective(world.mission)
    : (currentMission(world.mission) ? 'Go to the yellow M at Mara\'s office — press E' : 'Story complete — free roam Cinder Bay');
  ctx.fillStyle = COLORS.hudBg;
  roundRect(ctx, 16, VIEW.height - 108, 470, 92, 10);
  ctx.fill();
  ctx.fillStyle = COLORS.hudAccent;
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('OBJECTIVE', 30, VIEW.height - 82);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = '15px Arial, sans-serif';
  ctx.fillText(objective.slice(0, 58), 30, VIEW.height - 58);
  let my = VIEW.height - 40;
  for (const msg of world.messages.slice(-2)) {
    ctx.fillStyle = '#d8d2c2';
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText(msg.text.slice(0, 60), 30, my);
    my += 16;
  }

  // Speedometer, only while driving.
  if (player.inCar) {
    const kmh = Math.round(Math.abs(player.inCar.speed) * 0.36);
    const carHealth = Math.max(0, Math.round(player.inCar.health));
    ctx.fillStyle = COLORS.hudBg;
    roundRect(ctx, VIEW.width - 190, VIEW.height - 96, 174, 80, 10);
    ctx.fill();
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'bold 34px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(kmh), VIEW.width - 176, VIEW.height - 40);
    ctx.font = '13px Arial, sans-serif';
    ctx.fillStyle = '#c9c4b4';
    ctx.fillText('km/h', VIEW.width - 96, VIEW.height - 40);
    // Car health as a bar along the bottom of the panel.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(VIEW.width - 176, VIEW.height - 30, 146, 8);
    ctx.fillStyle = carHealth > 30 ? '#7ee081' : '#ff5a4d';
    ctx.fillRect(VIEW.width - 176, VIEW.height - 30, 146 * (carHealth / 100), 8);
    ctx.fillStyle = '#c9c4b4';
    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`CAR ${carHealth}%`, VIEW.width - 30, VIEW.height - 62);
  }

  // Controls hint, small.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('WASD drive / walk · E enter car · Click shoot · R reload · P pause · M mute', 16, VIEW.height - 8);
}

function drawStar(ctx, x, y, lit) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = lit ? '#ffd34d' : 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const a2 = a + Math.PI / 5;
    ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
    ctx.lineTo(Math.cos(a2) * 4, Math.sin(a2) * 4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// --- Minimap ------------------------------------------------------------------

function drawMinimap(ctx, world) {
  const mw = 210;
  const mh = 158;
  const mx = VIEW.width - mw - 16;
  const my = 88;
  const sx = mw / WORLD.width;
  const sy = mh / WORLD.height;

  ctx.fillStyle = 'rgba(8, 10, 16, 0.8)';
  roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  // Land and sea.
  ctx.fillStyle = '#3f6b35';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = '#2b6ea6';
  ctx.fillRect(mx + BEACH_X * sx, my, (WORLD.width - BEACH_X) * sx, mh);
  // Roads.
  ctx.fillStyle = '#6a6d78';
  for (const ax of AVENUES) ctx.fillRect(mx + ax * sx - 2, my, 4, mh);
  for (const sy2 of STREETS) ctx.fillRect(mx, my + sy2 * sy - 2, mw, 4);
  // Mission blip.
  const target = missionTarget(world.mission);
  if (world.mission.active && target) {
    ctx.fillStyle = COLORS.mission;
    ctx.beginPath();
    ctx.arc(mx + target.x * sx, my + target.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (!world.mission.active && currentMission(world.mission)) {
    ctx.fillStyle = COLORS.mission;
    ctx.beginPath();
    ctx.arc(mx + MARA_OFFICE.x * sx, my + MARA_OFFICE.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police blips.
  ctx.fillStyle = COLORS.police;
  for (const car of world.cars) {
    if (!car.police) continue;
    ctx.beginPath();
    ctx.arc(mx + car.x * sx, my + car.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Enemy blips.
  ctx.fillStyle = COLORS.enemy;
  for (const e of world.enemies) {
    ctx.beginPath();
    ctx.arc(mx + e.x * sx, my + e.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // The player, a white arrow that turns with them.
  const player = world.player;
  const focus = player.inCar ?? player;
  ctx.save();
  ctx.translate(mx + focus.x * sx, my + focus.y * sy);
  ctx.rotate(focus.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// --- Screens --------------------------------------------------------------------

function drawTitle(ctx, world, hasSave) {
  ctx.fillStyle = 'rgba(8, 10, 16, 0.55)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 84px Georgia, serif';
  ctx.fillText('CINDER BAY', VIEW.width / 2, 210);
  ctx.fillStyle = '#f2f0e6';
  ctx.font = 'italic 26px Georgia, serif';
  ctx.fillText('A coastal city. Five jobs. One way out — the fast way.', VIEW.width / 2, 258);
  ctx.font = '18px Arial, sans-serif';
  ctx.fillStyle = '#d8d2c2';
  ctx.fillText('Reno Vega is back in town, and fixer Mara Quinn has work for him.', VIEW.width / 2, 300);
  ctx.fillText('Steal cars, run the jobs, earn the cash, stay ahead of the CBPD.', VIEW.width / 2, 328);
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText('Press ENTER to start', VIEW.width / 2, 420);
  if (hasSave) {
    ctx.fillStyle = '#f2f0e6';
    ctx.font = '18px Arial, sans-serif';
    ctx.fillText('Press C to continue your saved game', VIEW.width / 2, 452);
  }
  ctx.fillStyle = '#9a958a';
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText('WASD move / drive · E steal & enter cars · Mouse aim, click shoot · R reload · P pause · M mute', VIEW.width / 2, 560);
  ctx.fillText('An original game. Not affiliated with Rockstar Games or Grand Theft Auto.', VIEW.width / 2, 586);
}

function drawPause(ctx) {
  ctx.fillStyle = 'rgba(8, 10, 16, 0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f0e6';
  ctx.font = 'bold 48px Georgia, serif';
  ctx.fillText('PAUSED', VIEW.width / 2, VIEW.height / 2 - 20);
  ctx.font = '18px Arial, sans-serif';
  ctx.fillText('Press P or Esc to keep playing', VIEW.width / 2, VIEW.height / 2 + 20);
}

function drawEndScreen(ctx, title, line) {
  ctx.fillStyle = 'rgba(20, 4, 6, 0.62)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5a4d';
  ctx.font = 'bold 72px Georgia, serif';
  ctx.fillText(title, VIEW.width / 2, VIEW.height / 2 - 20);
  ctx.fillStyle = '#f2f0e6';
  ctx.font = '18px Arial, sans-serif';
  ctx.fillText(line, VIEW.width / 2, VIEW.height / 2 + 24);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
