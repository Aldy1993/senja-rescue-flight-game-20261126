// Senja Rescue — staged states for screenshots and the demo pilot.
// Screenshots must be real renders of the game's own code, so each shot
// is a real flight state: the world, the plane and the HUD are rendered
// by the same code the player sees. The demo pilot flies the whole
// sortie with the same steering the player uses, so a scripted run can
// prove the mission loop works end to end.
//
// Shot names (query ?shot=<name>&seed=<n>):
//   cover    golden-hour chase view, ring 3 ahead, volcano on the nose
//   cockpit  dusk cockpit view on final, runway lights ahead
//   storm    inside the squall band at night, rain and a gold ring
//   landing  night flare over the runway numbers, gear down
// ?demo=1 flies the sortie hands-off (attract mode, any key takes over).

import { CFG } from './config.js';
import { steerToward } from './physics.js';
import { groundHeight } from './world.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  return {
    shot: q.get('shot') || '',
    seed: Number(q.get('seed') || '7'),
    demo: q.get('demo') === '1',
  };
}

// Place the flight in a frozen, photogenic state for a screenshot.
// timeSec is set so the day cycle lands where the shot wants it.
export function stageShot(f, name) {
  const set = (patch) => Object.assign(f, patch);
  if (name === 'cover') {
    // Mid outbound leg, golden hour, climbing toward ring 3.
    set({
      x: 120, y: 330, z: 3950, heading: 8, pitch: 4, roll: -6,
      speed: 92, throttle: 0.78, flaps: 0, gearDown: false,
      leg: 1, ringsPassed: 2, timeSec: 30, onGround: false,
    });
  } else if (name === 'cockpit') {
    // Final approach at dusk, gear down, runway lights ahead.
    set({
      x: 6, y: 120, z: 1700, heading: 180, pitch: -3, roll: 2,
      speed: 62, throttle: 0.42, flaps: 2, gearDown: true,
      leg: 4, ringsPassed: 5, returnPassed: 3, pickedUp: true,
      timeSec: 120, onGround: false,
    });
  } else if (name === 'storm') {
    // In the squall band at night, rain streaking, next ring glowing.
    set({
      x: -350, y: 400, z: 6100, heading: 352, pitch: 2, roll: 10,
      speed: 88, throttle: 0.72, flaps: 0, gearDown: false,
      leg: 1, ringsPassed: 3, timeSec: 250, onGround: false,
    });
  } else if (name === 'landing') {
    // Night flare over the threshold, gear down, landing lights on.
    // Shot from a little higher and further back so the whole strip
    // reads instead of going edge-on under the nose.
    set({
      x: -4, y: 26, z: 1150, heading: 180, pitch: 6, roll: -2,
      speed: 52, throttle: 0.3, flaps: 2, gearDown: true,
      leg: 4, ringsPassed: 5, returnPassed: 3, pickedUp: true,
      timeSec: 330, onGround: false, score: 1750,
    });
  } else {
    return false;
  }
  f.verticalSpeed = 0;
  return true;
}

// Demo autopilot: pick the current target and steer toward it.
// Returns true while it is flying; main.js calls it before the physics.
export function demoPilot(f) {
  let target = null;
  let wantSpeed = 90;
  if (f.leg === 0) {
    // Takeoff roll, then climb straight ahead.
    if (f.onGround) {
      f.throttle = 1;
      f.pitchIn = f.speed > CFG.rotateSpeed ? 0.6 : 0;
      f.rollIn = 0;
      return true;
    }
    target = { x: 0, y: 320, z: 2400 };
  } else if (f.leg === 1) {
    const r = CFG.rings[f.ringsPassed];
    if (!r) return false;
    target = r;
  } else if (f.leg === 2) {
    target = CFG.pad;
    wantSpeed = 62;
  } else if (f.leg === 3) {
    const r = CFG.returnRings[f.returnPassed];
    if (!r) return false;
    target = r;
  } else if (f.leg === 4) {
    // Final: ride the extended centreline southbound (heading 180) and
    // descend on a terrain-aware glide to a touchdown near z=600.
    // The old code steered at the final fix as a point and orbited it
    // forever at ~220 m (turn radius ~330 m at 68 m/s, so the plane
    // never crossed z=2600 to switch targets); this controller holds
    // a heading and an altitude instead, so it cannot orbit.
    f.flaps = 2;
    f.gearDown = true;
    if (f.onGround) {
      // Touchdown made: cut the power and roll straight to a stop.
      // (Leaving the throttle up cancels the runway friction and the
      // plane runs off the south end still doing 46 m/s.)
      f.throttle = 0;
      f.pitchIn = 0;
      f.rollIn = 0;
      return true;
    }
    const tdZ = 600;
    const slopeAlt = Math.max(0, (f.z - tdZ) * 0.075); // ~4.3 deg glide
    // Hills north of the strip reach ~140 m: stay 45 m clear of the
    // ground under us and 600 m ahead, until the strip flattens.
    const gMax = Math.max(groundHeight(f.x, f.z), groundHeight(f.x, Math.max(f.z - 600, 0)));
    const floorAlt = gMax > 5 ? gMax + 45 : 0;
    const wantAlt = Math.max(slopeAlt, floorAlt);
    const wantHeading = 180 + clamp(f.x * 0.06, -25, 25);
    const hErr = ((wantHeading - f.heading + 540) % 360) - 180;
    f.rollIn = clamp(hErr / 25, -1, 1);
    let wantPitch;
    if (f.z <= 1800) {
      // Final segment: a steady -9 deg descent puts the wheels down
      // near z=600 with room to roll out (starting it at z=1500 left
      // the touchdown near z=200 and no stopping room). The strip
      // flattens below z=1500 and the plane is ~90 m up at z=1500,
      // 30 m clear of the hills north of it. Ease to -2.5 deg only
      // under 12 m so the touchdown is judged, not a slam. Stay
      // shallow while still off the centreline — the strip shoulders
      // are hills.
      wantPitch = f.y < 12 ? -2.5 : -9;
      if (Math.abs(f.x) > 80) wantPitch = Math.max(wantPitch, -2);
    } else {
      const altErr = wantAlt - f.y;
      wantPitch = clamp(altErr * 0.1, -10, 6);
    }
    f.pitchIn = clamp((wantPitch - f.pitch) / 8, -1, 1);
    const wantSpeed = f.z <= 1800 ? 54 : 62;
    // Baseline 0.35, not 0.55: at 0.55 thrust beats flap+gear drag
    // and the plane settles near 66 m/s instead of the target speed.
    f.throttle = clamp(0.35 + (wantSpeed - f.speed) * 0.04, 0.1, 1);
    return true;
  }
  if (!target) return false;
  const c = steerToward(f, target.x, target.y, target.z, wantSpeed);
  f.rollIn = c.roll;
  f.pitchIn = c.pitch;
  f.throttle = Math.max(0, Math.min(1, c.throttle));
  return true;
}
