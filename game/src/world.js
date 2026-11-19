// The world: one state object and one step function. The state holds the
// player, every car, pedestrian, cop and gang member, the wanted level, the
// mission, the clock and the camera; stepWorld advances all of it one fixed
// step from the input. Saving is a small JSON blob in localStorage.
import {
  CAR, COLORS, LANDMARKS, PLAYER, POLICE, ROAD_W, ROAD_XS, ROAD_YS, SAVE_KEY, TRAFFIC, PEDS, WANTED, WEAPON, WORLD,
} from './config.js';
import { createCity, nearestRoadCentre, paintMinimap, paintStaticWorld, resolveSolid } from './city.js';
import {
  addBlood, addExplosion, addMuzzle, addSmoke, addSparks, addTracer, makeCar, makePed,
  nearestCar, nearestEnterableCar, resolveCarCollision, scarePeds, stepParticles, stepPed,
  stepPlayerCar, stepPoliceCar, stepTrafficCar,
} from './entities.js';
import { failMission, updateMission } from './missions.js';

const TAU = Math.PI * 2;

function randRoadPoint(random) {
  const vertical = random.chance(0.5);
  if (vertical) {
    return { x: random.pick(ROAD_XS), y: random.range(60, WORLD.height - 60) };
  }
  return { x: random.range(360, WORLD.width - 60), y: random.pick(ROAD_YS) };
}

export function createWorld(random, audio) {
  const city = createCity(random);
  const state = {
    random,
    audio,
    city,
    staticCanvas: paintStaticWorld(city),
    minimapCanvas: paintMinimap(city, 220, 150),
    screen: 'title',
    time: 0,
    clock: 17.5,
    money: 250,
    health: PLAYER.maxHealth,
    wanted: 0,
    wantedTimer: 0,
    lastCrimeAt: -100,
    missionsDone: 0,
    mission: null,
    player: {
      x: LANDMARKS.garage.x - 60,
      y: LANDMARKS.garage.y + 90,
      angle: -Math.PI / 2,
      aimAngle: 0,
      ammo: WEAPON.pistol.mag,
      reloading: false,
      reloadTimer: 0,
      fireTimer: 0,
      invulnerable: 0,
    },
    playerCar: null,
    cars: [],
    peds: [],
    cops: [],
    enemies: [],
    particles: [],
    skids: [],
    pickups: [],
    camera: { x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, zoom: 1, shake: 0 },
    message: '',
    messageUntil: 0,
    dialogue: null,
    bustTimer: 0,
    stats: { carsStolen: 0, shotsFired: 0, pedsDown: 0, copsDown: 0, distance: 0 },
    muted: false,
    menuIndex: 0,
    overReason: '',
    lastSave: 0,
    save() {
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify({
          money: state.money,
          missionsDone: state.missionsDone,
          health: state.health,
          x: state.player.x,
          y: state.player.y,
          clock: state.clock,
        }));
      } catch {
        // Storage off: the save lasts this visit only.
      }
    },
    loadSave() {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        state.money = data.money ?? 250;
        state.missionsDone = data.missionsDone ?? 0;
        state.health = data.health ?? PLAYER.maxHealth;
        state.player.x = data.x ?? state.player.x;
        state.player.y = data.y ?? state.player.y;
        state.clock = data.clock ?? 17.5;
        return true;
      } catch {
        return false;
      }
    },
  };

  spawnTraffic(state);
  spawnPeds(state);
  spawnParked(state);
  // A few health and ammo pickups around the city.
  state.pickups.push(
    { x: 1200, y: 700, kind: 'health', amount: 40, bob: 0 },
    { x: 2000, y: 1500, kind: 'health', amount: 40, bob: 0 },
    { x: 800, y: 1900, kind: 'ammo', amount: 24, bob: 0 },
    { x: 2400, y: 300, kind: 'ammo', amount: 24, bob: 0 },
  );
  return state;
}

function spawnTraffic(state) {
  const { random } = state;
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const p = randRoadPoint(random);
    const vertical = random.chance(0.5);
    const dir = vertical ? (random.chance(0.5) ? 1 : 3) : (random.chance(0.5) ? 0 : 2);
    // Start in the right-hand lane for the direction of travel.
    const x = dir === 1 ? p.x - 24 : dir === 3 ? p.x + 24 : p.x;
    const y = dir === 0 ? p.y + 24 : dir === 2 ? p.y - 24 : p.y;
    const car = makeCar(x, y, [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir], random.pick(COLORS.carColors), 'traffic');
    car.dir = dir;
    car.cruise = random.range(TRAFFIC.minSpeed, TRAFFIC.maxSpeed);
    car.speed = car.cruise;
    car.driver = true;
    state.cars.push(car);
  }
}

function spawnPeds(state) {
  const { random } = state;
  for (let i = 0; i < PEDS.count; i += 1) {
    const p = randRoadPoint(random);
    const ped = makePed(p.x + random.range(-60, 60), p.y + random.range(-60, 60), random);
    state.peds.push(ped);
  }
}

function spawnParked(state) {
  for (const p of state.city.parked) {
    const car = makeCar(p.x, p.y, p.angle, p.color, 'parked');
    state.cars.push(car);
  }
  // A starter car near the garage so the first job is easy to reach.
  const starter = makeCar(LANDMARKS.garage.x + 40, LANDMARKS.garage.y + 130, 0, '#16a085', 'parked');
  state.cars.push(starter);
}

// ---- Wanted level ------------------------------------------------------------

export function addWanted(state, stars, reason) {
  if (stars <= 0) return;
  state.wanted = Math.min(WANTED.max, state.wanted + stars);
  state.lastCrimeAt = state.time;
  state.wantedTimer = 0;
  if (reason) {
    state.message = reason;
    state.messageUntil = state.time + 2.5;
  }
}

function updateWanted(state, dt) {
  if (state.wanted === 0) return;
  const nearPolice = state.cars.some((c) => c.kind === 'police' && !c.dead && Math.hypot(c.x - state.player.x, c.y - state.player.y) < 500)
    || state.cops.some((c) => Math.hypot(c.x - state.player.x, c.y - state.player.y) < 400);
  if (nearPolice || state.time - state.lastCrimeAt < WANTED.decayDelay) {
    state.wantedTimer = 0;
    return;
  }
  state.wantedTimer += dt;
  if (state.wantedTimer >= WANTED.decayInterval) {
    state.wantedTimer = 0;
    state.wanted -= 1;
    if (state.wanted === 0) {
      state.message = 'You lost the cops.';
      state.messageUntil = state.time + 2.5;
    }
  }
}

function updatePolice(state, dt) {
  const { random } = state;
  // Police cars: one per star, up to five.
  const wantCars = Math.min(state.wanted, POLICE.maxCars);
  const haveCars = state.cars.filter((c) => c.kind === 'police' && !c.dead).length;
  if (haveCars < wantCars) {
    const angle = random.range(0, TAU);
    const dist = 620 + random.range(0, 160);
    const p = nearestRoadCentre(
      state.player.x + Math.cos(angle) * dist,
      state.player.y + Math.sin(angle) * dist,
    );
    const car = makeCar(p.x, p.y, Math.atan2(state.player.y - p.y, state.player.x - p.x), '#1c2733', 'police');
    car.cruise = POLICE.chaseSpeed;
    state.cars.push(car);
  }
  // On-foot cops when the player is on foot and the heat is on.
  const wantCops = !state.playerCar && state.wanted >= 2 ? Math.min(2, state.wanted - 1) : 0;
  if (state.cops.length < wantCops) {
    const angle = random.range(0, TAU);
    state.cops.push({
      x: state.player.x + Math.cos(angle) * 420,
      y: state.player.y + Math.sin(angle) * 420,
      angle: 0,
      speed: 205,
      bustTimer: 0,
    });
  }
  state.audio.siren(state.wanted > 0);
  // Chase the player; touch them on foot long enough and it is over.
  for (const cop of state.cops) {
    const dx = state.player.x - cop.x;
    const dy = state.player.y - cop.y;
    const d = Math.hypot(dx, dy);
    cop.angle = Math.atan2(dy, dx);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    if (d < 30 && !state.playerCar) {
      cop.bustTimer += dt;
      if (cop.bustTimer >= POLICE.bustTime) {
        busted(state);
        return;
      }
    } else {
      cop.bustTimer = 0;
    }
  }
  state.cops = state.cops.filter((c) => Math.hypot(c.x - state.player.x, c.y - state.player.y) < 1400);
}

function busted(state) {
  state.screen = 'busted';
  state.overReason = 'BUSTED';
  state.wanted = 0;
  state.money = Math.max(0, state.money - Math.min(200, Math.floor(state.money * 0.1)));
  state.cops = [];
  state.cars = state.cars.filter((c) => c.kind !== 'police');
  if (state.mission) failMission(state, 'Busted by the SCPD');
  state.audio.siren(false);
  state.audio.engine(false);
}

function wasted(state) {
  state.screen = 'wasted';
  state.overReason = 'WASTED';
  state.wanted = 0;
  state.money = Math.max(0, state.money - Math.min(300, Math.floor(state.money * 0.15)));
  state.cops = [];
  state.cars = state.cars.filter((c) => c.kind !== 'police');
  if (state.mission) failMission(state, 'You got wasted');
  state.audio.siren(false);
  state.audio.engine(false);
}

export function respawn(state) {
  const atHospital = state.overReason === 'WASTED';
  const spot = atHospital ? LANDMARKS.hospital : LANDMARKS.policeHq;
  state.player.x = spot.x + 60;
  state.player.y = spot.y + 60;
  state.playerCar = null;
  state.health = PLAYER.maxHealth;
  state.player.ammo = WEAPON.pistol.mag;
  state.screen = 'play';
  state.message = atHospital ? 'Patched up at Solmar General. Hospital bill taken.' : 'Released from SCPD HQ. Stay out of trouble, Milo.';
  state.messageUntil = state.time + 4;
}

// ---- Shooting ------------------------------------------------------------------

function shootAt(state, fromX, fromY, angle, damage, isPlayer) {
  const range = WEAPON.pistol.range;
  const ex = fromX + Math.cos(angle) * range;
  const ey = fromY + Math.sin(angle) * range;
  addTracer(state, fromX, fromY, ex, ey);
  addMuzzle(state, fromX, fromY, angle);
  // Nearest living thing near the ray.
  let best = null;
  let bestD = range;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  function consider(x, y, radius, target) {
    const rx = x - fromX;
    const ry = y - fromY;
    const along = rx * dx + ry * dy;
    if (along < 0 || along > bestD) return;
    const perp = Math.abs(rx * dy - ry * dx);
    if (perp < radius + 6) {
      bestD = along;
      best = target;
    }
  }
  for (const e of state.enemies) if (!e.dead) consider(e.x, e.y, 14, { kind: 'enemy', ref: e });
  for (const p of state.peds) if (!p.dead && p.state !== 'down') consider(p.x, p.y, 12, { kind: 'ped', ref: p });
  for (const c of state.cops) consider(c.x, c.y, 12, { kind: 'cop', ref: c });
  for (const car of state.cars) {
    if (car.dead || (isPlayer && car === state.playerCar)) continue;
    consider(car.x, car.y, CAR.radius, { kind: 'car', ref: car });
  }
  if (best) {
    const hx = fromX + dx * bestD;
    const hy = fromY + dy * bestD;
    addBlood(state, hx, hy);
    if (best.kind === 'enemy') {
      best.ref.hp -= damage;
      state.audio.hit();
      if (best.ref.hp <= 0) {
        best.ref.dead = true;
        state.money += 60;
        if (state.mission) state.mission.kills += 1;
        state.message = 'Gang member down  +$60';
        state.messageUntil = state.time + 2;
      }
    } else if (best.kind === 'ped') {
      best.ref.state = 'down';
      best.ref.dead = true;
      state.stats.pedsDown += 1;
      addWanted(state, 1, 'Pedestrian down — the SCPD saw that!');
      scarePeds(state, hx, hy, 300);
    } else if (best.kind === 'cop') {
      state.stats.copsDown += 1;
      addWanted(state, 2, 'You shot a cop! Wanted level up.');
      state.cops = state.cops.filter((c) => c !== best.ref);
    } else if (best.kind === 'car') {
      best.ref.hp -= damage;
      addSparks(state, hx, hy);
      if (best.ref.hp <= 0) explodeCar(state, best.ref);
    }
    return true;
  }
  return false;
}

function explodeCar(state, car) {
  if (car.dead) return;
  car.dead = true;
  addExplosion(state, car.x, car.y);
  state.audio.explosion();
  state.camera.shake = 14;
  scarePeds(state, car.x, car.y, 320);
  if (car === state.playerCar) {
    state.playerCar = null;
    state.player.x = car.x + 40;
    state.player.y = car.y;
    damagePlayer(state, 25);
  }
  if (car.kind === 'police') {
    state.message = 'Police car destroyed!';
    state.messageUntil = state.time + 2;
  }
}

export function damagePlayer(state, amount) {
  if (state.player.invulnerable > 0 || state.screen !== 'play') return;
  state.health -= amount;
  state.player.invulnerable = 0.4;
  if (state.health <= 0) {
    state.health = 0;
    wasted(state);
  }
}

// ---- The step --------------------------------------------------------------------

export function stepWorld(state, input, dt) {
  if (state.screen !== 'play') return;
  state.time += dt;
  state.clock = (state.clock + dt / 120) % 24;
  const p = state.player;
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.fireTimer = Math.max(0, p.fireTimer - dt);
  if (p.reloading) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.reloading = false;
      p.ammo = WEAPON.pistol.mag;
    }
  }

  // Aim: from the player toward the mouse, in world space.
  const cam = state.camera;
  const mouseWorldX = cam.x + (input.mouse.x - window.innerWidth / 2) / cam.zoom;
  const mouseWorldY = cam.y + (input.mouse.y - window.innerHeight / 2) / cam.zoom;
  p.aimAngle = Math.atan2(mouseWorldY - p.y, mouseWorldX - p.x);

  // Enter or exit a car.
  if (input.wasPressed('enter')) {
    if (state.playerCar) {
      const car = state.playerCar;
      state.playerCar = null;
      car.speed = 0;
      car.vx = 0;
      car.vy = 0;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      const fixed = resolveSolid(state.city, p.x, p.y, PLAYER.radius);
      p.x = fixed.x;
      p.y = fixed.y;
      state.audio.engine(false);
    } else {
      const car = nearestEnterableCar(state.cars, p.x, p.y, 58);
      if (car) {
        if (car.kind === 'traffic' && car.driver) {
          // Carjacking: the driver bails and runs.
          car.driver = false;
          const driver = makePed(car.x + 30, car.y, state.random);
          driver.state = 'flee';
          state.peds.push(driver);
          addWanted(state, 1, 'Carjacked in broad daylight!');
          state.stats.carsStolen += 1;
          state.message = 'Car stolen!';
          state.messageUntil = state.time + 2;
        } else if (car.kind === 'police') {
          addWanted(state, 2, 'You stole a police cruiser!');
        }
        state.playerCar = car;
        car.kind = 'player';
        p.x = car.x;
        p.y = car.y;
        state.audio.engine(true, 0);
      }
    }
  }

  if (state.playerCar) {
    const car = state.playerCar;
    const result = stepPlayerCar(car, input, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    state.stats.distance += Math.abs(car.speed) * dt;
    state.audio.engine(true, Math.abs(car.speed) / CAR.maxSpeed);
    if (result.skidding) {
      state.skids.push({
        x1: car.x - Math.cos(car.angle) * 16, y1: car.y - Math.sin(car.angle) * 16,
        x2: car.x - Math.cos(car.angle) * 16 - car.vx * dt * 2, y2: car.y - Math.sin(car.angle) * 16 - car.vy * dt * 2,
        life: 0,
      });
      if (Math.random() < 0.3) addSmoke(state, car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18);
    }
    // Horn on click.
    if (input.mouse.clicked) state.audio.horn();
    const fixed = resolveSolid(state.city, car.x, car.y, CAR.radius);
    if (fixed.x !== car.x || fixed.y !== car.y) {
      const impact = Math.hypot(car.vx, car.vy);
      if (impact > 240) {
        car.hp -= impact * 0.06;
        addSparks(state, car.x, car.y);
        state.audio.crash();
        state.camera.shake = Math.min(10, impact * 0.02);
        damagePlayer(state, impact * 0.02);
      }
      car.x = fixed.x;
      car.y = fixed.y;
      car.vx *= 0.4;
      car.vy *= 0.4;
      car.speed *= 0.4;
    }
    // Run over pedestrians.
    for (const ped of state.peds) {
      if (ped.dead || ped.state === 'down') continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < CAR.radius + 10 && Math.abs(car.speed) > 60) {
        ped.state = 'down';
        ped.dead = true;
        addBlood(state, ped.x, ped.y);
        state.stats.pedsDown += 1;
        addWanted(state, 1, 'Pedestrian hit — witnesses called it in!');
        scarePeds(state, ped.x, ped.y, 320);
        state.camera.shake = 6;
      }
    }
    if (car.hp <= 0) explodeCar(state, car);
    else if (car.hp < 40 && Math.random() < dt * 6) addSmoke(state, car.x, car.y - 10);
  } else {
    // On foot: walk or run, collide with buildings and cars.
    let mx = (input.is('right') ? 1 : 0) - (input.is('left') ? 1 : 0);
    let my = (input.is('down') ? 1 : 0) - (input.is('up') ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      const speed = input.is('run') ? PLAYER.runSpeed : PLAYER.walkSpeed;
      p.x += mx * speed * dt;
      p.y += my * speed * dt;
      p.angle = Math.atan2(my, mx);
      const fixed = resolveSolid(state.city, p.x, p.y, PLAYER.radius);
      p.x = fixed.x;
      p.y = fixed.y;
      for (const car of state.cars) {
        if (car.dead) continue;
        const d = Math.hypot(p.x - car.x, p.y - car.y);
        if (d < CAR.radius + PLAYER.radius - 4) {
          const push = CAR.radius + PLAYER.radius - 4 - d;
          p.x += ((p.x - car.x) / (d || 1)) * push;
          p.y += ((p.y - car.y) / (d || 1)) * push;
        }
      }
    }
    // Shooting.
    if (input.wasPressed('reload') && !p.reloading && p.ammo < WEAPON.pistol.mag) {
      p.reloading = true;
      p.reloadTimer = WEAPON.pistol.reloadTime;
    }
    if (input.is('shoot') && !p.reloading && p.fireTimer <= 0) {
      if (p.ammo <= 0) {
        p.reloading = true;
        p.reloadTimer = WEAPON.pistol.reloadTime;
      } else {
        p.fireTimer = WEAPON.pistol.fireInterval;
        p.ammo -= 1;
        state.stats.shotsFired += 1;
        const spread = (Math.random() - 0.5) * WEAPON.pistol.spread * 2;
        shootAt(state, p.x, p.y, p.aimAngle + spread, WEAPON.pistol.damage, true);
        state.audio.shot();
        state.camera.shake = Math.max(state.camera.shake, 2);
        scarePeds(state, p.x, p.y, 260);
        // Firing in public draws the law.
        if (state.wanted === 0 && (state.cops.length > 0 || state.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 500))) {
          addWanted(state, 1, 'Shots fired — SCPD responding!');
        }
      }
    }
    state.audio.engine(false);
  }

  // Traffic, police cars.
  for (const car of state.cars) {
    if (car.dead) continue;
    if (car.kind === 'traffic') stepTrafficCar(car, state, dt, state.random);
    else if (car.kind === 'police') stepPoliceCar(car, state, dt);
  }
  // Car-car collisions.
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    if (cars[i].dead) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      if (cars[j].dead) continue;
      if (resolveCarCollision(cars[i], cars[j])) {
        const a = cars[i];
        const b = cars[j];
        a.hp -= 4;
        b.hp -= 4;
        if (a === state.playerCar || b === state.playerCar) {
          state.audio.crash();
          state.camera.shake = Math.max(state.camera.shake, 4);
        }
        if (a.hp <= 0) explodeCar(state, a);
        if (b.hp <= 0) explodeCar(state, b);
      }
    }
  }
  // Keep traffic near the player; recycle what drifts too far.
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    if (Math.hypot(car.x - p.x, car.y - p.y) > 1500) {
      const np = randRoadPoint(state.random);
      car.x = np.x;
      car.y = np.y;
    }
  }
  for (const ped of state.peds) stepPed(ped, state, dt, state.random);
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    enemy.flash = Math.max(0, enemy.flash - dt);
    const d = Math.hypot(p.x - enemy.x, p.y - enemy.y);
    enemy.angle = Math.atan2(p.y - enemy.y, p.x - enemy.x);
    enemy.shootTimer -= dt;
    if (d < 380 && enemy.shootTimer <= 0) {
      enemy.shootTimer = 0.9 + Math.random() * 0.7;
      enemy.flash = 0.08;
      const spread = (Math.random() - 0.5) * 0.35;
      const tx = state.playerCar ? state.playerCar.x : p.x;
      const ty = state.playerCar ? state.playerCar.y : p.y;
      const a = Math.atan2(ty - enemy.y, tx - enemy.x) + spread;
      addTracer(state, enemy.x, enemy.y, enemy.x + Math.cos(a) * 380, enemy.y + Math.sin(a) * 380);
      addMuzzle(state, enemy.x, enemy.y, a);
      state.audio.enemyShot();
      if (Math.random() < 0.45) {
        if (state.playerCar) {
          state.playerCar.hp -= 8;
          if (state.playerCar.hp <= 0) explodeCar(state, state.playerCar);
        } else {
          damagePlayer(state, 9);
        }
      }
    }
    // Gang members hold their ground but step toward the player slowly.
    if (d > 160) {
      enemy.x += Math.cos(enemy.angle) * 42 * dt;
      enemy.y += Math.sin(enemy.angle) * 42 * dt;
    }
  }
  state.enemies = state.enemies.filter((e) => !e.dead);

  // Pickups: bob, and collect on touch.
  for (const pickup of state.pickups) {
    pickup.bob += dt * 3;
    const d = Math.hypot(p.x - pickup.x, p.y - pickup.y);
    if (d < 34) {
      if (pickup.kind === 'cash') {
        state.money += pickup.amount;
        state.audio.cash();
        if (pickup.mission && state.mission) state.mission.collected += 1;
        state.message = `+$${pickup.amount}`;
        state.messageUntil = state.time + 1.5;
      } else if (pickup.kind === 'health') {
        state.health = Math.min(PLAYER.maxHealth, state.health + pickup.amount);
        state.audio.pickup();
      } else if (pickup.kind === 'ammo') {
        p.ammo = WEAPON.pistol.mag;
        state.audio.pickup();
      }
      pickup.taken = true;
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);

  updateWanted(state, dt);
  updatePolice(state, dt);
  updateMission(state, dt);
  stepParticles(state, dt);

  // Camera: follow the player, lead a little in the direction of travel,
  // zoom out a touch in a car and at speed, and shake on impacts.
  const target = state.playerCar || p;
  const lead = state.playerCar ? 0.35 : 0.12;
  const tx = target.x + (target.vx || 0) * lead;
  const ty = target.y + (target.vy || 0) * lead;
  cam.x += (tx - cam.x) * Math.min(1, dt * 4);
  cam.y += (ty - cam.y) * Math.min(1, dt * 4);
  const speedRatio = state.playerCar ? Math.abs(state.playerCar.speed) / CAR.maxSpeed : 0;
  const wantZoom = state.playerCar ? 0.82 - speedRatio * 0.14 : 1.02;
  cam.zoom += (wantZoom - cam.zoom) * Math.min(1, dt * 2);
  cam.shake = Math.max(0, cam.shake - dt * 22);

  // Keep the camera inside the world so the frame never shows the void
  // past the map's edge.
  const halfW = window.innerWidth / 2 / cam.zoom;
  const halfH = window.innerHeight / 2 / cam.zoom;
  cam.x = Math.max(halfW, Math.min(WORLD.width - halfW, cam.x));
  cam.y = Math.max(halfH, Math.min(WORLD.height - halfH, cam.y));

  // Autosave every 20 seconds of play.
  if (Math.floor(state.time) % 20 === 0 && state.time - state.lastSave > 1) {
    state.lastSave = state.time;
    state.save();
  }
}

/** Daylight tint for an in-game hour: [red, green, blue, alpha] overlay. */
export function daylightTint(hour) {
  if (hour >= 6 && hour < 9) return [255, 190, 130, 0.1]; // dawn
  if (hour >= 9 && hour < 16) return [255, 240, 200, 0.04]; // midday
  if (hour >= 16 && hour < 19) return [255, 170, 90, 0.16]; // golden hour
  if (hour >= 19 && hour < 21) return [120, 70, 160, 0.28]; // dusk
  return [20, 30, 90, 0.38]; // night
}
