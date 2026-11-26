// Senja Rescue — the world: terrain, runway, rings, pad, weather.
// The terrain is one height function shared by the renderer, the flight
// model (ground collisions) and the minimap, so what you see is what you
// can hit. Everything is placed by hand around a seeded noise field.

import { CFG } from './config.js';
import { fbm, mulberry32 } from './random.js';

export const WORLD_SEED = 20261126;

function gauss(x, z, cx, cz, radius) {
  const dx = (x - cx) / radius;
  const dz = (z - cz) / radius;
  return Math.exp(-(dx * dx + dz * dz));
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Height of the ground in metres at world (x, z). Sea level is y = 0.
export function groundHeight(x, z) {
  // Rolling hills over the whole map.
  let h = fbm(x + 400, z - 300, 1400, 3, WORLD_SEED) * 320 - 40;
  // A long ridge west of the runway for a recognisable silhouette.
  h += gauss(x, z, -5200, 5000, 2600) * 420;
  // The volcano cone, the landmark of the whole sortie.
  const v = CFG.volcano;
  h += gauss(x, z, v.x, v.z, v.radius) * v.height;
  // Sea to the east: everything past the coast sinks below zero, then
  // the islands rise out of it.
  if (x > CFG.seaEast - 600) {
    const coast = clamp((x - (CFG.seaEast - 600)) / 600, 0, 1);
    h = h * (1 - coast) - coast * 60;
    for (const isl of CFG.islands) {
      h += gauss(x, z, isl.x, isl.z, isl.r) * isl.h;
    }
  }
  // Flatten the runway strip and its shoulders.
  const rw = CFG.runway;
  if (z > rw.z0 - 300 && z < rw.z1 + 300) {
    const d = Math.abs(x - rw.x);
    if (d < 160) {
      const k = clamp((d - rw.width / 2) / 120, 0, 1);
      h = h * k;
    }
  }
  // Flatten the clinic pad shelf on the volcano's shoulder.
  const p = CFG.pad;
  h = h * (1 - gauss(x, z, p.x, p.z, 260) * 0.92) + (p.y - 6) * gauss(x, z, p.x, p.z, 260) * 0.92;
  return h;
}

// Is this point over open water?
export function isWater(x, z) {
  return groundHeight(x, z) < 1;
}

// Day cycle: t in [0,1). Returns light levels the renderer and the
// instruments share, so dusk looks the same everywhere.
export function daylight(t) {
  // Sun elevation: 1 at noon, 0 at horizon, negative at night.
  const sun = Math.sin((t - 0.25) * Math.PI * 2);
  const dusk = clamp(1 - Math.abs(sun) * 2.2, 0, 1); // golden band
  return {
    sun,
    // 0 = pitch dark, 1 = full day. Golden hour sits around 0.45.
    brightness: clamp(0.12 + sun * 0.88, 0.1, 1),
    dusk,
    night: clamp(-sun * 2.5, 0, 1),
    // Sun azimuth in degrees: rises east (90), noon south (180),
    // sets west (270), so the outbound leg flies into the sunset.
    sunHeading: 90 + (t - 0.25) * 360,
  };
}

// Weather: one rain-squall band across the outbound leg, plus gusts.
// Returns 0..1 rain intensity and a wind vector at (x, z, time).
export function weatherAt(x, z, timeSec) {
  // The squall sits between rings 3 and 4, drifting slowly east.
  const bandX = -200 + Math.sin(timeSec * 0.02) * 150;
  const bandZ = 6400;
  const d = Math.hypot((x - bandX) * 0.6, z - bandZ);
  const rain = clamp(1 - d / 1400, 0, 1);
  // Gusts: slow sines, so the buffeting feels like weather, not noise.
  const gust = Math.sin(timeSec * 0.7 + x * 0.004) * 2.2
    + Math.sin(timeSec * 1.3 + z * 0.006) * 1.4;
  return {
    rain,
    windX: 3 + gust * (0.4 + rain),
    windZ: -1.5 + gust * 0.3,
    turbulence: rain * 0.9 + 0.15,
  };
}

// Village light positions, precomputed once per seed so the renderer
// and the minimap agree. Each entry: [x, z] on the ground.
export function villageLights() {
  const out = [];
  const rng = mulberry32(WORLD_SEED + 77);
  for (const vil of CFG.villages) {
    for (let i = 0; i < vil.n; i++) {
      const a = rng() * Math.PI * 2;
      const r = 40 + rng() * 260;
      const x = vil.x + Math.cos(a) * r;
      const z = vil.z + Math.sin(a) * r * 0.7;
      out.push([x, z, groundHeight(x, z)]);
    }
  }
  return out;
}

// Cloud puffs: [x, y, z, radius], drifting slowly with the wind.
export function cloudField() {
  const rng = mulberry32(WORLD_SEED + 913);
  const clouds = [];
  for (let i = 0; i < 46; i++) {
    clouds.push({
      x: -6000 + rng() * 12000,
      y: 700 + rng() * 500,
      z: -1000 + rng() * 14000,
      r: 220 + rng() * 420,
    });
  }
  return clouds;
}
