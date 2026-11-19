// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens:
// title, play, paused, busted and wasted. Progress autosaves to
// localStorage, and a saved game can be continued from the title screen.
//
// ?seed=N fixes the random stream. ?shot=chase|mission|beach|downtown (with
// &seed=N) stages that scene instead of running the loop, steps it a fixed
// number of times so the cars settle, paints it and sets window.__shotReady
// for a screenshot.

import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  applySave, createWorld, serializeWorld, updateWorld, wantedStars,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_CONTINUE, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import {
  SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED, createRenderer,
} from './render.js';
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

const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

let world = createWorld(createRandom(seed));
// Test handle: the headless playtest drives the live game through this
// (start it, move the player, read money and mission state). It changes
// nothing about how the game plays.
window.__world = world;
let screen = SCREEN_TITLE;
let hasSave = false;
let autosaveTimer = AUTOSAVE_SECONDS;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(serializeWorld(world)));
  } catch (error) {
    // Storage can be full or blocked; the game plays on without it.
  }
}

hasSave = readSave() !== null;

function setStatus(text) {
  status.textContent = text;
}

// Drain the world's event queue into sounds and save points.
function drainEvents() {
  for (const event of world.events) {
    if (event.type === 'shot') audio.gunshot();
    else if (event.type === 'enemy-shot') audio.enemyShot();
    else if (event.type === 'crash') audio.crash();
    else if (event.type === 'pickup') audio.pickup();
    else if (event.type === 'mission-complete') {
      audio.missionComplete();
      writeSave();
    } else if (event.type === 'horn') audio.horn();
  }
  world.events.length = 0;
}

function startNewGame() {
  world = createWorld(createRandom(seed));
  window.__world = world;
  screen = SCREEN_PLAY;
  autosaveTimer = AUTOSAVE_SECONDS;
  audio.resume();
  setStatus('Playing Cinder Bay');
}

function continueSave() {
  const save = readSave();
  if (!save) return;
  world = createWorld(createRandom(seed));
  window.__world = world;
  applySave(world, save);
  screen = SCREEN_PLAY;
  autosaveTimer = AUTOSAVE_SECONDS;
  audio.resume();
  setStatus('Playing Cinder Bay, continued from your save');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(MAX_FRAME, (now - lastNow) / 1000 || 0);
  lastNow = now;

  if (input.pressed(ACTION_MUTE)) {
    audio.setMuted(!audio.isMuted());
  }

  if (screen === SCREEN_TITLE) {
    if (input.pressed(ACTION_CONFIRM)) startNewGame();
    else if (input.pressed(ACTION_CONTINUE) && hasSave) continueSave();
    renderer.render(world, SCREEN_TITLE, { hasSave });
  } else if (screen === SCREEN_PLAY) {
    if (input.pressed(ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      setStatus('Paused');
    } else {
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(STEP, remaining);
        updateWorld(world, input, step);
        remaining -= step;
        if (world.over) break;
      }
      drainEvents();
      if (world.over === 'busted') {
        screen = SCREEN_BUSTED;
        writeSave();
        setStatus('Busted by the CBPD');
      } else if (world.over === 'wasted') {
        screen = SCREEN_WASTED;
        writeSave();
        setStatus('Wasted');
      }
      autosaveTimer -= dt;
      if (autosaveTimer <= 0) {
        autosaveTimer = AUTOSAVE_SECONDS;
        writeSave();
      }
      const focus = world.player.inCar ?? world.player;
      audio.update({
        speed: world.player.inCar ? world.player.inCar.speed : 0,
        wantedStars: wantedStars(world),
        playing: screen === SCREEN_PLAY,
      });
      void focus;
      renderer.render(world, SCREEN_PLAY);
    }
    if (screen === SCREEN_PAUSED) renderer.render(world, SCREEN_PAUSED);
  } else if (screen === SCREEN_PAUSED) {
    if (input.pressed(ACTION_PAUSE)) {
      screen = SCREEN_PLAY;
      setStatus('Playing Cinder Bay');
    }
    renderer.render(world, SCREEN_PAUSED);
  } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
    if (input.pressed(ACTION_CONFIRM)) {
      world = createWorld(createRandom(seed));
      window.__world = world;
      screen = SCREEN_TITLE;
      hasSave = readSave() !== null;
      setStatus('Cinder Bay title screen');
    }
    renderer.render(world, screen);
  }

  input.endFrame();
}

let lastNow = 0;

// Screenshot staging: no loop, no input — stage the scene, settle it with
// a fixed number of steps, paint it, and signal readiness.
if (shot) {
  const nullInput = {
    // Hold the throttle only while the player is in a car, so a staged
    // chase is still moving when the screenshot is taken; on foot the
    // player stays exactly where the shot put them.
    down: (action) => action === 'up' && !!world.player.inCar,
    pressed: () => false,
    aimWorld: () => ({ x: world.player.x, y: world.player.y }),
    endFrame: () => {},
  };
  if (stageShot(world, shot)) {
    for (let i = 0; i < 45; i += 1) updateWorld(world, nullInput, STEP);
    world.events.length = 0;
    window.__shotReady = true;
    // Repaint every frame: a resize (for example from the screenshot
    // tool's metrics override) clears the canvas, and the staged scene
    // must survive it. The world is settled, so each frame is identical.
    const paint = () => {
      renderer.render(world, SCREEN_PLAY);
      requestAnimationFrame(paint);
    };
    paint();
  } else {
    window.__errors.push(`unknown shot: ${shot}`);
  }
} else {
  setStatus('Cinder Bay title screen');
  requestAnimationFrame((now) => {
    lastNow = now;
    requestAnimationFrame(frame);
  });
}
