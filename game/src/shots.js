// The screenshot scenes behind ?shot=chase|mission|beach|downtown. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a tiny scripted driver, so the frame is what a short
// game really looks like — and the same seed always gives the same frame.
// The runner paints the staged world twice and sets window.__shotReady.

import { STEP } from './config.js';
import { SCREEN_PLAY } from './render.js';
import { startMission } from './missions.js';

function blankInput() {
  return {
    moveX: 0, moveY: 0, run: false, handbrake: false,
    interact: false, reload: false, shooting: false,
    aimWorldX: 0, aimWorldY: 0,
  };
}

function putPlayerInCar(world, x, y, angle) {
  const state = world.state;
  const car = state.cars.find((candidate) => candidate.driver === 'traffic') ?? state.cars[0];
  car.driver = 'player';
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;
  state.player.car = car;
  state.player.onFoot = false;
  state.player.x = x;
  state.player.y = y;
  return car;
}

function driveForward(world, seconds, steer) {
  const input = blankInput();
  input.moveY = -1;
  input.moveX = steer ?? 0;
  for (let i = 0; i < seconds / STEP; i += 1) world.step(STEP, input, null);
}

function stageChase(world) {
  const state = world.state;
  state.hour = 17.3; // golden hour: warm light, sirens lit, long shadows
  state.money = 2450;
  const car = putPlayerInCar(world, 1400, 1650, -Math.PI / 2);
  car.color = '#c94f3d';
  // Three CBPD cruisers right behind, lights on.
  for (let i = 0; i < 3; i += 1) {
    const cruiser = world.spawnPoliceCar();
    cruiser.x = 1400 + (i - 1) * 90;
    cruiser.y = 1850 + i * 70;
    cruiser.angle = -Math.PI / 2;
    cruiser.vx = 0;
    cruiser.vy = -200;
    cruiser.speed = 200;
  }
  state.wanted = 3;
  state.sinceCrime = 0;
  driveForward(world, 3.5, 0);
  return { screen: SCREEN_PLAY, toast: 'Lose the heat — 3 stars', toastTimer: 4 };
}

function stageMission(world) {
  const state = world.state;
  state.hour = 12.5; // hard noon on the beach
  state.money = 1820;
  state.player.x = 2900;
  state.player.y = 1250;
  state.player.angle = Math.PI / 2;
  state.camera.x = 2900;
  state.camera.y = 1250;
  state.mission.index = 2;
  startMission(state);
  // A short firefight: aim at the nearest Harbor Rat and shoot. Kept
  // brief so the gang is still standing and the CBPD has not arrived yet.
  const input = blankInput();
  for (let i = 0; i < 2.5 / STEP; i += 1) {
    const enemy = state.enemies[0];
    if (enemy) {
      input.aimWorldX = enemy.x;
      input.aimWorldY = enemy.y;
      input.shooting = true;
    }
    world.step(STEP, input, null);
    input.shooting = false;
  }
  return { screen: SCREEN_PLAY, toast: 'Trouble on the Strand', toastTimer: 4 };
}

function stageBeach(world) {
  const state = world.state;
  state.hour = 17.6; // golden hour over the ocean
  state.money = 3100;
  state.player.x = 3000;
  state.player.y = 900;
  state.player.angle = Math.PI / 2;
  state.camera.x = 3000;
  state.camera.y = 900;
  const car = putPlayerInCar(world, 2920, 820, Math.PI / 2);
  car.color = '#e8b23a';
  // Step out and admire the view on foot.
  state.player.car = null;
  state.player.onFoot = true;
  car.driver = null;
  world.step(STEP, blankInput(), null);
  return { screen: SCREEN_PLAY, toast: '', toastTimer: 0 };
}

function stageDowntown(world) {
  const state = world.state;
  state.hour = 21.5; // night in Civic Center, street lights on
  state.money = 5400;
  const car = putPlayerInCar(world, 1400, 800, Math.PI / 2);
  car.color = '#3d7ac9';
  const cruiser = world.spawnPoliceCar();
  cruiser.x = 1400;
  cruiser.y = 600;
  cruiser.angle = Math.PI / 2;
  state.wanted = 1;
  state.sinceCrime = 0;
  driveForward(world, 1.5, 0);
  return { screen: SCREEN_PLAY, toast: '', toastTimer: 0 };
}

/**
 * Set `world` to the named scene (chase, mission, beach or downtown; any
 * other name is chase) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'mission') return stageMission(world);
  if (name === 'beach') return stageBeach(world);
  if (name === 'downtown') return stageDowntown(world);
  return stageChase(world);
}
