// Senja Rescue — sound, synthesised live with WebAudio.
// No audio files, no network: an engine drone that follows the throttle,
// wind noise that follows speed, and short cues for rings, stall and
// touchdown. Everything is guarded: if the browser blocks audio, the
// game plays silent and nothing throws.

export function newAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    windSrc: null,
    windGain: null,
    windFilter: null,
    muted: false,
    started: false,
  };
}

function ensure(a) {
  if (a.ctx || a.muted) return false;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    a.ctx = new AC();
    a.master = a.ctx.createGain();
    a.master.gain.value = 0.5;
    a.master.connect(a.ctx.destination);
    // Engine: two detuned saws through a low-pass, pitch follows RPM.
    a.engineOsc = a.ctx.createOscillator();
    a.engineOsc.type = 'sawtooth';
    a.engineOsc.frequency.value = 55;
    a.engineOsc2 = a.ctx.createOscillator();
    a.engineOsc2.type = 'sawtooth';
    a.engineOsc2.frequency.value = 58;
    const lp = a.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    a.engineGain = a.ctx.createGain();
    a.engineGain.gain.value = 0;
    a.engineOsc.connect(lp);
    a.engineOsc2.connect(lp);
    lp.connect(a.engineGain);
    a.engineGain.connect(a.master);
    a.engineOsc.start();
    a.engineOsc2.start();
    // Wind: looped noise buffer through a band-pass.
    const len = a.ctx.sampleRate * 2;
    const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    a.windSrc = a.ctx.createBufferSource();
    a.windSrc.buffer = buf;
    a.windSrc.loop = true;
    a.windFilter = a.ctx.createBiquadFilter();
    a.windFilter.type = 'bandpass';
    a.windFilter.frequency.value = 500;
    a.windGain = a.ctx.createGain();
    a.windGain.gain.value = 0;
    a.windSrc.connect(a.windFilter);
    a.windFilter.connect(a.windGain);
    a.windGain.connect(a.master);
    a.windSrc.start();
    a.started = true;
    return true;
  } catch {
    return false;
  }
}

export function audioUnlock(a) {
  if (ensure(a) && a.ctx.state === 'suspended') a.ctx.resume().catch(() => {});
}

export function audioTick(a, f) {
  if (!a.started || a.muted) return;
  try {
    const rpm = 0.25 + f.throttle * 0.75;
    const t = a.ctx.currentTime;
    a.engineOsc.frequency.setTargetAtTime(52 + rpm * 68, t, 0.1);
    a.engineOsc2.frequency.setTargetAtTime(55 + rpm * 71, t, 0.1);
    a.engineGain.gain.setTargetAtTime(f.onGround ? 0.05 + rpm * 0.1 : 0.06 + rpm * 0.12, t, 0.1);
    const wind = Math.min(f.speed / 120, 1) * 0.16;
    a.windGain.gain.setTargetAtTime(wind, t, 0.2);
    a.windFilter.frequency.setTargetAtTime(300 + f.speed * 6, t, 0.2);
  } catch {
    // Audio is decoration; never let it break the frame.
  }
}

function blip(a, freq, dur, type, vol) {
  if (!a.started || a.muted) return;
  try {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.2, a.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.ctx.currentTime + dur);
    o.connect(g);
    g.connect(a.master);
    o.start();
    o.stop(a.ctx.currentTime + dur);
  } catch {
    // Ignore.
  }
}

export function audioRing(a) {
  blip(a, 880, 0.35, 'sine', 0.25);
  setTimeout(() => blip(a, 1320, 0.4, 'sine', 0.2), 90);
}

export function audioStall(a) {
  blip(a, 220, 0.18, 'square', 0.12);
}

export function audioTouchdown(a) {
  if (!a.started || a.muted) return;
  try {
    const len = a.ctx.sampleRate * 0.25;
    const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    const g = a.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(g);
    g.connect(a.master);
    src.start();
  } catch {
    // Ignore.
  }
}

export function audioToggleMute(a) {
  a.muted = !a.muted;
  if (a.master) a.master.gain.value = a.muted ? 0 : 0.5;
  return a.muted;
}
