// Senja Rescue — input: keyboard and mouse.
// Keyboard is the primary control (W/S throttle, arrows pitch and bank,
// F flaps, G gear, C cockpit view, M mute, P pause, R restart, Enter to
// start). The mouse steers by dragging and sets throttle with the wheel,
// and clicks the title button. All state lives here; main.js reads it.

export function newInput() {
  return {
    keys: new Set(),
    // Continuous controls, -1..1, read by the flight model.
    pitch: 0,
    roll: 0,
    // Mouse steering: target roll/pitch while dragging, eased toward 0.
    dragging: false,
    mouseRoll: 0,
    mousePitch: 0,
    wheelThrottle: null, // set by wheel events, consumed by main.js
    pressed: [], // one-shot keys consumed by main.js each frame
  };
}

const KEYMAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'throttleUp',
  KeyS: 'throttleDown',
  KeyF: 'flaps',
  KeyG: 'gear',
  KeyC: 'view',
  KeyM: 'mute',
  KeyP: 'pause',
  KeyR: 'restart',
  Enter: 'start',
  Space: 'start',
};

export function bindInput(input, canvas, onGesture) {
  window.addEventListener('keydown', (e) => {
    const name = KEYMAP[e.code];
    if (!name) return;
    e.preventDefault();
    if (!input.keys.has(e.code)) input.pressed.push(name);
    input.keys.add(e.code);
    if (onGesture) onGesture();
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.dragging = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    input.dragging = true;
    canvas.setPointerCapture(e.pointerId);
    if (onGesture) onGesture();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!input.dragging) return;
    const r = canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    input.mouseRoll = Math.max(-1, Math.min(1, nx));
    input.mousePitch = Math.max(-1, Math.min(1, -ny));
  });
  const endDrag = () => {
    input.dragging = false;
    input.mouseRoll = 0;
    input.mousePitch = 0;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    input.wheelThrottle = (input.wheelThrottle ?? 0) + (e.deltaY < 0 ? 0.08 : -0.08);
  }, { passive: false });
}

// Merge keyboard + mouse into the flight inputs for this frame.
export function readControls(input, f) {
  const k = input.keys;
  let pitch = 0;
  let roll = 0;
  if (k.has('ArrowUp')) pitch += 1;
  if (k.has('ArrowDown')) pitch -= 1;
  if (k.has('ArrowLeft')) roll -= 1;
  if (k.has('ArrowRight')) roll += 1;
  if (input.dragging) {
    pitch += input.mousePitch;
    roll += input.mouseRoll;
  }
  f.pitchIn = Math.max(-1, Math.min(1, pitch));
  f.rollIn = Math.max(-1, Math.min(1, roll));
  // Throttle: hold W/S, or the wheel nudge.
  if (k.has('KeyW')) f.throttle = Math.min(1, f.throttle + 0.9 / 60);
  if (k.has('KeyS')) f.throttle = Math.max(0, f.throttle - 0.9 / 60);
  if (input.wheelThrottle !== null) {
    f.throttle = Math.max(0, Math.min(1, f.throttle + input.wheelThrottle));
    input.wheelThrottle = null;
  }
  // One-shot keys.
  for (const name of input.pressed) {
    if (name === 'flaps') f.flaps = (f.flaps + 1) % 3;
    if (name === 'gear') f.gearDown = !f.gearDown;
  }
  const oneShots = input.pressed.slice();
  input.pressed.length = 0;
  return oneShots;
}
