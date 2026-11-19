// Solmar Bay — the moving things: player, cars, pedestrians, cops, enemies, bullets.
import { CFG } from './config.js';
import { nextId } from './random.js';
import { isOnRoad, nearestRoadPoint, roadPointNear, pointInBuilding, clampToWorld } from './city.js';

export function createPlayer(x, y) {
  return {
    id: nextId(), kind: 'player', x, y, vx: 0, vy: 0, angle: 0,
    hp: CFG.PLAYER_HP, r: CFG.PLAYER_R,
    inCar: null, // car object while driving
    mag: CFG.MAG_SIZE, reloadT: 0, fireT: 0,
    money: 250, moving: false, running: false,
  };
}

export function createCar(type, x, y, angle, color) {
  return {
    id: nextId(), kind: 'car', type, // 'sedan' | 'taxi' | 'truck' | 'sport' | 'police'
    x, y, angle, speed: 0, vx: 0, vy: 0, color,
    hp: CFG.CAR.HP, driver: type === 'police' ? 'cop' : 'civilian',
    occupied: type !== 'parked',
    parked: type === 'parked',
    locked: type === 'police',
    crashed: false, ramT: 0, hitCooldowns: {},
    // traffic AI
    dir: 0, // 0 east, 1 south, 2 west, 3 north (axis-aligned road travel)
    waitT: 0, targetSpeed: CFG.TRAFFIC_SPEED,
  };
}

// Two circles (nose + tail) used for building and car-car collisions.
export function carCircles(car) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const L = CFG.CAR.LENGTH;
  return [
    { x: car.x + c * L * 0.26, y: car.y + s * L * 0.26, r: CFG.CAR.WIDTH * 0.62 },
    { x: car.x - c * L * 0.26, y: car.y - s * L * 0.26, r: CFG.CAR.WIDTH * 0.62 },
  ];
}

// Arcade car physics. ctl: {throttle -1..1, steer -1..1, handbrake bool}.
export function stepCarPhysics(car, ctl, dt) {
  const C = CFG.CAR;
  const maxFwd = car.type === 'police' ? CFG.POLICE_CAR_MAX : C.MAX_SPEED;
  if (ctl.throttle > 0) car.speed += C.ACCEL * ctl.throttle * dt;
  else if (ctl.throttle < 0) {
    if (car.speed > 12) car.speed -= C.BRAKE * dt; // brake
    else car.speed += C.REVERSE_ACCEL * ctl.throttle * dt; // reverse
  }
  // Drag + rolling resistance
  car.speed -= car.speed * C.DRAG * dt;
  if (Math.abs(car.speed) < 4 && ctl.throttle === 0) car.speed = 0;
  car.speed = Math.max(-C.MAX_REVERSE, Math.min(maxFwd, car.speed));

  const grip = ctl.handbrake ? C.GRIP * 0.28 : C.GRIP;
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 90);
  const turnRate = C.TURN * ctl.steer * steerAuthority * Math.sign(car.speed || 1) * (ctl.handbrake ? 1.5 : 1);
  car.angle += turnRate * dt;

  // Velocity follows the heading, with drift when grip is low.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const fwd = car.vx * fx + car.vy * fy;
  const latx = car.vx - fwd * fx;
  const laty = car.vy - fwd * fy;
  const latDecay = Math.exp(-grip * dt);
  car.vx = fwd * fx + latx * latDecay;
  car.vy = fwd * fy + laty * latDecay;
  // Blend forward velocity toward the car's speed.
  car.vx += (car.speed * fx - car.vx) * Math.min(1, 8 * dt);
  car.vy += (car.speed * fy - car.vy) * Math.min(1, 8 * dt);
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  return Math.abs(car.vx * -fy + car.vy * fx); // lateral slide magnitude (for skid marks)
}

export function createPedestrian(x, y) {
  return {
    id: nextId(), kind: 'ped', x, y, angle: Math.random() * Math.PI * 2,
    speed: 42 + Math.random() * 26, r: 11, fleeing: false, fleeT: 0,
    color: ['#d9a05b', '#8e6cc8', '#5cb85c', '#e07a5f', '#6cb8d9'][Math.floor(Math.random() * 5)],
    dir: Math.random() * Math.PI * 2,
  };
}

export function createFootCop(x, y) {
  return {
    id: nextId(), kind: 'footcop', x, y, angle: 0, speed: CFG.FOOT_COP_SPEED,
    r: 12, catchT: 0,
  };
}

export function createEnemy(x, y) {
  return {
    id: nextId(), kind: 'enemy', x, y, angle: 0, hp: CFG.ENEMY_HP,
    speed: CFG.ENEMY_SPEED, r: 12, shootT: 1 + Math.random(),
  };
}

export function createBullet(x, y, angle, friendly) {
  return {
    id: nextId(), kind: 'bullet', x, y, angle, friendly,
    speed: CFG.BULLET_SPEED, life: CFG.BULLET_LIFE, r: 3,
  };
}

export function spawnTrafficCar(city, rng, nearX, nearY) {
  const p = roadPointNear(city, rng, nearX, nearY, 700);
  const horizontal = rng.chance(0.5);
  const type = rng.chance(0.14) ? 'taxi' : rng.pick(['sedan', 'sedan', 'sedan', 'truck', 'sport']);
  const angle = horizontal ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
  const color = type === 'taxi' ? CFG.TAXI_COLOR : rng.pick(CFG.CAR_COLORS);
  const car = createCar(type, p.x, p.y, angle, color);
  car.dir = angle === 0 ? 0 : angle === Math.PI / 2 ? 1 : angle === Math.PI ? 2 : 3;
  car.targetSpeed = CFG.TRAFFIC_SPEED * rng.range(0.8, 1.15);
  return car;
}

export function spawnParkedCar(city, rng) {
  for (let tries = 0; tries < 24; tries++) {
    const horizontal = rng.chance(0.5);
    let x, y, angle;
    if (horizontal) {
      const sy = rng.pick(CFG.STREETS);
      x = rng.range(120, CFG.SAND_X - 120);
      y = sy + (rng.chance(0.5) ? 1 : -1) * (CFG.ROAD_W / 2 - 14);
      angle = rng.chance(0.5) ? 0 : Math.PI;
    } else {
      const ax = rng.pick(CFG.AVENUES);
      x = ax + (rng.chance(0.5) ? 1 : -1) * (CFG.ROAD_W / 2 - 14);
      y = rng.range(120, CFG.WORLD_H - 120);
      angle = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
    }
    if (pointInBuilding(city, x, y, 30)) continue;
    const car = createCar('parked', x, y, angle, rng.pick(CFG.CAR_COLORS));
    car.occupied = false;
    car.driver = null;
    return car;
  }
  return null;
}

export function spawnPedestrian(city, rng, nearX, nearY) {
  for (let tries = 0; tries < 20; tries++) {
    const x = nearX + rng.range(-500, 500);
    const y = nearY + rng.range(-500, 500);
    if (x < 30 || y < 30 || x > CFG.SAND_X - 30 || y > CFG.WORLD_H - 30) continue;
    if (isOnRoad(city, x, y)) continue;
    if (pointInBuilding(city, x, y, 6)) continue;
    return createPedestrian(x, y);
  }
  return createPedestrian(nearestRoadPoint(city, nearX, nearY).x + 60, nearestRoadPoint(city, nearX, nearY).y + 60);
}

export { clampToWorld };
