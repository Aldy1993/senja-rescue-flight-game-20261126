// Senja Rescue — the picture: sky, terrain, runway, rings, aircraft.
// A small perspective camera projects the world onto the canvas. Terrain
// is drawn as heightfield quads far-to-near, so hills, the volcano and
// the sea read as real land; the runway and the rings are drawn in the
// same space, so they sit on the ground instead of floating on top.

import { CFG } from './config.js';
import { daylight, groundHeight, villageLights, cloudField } from './world.js';

const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function hex(rgb) {
  return `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
}

function hexStr(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}

// Camera: position + heading + a little look-down that grows with height.
export function makeCamera(f, W, H) {
  const focal = (H * 0.5) / Math.tan((CFG.fovDeg / 2) * DEG);
  const camY = f.y + 2.2;
  const pitch = clamp(4 + f.y * 0.012, 4, 16) * DEG;
  return { x: f.x, y: camY, z: f.z, heading: f.heading, pitch, focal, W, H };
}

// Project a world point. Returns null behind the camera.
export function project(cam, x, y, z) {
  const dx = x - cam.x;
  const dy = y - cam.y;
  const dz = z - cam.z;
  const h = cam.heading * DEG;
  const sinH = Math.sin(h);
  const cosH = Math.cos(h);
  // Rotate into camera space: forward = +z, right = +x.
  const xc = dx * cosH - dz * sinH;
  const zc = dx * sinH + dz * cosH;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const yc = dy * cp - zc * sp;
  const z2 = dy * sp + zc * cp;
  if (z2 < 4) return null;
  const s = cam.focal / z2;
  return {
    x: cam.W / 2 + xc * s,
    y: cam.H * 0.44 - yc * s,
    d: z2,
    s,
  };
}

function skyGradient(ctx, W, H, light) {
  const keys = light.sun > 0.45 ? CFG.sky.day : light.sun > -0.05 ? CFG.sky.dusk : CFG.sky.night;
  const top = hexStr(keys[0]);
  const mid = hexStr(keys[1]);
  const bot = hexStr(keys[2]);
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  // Golden-hour warmth peaks near the horizon at dusk.
  const warm = mixColor(mid, hexStr(CFG.sky.dusk[2]), light.dusk * 0.7);
  g.addColorStop(0, hex(mixColor(top, [20, 26, 48], light.night * 0.6)));
  g.addColorStop(0.55, hex(mixColor(mid, warm, 0.5)));
  g.addColorStop(1, hex(warm));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * 0.62);
  // Haze band hugging the horizon.
  const haze = ctx.createLinearGradient(0, H * 0.42, 0, H * 0.62);
  haze.addColorStop(0, 'rgba(240,190,140,0)');
  haze.addColorStop(1, `rgba(240,190,140,${0.25 * (0.4 + light.dusk)})`);
  ctx.fillStyle = haze;
  ctx.fillRect(0, H * 0.42, W, H * 0.2);
  return { top, warm };
}

function drawSun(ctx, W, H, light, heading) {
  // Sun sits low in the west at dusk: ahead-left on the outbound leg.
  const rel = ((light.sunHeading - heading + 540) % 360) - 180;
  if (Math.abs(rel) > 95 || light.sun < -0.12) return; // out of view / set
  const sx = W / 2 + (rel / 95) * (W * 0.62);
  const sy = H * 0.44 - (light.sun * 160 + 30);
  const r = 34;
  const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, r * 3.2);
  glow.addColorStop(0, 'rgba(255,214,140,0.9)');
  glow.addColorStop(0.35, 'rgba(255,160,90,0.45)');
  glow.addColorStop(1, 'rgba(255,160,90,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - r * 3.2, sy - r * 3.2, r * 6.4, r * 6.4);
  ctx.fillStyle = '#ffe9b0';
  ctx.beginPath();
  ctx.arc(sx, sy, r * (0.8 + light.dusk * 0.3), 0, Math.PI * 2);
  ctx.fill();
}

function drawStars(ctx, W, H, light) {
  if (light.night < 0.25) return;
  ctx.save();
  ctx.globalAlpha = light.night * 0.9;
  ctx.fillStyle = '#dfe8ff';
  for (let i = 0; i < 90; i++) {
    const x = (i * 137.5 + 31) % W;
    const y = ((i * 89.3 + 17) % (H * 0.4));
    const s = (i % 3) * 0.5 + 0.7;
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}

// Colour of terrain at a height, shaded by distance haze. Heights are
// quantised into bands so neighbouring quads share a colour and the
// mesh reads as flat-shaded low-poly land, not a wireframe grid.
function terrainColor(h, dist, light) {
  const band = Math.floor(h / 45) * 45;
  let base;
  if (band < 3) base = hexStr(CFG.terrain.sand);
  else if (band < 180) base = hexStr(CFG.terrain.grass);
  else if (band < 420) base = hexStr(CFG.terrain.forest);
  else if (band < 720) base = hexStr(CFG.terrain.rock);
  else if (band < 880) base = hexStr(CFG.terrain.snow);
  else base = hexStr(CFG.terrain.basalt);
  // Distance haze toward the sky colour.
  const haze = clamp(dist / 2600, 0, 0.55);
  const c = mixColor(base, [214, 178, 150], haze);
  // Night darkens everything; dusk warms it.
  const bright = light.brightness * 0.85 + 0.15;
  return hex([c[0] * bright, c[1] * bright, c[2] * bright]);
}

export function renderWorld(ctx, f, state, clouds, lights) {
  const W = CFG.viewW;
  const H = CFG.viewH;
  const t = CFG.dayStart + (f.timeSec / CFG.dayLengthSec);
  const light = daylight(t % 1);
  const cam = makeCamera(f, W, H);
  const horizonY = H * 0.44;

  skyGradient(ctx, W, H, light);
  drawStars(ctx, W, H, light);
  drawSun(ctx, W, H, light, f.heading);

  // --- Clouds (behind the terrain, above the horizon) ---
  ctx.save();
  for (const c of clouds) {
    const p = project(cam, c.x, c.y, c.z);
    if (!p || p.y > horizonY + 30) continue;
    const r = c.r * p.s * 0.9;
    if (r < 4) continue;
    const alpha = clamp(0.5 - p.d / 6000, 0.06, 0.32) * (0.5 + light.brightness * 0.5);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = light.sun > 0 ? '#f4e8dc' : '#2a3450';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x - r * 0.5, p.y + r * 0.06, r * 0.6, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // --- The volcano crater, only close enough to read as a crater
  // (from far away it would float on the horizon like a stray ring).
  drawVolcanoCrater(ctx, cam, light);

  // --- Terrain + sea: one camera-space grid, far to near, so the
  // ground under the nose is the ground ahead of the heading, north
  // or south. Water quads paint the sea where the ground is below it.
  drawTerrain(ctx, cam, light, f);

  // --- Runway, pad, rings, village lights, rain ---
  drawRunway(ctx, cam, light, f);
  drawPad(ctx, cam, light, f);
  drawRings(ctx, cam, light, f);
  drawVillageLights(ctx, cam, light, lights);
  drawRain(ctx, W, H, f, state);
  return { cam, light, horizonY };
}

// The volcano's crater: a dark notch with a lava glow at dusk, so the
// landmark reads as a volcano and not a flat mesa.
function drawVolcanoCrater(ctx, cam, light) {
  const v = CFG.volcano;
  const p = project(cam, v.x, v.height + 40, v.z);
  if (!p || p.d < 500 || p.d > 4000) return;
  const r = Math.max(4, 260 * p.s);
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#241a16';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  const glow = clamp(light.dusk + light.night * 0.6, 0, 1);
  if (glow > 0.15) {
    ctx.globalAlpha = glow * 0.8;
    ctx.strokeStyle = '#ff7a2c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 0.8, r * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTerrain(ctx, cam, light, f) {
  // Grid in camera space: rows at growing forward distances, columns
  // across the direction of flight, so the mesh follows the heading.
  // Each quad is sea where the ground is under water, land otherwise.
  const hRad = cam.heading * DEG;
  const fx = Math.sin(hRad);
  const fz = Math.cos(hRad);
  const rx = Math.cos(hRad);
  const rz = -Math.sin(hRad);
  const rowD = [60, 120, 200, 300, 430, 600, 800, 1050, 1350, 1700, 2100, 2550, 3050];
  const latStep = 220;
  const latN = 26;
  const grid = [];
  for (let ri = rowD.length - 1; ri >= 0; ri--) {
    const d = rowD[ri];
    const row = [];
    for (let ci = 0; ci <= latN; ci++) {
      const s = (ci - latN / 2) * latStep;
      const x = cam.x + fx * d + rx * s;
      const z = cam.z + fz * d + rz * s;
      const h = groundHeight(x, z);
      row.push({ h, p: project(cam, x, h, z) });
    }
    grid.push(row);
  }
  for (let ri = 0; ri < grid.length - 1; ri++) {
    const row = grid[ri];
    const row2 = grid[ri + 1];
    for (let c = 0; c < latN; c++) {
      const a = row[c];
      const b = row[c + 1];
      const cc = row2[c];
      const d = row2[c + 1];
      if (!a.p || !b.p || !cc.p || !d.p) continue;
      const mh = Math.max(a.h, b.h, cc.h, d.h);
      const avg = (a.h + b.h + cc.h + d.h) / 4;
      const dist = (a.p.d + d.p.d) / 2;
      if (mh < 1) {
        const sea = mixColor(hexStr(CFG.sea[0]), hexStr(CFG.sea[2]), light.brightness * 0.5);
        const bright = light.brightness * 0.8 + 0.2;
        ctx.fillStyle = hex([sea[0] * bright, sea[1] * bright, sea[2] * bright]);
      } else {
        ctx.fillStyle = terrainColor(avg, dist, light);
      }
      ctx.beginPath();
      ctx.moveTo(a.p.x, a.p.y);
      ctx.lineTo(b.p.x, b.p.y);
      ctx.lineTo(d.p.x, d.p.y);
      ctx.lineTo(cc.p.x, cc.p.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function quad(ctx, cam, pts, fill, stroke) {
  const ps = pts.map(([x, y, z]) => project(cam, x, y, z));
  if (ps.some((p) => !p)) return;
  ctx.beginPath();
  ctx.moveTo(ps[0].x, ps[0].y);
  for (let i = 1; i < ps.length; i++) ctx.lineTo(ps[i].x, ps[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function glowDot(ctx, cam, x, y, z, radius, color, alpha) {
  const p = project(cam, x, y, z);
  if (!p) return;
  // Cap the screen radius: a light 80 m away must not become a UFO.
  const r = Math.max(1.2, Math.min(12, radius * p.s * 0.45));
  ctx.save();
  ctx.globalAlpha = alpha * 0.25;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRunway(ctx, cam, light, f) {
  const rw = CFG.runway;
  const y = 0.6;
  const hw = rw.width / 2;
  const dark = light.brightness < 0.55;
  // The strip in 100 m segments, so a segment behind the camera is
  // skipped instead of the whole runway vanishing on final approach.
  for (let z = rw.z0; z < rw.z1; z += 100) {
    const ze = Math.min(z + 100, rw.z1);
    quad(ctx, cam, [
      [rw.x - hw, y, z],
      [rw.x + hw, y, z],
      [rw.x + hw, y, ze],
      [rw.x - hw, y, ze],
    ], dark ? '#23262e' : '#3a3d44');
  }
  // Centreline dashes.
  for (let z = rw.z0 + 60; z < rw.z1 - 40; z += 90) {
    quad(ctx, cam, [
      [rw.x - 1.6, y + 0.15, z],
      [rw.x + 1.6, y + 0.15, z],
      [rw.x + 1.6, y + 0.15, z + 42],
      [rw.x - 1.6, y + 0.15, z + 42],
    ], '#e8e4d8');
  }
  // Threshold bars at both ends.
  for (const tz of [rw.z0 + 26, rw.z1 - 26]) {
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      quad(ctx, cam, [
        [rw.x + i * 5.4 - 1.8, y + 0.15, tz - 14],
        [rw.x + i * 5.4 + 1.8, y + 0.15, tz - 14],
        [rw.x + i * 5.4 + 1.8, y + 0.15, tz + 14],
        [rw.x + i * 5.4 - 1.8, y + 0.15, tz + 14],
      ], '#f2efe4');
    }
  }
  // Edge lights: blue-white dots, bright after dark.
  const alpha = 0.35 + light.night * 0.65;
  for (let z = rw.z0 + 20; z <= rw.z1 - 10; z += 110) {
    glowDot(ctx, cam, rw.x - hw - 3, y + 1, z, 3.2, '#bfe3ff', alpha);
    glowDot(ctx, cam, rw.x + hw + 3, y + 1, z, 3.2, '#bfe3ff', alpha);
  }
  // Green threshold / red end lights.
  glowDot(ctx, cam, rw.x - hw, y + 1, rw.z0 + 8, 4, '#37e08a', alpha);
  glowDot(ctx, cam, rw.x + hw, y + 1, rw.z0 + 8, 4, '#37e08a', alpha);
  glowDot(ctx, cam, rw.x - hw, y + 1, rw.z1 - 8, 4, '#ff5a4a', alpha);
  glowDot(ctx, cam, rw.x + hw, y + 1, rw.z1 - 8, 4, '#ff5a4a', alpha);
  // A small terminal block and a windsock beside the strip.
  quad(ctx, cam, [
    [110, 0, 260],
    [150, 0, 260],
    [150, 26, 260],
    [110, 26, 260],
  ], '#8a7a5c');
  quad(ctx, cam, [
    [150, 0, 260],
    [150, 0, 300],
    [150, 26, 300],
    [150, 26, 260],
  ], '#6e6046');
  const ws = project(cam, -80, 14, 420);
  if (ws) {
    ctx.save();
    ctx.strokeStyle = '#ff7a3c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ws.x, ws.y + 14 * ws.s);
    ctx.lineTo(ws.x, ws.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPad(ctx, cam, light, f) {
  const p = CFG.pad;
  const y = p.y + 0.6;
  // Helipad disc on the volcano shoulder, with an H.
  const steps = 26;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([p.x + Math.cos(a) * p.r * 0.55, y, p.z + Math.sin(a) * p.r * 0.55]);
  }
  const ps = pts.map(([x, yy, z]) => project(cam, x, yy, z)).filter(Boolean);
  if (ps.length > 4) {
    ctx.beginPath();
    ctx.moveTo(ps[0].x, ps[0].y);
    for (let i = 1; i < ps.length; i++) ctx.lineTo(ps[i].x, ps[i].y);
    ctx.closePath();
    ctx.fillStyle = light.brightness < 0.55 ? '#2c2f36' : '#4a4d55';
    ctx.fill();
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Clinic cross beacon above the pad.
  const bp = project(cam, p.x, p.y + 26, p.z);
  if (bp) {
    ctx.save();
    ctx.globalAlpha = 0.5 + light.night * 0.5;
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawRings(ctx, cam, light, f) {
  // Only the current leg's rings are drawn: a passed ring behind the
  // plane or a future leg's ring would only clutter the picture.
  const all = [];
  if (f.leg <= 2) {
    CFG.rings.forEach((r, i) => all.push({ ...r, done: i < f.ringsPassed, next: f.leg === 1 && i === f.ringsPassed }));
  }
  if (f.leg >= 3) {
    CFG.returnRings.forEach((r, i) => all.push({ ...r, done: i < f.returnPassed, next: f.leg === 3 && i === f.returnPassed }));
  }
  // The clinic gate ring, shown while leg 2 runs.
  if (f.leg === 2) {
    all.push({ ...CFG.pad, r: CFG.pad.r * 0.8, done: false, next: true });
  }
  for (const ring of all) {
    const dist = Math.hypot(ring.x - f.x, ring.z - f.z);
    if (dist > 3200) continue;
    const N = 28;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      // Ring plane faces the course (vertical, perpendicular to z).
      pts.push(project(cam, ring.x + Math.cos(a) * ring.r, ring.y + Math.sin(a) * ring.r, ring.z));
    }
    if (pts.some((p) => !p)) continue;
    const color = ring.done ? '#3ddc84' : ring.next ? '#ffc93c' : '#4fc3f7';
    const width = clamp(5 - dist / 900, 1.5, 5);
    ctx.save();
    ctx.globalAlpha = ring.next ? 0.95 : 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = ring.next ? 16 : 6;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawVillageLights(ctx, cam, light, lights) {
  if (light.night < 0.15 && light.brightness > 0.6) return;
  const alpha = clamp(0.25 + light.night, 0, 1);
  for (const [x, z, h] of lights) {
    glowDot(ctx, cam, x, h + 2, z, 2.2, '#ffca6a', alpha * 0.8);
  }
}

function drawRain(ctx, W, H, f, state) {
  if (!state || !state.rain || state.rain < 0.08) return;
  ctx.save();
  ctx.globalAlpha = clamp(state.rain, 0, 0.7);
  ctx.strokeStyle = '#aebfd4';
  ctx.lineWidth = 1;
  for (let i = 0; i < 130; i++) {
    const x = ((i * 97.3 + f.timeSec * 260) % (W + 60)) - 30;
    const y = (i * 173.1 + f.timeSec * 700) % (H + 40);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 9, y + 26);
    ctx.stroke();
  }
  // Grey wash over the sky in the squall.
  ctx.globalAlpha = state.rain * 0.18;
  ctx.fillStyle = '#5a6a80';
  ctx.fillRect(0, 0, W, H * 0.5);
  ctx.restore();
}

// --- The aircraft, drawn as a vector STOL plane in chase view ---
export function drawPlane(ctx, f, light) {
  const W = CFG.viewW;
  const H = CFG.viewH;
  const cx = W / 2;
  const cy = H * 0.56;
  const scale = 1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(f.roll * DEG * 0.55); // the plane banks less than it rolls
  ctx.scale(scale, scale);
  // Propeller blur disc.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#c8ccd4';
  ctx.beginPath();
  ctx.ellipse(0, -58, 40, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Main wing (swept, orange tips).
  ctx.fillStyle = '#e86a2c';
  ctx.beginPath();
  ctx.moveTo(-118, -18);
  ctx.lineTo(-30, -30);
  ctx.lineTo(30, -30);
  ctx.lineTo(118, -18);
  ctx.lineTo(104, -6);
  ctx.lineTo(-104, -6);
  ctx.closePath();
  ctx.fill();
  // Wing walkway stripe.
  ctx.fillStyle = '#f7f3ea';
  ctx.fillRect(-30, -30, 60, 8);
  // Fuselage: tapered, cream with an orange cheatline.
  ctx.fillStyle = '#f2ede2';
  ctx.beginPath();
  ctx.moveTo(-16, -78);
  ctx.quadraticCurveTo(-20, -30, -14, 62);
  ctx.lineTo(-8, 84);
  ctx.lineTo(8, 84);
  ctx.lineTo(14, 62);
  ctx.quadraticCurveTo(20, -30, 16, -78);
  ctx.quadraticCurveTo(0, -88, -16, -78);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e86a2c';
  ctx.fillRect(-15, -6, 30, 7);
  // Cabin windows, lit amber at dusk.
  ctx.fillStyle = light.brightness < 0.6 ? '#ffd98a' : '#2c3e55';
  ctx.beginPath();
  ctx.ellipse(0, -52, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail fin with the Senja mark.
  ctx.fillStyle = '#2c4a6e';
  ctx.beginPath();
  ctx.moveTo(-12, 62);
  ctx.lineTo(-26, 96);
  ctx.lineTo(-8, 92);
  ctx.lineTo(8, 92);
  ctx.lineTo(26, 96);
  ctx.lineTo(12, 62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffc93c';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MR-7', 0, 88);
  // Horizontal stabiliser.
  ctx.fillStyle = '#e86a2c';
  ctx.beginPath();
  ctx.moveTo(-52, 70);
  ctx.lineTo(52, 70);
  ctx.lineTo(44, 80);
  ctx.lineTo(-44, 80);
  ctx.closePath();
  ctx.fill();
  // Nav lights: red port, green starboard, white tail strobe.
  const blink = Math.sin(f.timeSec * 6) > 0 ? 1 : 0.25;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-118, -12, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34e07a';
  ctx.beginPath();
  ctx.arc(118, -12, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = blink;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 96, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Landing gear when down.
  if (f.gearDown) {
    ctx.strokeStyle = '#3a3f46';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, 40);
    ctx.lineTo(-20, 66);
    ctx.moveTo(12, 40);
    ctx.lineTo(20, 66);
    ctx.stroke();
    ctx.fillStyle = '#22252a';
    ctx.beginPath();
    ctx.arc(-21, 68, 6, 0, Math.PI * 2);
    ctx.arc(21, 68, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
