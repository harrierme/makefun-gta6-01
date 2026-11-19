// Solmar City itself: the road grid, the blocks between them, the buildings,
// the beach and ocean, the park and the marina. Generation is seeded, so one
// seed always builds the same city. The static ground (roads, blocks, roofs,
// palms, lamps) is painted once into a big offscreen canvas; the renderer
// draws a window of it each frame, and the dynamic things on top.
import { COLORS, DISTRICTS, LANDMARKS, OCEAN_X, ROAD_W, ROAD_XS, ROAD_YS, SAND_X, WORLD } from './config.js';

const HALF_ROAD = ROAD_W / 2;
const SIDEWALK = 18;

// The park block and the marina lot: blocks with no buildings.
const PARK = { x: 848, y: 1148, w: 304, h: 304 };
const MARINA_LOT = { x: 2048, y: 1948, w: 304, h: 204 };

function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return { name: 'Solmar', ground: '#8a8a72', kind: 'suburb' };
}

export function districtAtName(city, x, y) {
  if (x < OCEAN_X) return 'Solmar Bay';
  if (x < SAND_X + 60) return 'Ocean Beach';
  return districtAt(x, y).name;
}

export function isOnRoad(x, y) {
  for (const rx of ROAD_XS) if (Math.abs(x - rx) <= HALF_ROAD) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) <= HALF_ROAD) return true;
  return false;
}

export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROAD_XS) {
    for (const ry of ROAD_YS) {
      const d = Math.hypot(x - rx, y - ry);
      if (d < bestD) {
        bestD = d;
        best = { x: rx, y: ry };
      }
    }
  }
  return best;
}

/** The road centreline point nearest to (x, y): used to snap spawns onto roads. */
export function nearestRoadCentre(x, y) {
  let bx = x;
  let by = y;
  let bd = Infinity;
  for (const rx of ROAD_XS) {
    const d = Math.abs(x - rx);
    if (d < bd) {
      bd = d;
      bx = rx;
      by = y;
    }
  }
  bd = Infinity;
  for (const ry of ROAD_YS) {
    const d = Math.abs(y - ry);
    if (d < bd) {
      bd = d;
      by = ry;
      bx = x;
    }
  }
  return { x: bx, y: by };
}

export function createCity(random) {
  const buildings = [];
  const palms = [];
  const lamps = [];
  const trees = [];
  const parked = [];

  // Buildings: one or two per block, between the roads, with a margin.
  const blockXs = [];
  const blockYs = [];
  let prev = 0;
  for (const rx of ROAD_XS) {
    blockXs.push([prev + HALF_ROAD + SIDEWALK, rx - HALF_ROAD - SIDEWALK]);
    prev = rx;
  }
  blockXs.push([prev + HALF_ROAD + SIDEWALK, WORLD.width - 24]);
  prev = 0;
  for (const ry of ROAD_YS) {
    blockYs.push([prev + HALF_ROAD + SIDEWALK, ry - HALF_ROAD - SIDEWALK]);
    prev = ry;
  }
  blockYs.push([prev + HALF_ROAD + SIDEWALK, WORLD.height - 24]);

  for (const [bx0, bx1] of blockXs) {
    for (const [by0, by1] of blockYs) {
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      if (bw < 60 || bh < 60) continue;
      // Skip the beach strip and the park / marina lot.
      if (bx0 < SAND_X) continue;
      if (bx0 >= PARK.x && bx0 < PARK.x + PARK.w && by0 >= PARK.y && by0 < PARK.y + PARK.h) continue;
      if (bx0 >= MARINA_LOT.x && bx0 < MARINA_LOT.x + MARINA_LOT.w && by0 >= MARINA_LOT.y && by0 < MARINA_LOT.y + MARINA_LOT.h) continue;
      const cx = (bx0 + bx1) / 2;
      const cy = (by0 + by1) / 2;
      const district = districtAt(cx, cy);
      const downtown = district.kind === 'downtown';
      const palette = downtown ? COLORS.buildingDowntown : district.kind === 'oldtown' ? COLORS.buildingOld : COLORS.buildingSuburb;
      const split = random.chance(0.55) && bw > 170 && bh > 170;
      const pieces = split ? 2 : 1;
      for (let i = 0; i < pieces; i += 1) {
        let x;
        let y;
        let w;
        let h;
        if (pieces === 2) {
          if (bw >= bh) {
            w = bw / 2 - 14;
            h = bh - 28;
            x = bx0 + 14 + i * (bw / 2);
            y = by0 + 14;
          } else {
            w = bw - 28;
            h = bh / 2 - 14;
            x = bx0 + 14;
            y = by0 + 14 + i * (bh / 2);
          }
        } else {
          w = bw - 28 - random.range(0, 40);
          h = bh - 28 - random.range(0, 40);
          x = bx0 + 14 + random.range(0, Math.max(0, bw - 28 - w));
          y = by0 + 14 + random.range(0, Math.max(0, bh - 28 - h));
        }
        buildings.push({
          x,
          y,
          w,
          h,
          color: random.pick(palette),
          height: downtown ? random.range(34, 86) : random.range(10, 26),
          downtown,
          label: null,
        });
      }
    }
  }

  // Named landmarks sit on top of their blocks.
  const landmarkBuildings = [
    { key: 'garage', color: '#b8452e', label: "LENA'S GARAGE" },
    { key: 'bank', color: '#3f5a78', label: 'SOLMAR TRUST' },
    { key: 'hospital', color: '#e8e8e2', label: 'SOLMAR GENERAL' },
    { key: 'policeHq', color: '#2e4a6b', label: 'SCPD HQ' },
    { key: 'safehouse', color: '#c9a05b', label: 'SAFEHOUSE' },
    { key: 'beachClub', color: '#e07840', label: 'PALMERA CLUB' },
  ];
  for (const lm of landmarkBuildings) {
    const at = LANDMARKS[lm.key];
    const near = buildings.reduce((best, b) => {
      const d = Math.hypot(b.x + b.w / 2 - at.x, b.y + b.h / 2 - at.y);
      return !best || d < best.d ? { b, d } : best;
    }, null);
    if (near) {
      near.b.color = lm.color;
      near.b.label = lm.label;
      near.b.height = Math.max(near.b.height, 26);
    }
  }

  // Palms along the beach and Ocean Drive, trees in the park and on the hills.
  for (let y = 80; y < WORLD.height - 60; y += 110) {
    palms.push({ x: 322 + random.range(-8, 8), y: y + random.range(-14, 14) });
    if (random.chance(0.7)) palms.push({ x: 372 + random.range(-6, 6), y: y + 55 });
  }
  for (let i = 0; i < 26; i += 1) {
    trees.push({ x: PARK.x + 24 + random.range(0, PARK.w - 48), y: PARK.y + 24 + random.range(0, PARK.h - 48) });
  }
  for (let i = 0; i < 18; i += 1) {
    trees.push({ x: 2450 + random.range(0, 700), y: 40 + random.range(0, 600) });
  }

  // Street lamps at every intersection corner.
  for (const rx of ROAD_XS) {
    for (const ry of ROAD_YS) {
      lamps.push({ x: rx - HALF_ROAD - 8, y: ry - HALF_ROAD - 8 });
      lamps.push({ x: rx + HALF_ROAD + 8, y: ry + HALF_ROAD + 8 });
    }
  }

  // Parked cars in the marina lot and along a few curbs.
  for (let i = 0; i < 10; i += 1) {
    parked.push({
      x: MARINA_LOT.x + 30 + (i % 5) * 56,
      y: MARINA_LOT.y + 40 + Math.floor(i / 5) * 90,
      angle: Math.PI / 2,
      color: random.pick(COLORS.carColors),
    });
  }

  return { buildings, palms, lamps, trees, parked, park: PARK, marinaLot: MARINA_LOT };
}

/** True when the circle at (x, y, r) hits a building or the water. */
export function hitsSolid(city, x, y, r) {
  if (x - r < OCEAN_X) return true;
  if (x + r > WORLD.width || y - r < 0 || y + r > WORLD.height) return true;
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

/** Push the circle out of buildings and the water; returns the corrected position. */
export function resolveSolid(city, x, y, r) {
  let nx = x;
  let ny = y;
  if (nx - r < OCEAN_X) nx = OCEAN_X + r;
  if (nx + r > WORLD.width) nx = WORLD.width - r;
  if (ny - r < 0) ny = r;
  if (ny + r > WORLD.height) ny = WORLD.height - r;
  for (const b of city.buildings) {
    if (nx + r > b.x && nx - r < b.x + b.w && ny + r > b.y && ny - r < b.y + b.h) {
      const dxl = nx + r - b.x;
      const dxr = b.x + b.w - (nx - r);
      const dyt = ny + r - b.y;
      const dyb = b.y + b.h - (ny - r);
      const m = Math.min(dxl, dxr, dyt, dyb);
      if (m === dxl) nx = b.x - r;
      else if (m === dxr) nx = b.x + b.w + r;
      else if (m === dyt) ny = b.y - r;
      else ny = b.y + b.h + r;
    }
  }
  return { x: nx, y: ny };
}

// ---- Static world painting -------------------------------------------------

function drawBuilding(ctx, b, sunX, sunY) {
  // Long warm shadow, then the roof with a darker inset and window dots.
  ctx.fillStyle = 'rgba(40, 26, 12, 0.28)';
  ctx.fillRect(b.x + sunX * b.height * 0.55, b.y + sunY * b.height * 0.55, b.w, b.h);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  const cols = Math.max(1, Math.floor(b.w / 26));
  const rows = Math.max(1, Math.floor(b.h / 26));
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      if ((i * 7 + j * 13) % 3 === 0) continue;
      ctx.fillRect(b.x + 10 + i * ((b.w - 20) / cols), b.y + 10 + j * ((b.h - 20) / rows), 9, 6);
    }
  }
  if (b.label) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4);
  }
}

function drawPalm(ctx, x, y) {
  ctx.strokeStyle = '#7a5230';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 3, y - 18);
  ctx.stroke();
  ctx.fillStyle = COLORS.palm;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.ellipse(x + 3 + Math.cos(a) * 11, y - 20 + Math.sin(a) * 8, 12, 4, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Paint the whole static world once; returns the offscreen canvas. */
export function paintStaticWorld(city) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD.width;
  canvas.height = WORLD.height;
  const ctx = canvas.getContext('2d');

  // Base ground: suburbs, then district tints.
  ctx.fillStyle = '#8a8a72';
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  for (const d of DISTRICTS) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(d.x, d.y, d.w, d.h);
  }
  // Ocean with a deeper gradient and the sand.
  const grad = ctx.createLinearGradient(0, 0, OCEAN_X, 0);
  grad.addColorStop(0, COLORS.waterDeep);
  grad.addColorStop(1, COLORS.water);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, OCEAN_X, WORLD.height);
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(OCEAN_X, 0, SAND_X - OCEAN_X, WORLD.height);
  // Wave lines on the sand edge.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  for (let y = 0; y < WORLD.height; y += 90) {
    ctx.beginPath();
    ctx.moveTo(OCEAN_X - 4, y);
    ctx.quadraticCurveTo(OCEAN_X + 8, y + 22, OCEAN_X - 4, y + 44);
    ctx.stroke();
  }

  // Park: grass, pond, paths.
  ctx.fillStyle = COLORS.parkGrass;
  ctx.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
  ctx.fillStyle = '#4d8fb0';
  ctx.beginPath();
  ctx.ellipse(PARK.x + PARK.w * 0.62, PARK.y + PARK.h * 0.6, 52, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d8d2b8';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(PARK.x, PARK.y + PARK.h / 2);
  ctx.lineTo(PARK.x + PARK.w, PARK.y + PARK.h / 2);
  ctx.stroke();

  // Marina lot: asphalt with bay lines and a pier into the south water.
  ctx.fillStyle = COLORS.asphalt;
  ctx.fillRect(MARINA_LOT.x, MARINA_LOT.y, MARINA_LOT.w, MARINA_LOT.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    ctx.strokeRect(MARINA_LOT.x + 18 + i * 56, MARINA_LOT.y + 22, 40, 74);
    ctx.strokeRect(MARINA_LOT.x + 18 + i * 56, MARINA_LOT.y + 110, 40, 74);
  }

  // Roads: asphalt, sidewalks, centre dashes and crosswalks.
  for (const rx of ROAD_XS) {
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(rx - HALF_ROAD - SIDEWALK, 0, ROAD_W + SIDEWALK * 2, WORLD.height);
    ctx.fillStyle = COLORS.asphalt;
    ctx.fillRect(rx - HALF_ROAD, 0, ROAD_W, WORLD.height);
  }
  for (const ry of ROAD_YS) {
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(0, ry - HALF_ROAD - SIDEWALK, WORLD.width, ROAD_W + SIDEWALK * 2);
    ctx.fillStyle = COLORS.asphalt;
    ctx.fillRect(0, ry - HALF_ROAD, WORLD.width, ROAD_W);
  }
  ctx.fillStyle = COLORS.lane;
  for (const rx of ROAD_XS) {
    for (let y = 0; y < WORLD.height; y += 64) {
      if (isOnRoad(rx, y + 16)) continue;
      ctx.fillRect(rx - 2, y, 4, 32);
    }
  }
  for (const ry of ROAD_YS) {
    for (let x = SAND_X; x < WORLD.width; x += 64) {
      if (isOnRoad(x + 16, ry)) continue;
      ctx.fillRect(x, ry - 2, 32, 4);
    }
  }
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of ROAD_XS) {
    for (const ry of ROAD_YS) {
      for (let i = -3; i <= 3; i += 1) {
        ctx.fillRect(rx + i * 12 - 4, ry - HALF_ROAD - 4, 8, 12);
        ctx.fillRect(rx + i * 12 - 4, ry + HALF_ROAD - 8, 8, 12);
      }
    }
  }

  // Buildings, palms, trees and lamps.
  const sunX = -0.55;
  const sunY = 0.85;
  for (const b of city.buildings) drawBuilding(ctx, b, sunX, sunY);
  for (const t of city.trees) {
    ctx.fillStyle = 'rgba(40,26,12,0.25)';
    ctx.beginPath();
    ctx.ellipse(t.x + 6, t.y + 8, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a7d3a';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d9448';
    ctx.beginPath();
    ctx.arc(t.x - 4, t.y - 4, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of city.palms) drawPalm(ctx, p.x, p.y);
  for (const l of city.lamps) {
    ctx.fillStyle = '#2c2c30';
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
  }

  return canvas;
}

/** Paint a small minimap of the static world; blips are drawn per frame. */
export function paintMinimap(city, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const sx = w / WORLD.width;
  const sy = h / WORLD.height;
  ctx.fillStyle = '#232a24';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2a7fa8';
  ctx.fillRect(0, 0, OCEAN_X * sx, h);
  ctx.fillStyle = '#e8c98f';
  ctx.fillRect(OCEAN_X * sx, 0, (SAND_X - OCEAN_X) * sx, h);
  ctx.fillStyle = '#5d8f43';
  ctx.fillRect(PARK.x * sx, PARK.y * sy, PARK.w * sx, PARK.h * sy);
  ctx.fillStyle = '#3a3a40';
  for (const rx of ROAD_XS) ctx.fillRect((rx - HALF_ROAD) * sx, 0, ROAD_W * sx, h);
  for (const ry of ROAD_YS) ctx.fillRect(0, (ry - HALF_ROAD) * sy, w, ROAD_W * sy);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (const b of city.buildings) ctx.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
  return canvas;
}
