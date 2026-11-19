// Deterministic screenshot staging: ?shot=chase|mission|beach|downtown
// (with &seed=N) puts the live game into a fixed, good-looking scene and
// the main loop paints it, so the screenshots are real renders of the
// game at its best — a chase, a job in progress, the beach shootout and
// downtown at night — never a composite or an edit.

import { createCar, createEnemy } from './entities.js';
import { shootoutEnemySpots } from './missions.js';
import { setWanted } from './world.js';

// Put the player in a fresh car at a road position, facing east.
function givePlayerCar(world, x, y, speed) {
  const car = createCar(world.nextId(), x, y, 0, '#c94f43', { speed });
  world.cars.push(car);
  world.player.inCar = car;
  world.player.x = x;
  world.player.y = y;
  car.parked = false;
  return car;
}

// Stage one cruiser on the road behind the player.
function addCruiser(world, x, y, angle) {
  const cruiser = createCar(world.nextId(), x, y, angle, '#2e4a7a', { police: true, speed: 380 });
  world.cars.push(cruiser);
  return cruiser;
}

export function stageShot(world, name) {
  const player = world.player;
  if (name === 'chase') {
    // A three-star chase through Civic Center at golden hour: the player
    // drifting east with two cruisers on their tail and skid marks behind.
    world.hour = 17.6;
    givePlayerCar(world, 1250, 1450, 420);
    setWanted(world, 3);
    addCruiser(world, 1050, 1450, 0);
    addCruiser(world, 980, 1434, 0);
    addCruiser(world, 1120, 1466, 0);
    for (let i = 0; i < 14; i += 1) {
      world.skidMarks.push({ x: 1250 - i * 26, y: 1450 + (i % 2 ? 14 : -14), angle: 0, life: 5 });
    }
    world.camera.x = 1250;
    world.camera.y = 1450;
  } else if (name === 'mission') {
    // The first job: Reno on foot at Mara's office, the delivery live,
    // the objective on the HUD and the blip on the minimap.
    world.hour = 10.2;
    player.x = 650;
    player.y = 1380;
    player.angle = Math.PI / 2;
    world.mission.index = 0;
    world.mission.active = true;
    world.mission.step = 0;
    world.camera.x = 650;
    world.camera.y = 1450;
  } else if (name === 'beach') {
    // The Strand shootout at sunset: Reno on the sand, the crew in front
    // of him, the sea behind them.
    world.hour = 18.3;
    player.x = 2980;
    player.y = 1280;
    player.angle = 0.2;
    world.mission.index = 2;
    world.mission.active = true;
    world.mission.step = 1;
    world.missionEnemiesSpawned = true;
    for (const spot of shootoutEnemySpots()) {
      world.enemies.push(createEnemy(world.nextId(), spot.x, spot.y));
    }
    world.camera.x = 3010;
    world.camera.y = 1250;
  } else if (name === 'downtown') {
    // Downtown at night: Reno driving past Cinder Bay Bank with traffic
    // and the city lights coming on.
    world.hour = 21.4;
    givePlayerCar(world, 1250, 650, 300);
    setWanted(world, 1);
    addCruiser(world, 1000, 650, 0);
    world.camera.x = 1350;
    world.camera.y = 650;
  } else {
    return false;
  }
  return true;
}
