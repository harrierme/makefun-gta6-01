// The story: five jobs from fixer Mara Quinn, in order. Every mission
// has a reward in cash — a mission without one would pay nothing and
// break the money counter — and each step names exactly what the player
// must do, so the HUD can always show the current objective.
//
// The step types are small and shared: go to a place, pick someone up,
// defeat a set number of enemies, collect every cash bag, hold a spot
// for some seconds, or reach an escape point. The world module checks
// the steps; this file only describes them.

export const MISSIONS = [
  {
    id: 'delivery',
    title: 'First Delivery',
    giver: 'Mara Quinn',
    reward: 300,
    intro: 'Mara needs a package run to the Marina Office. No questions, no stops.',
    steps: [
      { type: 'goto', x: 2450, y: 2000, label: 'Deliver the package to the Marina Office' },
    ],
  },
  {
    id: 'getaway',
    title: 'Getaway Driver',
    giver: 'Mara Quinn',
    reward: 600,
    intro: 'Pick up Dice at Northgate, then lose the CBPD and get him to the safehouse.',
    steps: [
      { type: 'pickup', x: 1450, y: 250, label: 'Pick up Dice at Northgate' },
      { type: 'escape', x: 250, y: 1850, label: 'Lose the heat and reach the safehouse in Old Foundry', wanted: 2 },
    ],
  },
  {
    id: 'shootout',
    title: 'Beach Shootout',
    giver: 'Mara Quinn',
    reward: 900,
    intro: 'The Strand crew jumped Mara\'s runner. Clear the beach — all four of them.',
    steps: [
      { type: 'goto', x: 3000, y: 1200, label: 'Get to the beach on The Strand' },
      { type: 'kill', x: 3020, y: 1200, count: 4, label: 'Take down the Strand crew (0/4)' },
    ],
  },
  {
    id: 'cashdrops',
    title: 'Cash Drops',
    giver: 'Mara Quinn',
    reward: 1200,
    intro: 'Three stashes are hidden around the city. Grab them all before the CBPD finds them.',
    steps: [
      {
        type: 'collect', label: 'Collect the cash stashes (0/3)',
        spots: [
          { x: 650, y: 1850 },
          { x: 2250, y: 1450 },
          { x: 1050, y: 250 },
        ],
      },
    ],
  },
  {
    id: 'heist',
    title: 'The Bank Job',
    giver: 'Mara Quinn',
    reward: 2500,
    intro: 'Cinder Bay Bank, 18 seconds on the vault door, then out. The whole CBPD will come.',
    steps: [
      { type: 'goto', x: 1650, y: 450, label: 'Get to Cinder Bay Bank' },
      { type: 'hold', x: 1650, y: 450, seconds: 18, label: 'Hold the vault door — stay in the circle', wanted: 4 },
      { type: 'escape', x: 650, y: 2150, label: 'Escape to the Harborview garage', wanted: 3 },
    ],
  },
];

export function createMissionProgress() {
  return {
    index: 0, // which mission is current; MISSIONS.length means the story is done
    step: 0,
    active: false,
    kills: 0,
    collected: 0,
    hold: 0,
    doneCount: 0,
  };
}

export function currentMission(progress) {
  return MISSIONS[progress.index] ?? null;
}

export function storyFinished(progress) {
  return progress.index >= MISSIONS.length;
}

export function currentStep(progress) {
  const mission = currentMission(progress);
  return mission ? mission.steps[progress.step] : null;
}

// The place the minimap blip and the HUD arrow point at, or null when
// the step has no fixed spot.
export function missionTarget(progress) {
  const step = currentStep(progress);
  if (!step) return null;
  if (step.type === 'collect') {
    const spot = step.spots[progress.collected];
    return spot ? { x: spot.x, y: spot.y } : null;
  }
  return { x: step.x, y: step.y };
}

// The objective line the HUD shows, with live counts filled in.
export function missionObjective(progress) {
  const step = currentStep(progress);
  if (!step) return storyFinished(progress) ? 'Story complete — Cinder Bay is yours.' : '';
  if (step.type === 'kill') return `Take down the Strand crew (${progress.kills}/${step.count})`;
  if (step.type === 'collect') return `Collect the cash stashes (${progress.collected}/${step.spots.length})`;
  if (step.type === 'hold') {
    const left = Math.max(0, Math.ceil(step.seconds - progress.hold));
    return `Hold the vault door — ${left}s left`;
  }
  return step.label;
}

// Start the current mission: reset its counters and mark it active.
export function startMission(progress) {
  const mission = currentMission(progress);
  if (!mission) return null;
  progress.active = true;
  progress.step = 0;
  progress.kills = 0;
  progress.collected = 0;
  progress.hold = 0;
  return mission;
}

// Move to the next step; returns 'complete' when the mission is over.
export function advanceStep(progress) {
  const mission = currentMission(progress);
  if (!mission) return null;
  progress.step += 1;
  progress.kills = 0;
  progress.hold = 0;
  if (progress.step >= mission.steps.length) {
    progress.active = false;
    progress.doneCount += 1;
    progress.index += 1;
    progress.step = 0;
    return 'complete';
  }
  return 'step';
}

// Where the gang members stand when the shootout step begins. They are
// staged on the sand, never inside a building.
export function shootoutEnemySpots() {
  return [
    { x: 3000, y: 1050 },
    { x: 3040, y: 1200 },
    { x: 2990, y: 1350 },
    { x: 3050, y: 1500 },
  ];
}
