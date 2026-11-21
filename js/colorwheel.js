// Color wheel: a hue ring around a saturation / brightness square, plus color ideas that go with it.
import { el } from './ui.js';
import { mixPaint } from './brushes.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
export function hexToHsv(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, mx ? d / mx : 0, mx];
}
export function hsvToHex(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/**
 * A color wheel.
 * onInput(hex) fires while dragging, onChange(hex) when you let go or click a swatch.
 * Returns an element with .set(hex) to update it from outside.
 */
export function colorWheel({ value = '#2a2a2c', size = 210, onInput, onChange, ideas = true }) {
  let [h, s, v] = hexToHsv(value);
  const dpr = devicePixelRatio || 1, ring = Math.max(14, size * 0.1), R = size / 2, inner = R - ring - 4, half = inner * Math.SQRT1_2;
  const cv = el('canvas', { class: 'cw-canvas', width: size * dpr, height: size * dpr, style: { width: size + 'px', height: size + 'px' }, 'aria-label': 'Color wheel. Drag the ring for the color, the square for how strong and how light it is.' });
  const g = cv.getContext('2d');
  const now = el('span', { class: 'cw-now' }), hexL = el('span', { class: 'cw-hex' });
  const ideasBox = el('div', { class: 'cw-ideas' });
  const cur = () => hsvToHex(h, s, v);
  const draw = () => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, size, size);
    // hue ring
    const cg = g.createConicGradient(-Math.PI / 2, R, R);
    for (let i = 0; i <= 12; i++) cg.addColorStop(i / 12, `hsl(${i * 30},100%,50%)`);
    g.fillStyle = cg; g.beginPath(); g.arc(R, R, R - 1, 0, 7); g.arc(R, R, R - ring, 0, 7, true); g.fill();
    // saturation (left to right) and brightness (bottom to top) square
    const x0 = R - half, y0 = R - half, w = half * 2;
    g.fillStyle = hsvToHex(h, 1, 1); g.fillRect(x0, y0, w, w);
    const gw = g.createLinearGradient(x0, 0, x0 + w, 0); gw.addColorStop(0, '#fff'); gw.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gw; g.fillRect(x0, y0, w, w);
    const gb = g.createLinearGradient(0, y0, 0, y0 + w); gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, '#000'); g.fillStyle = gb; g.fillRect(x0, y0, w, w);
    // markers
    const a = (h - 90) * Math.PI / 180, mr = R - ring / 2;
    const mark = (x, y, r) => { g.lineWidth = 2.5; g.strokeStyle = '#000'; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke(); };
    mark(R + Math.cos(a) * mr, R + Math.sin(a) * mr, ring / 2 - 1);
    mark(x0 + s * w, y0 + (1 - v) * w, 6);
    const c = cur(); now.style.background = c; hexL.textContent = c;
  };
  const swatch = (c, title) => el('button', { class: 'sw', style: { background: c }, title: title + ' ' + c, onclick: () => { [h, s, v] = hexToHsv(c); draw(); fillIdeas(); onChange?.(c); } });
  const fillIdeas = () => {
    if (!ideas) return;
    ideasBox.innerHTML = '';
    const c = cur(), row = (label, list) => el('div', { class: 'cw-row' }, el('span', { class: 'cw-lbl' }, label), ...list);
    ideasBox.append(
      row('Lighter / darker', [-0.6, -0.4, -0.2, 0.2, 0.4, 0.6].map(k => swatch(k < 0 ? mixPaint(c, '#ffffff', -k) : hsvToHex(h, s, v * (1 - k)), k < 0 ? 'Lighter' : 'Darker'))),
      row('Goes with it', [[180, 'Opposite'], [-30, 'Next to it'], [30, 'Next to it'], [120, 'Triad'], [240, 'Triad'], [150, 'Split'], [210, 'Split']].map(([d, t]) => swatch(hsvToHex((h + d + 360) % 360, s, v), t))),
      row('Softer', [0.15, 0.3, 0.5, 0.7].map(k => swatch(hsvToHex(h, s * (1 - k), v + (1 - v) * k * 0.3), 'Less strong'))));
  };
  let drag = null;
  const pick = e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag === 'ring') h = (Math.atan2(y - R, x - R) * 180 / Math.PI + 90 + 360) % 360;
    else { s = clamp((x - (R - half)) / (half * 2), 0, 1); v = clamp(1 - (y - (R - half)) / (half * 2), 0, 1); }
    draw(); onInput?.(cur());
  };
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left - R, y = e.clientY - r.top - R, d = Math.hypot(x, y);
    if (d > R) return;
    drag = d > R - ring - 3 ? 'ring' : 'square';
    try { cv.setPointerCapture(e.pointerId); } catch (_) { }
    pick(e); e.preventDefault();
  });
  cv.addEventListener('pointermove', e => { if (drag) pick(e); });
  const end = () => { if (!drag) return; drag = null; fillIdeas(); onChange?.(cur()); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  const box = el('div', { class: 'cw' }, cv, el('div', { class: 'cw-info' }, now, hexL), ideasBox);
  box.set = hex => { if (!/^#[0-9a-f]{6}$/i.test(hex)) return; const nh = hexToHsv(hex); if (nh[1] === 0 || nh[2] === 0) nh[0] = h; [h, s, v] = nh; draw(); fillIdeas(); };
  draw(); fillIdeas();
  return box;
}
