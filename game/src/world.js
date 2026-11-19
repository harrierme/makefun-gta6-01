// The simulation: Reno Vega on foot and behind the wheel, traffic,
// pedestrians, the CBPD's wanted response, gang enemies, bullets, the
// clock and the camera. No drawing and no DOM here — step() advances one
// fixed step and returns what happened as bit flags, so the caller can
// play sounds and change screens without the world knowing about them.

import {
  BEACH, CAR, COP, ENEMY, GUN, HOUR_SECONDS, PEDS, PLAYER, ROADS, STEP, TRAFFIC, WANTED, WORLD,
} from './config.js';
import { buildCity, districtAt, isBeach, isOnRoad, pointInBuilding, randomRoadPoint, randomSidewalkPoint, randomSpawnPoint, resolveBuildingCollision } from './city.js';
import { createRandom, pick } from './random.js';
import { makeBullet, makeCar, makeEnemy, makeFootCop, makeParticle, makePed, makePlayer } from './entities.js';
import { freshMissionState, nextMissionStart, noteKill, notePickup, startMission, updateMission } from './missions.js';

export const EVENT_SHOT = 1;
export const EVENT_ENEMY_SHOT = 2;
export const EVENT_CRASH = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WASTED = 16;
export const EVENT_MISSION_DONE = 32;
export const EVENT_MISSION_FAIL = 64;
export const EVENT_PICKUP = 128;
export const EVENT_STEAL = 256;
export const EVENT_RELOAD = 512;
export const EVENT_MISSION_START = 1024;

const CAR_RADIUS = 20;
const BULLET_HIT_CAR = 24;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function turnToward(angle, target, maxStep) {
  let diff = target - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return angle + clamp(diff, -maxStep, maxStep);
}

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = buildCity(seed);
  const state = {
    seed,
    city,
    time: 0,
    hour: 17.5, // golden hour at the start of a new game
    money: 250,
    wanted: 0,
    sinceCrime: 99,
    coolTimer: 0,
    player: makePlayer(0, 0),
    cars: [],
    peds: [],
    footCops: [],
    enemies: [],
    bullets: [],
    particles: [],
    skids: [],
    pickups: [],
    mission: freshMissionState(),
    camera: { x: 0, y: 0 },
    shake: 0,
    nextId: 1,
    stats: { shots: 0, carsStolen: 0, missionsDone: 0 },
    busted: false,
    wasted: false,
  };

  function spawnTrafficCar(farFromPlayer) {
    const point = randomRoadPoint(random);
    if (farFromPlayer && dist(point.x, point.y, state.player.x, state.player.y) < 500) return;
    // The car's axis follows the road the point sits on — never a vertical
    // car on a street, which would drive straight through a block.
    const vertical = point.vertical;
    const car = makeCar(random, point.x, point.y, vertical ? Math.PI / 2 : 0, false);
    car.driver = 'traffic';
    car.roadAxis = vertical ? 'v' : 'h';
    car.roadCoord = vertical ? point.x : point.y;
    car.roadDir = random() < 0.5 ? 1 : -1;
    car.targetSpeed = TRAFFIC.speed + random() * TRAFFIC.speedJitter;
    car.angle = vertical ? (car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.roadDir > 0 ? 0 : Math.PI);
    car.id = state.nextId;
    state.nextId += 1;
    state.cars.push(car);
    return car;
  }


  function spawnPed() {
    const point = randomSidewalkPoint(random);
    const ped = makePed(random, point.x, point.y);
    ped.id = state.nextId;
    state.nextId += 1;
    state.peds.push(ped);
  }

  function spawnPoliceCar() {
    const angle = random() * Math.PI * 2;
    const radius = 900 + random() * 400;
    let x = state.player.x + Math.cos(angle) * radius;
    let y = state.player.y + Math.sin(angle) * radius;
    x = clamp(x, 60, WORLD.width - 60);
    y = clamp(y, 60, WORLD.height - 60);
    const car = makeCar(random, x, y, 0, true);
    car.driver = 'police';
    car.siren = true;
    car.targetSpeed = COP.carSpeed;
    car.id = state.nextId;
    state.nextId += 1;
    state.cars.push(car);
    return car;
  }

  function spawnFootCop() {
    const angle = random() * Math.PI * 2;
    // Spawned outside the radius that counts as "seen", so a fresh cop
    // does not by itself keep the heat from cooling.
    const cop = makeFootCop(
      clamp(state.player.x + Math.cos(angle) * 520, 40, WORLD.width - 40),
      clamp(state.player.y + Math.sin(angle) * 520, 40, WORLD.height - 40),
    );
    cop.id = state.nextId;
    state.nextId += 1;
    state.footCops.push(cop);
  }

  function addCrime(stars) {
    state.wanted = clamp(state.wanted + stars, 0, WANTED.max);
    state.sinceCrime = 0;
    state.coolTimer = 0;
  }

  function burst(x, y, kind, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const particle = makeParticle(x, y, kind, 0.3 + random() * 0.5);
      particle.vx = Math.cos(angle) * speed * (0.4 + random() * 0.6);
      particle.vy = Math.sin(angle) * speed * (0.4 + random() * 0.6);
      state.particles.push(particle);
    }
  }

  function reset() {
    const spawn = randomSpawnPoint(random);
    state.time = 0;
    state.hour = 17.5;
    state.money = 250;
    state.wanted = 0;
    state.sinceCrime = 99;
    state.coolTimer = 0;
    state.player = makePlayer(spawn.x, spawn.y);
    state.cars.length = 0;
    state.peds.length = 0;
    state.footCops.length = 0;
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.particles.length = 0;
    state.skids.length = 0;
    state.pickups.length = 0;
    state.mission = freshMissionState();
    state.shake = 0;
    state.busted = false;
    state.wasted = false;
    state.stats = { shots: 0, carsStolen: 0, missionsDone: 0 };
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar(false);
    for (let i = 0; i < PEDS.count; i += 1) spawnPed();
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
  }

  // ---- player on foot -------------------------------------------------
  function stepOnFoot(dt, input) {
    const player = state.player;
    const mx = input.moveX || 0;
    const my = input.moveY || 0;
    const moving = mx !== 0 || my !== 0;
    player.moving = moving;
    if (moving) {
      const len = Math.hypot(mx, my);
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      player.x += (mx / len) * speed * dt;
      player.y += (my / len) * speed * dt;
      player.angle = Math.atan2(my, mx);
    }
    player.x = clamp(player.x, 14, BEACH.oceanX - 8);
    player.y = clamp(player.y, 14, WORLD.height - 14);
    resolveBuildingCollision(city, player, PLAYER.radius);

    if (player.reloadTimer > 0) {
      player.reloadTimer -= dt;
      // The magazine is full again the moment the reload finishes.
      if (player.reloadTimer <= 0) player.ammo = GUN.magSize;
    }
    if (player.fireTimer > 0) player.fireTimer -= dt;
    if (player.sinceHit < 99) player.sinceHit += dt;
    if (player.sinceHit > PLAYER.regenDelay && player.health < PLAYER.health) {
      player.health = Math.min(PLAYER.health, player.health + PLAYER.regenRate * dt);
    }

    if (input.reload && player.reloadTimer <= 0 && player.ammo < GUN.magSize) {
      player.reloadTimer = GUN.reloadSeconds;
      return EVENT_RELOAD;
    }
    return 0;
  }

  function playerShoot(input) {
    const player = state.player;
    if (!player.onFoot || player.reloadTimer > 0 || player.fireTimer > 0) return 0;
    if (player.ammo <= 0) {
      player.reloadTimer = GUN.reloadSeconds;
      return EVENT_RELOAD;
    }
    const aimAngle = Math.atan2(input.aimWorldY - player.y, input.aimWorldX - player.x);
    const spread = (random() - 0.5) * 2 * GUN.spread;
    const bullet = makeBullet(
      player.x + Math.cos(aimAngle) * 18,
      player.y + Math.sin(aimAngle) * 18,
      aimAngle + spread,
      GUN.bulletSpeed,
      true,
    );
    state.bullets.push(bullet);
    player.ammo -= 1;
    player.fireTimer = GUN.fireInterval;
    player.angle = aimAngle;
    state.stats.shots += 1;
    burst(player.x + Math.cos(aimAngle) * 20, player.y + Math.sin(aimAngle) * 20, 'muzzle', 3, 120);
    if (state.wanted < 1) addCrime(WANTED.shootStars);
    else state.sinceCrime = 0;
    return EVENT_SHOT;
  }

  function nearestCar(maxDist) {
    const player = state.player;
    let best = null;
    let bestDist = maxDist;
    for (const car of state.cars) {
      if (car.health <= 0) continue;
      const d = dist(player.x, player.y, car.x, car.y);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  function stealCar(car) {
    const player = state.player;
    // A traffic driver bails out and runs; a parked car is just taken.
    if (car.driver === 'traffic') {
      const driver = makePed(random, car.x, car.y);
      driver.mood = 'flee';
      driver.fleeX = car.x - player.x;
      driver.fleeY = car.y - player.y;
      driver.id = state.nextId;
      state.nextId += 1;
      state.peds.push(driver);
    }
    car.driver = 'player';
    player.car = car;
    player.onFoot = false;
    player.x = car.x;
    player.y = car.y;
    state.stats.carsStolen += 1;
    // Stealing in front of a witness brings the heat; alone on a quiet
    // street, nobody notices.
    let witnessed = false;
    for (const ped of state.peds) if (dist(ped.x, ped.y, car.x, car.y) < 420) witnessed = true;
    for (const cop of state.footCops) if (dist(cop.x, cop.y, car.x, car.y) < 500) witnessed = true;
    if (witnessed) addCrime(WANTED.stealCarStars);
    return EVENT_STEAL;
  }

  function exitCar() {
    const player = state.player;
    const car = player.car;
    if (!car) return;
    car.driver = null;
    const side = Math.cos(car.angle + Math.PI / 2);
    const sideY = Math.sin(car.angle + Math.PI / 2);
    player.x = clamp(car.x + side * 34, 14, WORLD.width - 14);
    player.y = clamp(car.y + sideY * 34, 14, WORLD.height - 14);
    resolveBuildingCollision(city, player, PLAYER.radius);
    player.car = null;
    player.onFoot = true;
  }

  // ---- driving --------------------------------------------------------
  function stepDriving(dt, input) {
    const player = state.player;
    const car = player.car;
    if (!car || car.health <= 0) return 0;
    const forwardX = Math.cos(car.angle);
    const forwardY = Math.sin(car.angle);
    const forwardSpeed = car.vx * forwardX + car.vy * forwardY;
    const rightX = -forwardY;
    const rightY = forwardX;
    const lateralSpeed = car.vx * rightX + car.vy * rightY;

    let newForward = forwardSpeed;
    if (input.moveY < 0) newForward += CAR.accel * dt; // W / up: accelerate
    else if (input.moveY > 0) newForward -= CAR.reverseAccel * dt; // S / down: brake, then reverse
    else if (Math.abs(forwardSpeed) < 12) newForward = 0;
    else newForward -= Math.sign(forwardSpeed) * CAR.drag * 60 * dt;

    const grip = input.handbrake ? CAR.handbrakeGrip : CAR.grip;
    const newLateral = lateralSpeed * Math.exp(-grip * dt);

    // Steering bites harder the faster the car goes, up to a point.
    const steerInput = input.moveX || 0;
    const steerAuthority = clamp(Math.abs(forwardSpeed) / 180, 0, 1);
    car.angle += steerInput * CAR.steerRate * steerAuthority * Math.sign(forwardSpeed || 1) * dt;

    const offRoad = !isOnRoad(car.x, car.y) && !isBeach(car.x);
    if (offRoad) newForward -= Math.sign(newForward) * CAR.offRoadDrag * 60 * dt;
    newForward = clamp(newForward, -CAR.maxReverse, CAR.maxSpeed);

    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const rx = -fy;
    const ry = fx;
    car.vx = fx * newForward + rx * newLateral;
    car.vy = fy * newForward + ry * newLateral;
    car.speed = newForward;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.x = clamp(car.x, 24, BEACH.oceanX - 30);
    car.y = clamp(car.y, 24, WORLD.height - 24);

    // Skid marks when the handbrake is on or the car is sliding sideways.
    if ((input.handbrake && Math.abs(forwardSpeed) > 120) || Math.abs(newLateral) > 140) {
      state.skids.push({ x: car.x, y: car.y, angle: car.angle, life: 6 });
      if (state.skids.length > 320) state.skids.shift();
    }

    if (car.crashTimer > 0) car.crashTimer -= dt;
    // resolveBuildingCollision already pushed the car out of the wall; a
    // hard hit damages it, a gentle scrape just bleeds speed, so a car can
    // slide along a wall instead of juddering against it.
    const hitBuilding = resolveBuildingCollision(city, car, CAR_RADIUS);
    if (hitBuilding) {
      const impact = Math.abs(forwardSpeed);
      if (impact > 200) {
        if (car.crashTimer <= 0) {
          car.health -= (impact - 200) * 0.04;
          player.health -= impact > CAR.hardCrashSpeed ? 6 : 0;
          car.crashTimer = 0.5;
        }
        car.vx *= -0.25;
        car.vy *= -0.25;
        car.speed *= -0.25;
        state.shake = Math.min(10, impact / 60);
        burst(car.x, car.y, 'spark', 8, 200);
        if (car.health <= 0) wreckCar(car);
        return EVENT_CRASH;
      }
      car.vx *= 0.6;
      car.vy *= 0.6;
      car.speed *= 0.6;
    }
    player.x = car.x;
    player.y = car.y;
    if (car.health < 45 && random() < dt * 6) {
      state.particles.push(makeParticle(car.x, car.y - 10, 'smoke', 1.2));
    }
    return 0;
  }

  function wreckCar(car) {
    car.health = 0;
    car.driver = null;
    burst(car.x, car.y, 'smoke', 22, 160);
    burst(car.x, car.y, 'spark', 14, 260);
    if (state.player.car === car) {
      state.player.car = null;
      state.player.onFoot = true;
      state.player.x = clamp(car.x + 40, 14, WORLD.width - 14);
      state.player.y = car.y;
    }
  }

  // ---- traffic --------------------------------------------------------
  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.driver !== 'traffic') continue;
      // Slow for the car ahead in the same lane (including a car whose
      // driver just got out); wrecks are skipped, they are out of the way.
      let ahead = null;
      for (const other of state.cars) {
        if (other === car || other.health <= 0) continue;
        if (other.roadAxis !== car.roadAxis || other.roadCoord !== car.roadCoord) continue;
        const along = car.roadAxis === 'v' ? (other.y - car.y) * car.roadDir : (other.x - car.x) * car.roadDir;
        if (along > 0 && along < 90 && (ahead === null || along < ahead)) ahead = along;
      }
      const target = ahead === null ? car.targetSpeed : Math.max(0, car.targetSpeed - (90 - ahead) * 2);
      const current = Math.abs(car.speed);
      car.speed += clamp(target - current, -260 * dt, 200 * dt);
      if (car.roadAxis === 'v') {
        car.y += car.roadDir * car.speed * dt;
        car.vx = 0;
        car.vy = car.roadDir * car.speed;
        car.angle = car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        // At an intersection, sometimes turn onto a street.
        for (const street of ROADS.streets) {
          if (Math.abs(car.y - street) < 4 && random() < 0.0016) {
            car.roadAxis = 'h';
            car.roadCoord = street;
            car.roadDir = random() < 0.5 ? 1 : -1;
          }
        }
        if (car.y < 40) car.y = WORLD.height - 40;
        if (car.y > WORLD.height - 40) car.y = 40;
      } else {
        car.x += car.roadDir * car.speed * dt;
        car.vx = car.roadDir * car.speed;
        car.vy = 0;
        car.angle = car.roadDir > 0 ? 0 : Math.PI;
        for (const avenue of ROADS.avenues) {
          if (Math.abs(car.x - avenue) < 4 && random() < 0.0016) {
            car.roadAxis = 'v';
            car.roadCoord = avenue;
            car.roadDir = random() < 0.5 ? 1 : -1;
          }
        }
        // The beach is the end of the road: loop back to the west edge.
        if (car.x < 40) car.x = 2700;
        if (car.x > 2700) car.x = 40;
      }
    }
  }

  // ---- pedestrians ----------------------------------------------------
  function stepPeds(dt) {
    for (const ped of state.peds) {
      const player = state.player;
      const playerX = player.onFoot ? player.x : player.car.x;
      const playerY = player.onFoot ? player.y : player.car.y;
      const playerSpeed = player.onFoot ? 0 : Math.abs(player.car.speed);
      const threat = dist(ped.x, ped.y, playerX, playerY) < (player.onFoot ? 60 : 130) && playerSpeed > 60;
      if (ped.mood === 'flee' || threat) {
        ped.mood = 'flee';
        const away = angleTo(playerX, playerY, ped.x, ped.y);
        ped.x += Math.cos(away) * PEDS.fleeSpeed * dt;
        ped.y += Math.sin(away) * PEDS.fleeSpeed * dt;
        ped.angle = away;
        if (dist(ped.x, ped.y, playerX, playerY) > 320) ped.mood = 'walk';
      } else {
        ped.walkTimer -= dt;
        if (ped.walkTimer <= 0) {
          const point = randomSidewalkPoint(random);
          ped.fleeX = point.x;
          ped.fleeY = point.y;
          ped.walkTimer = 4 + random() * 6;
        }
        const targetAngle = angleTo(ped.x, ped.y, ped.fleeX, ped.fleeY);
        if (dist(ped.x, ped.y, ped.fleeX, ped.fleeY) > 12) {
          ped.x += Math.cos(targetAngle) * PEDS.walkSpeed * dt;
          ped.y += Math.sin(targetAngle) * PEDS.walkSpeed * dt;
          ped.angle = targetAngle;
        }
      }
      ped.x = clamp(ped.x, 14, WORLD.width - 14);
      ped.y = clamp(ped.y, 14, WORLD.height - 14);
      resolveBuildingCollision(city, ped, 10);
    }
  }

  // ---- police ---------------------------------------------------------
  function stepPolice(dt) {
    const player = state.player;
    const playerX = player.onFoot ? player.x : player.car.x;
    const playerY = player.onFoot ? player.y : player.car.y;

    // Police cars: keep the right number hunting, spawn more when needed.
    const wantedCars = state.cars.filter((car) => car.driver === 'police' && car.health > 0);
    const wantCars = state.wanted > 0 ? WANTED.carsForStars[state.wanted] : 0;
    if (wantedCars.length < wantCars && random() < dt * 1.2) spawnPoliceCar();
    for (const car of wantedCars) {
      if (dist(car.x, car.y, playerX, playerY) > 1700) {
        car.health = 0; // too far away: the unit gives up and despawns
        continue;
      }
      // Chase the player's predicted position, ramming when close.
      const lead = player.onFoot ? 0 : 0.4;
      const tx = playerX + (player.car ? player.car.vx * lead : 0);
      const ty = playerY + (player.car ? player.car.vy * lead : 0);
      const targetAngle = angleTo(car.x, car.y, tx, ty);
      const d = dist(car.x, car.y, playerX, playerY);
      // The trail goes cold: past 900 px the unit loses the player, heads
      // for the last known spot, and gives up after a few seconds — that is
      // how a getaway works.
      if (d < 900) {
        car.giveUpTimer = 0;
      } else {
        car.giveUpTimer = (car.giveUpTimer ?? 0) + dt;
        if (car.giveUpTimer > 5) {
          car.health = 0;
          continue;
        }
      }
      car.angle = turnToward(car.angle, targetAngle, 2.4 * dt);
      const forwardX = Math.cos(car.angle);
      const forwardY = Math.sin(car.angle);
      const forwardSpeed = car.vx * forwardX + car.vy * forwardY;
      let speed = forwardSpeed + 520 * dt;
      if (d < 70) speed = Math.min(speed, 260); // ease off to ram, not overshoot
      speed = clamp(speed, -120, COP.carSpeed);
      const lateral = (car.vx * -forwardY + car.vy * forwardX) * Math.exp(-CAR.grip * dt);
      car.vx = forwardX * speed + -forwardY * lateral;
      car.vy = forwardY * speed + forwardX * lateral;
      car.speed = speed;
      car.x += car.vx * dt;
      car.y += car.vy * dt;
      car.x = clamp(car.x, 24, WORLD.width - 24);
      car.y = clamp(car.y, 24, WORLD.height - 24);
      resolveBuildingCollision(city, car, CAR_RADIUS);
      // Ramming the player's car hurts it; ramming the player on foot hurts.
      if (player.car && dist(car.x, car.y, player.car.x, player.car.y) < 44) {
        const impact = Math.abs(speed);
        if (impact > 120 && car.crashTimer <= 0) {
          // A ram is a shove, not a wrecking ball: it spins the player's
          // car and costs them control. The damage comes from what they
          // hit next, not from the cruiser itself.
          car.crashTimer = 0.5;
          player.car.vx += (player.car.x - car.x) * 2.2;
          player.car.vy += (player.car.y - car.y) * 2.2;
          car.vx *= -0.2;
          car.vy *= -0.2;
          state.shake = 7;
          burst(player.car.x, player.car.y, 'spark', 6, 180);
          if (player.car.health <= 0) wreckCar(player.car);
        }
      } else if (player.onFoot && dist(car.x, car.y, player.x, player.y) < 34) {
        // Shove the player clear every step, but hurt them at most once a
        // second — a cruiser sitting on top of Reno must not melt his health.
        if (car.crashTimer <= 0) {
          player.health -= 3;
          player.sinceHit = 0;
          car.crashTimer = 1.0;
          state.shake = 8;
        }
        player.x += (player.x - car.x) * 0.6;
        player.y += (player.y - car.y) * 0.6;
      }
    }
    state.cars = state.cars.filter((car) => !(car.driver === 'police' && car.health <= 0 && dist(car.x, car.y, playerX, playerY) > 300));

    // Foot cops: only a threat while the player is on foot and not on a
    // job — during a mission the gang is the threat, and Mara's jobs run
    // while the foot patrol looks the other way.
    const wantCops = player.onFoot && state.wanted > 0 && !state.mission.active
      ? WANTED.footCopsForStars[state.wanted] : 0;
    if (state.footCops.length < wantCops && random() < dt * 1.5) spawnFootCop();
    let busted = false;
    for (const cop of state.footCops) {
      const d = dist(cop.x, cop.y, player.x, player.y);
      if (!player.onFoot || d > 900) {
        cop.bustProgress = 0;
        // Drift back toward the player slowly; they give up past 900 px.
        continue;
      }
      const targetAngle = angleTo(cop.x, cop.y, player.x, player.y);
      cop.angle = targetAngle;
      cop.x += Math.cos(targetAngle) * COP.footSpeed * dt;
      cop.y += Math.sin(targetAngle) * COP.footSpeed * dt;
      resolveBuildingCollision(city, cop, 11);
      if (d < 30) {
        cop.bustProgress += dt;
        if (cop.bustProgress >= COP.bustSeconds) busted = true;
      } else {
        cop.bustProgress = Math.max(0, cop.bustProgress - dt);
      }
    }
    if (busted) return EVENT_BUSTED;
    return 0;
  }

  // ---- enemies --------------------------------------------------------
  function stepEnemies(dt) {
    const player = state.player;
    const playerX = player.onFoot ? player.x : player.car.x;
    const playerY = player.onFoot ? player.y : player.car.y;
    let events = 0;
    for (const enemy of state.enemies) {
      const d = dist(enemy.x, enemy.y, playerX, playerY);
      enemy.shootTimer -= dt;
      if (d < ENEMY.shootRange && d > 60) {
        // Close in, then hold position and shoot.
        const targetAngle = angleTo(enemy.x, enemy.y, playerX, playerY);
        enemy.angle = targetAngle;
        if (d > 260) {
          enemy.x += Math.cos(targetAngle) * ENEMY.speed * dt;
          enemy.y += Math.sin(targetAngle) * ENEMY.speed * dt;
          resolveBuildingCollision(city, enemy, 12);
        } else if (enemy.shootTimer <= 0) {
          enemy.shootTimer = ENEMY.shootInterval + random() * 0.8;
          const spread = (random() - 0.5) * 2 * ENEMY.spread;
          state.bullets.push(makeBullet(
            enemy.x + Math.cos(targetAngle) * 18,
            enemy.y + Math.sin(targetAngle) * 18,
            targetAngle + spread,
            GUN.bulletSpeed * 0.8,
            false,
          ));
          burst(enemy.x + Math.cos(targetAngle) * 20, enemy.y + Math.sin(targetAngle) * 20, 'muzzle', 2, 100);
          events |= EVENT_ENEMY_SHOT;
        }
      }
    }
    return events;
  }

  // ---- bullets --------------------------------------------------------
  function stepBullets(dt) {
    const player = state.player;
    let events = 0;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.travelled += Math.hypot(bullet.vx, bullet.vy) * dt;
      let dead = bullet.travelled > GUN.bulletRange
        || bullet.x < 0 || bullet.x > WORLD.width || bullet.y < 0 || bullet.y > WORLD.height
        || pointInBuilding(city, bullet.x, bullet.y);
      if (dead) {
        if (pointInBuilding(city, bullet.x, bullet.y)) burst(bullet.x, bullet.y, 'spark', 3, 120);
        state.bullets.splice(i, 1);
        continue;
      }
      if (bullet.fromPlayer) {
        for (let e = state.enemies.length - 1; e >= 0; e -= 1) {
          const enemy = state.enemies[e];
          if (dist(bullet.x, bullet.y, enemy.x, enemy.y) < 16) {
            enemy.health -= GUN.damage;
            burst(bullet.x, bullet.y, 'spark', 4, 140);
            dead = true;
            if (enemy.health <= 0) {
              state.enemies.splice(e, 1);
              noteKill(state);
              burst(enemy.x, enemy.y, 'smoke', 8, 120);
            }
            break;
          }
        }
        if (!dead) {
          for (let c = state.cars.length - 1; c >= 0; c -= 1) {
            const car = state.cars[c];
            if (car.health <= 0) continue;
            if (dist(bullet.x, bullet.y, car.x, car.y) < BULLET_HIT_CAR) {
              car.health -= 6;
              burst(bullet.x, bullet.y, 'spark', 4, 140);
              dead = true;
              if (car.health <= 0) {
                if (car.driver === 'police') addCrime(WANTED.killCopStars);
                wreckCar(car);
              }
              break;
            }
          }
        }
        if (!dead) {
          for (let c = state.footCops.length - 1; c >= 0; c -= 1) {
            const cop = state.footCops[c];
            if (dist(bullet.x, bullet.y, cop.x, cop.y) < 15) {
              state.footCops.splice(c, 1);
              addCrime(WANTED.killCopStars);
              burst(cop.x, cop.y, 'smoke', 8, 120);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (let p = state.peds.length - 1; p >= 0; p -= 1) {
            const ped = state.peds[p];
            if (dist(bullet.x, bullet.y, ped.x, ped.y) < 13) {
              state.peds.splice(p, 1);
              addCrime(1);
              burst(ped.x, ped.y, 'smoke', 6, 100);
              dead = true;
              break;
            }
          }
        }
      } else {
        // Enemy bullets: they can hit the player on foot or in a car.
        const px = player.onFoot ? player.x : player.car.x;
        const py = player.onFoot ? player.y : player.car.y;
        const radius = player.onFoot ? 14 : 24;
        if (dist(bullet.x, bullet.y, px, py) < radius) {
          if (player.onFoot) {
            player.health -= ENEMY.bulletDamage;
            player.sinceHit = 0;
          } else if (player.car) {
            player.car.health -= 4;
            if (player.car.health <= 0) wreckCar(player.car);
          }
          burst(bullet.x, bullet.y, 'spark', 3, 120);
          dead = true;
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
    return events;
  }

  // ---- car vs car -----------------------------------------------------
  // An oriented check: each car is a 40-by-20 box in its own frame, so two
  // cars can pass close in neighbouring lanes without a phantom crash.
  function stepCarCollisions(dt) {
    const cars = state.cars;
    let events = 0;
    for (const car of cars) if (car.crashTimer > 0) car.crashTimer -= dt;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        if (a.health <= 0 || b.health <= 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const cos = Math.cos(a.angle);
        const sin = Math.sin(a.angle);
        const forward = dx * cos + dy * sin;
        const side = -dx * sin + dy * cos;
        if (Math.abs(forward) >= 40 || Math.abs(side) >= 20) continue;
        const pushForward = 40 - Math.abs(forward);
        const pushSide = 20 - Math.abs(side);
        let nx = 0;
        let ny = 0;
        if (pushForward < pushSide) {
          nx = cos * Math.sign(forward);
          ny = sin * Math.sign(forward);
        } else {
          nx = -sin * Math.sign(side);
          ny = cos * Math.sign(side);
        }
        const push = Math.min(pushForward, pushSide) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const closing = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
        if (closing > 140 && a.crashTimer <= 0 && b.crashTimer <= 0) {
          a.health -= closing * 0.015;
          b.health -= closing * 0.015;
          a.crashTimer = 0.5;
          b.crashTimer = 0.5;
          burst((a.x + b.x) / 2, (a.y + b.y) / 2, 'spark', 5, 160);
          events |= EVENT_CRASH;
          if (a.health <= 0) wreckCar(a);
          if (b.health <= 0) wreckCar(b);
        }
      }
    }
    return events;
  }

  // ---- pickups, particles, clock, wanted decay ------------------------
  function stepPickups() {
    const player = state.player;
    const px = player.onFoot ? player.x : player.car.x;
    const py = player.onFoot ? player.y : player.car.y;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      if (dist(px, py, pickup.x, pickup.y) < 46) {
        state.pickups.splice(i, 1);
        notePickup(state);
        return EVENT_PICKUP;
      }
    }
    return 0;
  }

  function stepParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.92;
      particle.vy *= 0.92;
      if (particle.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].life -= dt;
      if (state.skids[i].life <= 0) state.skids.splice(i, 1);
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 22);
  }

  function stepWanted(dt) {
    state.sinceCrime += dt;
    if (state.wanted === 0) return;
    // Heat only fades when no police unit can see the player.
    const player = state.player;
    const px = player.onFoot ? player.x : player.car.x;
    const py = player.onFoot ? player.y : player.car.y;
    let seen = false;
    for (const car of state.cars) {
      if (car.driver === 'police' && dist(car.x, car.y, px, py) < 520) seen = true;
    }
    for (const cop of state.footCops) if (dist(cop.x, cop.y, px, py) < 300) seen = true;
    if (!seen && state.sinceCrime > WANTED.coolOffSeconds) {
      state.coolTimer += dt;
      if (state.coolTimer >= 6) {
        state.coolTimer = 0;
        state.wanted -= 1;
      }
    } else {
      state.coolTimer = 0;
    }
  }

  function stepCamera(dt) {
    const player = state.player;
    const targetX = player.onFoot ? player.x : player.car.x;
    const targetY = player.onFoot ? player.y : player.car.y;
    const lead = player.onFoot ? 0 : 0.35;
    const lx = targetX + (player.car ? player.car.vx * lead : 0);
    const ly = targetY + (player.car ? player.car.vy * lead : 0);
    state.camera.x += (lx - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (ly - state.camera.y) * Math.min(1, dt * 5);
  }

  function step(dt, input, fx) {
    let events = 0;
    state.time += dt;
    state.hour += dt / HOUR_SECONDS;
    if (state.hour >= 24) state.hour -= 24;
    if (state.busted || state.wasted) return 0;

    if (input.interact) {
      const player = state.player;
      if (player.onFoot) {
        const car = nearestCar(64);
        const start = nextMissionStart(state);
        if (car) {
          events |= stealCar(car);
        } else if (start && !state.mission.active && dist(player.x, player.y, start.x, start.y) < 110) {
          const intro = startMission(state);
          events |= EVENT_MISSION_START;
          state.mission.intro = intro;
        }
      } else {
        exitCar();
      }
    }

    if (state.player.onFoot) {
      events |= stepOnFoot(dt, input);
      if (input.shooting) events |= playerShoot(input);
    } else {
      events |= stepDriving(dt, input);
    }

    stepTraffic(dt);
    stepPeds(dt);
    events |= stepPolice(dt);
    events |= stepEnemies(dt);
    events |= stepBullets(dt);
    events |= stepCarCollisions(dt);
    events |= stepPickups();
    stepParticles(dt);
    stepWanted(dt);
    stepCamera(dt);

    const missionEvent = updateMission(state, dt);
    if (missionEvent === 'done') {
      events |= EVENT_MISSION_DONE;
      state.stats.missionsDone += 1;
    } else if (missionEvent === 'fail') {
      events |= EVENT_MISSION_FAIL;
    } else if (missionEvent === 'step') {
      events |= EVENT_PICKUP;
    }

    // Keep the streets populated.
    if (state.cars.filter((car) => car.driver === 'traffic').length < TRAFFIC.count && random() < dt * 0.5) {
      spawnTrafficCar(true);
    }
    if (state.peds.length < PEDS.count && random() < dt * 0.8) spawnPed();

    if (state.player.health <= 0) {
      state.wasted = true;
      events |= EVENT_WASTED;
    }
    if (events & EVENT_BUSTED) state.busted = true;
    return events;
  }

  function district() {
    const player = state.player;
    return districtAt(player.x, player.y);
  }

  function nightFactor() {
    // 0 in daylight, 1 at deep night. Dusk 17-19, night 19-6, dawn 6-8.
    const hour = state.hour;
    if (hour >= 19 || hour < 5) return 1;
    if (hour >= 17 && hour < 19) return (hour - 17) / 2;
    if (hour >= 5 && hour < 7) return 1 - (hour - 5) / 2;
    return 0;
  }

  function save() {
    return {
      money: state.money,
      missionsDone: state.mission.index,
      hour: state.hour,
      x: state.player.x,
      y: state.player.y,
    };
  }

  function load(saveData) {
    reset();
    state.money = saveData.money ?? 250;
    state.mission.index = saveData.missionsDone ?? 0;
    for (let i = 0; i < state.mission.index; i += 1) state.mission.done[i] = true;
    state.hour = saveData.hour ?? 17.5;
    state.player.x = saveData.x ?? state.player.x;
    state.player.y = saveData.y ?? state.player.y;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
  }

  reset();
  return {
    state,
    reset,
    step,
    district,
    nightFactor,
    save,
    load,
    spawnPoliceCar,
    spawnFootCop,
    addCrime,
  };
}

export { STEP };
