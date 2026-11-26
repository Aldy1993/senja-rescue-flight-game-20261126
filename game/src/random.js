// Senja Rescue — deterministic randomness.
// Every random choice in the game comes from a seeded generator, so a
// screenshot staged with a seed renders the same pixels every run. The
// terrain uses value noise built on the same integer hash.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash of a grid cell -> [0, 1). Stable across runs and machines.
export function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// 2D value noise in [0, 1], wavelength in metres.
export function valueNoise(x, z, wavelength, seed) {
  const gx = x / wavelength;
  const gz = z / wavelength;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = smooth(gx - ix);
  const fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Fractal noise: n octaves, each half the amplitude of the last.
export function fbm(x, z, wavelength, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let wl = wavelength;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x, z, wl, seed + i * 101);
    amp *= 0.5;
    wl *= 0.5;
  }
  return sum; // roughly in [0, 1)
}
