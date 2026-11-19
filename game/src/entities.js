// The moving things: the player, cars (traffic, parked and police),
// pedestrians, gang enemies and bullets. Factories build them; the small
// physics helpers here move them. The world module owns the rules that
// decide what they do.

import { AVENUES, CAR, COP, PLAYER, STREETS, TRAFFIC, WORLD } from './config.js';
import { isOnRoad, nearestRoadPoint } from './city.js';

export const CAR_COLORS = [
  '#c94f43', '#4a7d9a', '#d8c95a', '#e8e2d2', '#5a5f6a', '#7a4a8a',
  '#4a8a5a', '#c98a2e', '#3f6d8a', '#8a3f4a', '#9aa0a8', '#2e6b5a',
];

export function createPlayer(x, y) {
  return {
    kind: 'player',
    x, y,
    angle: -Math.PI / 2,
    radius: PLAYER.radius,
    health: PLAYER.maxHealth,
    speed: 0,
    mag: PLAYER.magSize,
    reloadTimer: 0,
    shootTimer: 0,
    inCar: null,
    running: false,
  };
}

// A car is an oriented rectangle with a heading, a forward speed and a
// sideways slide (the drift). Two circles (nose and tail) approximate it
// for building collisions, which keeps the math cheap and stable.
export function createCar(id, x, y, angle, color, opts = {}) {
  return {
    id,
    kind: opts.police ? 'police' : 'car',
    x, y,
    angle,
    speed: opts.speed ?? 0,
    slide: 0,
    color,
    police: !!opts.police,
    driver: opts.driver ?? true,
    parked: !!opts.parked,
    health: CAR.maxHealth,
    ramTimer: 0,
    crashTimer: 0,
    // Which axis of the road grid this car follows, for traffic.
    axis: opts.axis ?? 'x',
    dir: opts.dir ?? 1,
    lane: opts.lane ?? 0,
    targetSpeed: opts.targetSpeed ?? TRAFFIC.carSpeed,
    turnTimer: 0,
  };
}

export function createPedestrian(id, x, y, random) {
  return {
    id,
    kind: 'ped',
    x, y,
    radius: 11,
    angle: random.range(0, Math.PI * 2),
    speed: random.range(35, 70),
    // Pedestrians walk along a road axis, then pick a new one.
    axis: random.chance(0.5) ? 'x' : 'y',
    dir: random.chance(0.5) ? 1 : -1,
    walkTimer: random.range(3, 9),
    fleeTimer: 0,
    color: random.pick(['#d8a24a', '#7a9ac9', '#c97a8a', '#8ac97a', '#b09ac9', '#e8e2d2']),
  };
}

export function createFootCop(id, x, y) {
  return {
    id,
    kind: 'footcop',
    x, y,
    radius: 12,
    angle: 0,
    speed: COP.footSpeed,
    bustTimer: 0,
    color: '#2e4a7a',
  };
}

export function createEnemy(id, x, y) {
  return {
    id,
    kind: 'enemy',
    x, y,
    radius: 12,
    angle: 0,
    health: 100,
    shootTimer: 1.2,
    color: '#8a2e26',
  };
}

export function createBullet(x, y, angle, speed, damage, friendly) {
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    friendly,
    life: 1.1,
  };
}

// --- Car physics --------------------------------------------------------

// Advance one car one step. `drive` holds the driver's inputs:
// throttle -1..1, steer -1..1, handbrake true/false. The car accelerates
// along its heading, loses sideways slide to grip, and drifts when the
// handbrake is down or the steering is hard at speed.
export function stepCarPhysics(car, drive, dt) {
  const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const right = { x: -forward.y, y: forward.x };

  if (drive.throttle > 0) {
    car.speed += CAR.accel * drive.throttle * dt;
  } else if (drive.throttle < 0) {
    if (car.speed > 8) car.speed -= CAR.brake * dt;
    else car.speed += CAR.reverseAccel * drive.throttle * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 140 * dt;
    if (Math.abs(car.speed) < 6) car.speed = 0;
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));

  // Steering bites harder at speed, but a parked car cannot turn.
  const steerAmount = drive.steer * CAR.turnRate * dt * Math.min(1, Math.abs(car.speed) / 120 + 0.15);
  car.angle += steerAmount * Math.sign(car.speed || 1);

  // Grip eats the sideways slide; the handbrake and hard steering let it
  // live, which is what makes the drift.
  const grip = drive.handbrake ? CAR.handbrakeGrip : (Math.abs(drive.steer) > 0.7 && Math.abs(car.speed) > 240 ? CAR.driftGrip : CAR.grip);
  car.slide *= Math.exp(-grip * dt);
  if (drive.handbrake) car.slide += drive.steer * 260 * dt;

  const vx = forward.x * car.speed + right.x * car.slide;
  const vy = forward.y * car.speed + right.y * car.slide;
  car.x += vx * dt;
  car.y += vy * dt;

  return { drifting: Math.abs(car.slide) > 90 || drive.handbrake };
}

// The two collision circles of a car, nose and tail.
export function carCircles(car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  return [
    { x: car.x + fx * 18, y: car.y + fy * 18, r: 17 },
    { x: car.x - fx * 18, y: car.y - fy * 18, r: 17 },
  ];
}

// A traffic car picks a road axis and a lane offset, then drives along
// it. At an intersection it may turn onto the crossing road.
export function spawnTrafficCar(id, random) {
  const onAvenue = random.chance(0.5);
  let x, y, axis, dir, lane;
  if (onAvenue) {
    const ax = random.pick(AVENUES);
    axis = 'y';
    dir = random.chance(0.5) ? 1 : -1;
    lane = dir * 16;
    x = ax + lane;
    y = random.range(100, WORLD.height - 100);
  } else {
    const sy = random.pick(STREETS);
    axis = 'x';
    dir = random.chance(0.5) ? 1 : -1;
    lane = dir * 16;
    x = random.range(100, WORLD.width - 100);
    y = sy + lane;
  }
  return createCar(id, x, y, axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
    random.pick(CAR_COLORS), { axis, dir, lane, speed: random.range(110, 180) });
}

// A parked car sits on a road edge, parallel to the road, clear of the
// sidewalk and clear of any building: on the asphalt, not through a wall.
export function spawnParkedCar(id, random, city) {
  for (let tries = 0; tries < 30; tries += 1) {
    const onAvenue = random.chance(0.5);
    let x, y, angle;
    if (onAvenue) {
      const ax = random.pick(AVENUES);
      const side = random.chance(0.5) ? 1 : -1;
      x = ax + side * 40;
      y = random.range(120, WORLD.height - 120);
      angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const sy = random.pick(STREETS);
      const side = random.chance(0.5) ? 1 : -1;
      x = random.range(120, WORLD.width - 120);
      y = sy + side * 40;
      angle = side > 0 ? 0 : Math.PI;
    }
    if (x > 2880) continue; // keep the beach clear of parked cars
    const car = createCar(id, x, y, angle, random.pick(CAR_COLORS), { parked: true, driver: false, speed: 0 });
    const hit = carCircles(car).some((c) => city.buildings.some(
      (b) => c.x > b.x - c.r && c.x < b.x + b.w + c.r && c.y > b.y - c.r && c.y < b.y + b.h + c.r,
    ));
    if (!hit) return car;
  }
  return null;
}

// A pedestrian starts on a road, never inside a building.
export function spawnPedestrian(id, random, city, nearX, nearY) {
  for (let tries = 0; tries < 20; tries += 1) {
    const p = nearestRoadPoint(
      nearX + random.range(-500, 500),
      nearY + random.range(-500, 500),
    );
    if (p.x > 2900) continue;
    const ped = createPedestrian(id, p.x, p.y, random);
    if (!city.buildings.some((b) => ped.x > b.x && ped.x < b.x + b.w && ped.y > b.y && ped.y < b.y + b.h)) {
      return ped;
    }
  }
  return null;
}

export { isOnRoad };
