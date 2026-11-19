// The moving things: cars (traffic, police, parked, the player's), pedestrians,
// rival gang members, and the particle effects. Physics is arcade-simple:
// velocity eases toward the heading, collisions are circles against buildings
// and other cars, and traffic follows the road grid like it owns it.
import { CAR, COLORS, OCEAN_X, POLICE, ROAD_W, ROAD_XS, ROAD_YS, SAND_X, WORLD } from './config.js';
import { hitsSolid, isOnRoad, resolveSolid } from './city.js';

const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

export function makeCar(x, y, angle, color, kind) {
  return {
    x,
    y,
    angle,
    speed: 0,
    vx: 0,
    vy: 0,
    color,
    kind, // 'traffic' | 'police' | 'parked' | 'player'
    hp: CAR.maxHp,
    dir: 0,
    stopped: 0,
    dead: false,
    smoke: 0,
    lightPhase: Math.random() * Math.PI * 2,
  };
}

export function makePed(x, y, random) {
  return {
    x,
    y,
    angle: random.range(0, Math.PI * 2),
    speed: random.range(38, 62),
    color: random.pick(['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#2ecc71']),
    state: 'walk', // walk | flee | down
    wait: 0,
    target: null,
    bob: random.range(0, Math.PI * 2),
    dead: false,
  };
}

export function makeEnemy(x, y) {
  return {
    x,
    y,
    angle: 0,
    hp: 60,
    shootTimer: 1 + Math.random(),
    state: 'fight',
    dead: false,
    flash: 0,
  };
}

/** The nearest car to (x, y) within maxDist, or null. */
export function nearestCar(cars, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.dead || car.kind === 'parked') continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function nearestEnterableCar(cars, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.dead) continue;
    if (car.kind === 'traffic' && car.driver) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function carAhead(cars, car, dist) {
  const ax = Math.cos(car.angle);
  const ay = Math.sin(car.angle);
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * ax + dy * ay;
    if (along > 0 && along < dist && Math.abs(dx * ay - dy * ax) < 26) return true;
  }
  return false;
}

function atIntersection(x, y) {
  for (const rx of ROAD_XS) {
    for (const ry of ROAD_YS) {
      if (Math.abs(x - rx) < 30 && Math.abs(y - ry) < 30) return { x: rx, y: ry };
    }
  }
  return null;
}

/** One traffic car: cruise its lane (right-hand traffic), turn at intersections, stop for the car ahead. */
export function stepTrafficCar(car, state, dt, random) {
  if (car.dead) return;
  const target = car.cruise || 200;
  const blocked = carAhead(state.cars, car, 78);
  const want = blocked ? 0 : target;
  car.speed += (want - car.speed) * Math.min(1, dt * 1.6);
  const cross = atIntersection(car.x, car.y);
  if (cross) {
    // Snap onto the intersection, then pick a new direction (never reverse).
    const options = [0, 1, 2, 3].filter((d) => d !== (car.dir + 2) % 4);
    const next = random.pick(options);
    car.dir = next;
    car.angle = Math.atan2(DIRS[next].y, DIRS[next].x);
    car.x = cross.x;
    car.y = cross.y;
  }
  const dir = DIRS[car.dir];
  // The lane: the road line the car is on, offset 24 px to its right.
  let roadLine;
  let lanePos;
  if (car.dir === 0 || car.dir === 2) {
    roadLine = ROAD_YS.reduce((best, ry) => (Math.abs(ry - car.y) < Math.abs(best - car.y) ? ry : best), ROAD_YS[0]);
    lanePos = roadLine + (car.dir === 0 ? 24 : -24);
    car.x += dir.x * car.speed * dt;
    car.y += (lanePos - car.y) * Math.min(1, dt * 6);
  } else {
    roadLine = ROAD_XS.reduce((best, rx) => (Math.abs(rx - car.x) < Math.abs(best - car.x) ? rx : best), ROAD_XS[0]);
    lanePos = roadLine + (car.dir === 1 ? -24 : 24);
    car.y += dir.y * car.speed * dt;
    car.x += (lanePos - car.x) * Math.min(1, dt * 6);
  }
  car.vx = dir.x * car.speed;
  car.vy = dir.y * car.speed;
  if (car.x < ROAD_W || car.x > WORLD.width - 10 || car.y < 10 || car.y > WORLD.height - 10) {
    // Drove off the map edge: turn it around on the spot.
    car.dir = (car.dir + 2) % 4;
    car.angle = Math.atan2(DIRS[car.dir].y, DIRS[car.dir].x);
  }
}

/** One police car: steer toward the player, ram them, and flash its light bar. */
export function stepPoliceCar(car, state, dt) {
  if (car.dead) return;
  const target = state.playerCar || state.player;
  const tx = target.x;
  const ty = target.y;
  const wantAngle = Math.atan2(ty - car.y, tx - car.x);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff * 4 * dt));
  const dist = Math.hypot(tx - car.x, ty - car.y);
  const wantSpeed = dist > 60 ? POLICE.chaseSpeed : 120;
  car.speed += (wantSpeed - car.speed) * Math.min(1, dt * 2);
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  const fixed = resolveSolid(state.city, car.x, car.y, CAR.radius);
  if (fixed.x !== car.x || fixed.y !== car.y) {
    car.speed *= 0.5;
    car.x = fixed.x;
    car.y = fixed.y;
  }
  car.lightPhase += dt * 9;
}

/**
 * The player's car: arcade handling. Returns 'crash' when it hits something
 * hard, 'explode' when its health runs out.
 */
export function stepPlayerCar(car, input, dt) {
  const up = input.is('up');
  const down = input.is('down');
  const left = input.is('left');
  const right = input.is('right');
  const brake = input.is('brake');
  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  const forward = Math.cos(car.angle);
  const sideways = Math.sin(car.angle);
  const speedAlong = car.vx * forward + car.vy * sideways;

  if (up) car.speed = Math.min(CAR.maxSpeed, car.speed + CAR.accel * dt);
  else if (down) {
    car.speed = speedAlong > 20 ? car.speed - CAR.brake * dt : Math.max(-CAR.reverseMax, car.speed - CAR.accel * 0.6 * dt);
  } else if (brake) {
    car.speed -= Math.sign(car.speed) * CAR.brake * dt;
    if (Math.abs(car.speed) < 30) car.speed = 0;
  } else {
    car.speed -= Math.sign(car.speed) * 260 * dt;
    if (Math.abs(car.speed) < 12) car.speed = 0;
  }

  const steerAmount = steer * CAR.turnRate * dt * Math.min(1, Math.abs(speedAlong) / 140 + 0.25) * (speedAlong < 0 ? -1 : 1);
  car.angle += steerAmount;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const vx = fx * car.speed;
  const vy = fy * car.speed;
  // Grip: the car mostly follows its nose, with a little slide.
  const grip = Math.min(1, CAR.grip * dt);
  car.vx += (vx - car.vx) * grip;
  car.vy += (vy - car.vy) * grip;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  return { skidding: Math.abs(steer) > 0 && Math.abs(speedAlong) > 260 && brake };
}

/** Push two cars apart when their circles overlap; returns true on a hard hit. */
export function resolveCarCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = CAR.radius * 2 - 4;
  if (d === 0 || d >= min) return false;
  const push = (min - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const impact = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
  if (impact > 60) {
    a.vx -= nx * impact * 0.4;
    a.vy -= ny * impact * 0.4;
    b.vx += nx * impact * 0.4;
    b.vy += ny * impact * 0.4;
  }
  return impact > 180;
}

/** One pedestrian: stroll the sidewalks, flee from gunfire and speeding cars. */
export function stepPed(ped, state, dt, random) {
  if (ped.dead || ped.state === 'down') return;
  ped.bob += dt * 8;
  if (ped.state === 'flee') {
    const px = state.player.x;
    const py = state.player.y;
    const away = Math.atan2(ped.y - py, ped.x - px);
    ped.angle = away;
    ped.x += Math.cos(away) * 210 * dt;
    ped.y += Math.sin(away) * 210 * dt;
    const fixed = resolveSolid(state.city, ped.x, ped.y, 10);
    ped.x = fixed.x;
    ped.y = fixed.y;
    if (Math.hypot(ped.x - px, ped.y - py) > 420) ped.state = 'walk';
    return;
  }
  if (ped.wait > 0) {
    ped.wait -= dt;
    return;
  }
  if (!ped.target) {
    // Pick a nearby road and walk along its sidewalk.
    const onX = random.chance(0.5);
    const road = onX ? random.pick(ROAD_XS) : random.pick(ROAD_YS);
    const dir = random.chance(0.5) ? 1 : -1;
    ped.target = { onX, road, dir };
  }
  const t = ped.target;
  const speed = ped.speed;
  if (t.onX) {
    ped.angle = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    ped.y += t.dir * speed * dt;
    ped.x += (t.road + 62 - ped.x) * Math.min(1, dt * 2);
    if (ped.y < 40 || ped.y > WORLD.height - 40) {
      t.dir *= -1;
      if (random.chance(0.4)) ped.target = null;
    }
  } else {
    ped.angle = t.dir > 0 ? 0 : Math.PI;
    ped.x += t.dir * speed * dt;
    ped.y += (t.road + 62 - ped.y) * Math.min(1, dt * 2);
    if (ped.x < SAND_X + 20 || ped.x > WORLD.width - 40) {
      t.dir *= -1;
      if (random.chance(0.4)) ped.target = null;
    }
  }
  // A car bearing down makes them run.
  const nearCar = nearestCar(state.cars, ped.x, ped.y, 70);
  if (nearCar && Math.abs(nearCar.speed) > 120) ped.state = 'flee';
}

/** Scare every pedestrian near (x, y) into fleeing. */
export function scarePeds(state, x, y, radius) {
  for (const ped of state.peds) {
    if (!ped.dead && Math.hypot(ped.x - x, ped.y - y) < radius) ped.state = 'flee';
  }
}

// ---- Particles ---------------------------------------------------------------

export function addParticle(state, p) {
  if (state.particles.length > 420) state.particles.shift();
  state.particles.push({ life: 0, maxLife: 0.6, size: 4, color: '#ffffff', vx: 0, vy: 0, type: 'dot', ...p });
}

export function addExplosion(state, x, y) {
  for (let i = 0; i < 26; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 320;
    addParticle(state, {
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      maxLife: 0.5 + Math.random() * 0.7,
      size: 3 + Math.random() * 6,
      color: ['#ff9f1c', '#ff5714', '#ffd23f', '#7a7a7a'][i % 4],
      type: 'fire',
    });
  }
  for (let i = 0; i < 10; i += 1) {
    addParticle(state, {
      x: x + (Math.random() - 0.5) * 30,
      y: y + (Math.random() - 0.5) * 30,
      vx: (Math.random() - 0.5) * 40,
      vy: -30 - Math.random() * 40,
      maxLife: 1.2 + Math.random(),
      size: 10 + Math.random() * 14,
      color: 'rgba(60,60,60,0.55)',
      type: 'smoke',
    });
  }
}

export function addSmoke(state, x, y) {
  addParticle(state, {
    x,
    y,
    vx: (Math.random() - 0.5) * 20,
    vy: -24 - Math.random() * 20,
    maxLife: 0.9,
    size: 8 + Math.random() * 6,
    color: 'rgba(70,70,70,0.5)',
    type: 'smoke',
  });
}

export function addSparks(state, x, y) {
  for (let i = 0; i < 8; i += 1) {
    const a = Math.random() * Math.PI * 2;
    addParticle(state, {
      x,
      y,
      vx: Math.cos(a) * (80 + Math.random() * 160),
      vy: Math.sin(a) * (80 + Math.random() * 160),
      maxLife: 0.25 + Math.random() * 0.2,
      size: 2,
      color: '#ffd23f',
      type: 'spark',
    });
  }
}

export function addBlood(state, x, y) {
  for (let i = 0; i < 6; i += 1) {
    const a = Math.random() * Math.PI * 2;
    addParticle(state, {
      x,
      y,
      vx: Math.cos(a) * (40 + Math.random() * 90),
      vy: Math.sin(a) * (40 + Math.random() * 90),
      maxLife: 0.4,
      size: 3,
      color: '#a01818',
      type: 'dot',
    });
  }
}

export function addMuzzle(state, x, y, angle) {
  addParticle(state, {
    x: x + Math.cos(angle) * 18,
    y: y + Math.sin(angle) * 18,
    vx: 0,
    vy: 0,
    maxLife: 0.07,
    size: 9,
    color: '#ffe066',
    type: 'flash',
  });
}

export function addTracer(state, x1, y1, x2, y2) {
  addParticle(state, {
    x: x1,
    y: y1,
    x2,
    y2,
    vx: 0,
    vy: 0,
    maxLife: 0.09,
    size: 2,
    color: 'rgba(255,240,150,0.9)',
    type: 'tracer',
  });
}

export function stepParticles(state, dt) {
  for (const p of state.particles) {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.4 * dt;
    p.vy *= 1 - 2.4 * dt;
    if (p.type === 'smoke') p.size += 14 * dt;
  }
  state.particles = state.particles.filter((p) => p.life < p.maxLife);
  state.skids = state.skids.filter((s) => s.life < 14);
  for (const s of state.skids) s.life += dt;
}
