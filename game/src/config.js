// Solmar Bay — all tuning constants in one place.
// A top-down open-world crime game. Original city, characters, story.
// Not affiliated with Rockstar Games or Grand Theft Auto.
export const CFG = {
  // World + viewport
  WORLD_W: 3200,
  WORLD_H: 2400,
  VIEW_W: 1280,
  VIEW_H: 720,
  ROAD_W: 96,
  SIDEWALK: 16,
  AVENUES: [350, 850, 1350, 1850, 2350, 2850],
  STREETS: [300, 750, 1200, 1650, 2050],
  SAND_X: 2950, // beach starts here (east edge)
  SEA_X: 3040, // water starts here; the player can never enter it

  // Player on foot
  WALK_SPEED: 175,
  RUN_SPEED: 268,
  PLAYER_R: 13,
  PLAYER_HP: 100,

  // Player gun
  MAG_SIZE: 12,
  RELOAD_TIME: 1.1,
  BULLET_SPEED: 760,
  BULLET_LIFE: 0.9,
  FIRE_COOLDOWN: 0.16,
  GUN_DAMAGE: 34,

  // Cars (arcade physics)
  CAR: {
    ACCEL: 430,
    BRAKE: 760,
    REVERSE_ACCEL: 260,
    MAX_SPEED: 560,
    MAX_REVERSE: 190,
    TURN: 2.7,
    GRIP: 5.2,
    DRAG: 0.32,
    ROLL: 0.55,
    LENGTH: 46,
    WIDTH: 22,
    HP: 100,
  },
  POLICE_CAR_MAX: 470,
  TRAFFIC_SPEED: 150,
  TRAFFIC_COUNT: 14,
  PARKED_COUNT: 12,
  PED_COUNT: 26,

  // Wanted / heat
  HEAT_PER_STAR: 20,
  MAX_STARS: 5,
  HEAT_DECAY: 2.6, // per second while unseen
  SEE_RADIUS: 420,
  STEAL_HEAT: 14,
  KILL_HEAT: 8,
  PED_HIT_HEAT: 12,
  SHOOT_HEAT: 3,

  // Police
  CRUISER_RAM_COOLDOWN: 1.6,
  FOOT_COP_SPEED: 196,
  FOOT_COP_CATCH_TIME: 1.4,
  FOOT_COP_CATCH_DIST: 26,

  // Enemies
  ENEMY_HP: 70,
  ENEMY_SPEED: 128,
  ENEMY_SHOOT_RANGE: 380,
  ENEMY_SHOOT_COOLDOWN: 1.15,

  // Clock: one full day lasts 480 seconds of play
  DAY_LENGTH: 480,

  // Camera
  CAM_LERP: 5.0,
  CAM_LEAD: 46,

  // Minimap
  MINIMAP_W: 210,
  MINIMAP_H: 158,

  // Districts (8 named zones, west -> east, north -> south)
  DISTRICTS: [
    { name: 'Coral Beach', x0: 0, y0: 0, x1: 800, y1: 800 },
    { name: 'Old Town', x0: 800, y0: 0, x1: 1700, y1: 800 },
    { name: 'Downtown', x0: 1700, y0: 0, x1: 2960, y1: 800 },
    { name: 'Harbor Lights', x0: 0, y0: 800, x1: 800, y1: 1600 },
    { name: 'Market Row', x0: 800, y0: 800, x1: 1700, y1: 1600 },
    { name: 'Civic Center', x0: 1700, y0: 800, x1: 2960, y1: 1600 },
    { name: 'South Docks', x0: 0, y0: 1600, x1: 1500, y1: 2400 },
    { name: 'Palm Heights', x0: 1500, y0: 1600, x1: 2960, y1: 2400 },
  ],

  // Palette
  COLORS: {
    grass: '#3d7a44',
    grassDark: '#356b3b',
    sand: '#d9c08a',
    sea: '#1d6f9e',
    seaDeep: '#155a82',
    road: '#3a3d44',
    roadLine: '#c8b45a',
    sidewalk: '#8d8d84',
    building: '#6b6f7a',
    buildingRoof: '#565a66',
    park: '#2f6b34',
    tree: '#2a5c2e',
    treeLight: '#3f8a3a',
    marina: '#274b63',
    dock: '#7a5c3e',
    player: '#e8e8e8',
    police: '#1d4ed8',
    enemy: '#c0392b',
    ped: '#d9a05b',
  },

  // Car paint palette (seeded pick)
  CAR_COLORS: ['#b03a2e', '#2e86c1', '#f1c40f', '#7d3c98', '#16a085', '#e67e22', '#95a5a6', '#2c3e50', '#d35400', '#27ae60'],
  TAXI_COLOR: '#f7dc2a',
  POLICE_COLOR: '#1d4ed8',
};
