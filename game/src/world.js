// Solmar Bay — the living world: player, traffic, pedestrians, police,
// bullets, missions, wanted level, camera. Pure logic: no window/document.
import { CFG } from './config.js';
import { makeRng, resetIds } from './random.js';
import {
  generateCity, isOnRoad, nearestRoadPoint, roadPointNear, districtAt,
  pointInBuilding, resolveCircleBuildings, clampToWorld,
} from './city.js';
import {
  createPlayer, createCar, createPedestrian, createFootCop, createEnemy,
  createBullet, stepCarPhysics, carCircles, spawnTrafficCar, spawnParkedCar,
  spawnPedestrian,
} from './entities.js';
import {
  FIXER, MISSIONS, createMissionProgress, currentMission, currentStep,
  missionTarget, advanceStep, shootoutEnemySpots,
} from './missions.js';

export function wantedStars(world) {
  return Math.max(0, Math.min(CFG.MAX_STARS, Math.floor(world.heat / CFG.HEAT_PER_STAR)));
}

export function addHeat(world, n) {
  world.heat = Math.max(0, Math.min(100, world.heat + n));
}

export function setWanted(world, stars) {
  world.heat = Math.max(0, Math.min(100, stars * CFG.HEAT_PER_STAR));
}

export function say(world, text) {
  world.msg = text;
  world.msgT = 4.5;
}

export function createWorld(seed) {
  resetIds();
  const rng = makeRng(seed);
  const city = generateCity(seed);
  const player = createPlayer(1300, 800);
  const world = {
    seed, rng, city,
    time: 8.5, // morning
    elapsed: 0,
    money: 250,
    heat: 0,
    player,
    cars: [],
    peds: [],
    footCops: [],
    enemies: [],
    bullets: [],
    particles: [],
    skids: [],
    progress: createMissionProgress(),
    screen: 'title',
    camera: { x: player.x, y: player.y },
    msg: 'Welcome to Solmar Bay.',
    msgT: 4.5,
    events: [],
    cruiserT: 0,
    copT: 0,
    stepKey: '',
    muted: false,
    district: 'Old Town',
  };
  for (let i = 0; i < CFG.TRAFFIC_COUNT; i++) {
    world.cars.push(spawnTrafficCar(city, rng, player.x, player.y));
  }
  for (let i = 0; i < CFG.PARKED_COUNT; i++) {
    const c = spawnParkedCar(city, rng);
    if (c) world.cars.push(c);
  }
  for (let i = 0; i < CFG.PED_COUNT; i++) {
    world.peds.push(spawnPedestrian(city, rng, player.x, player.y));
  }
  return world;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function nearestCar(world, x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const c of world.cars) {
    if (c.crashed) continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function burst(world, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.8);
    world.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
  }
  if (world.particles.length > 400) world.particles.splice(0, world.particles.length - 400);
}

function enterCar(world, car) {
  const p = world.player;
  if (car.locked) {
    say(world, 'Locked — that is a police cruiser.');
    return;
  }
  if (car.occupied && car.driver === 'civilian') {
    // Steal: the driver bails out and runs.
    const runaway = createPedestrian(car.x + 30, car.y);
    runaway.fleeing = true;
    runaway.fleeT = 5;
    world.peds.push(runaway);
    addHeat(world, CFG.STEAL_HEAT);
    say(world, 'You stole the car! Someone saw that.');
  } else if (!car.occupied) {
    say(world, 'You hop in the parked car.');
  }
  car.occupied = true;
  car.driver = 'player';
  car.parked = false;
  p.inCar = car;
}

function exitCar(world) {
  const p = world.player;
  const car = p.inCar;
  if (!car) return;
  car.occupied = false;
  car.driver = null;
  p.inCar = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.vx = 0;
  p.vy = 0;
  clampToWorld(p, p.r);
  resolveCircleBuildings(world.city, p, p.r);
}

function onStepEnter(world) {
  const p = world.progress;
  const s = currentStep(p);
  if (!s) return;
  if (s.type === 'kill') {
    const spots = shootoutEnemySpots(world.city, world.rng, s.x, s.y, s.count);
    for (const sp of spots) world.enemies.push(createEnemy(sp.x, sp.y));
    say(world, 'Hostiles on the pier — take them down!');
  } else if (s.type === 'hold') {
    const spots = shootoutEnemySpots(world.city, world.rng, s.x, s.y, 3);
    for (const sp of spots) world.enemies.push(createEnemy(sp.x, sp.y));
    say(world, 'Hold the yard — trouble is coming.');
  }
}

function updatePlayer(world, input, dt) {
  const p = world.player;
  p.fireT = Math.max(0, p.fireT - dt);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      p.mag = CFG.MAG_SIZE;
      say(world, 'Reloaded.');
    }
  }
  if (input.pressed('KeyR') && p.reloadT <= 0 && p.mag < CFG.MAG_SIZE && !p.inCar) {
    p.reloadT = CFG.RELOAD_TIME;
  }

  if (p.inCar) {
    updateDriving(world, input, dt);
    return;
  }

  // On foot: WASD / arrows, Shift to run, face the mouse.
  let mx = 0;
  let my = 0;
  if (input.held('KeyW') || input.held('ArrowUp')) my -= 1;
  if (input.held('KeyS') || input.held('ArrowDown')) my += 1;
  if (input.held('KeyA') || input.held('ArrowLeft')) mx -= 1;
  if (input.held('KeyD') || input.held('ArrowRight')) mx += 1;
  const len = Math.hypot(mx, my);
  p.running = input.held('ShiftLeft') || input.held('ShiftRight');
  const speed = p.running ? CFG.RUN_SPEED : CFG.WALK_SPEED;
  if (len > 0) {
    p.vx = (mx / len) * speed;
    p.vy = (my / len) * speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.moving = true;
  } else {
    p.vx = 0;
    p.vy = 0;
    p.moving = false;
  }
  p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  resolveCircleBuildings(world.city, p, p.r);
  clampToWorld(p, p.r);

  // Shooting (on foot only).
  if (input.mouseDown && p.fireT <= 0 && p.reloadT <= 0) {
    if (p.mag > 0) {
      p.mag -= 1;
      p.fireT = CFG.FIRE_COOLDOWN;
      const gx = p.x + Math.cos(p.angle) * 20;
      const gy = p.y + Math.sin(p.angle) * 20;
      world.bullets.push(createBullet(gx, gy, p.angle + (Math.random() - 0.5) * 0.05, true));
      addHeat(world, CFG.SHOOT_HEAT);
      world.events.push('gunshot');
      burst(world, gx, gy, '#ffd34d', 3, 120);
    } else if (p.reloadT <= 0) {
      p.reloadT = CFG.RELOAD_TIME;
    }
  }

  // Interact: start a mission at the fixer (takes priority over cars),
  // or enter a nearby car.
  if (input.pressed('KeyE')) {
    const nearFixer = !world.progress.started
      && dist(p.x, p.y, FIXER.x, FIXER.y) < 80
      && currentMission(world.progress);
    if (nearFixer) {
      const m = currentMission(world.progress);
      world.progress.started = true;
      world.progress.si = 0;
      world.progress.kills = 0;
      world.progress.collected = 0;
      world.progress.holdT = 0;
      world.progress.got = [];
      say(world, m.intro);
      world.events.push('mission');
      // Enemy spawning for the step happens in updateMissions (stepKey change).
    } else {
      const car = nearestCar(world, p.x, p.y, 78);
      if (car) enterCar(world, car);
    }
  }
}

function updateDriving(world, input, dt) {
  const p = world.player;
  const car = p.inCar;
  if (!car || car.crashed) {
    p.inCar = null;
    return;
  }
  const throttle = (input.held('KeyW') || input.held('ArrowUp') ? 1 : 0) + (input.held('KeyS') || input.held('ArrowDown') ? -1 : 0);
  const steer = (input.held('KeyD') || input.held('ArrowRight') ? 1 : 0) + (input.held('KeyA') || input.held('ArrowLeft') ? -1 : 0);
  const handbrake = input.held('Space');
  const slide = stepCarPhysics(car, { throttle, steer, handbrake }, dt);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;

  if (slide > 70 && Math.abs(car.speed) > 150) {
    const bx = car.x - Math.cos(car.angle) * 20;
    const by = car.y - Math.sin(car.angle) * 20;
    world.skids.push({ x: bx, y: by, angle: car.angle, life: 6 });
    if (world.skids.length > 320) world.skids.shift();
  }

  // Buildings: treat the car as one circle for the push-out.
  const before = { x: car.x, y: car.y };
  if (resolveCircleBuildings(world.city, car, 24)) {
    const impact = Math.abs(car.speed);
    car.speed *= 0.45;
    car.vx *= 0.4;
    car.vy *= 0.4;
    if (impact > 220) {
      car.hp -= 6;
      world.events.push('crash');
      burst(world, car.x, car.y, '#ffb347', 8, 160);
    }
  }
  clampToWorld(car, 24);
  p.x = car.x;
  p.y = car.y;

  // Hit a pedestrian.
  for (let i = world.peds.length - 1; i >= 0; i--) {
    const ped = world.peds[i];
    if (dist(car.x, car.y, ped.x, ped.y) < 30 && Math.abs(car.speed) > 60) {
      world.peds.splice(i, 1);
      addHeat(world, CFG.PED_HIT_HEAT);
      say(world, 'You hit a pedestrian! Witnesses are calling it in.');
      world.events.push('crash');
      burst(world, ped.x, ped.y, '#e07a5f', 10, 200);
    }
  }

  if (car.hp <= 0 && !car.crashed) {
    car.crashed = true;
    burst(world, car.x, car.y, '#ff6b35', 26, 260);
    say(world, 'Your car is wrecked!');
    world.events.push('crash');
    exitCar(world);
    return;
  }

  if (input.pressed('KeyE')) exitCar(world);
  if (input.pressed('KeyH')) world.events.push('horn');
}

function updateTraffic(world, dt) {
  const p = world.player;
  for (let i = world.cars.length - 1; i >= 0; i--) {
    const car = world.cars[i];
    if (car.parked || car.crashed || car.driver === 'player' || car.type === 'police') continue;
    // Drive axis-aligned along the road.
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const d = dirs[car.dir];
    const target = car.targetSpeed;
    car.speed += (target - car.speed) * Math.min(1, 2 * dt);
    car.x += d[0] * car.speed * dt;
    car.y += d[1] * car.speed * dt;
    car.angle = Math.atan2(d[1], d[0]);
    // At an intersection, sometimes turn.
    const nearX = CFG.AVENUES.some((ax) => Math.abs(car.x - ax) < 12);
    const nearY = CFG.STREETS.some((sy) => Math.abs(car.y - sy) < 12);
    if (nearX && nearY && world.rng.chance(0.012)) {
      const turn = world.rng.pick([-1, 0, 1]);
      car.dir = (car.dir + turn + 4) % 4;
    }
    // Off the road end? Turn around at the world edge.
    if (car.x < 60 || car.x > CFG.SAND_X - 60 || car.y < 60 || car.y > CFG.WORLD_H - 60) {
      car.dir = (car.dir + 2) % 4;
    }
    // Recycle far-away traffic near the player.
    if (dist(car.x, car.y, p.x, p.y) > 1000) {
      const fresh = spawnTrafficCar(world.city, world.rng, p.x, p.y);
      world.cars[i] = fresh;
    }
  }

  // Car-car collisions (player car vs others, traffic vs traffic).
  const all = world.cars;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.crashed || b.crashed) continue;
      const key = a.id + ':' + b.id;
      if ((a.hitCooldowns[key] || 0) > 0) continue;
      const ca = carCircles(a);
      const cb = carCircles(b);
      let hit = false;
      for (const x of ca) for (const y of cb) {
        if (dist(x.x, x.y, y.x, y.y) < x.r + y.r - 4) hit = true;
      }
      if (!hit) continue;
      a.hitCooldowns[key] = 1;
      b.hitCooldowns[key] = 1;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const push = 26;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 120) {
        a.hp -= 5;
        b.hp -= 5;
        world.events.push('crash');
        burst(world, (a.x + b.x) / 2, (a.y + b.y) / 2, '#ffb347', 6, 140);
      }
      if (a.type === 'police' || b.type === 'police') {
        // A cruiser ramming the player car hurts it.
        const pc = a.type === 'police' ? a : b;
        const other = a.type === 'police' ? b : a;
        if (other.driver === 'player') {
          other.hp -= 8;
          world.events.push('crash');
        }
        pc.ramT = CFG.CRUISER_RAM_COOLDOWN;
      }
    }
  }
  for (const c of all) {
    for (const k of Object.keys(c.hitCooldowns)) c.hitCooldowns[k] -= dt;
    if (c.hp <= 0 && !c.crashed) {
      c.crashed = true;
      burst(world, c.x, c.y, '#ff6b35', 20, 240);
      if (c.driver === 'player') exitCar(world);
    }
  }
}

function updatePeds(world, dt) {
  const p = world.player;
  for (let i = world.peds.length - 1; i >= 0; i--) {
    const ped = world.peds[i];
    if (ped.fleeT > 0) ped.fleeT -= dt;
    const playerCar = p.inCar;
    const threatX = playerCar ? playerCar.x : p.x;
    const threatY = playerCar ? playerCar.y : p.y;
    const threatSpeed = playerCar ? Math.abs(playerCar.speed) : 0;
    const dThreat = dist(ped.x, ped.y, threatX, threatY);
    if (playerCar && threatSpeed > 180 && dThreat < 130) {
      ped.fleeing = true;
      ped.fleeT = 2.5;
    }
    if (ped.fleeing && ped.fleeT > 0) {
      const a = Math.atan2(ped.y - threatY, ped.x - threatX);
      ped.x += Math.cos(a) * 150 * dt;
      ped.y += Math.sin(a) * 150 * dt;
    } else {
      ped.fleeing = false;
      ped.x += Math.cos(ped.dir) * ped.speed * dt;
      ped.y += Math.sin(ped.dir) * ped.speed * dt;
      if (world.rng.chance(0.004)) ped.dir = world.rng.range(0, Math.PI * 2);
      if (ped.x < 30 || ped.x > CFG.SAND_X - 30 || ped.y < 30 || ped.y > CFG.WORLD_H - 30) {
        ped.dir += Math.PI;
      }
    }
    resolveCircleBuildings(world.city, ped, ped.r);
    clampToWorld(ped, ped.r);
    if (dist(ped.x, ped.y, p.x, p.y) > 1100) {
      world.peds[i] = spawnPedestrian(world.city, world.rng, p.x, p.y);
    }
  }
}

function updatePolice(world, dt) {
  const p = world.player;
  const stars = wantedStars(world);
  // Cruisers: one per star (+1 while driving).
  const wantCruisers = Math.min(6, stars + (p.inCar ? 1 : 0));
  const cruisers = world.cars.filter((c) => c.type === 'police' && !c.crashed);
  world.cruiserT -= dt;
  if (cruisers.length < wantCruisers && world.cruiserT <= 0 && stars > 0) {
    world.cruiserT = 1.2;
    const spot = roadPointNear(world.city, world.rng, p.x, p.y, 480);
    const cruiser = createCar('police', spot.x, spot.y, Math.atan2(p.y - spot.y, p.x - spot.x), CFG.POLICE_COLOR);
    cruiser.driver = 'cop';
    world.cars.push(cruiser);
    world.events.push('siren');
  }
  for (const c of cruisers) {
    c.ramT = Math.max(0, c.ramT - dt);
    const targetA = Math.atan2(p.y - c.y, p.x - c.x);
    let diff = targetA - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    const d = dist(c.x, c.y, p.x, p.y);
    const throttle = d > 60 ? 1 : 0.4;
    stepCarPhysics(c, { throttle, steer, handbrake: false }, dt);
    resolveCircleBuildings(world.city, c, 24);
    clampToWorld(c, 24);
    if (d > 1200) {
      c.crashed = true; // despawn marker (removed below)
      c.hp = 0;
    }
    // Ram the player on foot.
    if (!p.inCar && d < 34 && c.ramT <= 0) {
      c.ramT = CFG.CRUISER_RAM_COOLDOWN;
      p.hp -= 18;
      world.events.push('crash');
      burst(world, p.x, p.y, '#ff6b35', 8, 160);
      if (p.hp <= 0) {
        world.screen = 'wasted';
        say(world, 'Wasted.');
      }
    }
  }
  world.cars = world.cars.filter((c) => !(c.type === 'police' && c.crashed && c.hp <= 0 && dist(c.x, c.y, p.x, p.y) > 1100));

  // Foot cops: only while on foot and wanted.
  const wantCops = p.inCar ? 0 : Math.min(3, stars);
  world.copT -= dt;
  if (world.footCops.length < wantCops && world.copT <= 0 && stars > 0) {
    world.copT = 1.6;
    const spot = roadPointNear(world.city, world.rng, p.x, p.y, 380);
    world.footCops.push(createFootCop(spot.x, spot.y));
  }
  for (let i = world.footCops.length - 1; i >= 0; i--) {
    const cop = world.footCops[i];
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (d > 900 || stars === 0) {
      world.footCops.splice(i, 1);
      continue;
    }
    const a = Math.atan2(p.y - cop.y, p.x - cop.x);
    cop.angle = a;
    cop.x += Math.cos(a) * cop.speed * dt;
    cop.y += Math.sin(a) * cop.speed * dt;
    resolveCircleBuildings(world.city, cop, cop.r);
    clampToWorld(cop, cop.r);
    if (d < CFG.FOOT_COP_CATCH_DIST) {
      cop.catchT += dt;
      if (cop.catchT > CFG.FOOT_COP_CATCH_TIME) {
        world.screen = 'busted';
        say(world, 'Busted!');
      }
    } else {
      cop.catchT = Math.max(0, cop.catchT - dt);
    }
  }

  // Heat decays only while no cop can see the player.
  const seen = [...world.cars.filter((c) => c.type === 'police'), ...world.footCops]
    .some((c) => dist(c.x, c.y, p.x, p.y) < CFG.SEE_RADIUS);
  if (!seen && world.heat > 0) {
    world.heat = Math.max(0, world.heat - CFG.HEAT_DECAY * dt);
  }
}

function updateEnemies(world, dt) {
  const p = world.player;
  const step = currentStep(world.progress);
  // Mission-spawned enemies stay while their kill/hold step is active,
  // even if the player is still travelling to them.
  const missionFight = world.progress.started && step && (step.type === 'kill' || step.type === 'hold');
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    const d = dist(e.x, e.y, p.x, p.y);
    if (d > 900 && !missionFight) {
      world.enemies.splice(i, 1);
      continue;
    }
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    e.angle = a;
    if (d > 120) {
      e.x += Math.cos(a) * e.speed * dt;
      e.y += Math.sin(a) * e.speed * dt;
    }
    resolveCircleBuildings(world.city, e, e.r);
    clampToWorld(e, e.r);
    e.shootT -= dt;
    if (d < CFG.ENEMY_SHOOT_RANGE && e.shootT <= 0) {
      e.shootT = CFG.ENEMY_SHOOT_COOLDOWN * (0.8 + Math.random() * 0.5);
      world.bullets.push(createBullet(e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18, a + (Math.random() - 0.5) * 0.14, false));
      world.events.push('enemyShot');
    }
  }
}

function updateBullets(world, dt) {
  const p = world.player;
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    b.life -= dt;
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    let dead = b.life <= 0;
    if (!dead && pointInBuilding(world.city, b.x, b.y, 0)) {
      burst(world, b.x, b.y, '#c8c8c8', 3, 90);
      dead = true;
    }
    if (!dead && (b.x < 0 || b.x > CFG.SEA_X || b.y < 0 || b.y > CFG.WORLD_H)) dead = true;
    if (!dead && b.friendly) {
      for (let j = world.enemies.length - 1; j >= 0; j--) {
        const e = world.enemies[j];
        if (dist(b.x, b.y, e.x, e.y) < e.r + 6) {
          e.hp -= CFG.GUN_DAMAGE;
          burst(world, b.x, b.y, '#ff5a4d', 6, 150);
          dead = true;
          if (e.hp <= 0) {
            world.enemies.splice(j, 1);
            world.progress.kills += 1;
            addHeat(world, CFG.KILL_HEAT);
            burst(world, e.x, e.y, '#ff5a4d', 14, 200);
          }
          break;
        }
      }
    }
    if (!dead && !b.friendly) {
      if (dist(b.x, b.y, p.x, p.y) < p.r + 4) {
        p.hp -= 9;
        burst(world, p.x, p.y, '#ff5a4d', 5, 140);
        dead = true;
        if (p.hp <= 0) {
          world.screen = 'wasted';
          say(world, 'Wasted.');
        }
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }
}

function updateMissions(world, input, dt) {
  const prog = world.progress;
  const m = currentMission(prog);
  if (!m) return;
  const stepKey = prog.mi + ':' + prog.si + ':' + (prog.started ? '1' : '0');
  if (stepKey !== world.stepKey) {
    world.stepKey = stepKey;
    if (prog.started) onStepEnter(world);
  }
  if (!prog.started) return;
  const s = currentStep(prog);
  if (!s) return;
  const p = world.player;
  const d = (x, y) => dist(p.x, p.y, x, y);

  if (s.type === 'goto') {
    if (d(s.x, s.y) < s.r) {
      const res = advanceStep(prog);
      if (res === 'mission') completeMission(world, m);
      else say(world, 'Next: ' + (currentStep(prog) ? currentStep(prog).label : ''));
    }
  } else if (s.type === 'pickup') {
    if (d(s.x, s.y) < s.r) {
      world.events.push('pickup');
      burst(world, s.x, s.y, '#ffd34d', 12, 160);
      const res = advanceStep(prog);
      if (res === 'mission') completeMission(world, m);
    }
  } else if (s.type === 'kill') {
    if (prog.kills >= s.count) {
      const res = advanceStep(prog);
      if (res === 'mission') completeMission(world, m);
      else say(world, 'Pier clear. Vane will be pleased.');
    }
  } else if (s.type === 'collect') {
    s.points.forEach((pt, i) => {
      if (!prog.got.includes(i) && d(pt.x, pt.y) < s.r) {
        prog.got.push(i);
        prog.collected += 1;
        world.events.push('pickup');
        burst(world, pt.x, pt.y, '#7dff8a', 10, 150);
        say(world, 'Cash grabbed (' + prog.collected + '/' + s.count + ').');
      }
    });
    if (prog.collected >= s.count) {
      const res = advanceStep(prog);
      if (res === 'mission') completeMission(world, m);
    }
  } else if (s.type === 'hold') {
    if (d(s.x, s.y) < s.r) {
      prog.holdT += dt;
      if (Math.floor(prog.holdT) !== Math.floor(prog.holdT - dt)) {
        burst(world, p.x, p.y, '#7db8ff', 4, 90);
      }
      if (prog.holdT >= s.seconds) {
        const res = advanceStep(prog);
        if (res === 'mission') completeMission(world, m);
      }
    } else {
      prog.holdT = Math.max(0, prog.holdT - dt * 1.5);
    }
  } else if (s.type === 'escape') {
    if (wantedStars(world) === 0 && d(s.x, s.y) < s.r) {
      const res = advanceStep(prog);
      if (res === 'mission') completeMission(world, m);
    }
  }
}

function completeMission(world, m) {
  world.money += m.reward;
  world.player.money = world.money;
  say(world, 'Job complete! ' + m.title + ' — +$' + m.reward + '.');
  world.events.push('missionComplete');
  const next = currentMission(world.progress);
  if (next) say(world, 'Job complete! +$' + m.reward + '. Next job waits at ' + FIXER.name + '.');
}

export function updateWorld(world, input, dt) {
  if (world.screen !== 'play') return;
  world.elapsed += dt;
  world.time = (8.5 + (world.elapsed * 24) / CFG.DAY_LENGTH) % 24;
  world.msgT = Math.max(0, world.msgT - dt);
  world.district = districtAt(world.player.x, world.player.y);

  updatePlayer(world, input, dt);
  if (world.screen !== 'play') return;
  updateTraffic(world, dt);
  updatePeds(world, dt);
  updatePolice(world, dt);
  if (world.screen !== 'play') return;
  updateEnemies(world, dt);
  updateBullets(world, dt);
  updateMissions(world, input, dt);

  // Particles + skids age out.
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const pt = world.particles[i];
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.life <= 0) world.particles.splice(i, 1);
  }
  for (let i = world.skids.length - 1; i >= 0; i--) {
    world.skids[i].life -= dt;
    if (world.skids[i].life <= 0) world.skids.splice(i, 1);
  }

  // Camera follows the player with a little lead toward where they face.
  const p = world.player;
  const tx = p.x + Math.cos(p.angle) * CFG.CAM_LEAD - CFG.VIEW_W / 2;
  const ty = p.y + Math.sin(p.angle) * CFG.CAM_LEAD - CFG.VIEW_H / 2;
  const k = Math.min(1, CFG.CAM_LERP * dt);
  world.camera.x += (tx - world.camera.x) * k;
  world.camera.y += (ty - world.camera.y) * k;
  world.camera.x = Math.max(0, Math.min(CFG.WORLD_W - CFG.VIEW_W, world.camera.x));
  world.camera.y = Math.max(0, Math.min(CFG.WORLD_H - CFG.VIEW_H, world.camera.y));
}

export function serializeWorld(world) {
  const p = world.player;
  const prog = world.progress;
  return {
    money: world.money,
    heat: world.heat,
    time: world.time,
    elapsed: world.elapsed,
    hp: p.hp,
    x: p.x,
    y: p.y,
    mi: prog.mi,
    si: prog.si,
    kills: prog.kills,
    collected: prog.collected,
    holdT: prog.holdT,
    started: prog.started,
    done: prog.done,
    got: prog.got.slice(),
  };
}

export function applySave(world, data) {
  if (!data) return false;
  world.money = data.money ?? world.money;
  world.player.money = world.money;
  world.heat = data.heat ?? 0;
  world.time = data.time ?? 8.5;
  world.elapsed = data.elapsed ?? 0;
  world.player.hp = data.hp ?? CFG.PLAYER_HP;
  world.player.x = data.x ?? world.player.x;
  world.player.y = data.y ?? world.player.y;
  const prog = world.progress;
  prog.mi = data.mi ?? 0;
  prog.si = data.si ?? 0;
  prog.kills = data.kills ?? 0;
  prog.collected = data.collected ?? 0;
  prog.holdT = data.holdT ?? 0;
  prog.started = !!data.started;
  prog.done = !!data.done;
  prog.got = Array.isArray(data.got) ? data.got.slice() : [];
  world.camera.x = world.player.x - CFG.VIEW_W / 2;
  world.camera.y = world.player.y - CFG.VIEW_H / 2;
  return true;
}
