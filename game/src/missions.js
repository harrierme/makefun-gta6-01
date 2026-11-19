// The story: five jobs for fixer Mara Quinn, in order. Each job is a list
// of steps; a step is one verb — go somewhere, pick someone up, shoot a
// number of gang members, collect a number of drops — and the module
// advances the job as the player finishes them. Nothing here draws or
// listens to keys; world.js calls updateMission once a step and reads the
// objective text and the target blip for the HUD and the minimap.

import { ENEMY } from './config.js';
import { pointInBuilding } from './city.js';
import { makeEnemy } from './entities.js';

export const MARA = { name: 'Mara Quinn', x: 320, y: 350 };
export const SAFEHOUSE = { x: 500, y: 2000, label: 'Safehouse' };
export const BANK = { name: 'Cinder Bay Bank', x: 1945, y: 1530 };
export const MARINA_ESCAPE = { x: 2700, y: 2050, label: 'Marina getaway boat' };

const HOTEL_DROP = { x: 2280, y: 800, label: 'Grand Cinder Hotel' };
const BEACH_FIGHT = { x: 2960, y: 1250, label: 'The Strand' };
const DROP_SPOTS = [
  { x: 1500, y: 1500, label: 'Bank alley cash' },
  { x: 1200, y: 1200, label: 'Willow Park cash' },
  { x: 2700, y: 1980, label: 'Marina cash' },
];

const MISSION_DEFS = [
  {
    id: 'favor',
    reward: 400,
    name: 'A Favor for Mara',
    start: { x: 2050, y: 1150, label: 'Mara Quinn' },
    intro: 'Mara Quinn needs a package at the Grand Cinder Hotel. No questions, no detours.',
    steps: [
      { kind: 'go', x: HOTEL_DROP.x, y: HOTEL_DROP.y, r: 80, text: 'Deliver the package to the Grand Cinder Hotel' },
    ],
  },
  {
    id: 'getaway',
    reward: 900,
    name: 'The Getaway',
    start: { x: 350, y: 250, label: 'Old Foundry' },
    intro: 'Mara is pinned down in the Old Foundry. Pick her up and get her to the safehouse — the CBPD will be on you.',
    steps: [
      { kind: 'pickup', x: MARA.x, y: MARA.y, r: 70, text: 'Pick up Mara Quinn in the Old Foundry' },
      { kind: 'escape', x: SAFEHOUSE.x, y: SAFEHOUSE.y, r: 90, text: 'Drive Mara to the Harborview safehouse — lose the heat on the way' },
    ],
  },
  {
    id: 'strand',
    reward: 1200,
    name: 'Trouble on the Strand',
    start: { x: 2900, y: 1150, label: 'The Strand' },
    intro: 'The Harbor Rats are shaking down the beach bars. Clear them out — all six.',
    steps: [
      { kind: 'kill', count: 6, area: BEACH_FIGHT, text: 'Take out the Harbor Rats on the Strand (0/6)' },
    ],
  },
  {
    id: 'drops',
    reward: 1500,
    name: 'Three Drops',
    start: { x: 1500, y: 800, label: 'Civic Center' },
    intro: 'Three cash drops, three corners of the city, three minutes. Mara is counting on you.',
    steps: [
      { kind: 'collect', count: 3, spots: DROP_SPOTS, time: 180, text: 'Collect the three cash drops (0/3)' },
    ],
  },
  {
    id: 'cinder-job',
    reward: 5000,
    name: 'The Cinder Job',
    start: { x: 1800, y: 1650, label: 'Cinder Bay Bank' },
    intro: 'The big one. Hit the Cinder Bay Bank, grab the vault cash and vanish at the marina. Four stars, no mistakes.',
    steps: [
      { kind: 'kill', count: 4, area: { x: BANK.x, y: BANK.y, label: 'Cinder Bay Bank' }, text: 'Deal with the bank guards (0/4)' },
      { kind: 'collect', count: 1, spots: [{ x: BANK.x, y: BANK.y, label: 'Vault cash' }], text: 'Grab the vault cash' },
      { kind: 'escape', x: MARINA_ESCAPE.x, y: MARINA_ESCAPE.y, r: 90, text: 'Escape to the marina getaway boat — the whole CBPD is coming' },
    ],
  },
];

export function missionCount() {
  return MISSION_DEFS.length;
}

export function missionDef(index) {
  return MISSION_DEFS[index] ?? null;
}

/** The start marker of the next unfinished job, or null when the story is done. */
export function nextMissionStart(state) {
  const def = missionDef(state.mission.index);
  return def ? def.start : null;
}

export function freshMissionState() {
  return {
    index: 0, // next job to start
    active: false,
    stepIndex: 0,
    objective: '',
    target: null, // {x, y, r, label} for the HUD arrow and the minimap blip
    timer: 0,
    killsLeft: 0,
    collected: 0,
    toCollect: 0,
    maraWithPlayer: false,
    done: [false, false, false, false, false],
  };
}

function setObjective(state, text, target) {
  state.mission.objective = text;
  state.mission.target = target ?? null;
}

function spawnGang(state, area, count) {
  for (let i = 0; i < count; i += 1) {
    // A ring around the area, far enough out that the player gets a moment
    // to react — but never inside a building: walk the radius inward until
    // the spot is open ground.
    const angle = (i / count) * Math.PI * 2;
    let x = area.x;
    let y = area.y;
    for (let radius = 280; radius >= 100; radius -= 20) {
      const tryX = area.x + Math.cos(angle) * radius;
      const tryY = area.y + Math.sin(angle) * radius;
      if (tryX < 40 || tryX > 3080 || tryY < 40 || tryY > 2360) continue;
      if (pointInBuilding(state.city, tryX, tryY)) continue;
      x = tryX;
      y = tryY;
      break;
    }
    const enemy = makeEnemy(x, y);
    enemy.id = state.nextId;
    state.nextId += 1;
    state.enemies.push(enemy);
  }
}

function spawnDrops(state, spots) {
  for (const spot of spots) {
    state.pickups.push({ x: spot.x, y: spot.y, kind: 'cash', label: spot.label, amount: 0 });
  }
}

/** Begin step `stepIndex` of the active job: set the objective, spawn what it needs. */
function enterStep(state, stepIndex) {
  const def = missionDef(state.mission.index);
  const step = def.steps[stepIndex];
  state.mission.stepIndex = stepIndex;
  if (step.kind === 'go' || step.kind === 'pickup' || step.kind === 'escape') {
    setObjective(state, step.text, { x: step.x, y: step.y, r: step.r, label: step.label ?? def.name });
    if (step.kind === 'escape' && def.id === 'getaway') state.wanted = Math.max(state.wanted, 2);
    if (step.kind === 'escape' && def.id === 'cinder-job') state.wanted = Math.max(state.wanted, 4);
  } else if (step.kind === 'kill') {
    state.mission.killsLeft = step.count;
    state.mission.toCollect = step.count;
    setObjective(state, step.text, { x: step.area.x, y: step.area.y, r: 160, label: step.area.label });
    spawnGang(state, step.area, step.count);
  } else if (step.kind === 'collect') {
    state.mission.collected = 0;
    state.mission.toCollect = step.count;
    setObjective(state, step.text, { x: step.spots[0].x, y: step.spots[0].y, r: 90, label: step.spots[0].label });
    spawnDrops(state, step.spots);
    if (step.time) state.mission.timer = step.time;
  }
}

/** Start the next job. Returns its intro line for the HUD. */
export function startMission(state) {
  const def = missionDef(state.mission.index);
  if (!def) return null;
  state.mission.active = true;
  state.mission.maraWithPlayer = false;
  enterStep(state, 0);
  return def.intro;
}

function finishMission(state) {
  const def = missionDef(state.mission.index);
  state.money += def.reward;
  state.mission.done[state.mission.index] = true;
  state.mission.index += 1;
  state.mission.active = false;
  state.mission.objective = '';
  state.mission.target = null;
  state.mission.maraWithPlayer = false;
  return def;
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Advance the active job one step. Returns 'done' when a job is completed,
 * 'step' when a step is completed, 'fail' when a timed job runs out, else ''.
 */
export function updateMission(state, dt) {
  const mission = state.mission;
  if (!mission.active) return '';
  const def = missionDef(mission.index);
  const step = def.steps[mission.stepIndex];
  const player = state.player;
  const px = player.onFoot ? player.x : player.car.x;
  const py = player.onFoot ? player.y : player.car.y;

  if (step.kind === 'collect' && step.time) {
    mission.timer -= dt;
    if (mission.timer <= 0) {
      mission.active = false;
      mission.objective = '';
      mission.target = null;
      state.pickups.length = 0;
      state.enemies.length = 0;
      return 'fail';
    }
  }

  if (step.kind === 'go' || step.kind === 'pickup' || step.kind === 'escape') {
    if (distance(px, py, step.x, step.y) <= step.r) {
      if (step.kind === 'pickup') mission.maraWithPlayer = true;
      return advanceStep(state);
    }
    return '';
  }

  if (step.kind === 'kill') {
    const done = mission.toCollect - mission.killsLeft;
    mission.objective = step.text.replace(/\(\d+\/\d+\)/, `(${done}/${mission.toCollect})`);
    if (mission.killsLeft <= 0) return advanceStep(state);
    return '';
  }

  if (step.kind === 'collect') {
    const done = mission.collected;
    mission.objective = step.text.replace(/\(\d+\/\d+\)/, `(${done}/${mission.toCollect})`);
    if (mission.collected >= mission.toCollect) return advanceStep(state);
    return '';
  }
  return '';
}

function advanceStep(state) {
  const def = missionDef(state.mission.index);
  const next = state.mission.stepIndex + 1;
  if (next >= def.steps.length) {
    finishMission(state);
    return 'done';
  }
  enterStep(state, next);
  return 'step';
}

/** Called by the world when the player shoots an enemy dead during a kill step. */
export function noteKill(state) {
  if (state.mission.active && state.mission.killsLeft > 0) state.mission.killsLeft -= 1;
}

/** Called by the world when the player walks over a cash pickup. */
export function notePickup(state) {
  if (state.mission.active) state.mission.collected += 1;
}

/** The seconds left on a timed step, or 0. */
export function missionTimer(state) {
  return state.mission.timer;
}

export { ENEMY };
