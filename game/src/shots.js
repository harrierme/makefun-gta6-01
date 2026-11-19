// Deterministic screenshot staging: ?shot=chase|mission|beach|downtown
// Each scene sets the player, camera, clock, wanted level and traffic so
// the four screenshots show the game at its best.
import { CFG } from './config.js';
import { createCar, createEnemy } from './entities.js';
import { FIXER, MISSIONS } from './missions.js';
import { setWanted, say } from './world.js';
import { nearestRoadPoint } from './city.js';

function putPlayerInCar(world, x, y, angle, color) {
  const car = createCar('sport', x, y, angle, color);
  car.driver = 'player';
  car.occupied = true;
  world.cars.push(car);
  world.player.inCar = car;
  world.player.x = x;
  world.player.y = y;
  world.player.angle = angle;
  return car;
}

function snapCamera(world) {
  const p = world.player;
  world.camera.x = Math.max(0, Math.min(CFG.WORLD_W - CFG.VIEW_W, p.x - CFG.VIEW_W / 2));
  world.camera.y = Math.max(0, Math.min(CFG.WORLD_H - CFG.VIEW_H, p.y - CFG.VIEW_H / 2));
}

export function stageShot(world, name) {
  const p = world.player;
  world.screen = 'play';
  if (name === 'chase') {
    // Golden-hour police chase in Downtown, 3 stars.
    world.time = 17.6;
    world.elapsed = ((17.6 - 8.5 + 24) % 24) * (CFG.DAY_LENGTH / 24);
    putPlayerInCar(world, 1850, 1200, 0, '#c0392b');
    world.player.inCar.speed = 380;
    setWanted(world, 3);
    for (let i = 0; i < 2; i++) {
      const spot = nearestRoadPoint(world.city, 1850 + (i ? -260 : 260), 1200 + (i ? 130 : -90));
      const cruiser = createCar('police', spot.x, spot.y, Math.atan2(1200 - spot.y, 1850 - spot.x), CFG.POLICE_COLOR);
      cruiser.driver = 'cop';
      world.cars.push(cruiser);
    }
    say(world, 'The cruisers are on you — lose them!');
  } else if (name === 'mission') {
    // Morning at Vane's Garage, first job waiting.
    world.time = 9.2;
    world.elapsed = ((9.2 - 8.5 + 24) % 24) * (CFG.DAY_LENGTH / 24);
    p.x = FIXER.x + 40;
    p.y = FIXER.y + 60;
    p.angle = -Math.PI / 2;
    world.progress.started = true;
    world.progress.mi = 0;
    world.progress.si = 0;
    say(world, MISSIONS[0].intro);
  } else if (name === 'beach') {
    // Sunset shootout on the beach with the Tide Boys.
    world.time = 18.4;
    world.elapsed = ((18.4 - 8.5 + 24) % 24) * (CFG.DAY_LENGTH / 24);
    p.x = 2860;
    p.y = 1300;
    p.angle = Math.PI / 2;
    world.progress.started = true;
    world.progress.mi = 2;
    world.progress.si = 0;
    world.progress.kills = 1;
    for (const [ex, ey] of [[2920, 1180], [2900, 1420], [2800, 1360]]) {
      world.enemies.push(createEnemy(ex, ey));
    }
    setWanted(world, 2);
    say(world, 'Hostiles on the pier — take them down! (1/4)');
  } else if (name === 'downtown') {
    // Night drive through Downtown with traffic.
    world.time = 22.1;
    world.elapsed = ((22.1 - 8.5 + 24) % 24) * (CFG.DAY_LENGTH / 24);
    putPlayerInCar(world, 1850, 750, Math.PI / 2, '#2e86c1');
    world.player.inCar.speed = 300;
    setWanted(world, 0);
    say(world, 'Downtown at night — Solmar Bay never sleeps.');
  }
  snapCamera(world);
}
