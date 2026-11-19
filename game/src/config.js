// Solmar City — tuning numbers, world layout and palettes in one place.
// The city is a fixed 3200x2400 world: a grid of roads, a beach and ocean on
// the west edge, downtown in the middle, a park, a marina and suburbs.
export const STEP = 1 / 60;
export const WORLD = { width: 3200, height: 2400 };
export const ROAD_W = 96;
export const ROAD_XS = [400, 800, 1200, 1600, 2000, 2400, 2800];
export const ROAD_YS = [300, 700, 1100, 1500, 1900, 2200];
export const OCEAN_X = 300; // x < 300 is water; 300..352 is sand
export const SAND_X = 352;
export const SAVE_KEY = 'solmar-city-save-v1';

// Districts, by rectangle, for ground colour and building style.
export const DISTRICTS = [
  { name: 'Ocean Beach', x: 0, y: 0, w: 400, h: 2400, ground: '#e8c98f', kind: 'beach' },
  { name: 'Downtown', x: 1200, y: 700, w: 800, h: 800, ground: '#8f8f7d', kind: 'downtown' },
  { name: 'Marina', x: 2000, y: 1900, w: 1200, h: 500, ground: '#7d8a6a', kind: 'marina' },
  { name: 'Old Town', x: 400, y: 300, w: 800, h: 800, ground: '#a89a7c', kind: 'oldtown' },
  { name: 'Hills', x: 2400, y: 0, w: 800, h: 700, ground: '#7f9155', kind: 'hills' },
];

export const PLAYER = {
  walkSpeed: 175,
  runSpeed: 285,
  radius: 13,
  maxHealth: 100,
};

export const CAR = {
  accel: 980,
  brake: 1500,
  reverseMax: 200,
  maxSpeed: 560,
  turnRate: 2.9,
  grip: 6.5,
  radius: 22,
  maxHp: 100,
};

export const TRAFFIC = { count: 34, minSpeed: 150, maxSpeed: 250 };
export const PEDS = { count: 46 };
export const POLICE = { maxCars: 5, chaseSpeed: 520, bustTime: 1.2 };

export const WEAPON = {
  pistol: { damage: 34, range: 430, fireInterval: 0.24, mag: 12, reloadTime: 1.15, spread: 0.045 },
};

export const WANTED = { decayDelay: 10, decayInterval: 8, max: 5 };

export const COLORS = {
  asphalt: '#3a3a40',
  asphaltLight: '#44444c',
  sidewalk: '#9a9a8e',
  lane: '#e8d44d',
  curb: '#c9c9bd',
  grass: '#6f9e4f',
  parkGrass: '#5d8f43',
  sand: '#e8c98f',
  water: '#2a7fa8',
  waterDeep: '#1d5f86',
  buildingDowntown: ['#5b6b7a', '#6e7f8f', '#4a5a68', '#7a8ba0', '#3f4c5c'],
  buildingSuburb: ['#c98f6b', '#d9a05b', '#b07a5e', '#e0b184', '#8fa3b0', '#a8b08a'],
  buildingOld: ['#c9a06b', '#b98a5e', '#d4b183', '#a87f56'],
  carColors: ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#2c3e50', '#e67e22', '#8e44ad', '#16a085', '#7f8c8d', '#d35400'],
  palm: '#3f7d3a',
};

export const MISSION_REWARDS = [400, 900, 1400, 1800, 5000];

// Landmarks: named places the story and the HUD point at.
export const LANDMARKS = {
  garage: { x: 1400, y: 1700, label: "Lena's Garage" },
  safehouse: { x: 1000, y: 2050, label: 'Safehouse' },
  hospital: { x: 2200, y: 500, label: 'Solmar General' },
  policeHq: { x: 1800, y: 900, label: 'SCPD HQ' },
  bank: { x: 1600, y: 1300, label: 'Solmar Trust Bank' },
  marina: { x: 2600, y: 2050, label: 'Marina Docks' },
  beachClub: { x: 400, y: 900, label: 'Palmera Beach Club' },
  pier: { x: 2600, y: 2250, label: 'Sunset Pier' },
};
