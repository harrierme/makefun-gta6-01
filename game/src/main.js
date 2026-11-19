// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 steps, the renderer draws every frame. Screenshot mode
// (?shot=...) stages a scene, settles it, then raises window.__shotReady.
import { CFG } from './config.js';
import { createWorld, updateWorld, serializeWorld, applySave, wantedStars } from './world.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_WASTED } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'solmarbay.save.v1';
const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const AUTOSAVE_EVERY = 5;

window.__errors = [];
window.addEventListener('error', (e) => {
  window.__errors.push(String(e.message || e.error || 'error'));
});
const origConsoleError = console.error.bind(console);
console.error = (...args) => {
  window.__errors.push(args.map((a) => String(a)).join(' '));
  origConsoleError(...args);
};

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function writeSave(world) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(serializeWorld(world)));
  } catch (err) {
    // Storage full or blocked: the game keeps running without a save.
  }
}

function main() {
  const params = new URLSearchParams(window.location.search);
  const seed = Number.parseInt(params.get('seed') || '7', 10) || 7;
  const shot = params.get('shot');

  const canvas = document.getElementById('game');
  const status = document.getElementById('status');
  const renderer = createRenderer(canvas);
  const input = createInput(canvas);
  const audio = createAudio();
  const world = createWorld(seed);
  window.__world = world;

  let last = performance.now();
  let acc = 0;
  let autosaveT = 0;
  let shotSettled = false;

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function drainEvents() {
    for (const ev of world.events) {
      if (ev === 'gunshot') audio.gunshot();
      else if (ev === 'enemyShot') audio.enemyShot();
      else if (ev === 'crash') audio.crash();
      else if (ev === 'pickup') audio.pickup();
      else if (ev === 'missionComplete') audio.missionComplete();
      else if (ev === 'horn') audio.horn();
    }
    world.events.length = 0;
  }

  function frame(now) {
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;

    // Screen flow keys.
    if (world.screen === SCREEN_TITLE) {
      if (input.pressed('Enter')) {
        world.screen = SCREEN_PLAY;
        audio.resume();
        setStatus('Playing Solmar Bay.');
      } else if (input.pressed('KeyC')) {
        const save = readSave();
        if (save) {
          applySave(world, save);
          world.screen = SCREEN_PLAY;
          audio.resume();
          setStatus('Continued your saved game.');
        }
      }
    } else if (world.screen === SCREEN_PAUSED) {
      if (input.pressed('KeyP') || input.pressed('Escape')) world.screen = SCREEN_PLAY;
    } else if (world.screen === SCREEN_BUSTED || world.screen === SCREEN_WASTED) {
      if (input.pressed('Enter')) {
        const save = readSave();
        const fresh = createWorld(world.seed);
        if (save) applySave(fresh, save);
        Object.keys(world).forEach((k) => delete world[k]);
        Object.assign(world, fresh);
        world.screen = SCREEN_PLAY;
      }
    } else if (world.screen === SCREEN_PLAY) {
      if (input.pressed('KeyP') || input.pressed('Escape')) {
        world.screen = SCREEN_PAUSED;
        writeSave(world);
      }
      if (input.pressed('KeyM')) {
        audio.setMuted(!audio.isMuted());
      }
    }
    if (input.mousePressed() || input.pressed('Enter')) audio.resume();

    // Aim from the mouse, in world coordinates.
    const aim = input.aimWorld(world.camera, renderer.view);
    const gameInput = {
      held: (code) => input.held(code),
      pressed: (code) => input.pressed(code),
      aimX: aim.x,
      aimY: aim.y,
      mouseDown: input.mouseDown,
    };

    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 20) {
      updateWorld(world, gameInput, STEP);
      acc -= STEP;
      steps += 1;
    }
    if (steps >= 20) acc = 0;
    drainEvents();

    // Audio follows the driving speed + wanted level.
    const car = world.player.inCar;
    audio.update({
      speed: car ? Math.abs(car.speed) : 0,
      wantedStars: wantedStars(world),
      playing: world.screen === SCREEN_PLAY,
    });

    // Autosave while playing.
    if (world.screen === SCREEN_PLAY) {
      autosaveT += dt;
      if (autosaveT >= AUTOSAVE_EVERY) {
        autosaveT = 0;
        writeSave(world);
      }
    }

    renderer.render(world);
    input.endFrame();
    requestAnimationFrame(frame);
  }

  if (shot) {
    stageShot(world, shot);
    // Settle the staged scene with fixed steps, then signal readiness.
    const fakeInput = {
      held: () => false,
      pressed: () => false,
      aimX: world.player.x + 100,
      aimY: world.player.y,
      mouseDown: false,
    };
    for (let i = 0; i < 45; i++) updateWorld(world, fakeInput, STEP);
    world.events.length = 0;
    window.__shotReady = true;
    shotSettled = true;
  }

  setStatus('Solmar Bay loaded. Press Enter to start.');
  requestAnimationFrame(frame);
}

main();
