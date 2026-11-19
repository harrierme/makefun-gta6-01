// The living world: the player, traffic, pedestrians, police, bullets,
// the wanted system, the mission runner and the day cycle. It owns every
// rule and every number that changes over time; the renderer only paints
// what is here and the input module only reports keys.
//
// Bug lessons baked in: the reload refills the magazine; traffic spawns
// on a road axis and turns only at intersections; parked cars sit on the
// asphalt; nothing is clamped in a way that freezes traffic at the beach;
// foot officers stage outside the seen radius so heat can fall; cruisers
// are slower than the player and ram on a cooldown; repeat crashes share
// one cooldown per pair of cars; enemies never spawn inside a building;
// every mission pays its reward, so money can never go NaN.

import {
  AVENUES, CAR, COP, DAY, PLAYER, STREETS, TRAFFIC, WANTED, WORLD,
} from './config.js';
import {
  clampToWorld, districtAt, isOnRoad, nearestRoadPoint, pointInBuilding,
  resolveCircleBuildings, roadPointNear, createCity,
} from './city.js';
import {
  carCircles, createBullet, createCar, createEnemy, createFootCop,
  createPlayer, spawnParkedCar, spawnPedestrian, spawnTrafficCar, stepCarPhysics,
} from './entities.js';
import {
  advanceStep, currentMission, currentStep, missionObjective, missionTarget,
  shootoutEnemySpots, startMission, storyFinished,
} from './missions.js';
import { createIdCounter } from './random.js';

// Where Mara's office is: the yellow M marker. Press E there to start
// the next job.
export const MARA_OFFICE = { x: 650, y: 1450 };

export function createWorld(random) {
  const city = createCity(random);
  const nextId = createIdCounter();
  const world = {
    random,
    city,
    nextId,
    player: createPlayer(650, 1450),
    cars: [],
    peds: [],
    footCops: [],
    enemies: [],
    bullets: [],
    skidMarks: [],
    pairCooldowns: new Map(),
    camera: { x: 650, y: 1450 },
    money: 150,
    heat: 0,
    hour: DAY.startHour,
    time: 0,
    mission: { index: 0, step: 0, active: false, kills: 0, collected: 0, hold: 0, doneCount: 0 },
    missionEnemiesSpawned: false,
    messages: [],
    events: [],
    stats: { carsStolen: 0, missionsDone: 0, shotsFired: 0 },
    over: null, // 'busted' | 'wasted' | null
  };

  // Opening traffic and parked cars, all staged on roads.
  for (let i = 0; i < TRAFFIC.maxCars; i += 1) {
    const car = spawnTrafficCar(nextId(), random);
    if (car) world.cars.push(car);
  }
  for (let i = 0; i < 8; i += 1) {
    const parked = spawnParkedCar(nextId(), random, city);
    if (parked) world.cars.push(parked);
  }
  for (let i = 0; i < TRAFFIC.maxPeds; i += 1) {
    const ped = spawnPedestrian(nextId(), random, city, 650, 1450);
    if (ped) world.peds.push(ped);
  }
  return world;
}

export function wantedStars(world) {
  if (world.heat <= 0) return 0;
  return Math.min(WANTED.maxStars, Math.ceil(world.heat / WANTED.heatPerStar));
}

export function addHeat(world, amount) {
  world.heat = Math.min(WANTED.maxHeat, world.heat + amount);
}

export function setWanted(world, stars) {
  // Heat in ((stars-1)*20, stars*20] so ceil(heat/20) reads back as stars.
  world.heat = Math.min(WANTED.maxHeat, stars * WANTED.heatPerStar - 5);
}

export function say(world, text, seconds = 4) {
  world.messages.push({ text, timer: seconds });
  if (world.messages.length > 4) world.messages.shift();
}

function emit(world, type, data = {}) {
  world.events.push({ type, ...data });
}

// --- Saving ---------------------------------------------------------------

export function serializeWorld(world) {
  return {
    money: world.money,
    heat: world.heat,
    hour: world.hour,
    health: world.player.health,
    x: world.player.x,
    y: world.player.y,
    missionIndex: world.mission.index,
    missionsDone: world.mission.doneCount,
    carsStolen: world.stats.carsStolen,
  };
}

export function applySave(world, save) {
  if (!save || typeof save !== 'object') return false;
  world.money = Number.isFinite(save.money) ? save.money : world.money;
  world.heat = Number.isFinite(save.heat) ? save.heat : 0;
  world.hour = Number.isFinite(save.hour) ? save.hour : world.hour;
  world.player.health = Number.isFinite(save.health) ? save.health : PLAYER.maxHealth;
  if (Number.isFinite(save.x) && Number.isFinite(save.y)) {
    world.player.x = save.x;
    world.player.y = save.y;
    world.camera.x = save.x;
    world.camera.y = save.y;
  }
  if (Number.isInteger(save.missionIndex) && save.missionIndex >= 0 && save.missionIndex <= 5) {
    world.mission.index = save.missionIndex;
    world.mission.doneCount = Number.isInteger(save.missionsDone) ? save.missionsDone : 0;
  }
  if (Number.isInteger(save.carsStolen)) world.stats.carsStolen = save.carsStolen;
  return true;
}

// --- Main update ----------------------------------------------------------

export function updateWorld(world, input, dt) {
  if (world.over) return;
  world.time += dt;
  world.hour = (world.hour + (DAY.hoursPerSecond * dt)) % 24;

  for (const m of world.messages) m.timer -= dt;
  world.messages = world.messages.filter((m) => m.timer > 0);
  for (const mark of world.skidMarks) mark.life -= dt;
  world.skidMarks = world.skidMarks.filter((m) => m.life > 0);
  for (const [key, timer] of world.pairCooldowns) {
    const next = timer - dt;
    if (next <= 0) world.pairCooldowns.delete(key);
    else world.pairCooldowns.set(key, next);
  }

  const player = world.player;
  player.shootTimer = Math.max(0, player.shootTimer - dt);
  if (player.reloadTimer > 0) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) {
      // The reload refills the magazine in full.
      player.mag = PLAYER.magSize;
      emit(world, 'reload-done');
      say(world, 'Magazine full');
    }
  }

  updatePlayer(world, input, dt);
  updateTraffic(world, dt);
  updatePeds(world, dt);
  updatePolice(world, dt);
  updateEnemies(world, dt);
  updateBullets(world, dt);
  updateMissions(world, dt);
  updateWanted(world, dt);

  // The camera trails the player (or their car) smoothly.
  const focus = player.inCar ?? player;
  const tx = focus.x + Math.cos(focus.angle) * 40;
  const ty = focus.y + Math.sin(focus.angle) * 40;
  world.camera.x += (tx - world.camera.x) * Math.min(1, dt * 4);
  world.camera.y += (ty - world.camera.y) * Math.min(1, dt * 4);
}

// --- The player -----------------------------------------------------------

function updatePlayer(world, input, dt) {
  const player = world.player;

  if (input.pressed('interact')) tryInteract(world);
  if (input.pressed('reload')) tryReload(world);
  if (input.pressed('shoot') && !player.inCar) tryShoot(world, input);

  if (player.inCar) {
    drivePlayerCar(world, input, dt);
    return;
  }

  // On foot: WASD moves, Shift runs, the player faces the mouse.
  const ix = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
  const iy = (input.down('down') ? 1 : 0) - (input.down('up') ? 1 : 0);
  const len = Math.hypot(ix, iy);
  player.running = input.down('run') && len > 0;
  const speed = player.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  if (len > 0) {
    player.x += (ix / len) * speed * dt;
    player.y += (iy / len) * speed * dt;
    player.angle = Math.atan2(iy, ix);
  }
  const aim = input.aimWorld(world.camera);
  if (aim) player.angle = Math.atan2(aim.y - player.y, aim.x - player.x);
  resolveCircleBuildings(world.city, player);
  clampToWorld(player);
}

function tryInteract(world) {
  const player = world.player;
  if (player.inCar) {
    // Step out beside the car and leave it parked where it stands.
    const car = player.inCar;
    player.inCar = null;
    car.parked = true;
    const side = { x: -Math.sin(car.angle), y: Math.cos(car.angle) };
    player.x = car.x + side.x * 40;
    player.y = car.y + side.y * 40;
    player.angle = car.angle;
    resolveCircleBuildings(world.city, player);
    clampToWorld(player);
    return;
  }

  // Nearest car within reach.
  let best = null;
  let bestD = 78;
  for (const car of world.cars) {
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  if (best) {
    if (best.police) {
      say(world, 'Locked — CBPD cruiser');
      return;
    }
    if (best.driver) {
      // Steal it: the driver bails and runs, witnesses call it in.
      const driver = spawnPedestrian(world.nextId(), world.random, world.city, best.x, best.y);
      if (driver) {
        driver.fleeTimer = 6;
        world.peds.push(driver);
      }
      best.driver = false;
      addHeat(world, WANTED.stealHeat);
      world.stats.carsStolen += 1;
      emit(world, 'steal');
      say(world, 'Car stolen — the CBPD is on its way');
    }
    player.inCar = best;
    best.parked = false;
    best.speed = 0;
    return;
  }

  // Start the next job at Mara's office marker.
  const mission = currentMission(world.mission);
  if (mission && !world.mission.active) {
    const d = Math.hypot(MARA_OFFICE.x - player.x, MARA_OFFICE.y - player.y);
    if (d < 90) {
      startMission(world.mission);
      world.missionEnemiesSpawned = false;
      emit(world, 'mission-start');
      say(world, `${mission.title} — ${mission.intro}`, 6);
    }
  }
}

function tryReload(world) {
  const player = world.player;
  if (player.inCar || player.reloadTimer > 0) return;
  if (player.mag >= PLAYER.magSize) return;
  player.reloadTimer = PLAYER.reloadSeconds;
  emit(world, 'reload');
}

function tryShoot(world, input) {
  const player = world.player;
  if (player.shootTimer > 0 || player.reloadTimer > 0) return;
  if (player.mag <= 0) {
    say(world, 'Press R to reload');
    return;
  }
  const aim = input.aimWorld(world.camera);
  if (!aim) return;
  const angle = Math.atan2(aim.y - player.y, aim.x - player.x);
  player.angle = angle;
  player.mag -= 1;
  player.shootTimer = PLAYER.shootCooldown;
  world.stats.shotsFired += 1;
  world.bullets.push(createBullet(
    player.x + Math.cos(angle) * 22,
    player.y + Math.sin(angle) * 22,
    angle + world.random.range(-0.02, 0.02),
    PLAYER.bulletSpeed,
    PLAYER.bulletDamage,
    true,
  ));
  emit(world, 'shot');
  if (wantedStars(world) < 1) addHeat(world, WANTED.shootHeat * 0.4);
  else addHeat(world, WANTED.shootHeat * 0.2);
}

function drivePlayerCar(world, input, dt) {
  const car = world.player.inCar;
  const drive = {
    throttle: (input.down('up') ? 1 : 0) - (input.down('down') ? 1 : 0),
    steer: (input.down('left') ? -1 : 0) + (input.down('right') ? 1 : 0),
    handbrake: input.down('handbrake'),
  };
  const { drifting } = stepCarPhysics(car, drive, dt);
  if (drifting && Math.abs(car.speed) > 120 && world.skidMarks.length < 400) {
    world.skidMarks.push({ x: car.x, y: car.y, angle: car.angle, life: 5 });
  }
  collideCarWithBuildings(world, car, dt);
  collideCarWithCars(world, car, dt);
  clampCarToWorld(car);
  if (car.health <= 0) {
    say(world, 'Car wrecked — get out and run', 5);
    world.player.inCar = null;
    world.player.x = car.x + 40;
    world.player.y = car.y;
    world.cars = world.cars.filter((c) => c !== car);
  }
  if (input.pressed('shoot')) emit(world, 'horn');
}

// --- Traffic and pedestrians ----------------------------------------------

function updateTraffic(world, dt) {
  const player = world.player;
  const focus = player.inCar ?? player;

  for (const car of world.cars) {
    if (car === player.inCar || car.police) continue;
    if (car.parked) continue;
    driveTrafficCar(world, car, dt);
    collideCarWithBuildings(world, car, dt);
  }

  // Keep the city populated: cars far from the player are recycled onto
  // a road near the player, never teleported into a block.
  for (let i = 0; i < world.cars.length; i += 1) {
    const car = world.cars[i];
    if (car === player.inCar || car.police || car.parked) continue;
    const d = Math.hypot(car.x - focus.x, car.y - focus.y);
    if (d > 1500 || car.x < -40 || car.x > WORLD.width + 40 || car.y < -40 || car.y > WORLD.height + 40) {
      const fresh = spawnTrafficCar(car.id, world.random);
      if (fresh) world.cars[i] = fresh;
    }
  }

  let trafficCount = world.cars.filter((c) => !c.parked && !c.police).length;
  while (trafficCount < TRAFFIC.maxCars) {
    const car = spawnTrafficCar(world.nextId(), world.random);
    if (!car) break;
    world.cars.push(car);
    trafficCount += 1;
  }

  let parkedCount = world.cars.filter((c) => c.parked).length;
  while (parkedCount < 8) {
    const parked = spawnParkedCar(world.nextId(), world.random, world.city);
    if (!parked) break;
    world.cars.push(parked);
    parkedCount += 1;
  }
}

// A traffic car drives along its road axis and only turns at an
// intersection, snapping onto the crossing road so it never cuts a block.
function driveTrafficCar(world, car, dt) {
  const speed = car.targetSpeed;
  car.speed += (speed - car.speed) * Math.min(1, dt * 1.5);
  const wantAngle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += diff * Math.min(1, dt * 3);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // At an intersection, sometimes turn onto the crossing road.
  car.turnTimer -= dt;
  if (car.turnTimer > 0) return;
  const crossing = car.axis === 'x'
    ? AVENUES.find((ax) => Math.abs(car.x - ax) < 26)
    : STREETS.find((sy) => Math.abs(car.y - sy) < 26);
  if (crossing === undefined) return;
  if (!world.random.chance(0.35)) return;
  car.turnTimer = 3;
  if (car.axis === 'x') {
    car.axis = 'y';
    car.dir = world.random.chance(0.5) ? 1 : -1;
    car.x = crossing + car.dir * 16;
  } else {
    car.axis = 'x';
    car.dir = world.random.chance(0.5) ? 1 : -1;
    car.y = crossing + car.dir * 16;
  }
}

function updatePeds(world, dt) {
  const player = world.player;
  const focus = player.inCar ?? player;
  for (let i = world.peds.length - 1; i >= 0; i -= 1) {
    const ped = world.peds[i];
    ped.walkTimer -= dt;
    if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.y - focus.y, ped.x - focus.x);
      ped.x += Math.cos(away) * 190 * dt;
      ped.y += Math.sin(away) * 190 * dt;
      ped.angle = away;
    } else {
      // A fast car nearby sends pedestrians running for the sidewalk.
      const carNear = player.inCar && Math.abs(player.inCar.speed) > 200
        && Math.hypot(ped.x - player.inCar.x, ped.y - player.inCar.y) < 130;
      if (carNear) {
        ped.fleeTimer = 2.5;
      } else {
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
        if (ped.walkTimer <= 0) {
          ped.walkTimer = world.random.range(3, 9);
          if (world.random.chance(0.3)) {
            ped.axis = ped.axis === 'x' ? 'y' : 'x';
            ped.dir = world.random.chance(0.5) ? 1 : -1;
          }
          ped.angle = ped.axis === 'x' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        }
      }
    }
    resolveCircleBuildings(world.city, ped);
    clampToWorld(ped);
    // Recycle pedestrians that wandered far from the action.
    if (Math.hypot(ped.x - focus.x, ped.y - focus.y) > 1400) {
      const fresh = spawnPedestrian(ped.id, world.random, world.city, focus.x, focus.y);
      if (fresh) world.peds[i] = fresh;
    }
    // Run over by the player's car: a crime, and witnesses notice.
    if (player.inCar && Math.abs(player.inCar.speed) > 60
      && Math.hypot(ped.x - player.inCar.x, ped.y - player.inCar.y) < 34) {
      world.peds.splice(i, 1);
      addHeat(world, 20);
      say(world, 'Pedestrian hit — witnesses called it in', 4);
    }
  }
  while (world.peds.length < TRAFFIC.maxPeds) {
    const ped = spawnPedestrian(world.nextId(), world.random, world.city, focus.x, focus.y);
    if (!ped) break;
    world.peds.push(ped);
  }
}

// --- Police -----------------------------------------------------------------

function updatePolice(world, dt) {
  const player = world.player;
  const focus = player.inCar ?? player;
  const stars = wantedStars(world);

  // Cruisers: one per star, staged on a road near the player.
  const cruisers = world.cars.filter((c) => c.police);
  if (stars > 0) {
    let want = Math.min(stars, WANTED.maxCruisers);
    if (player.inCar) want = Math.min(stars + 1, WANTED.maxCruisers);
    while (cruisers.length < want) {
      const spot = roadPointNear(focus.x, focus.y, WANTED.cruiserSpawnMin, WANTED.cruiserSpawnMax, world.random);
      const cruiser = createCar(world.nextId(), spot.x, spot.y, 0, '#2e4a7a', { police: true, speed: 200 });
      world.cars.push(cruiser);
      cruisers.push(cruiser);
    }
  }
  for (const cruiser of cruisers) {
    if (stars === 0) {
      // Heat gone: the cruiser gives up and drives off.
      world.cars = world.cars.filter((c) => c !== cruiser);
      continue;
    }
    driveCruiser(world, cruiser, focus, dt);
  }

  // Foot officers, only while the player is on foot and wanted. They
  // stage outside the seen radius, so the player can break line of sight
  // and let the heat fall.
  if (stars > 0 && !player.inCar) {
    const wantFoot = Math.min(stars, WANTED.maxFootCops);
    while (world.footCops.length < wantFoot) {
      const spot = roadPointNear(focus.x, focus.y, WANTED.footSpawnMin, WANTED.footSpawnMax, world.random);
      if (pointInBuilding(world.city, spot.x, spot.y)) continue;
      world.footCops.push(createFootCop(world.nextId(), spot.x, spot.y));
    }
  }
  for (let i = world.footCops.length - 1; i >= 0; i -= 1) {
    const cop = world.footCops[i];
    if (stars === 0) {
      world.footCops.splice(i, 1);
      continue;
    }
    const d = Math.hypot(player.x - cop.x, player.y - cop.y);
    if (player.inCar) {
      // On foot officers cannot bust a driver; they fall behind.
      cop.x += Math.cos(cop.angle) * cop.speed * 0.5 * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * 0.5 * dt;
      continue;
    }
    cop.angle = Math.atan2(player.y - cop.y, player.x - cop.x);
    if (d > COP.bustRadius) {
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      cop.bustTimer = 0;
    } else {
      cop.bustTimer += dt;
      if (cop.bustTimer >= COP.bustSeconds) {
        world.over = 'busted';
        emit(world, 'busted');
        return;
      }
    }
    resolveCircleBuildings(world.city, cop);
    clampToWorld(cop);
  }
}

// A cruiser steers toward the player and rams on a cooldown. It is
// slower than the player's car, so a clean line outruns it. Off the road
// it heads for the nearest road first, so it follows the streets like
// traffic instead of cutting through blocks and buildings.
function driveCruiser(world, cruiser, focus, dt) {
  cruiser.ramTimer = Math.max(0, cruiser.ramTimer - dt);
  const target = isOnRoad(cruiser.x, cruiser.y)
    ? focus
    : nearestRoadPoint(focus.x, focus.y);
  const targetAngle = Math.atan2(target.y - cruiser.y, target.x - cruiser.x);
  let diff = targetAngle - cruiser.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  cruiser.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
  const d = Math.hypot(focus.x - cruiser.x, focus.y - cruiser.y);
  const wantSpeed = d > 90 ? COP.maxSpeed : 120;
  cruiser.speed += (wantSpeed - cruiser.speed) * Math.min(1, dt * 1.2);
  cruiser.x += Math.cos(cruiser.angle) * cruiser.speed * dt;
  cruiser.y += Math.sin(cruiser.angle) * cruiser.speed * dt;
  collideCarWithBuildings(world, cruiser, dt);
  clampCarToWorld(cruiser);

  // The ram: close, fast and off cooldown.
  if (cruiser.ramTimer <= 0 && d < 74 && cruiser.speed > 150) {
    cruiser.ramTimer = COP.ramCooldown;
    emit(world, 'crash');
    if (world.player.inCar) {
      const car = world.player.inCar;
      car.health -= COP.ramDamage;
      car.speed *= 0.55;
      say(world, 'CBPD rammed your car!', 2);
      if (car.health <= 0) {
        world.player.inCar = null;
        world.player.x = car.x + 40;
        world.player.y = car.y;
        world.cars = world.cars.filter((c) => c !== car);
      }
    } else {
      world.player.health -= COP.ramDamage;
      world.player.x += Math.cos(cruiser.angle) * 30;
      world.player.y += Math.sin(cruiser.angle) * 30;
      if (world.player.health <= 0) {
        world.over = 'wasted';
        emit(world, 'wasted');
      }
    }
  }
}

// --- Combat -----------------------------------------------------------------

function updateEnemies(world, dt) {
  const player = world.player;
  const focus = player.inCar ?? player;
  for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = world.enemies[i];
    const d = Math.hypot(focus.x - enemy.x, focus.y - enemy.y);
    enemy.shootTimer -= dt;
    if (d < 520 && enemy.shootTimer <= 0) {
      enemy.shootTimer = world.random.range(0.9, 1.6);
      const angle = Math.atan2(focus.y - enemy.y, focus.x - enemy.x) + world.random.range(-0.14, 0.14);
      world.bullets.push(createBullet(
        enemy.x + Math.cos(angle) * 20,
        enemy.y + Math.sin(angle) * 20,
        angle, 520, 12, false,
      ));
      emit(world, 'enemy-shot');
    }
    // Enemies strafe toward the player but never enter a building.
    if (d > 180) {
      const angle = Math.atan2(focus.y - enemy.y, focus.x - enemy.x);
      enemy.x += Math.cos(angle) * 90 * dt;
      enemy.y += Math.sin(angle) * 90 * dt;
      enemy.angle = angle;
    }
    resolveCircleBuildings(world.city, enemy);
    clampToWorld(enemy);
    if (d > 1600) world.enemies.splice(i, 1);
  }
}

function updateBullets(world, dt) {
  const player = world.player;
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const b = world.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height;
    if (!dead && pointInBuilding(world.city, b.x, b.y)) dead = true;
    if (!dead && b.friendly) {
      for (let j = world.enemies.length - 1; j >= 0; j -= 1) {
        const e = world.enemies[j];
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + 4) {
          e.health -= b.damage;
          dead = true;
          if (e.health <= 0) {
            world.enemies.splice(j, 1);
            if (world.mission.active) {
              world.mission.kills += 1;
              addHeat(world, WANTED.killHeat);
            }
          }
          break;
        }
      }
    }
    if (!dead && !b.friendly) {
      const target = player.inCar ?? player;
      const r = player.inCar ? 30 : PLAYER.radius;
      if (Math.hypot(target.x - b.x, target.y - b.y) < r + 4) {
        dead = true;
        if (player.inCar) {
          player.inCar.health -= b.damage;
          if (player.inCar.health <= 0) {
            world.player.inCar = null;
            world.player.x = target.x + 40;
            world.player.y = target.y;
            world.cars = world.cars.filter((c) => c !== target);
            say(world, 'Your car was shot up!', 4);
          }
        } else {
          player.health -= b.damage;
          if (player.health <= 0) {
            world.over = 'wasted';
            emit(world, 'wasted');
          }
        }
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }
}

// --- Collisions ---------------------------------------------------------------

function collideCarWithBuildings(world, car, dt) {
  const circles = carCircles(car);
  for (const c of circles) {
    for (const b of world.city.buildings) {
      const cx = Math.max(b.x, Math.min(c.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(c.y, b.y + b.h));
      const dx = c.x - cx;
      const dy = c.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= c.r * c.r) continue;
      const d = Math.sqrt(d2) || 0.01;
      const push = c.r - d;
      car.x += (dx / d) * push;
      car.y += (dy / d) * push;
      if (Math.abs(car.speed) > 140) {
        car.health -= Math.abs(car.speed) * 0.02;
        if (car.crashTimer <= 0) {
          car.crashTimer = CAR.crashCooldown;
          emit(world, 'crash');
        }
      }
      car.speed *= 0.6;
      car.slide *= 0.6;
      return;
    }
  }
  car.crashTimer = Math.max(0, car.crashTimer - dt);
}

function collideCarWithCars(world, car, dt) {
  void dt;
  for (const other of world.cars) {
    if (other === car) continue;
    const key = car.id < other.id ? `${car.id}-${other.id}` : `${other.id}-${car.id}`;
    if (world.pairCooldowns.has(key)) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d >= 62 || d === 0) continue;
    const push = (62 - d) / 2;
    const nx = (other.x - car.x) / d;
    const ny = (other.y - car.y) / d;
    car.x -= nx * push;
    car.y -= ny * push;
    other.x += nx * push;
    other.y += ny * push;
    const impact = Math.abs(car.speed - other.speed);
    if (impact > 120) {
      world.pairCooldowns.set(key, CAR.crashCooldown);
      car.health -= impact * 0.02;
      other.health -= impact * 0.02;
      car.speed *= 0.6;
      other.speed *= 0.6;
      emit(world, 'crash');
      if (other.health <= 0 && !other.police && other !== world.player.inCar) {
        world.cars = world.cars.filter((c) => c !== other);
      }
    }
  }
}

// Cars stop at the world edge and the water instead of being clamped
// in place: a clamp that pins a car freezes traffic at the beach, so
// the car turns around and drives back into the city.
function clampCarToWorld(car) {
  const m = 30;
  if (car.x < m) { car.x = m; car.angle = Math.PI - car.angle; car.speed *= 0.7; }
  if (car.x > WORLD.width - m) { car.x = WORLD.width - m; car.angle = Math.PI - car.angle; car.speed *= 0.7; }
  if (car.y < m) { car.y = m; car.angle = -car.angle; car.speed *= 0.7; }
  if (car.y > WORLD.height - m) { car.y = WORLD.height - m; car.angle = -car.angle; car.speed *= 0.7; }
  if (car.x > 3100) { car.x = 3100; car.angle = Math.PI - car.angle; car.speed *= 0.7; }
}

// --- Missions -----------------------------------------------------------------

function updateMissions(world, dt) {
  const progress = world.mission;
  if (!progress.active) return;
  const step = currentStep(progress);
  if (!step) return;
  const player = world.player;
  const focus = player.inCar ?? player;

  // A step that names a wanted level raises the heat when it starts.
  if (step.wanted && !step.wantedApplied) {
    step.wantedApplied = true;
    setWanted(world, step.wanted);
    say(world, `Wanted level ${step.wanted} — the CBPD is coming`, 4);
  }

  if (step.type === 'kill' && !world.missionEnemiesSpawned) {
    world.missionEnemiesSpawned = true;
    for (const spot of shootoutEnemySpots()) {
      world.enemies.push(createEnemy(world.nextId(), spot.x, spot.y));
    }
    say(world, 'The Strand crew is here — take them down!', 4);
  }

  if (step.type === 'goto' || step.type === 'pickup' || step.type === 'escape') {
    const d = Math.hypot(step.x - focus.x, step.y - focus.y);
    if (step.type === 'escape' && wantedStars(world) > 0) return; // lose the heat first
    if (d < 80) {
      if (step.type === 'pickup') say(world, 'Dice is in — now lose the heat!', 4);
      finishStep(world);
    }
  } else if (step.type === 'kill') {
    if (progress.kills >= step.count) finishStep(world);
  } else if (step.type === 'collect') {
    const spot = step.spots[progress.collected];
    if (spot && Math.hypot(spot.x - focus.x, spot.y - focus.y) < 55) {
      progress.collected += 1;
      world.money += 150;
      emit(world, 'pickup');
      say(world, `Cash stash grabbed (+$150) — ${progress.collected}/${step.spots.length}`, 3);
      if (progress.collected >= step.spots.length) finishStep(world);
    }
  } else if (step.type === 'hold') {
    if (Math.hypot(step.x - focus.x, step.y - focus.y) < 110) {
      progress.hold += dt;
      if (progress.hold >= step.seconds) finishStep(world);
    }
  }
}

function finishStep(world) {
  const mission = currentMission(world.mission);
  const result = advanceStep(world.mission);
  if (result === 'complete' && mission) {
    world.money += mission.reward;
    world.stats.missionsDone += 1;
    emit(world, 'mission-complete');
    say(world, `${mission.title} complete — +$${mission.reward}`, 6);
    if (storyFinished(world.mission)) {
      say(world, 'Story complete! Cinder Bay is yours, Reno.', 8);
    } else {
      say(world, 'Next job is waiting at the yellow M — Mara\'s office', 6);
    }
  } else {
    emit(world, 'mission-step');
  }
}

// --- Wanted -------------------------------------------------------------------

function updateWanted(world, dt) {
  const player = world.player;
  const focus = player.inCar ?? player;
  if (world.heat <= 0) return;
  // Seen when any officer is close enough to spot the player.
  let seen = false;
  for (const cruiser of world.cars) {
    if (!cruiser.police) continue;
    if (Math.hypot(cruiser.x - focus.x, cruiser.y - focus.y) < WANTED.seenRadius) {
      seen = true;
      break;
    }
  }
  if (!seen) {
    for (const cop of world.footCops) {
      if (Math.hypot(cop.x - player.x, cop.y - player.y) < WANTED.seenRadius) {
        seen = true;
        break;
      }
    }
  }
  if (!seen) {
    world.heat = Math.max(0, world.heat - WANTED.decayPerSecond * dt);
  }
}

export { districtAt, isOnRoad, missionObjective, missionTarget };
