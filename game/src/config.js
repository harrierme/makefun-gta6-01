// Cinder Bay — every tuning number, colour and constant in one place.
// The world is a fixed 3200 x 2400 city; the renderer scales the camera
// view to the window, so no rule below depends on the screen size.

export const WORLD = { width: 3200, height: 2400 };

// One fixed simulation step per second; the loop runs several in a slow
// frame and none in a fast one, so gameplay speed never depends on fps.
export const STEP = 1 / 60;

export const SAVE_KEY = 'cinder-bay-save-v1';

// The road grid: vertical avenues and horizontal streets, 400 apart, each
// 110 wide. Blocks between them hold buildings, the park and the marina.
export const ROAD_HALF = 55;
export const AVENUES = [250, 650, 1050, 1450, 1850, 2250, 2650];
export const STREETS = [250, 650, 1050, 1450, 1850, 2150];

// The beach is the eastern strip; the sea starts where the sand ends.
// Cars and people may walk the sand but nothing crosses into the water.
export const BEACH_X = 2920;
export const WATER_X = 3130;

// Player on foot.
export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  runSpeed: 265,
  maxHealth: 100,
  magSize: 12,
  reloadSeconds: 1.1,
  shootCooldown: 0.22,
  bulletSpeed: 780,
  bulletDamage: 34,
};

// Arcade car handling. Top speed is deliberately above a police cruiser's,
// so a clean getaway is possible; cruisers make up for it in numbers.
export const CAR = {
  length: 64,
  width: 32,
  accel: 420,
  reverseAccel: 260,
  brake: 620,
  maxSpeed: 560,
  maxReverse: 170,
  turnRate: 2.6,
  grip: 3.4,
  driftGrip: 1.1,
  handbrakeGrip: 0.55,
  maxHealth: 100,
  // A repeat hit on the same pair of cars only counts once per window.
  crashCooldown: 0.6,
};

// The wanted system: heat 0..100, one star per 20 heat, five stars max.
// Heat only falls while no officer can see the player.
export const WANTED = {
  maxHeat: 100,
  heatPerStar: 20,
  maxStars: 5,
  decayPerSecond: 2.2,
  stealHeat: 34,
  shootHeat: 26,
  killHeat: 30,
  seenRadius: 420,
  // Foot officers are staged outside the seen radius, so heat can fall.
  footSpawnMin: 560,
  footSpawnMax: 900,
  cruiserSpawnMin: 700,
  cruiserSpawnMax: 1100,
  maxCruisers: 6,
  maxFootCops: 8,
};

// Police cruisers are slower than the player's car and ram on a cooldown,
// so a chase is escapable instead of a pin.
export const COP = {
  maxSpeed: 500,
  accel: 380,
  ramCooldown: 1.4,
  ramDamage: 9,
  bustRadius: 34,
  bustSeconds: 1.6,
  footSpeed: 200,
};

// Traffic: how many cars and pedestrians the city keeps alive.
export const TRAFFIC = { maxCars: 16, maxPeds: 26, carSpeed: 150 };

// The day runs from golden hour (17:30) through the night; a full day
// takes eight minutes of play, so the light visibly changes in a session.
export const DAY = { startHour: 17.5, hoursPerSecond: 24 / 480 };

// Colours, kept in one table so the palette stays coherent.
export const COLORS = {
  grass: '#5d8a4a',
  grassDark: '#527c41',
  park: '#4f7d3e',
  road: '#3a3d46',
  roadLine: '#d8c95a',
  sidewalk: '#8d8578',
  sand: '#e0c98f',
  water: '#2b6ea6',
  waterDeep: '#1d4f80',
  buildingRoof: '#7a6a58',
  buildingRoof2: '#6b5f52',
  buildingRoof3: '#8a7a63',
  glass: '#3f6d8a',
  tree: '#2f6b2f',
  treeDark: '#265a26',
  hudBg: 'rgba(8, 10, 16, 0.72)',
  hudText: '#f2f0e6',
  hudAccent: '#ffd34d',
  mission: '#ffd34d',
  police: '#4da3ff',
  enemy: '#ff5a4d',
  player: '#f2f0e6',
};

// The eight named districts, each a rectangle; the HUD names the one the
// player stands in.
export const DISTRICTS = [
  { name: 'Old Foundry', x0: 0, y0: 0, x1: 850, y1: 850 },
  { name: 'Northgate', x0: 850, y0: 0, x1: 2050, y1: 850 },
  { name: 'Palm Court', x0: 2050, y0: 0, x1: 2920, y1: 850 },
  { name: 'Civic Center', x0: 0, y0: 850, x1: 1650, y1: 1650 },
  { name: 'Willow Park', x0: 850, y0: 1050, x1: 1450, y1: 1450 },
  { name: 'Harborview', x0: 1650, y0: 850, x1: 2920, y1: 1650 },
  { name: 'Marina Bay', x0: 1650, y0: 1650, x1: 2920, y1: 2400 },
  { name: 'The Strand', x0: 2920, y0: 0, x1: 3200, y1: 2400 },
];
