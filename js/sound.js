// Book sounds made in code: paper swish when a page turns, a soft flap when it lands,
// and a heavier board sound for opening and closing the cover. Nothing is downloaded.
let ctx = null, noise = null, master = null, on = true, vol = 0.7;

export function setSound({ enabled, volume } = {}) {
  if (enabled != null) on = !!enabled;
  if (volume != null) vol = volume;
  if (master) master.gain.value = vol;
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = n.getChannelData(0);
    let b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = b * 0.6 + w * 0.4; d[i] = b; } // slightly soft noise, like paper
    noise = n;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// filtered noise with a sweep and a rise-and-fall envelope
function burst(t, dur, { type = 'bandpass', f0, f1 = f0, q = 0.8, peak, attack = 0.3 }) {
  const s = ctx.createBufferSource(); s.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.max(0.005, dur * attack));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 1.5, dur + 0.05);
}
function thump(t, freq, dur, peak) {
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}

// a page starts turning (dur is the turn time in seconds)
export function turnSound(dur, cover) {
  if (!on || !ac()) return;
  const t = ctx.currentTime + 0.005;
  if (cover) { // the board lifting: lower, slower rub
    const d = Math.max(0.25, Math.min(0.9, dur * 0.7));
    burst(t, d, { type: 'bandpass', f0: 380, f1: 1100, q: 0.9, peak: 0.16, attack: 0.4 });
    burst(t + 0.02, d * 0.6, { type: 'highpass', f0: 2500, f1: 3500, q: 0.5, peak: 0.03, attack: 0.5 });
    return;
  }
  const d = Math.max(0.1, Math.min(0.65, dur * 0.6)), r = 0.85 + Math.random() * 0.3;
  burst(t, d, { type: 'bandpass', f0: 900 * r, f1: 3200 * r, q: 0.7, peak: 0.2, attack: 0.35 });
  burst(t + d * 0.15, d * 0.7, { type: 'highpass', f0: 4200, f1: 6500, q: 0.4, peak: 0.05, attack: 0.3 });
}
// the page or cover lands
export function landSound(cover) {
  if (!on || !ac()) return;
  const t = ctx.currentTime + 0.005;
  if (cover) {
    thump(t, 78, 0.28, 0.55);
    burst(t, 0.16, { type: 'lowpass', f0: 900, f1: 250, q: 0.7, peak: 0.35, attack: 0.05 });
    return;
  }
  burst(t, 0.09, { type: 'lowpass', f0: 1600, f1: 500, q: 0.6, peak: 0.16, attack: 0.08 });
}
