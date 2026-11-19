// Cinder Bay — every tuning number and colour in one place.
// The world is a fixed 3200 x 2400 city; the renderer scales the camera
// view to the window, so no rule below depends on the screen size.

export const WORLD = { width: 3200, height: 2400 };

// Roads: a grid of avenues (vertical) and streets (horizontal). The beach
// and ocean sit east of the last avenue; the marina hugs the south-east.
export const ROADS = {
  avenues: [200, 600, 1000, 1400, 1800, 2200, 2600],
  streets: [200, 600, 1000, 1400, 1800, 2200],
  width: 76,
  lane: 20,
};

export const BEACH = { x: 2830, oceanX: 3020 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** One in-game hour lasts this many real seconds. */
export const HOUR_SECONDS = 90;

export const PLAYER = {
  radius: 13,
  walkSpeed: 165,
  runSpeed: 265,
  health: 100,
  // Health trickles back only after this many seconds without taking a hit.
  regenDelay: 6,
  regenRate: 4,
};

export const GUN = {
  magSize: 12,
  reloadSeconds: 1.1,
  bulletSpeed: 950,
  bulletRange: 620,
  damage: 1,
  // Seconds between shots while the trigger is held.
  fireInterval: 0.16,
  spread: 0.045,
};

export const CAR = {
  length: 46,
  width: 22,
  accel: 420,
  reverseAccel: 260,
  maxSpeed: 520,
  maxReverse: 160,
  // Steering at full speed is gentler than at a crawl.
  steerRate: 2.6,
  grip: 6.5,
  handbrakeGrip: 1.4,
  drag: 0.55,
  offRoadDrag: 1.9,
  health: 100,
  // A crash harder than this hurts the driver too.
  hardCrashSpeed: 300,
};

export const TRAFFIC = {
  count: 16,
  speed: 150,
  speedJitter: 55,
  spawnMargin: 120,
};

export const PEDS = { count: 26, walkSpeed: 55, fleeSpeed: 150 };

export const WANTED = {
  max: 5,
  // Seconds with no cop in sight and no fresh crime before one star fades.
  coolOffSeconds: 9,
  stealCarStars: 1,
  shootStars: 1,
  killCopStars: 2,
  // How many police cars are out hunting at each star level.
  carsForStars: [0, 1, 2, 3, 4, 4],
  footCopsForStars: [0, 1, 1, 2, 2, 3],
};

export const COP = {
  footSpeed: 185,
  // Seconds a foot cop must stay touching the player to make the bust.
  bustSeconds: 1.2,
  // Well below the player's top speed, so a straight getaway pulls away.
  carSpeed: 440,
};

export const ENEMY = { health: 3, speed: 120, shootRange: 420, shootInterval: 2.2, spread: 0.24, bulletDamage: 4 };

export const MISSIONS = [
  { id: 'favor', name: 'A Favor for Mara', reward: 400 },
  { id: 'getaway', name: 'The Getaway', reward: 900 },
  { id: 'strand', name: 'Trouble on the Strand', reward: 1200 },
  { id: 'drops', name: 'Three Drops', reward: 1500 },
  { id: 'cinder-job', name: 'The Cinder Job', reward: 5000 },
];

export const PALETTE = {
  grass: '#4d7a3f',
  grassDark: '#436e38',
  road: '#3a3d46',
  roadEdge: '#2c2e36',
  roadLine: '#d8c95a',
  sidewalk: '#8d8578',
  sand: '#d9c184',
  ocean: '#1d5f8a',
  oceanDeep: '#15507a',
  park: '#3f6b34',
  buildingRoof: '#6b5a4e',
  buildingRoofAlt: '#7a6a58',
  buildingRoofDark: '#54463c',
  nightOverlay: 'rgba(8, 12, 40, 0.55)',
  duskOverlay: 'rgba(255, 120, 40, 0.10)',
  player: '#e8b23a',
  playerShirt: '#c94f3d',
  copCar: '#2f6fb2',
  copCarWhite: '#e8e8e8',
  hudPanel: 'rgba(10, 12, 18, 0.72)',
  hudText: '#f2f0e8',
  hudMuted: '#b9b4a4',
  hudGold: '#f2c94c',
  hudRed: '#e5534b',
  hudGreen: '#7dc383',
  mission: '#f2c94c',
  policeBlip: '#5aa2ff',
  enemyBlip: '#ff5a4e',
  text: '#f2f0e8',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the autosave lives between visits (this browser only). */
export const SAVE_KEY = 'cinder-bay.save.v1';
