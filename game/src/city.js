// The city itself: where the roads run, what fills each block, where the
// beach, park and marina sit, and the geometry questions the rest of the
// game asks (is this point on a road, inside a building, in the sea, in
// which district). The layout is generated once from the seed, so the
// same seed always builds the same Cinder Bay.

import { AVENUES, BEACH_X, COLORS, DISTRICTS, ROAD_HALF, STREETS, WATER_X, WORLD } from './config.js';

// Landmarks the player can find on the map and in mission text. Each one
// sits in the middle of a block, clear of the roads, so traffic and
// cruisers never have to drive through a building to follow a street.
export const LANDMARKS = [
  { name: 'Cinder Bay Bank', x: 1650, y: 450, w: 190, h: 130, color: '#b8a06a' },
  { name: 'City Hall', x: 850, y: 1250, w: 210, h: 140, color: '#9a8f7a' },
  { name: 'Grand Cinder Hotel', x: 2450, y: 450, w: 170, h: 200, color: '#7d8ea3' },
  { name: 'Foundry Museum', x: 450, y: 850, w: 180, h: 120, color: '#8a6a52' },
  { name: 'The Beacon', x: 3060, y: 2150, w: 46, h: 46, color: '#e8e2d2' },
  { name: 'Marina Office', x: 2450, y: 2000, w: 130, h: 90, color: '#6a7d8a' },
];

const ROOF_COLORS = ['#7a6a58', '#6b5f52', '#8a7a63', '#75624e', '#93806a'];

// The park block: trees, a pond and footpaths, no buildings.
export const PARK = { x0: 1050, y0: 1050, x1: 1450, y1: 1450 };
const PARK_POND = { x: 1250, y: 1250, rx: 110, ry: 70 };

// The marina: piers reaching into the water at the south-east corner.
export const MARINA = { x0: 2450, y0: 1850, x1: 2920, y1: 2400 };
const PIERS = [
  { x: 2920, y: 1950, w: 190, h: 16 },
  { x: 2920, y: 2100, w: 150, h: 16 },
  { x: 2920, y: 2250, w: 170, h: 16 },
];

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const boats = [];

  // Walk the grid of blocks between the roads and fill each one.
  const xs = [0, ...AVENUES, WORLD.width];
  const ys = [0, ...STREETS, WORLD.height];
  for (let bi = 0; bi < xs.length - 1; bi += 1) {
    for (let bj = 0; bj < ys.length - 1; bj += 1) {
      const x0 = xs[bi] + ROAD_HALF + 14;
      const x1 = xs[bi + 1] - ROAD_HALF - 14;
      const y0 = ys[bj] + ROAD_HALF + 14;
      const y1 = ys[bj + 1] - ROAD_HALF - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // The beach strip holds sand, not buildings.
      if (x0 >= BEACH_X) continue;
      // The park block is trees and a pond.
      if (x0 >= PARK.x0 && x1 <= PARK.x1 && y0 >= PARK.y0 && y1 <= PARK.y1) {
        for (let i = 0; i < 26; i += 1) {
          const tx = random.range(x0 + 20, x1 - 20);
          const ty = random.range(y0 + 20, y1 - 20);
          const dx = (tx - PARK_POND.x) / PARK_POND.rx;
          const dy = (ty - PARK_POND.y) / PARK_POND.ry;
          if (dx * dx + dy * dy < 1.4) continue;
          trees.push({ x: tx, y: ty, r: random.range(11, 17) });
        }
        continue;
      }
      // The marina block is docks and moored boats, no buildings.
      if (x0 >= MARINA.x0 && y0 >= MARINA.y0) {
        for (let i = 0; i < 5; i += 1) {
          boats.push({
            x: random.range(2960, 3090),
            y: 1930 + i * 90 + random.range(-12, 12),
            angle: random.range(-0.3, 0.3),
            color: random.pick(['#e8e2d2', '#c96a4a', '#4a7d9a', '#d8c95a']),
          });
        }
        continue;
      }
      // A normal block gets one to four buildings with a gap between them.
      const count = random.int(1, 4);
      for (let k = 0; k < count; k += 1) {
        const bw = random.range(90, Math.min(190, x1 - x0 - 20));
        const bh = random.range(80, Math.min(170, y1 - y0 - 20));
        const bx = random.range(x0, Math.max(x0, x1 - bw));
        const by = random.range(y0, Math.max(y0, y1 - bh));
        const rect = { x: bx, y: by, w: bw, h: bh };
        if (buildings.some((b) => rectsOverlap(b, rect, 18))) continue;
        buildings.push({
          ...rect,
          color: random.pick(ROOF_COLORS),
          height: random.int(1, 3),
        });
      }
      // A few street trees on the block corners.
      for (let i = 0; i < 3; i += 1) {
        if (random.chance(0.6)) {
          trees.push({
            x: random.range(x0, x1),
            y: random.range(y0, y1),
            r: random.range(9, 14),
          });
        }
      }
    }
  }

  // Landmarks sit on top of the generated blocks; clear any building
  // they would overlap so the bank and city hall always stand clear.
  for (const mark of LANDMARKS) {
    const rect = { x: mark.x - mark.w / 2, y: mark.y - mark.h / 2, w: mark.w, h: mark.h };
    for (let i = buildings.length - 1; i >= 0; i -= 1) {
      if (rectsOverlap(buildings[i], rect, 10)) buildings.splice(i, 1);
    }
    buildings.push({ ...rect, color: mark.color, height: 3, landmark: mark.name });
  }

  return { buildings, trees, boats, piers: PIERS, pond: PARK_POND };
}

function rectsOverlap(a, b, pad) {
  return (
    a.x - pad < b.x + b.w &&
    a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h &&
    a.y + a.h + pad > b.y
  );
}

// True when the point is on a road (within the road half-width of an
// avenue or a street).
export function isOnRoad(x, y) {
  if (AVENUES.some((ax) => Math.abs(x - ax) <= ROAD_HALF)) return true;
  if (STREETS.some((sy) => Math.abs(y - sy) <= ROAD_HALF)) return true;
  return false;
}

// The nearest point on the road network, used to stage traffic and police
// on a road axis instead of inside a block.
export function nearestRoadPoint(x, y) {
  let bestX = x;
  let bestY = y;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bestD) {
      bestD = d;
      bestX = ax;
      bestY = y;
    }
  }
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < bestD) {
      bestD = d;
      bestX = x;
      bestY = sy;
    }
  }
  return { x: bestX, y: bestY };
}

// A point on a road at least minDist and at most maxDist from (x, y),
// picked from the avenues and streets that pass near the player.
export function roadPointNear(x, y, minDist, maxDist, random) {
  for (let tries = 0; tries < 24; tries += 1) {
    const angle = random.range(0, Math.PI * 2);
    const dist = random.range(minDist, maxDist);
    const px = x + Math.cos(angle) * dist;
    const py = y + Math.sin(angle) * dist;
    if (px < 60 || py < 60 || px > WORLD.width - 60 || py > WORLD.height - 60) continue;
    const onRoad = nearestRoadPoint(px, py);
    if (Math.hypot(onRoad.x - x, onRoad.y - y) < minDist * 0.7) continue;
    return onRoad;
  }
  return nearestRoadPoint(x, y);
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Cinder Bay';
}

// True when the point is inside a building rectangle.
export function pointInBuilding(city, x, y) {
  return city.buildings.some((b) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
}

// Push a circle out of every building it overlaps; returns true when a
// push happened. Used for the player, pedestrians and foot officers.
export function resolveCircleBuildings(city, body) {
  let pushed = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= body.radius * body.radius || d2 === 0) {
      if (d2 === 0) {
        // Dead centre of a building: shove out along the short side.
        const left = body.x - b.x;
        const right = b.x + b.w - body.x;
        const top = body.y - b.y;
        const bottom = b.y + b.h - body.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) body.x = b.x - body.radius;
        else if (m === right) body.x = b.x + b.w + body.radius;
        else if (m === top) body.y = b.y - body.radius;
        else body.y = b.y + b.h + body.radius;
        pushed = true;
      }
      continue;
    }
    const d = Math.sqrt(d2);
    body.x = cx + (dx / d) * body.radius;
    body.y = cy + (dy / d) * body.radius;
    pushed = true;
  }
  return pushed;
}

// Keep a body inside the world and out of the sea.
export function clampToWorld(body) {
  body.x = Math.max(16, Math.min(WORLD.width - 16, body.x));
  body.y = Math.max(16, Math.min(WORLD.height - 16, body.y));
  if (body.x > WATER_X - 8) body.x = WATER_X - 8;
}

export { COLORS };
