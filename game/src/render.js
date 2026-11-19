// Drawing only: the world's state and the current screen in, pixels out.
// The camera looks at a window of the pre-painted static city; cars, people,
// particles and the HUD are drawn on top. All HUD text is canvas text with
// system fonts — no webfonts, no network.
import { CAR, COLORS, LANDMARKS, PLAYER, WEAPON, WORLD } from './config.js';
import { daylightTint } from './world.js';
import { districtAtName } from './city.js';
import { missionMarker, missionObjectiveText } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, -24, -10, 50, 24, 7);
  ctx.fill();
  ctx.translate(-2, -2);
  if (car.dead) {
    ctx.fillStyle = '#222';
    roundRect(ctx, -24, -12, 48, 24, 7);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = car.color;
  roundRect(ctx, -24, -12, 48, 24, 7);
  ctx.fill();
  // Roof and windows.
  ctx.fillStyle = 'rgba(20,30,40,0.85)';
  roundRect(ctx, -8, -10, 18, 20, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,220,235,0.7)';
  ctx.fillRect(-22, -10, 6, 20);
  ctx.fillRect(14, -10, 6, 20);
  // Headlights and taillights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(22, -10, 3, 5);
  ctx.fillRect(22, 5, 3, 5);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-25, -10, 3, 5);
  ctx.fillRect(-25, 5, 3, 5);
  if (car.kind === 'police') {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-6, -12, 12, 24);
    ctx.fillStyle = '#1c2733';
    ctx.font = 'bold 7px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('SCPD', 0, 2);
    const flashing = Math.sin(time * 9 + car.lightPhase) > 0;
    ctx.fillStyle = flashing ? '#ff2d2d' : '#2d7dff';
    ctx.beginPath();
    ctx.arc(-2, -13, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flashing ? '#2d7dff' : '#ff2d2d';
    ctx.beginPath();
    ctx.arc(6, -13, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (car.hp < 40) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -24, -12, 48, 24, 7);
    ctx.fill();
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, color, bob, armed, isPlayer) {
  ctx.save();
  ctx.translate(x, y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  const wobble = Math.sin(bob) * 1.5;
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, isPlayer ? 12 : 10, 0, Math.PI * 2);
  ctx.fill();
  // Shoulders / arms hint.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-4, -8 + wobble, 8, 3);
  ctx.fillRect(-4, 5 - wobble, 8, 3);
  // Head.
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath();
  ctx.arc(3, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();
  if (armed) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(20, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWorld(ctx, state, viewW, viewH) {
  const cam = state.camera;
  const shakeX = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
  const shakeY = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
  ctx.save();
  ctx.translate(viewW / 2 + shakeX, viewH / 2 + shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // Static city.
  ctx.drawImage(state.staticCanvas, 0, 0);

  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,20,0.5)';
  ctx.lineWidth = 4;
  for (const s of state.skids) {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }

  // Pickups.
  for (const pk of state.pickups) {
    const bobY = Math.sin(pk.bob) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bobY);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(-7, -2.5, 14, 5);
      ctx.fillRect(-2.5, -7, 5, 14);
    } else {
      ctx.fillStyle = '#f39c12';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.font = 'bold 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AMMO', 0, 1);
    }
    ctx.restore();
  }

  // Mission marker: a bouncing beacon plus a column of light.
  const marker = missionMarker(state);
  if (marker) {
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
    ctx.fillRect(-14, -90, 28, 90);
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(0, -6, 12 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(marker.label, 0, -6);
    ctx.restore();
  }

  // Cars, people, cops, gang.
  for (const car of state.cars) {
    if (car.dead && car.kind !== 'player') {
      // Burnt-out wrecks stay visible a while.
      drawCarShape(ctx, car, state.time);
      continue;
    }
    drawCarShape(ctx, car, state.time);
  }
  for (const ped of state.peds) {
    if (ped.state === 'down') {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 7, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, ped.bob, false, false);
  }
  for (const cop of state.cops) {
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#1c3a5c', state.time * 8, false, false);
    // Badge dot.
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cop.x, cop.y - 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const e of state.enemies) {
    drawPerson(ctx, e.x, e.y, e.angle, '#8e2f2f', state.time * 8, true, false);
    // Health pip.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - 12, e.y - 22, 24, 4);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(e.x - 12, e.y - 22, 24 * Math.max(0, e.hp / 60), 4);
  }

  // The player.
  const p = state.player;
  if (!state.playerCar) {
    const blink = p.invulnerable > 0 && Math.floor(state.time * 12) % 2 === 0;
    if (!blink) drawPerson(ctx, p.x, p.y, p.aimAngle, '#0e7c86', state.time * 8, true, true);
    // Aim line, short and subtle.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.aimAngle) * 22, p.y + Math.sin(p.aimAngle) * 22);
    ctx.lineTo(p.x + Math.cos(p.aimAngle) * 44, p.y + Math.sin(p.aimAngle) * 44);
    ctx.stroke();
  }

  // Particles.
  for (const pt of state.particles) {
    const alpha = 1 - pt.life / pt.maxLife;
    if (pt.type === 'tracer') {
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = pt.size;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x2, pt.y2);
      ctx.stroke();
    } else if (pt.type === 'flash') {
      ctx.fillStyle = `rgba(255, 224, 102, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (1 + pt.life * 8), 0, Math.PI * 2);
      ctx.fill();
    } else if (pt.type === 'smoke') {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = alpha * 0.8;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  // Daylight tint + vignette, in screen space.
  const tint = daylightTint(state.clock);
  ctx.fillStyle = `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${tint[3]})`;
  ctx.fillRect(0, 0, viewW, viewH);
  const vig = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.45, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, viewW, viewH);
}

function drawStars(ctx, wanted, x, y) {
  ctx.font = '28px ' + FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < wanted ? '#ffd700' : 'rgba(255,255,255,0.25)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText('★', x + i * 30, y);
    ctx.fillText('★', x + i * 30, y);
  }
}

function formatClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function drawHud(ctx, state, viewW, viewH) {
  const p = state.player;
  ctx.textBaseline = 'alphabetic';

  // Top-left: cash and health.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, 14, 12, 210, 62, 10);
  ctx.fill();
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 26px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillText(`$${state.money.toLocaleString('en-US')}`, 26, 40);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(ctx, 26, 50, 186, 12, 6);
  ctx.fill();
  ctx.fillStyle = state.health > 30 ? '#2ecc71' : '#e74c3c';
  roundRect(ctx, 26, 50, 186 * Math.max(0, state.health / PLAYER.maxHealth), 12, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px ' + FONT;
  ctx.fillText('HEALTH', 26, 47);
  // Ammo under health when on foot.
  if (!state.playerCar) {
    ctx.fillStyle = p.reloading ? '#f39c12' : '#fff';
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText(p.reloading ? 'RELOADING…' : `PISTOL  ${p.ammo} / ${WEAPON.pistol.mag}`, 26, 92);
  }

  // Top-right: wanted stars, clock, district.
  drawStars(ctx, state.wanted, viewW - 176, 44);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px ' + FONT;
  ctx.textAlign = 'right';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 4;
  ctx.strokeText(formatClock(state.clock), viewW - 26, 72);
  ctx.fillText(formatClock(state.clock), viewW - 26, 72);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '14px ' + FONT;
  ctx.strokeText(districtAtName(state.city, p.x, p.y), viewW - 26, 92);
  ctx.fillText(districtAtName(state.city, p.x, p.y), viewW - 26, 92);

  // Top-centre: mission objective.
  const objective = missionObjectiveText(state);
  ctx.font = 'bold 16px ' + FONT;
  const objW = Math.min(viewW - 480, ctx.measureText(objective).width + 36);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, (viewW - objW) / 2, 12, objW, 34, 8);
  ctx.fill();
  ctx.fillStyle = state.mission ? '#ffd700' : '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(objective, viewW / 2, 35);
  if (state.mission) {
    const stage = state.mission.def.stages[state.mission.stageIndex];
    const parts = [];
    if (stage && stage.time) parts.push(`⏱ ${Math.max(0, Math.ceil(state.mission.timer))}s`);
    parts.push(`JOB ${state.mission.index + 1}/5 · ${state.mission.def.title}`);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '13px ' + FONT;
    ctx.fillText(parts.join('   '), viewW / 2, 62);
  }

  // Centre toast message.
  if (state.message && state.time < state.messageUntil) {
    ctx.font = 'bold 20px ' + FONT;
    const w = ctx.measureText(state.message).width + 32;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, (viewW - w) / 2, 84, w, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(state.message, viewW / 2, 107);
  }

  // Dialogue subtitle.
  if (state.dialogue && state.time < state.dialogue.until) {
    const text = `${state.dialogue.speaker}: ${state.dialogue.text}`;
    ctx.font = '16px ' + FONT;
    const w = Math.min(viewW - 80, ctx.measureText(text).width + 36);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, (viewW - w) / 2, viewH - 118, w, 40, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.fillText(text, viewW / 2, viewH - 92);
  }

  // Bottom-left: controls hint / speedometer.
  ctx.textAlign = 'left';
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  if (state.playerCar) {
    const kmh = Math.round(Math.abs(state.playerCar.speed) * 0.36);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, 14, viewH - 84, 190, 70, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px ' + FONT;
    ctx.fillText(`${kmh}`, 26, viewH - 44);
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('km/h', 92, viewH - 44);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(ctx, 26, viewH - 32, 166, 8, 4);
    ctx.fill();
    ctx.fillStyle = state.playerCar.hp > 30 ? '#2ecc71' : '#e74c3c';
    roundRect(ctx, 26, viewH - 32, 166 * Math.max(0, Math.min(1, state.playerCar.hp / CAR.maxHp)), 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '13px ' + FONT;
    ctx.fillText('WASD drive · Space brake · E exit · Click horn', 14, viewH - 96);
  } else {
    ctx.fillText('WASD move · Shift run · E enter car · Mouse aim, Click shoot · R reload · P pause', 14, viewH - 16);
  }

  drawMinimap(ctx, state, viewW, viewH);

  // Crosshair when on foot.
  if (!state.playerCar && state.screen === 'play') {
    const mx = state._mouseX || viewW / 2;
    const my = state._mouseY || viewH / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - 14, my);
    ctx.lineTo(mx - 6, my);
    ctx.moveTo(mx + 6, my);
    ctx.lineTo(mx + 14, my);
    ctx.moveTo(mx, my - 14);
    ctx.lineTo(mx, my - 6);
    ctx.moveTo(mx, my + 6);
    ctx.lineTo(mx, my + 14);
    ctx.stroke();
  }
}

function drawMinimap(ctx, state, viewW, viewH) {
  const mw = 220;
  const mh = 150;
  const x = viewW - mw - 16;
  const y = viewH - mh - 16;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, x - 6, y - 6, mw + 12, mh + 12, 10);
  ctx.fill();
  ctx.beginPath();
  roundRect(ctx, x, y, mw, mh, 6);
  ctx.clip();
  ctx.drawImage(state.minimapCanvas, x, y);
  const sx = mw / WORLD.width;
  const sy = mh / WORLD.height;
  // Safehouse.
  ctx.fillStyle = '#2ecc71';
  ctx.fillRect(x + LANDMARKS.safehouse.x * sx - 3, y + LANDMARKS.safehouse.y * sy - 3, 6, 6);
  // Mission marker.
  const marker = missionMarker(state);
  if (marker) {
    const pulse = 4 + Math.sin(state.time * 5) * 1.5;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(x + marker.x * sx, y + marker.y * sy, pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police blips.
  for (const car of state.cars) {
    if (car.kind !== 'police' || car.dead) continue;
    ctx.fillStyle = Math.sin(state.time * 9) > 0 ? '#ff2d2d' : '#2d7dff';
    ctx.beginPath();
    ctx.arc(x + car.x * sx, y + car.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Enemies.
  ctx.fillStyle = '#e74c3c';
  for (const e of state.enemies) {
    ctx.fillRect(x + e.x * sx - 2, y + e.y * sy - 2, 4, 4);
  }
  // Player arrow.
  const p = state.player;
  ctx.save();
  ctx.translate(x + p.x * sx, y + p.y * sy);
  ctx.rotate(state.playerCar ? state.playerCar.angle : p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Viewport rectangle.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  const vw = (viewW / state.camera.zoom) * sx;
  const vh = (viewH / state.camera.zoom) * sy;
  ctx.strokeRect(x + (state.camera.x - viewW / 2 / state.camera.zoom) * sx, y + (state.camera.y - viewH / 2 / state.camera.zoom) * sy, vw, vh);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = 'bold 11px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillText('SOLMAR CITY', x, y - 10);
}

function drawPanel(ctx, viewW, viewH, title, lines, prompt, accent) {
  ctx.fillStyle = 'rgba(8,10,16,0.72)';
  ctx.fillRect(0, 0, viewW, viewH);
  const w = 640;
  const h = 150 + lines.length * 30;
  const x = (viewW - w) / 2;
  const y = (viewH - h) / 2;
  ctx.fillStyle = 'rgba(16,20,28,0.92)';
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = accent || '#ffd700';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = accent || '#ffd700';
  ctx.font = 'bold 44px ' + FONT;
  ctx.fillText(title, viewW / 2, y + 72);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '17px ' + FONT;
  lines.forEach((line, i) => {
    ctx.fillText(line, viewW / 2, y + 118 + i * 30);
  });
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 17px ' + FONT;
  ctx.fillText(prompt, viewW / 2, y + h - 26);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = window.innerWidth;
  let viewH = window.innerHeight;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * ratio);
    canvas.height = Math.round(viewH * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function drawTitle(state) {
    // Slow pan over the city as the backdrop.
    state.camera.x = 1500 + Math.sin(state.time * 0.05) * 500;
    state.camera.y = 1100 + Math.cos(state.time * 0.04) * 300;
    state.camera.zoom = 0.62;
    drawWorld(ctx, state, viewW, viewH);
    ctx.fillStyle = 'rgba(8,10,16,0.45)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 84px ' + FONT;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.fillText('SOLMAR CITY', viewW / 2, viewH * 0.3);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = '22px ' + FONT;
    ctx.fillText('A sun-soaked open-world crime story', viewW / 2, viewH * 0.3 + 40);
    const items = state.hasSave
      ? ['▶  NEW GAME', '↻  CONTINUE', '?  HOW TO PLAY']
      : ['▶  NEW GAME', '?  HOW TO PLAY'];
    const startY = viewH * 0.46;
    items.forEach((item, i) => {
      const selected = i === state.menuIndex;
      if (selected) {
        ctx.fillStyle = 'rgba(255,215,0,0.9)';
        roundRect(ctx, viewW / 2 - 210, startY + i * 52 - 30, 420, 42, 8);
        ctx.fill();
        ctx.fillStyle = '#111';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
      }
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillText(item, viewW / 2, startY + i * 52);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '15px ' + FONT;
    ctx.fillText('WASD move · E steal & drive · Mouse aim, click shoot · 5 story jobs · Wanted stars · SCPD chases', viewW / 2, viewH - 64);
    ctx.fillText('An original fan-made game. Not affiliated with Rockstar Games or Grand Theft Auto.', viewW / 2, viewH - 38);
  }

  function drawHowTo(state) {
    const lines = [
      'WASD / Arrows — move on foot, drive in a car',
      'Shift — run    ·    Space — handbrake',
      'E — steal / enter a car, E again to get out',
      'Mouse — aim    ·    Click — shoot    ·    R — reload',
      'P / Esc — pause    ·    M — mute',
      '',
      'Steal cars, take jobs from Lena at the garage (L),',
      'earn cash, and stay ahead of the SCPD wanted stars.',
      'Getting busted or wasted costs you cash — and the job.',
    ];
    drawPanel(ctx, viewW, viewH, 'HOW TO PLAY', lines, 'Press Enter or click to go back', '#2ecc71');
  }

  /** Paint one frame for the screen the game is on. */
  function draw(state) {
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, viewW, viewH);
    if (state.screen === 'title') {
      drawTitle(state);
      return;
    }
    if (state.screen === 'howto') {
      drawWorld(ctx, state, viewW, viewH);
      drawHowTo(state);
      return;
    }
    drawWorld(ctx, state, viewW, viewH);
    if (state.screen === 'play') {
      drawHud(ctx, state, viewW, viewH);
    } else if (state.screen === 'paused') {
      drawHud(ctx, state, viewW, viewH);
      const lines = [
        `Cash $${state.money.toLocaleString('en-US')}  ·  Jobs done ${state.missionsDone}/5  ·  Cars stolen ${state.stats.carsStolen}`,
        '',
        'M — mute sound',
        'Your progress autosaves every 20 seconds.',
      ];
      drawPanel(ctx, viewW, viewH, 'PAUSED', lines, 'Press P to resume', '#ffd700');
    } else if (state.screen === 'busted' || state.screen === 'wasted') {
      const lines = [
        state.overReason === 'BUSTED'
          ? 'The SCPD caught up with you. Bail and fines were taken from your cash.'
          : 'Solmar General patched you up. The hospital bill was taken from your cash.',
        `Cash left: $${state.money.toLocaleString('en-US')}`,
      ];
      drawPanel(ctx, viewW, viewH, state.overReason, lines, 'Press Enter to get back out there', '#e74c3c');
    }
  }

  return { draw, resize };
}

// Re-exported for the HUD: the district name at a world point.
export { districtAtName };
