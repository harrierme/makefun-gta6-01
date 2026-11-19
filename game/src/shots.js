// The screenshot scenes behind ?shot=chase|mission|beach|downtown. Each one
// sets up a real game state (a mission in progress, a wanted level, police
// already chasing), then plays the real rules forward for a few seconds with
// a simple autopilot — steering down the road, or aiming at the nearest gang
// member — so the frame is what a short game really looks like, and the same
// seed always gives the same frame.
import { STEP } from './config.js';
import { LANDMARKS } from './config.js';
import { MISSIONS, enterStage, startMission } from './missions.js';
import { addWanted, stepWorld } from './world.js';
import { makeCar } from './entities.js';

const TAU = Math.PI * 2;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** A fake input the autopilot drives: a held-key set it rewrites every step. */
function fakeInput() {
  const held = new Set();
  return {
    held,
    mouse: { x: 640, y: 360, down: false, clicked: false },
    is(action) {
      return held.has(action);
    },
    wasPressed() {
      return false;
    },
    endFrame() {},
  };
}

/**
 * Steer the player's car along a road. `heading` is the travel angle (0 for
 * east, PI/2 for south) and `lane` the lane's coordinate on the perpendicular
 * axis (a y for east/west, an x for north/south). `nav` is a small per-scene
 * state that remembers when the car is stuck: a stuck car reverses straight
 * out for a moment, then carries on.
 */
function driveRoad(state, input, heading, lane, nav) {
  const car = state.playerCar;
  if (!car) return;
  // Stuck detection: barely moving while trying to drive.
  if (Math.abs(car.speed) < 50) nav.stuck += 1 / 60;
  else nav.stuck = 0;
  if (nav.stuck > 0.4 && !nav.reversing) {
    nav.reversing = true;
    nav.reverseT = 0.7;
  }
  if (nav.reversing) {
    nav.reverseT -= 1 / 60;
    input.held.delete('up');
    input.held.add('down');
    input.held.delete('left');
    input.held.delete('right');
    if (nav.reverseT <= 0) {
      nav.reversing = false;
      nav.stuck = 0;
    }
    return;
  }
  input.held.add('up');
  input.held.delete('down');
  input.held.delete('brake');
  // The heading correction that points the nose back toward the lane. The
  // sign flips between axes: near east sin(a) ~ a, near south cos(a) ~ -a.
  const perp = heading === 0 ? car.y : car.x;
  const correction = Math.max(-0.5, Math.min(0.5, (lane - perp) * 0.002));
  const desired = heading === 0 ? correction : heading - correction;
  const diff = wrapAngle(desired - car.angle);
  input.held.delete('left');
  input.held.delete('right');
  if (diff > 0.06) input.held.add('right');
  else if (diff < -0.06) input.held.add('left');
}

function putPlayerInCar(state, x, y, angle, color) {
  const car = makeCar(x, y, angle, color, 'player');
  car.speed = 300;
  car.hp = 10000; // Staging only: the shot must survive its own chase.
  state.cars.push(car);
  state.playerCar = car;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  return car;
}

/** Aim the fake mouse at the nearest living enemy, and hold the trigger. */
function aimAtNearestEnemy(state, input) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) return;
  const cam = state.camera;
  input.mouse.x = (best.x - cam.x) * cam.zoom + window.innerWidth / 2;
  input.mouse.y = (best.y - cam.y) * cam.zoom + window.innerHeight / 2;
  input.held.add('shoot');
}

function runSteps(state, input, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(state, input, STEP);
    input.endFrame();
  }
}

/**
 * Set `state` to the named scene. Any unknown name stages the chase (the
 * cover). The state is left on the play screen, mid-action.
 */
export function stageShot(name, state) {
  const input = fakeInput();
  state.screen = 'play';
  state.hasSave = false;
  if (name === 'mission') {
    // Beachfront brawl: on foot at Palmera Beach Club, gang closing in.
    state.clock = 16.5;
    state.money = 1250;
    state.player.x = LANDMARKS.beachClub.x + 40;
    state.player.y = LANDMARKS.beachClub.y + 60;
    startMission(state, 2);
    state.mission.stageIndex = 1;
    enterStage(state);
    state.dialogue = { speaker: 'Lena Cruz', text: 'The Coral Kings are on the beach. End it, Milo.', until: state.time + 6 };
    // Two seconds of the firefight: enemies still standing, tracers flying.
    for (let i = 0; i < 120; i += 1) {
      aimAtNearestEnemy(state, input);
      stepWorld(state, input, STEP);
      input.endFrame();
    }
    return;
  }
  if (name === 'beach') {
    // Sunset drive down Ocean Drive with the first job running.
    state.clock = 18.2;
    state.money = 860;
    putPlayerInCar(state, 376, 300, Math.PI / 2, '#ff2d78');
    startMission(state, 0);
    state.mission.stageIndex = 1;
    enterStage(state);
    state.dialogue = { speaker: 'Lena Cruz', text: 'Package is in the trunk. Marina Docks, no detours.', until: state.time + 6 };
    const nav = { stuck: 0, reversing: false, reverseT: 0 };
    for (let i = 0; i < 180; i += 1) {
      driveRoad(state, input, Math.PI / 2, 376, nav);
      stepWorld(state, input, STEP);
      input.endFrame();
    }
    return;
  }
  if (name === 'downtown') {
    // Dusk on foot downtown, collecting Dario's cash with one star of heat.
    state.clock = 19.4;
    state.money = 3120;
    state.player.x = 1600;
    state.player.y = 1250;
    startMission(state, 3);
    addWanted(state, 1, 'SCPD patrol spotted you');
    state.dialogue = { speaker: 'Dario Fontaine', text: 'Six drops, two minutes. My old friends are watching — move.', until: state.time + 6 };
    for (let i = 0; i < 220; i += 1) {
      // Walk toward the nearest cash drop.
      const target = state.pickups.filter((p) => p.mission).reduce((best, p) => {
        const d = Math.hypot(p.x - state.player.x, p.y - state.player.y);
        return !best || d < best.d ? { p, d } : best;
      }, null);
      if (target) {
        const dx = target.p.x - state.player.x;
        const dy = target.p.y - state.player.y;
        input.held.delete('up');
        input.held.delete('down');
        input.held.delete('left');
        input.held.delete('right');
        if (dx > 12) input.held.add('right');
        else if (dx < -12) input.held.add('left');
        if (dy > 12) input.held.add('down');
        else if (dy < -12) input.held.add('up');
        input.held.add('run');
      }
      stepWorld(state, input, STEP);
      input.endFrame();
    }
    return;
  }
  // Default: chase — the cover. Three stars, SCPD cruisers closing in,
  // the Hot Wheels escape already running, golden hour on the eastbound
  // avenue through downtown so the camera stays centred on the chase.
  state.clock = 17.6;
  state.money = 2450;
  putPlayerInCar(state, 500, 1524, 0, '#c0392b');
  state.mission = {
    index: 1,
    def: MISSIONS[1],
    stageIndex: 2,
    active: true,
    failed: false,
    timer: 0,
    kills: 0,
    collected: 0,
    holdTime: 0,
    spawned: false,
  };
  addWanted(state, 3, 'SCPD pursuit — three stars!');
  state.dialogue = { speaker: 'Lena Cruz', text: 'Crew is in. Lose them and get to the Safehouse!', until: state.time + 6 };
  const nav = { stuck: 0, reversing: false, reverseT: 0 };
  for (let i = 0; i < 200; i += 1) {
    driveRoad(state, input, 0, 1524, nav);
    stepWorld(state, input, STEP);
    input.endFrame();
  }
  // Two SCPD cruisers right on the player's tail for the frame.
  const pc = state.playerCar;
  for (const back of [190, 330]) {
    const cop = makeCar(pc.x - Math.cos(pc.angle) * back, pc.y - Math.sin(pc.angle) * back, pc.angle, '#1c2733', 'police');
    cop.speed = 470;
    cop.cruise = 520;
    state.cars.push(cop);
  }
}
