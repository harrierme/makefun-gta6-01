// The story: five jobs for Milo Kade, a driver back in Solmar City after three
// years away, working for fixer Lena Cruz. Each mission is a list of stages;
// the engine below starts them, watches for stage completion, pays out and
// unlocks the next one. Nothing here names a real game or its characters.
import { LANDMARKS, MISSION_REWARDS } from './config.js';

export const MISSIONS = [
  {
    id: 'first-shift',
    title: 'First Shift',
    giver: 'Lena Cruz',
    brief: 'Lena needs a package run to the Marina. Get to her garage, then drive it over. No cops, no fuss.',
    reward: MISSION_REWARDS[0],
    stages: [
      { type: 'goto', x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, radius: 70, text: 'Get to Lena\'s Garage' },
      { type: 'driveTo', x: LANDMARKS.marina.x, y: LANDMARKS.marina.y, radius: 80, text: 'Deliver the package to the Marina Docks', time: 75 },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    giver: 'Lena Cruz',
    brief: 'A crew needs wheels and the SCPD is already sniffing. Grab any car, pick up the crew at the Pier, then lose the heat at the Safehouse.',
    reward: MISSION_REWARDS[1],
    stages: [
      { type: 'getCar', text: 'Steal a car — any car will do' },
      { type: 'driveTo', x: LANDMARKS.pier.x, y: LANDMARKS.pier.y, radius: 80, text: 'Pick up the crew at Sunset Pier', wanted: 2 },
      { type: 'escape', x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y, radius: 90, text: 'Lose the cops — reach the Safehouse' },
    ],
  },
  {
    id: 'beachfront-brawl',
    title: 'Beachfront Brawl',
    giver: 'Lena Cruz',
    brief: 'The Coral Kings are muscling in on Palmera Beach Club. Lena wants them gone. Bring the pistol and settle it.',
    reward: MISSION_REWARDS[2],
    stages: [
      { type: 'goto', x: LANDMARKS.beachClub.x, y: LANDMARKS.beachClub.y, radius: 80, text: 'Get to Palmera Beach Club' },
      { type: 'kill', count: 6, x: LANDMARKS.beachClub.x, y: LANDMARKS.beachClub.y, radius: 320, text: 'Clear out the Coral Kings (0/6)' },
    ],
  },
  {
    id: 'the-collector',
    title: 'The Collector',
    giver: 'Dario Fontaine',
    brief: 'Dario stashed six cash drops around the city before he skipped town. Find them all before his old friends do. Two minutes.',
    reward: MISSION_REWARDS[3],
    stages: [
      { type: 'collect', count: 6, time: 120, text: 'Collect the cash drops (0/6)' },
    ],
  },
  {
    id: 'solmar-heist',
    title: 'Solmar Heist',
    giver: 'Lena Cruz',
    brief: 'The big one. Solmar Trust Bank, broad daylight. Grab the vault cash, then outrun a four-star response to the Safehouse.',
    reward: MISSION_REWARDS[4],
    stages: [
      { type: 'goto', x: LANDMARKS.bank.x, y: LANDMARKS.bank.y, radius: 80, text: 'Get to Solmar Trust Bank' },
      { type: 'hold', seconds: 5, x: LANDMARKS.bank.x, y: LANDMARKS.bank.y, radius: 70, text: 'Crack the vault — stay at the bank' },
      { type: 'escape', x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y, radius: 90, text: 'Escape the four-star heat — reach the Safehouse', wanted: 4 },
    ],
  },
];

/** Where the next mission starts: the garage marker while jobs remain. */
export function nextMissionIndex(state) {
  return state.missionsDone;
}

export function startMarker(state) {
  if (state.missionsDone >= MISSIONS.length) return null;
  return { x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, label: 'L' };
}

export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) return false;
  state.mission = {
    index,
    def,
    stageIndex: 0,
    active: true,
    failed: false,
    timer: 0,
    kills: 0,
    collected: 0,
    holdTime: 0,
    spawned: false,
  };
  state.dialogue = { speaker: def.giver, text: def.brief, until: state.time + 6 };
  state.message = `MISSION: ${def.title}`;
  state.messageUntil = state.time + 3.5;
  enterStage(state);
  return true;
}

export function enterStage(state) {
  const m = state.mission;
  const stage = m.def.stages[m.stageIndex];
  if (!stage) return;
  m.timer = stage.time || 0;
  m.kills = 0;
  m.collected = 0;
  m.holdTime = 0;
  m.spawned = false;
  if (stage.wanted) state.wanted = Math.max(state.wanted, stage.wanted);
  if (stage.type === 'kill') {
    // Spawn the gang around the fight.
    for (let i = 0; i < stage.count; i += 1) {
      const a = (i / stage.count) * Math.PI * 2;
      state.enemies.push({
        x: stage.x + Math.cos(a) * (140 + (i % 3) * 60),
        y: stage.y + Math.sin(a) * (140 + (i % 3) * 60),
        angle: 0,
        hp: 60,
        shootTimer: 0.8 + i * 0.35,
        state: 'fight',
        dead: false,
        flash: 0,
      });
    }
    m.spawned = true;
  }
  if (stage.type === 'collect') {
    const spots = [
      { x: 800, y: 300 }, { x: 2000, y: 700 }, { x: 1200, y: 1900 },
      { x: 2800, y: 1100 }, { x: 400, y: 1500 }, { x: 2400, y: 2200 },
    ];
    for (const s of spots) {
      state.pickups.push({ x: s.x, y: s.y, kind: 'cash', amount: 150, mission: true, bob: 0 });
    }
    m.spawned = true;
  }
}

function advanceStage(state) {
  const m = state.mission;
  m.stageIndex += 1;
  if (m.stageIndex >= m.def.stages.length) {
    completeMission(state);
    return;
  }
  enterStage(state);
}

function completeMission(state) {
  const m = state.mission;
  const reward = m.def.reward;
  state.money += reward;
  state.missionsDone += 1;
  state.mission = null;
  state.message = `MISSION COMPLETE: ${m.def.title}  +$${reward}`;
  state.messageUntil = state.time + 4;
  state.dialogue = { speaker: 'Lena Cruz', text: 'Clean work, Milo. The money is yours — come see me when you want the next one.', until: state.time + 5 };
  state.audio.missionComplete();
  state.save();
}

export function failMission(state, reason) {
  const m = state.mission;
  if (!m) return;
  state.mission = null;
  state.enemies = state.enemies.filter((e) => e.dead);
  state.pickups = state.pickups.filter((p) => !p.mission);
  state.message = `MISSION FAILED: ${m.def.title} — ${reason}`;
  state.messageUntil = state.time + 4;
  state.audio.missionFail();
}

function stageText(state) {
  const m = state.mission;
  const stage = m.def.stages[m.stageIndex];
  if (stage.type === 'kill') return `Clear out the Coral Kings (${m.kills}/${stage.count})`;
  if (stage.type === 'collect') return `Collect the cash drops (${m.collected}/${stage.count})`;
  if (stage.type === 'hold') return `Crack the vault — stay at the bank (${Math.ceil(stage.seconds - m.holdTime)}s)`;
  return stage.text;
}

export function missionObjectiveText(state) {
  if (!state.mission) {
    if (state.missionsDone >= MISSIONS.length) return 'All jobs done — Solmar City is yours. Free roam!';
    return `Go to Lena's Garage (L) to start: ${MISSIONS[state.missionsDone].title}`;
  }
  return stageText(state);
}

export function missionMarker(state) {
  if (!state.mission) return startMarker(state);
  const m = state.mission;
  const stage = m.def.stages[m.stageIndex];
  if (!stage) return null;
  if (stage.type === 'getCar') return null;
  if (stage.type === 'collect') {
    const next = state.pickups.find((p) => p.mission);
    return next ? { x: next.x, y: next.y, label: '$' } : null;
  }
  return { x: stage.x, y: stage.y, label: '!' };
}

/** Advance the mission state machine one step; returns nothing. */
export function updateMission(state, dt) {
  const m = state.mission;
  if (!m) {
    // Standing on the start marker begins the next job.
    const marker = startMarker(state);
    if (marker) {
      const p = state.playerCar || state.player;
      if (Math.hypot(p.x - marker.x, p.y - marker.y) < 70) startMission(state, state.missionsDone);
    }
    return;
  }
  const stage = m.def.stages[m.stageIndex];
  if (!stage) return;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(state, 'Out of time');
      return;
    }
  }
  const p = state.playerCar || state.player;
  const dist = stage.x !== undefined ? Math.hypot(p.x - stage.x, p.y - stage.y) : Infinity;
  if (stage.type === 'goto' || stage.type === 'driveTo' || stage.type === 'escape') {
    if (stage.type === 'driveTo' && !state.playerCar) {
      // Waiting for the player to get in a car; nothing to do.
    } else if (dist < stage.radius) {
      if (stage.type === 'escape' && state.wanted > 0 && dist > 40) {
        // Must actually arrive while still hot.
      }
      advanceStage(state);
      return;
    }
  } else if (stage.type === 'getCar') {
    if (state.playerCar) advanceStage(state);
  } else if (stage.type === 'kill') {
    if (m.kills >= stage.count) advanceStage(state);
  } else if (stage.type === 'collect') {
    if (m.collected >= stage.count) advanceStage(state);
  } else if (stage.type === 'hold') {
    if (dist < stage.radius) {
      m.holdTime += dt;
      if (m.holdTime >= stage.seconds) {
        state.money += 1200;
        state.message = 'VAULT CASH SECURED +$1200 — RUN!';
        state.messageUntil = state.time + 3;
        advanceStage(state);
      }
    } else {
      m.holdTime = Math.max(0, m.holdTime - dt * 2);
    }
  }
}
