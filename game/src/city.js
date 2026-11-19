// Solmar Bay — the city: roads, blocks, buildings, parks, marina, landmarks.
// Generated from a seed, so ?seed=N always builds the same city.
import { CFG } from './config.js';
import { makeRng } from './random.js';

const LANDMARKS = [
  { name: 'Solmar National Bank', kind: 'bank' },
  { name: 'City Hall', kind: 'civic' },
  { name: 'Grand Azure Hotel', kind: 'hotel' },
  { name: 'The Pearl Casino', kind: 'casino' },
  { name: 'Fish Market', kind: 'market' },
  { name: 'Marina Office', kind: 'marina' },
  { name: 'Solmar Stadium', kind: 'stadium' },
  { name: 'Museum of Tides', kind: 'museum' },
];

export function generateCity(seed) {
  const rng = makeRng(seed);
  const half = CFG.ROAD_W / 2 + CFG.SIDEWALK;
  const xs = [0, ...CFG.AVENUES, CFG.SAND_X];
  const ys = [0, ...CFG.STREETS, CFG.WORLD_H];
  const buildings = [];
  const parks = [];
  const landmarkSpots = [];

  // Blocks sit between neighbouring roads. Each block holds 1-4 buildings,
  // or becomes a park, or stays an empty lot.
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < ys.length - 1; bj++) {
      const x0 = xs[bi] + (bi === 0 ? 24 : half);
      const x1 = xs[bi + 1] - (bi === xs.length - 2 ? 24 : half);
      const y0 = ys[bj] + (bj === 0 ? 24 : half);
      const y1 = ys[bj + 1] - (bj === ys.length - 2 ? 24 : half);
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 70 || bh < 70) continue;
      const roll = rng.next();
      if (roll < 0.16) {
        // Park: trees + a pond.
        const trees = [];
        const n = rng.int(6, 12);
        for (let i = 0; i < n; i++) {
          trees.push({ x: rng.range(x0 + 14, x1 - 14), y: rng.range(y0 + 14, y1 - 14), r: rng.range(7, 12) });
        }
        parks.push({
          x: x0, y: y0, w: bw, h: bh, trees,
          pond: rng.chance(0.5) ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: Math.min(bw, bh) * 0.22 } : null,
        });
        continue;
      }
      if (roll < 0.24) continue; // empty lot
      const cols = bw > 300 ? 2 : 1;
      const rows = bh > 300 ? 2 : 1;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rng.chance(0.18)) continue;
          const cw = bw / cols;
          const ch = bh / rows;
          const w = rng.range(cw * 0.42, cw * 0.8);
          const h = rng.range(ch * 0.42, ch * 0.8);
          const x = x0 + c * cw + (cw - w) / 2 + rng.range(-8, 8);
          const y = y0 + r * ch + (ch - h) / 2 + rng.range(-8, 8);
          buildings.push({ x, y, w, h, name: null, kind: 'block', hue: rng.pick(['#6b6f7a', '#7a6a5c', '#5c6b7a', '#707a5c', '#7a5c6e']) });
        }
      }
    }
  }

  // Landmarks: pick the biggest central buildings and name them.
  const shuffled = rng.shuffle(buildings);
  const picked = [];
  for (const b of shuffled) {
    if (picked.length >= LANDMARKS.length) break;
    if (b.w < 90 || b.h < 80) continue;
    if (picked.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < 420)) continue;
    picked.push(b);
  }
  picked.forEach((b, i) => {
    b.name = LANDMARKS[i].name;
    b.kind = LANDMARKS[i].kind;
    landmarkSpots.push({ name: b.name, x: b.x + b.w / 2, y: b.y + b.h / 2 });
  });

  // Marina on the beach: wooden docks + moored boats along the shore.
  const marina = { x: CFG.SAND_X + 8, y: 1050, w: 70, h: 520, docks: [], boats: [] };
  for (let i = 0; i < 4; i++) {
    const dy = marina.y + 60 + i * 120;
    marina.docks.push({ x: marina.x, y: dy, w: 58, h: 10 });
    marina.boats.push({
      x: marina.x + 44 + rng.range(-4, 10),
      y: dy + 26,
      angle: Math.PI / 2 + rng.range(-0.2, 0.2),
      color: rng.pick(['#e8e8e8', '#c0392b', '#2e86c1', '#f1c40f']),
    });
  }
  // Lighthouse at the north end of the beach.
  const lighthouse = { x: CFG.SAND_X + 34, y: 210, w: 26, h: 26, name: 'Solmar Lighthouse' };

  return {
    seed, buildings, parks, marina, lighthouse, landmarkSpots,
    avenues: CFG.AVENUES, streets: CFG.STREETS,
  };
}

export function isOnRoad(city, x, y) {
  const h = CFG.ROAD_W / 2;
  if (x < 0 || y < 0 || x > CFG.SAND_X || y > CFG.WORLD_H) return false;
  for (const ax of CFG.AVENUES) if (Math.abs(x - ax) <= h) return true;
  for (const sy of CFG.STREETS) if (Math.abs(y - sy) <= h) return true;
  return false;
}

// Nearest point that lies on a road centreline.
export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const ax of CFG.AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bestD) { bestD = d; best = { x: ax, y }; }
  }
  for (const sy of CFG.STREETS) {
    const d = Math.abs(y - sy);
    if (d < bestD) { bestD = d; best = { x, y: sy }; }
  }
  return best;
}

// Random point on a road within radius r of (x, y); falls back to nearest road.
export function roadPointNear(city, rng, x, y, r) {
  for (let tries = 0; tries < 12; tries++) {
    const horizontal = rng.chance(0.5);
    if (horizontal) {
      const sy = rng.pick(CFG.STREETS);
      const px = x + rng.range(-r, r);
      if (px > 40 && px < CFG.SAND_X - 40 && Math.abs(sy - y) < r + 200) return { x: px, y: sy };
    } else {
      const ax = rng.pick(CFG.AVENUES);
      const py = y + rng.range(-r, r);
      if (py > 40 && py < CFG.WORLD_H - 40 && Math.abs(ax - x) < r + 200) return { x: ax, y: py };
    }
  }
  return nearestRoadPoint(city, x, y);
}

export function districtAt(x, y) {
  if (x >= CFG.SAND_X) return 'The Shore';
  for (const d of CFG.DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Solmar Bay';
}

export function pointInBuilding(city, x, y, pad = 0) {
  for (const b of city.buildings) {
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
  }
  return null;
}

// Push a circle out of any building it overlaps. Returns true if pushed.
export function resolveCircleBuildings(city, ent, r) {
  let pushed = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(ent.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(ent.y, b.y + b.h));
    const dx = ent.x - cx;
    const dy = ent.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    pushed = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      ent.x = cx + (dx / d) * r;
      ent.y = cy + (dy / d) * r;
    } else {
      // Centre inside the building: push out along the smallest exit.
      const left = ent.x - b.x + r;
      const right = b.x + b.w - ent.x + r;
      const top = ent.y - b.y + r;
      const bottom = b.y + b.h - ent.y + r;
      const m = Math.min(left, right, top, bottom);
      if (m === left) ent.x = b.x - r;
      else if (m === right) ent.x = b.x + b.w + r;
      else if (m === top) ent.y = b.y - r;
      else ent.y = b.y + b.h + r;
    }
  }
  return pushed;
}

// Keep an entity inside the playable world (never into the sea).
export function clampToWorld(ent, r) {
  ent.x = Math.max(r, Math.min(CFG.SEA_X - 14 - r, ent.x));
  ent.y = Math.max(r, Math.min(CFG.WORLD_H - r, ent.y));
}
