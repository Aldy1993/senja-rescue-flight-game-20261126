// Senja Rescue — shared tuning for the whole game.
// One place for every number a designer would tweak: the flight model,
// the course, the day cycle and the look. Nothing here is read from the
// network or the environment; the game is fully deterministic given a seed.

export const CFG = {
  // Canvas the game is designed for (screenshots are taken at this size).
  viewW: 1280,
  viewH: 720,
  fovDeg: 68,

  // Flight model (SI units, metres / seconds / degrees).
  maxThrottle: 1,
  thrustAccel: 26, // m/s^2 at full throttle, low speed
  dragK: 0.00085, // quadratic drag coefficient
  gearDrag: 0.00045,
  flapDrag: 0.00035,
  stallClean: 52, // m/s, flaps up
  stallFlap: 40, // m/s, full flaps
  rotateSpeed: 58, // m/s, nose comes up on takeoff
  maxBankDeg: 55,
  maxPitchDeg: 20,
  climbRateMax: 14, // m/s at full power, best climb
  fuelCapacity: 100,
  fuelBurn: 0.22, // units per second at full throttle
  gLimit: 4.5,

  // Course: runway, rings, clinic pad. Headings in degrees, 0 = north (+z).
  runway: { x: 0, z0: 0, z1: 1200, width: 46, heading: 0 },
  rings: [
    { x: 120, y: 340, z: 2600, r: 60 },
    { x: -350, y: 400, z: 4200, r: 60 },
    { x: 500, y: 440, z: 5800, r: 60 },
    { x: -700, y: 400, z: 7200, r: 60 },
    { x: 600, y: 430, z: 8600, r: 55 },
  ],
  pad: { x: 900, y: 250, z: 9800, r: 70 },
  returnRings: [
    { x: 200, y: 420, z: 7800, r: 60 },
    { x: 400, y: 380, z: 6000, r: 60 },
    { x: -100, y: 280, z: 4200, r: 60 },
  ],
  // Final approach: come back heading south (180) onto the same runway.
  finalFix: { x: 0, y: 220, z: 3400 },

  // World dressing.
  volcano: { x: -2600, z: 9800, height: 980, radius: 1900 },
  seaEast: 2900, // x beyond this is open sea with islands
  islands: [
    { x: 3600, z: 4200, r: 700, h: 150 },
    { x: 4300, z: 6800, r: 900, h: 230 },
    { x: 3400, z: 9000, r: 620, h: 120 },
    { x: 4800, z: 2600, r: 500, h: 90 },
  ],
  villages: [
    { x: 900, z: 3000, n: 26 },
    { x: -1600, z: 5200, n: 18 },
    { x: 1400, z: 7600, n: 22 },
  ],

  // Day cycle: t = 0 dawn .. 1 next dawn. The sortie starts at golden
  // hour and ends after dark, so the instruments and runway lights matter.
  dayStart: 0.68, // golden hour at takeoff
  dayLengthSec: 1500, // one full day; the sortie spans golden hour to night

  // Scoring.
  ringPoints: 250,
  pickupPoints: 500,
  landingBase: 400,
  landingQualityMax: 400,
  centerlineBonus: 200,
  stopBonus: 200,

  // Colours, one style throughout: warm dusk sky, teal sea, ochre rock.
  sky: {
    dawn: ['#2e4a7a', '#e8906b', '#f7c98b'],
    day: ['#3f7fc1', '#9cc8e8', '#dceefb'],
    dusk: ['#1d2b52', '#c65a3c', '#f2a35e'],
    night: ['#060a18', '#101a33', '#1c2a4a'],
  },
  sea: ['#14506e', '#1b6a8a', '#2a8aa8'],
  terrain: {
    sand: '#c9a86a',
    grass: '#5d7d3c',
    forest: '#33502a',
    rock: '#7a6a58',
    snow: '#e8eef2',
    basalt: '#3a3230',
  },
};

// Mission legs, in order. The HUD and the banner read these names.
export const LEGS = [
  'TAKEOFF — rotate at 58 m/s, climb away',
  'OUTBOUND — thread the five gold rings',
  'PICKUP — slow through the clinic gate',
  'RETURN — three rings home, descend',
  'LANDING — gear down, flare over the numbers',
];
