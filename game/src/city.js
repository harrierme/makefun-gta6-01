// Cinder Bay itself: the road grid, the blocks between the roads, the
// buildings in them, the park, the marina, the beach and the named
// landmarks. Generation is deterministic for a seed, and the same layout is
// used by the simulation (collisions, districts) and the renderer.

import { BEACH, ROADS, WORLD } from './config.js';
import { createRandom, intBetween, pick } from './random.js';

const ROOF_COLORS = ['#6b5a4e', '#7a6a58', '#54463c', '#8a6f5c', '#5d6b7a', '#75604f'];

// Blocks that are not buildings: the park in the middle, the marina in the
// south-east, and the beachfront strip east of the last avenue.
const PARK = { x0: 1040, y0: 1040, x1: 1360, y1: 1360 };
const MARINA = { x0: 2640, y0: 1840, x1: 2820, y1: 2160 };

export const LANDMARKS = [
  { name: 'City Hall', x: 1480, y: 280, w: 150, h: 110, color: '#8a7a5c' },
  { name: 'Grand Cinder Hotel', x: 2280, y: 680, w: 120, h: 170, color: '#7a6a8a' },
  { name: 'Cinder Bay Bank', x: 1880, y: 1480, w: 130, h: 100, color: '#5d6b7a' },
  { name: 'The Beacon', x: 2920, y: 2080, w: 46, h: 46, color: '#e8e0d0' },
  { name: 'Foundry Museum', x: 280, y: 1480, w: 140, h: 90, color: '#6b4a3a' },
  { name: 'Marina Club', x: 2680, y: 1920, w: 110, h: 70, color: '#4a6b7a' },
];

export const DISTRICTS = [
  { name: 'Old Foundry', x0: 0, y0: 0, x1: 600, y1: 600 },
  { name: 'Northgate', x0: 600, y0: 0, x1: 2830, y1: 600 },
  { name: 'Civic Center', x0: 600, y0: 600, x1: 1800, y1: 1400 },
  { name: 'Palm Court', x0: 1800, y0: 600, x1: 2830, y1: 1400 },
  { name: 'Willow Park', x0: 1000, y0: 1000, x1: 1400, y1: 1400 },
  { name: 'Harborview', x0: 0, y0: 1400, x1: 2640, y1: 2400 },
  { name: 'Marina Bay', x0: 2640, y0: 1400, x1: 2830, y1: 2400 },
  { name: 'The Strand', x0: 2830, y0: 0, x1: 3200, y1: 2400 },
];

/** True when the point is on a road surface (not on a sidewalk or a block). */
export function isOnRoad(x, y) {
  const half = ROADS.width / 2;
  for (const avenue of ROADS.avenues) if (Math.abs(x - avenue) <= half) return true;
  for (const street of ROADS.streets) if (Math.abs(y - street) <= half) return true;
  return false;
}

/** True when the point is on the sand or in the ocean east of the city. */
export function isBeach(x) {
  return x >= BEACH.x;
}

export function districtAt(x, y) {
  for (const district of DISTRICTS) {
    if (x >= district.x0 && x < district.x1 && y >= district.y0 && y < district.y1) return district.name;
  }
  return 'Cinder Bay';
}

/**
 * Build the city for a seed: every building as {x, y, w, h, color, name?},
 * plus the park's trees, the marina's docks and the beach's palms.
 */
export function buildCity(seed) {
  const random = createRandom(seed);
  const buildings = [];
  const trees = [];
  const palms = [];
  const docks = [];

  // Landmarks first, so no generated building ever overlaps one.
  for (const landmark of LANDMARKS) {
    buildings.push({ x: landmark.x, y: landmark.y, w: landmark.w, h: landmark.h, color: landmark.color, name: landmark.name });
  }

  const half = ROADS.width / 2 + 14; // road half-width plus a sidewalk strip
  const avenueEdges = [0, ...ROADS.avenues, WORLD.width];
  const streetEdges = [0, ...ROADS.streets, WORLD.height];

  for (let a = 0; a < avenueEdges.length - 1; a += 1) {
    for (let s = 0; s < streetEdges.length - 1; s += 1) {
      const x0 = avenueEdges[a] + (a === 0 ? 14 : half);
      const x1 = avenueEdges[a + 1] - (a + 1 === avenueEdges.length - 1 ? 14 : half);
      const y0 = streetEdges[s] + (s === 0 ? 14 : half);
      const y1 = streetEdges[s + 1] - (s + 1 === streetEdges.length - 1 ? 14 : half);
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // The park block stays green; the marina block stays open water-side.
      if (x0 >= PARK.x0 - 20 && x1 <= PARK.x1 + 20 && y0 >= PARK.y0 - 20 && y1 <= PARK.y1 + 20) continue;
      if (x0 >= MARINA.x0 - 20 && x1 <= MARINA.x1 + 20 && y0 >= MARINA.y0 - 20 && y1 <= MARINA.y1 + 20) continue;
      // The beachfront strip east of the last avenue has no buildings:
      // that is sand, palms and the ocean.
      if (x0 >= ROADS.avenues[ROADS.avenues.length - 1]) continue;

      const blockW = x1 - x0;
      const blockH = y1 - y0;
      const cols = blockW > 300 ? 2 : 1;
      const rows = blockH > 300 ? 2 : 1;
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          const bw = blockW / cols - 24;
          const bh = blockH / rows - 24;
          const bx = x0 + 12 + (c * blockW) / cols;
          const by = y0 + 12 + (r * blockH) / rows;
          // Skip any building that would cover a landmark.
          let clash = false;
          for (const landmark of LANDMARKS) {
            if (bx < landmark.x + landmark.w && bx + bw > landmark.x && by < landmark.y + landmark.h && by + bh > landmark.y) clash = true;
          }
          if (clash) continue;
          buildings.push({ x: bx, y: by, w: bw, h: bh, color: pick(random, ROOF_COLORS), name: null });
        }
      }
    }
  }

  // Willow Park: scattered trees and a pond.
  for (let i = 0; i < 46; i += 1) {
    trees.push({
      x: PARK.x0 + 20 + random() * (PARK.x1 - PARK.x0 - 40),
      y: PARK.y0 + 20 + random() * (PARK.y1 - PARK.y0 - 40),
      r: 10 + random() * 9,
    });
  }
  // The Strand: palm trees along the sand.
  for (let i = 0; i < 22; i += 1) {
    palms.push({ x: BEACH.x + 30 + random() * 130, y: 60 + random() * (WORLD.height - 120), r: 8 });
  }
  // Marina Bay: wooden docks jutting toward the water.
  for (let i = 0; i < 4; i += 1) {
    docks.push({ x: MARINA.x0 + 10 + i * 44, y: MARINA.y0 + 30, w: 16, h: 190 });
  }

  return {
    seed,
    buildings,
    trees,
    palms,
    docks,
    park: PARK,
    marina: MARINA,
    landmarkByName(name) {
      return LANDMARKS.find((landmark) => landmark.name === name) ?? null;
    },
  };
}

/** True when the point is inside any building. */
export function pointInBuilding(city, x, y) {
  for (const building of city.buildings) {
    if (x >= building.x && x <= building.x + building.w && y >= building.y && y <= building.y + building.h) return true;
  }
  return false;
}

/** Push a circle (x, y, radius) out of every building it overlaps. Returns true on a hit. */
export function resolveBuildingCollision(city, body, radius) {
  let hit = false;
  for (const building of city.buildings) {
    const nearestX = Math.max(building.x, Math.min(body.x, building.x + building.w));
    const nearestY = Math.max(building.y, Math.min(body.y, building.y + building.h));
    const dx = body.x - nearestX;
    const dy = body.y - nearestY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radius * radius) continue;
    hit = true;
    if (distSq === 0) {
      // Centre inside the rectangle: push out along the shallowest side.
      const left = body.x - building.x;
      const right = building.x + building.w - body.x;
      const top = body.y - building.y;
      const bottom = building.y + building.h - body.y;
      const shallow = Math.min(left, right, top, bottom);
      if (shallow === left) body.x = building.x - radius;
      else if (shallow === right) body.x = building.x + building.w + radius;
      else if (shallow === top) body.y = building.y - radius;
      else body.y = building.y + building.h + radius;
    } else {
      const dist = Math.sqrt(distSq);
      body.x = nearestX + (dx / dist) * radius;
      body.y = nearestY + (dy / dist) * radius;
    }
  }
  return hit;
}

/** A random point on a road, for spawning traffic and pedestrians. */
export function randomRoadPoint(random) {
  if (random() < 0.5) {
    return { x: pick(random, ROADS.avenues), y: 60 + random() * (WORLD.height - 120), vertical: true };
  }
  return { x: 60 + random() * (WORLD.width - 120), y: pick(random, ROADS.streets), vertical: false };
}

/** A random point on a sidewalk (just off a road), for pedestrians. */
export function randomSidewalkPoint(random) {
  const point = randomRoadPoint(random);
  const offset = ROADS.width / 2 + 12;
  if (random() < 0.5) point.x += random() < 0.5 ? offset : -offset;
  else point.y += random() < 0.5 ? offset : -offset;
  return {
    x: Math.max(20, Math.min(WORLD.width - 20, point.x)),
    y: Math.max(20, Math.min(WORLD.height - 20, point.y)),
  };
}

export function randomSpawnPoint(random) {
  // Player starts on foot in Palm Court, a block from the first mission.
  return { x: 2050, y: 1150 };
}

export { intBetween };
