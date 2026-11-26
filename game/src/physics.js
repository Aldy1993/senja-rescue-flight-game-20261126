// Senja Rescue — flight model and mission state.
// Arcade flight with real bones: lift grows with speed squared, below
// stall speed the wing quits and the nose drops, drag grows with speed
// squared, flaps trade speed for lift, and a hard touchdown hurts.
// The mission is a five-leg medevac sortie: take off, thread five rings,
// pick up the patient at the clinic gate, fly three rings home, and land.

import { CFG, LEGS } from './config.js';
import { groundHeight, weatherAt } from './world.js';

const G = 9.81;
const DEG = Math.PI / 180;

export function newFlight() {
  return {
    // Position and attitude.
    x: CFG.runway.x,
    y: 0,
    z: 240,
    heading: 0, // degrees, 0 = north (+z)
    pitch: 0, // degrees, positive = nose up
    roll: 0, // degrees, positive = bank right
    speed: 0, // m/s
    throttle: 0,
    flaps: 0, // 0, 1, 2
    gearDown: true,
    // Inputs, set by input.js each frame (-1..1).
    pitchIn: 0,
    rollIn: 0,
    // Condition.
    fuel: CFG.fuelCapacity,
    damage: 0,
    onGround: true,
    verticalSpeed: 0,
    gForce: 1,
    stall: false,
    // Mission.
    leg: 0,
    ringsPassed: 0,
    returnPassed: 0,
    pickedUp: false,
    score: 0,
    ringsBonus: 0,
    timeSec: 0,
    messages: [],
    // Landing judgement, filled on touchdown.
    touchdown: null,
    crashed: false,
    crashReason: '',
    finished: false,
    finalScore: 0,
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapDeg(a) {
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return a;
}

function stallSpeed(f) {
  return f.flaps === 2 ? CFG.stallFlap : f.flaps === 1 ? 46 : CFG.stallClean;
}

// Steer the nose toward a target: returns roll/pitch inputs in -1..1.
// Used by the demo autopilot and by nothing else.
export function steerToward(f, tx, ty, tz, wantSpeed) {
  const dx = tx - f.x;
  const dz = tz - f.z;
  const wantHeading = Math.atan2(dx, dz) / DEG;
  const err = wrapDeg(wantHeading - f.heading);
  const roll = clamp(err / 30, -1, 1);
  const dy = ty - f.y;
  const dist = Math.hypot(dx, dz);
  const wantPitch = clamp(Math.atan2(dy, Math.max(dist, 50)) / DEG, -12, 14);
  const pitch = clamp((wantPitch - f.pitch) / 8, -1, 1);
  const speedErr = wantSpeed - f.speed;
  return { roll, pitch, throttle: clamp(0.55 + speedErr * 0.02, 0.2, 1) };
}

// One fixed step. dt is seconds (the loop calls this at 60 Hz).
export function stepFlight(f, dt) {
  if (f.crashed || f.finished) return;
  f.timeSec += dt;
  const w = weatherAt(f.x, f.z, f.timeSec);

  // --- Throttle and speed ---
  const thrust = f.throttle * CFG.thrustAccel * Math.max(0.25, 1 - f.speed / 170);
  let drag = CFG.dragK * f.speed * f.speed;
  if (f.gearDown) drag += CFG.gearDrag * f.speed * f.speed;
  if (f.flaps) drag += CFG.flapDrag * f.flaps * f.speed * f.speed;
  f.speed += (thrust - drag) * dt;
  if (f.speed < 0) f.speed = 0;

  // --- Attitude: inputs move toward targets, authority grows with speed ---
  const authority = clamp(f.speed / 60, 0.25, 1);
  const targetRoll = f.rollIn * CFG.maxBankDeg * authority;
  f.roll += clamp(targetRoll - f.roll, -90 * dt, 90 * dt);
  const targetPitch = f.pitchIn * CFG.maxPitchDeg * authority;
  f.pitch += clamp(targetPitch - f.pitch, -45 * dt, 45 * dt);

  // --- Turn: banked lift turns the nose, coordinated ---
  const turnRate = (G * Math.tan(f.roll * DEG)) / Math.max(f.speed, 20); // rad/s
  f.heading = wrapDeg(f.heading + (turnRate / DEG) * dt);

  // --- Lift and vertical speed ---
  const vStall = stallSpeed(f);
  const liftFactor = clamp((f.speed * f.speed) / (vStall * vStall), 0, 1.25);
  f.stall = f.speed < vStall && !f.onGround;
  let vy = f.speed * Math.sin(f.pitch * DEG) * liftFactor;
  if (f.stall) {
    // The wing quits: sink, nose drops, buffet.
    vy -= (vStall - f.speed) * 0.55;
    f.pitch -= 14 * dt;
    f.roll += Math.sin(f.timeSec * 13) * 6 * dt;
  }
  // Turbulence in the squall band shakes the nose.
  if (w.turbulence > 0.3 && !f.onGround) {
    f.pitch += Math.sin(f.timeSec * 9.1) * w.turbulence * 2.4 * dt;
    f.roll += Math.sin(f.timeSec * 7.7 + 2) * w.turbulence * 3.2 * dt;
  }
  // Clamp the climb so full power at low speed cannot rocket away.
  vy = clamp(vy, -30, CFG.climbRateMax + 6);
  f.verticalSpeed = vy;
  f.gForce = 1 + Math.abs(Math.tan(f.roll * DEG)) * 0.6;

  // --- Move ---
  const hRad = f.heading * DEG;
  const vx = Math.sin(hRad) * f.speed + w.windX * 0.4;
  const vz = Math.cos(hRad) * f.speed + w.windZ * 0.4;
  f.x += vx * dt;
  f.z += vz * dt;
  f.y += vy * dt;

  // --- Fuel ---
  f.fuel -= f.throttle * CFG.fuelBurn * dt;
  if (f.fuel <= 0) {
    f.fuel = 0;
    f.throttle = Math.min(f.throttle, 0.25); // flameout: idle only
    if (!f.messages.includes('FUEL EMPTY — gliding')) f.messages.push('FUEL EMPTY — gliding');
  } else if (f.fuel < 20 && !f.messages.includes('LOW FUEL')) {
    f.messages.push('LOW FUEL — 20 units left');
  }

  // --- Ground ---
  const g = groundHeight(f.x, f.z);
  const rw = CFG.runway;
  const onRunway = Math.abs(f.x - rw.x) < rw.width / 2 + 4
    && f.z > rw.z0 - 40 && f.z < rw.z1 + 40;
  if (f.y <= g + 0.5) {
    const touchdownVsi = f.verticalSpeed;
    f.y = g + 0.5;
    f.onGround = true;
    if (!f.crashed) {
      if (onRunway && g < 2) {
        // Runway landing or takeoff roll.
        if (f.leg === 4 && !f.touchdown && Math.abs(touchdownVsi) > 0.5) {
          judgeLanding(f, touchdownVsi);
        }
        if (f.speed < 6 && f.leg === 4 && f.touchdown) {
          finishFlight(f);
        }
        // Rolling friction on the ground.
        f.speed = Math.max(0, f.speed - 9 * dt);
      } else if (f.speed > 25 || Math.abs(touchdownVsi) > 6) {
        crash(f, onRunway ? 'Ran off the runway' : 'Hit the terrain');
      } else {
        // Gentle arrival somewhere soft: survivable, but the sortie ends.
        crash(f, 'Forced landing away from the runway');
      }
    }
    f.verticalSpeed = 0;
  } else {
    f.onGround = false;
  }
  // Liftoff: once the wheels leave the ground above rotation speed,
  // the takeoff leg is done. (Checked here, not in the ground block:
  // the climb lifts the plane clear in the same step the nose rises,
  // so the ground block never sees the rotation moment.)
  if (f.leg === 0 && !f.onGround && f.speed > CFG.rotateSpeed) {
    f.leg = 1;
    f.messages.push('AIRBORNE — climb to the rings');
  }
  // Ditching in the sea.
  if (f.y < 0.5 && !f.onGround && !f.crashed) crash(f, 'Ditched in the sea');

  // --- Mission progress ---
  checkRings(f);
  // Keep the message list short; the HUD shows the last two.
  if (f.messages.length > 6) f.messages.splice(0, f.messages.length - 6);
}

function ringDistance(f, ring) {
  return Math.hypot(f.x - ring.x, f.y - ring.y, f.z - ring.z);
}

function checkRings(f) {
  if (f.leg === 1) {
    const ring = CFG.rings[f.ringsPassed];
    if (ring && ringDistance(f, ring) < ring.r + 14) {
      f.ringsPassed += 1;
      f.score += CFG.ringPoints;
      f.ringsBonus += CFG.ringPoints;
      f.messages.push(`RING ${f.ringsPassed}/5  +${CFG.ringPoints}`);
      if (f.ringsPassed === CFG.rings.length) {
        f.leg = 2;
        f.messages.push('ALL RINGS — slow for the clinic gate');
      }
    }
  } else if (f.leg === 2) {
    const p = CFG.pad;
    if (Math.hypot(f.x - p.x, f.y - p.y, f.z - p.z) < p.r + 10) {
      f.pickedUp = true;
      f.score += CFG.pickupPoints;
      f.leg = 3;
      f.messages.push(`PATIENT ABOARD  +${CFG.pickupPoints} — fly home`);
    }
  } else if (f.leg === 3) {
    const ring = CFG.returnRings[f.returnPassed];
    if (ring && ringDistance(f, ring) < ring.r + 14) {
      f.returnPassed += 1;
      f.score += CFG.ringPoints;
      f.ringsBonus += CFG.ringPoints;
      f.messages.push(`HOME RING ${f.returnPassed}/3  +${CFG.ringPoints}`);
      if (f.returnPassed === CFG.returnRings.length) {
        f.leg = 4;
        f.messages.push('FINAL — gear down, land on runway 36');
      }
    }
  }
}

function judgeLanding(f, vsi) {
  const quality = clamp(1 - Math.abs(Math.abs(vsi) - 2) / 6, 0, 1);
  const centerline = Math.abs(f.x - CFG.runway.x);
  const centerBonus = centerline < 10 ? CFG.centerlineBonus : centerline < 20 ? 100 : 0;
  const points = Math.round(CFG.landingQualityMax * quality) + centerBonus;
  f.touchdown = { vsi: Math.round(vsi * 10) / 10, centerline: Math.round(centerline), points };
  f.score += CFG.landingBase + points;
  f.damage += Math.max(0, (Math.abs(vsi) - 4) * 8);
  f.messages.push(
    `TOUCHDOWN ${vsi.toFixed(1)} m/s — ${points} pts${centerBonus ? ' (centreline)' : ''}`,
  );
}

function finishFlight(f) {
  f.finished = true;
  const timeBonus = Math.max(0, Math.round((480 - f.timeSec) * 1.5));
  f.score += timeBonus + CFG.stopBonus;
  f.finalScore = f.score;
  f.messages.push(`SORTIE COMPLETE — time bonus +${timeBonus}, stopped +${CFG.stopBonus}`);
}

function crash(f, reason) {
  f.crashed = true;
  f.crashReason = reason;
  f.damage = 100;
  f.finalScore = f.score;
}

export function legName(f) {
  return LEGS[Math.min(f.leg, LEGS.length - 1)];
}
