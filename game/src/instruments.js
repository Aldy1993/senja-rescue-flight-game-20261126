// Senja Rescue — instruments: the lit six-pack, HUD tapes, minimap.
// The panel is drawn, not photographed: every gauge is a canvas dial
// with a glowing face, so the "instruments lit" requirement reads even
// in a 768-pixel contact sheet. All text is large and high-contrast.

import { CFG } from './config.js';
import { groundHeight, isWater } from './world.js';
import { legName } from './physics.js';

const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fmtHeading(h) {
  return pad(Math.round(((h % 360) + 360) % 360), 3);
}

// One round dial: face, ticks, needle, label, digital value.
function dial(ctx, cx, cy, r, label, value, opts) {
  ctx.save();
  ctx.translate(cx, cy);
  // Lit face: warm amber glow that reads at dusk and night.
  const face = ctx.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
  face.addColorStop(0, '#3a2f1c');
  face.addColorStop(0.7, '#241d10');
  face.addColorStop(1, '#120e06');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a7a55';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Ticks.
  ctx.strokeStyle = '#e8dcc0';
  ctx.lineWidth = 1.5;
  const ticks = opts.ticks || 12;
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2 - Math.PI / 2;
    const major = i % 3 === 0;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * (major ? 0.8 : 0.88), Math.sin(a) * r * (major ? 0.8 : 0.88));
    ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    ctx.stroke();
  }
  // Needle.
  const na = (opts.needleAngle ?? 0) * DEG;
  ctx.strokeStyle = opts.needleColor || '#ffb02e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-Math.cos(na) * r * 0.2, -Math.sin(na) * r * 0.2);
  ctx.lineTo(Math.cos(na) * r * 0.82, Math.sin(na) * r * 0.82);
  ctx.stroke();
  ctx.fillStyle = '#ffb02e';
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  // Label + value.
  ctx.fillStyle = '#e8dcc0';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, -r * 0.42);
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(value, 0, r * 0.62);
  ctx.restore();
}

// Artificial horizon: a ball that rolls and pitches with the aircraft.
function attitude(ctx, cx, cy, r, f) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(-f.roll * DEG);
  const pitchPx = clamp(f.pitch, -30, 30) * (r / 30);
  ctx.fillStyle = '#2e6db0';
  ctx.fillRect(-r, -r + pitchPx, r * 2, r - pitchPx);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-r, pitchPx, r * 2, r - pitchPx + r);
  ctx.strokeStyle = '#f2ede2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, pitchPx);
  ctx.lineTo(r, pitchPx);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#8a7a55';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed wings marker.
  ctx.strokeStyle = '#ffc93c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, 0);
  ctx.lineTo(-r * 0.18, 0);
  ctx.moveTo(r * 0.18, 0);
  ctx.lineTo(r * 0.62, 0);
  ctx.stroke();
  ctx.fillStyle = '#e8dcc0';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATT', 0, -r - 6);
  ctx.restore();
}

// Compass rose that turns with the heading.
function compassDial(ctx, cx, cy, r, heading) {
  ctx.save();
  ctx.translate(cx, cy);
  const face = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  face.addColorStop(0, '#1d2733');
  face.addColorStop(1, '#0c1118');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a7a55';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.rotate(-heading * DEG);
  ctx.strokeStyle = '#e8dcc0';
  for (let d = 0; d < 360; d += 10) {
    const a = d * DEG - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88);
    ctx.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97);
    ctx.stroke();
  }
  ctx.restore();
  // Letters stay upright: their positions rotate, their glyphs don't.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#e8dcc0';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  for (const [deg, name] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
    const a = (deg - heading) * DEG - Math.PI / 2;
    ctx.fillText(name, Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66 + 4);
  }
  ctx.restore();
  // Fixed lubber line + digital heading.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffc93c';
  ctx.beginPath();
  ctx.moveTo(0, -r - 2);
  ctx.lineTo(-6, -r - 12);
  ctx.lineTo(6, -r - 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(fmtHeading(heading), 0, r * 0.62);
  ctx.restore();
}

export function drawPanel(ctx, f, light) {
  const W = CFG.viewW;
  const H = CFG.viewH;
  const panelY = H - 132;
  // Panel shelf.
  ctx.save();
  const pg = ctx.createLinearGradient(0, panelY, 0, H);
  pg.addColorStop(0, '#1c1f26');
  pg.addColorStop(1, '#0b0d11');
  ctx.fillStyle = pg;
  ctx.fillRect(0, panelY, W, H - panelY);
  ctx.fillStyle = 'rgba(255,201,60,0.25)';
  ctx.fillRect(0, panelY, W, 2);
  ctx.restore();

  const r = 46;
  const y = panelY + 66;
  attitude(ctx, 120, y, r, f);
  dial(ctx, 250, y, r, 'ALT m', String(Math.round(f.y)), {
    needleAngle: -120 + (f.y % 1000) / 1000 * 360,
  });
  dial(ctx, 380, y, r, 'SPD m/s', String(Math.round(f.speed)), {
    needleAngle: -120 + clamp(f.speed / 120, 0, 1) * 240,
    needleColor: f.stall ? '#ff5a4a' : '#ffb02e',
  });
  compassDial(ctx, 510, y, r, f.heading);
  dial(ctx, 640, y, r, 'VSI m/s', (f.verticalSpeed >= 0 ? '+' : '') + f.verticalSpeed.toFixed(0), {
    needleAngle: clamp(f.verticalSpeed / 15, -1, 1) * 120,
  });
  dial(ctx, 770, y, r, 'FUEL', `${Math.round(f.fuel)}%`, {
    needleAngle: -120 + clamp(f.fuel / 100, 0, 1) * 240,
    needleColor: f.fuel < 20 ? '#ff5a4a' : '#7ddc8a',
  });
  // Throttle + flaps + gear readout, right of the dials.
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8dcc0';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('THR', 860, y - 28);
  ctx.fillText('FLAPS', 860, y + 2);
  ctx.fillText('GEAR', 860, y + 32);
  // Throttle bar.
  ctx.fillStyle = '#241d10';
  ctx.fillRect(920, y - 40, 150, 14);
  ctx.fillStyle = '#ffb02e';
  ctx.fillRect(920, y - 40, 150 * f.throttle, 14);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(`${Math.round(f.throttle * 100)}%`, 1080, y - 28);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(f.flaps === 0 ? 'UP' : f.flaps === 1 ? '1/2' : 'FULL', 920, y + 4);
  ctx.fillStyle = f.gearDown ? '#7ddc8a' : '#ff5a4a';
  ctx.fillText(f.gearDown ? 'DOWN' : 'UP', 920, y + 34);
  ctx.restore();
}

// Top HUD: heading tape, big ALT/SPD readouts, leg + score.
export function drawHud(ctx, f, light) {
  const W = CFG.viewW;
  ctx.save();
  // Heading tape.
  ctx.fillStyle = 'rgba(8,12,20,0.55)';
  ctx.fillRect(W / 2 - 260, 10, 520, 34);
  ctx.strokeStyle = 'rgba(255,201,60,0.6)';
  ctx.strokeRect(W / 2 - 260, 10, 520, 34);
  ctx.fillStyle = '#e8dcc0';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 15) {
    const h = Math.round(f.heading + d);
    const x = W / 2 + d * 3.4;
    const label = d % 30 === 0 ? fmtHeading(h) : '·';
    ctx.fillText(label, x, 32);
  }
  // Centre caret + heading.
  ctx.fillStyle = '#ffc93c';
  ctx.beginPath();
  ctx.moveTo(W / 2, 44);
  ctx.lineTo(W / 2 - 6, 52);
  ctx.lineTo(W / 2 + 6, 52);
  ctx.closePath();
  ctx.fill();
  // Big readouts, left and right.
  ctx.textAlign = 'left';
  ctx.font = 'bold 26px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`ALT ${String(Math.round(f.y)).padStart(4, ' ')} m`, 18, 40);
  ctx.fillText(`SPD ${String(Math.round(f.speed * 3.6)).padStart(3, ' ')} km/h`, 18, 70);
  ctx.textAlign = 'right';
  ctx.fillText(`HDG ${fmtHeading(f.heading)}°`, W - 18, 40);
  ctx.fillText(`SCORE ${f.score}`, W - 18, 70);
  // Leg banner.
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(`LEG ${f.leg + 1}/5 — ${legName(f)}`, W / 2, 78);
  // Messages, newest last.
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#cfe8ff';
  f.messages.slice(-2).forEach((m, i) => {
    ctx.fillText(m, W / 2, 100 + i * 18);
  });
  // Stall warning.
  if (f.stall) {
    const blink = Math.sin(f.timeSec * 12) > 0;
    if (blink) {
      ctx.fillStyle = '#ff3b30';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('⚠ STALL — NOSE DOWN, FULL POWER', W / 2, 150);
    }
  }
  // Damage bar.
  if (f.damage > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff5a4a';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`DAMAGE ${Math.round(f.damage)}%`, 18, 100);
  }
  ctx.restore();
}

// Minimap: top-down view of the course, runway, rings and the plane.
export function drawMinimap(ctx, f) {
  const W = CFG.viewW;
  const mw = 210;
  const mh = 150;
  const mx = W - mw - 14;
  const my = 92;
  const scale = mh / 15000; // world z 0..15000 -> map height
  const toMap = (x, z) => [mx + mw / 2 + (x - 0) * scale, my + mh - (z + 500) * scale];
  ctx.save();
  ctx.fillStyle = 'rgba(8,14,22,0.72)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = 'rgba(255,201,60,0.7)';
  ctx.strokeRect(mx, my, mw, mh);
  // Sea east, land west.
  ctx.fillStyle = 'rgba(27,106,138,0.55)';
  const seaX = toMap(CFG.seaEast, 0)[0];
  ctx.fillRect(seaX, my, mx + mw - seaX, mh);
  // Volcano.
  const [vx, vy] = toMap(CFG.volcano.x, CFG.volcano.z);
  ctx.fillStyle = 'rgba(122,106,88,0.9)';
  ctx.beginPath();
  ctx.arc(vx, vy, 9, 0, Math.PI * 2);
  ctx.fill();
  // Runway.
  const [rx0, rz0] = toMap(CFG.runway.x, CFG.runway.z0);
  const [rx1, rz1] = toMap(CFG.runway.x, CFG.runway.z1);
  ctx.strokeStyle = '#e8e4d8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(rx0, rz0);
  ctx.lineTo(rx1, rz1);
  ctx.stroke();
  // Clinic pad.
  const [px, py] = toMap(CFG.pad.x, CFG.pad.z);
  ctx.strokeStyle = '#ff5a5a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.stroke();
  // Rings: gold next, blue upcoming, green done.
  const all = [
    ...CFG.rings.map((r, i) => ({ ...r, done: i < f.ringsPassed, next: f.leg === 1 && i === f.ringsPassed })),
    ...CFG.returnRings.map((r, i) => ({ ...r, done: i < f.returnPassed, next: f.leg === 3 && i === f.returnPassed })),
  ];
  for (const r of all) {
    const [x, y] = toMap(r.x, r.z);
    ctx.fillStyle = r.done ? '#3ddc84' : r.next ? '#ffc93c' : '#4fc3f7';
    ctx.beginPath();
    ctx.arc(x, y, r.next ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // The plane.
  const [fx, fy] = toMap(f.x, f.z);
  ctx.save();
  ctx.translate(fx, fy);
  ctx.rotate(f.heading * DEG);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#e8dcc0';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MAP', mx + 6, my + 12);
  ctx.restore();
}

// Title screen: the whole pitch in one frame.
export function drawTitle(ctx, f) {
  const W = CFG.viewW;
  const H = CFG.viewH;
  ctx.save();
  ctx.fillStyle = 'rgba(6,10,24,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SENJA RESCUE', W / 2, 190);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('Volcano Medevac — a STOL sortie at dusk', W / 2, 232);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#cfe8ff';
  ctx.fillText('Take off from runway 36 · thread five gold rings · pick up the patient', W / 2, 300);
  ctx.fillText('at the clinic gate · fly three rings home · land before dark, low on fuel.', W / 2, 324);
  ctx.fillText('Watch the stall speed — below it the wing quits. Mind the squall band.', W / 2, 348);
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = '#e8dcc0';
  ctx.fillText('W/S throttle · ←/→ bank · ↑/↓ pitch · F flaps · G gear · C cockpit · M sound', W / 2, 410);
  ctx.fillText('Mouse drag steers too · wheel = throttle · R restarts after a crash', W / 2, 434);
  // Start button.
  ctx.fillStyle = '#e86a2c';
  ctx.fillRect(W / 2 - 130, 480, 260, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('FLY THE SORTIE', W / 2, 516);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#8fa8c8';
  ctx.fillText('Merpati-7 STOL · original game · no network · sound is synthesised', W / 2, 580);
  ctx.restore();
}

// Crash / finish debrief.
export function drawDebrief(ctx, f) {
  const W = CFG.viewW;
  const H = CFG.viewH;
  ctx.save();
  ctx.fillStyle = 'rgba(6,10,24,0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  if (f.crashed) {
    ctx.fillStyle = '#ff5a4a';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText('CRASHED', W / 2, 200);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(f.crashReason, W / 2, 244);
  } else {
    ctx.fillStyle = '#3ddc84';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText('SORTIE COMPLETE', W / 2, 200);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText('Patient delivered. The clinic lights are on because you flew.', W / 2, 244);
  }
  ctx.font = 'bold 30px monospace';
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(`SCORE ${f.finalScore}`, W / 2, 320);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#cfe8ff';
  const td = f.touchdown;
  ctx.fillText(
    `Rings ${f.ringsPassed + f.returnPassed}/8 · Pickup ${f.pickedUp ? 'YES' : 'NO'} · Time ${Math.round(f.timeSec)}s`,
    W / 2, 360,
  );
  if (td) {
    ctx.fillText(
      `Touchdown ${td.vsi} m/s · centreline ${td.centerline} m · landing ${td.points} pts`,
      W / 2, 388,
    );
  }
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Press R to fly again', W / 2, 460);
  ctx.restore();
}
