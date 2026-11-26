// Senja Rescue — boot, game loop and screens.
// The loop steps the flight model at a fixed 60 Hz and renders every
// animation frame. Screens: title, flying (chase or cockpit view),
// paused, and the debrief after a crash or a completed sortie.
// ?shot=<name> freezes a staged state for screenshots; ?demo=1 flies
// the sortie hands-off until the player takes the controls.
//
// The camera sits at the aircraft's nose in both views: the chase view
// draws the plane sprite over it, the cockpit view draws the lit panel
// and the windscreen frame instead. One camera, two presentations.

import { CFG } from './config.js';
import { newFlight, stepFlight } from './physics.js';
import { renderWorld, drawPlane } from './render.js';
import { drawPanel, drawHud, drawMinimap, drawTitle, drawDebrief } from './instruments.js';
import { newAudio, audioUnlock, audioTick, audioRing, audioStall, audioTouchdown, audioToggleMute } from './audio.js';
import { newInput, bindInput, readControls } from './input.js';
import { parseShot, stageShot, demoPilot } from './shots.js';
import { cloudField, villageLights, weatherAt, daylight } from './world.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = CFG.viewW * dpr;
  canvas.height = CFG.viewH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const flight = newFlight();
const audio = newAudio();
const input = newInput();
const clouds = cloudField();
const lights = villageLights();
const shot = parseShot();

let screen = 'title'; // title | fly | paused | over
let view = 'chase'; // chase | cockpit
let demo = shot.demo;
let lastRings = 0;
let lastStallBeep = 0;
let shotStaged = false;
let thudPlayed = false;

bindInput(input, canvas, () => {
  audioUnlock(audio);
  if (demo) demo = false; // any gesture takes over from the demo pilot
});

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function startSortie() {
  Object.assign(flight, newFlight());
  lastRings = 0;
  thudPlayed = false;
  screen = 'fly';
  demo = shot.demo;
  setStatus('Sortie started. Take off from runway 36.');
}

function togglePause() {
  if (screen === 'fly') screen = 'paused';
  else if (screen === 'paused') screen = 'fly';
}

// One fixed physics step plus its sights and sounds.
function tick(dt) {
  // The demo pilot drives the same inputs a player would; a human
  // gesture hands the controls back, so readControls runs only when
  // no demo is flying.
  if (demo) demoPilot(flight);
  else readControls(input, flight);
  // Edge-triggered toggles (C view, M mute) live on the key set.
  if (input.keys.has('KeyC') && !tick._cDown) {
    view = view === 'chase' ? 'cockpit' : 'chase';
  }
  tick._cDown = input.keys.has('KeyC');
  if (input.keys.has('KeyM') && !tick._mDown) {
    const muted = audioToggleMute(audio);
    flight.messages.push(muted ? 'SOUND OFF' : 'SOUND ON');
  }
  tick._mDown = input.keys.has('KeyM');
  stepFlight(flight, dt);
  audioTick(audio, flight);
  // Ring chime + touchdown thud on the events the step produced.
  const rings = flight.ringsPassed + flight.returnPassed;
  if (rings > lastRings) {
    audioRing(audio);
    lastRings = rings;
  }
  if (flight.stall && flight.timeSec - lastStallBeep > 0.9) {
    audioStall(audio);
    lastStallBeep = flight.timeSec;
  }
  if (flight.touchdown && !thudPlayed) {
    audioTouchdown(audio);
    thudPlayed = true;
  }
  if (!flight.touchdown) thudPlayed = false;
  if ((flight.crashed || flight.finished) && screen === 'fly') {
    screen = 'over';
    setStatus(flight.crashed ? `Crashed: ${flight.crashReason}` : `Sortie complete, score ${flight.finalScore}.`);
  }
}

function render() {
  const W = CFG.viewW;
  const H = CFG.viewH;
  ctx.clearRect(0, 0, W, H);
  const w = weatherAt(flight.x, flight.z, flight.timeSec);
  const renderState = { rain: w.rain };
  const t = CFG.dayStart + (flight.timeSec / CFG.dayLengthSec);
  const light = daylight(t % 1);

  if (screen === 'title') {
    // The title flies over the runway at golden hour behind the menu.
    renderWorld(ctx, flight, renderState, clouds, lights);
    drawPlane(ctx, flight, light);
    drawTitle(ctx, flight);
    return;
  }

  renderWorld(ctx, flight, renderState, clouds, lights);
  if (view === 'cockpit') {
    // Windscreen frame over the world, then the lit panel.
    ctx.save();
    ctx.fillStyle = '#0b0d11';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, 46);
    ctx.lineTo(W * 0.62, 130);
    ctx.lineTo(W * 0.38, 130);
    ctx.lineTo(0, 46);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(0, 0, 26, H);
    ctx.fillRect(W - 26, 0, 26, H);
    ctx.restore();
  } else {
    drawPlane(ctx, flight, light);
  }
  drawPanel(ctx, flight, light);
  drawHud(ctx, flight, light);
  drawMinimap(ctx, flight);
  if (screen === 'paused') {
    ctx.save();
    ctx.fillStyle = 'rgba(6,10,24,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.font = '18px sans-serif';
    ctx.fillText('Press P to keep flying', W / 2, H / 2 + 36);
    ctx.restore();
  }
  if (screen === 'over') drawDebrief(ctx, flight);
}

// Fixed-step loop. Pause/restart keys are read here, outside the
// accumulator, so they work while paused or on the debrief screen.
let last = performance.now();
let acc = 0;
let pDown = false;
let rDown = false;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (shot.shot && !shotStaged) {
    stageShot(flight, shot.shot);
    shotStaged = true;
    screen = 'fly';
    view = shot.shot === 'cockpit' ? 'cockpit' : 'chase';
  }
  const pHeld = input.keys.has('KeyP');
  if (pHeld && !pDown && (screen === 'fly' || screen === 'paused')) togglePause();
  pDown = pHeld;
  const rHeld = input.keys.has('KeyR');
  if (rHeld && !rDown && screen === 'over') startSortie();
  rDown = rHeld;

  if (screen === 'fly' && !shot.shot) {
    acc += dt;
    while (acc >= 1 / 60) {
      tick(1 / 60);
      acc -= 1 / 60;
    }
  }
  if (screen === 'title') {
    // Demo mode starts itself: the attract pilot flies the sortie
    // hands-off until a gesture takes over. Humans press Enter/click.
    if (demo) startSortie();
    // Title screen idles over the runway; Enter/click starts.
    if (input.pressed.includes('start')) startSortie();
    input.pressed.length = 0;
    flight.timeSec += dt * 0.2;
  }
  render();
  window.__game = {
    screen, view, leg: flight.leg, score: flight.score,
    speed: flight.speed, altitude: flight.y,
    x: flight.x, z: flight.z, heading: flight.heading,
    crashed: flight.crashed, finished: flight.finished,
    rings: flight.ringsPassed + flight.returnPassed,
    pickedUp: flight.pickedUp,
  };
  window.__shotReady = true;
  requestAnimationFrame(frame);
}

// Clicking the title button starts the sortie.
canvas.addEventListener('click', (e) => {
  if (screen !== 'title') return;
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * CFG.viewW;
  const y = ((e.clientY - r.top) / r.height) * CFG.viewH;
  if (x > CFG.viewW / 2 - 130 && x < CFG.viewW / 2 + 130 && y > 480 && y < 536) {
    audioUnlock(audio);
    startSortie();
  }
});

requestAnimationFrame(frame);
