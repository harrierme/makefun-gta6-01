// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between title, play, paused,
// busted and wasted screens, with a how-to panel off the title.
// ?seed=N fixes the city. ?shot=chase|mission|beach|downtown (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, respawn, stepWorld } from './world.js';
import { ACTION, createInput } from './input.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const state = createWorld(createRandom(seed), audio);
const renderer = createRenderer(canvas);
const input = createInput(canvas);

// Any JavaScript error is surfaced in the document title, so a headless
// screenshot run can tell a broken build from a working one.
window.addEventListener('error', (event) => {
  document.title = `ERR: ${event.message}`;
});

function announce(message) {
  status.textContent = message;
}

function menuItems() {
  return state.hasSave ? 3 : 2;
}

function startNewGame() {
  state.money = 250;
  state.missionsDone = 0;
  state.mission = null;
  state.health = 100;
  state.wanted = 0;
  state.player.x = 1340;
  state.player.y = 1790;
  state.playerCar = null;
  state.enemies = [];
  state.screen = 'play';
  audio.unlock();
  audio.startMusic();
  announce('Playing Solmar City. Get to Lena\'s Garage to start the first job.');
}

function continueGame() {
  if (state.loadSave()) {
    state.screen = 'play';
    audio.unlock();
    audio.startMusic();
    announce('Continued your game.');
  }
}

function runShot(name) {
  stageShot(name, state);
  // Debug state for headless runs: the staged position, speed and screen.
  window.__shotState = {
    x: Math.round(state.player.x),
    y: Math.round(state.player.y),
    speed: state.playerCar ? Math.round(state.playerCar.speed) : 0,
    screen: state.screen,
    wanted: state.wanted,
    money: state.money,
    enemies: state.enemies.length,
  };
  let painted = 0;
  function paint() {
    state._mouseX = window.innerWidth / 2;
    state._mouseY = window.innerHeight / 2;
    renderer.draw(state);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  state.hasSave = false;
  try {
    state.hasSave = window.localStorage.getItem('solmar-city-save-v1') !== null;
  } catch {
    state.hasSave = false;
  }
  state.menuIndex = 0;

  function titleSelect() {
    const items = menuItems();
    if (state.menuIndex === 0) startNewGame();
    else if (state.menuIndex === 1 && state.hasSave) continueGame();
    else state.screen = 'howto';
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    // Crosshair follows the mouse; the renderer reads it from the state.
    state._mouseX = input.mouse.x;
    state._mouseY = input.mouse.y;
    // Debug state for headless play-tests.
    window.__screen = state.screen;
    window.__player = { x: Math.round(state.player.x), y: Math.round(state.player.y) };

    // Global keys.
    if (input.wasPressed(ACTION.MUTE)) {
      state.muted = !state.muted;
      audio.setMuted(state.muted);
    }
    if (input.wasPressed(ACTION.PAUSE)) {
      if (state.screen === 'play') {
        state.screen = 'paused';
        audio.engine(false);
        announce('Paused.');
      } else if (state.screen === 'paused') {
        state.screen = 'play';
        announce('Playing.');
      } else if (state.screen === 'howto') {
        state.screen = 'title';
      }
    }

    if (state.screen === 'title') {
      state.time += STEP;
      if (input.wasPressed(ACTION.UP)) state.menuIndex = (state.menuIndex + menuItems() - 1) % menuItems();
      if (input.wasPressed(ACTION.DOWN)) state.menuIndex = (state.menuIndex + 1) % menuItems();
      if (input.wasPressed(ACTION.SHOOT) || input.wasPressed(ACTION.CONFIRM)) titleSelect();
    } else if (state.screen === 'howto') {
      if (input.wasPressed(ACTION.SHOOT) || input.wasPressed(ACTION.CONFIRM)) state.screen = 'title';
    } else if (state.screen === 'paused') {
      if (input.wasPressed(ACTION.CONFIRM) || input.wasPressed(ACTION.SHOOT)) state.screen = 'play';
    } else if (state.screen === 'busted' || state.screen === 'wasted') {
      if (input.wasPressed(ACTION.SHOOT) || input.wasPressed(ACTION.CONFIRM)) respawn(state);
    } else if (state.screen === 'play') {
      while (accumulator >= STEP) {
        stepWorld(state, input, STEP);
        accumulator -= STEP;
        if (state.screen !== 'play') break;
      }
    } else {
      accumulator = 0;
    }

    // First gesture unlocks sound and starts the music.
    if (input.mouse.clicked || input.held.size > 0) {
      audio.unlock();
      audio.startMusic();
    }

    renderer.draw(state);
    input.endFrame();
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === 'play') {
      state.screen = 'paused';
      audio.engine(false);
      announce('Paused.');
    }
  });

  announce('Solmar City. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
