// Solmar Bay — everything the player sees: the city from above, the cars
// and people on it, the HUD, the minimap, and the title/pause/end screens.
import { CFG } from './config.js';
import { wantedStars } from './world.js';
import { missionObjective, missionTarget, currentMission, FIXER } from './missions.js';
import { districtAt } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

export function formatTime(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
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

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, dpr: 1, cw: CFG.VIEW_W, ch: CFG.VIEW_H };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    view.dpr = dpr;
    view.cw = cw;
    view.ch = ch;
    view.scale = Math.min(cw / CFG.VIEW_W, ch / CFG.VIEW_H);
    view.ox = (cw - CFG.VIEW_W * view.scale) / 2;
    view.oy = (ch - CFG.VIEW_H * view.scale) / 2;
  }

  function nightFactor(time) {
    if (time < 5.5 || time >= 19.5) return 1;
    if (time < 7) return 1 - (time - 5.5) / 1.5;
    if (time >= 17 && time < 19.5) return (time - 17) / 2.5;
    return 0;
  }

  function drawGround(world) {
    const C = CFG.COLORS;
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, 0, CFG.WORLD_W, CFG.WORLD_H);
    // Mow stripes for texture.
    ctx.fillStyle = C.grassDark;
    for (let y = 0; y < CFG.WORLD_H; y += 160) ctx.fillRect(0, y, CFG.WORLD_W, 6);
    // Beach + sea on the east edge.
    ctx.fillStyle = C.sand;
    ctx.fillRect(CFG.SAND_X, 0, CFG.SEA_X - CFG.SAND_X, CFG.WORLD_H);
    ctx.fillStyle = C.sea;
    ctx.fillRect(CFG.SEA_X, 0, CFG.WORLD_W - CFG.SEA_X, CFG.WORLD_H);
    ctx.fillStyle = C.seaDeep;
    for (let y = 40; y < CFG.WORLD_H; y += 180) ctx.fillRect(CFG.SEA_X + 12, y, CFG.WORLD_W - CFG.SEA_X - 24, 4);
  }

  function drawRoads() {
    const C = CFG.COLORS;
    const h = CFG.ROAD_W / 2;
    // Sidewalk border, then asphalt.
    ctx.fillStyle = C.sidewalk;
    for (const ax of CFG.AVENUES) ctx.fillRect(ax - h - CFG.SIDEWALK, 0, CFG.ROAD_W + CFG.SIDEWALK * 2, CFG.WORLD_H);
    for (const sy of CFG.STREETS) ctx.fillRect(0, sy - h - CFG.SIDEWALK, CFG.WORLD_W, CFG.ROAD_W + CFG.SIDEWALK * 2);
    ctx.fillStyle = C.road;
    for (const ax of CFG.AVENUES) ctx.fillRect(ax - h, 0, CFG.ROAD_W, CFG.WORLD_H);
    for (const sy of CFG.STREETS) ctx.fillRect(0, sy - h, CFG.WORLD_W, CFG.ROAD_W);
    // Dashed centre lines.
    ctx.fillStyle = C.roadLine;
    for (const ax of CFG.AVENUES) {
      for (let y = 10; y < CFG.WORLD_H; y += 56) ctx.fillRect(ax - 2, y, 4, 28);
    }
    for (const sy of CFG.STREETS) {
      for (let x = 10; x < CFG.WORLD_W; x += 56) ctx.fillRect(x, sy - 2, 28, 4);
    }
  }

  function drawCity(world) {
    const city = world.city;
    const C = CFG.COLORS;
    for (const park of city.parks) {
      ctx.fillStyle = C.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      if (park.pond) {
        ctx.fillStyle = '#2a7ab8';
        ctx.beginPath();
        ctx.arc(park.pond.x, park.pond.y, park.pond.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const t of park.trees) {
        ctx.fillStyle = C.tree;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.treeLight;
        ctx.beginPath();
        ctx.arc(t.x - 2, t.y - 2, t.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Marina docks + boats.
    ctx.fillStyle = C.marina;
    ctx.fillRect(city.marina.x - 6, city.marina.y, city.marina.w, city.marina.h);
    for (const d of city.marina.docks) {
      ctx.fillStyle = C.dock;
      ctx.fillRect(d.x, d.y, d.w, d.h);
    }
    for (const b of city.marina.boats) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = b.color;
      roundRect(ctx, -16, -6, 32, 12, 5);
      ctx.fill();
      ctx.restore();
    }
    // Lighthouse.
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(city.lighthouse.x, city.lighthouse.y, city.lighthouse.w, city.lighthouse.h);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(city.lighthouse.x, city.lighthouse.y + 8, city.lighthouse.w, 6);
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(city.lighthouse.x + 13, city.lighthouse.y + 13, 5, 0, Math.PI * 2);
    ctx.fill();
    // Buildings.
    for (const b of city.buildings) {
      ctx.fillStyle = b.hue || C.building;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = C.buildingRoof;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 6);
      if (b.name) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, b.x + b.w / 2, b.y - 8);
      }
    }
  }

  function drawCarShape(car) {
    const L = CFG.CAR.LENGTH;
    const W = CFG.CAR.WIDTH;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (car.crashed) {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#222';
    } else {
      ctx.fillStyle = car.color;
    }
    roundRect(ctx, -L / 2, -W / 2, L, W, 7);
    ctx.fill();
    // Windshield + roof.
    ctx.fillStyle = car.crashed ? '#333' : '#1c2733';
    ctx.fillRect(-L * 0.18, -W / 2 + 3, L * 0.22, W - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-L / 2 + 4, -W / 2 + 3, 8, W - 6);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(L / 2 - 2, -W / 2 + 3, 3, 5);
    ctx.fillRect(L / 2 - 2, W / 2 - 8, 3, 5);
    if (car.type === 'police' && !car.crashed) {
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(-6, -W / 2 + 2, 10, 4);
      ctx.fillStyle = '#2f7bff';
      ctx.fillRect(-6, W / 2 - 6, 10, 4);
    }
    ctx.restore();
  }

  function drawWorld(world) {
    const C = CFG.COLORS;
    drawGround(world);
    drawRoads(world);
    drawCity(world);
    // Skid marks.
    ctx.strokeStyle = 'rgba(20,20,20,0.55)';
    ctx.lineWidth = 4;
    for (const s of world.skids) {
      ctx.globalAlpha = Math.min(1, s.life / 3);
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 12, s.y - Math.sin(s.angle) * 12);
      ctx.lineTo(s.x + Math.cos(s.angle) * 12, s.y + Math.sin(s.angle) * 12);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Mission marker (pulsing ring + diamond).
    const target = missionTarget(world.progress);
    if (target && world.screen === 'play') {
      const pulse = 1 + 0.12 * Math.sin(world.elapsed * 5);
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(target.x, target.y, (target.r || 60) * 0.55 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd34d';
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-7, -7, 14, 14);
      ctx.restore();
    }
    // Fixer marker when no mission is active.
    if (!world.progress.started && world.screen === 'play') {
      ctx.fillStyle = '#7dff8a';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('D', FIXER.x, FIXER.y);
      ctx.strokeStyle = '#7dff8a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(FIXER.x, FIXER.y, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Cars.
    for (const car of world.cars) drawCarShape(car);
    // Pedestrians.
    for (const ped of world.peds) {
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, ped.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ped.x, ped.y);
      ctx.lineTo(ped.x + Math.cos(ped.dir) * 14, ped.y + Math.sin(ped.dir) * 14);
      ctx.stroke();
    }
    // Foot cops.
    for (const cop of world.footCops) {
      ctx.fillStyle = C.police;
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, cop.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('P', cop.x, cop.y + 4);
    }
    // Enemies.
    for (const e of world.enemies) {
      ctx.fillStyle = C.enemy;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff8a7a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.angle) * 20, e.y + Math.sin(e.angle) * 20);
      ctx.stroke();
    }
    // Bullets.
    ctx.fillStyle = '#ffe9a8';
    for (const b of world.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Particles.
    for (const pt of world.particles) {
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Player (on foot only — in a car the car is the player).
    const p = world.player;
    if (!p.inCar) {
      ctx.fillStyle = C.player;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22);
      ctx.stroke();
      ctx.fillStyle = '#2e86c1';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLighting(world) {
    const nf = nightFactor(world.time);
    if (nf > 0.02) {
      ctx.fillStyle = 'rgba(10,12,46,' + (nf * 0.42).toFixed(3) + ')';
      ctx.fillRect(world.camera.x, world.camera.y, CFG.VIEW_W, CFG.VIEW_H);
      // Street lights glow at night.
      ctx.fillStyle = 'rgba(255,214,120,0.85)';
      for (const ax of CFG.AVENUES) {
        for (const sy of CFG.STREETS) {
          ctx.beginPath();
          ctx.arc(ax, sy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (world.time >= 16.5 && world.time < 19.5) {
      ctx.fillStyle = 'rgba(255,150,60,0.10)';
      ctx.fillRect(world.camera.x, world.camera.y, CFG.VIEW_W, CFG.VIEW_H);
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
  }

  function drawHud(world) {
    const p = world.player;
    const stars = wantedStars(world);
    ctx.textAlign = 'left';
    // Top-left: money / HP / ammo / wanted.
    panel(14, 12, 250, 108);
    ctx.fillStyle = '#7dff8a';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('$' + world.money, 26, 40);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText('HP', 26, 64);
    ctx.fillStyle = '#333';
    ctx.fillRect(52, 53, 120, 12);
    ctx.fillStyle = p.hp > 40 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(52, 53, Math.max(0, 120 * p.hp / 100), 12);
    ctx.fillStyle = '#fff';
    ctx.fillText('Ammo ' + p.mag + '/' + CFG.MAG_SIZE + (p.reloadT > 0 ? ' …' : ''), 26, 88);
    ctx.font = '20px sans-serif';
    let starText = '';
    for (let i = 0; i < CFG.MAX_STARS; i++) starText += i < stars ? '★' : '☆';
    ctx.fillStyle = stars > 0 ? '#ffd34d' : '#888';
    ctx.fillText(starText, 26, 110);
    // Top-right: clock + district.
    panel(CFG.VIEW_W - 264, 12, 250, 52);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(world.time), CFG.VIEW_W - 28, 34);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#cfe8ff';
    ctx.fillText(districtAt(p.x, p.y), CFG.VIEW_W - 28, 54);
    ctx.textAlign = 'left';
    // Bottom-left: objective + message.
    const obj = missionObjective(world.progress);
    panel(14, CFG.VIEW_H - 96, 560, 82);
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(obj, 26, CFG.VIEW_H - 68);
    if (world.msgT > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      ctx.fillText(world.msg, 26, CFG.VIEW_H - 42);
    }
    // Bottom-right: speedometer while driving.
    if (p.inCar) {
      const car = p.inCar;
      panel(CFG.VIEW_W - 224, CFG.VIEW_H - 96, 210, 82);
      const kmh = Math.round(Math.abs(car.speed) * 0.36);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(kmh + ' km/h', CFG.VIEW_W - 28, CFG.VIEW_H - 58);
      ctx.font = '13px sans-serif';
      ctx.fillText('Car HP ' + Math.max(0, Math.round(car.hp)), CFG.VIEW_W - 28, CFG.VIEW_H - 34);
      ctx.textAlign = 'left';
    }
    // Hint line.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WASD move · E enter car · Click shoot · R reload · Space handbrake · P pause · M mute', CFG.VIEW_W / 2, CFG.VIEW_H - 8);
    ctx.textAlign = 'left';
  }

  function drawMinimap(world) {
    const mw = CFG.MINIMAP_W;
    const mh = CFG.MINIMAP_H;
    const mx = CFG.VIEW_W - mw - 14;
    const my = 76;
    const sx = mw / CFG.WORLD_W;
    const sy = mh / CFG.WORLD_H;
    panel(mx - 6, my - 6, mw + 12, mh + 12);
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    ctx.fillStyle = '#234d2a';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#1d6f9e';
    ctx.fillRect(mx + CFG.SEA_X * sx, my, mw - CFG.SEA_X * sx, mh);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    for (const ax of CFG.AVENUES) {
      ctx.beginPath();
      ctx.moveTo(mx + ax * sx, my);
      ctx.lineTo(mx + ax * sx, my + mh);
      ctx.stroke();
    }
    for (const st of CFG.STREETS) {
      ctx.beginPath();
      ctx.moveTo(mx, my + st * sy);
      ctx.lineTo(mx + mw, my + st * sy);
      ctx.stroke();
    }
    const dot = (x, y, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const target = missionTarget(world.progress);
    if (target) dot(target.x, target.y, '#ffd34d', 5);
    for (const c of world.cars) if (c.type === 'police') dot(c.x, c.y, '#2f7bff', 3);
    for (const e of world.enemies) dot(e.x, e.y, '#ff3b30', 3);
    // Player arrow.
    const p = world.player;
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawCenter(lines, y0) {
    ctx.textAlign = 'center';
    lines.forEach((ln, i) => {
      ctx.fillStyle = ln.color || '#fff';
      ctx.font = ln.font || '16px sans-serif';
      ctx.fillText(ln.text, CFG.VIEW_W / 2, y0 + i * ln.gap);
    });
    ctx.textAlign = 'left';
  }

  function drawTitle(world) {
    ctx.fillStyle = '#0d1526';
    ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
    ctx.fillStyle = '#1d6f9e';
    ctx.fillRect(0, CFG.VIEW_H - 120, CFG.VIEW_W, 120);
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(0, CFG.VIEW_H - 126, CFG.VIEW_W, 6);
    drawCenter([
      { text: 'SOLMAR BAY', font: 'bold 84px sans-serif', color: '#ffd34d', gap: 96 },
      { text: 'An original open-world crime game', font: '22px sans-serif', color: '#cfe8ff', gap: 40 },
      { text: 'Juno Reyes owes fixer Dario Vane a favour — and Vane collects in jobs, not cash.', font: '16px sans-serif', gap: 34 },
      { text: 'ENTER — Start    ·    C — Continue saved game', font: 'bold 18px sans-serif', color: '#7dff8a', gap: 44 },
      { text: 'WASD move · Shift run · E enter / steal car · Click shoot · R reload', font: '15px sans-serif', gap: 30 },
      { text: 'Space handbrake · P pause · M mute', font: '15px sans-serif', gap: 30 },
      { text: 'Not affiliated with Rockstar Games or Grand Theft Auto.', font: '13px sans-serif', color: '#9aa5b1', gap: 30 },
    ], 150);
  }

  function drawPause(world) {
    ctx.fillStyle = 'rgba(5,8,16,0.72)';
    ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
    drawCenter([
      { text: 'PAUSED', font: 'bold 56px sans-serif', color: '#ffd34d', gap: 70 },
      { text: 'P / Esc — resume', font: '18px sans-serif', gap: 36 },
      { text: 'Progress autosaves every few seconds.', font: '15px sans-serif', color: '#9aa5b1', gap: 30 },
    ], 280);
  }

  function drawEnd(world, kind) {
    const busted = kind === SCREEN_BUSTED;
    ctx.fillStyle = busted ? 'rgba(10,20,60,0.82)' : 'rgba(60,10,10,0.82)';
    ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
    drawCenter([
      { text: busted ? 'BUSTED!' : 'WASTED', font: 'bold 72px sans-serif', color: busted ? '#7db8ff' : '#ff5a4d', gap: 88 },
      { text: busted ? 'The Solmar Bay police hauled you in.' : 'Juno went down in Solmar Bay.', font: '18px sans-serif', gap: 36 },
      { text: 'ENTER — try again from your last save', font: 'bold 17px sans-serif', color: '#7dff8a', gap: 40 },
    ], 280);
  }

  function render(world) {
    resize();
    const dpr = view.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, view.cw, view.ch);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    if (world.screen === SCREEN_TITLE) {
      drawTitle(world);
    } else {
      ctx.save();
      ctx.translate(-world.camera.x, -world.camera.y);
      drawWorld(world);
      drawLighting(world);
      ctx.restore();
      if (world.screen === SCREEN_PLAY) {
        drawHud(world);
        drawMinimap(world);
      } else if (world.screen === SCREEN_PAUSED) {
        drawHud(world);
        drawMinimap(world);
        drawPause(world);
      } else {
        drawHud(world);
        drawEnd(world, world.screen);
      }
    }
    ctx.restore();
  }

  return { render, resize, view };
}
