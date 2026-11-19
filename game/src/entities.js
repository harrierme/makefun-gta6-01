// Entity factories: cars, pedestrians, foot cops, gang enemies, bullets and
// particles. Factories only build the plain objects; the rules that move
// them live in world.js, so this file is easy to read on its own.

import { CAR, ENEMY } from './config.js';
import { pick } from './random.js';

export const CAR_COLORS = [
  '#c94f3d', '#3d7ac9', '#e8b23a', '#7dc383', '#8a6fc9', '#d8d8d8',
  '#2f2f38', '#c97a3d', '#4fa8a0', '#b23d7a', '#a8b23d', '#6b8a9a',
];

export const PED_SHIRTS = ['#7a9ac9', '#c98a7a', '#8ac97a', '#c9b23d', '#9a7ac9', '#d8d8d8', '#5a6b7a'];

export function makeCar(random, x, y, angle, isPolice) {
  return {
    kind: 'car',
    x,
    y,
    angle,
    speed: 0,
    // Velocity is kept separate from the heading so drift is visible.
    vx: 0,
    vy: 0,
    color: isPolice ? '#2f6fb2' : pick(random, CAR_COLORS),
    isPolice: Boolean(isPolice),
    health: CAR.health,
    driver: null, // 'traffic' | 'player' | 'police' | null (parked, empty)
    siren: false,
    // Traffic cars follow a road; police cars chase the player.
    roadAxis: 'v',
    roadCoord: 0,
    roadDir: 1,
    targetSpeed: 0,
    smoke: 0,
    skid: 0,
    // Seconds until this car can take crash damage again.
    crashTimer: 0,
    id: 0,
  };
}

export function makePed(random, x, y) {
  return {
    kind: 'ped',
    x,
    y,
    angle: random() * Math.PI * 2,
    speed: 0,
    shirt: pick(random, PED_SHIRTS),
    // 'walk' | 'flee' | 'drive-away'
    mood: 'walk',
    walkTimer: 1 + random() * 3,
    fleeX: 0,
    fleeY: 0,
    id: 0,
  };
}

export function makeFootCop(x, y) {
  return {
    kind: 'cop',
    x,
    y,
    angle: 0,
    speed: 0,
    // Seconds spent in contact with the player; a full bar means busted.
    bustProgress: 0,
    id: 0,
  };
}

export function makeEnemy(x, y) {
  return {
    kind: 'enemy',
    x,
    y,
    angle: 0,
    health: ENEMY.health,
    shootTimer: 0.5 + Math.random() * 1.5,
    walkTimer: 0,
    id: 0,
  };
}

export function makeBullet(x, y, angle, speed, fromPlayer) {
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    travelled: 0,
    fromPlayer,
  };
}

export function makeParticle(x, y, kind, life) {
  return { x, y, kind, life, maxLife: life, vx: 0, vy: 0 };
}


/** The player's starting car is none: Reno Vega starts on foot. */
export function makePlayer(x, y) {
  return {
    x,
    y,
    angle: -Math.PI / 2,
    onFoot: true,
    car: null,
    health: 100,
    ammo: 12,
    reloadTimer: 0,
    fireTimer: 0,
    sinceHit: 99,
    moving: false,
  };
}
