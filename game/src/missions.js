// The story: five jobs from fixer Dario Vane, in order.
// Juno Reyes, a driver new to Solmar Bay, owes Vane a favour —
// and Vane collects in jobs, not cash.
import { CFG } from './config.js';
import { pointInBuilding } from './city.js';

export const FIXER = { x: 1295, y: 695, name: "Vane's Garage" };

export const MISSIONS = [
  {
    id: 'm1-first-errand',
    title: 'First Errand',
    giver: 'Dario Vane',
    reward: 400,
    intro: 'Vane: "Package in my garage, Juno. Take it to the Fish Market. No detours."',
    steps: [
      { type: 'pickup', label: 'Pick up the package at Vane\'s Garage', x: FIXER.x, y: FIXER.y, r: 46 },
      { type: 'goto', label: 'Deliver the package to the Fish Market', x: 2120, y: 1330, r: 70 },
    ],
  },
  {
    id: 'm2-cash-drops',
    title: 'Cash Drops',
    giver: 'Dario Vane',
    reward: 650,
    intro: 'Vane: "Three of my runners left cash stashed around town. Scoop it all up."',
    steps: [
      {
        type: 'collect', label: 'Collect the stashed cash',
        count: 3,
        points: [
          { x: 620, y: 420 },
          { x: 1680, y: 940 },
          { x: 2550, y: 1780 },
        ],
        r: 44,
      },
    ],
  },
  {
    id: 'm3-pier-trouble',
    title: 'Trouble on the Pier',
    giver: 'Dario Vane',
    reward: 950,
    intro: 'Vane: "The Tide Boys are muscling my pier. Send them a message — the loud kind."',
    steps: [
      { type: 'kill', label: 'Deal with the Tide Boys at the pier', x: 2880, y: 1300, count: 4, r: 260 },
    ],
  },
  {
    id: 'm4-hold-warehouse',
    title: 'Hold the Warehouse',
    giver: 'Dario Vane',
    reward: 1250,
    intro: 'Vane: "A shipment lands at the South Docks warehouse tonight. Hold the yard till it\'s done."',
    steps: [
      { type: 'hold', label: 'Hold the warehouse yard', x: 620, y: 1900, r: 110, seconds: 20 },
    ],
  },
  {
    id: 'm5-big-score',
    title: 'The Big Score',
    giver: 'Dario Vane',
    reward: 2600,
    intro: 'Vane: "One last job. Lift the ledger from the bank, shake the heat, and meet me at the south lot."',
    steps: [
      { type: 'pickup', label: 'Lift the ledger from Solmar National Bank', x: 2050, y: 900, r: 50 },
      { type: 'escape', label: 'Lose the heat, then reach the south lot', x: 520, y: 2200, r: 80 },
    ],
  },
];

export function createMissionProgress() {
  return { mi: 0, si: 0, kills: 0, collected: 0, holdT: 0, got: [], started: false, done: false };
}

export function currentMission(p) {
  return p.mi < MISSIONS.length ? MISSIONS[p.mi] : null;
}

export function currentStep(p) {
  const m = currentMission(p);
  return m ? m.steps[p.si] : null;
}

// Where the HUD blip / arrow should point right now.
export function missionTarget(p) {
  const m = currentMission(p);
  if (!m) return null;
  if (!p.started) return { x: FIXER.x, y: FIXER.y, label: 'Go to ' + FIXER.name + ' (press E)', r: 60 };
  const s = currentStep(p);
  if (!s) return null;
  if (s.type === 'collect') {
    const next = s.points.find((pt, i) => !p.got.includes(i));
    if (!next) return null;
    return { x: next.x, y: next.y, label: s.label, r: s.r };
  }
  return { x: s.x, y: s.y, label: s.label, r: s.r || 70 };
}

export function missionObjective(p) {
  const m = currentMission(p);
  if (!m) return 'All jobs done — Solmar Bay is yours, Juno.';
  if (!p.started) return m.title + ': go to ' + FIXER.name + ' and press E';
  const s = currentStep(p);
  if (!s) return m.title;
  switch (s.type) {
    case 'goto': return m.title + ': ' + s.label;
    case 'pickup': return m.title + ': ' + s.label + ' (E)';
    case 'kill': return m.title + ': ' + s.label + ' (' + p.kills + '/' + s.count + ')';
    case 'collect': return m.title + ': ' + s.label + ' (' + p.collected + '/' + s.count + ')';
    case 'hold': return m.title + ': ' + s.label + ' (' + Math.ceil(Math.max(0, s.seconds - p.holdT)) + 's)';
    case 'escape': return m.title + ': ' + s.label;
    default: return m.title + ': ' + s.label;
  }
}

export function startMission(p) {
  const m = currentMission(p);
  if (!m || p.started) return null;
  p.started = true;
  p.si = 0;
  p.kills = 0;
  p.collected = 0;
  p.holdT = 0;
  p.got = [];
  return m;
}

// Advance to the next step. Returns 'mission' when the mission is complete,
// 'step' when a step is complete, null otherwise.
export function advanceStep(p) {
  const m = currentMission(p);
  if (!m) return null;
  p.si += 1;
  p.kills = 0;
  p.collected = 0;
  p.holdT = 0;
  p.got = [];
  if (p.si >= m.steps.length) {
    p.mi += 1;
    p.si = 0;
    p.started = false;
    if (p.mi >= MISSIONS.length) p.done = true;
    return 'mission';
  }
  return 'step';
}

// Enemy spawn spots around a shootout centre, on open ground.
export function shootoutEnemySpots(city, rng, cx, cy, n) {
  const spots = [];
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const x = cx + rng.range(-220, 220);
      const y = cy + rng.range(-220, 220);
      if (x < 60 || y < 60 || x > CFG.SAND_X - 60 || y > CFG.WORLD_H - 60) continue;
      if (pointInBuilding(city, x, y, 10)) continue;
      spots.push({ x, y });
      break;
    }
  }
  while (spots.length < n) spots.push({ x: cx + 40 * spots.length, y: cy });
  return spots;
}
