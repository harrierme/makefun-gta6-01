// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens:
// title, play, paused, busted and wasted. Progress autosaves to
// localStorage, and a saved game can be continued from the title screen.
//
// ?seed=N fixes the random stream. ?shot=chase|mission|beach|downtown (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.

import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION_DONE, EVENT_MISSION_FAIL,
  EVENT_MISSION_START, EVENT_PICKUP, EVENT_RELOAD, EVENT_SHOT,
  EVENT_STEAL, EVENT_WASTED, createWorld,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_CONTINUE, ACTION_INTERACT, ACTION_MUTE,
  ACTION_PAUSE, ACTION_RELOAD, createInput,
} from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 5;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

// Console errors are collected for the headless test run: a screenshot
// pipeline can read window.__errors and refuse a frame that errored.
window.__errors = [];
window.addEventListener('error', (event) => {
  window.__errors.push(String(event.message ?? event.type));
});
const consoleError = console.error.bind(console);
console.error = (...args) => {
  window.__errors.push(args.map(String).join(' '));
  consoleError(...args);
};

const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.save()));
  } catch {
    // Storage can be off (private windows): the game then lasts one visit.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const screen = { name: scene.screen, toast: scene.toast, toastTimer: scene.toastTimer };
  const ui = { saveExists: false, district: world.district() };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      document.title = window.__errors.length > 0 ? `SHOT-ERRORS:${window.__errors.length}` : 'SHOT-READY';
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = { name: SCREEN_TITLE, toast: '', toastTimer: 0 };
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();
  let autosaveTimer = 0;
  // One-shot presses handleActions takes are held here for the next step.
  let pendingInteract = false;
  let pendingReload = false;

  function announce(message) {
    status.textContent = message;
  }

  function startFresh() {
    world.reset();
    screen = { name: SCREEN_PLAY, toast: '', toastTimer: 0 };
    autosaveTimer = 0;
    announce('Playing. Find the yellow M to start a job for Mara Quinn.');
  }

  function continueSave() {
    if (!save) return;
    world.load(save);
    screen = { name: SCREEN_PLAY, toast: 'Welcome back to Cinder Bay', toastTimer: 3 };
    autosaveTimer = 0;
    announce('Continuing your saved game.');
  }

  function showToast(message, seconds) {
    screen.toast = message;
    screen.toastTimer = seconds;
  }

  function endRun(kind) {
    screen = { name: kind === 'busted' ? SCREEN_BUSTED : SCREEN_WASTED, toast: '', toastTimer: 0 };
    writeSave();
    announce(kind === 'busted' ? 'Busted. The CBPD caught you.' : 'Wasted. Reno went down.');
  }

  // The mouse aims in world coordinates: undo the renderer's centring and
  // scaling, then add the camera position.
  function aimWorld() {
    const rect = canvas.getBoundingClientRect();
    const mouse = input.mouse;
    const scale = Math.min(rect.width / 1280, rect.height / 720);
    const offsetX = (rect.width - 1280 * scale) / 2;
    const offsetY = (rect.height - 720 * scale) / 2;
    const logicalX = (mouse.x - rect.left - offsetX) / scale;
    const logicalY = (mouse.y - rect.top - offsetY) / scale;
    const state = world.state;
    const camX = Math.max(580, Math.min(3200 - 580, state.camera.x));
    const camY = Math.max(300, Math.min(2400 - 300, state.camera.y));
    return { x: camX - 640 + logicalX, y: camY - 360 + logicalY };
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.gunshot();
    if (events & EVENT_CRASH) audio.crash(0.5);
    if (events & EVENT_RELOAD) audio.reload();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_STEAL) audio.click();
    if (events & EVENT_MISSION_START) {
      audio.click();
      if (world.state.mission.intro) showToast(world.state.mission.intro, 4);
    }
    if (events & EVENT_MISSION_DONE) {
      audio.missionDone();
      showToast('Job done — Mara pays up', 4);
      writeSave();
    }
    if (events & EVENT_MISSION_FAIL) {
      showToast('Job failed — the drop went cold', 4);
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      endRun('busted');
    }
    if (events & EVENT_WASTED) {
      audio.wasted();
      endRun('wasted');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_INTERACT) pendingInteract = true;
    if (actions & ACTION_RELOAD) pendingReload = true;
    if (screen.name === SCREEN_TITLE) {
      if (actions & ACTION_CONTINUE && save) continueSave();
      else if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startFresh();
      }
      return;
    }
    if (screen.name === SCREEN_BUSTED || screen.name === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startFresh();
      }
      return;
    }
    if (actions & ACTION_PAUSE && screen.name === SCREEN_PLAY) {
      screen.name = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen.name === SCREEN_PAUSED) {
      screen.name = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    const move = input.move();
    const aim = aimWorld();
    const worldInput = {
      moveX: move.x,
      moveY: move.y,
      run: input.run,
      handbrake: input.handbrake,
      interact: pendingInteract,
      reload: pendingReload,
      shooting: input.shooting,
      aimWorldX: aim.x,
      aimWorldY: aim.y,
    };
    pendingInteract = false;
    pendingReload = false;
    const events = world.step(STEP, worldInput, null);
    handleEvents(events);
    // Engine hum and sirens follow the world.
    const player = world.state.player;
    const speed01 = player.car ? Math.abs(player.car.speed) / 520 : 0;
    audio.setEngine(speed01, !player.onFoot);
    const policeOut = world.state.cars.some((car) => car.driver === 'police' && car.health > 0);
    audio.setSiren(world.state.wanted > 0 && policeOut);
    if (screen.toastTimer > 0) screen.toastTimer -= STEP;
    autosaveTimer += STEP;
    if (autosaveTimer >= AUTOSAVE_SECONDS) {
      autosaveTimer = 0;
      writeSave();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen.name === SCREEN_PLAY) {
      while (accumulator >= STEP && screen.name === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, { saveExists: save !== null, district: world.district() });
  }

  // Leaving the tab pauses a running game rather than letting the CBPD
  // close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen.name === SCREEN_PLAY) {
      screen.name = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Cinder Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
