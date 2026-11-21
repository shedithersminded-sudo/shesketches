import { FX_PRESETS, applyFx } from './stickerfx.js';
// Sticker factory (cut things out of pictures) and the makers screen.
import { getBlob } from './db.js';
import { addAsset, assetGrid, importFiles } from './library.js';
import { paperTile } from './paper.js';
import { canvasBlob } from './render.js';
import { MAKERS, defaultsOf, runMaker } from './makers.js';
import { el, modal, slider, select, colorInput, check, pickFiles, toast } from './ui.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const MAXS = 4096;

// ---------- mask tools ----------
function colorDist(d, i, c) { const dr = d[i] - c[0], dg = d[i + 1] - c[1], db = d[i + 2] - c[2]; return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.7; }

// find up to two background colors from the border (handles fake checkerboards)
function borderColors(d, w, h) {
  const s = [];
  const step = Math.max(1, Math.floor((w + h) / 400));
  for (let x = 0; x < w; x += step) { s.push(x * 4, ((h - 1) * w + x) * 4); }
  for (let y = 0; y < h; y += step) { s.push((y * w) * 4, (y * w + w - 1) * 4); }
  const px = s.map(i => [d[i], d[i + 1], d[i + 2], d[i + 3]]).filter(p => p[3] > 10);
  if (!px.length) return [];
  let a = px[0], b = px[px.length >> 1];
  for (let it = 0; it < 8; it++) {
    const A = [0, 0, 0, 0], B = [0, 0, 0, 0];
    for (const p of px) { const da = Math.abs(p[0] - a[0]) + Math.abs(p[1] - a[1]) + Math.abs(p[2] - a[2]), db = Math.abs(p[0] - b[0]) + Math.abs(p[1] - b[1]) + Math.abs(p[2] - b[2]); const T = da <= db ? A : B; T[0] += p[0]; T[1] += p[1]; T[2] += p[2]; T[3]++; }
    if (A[3]) a = [A[0] / A[3], A[1] / A[3], A[2] / A[3]]; if (B[3]) b = [B[0] / B[3], B[1] / B[3], B[2] / B[3]];
  }
  const diff = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  return diff < 20 ? [a] : [a, b];
}

function floodRemove(d, mask, w, h, seeds, cols, tol, soft) {
  const seen = new Uint8Array(w * h), st = [...seeds];
  const near = i => { let m = 1e9; for (const c of cols) m = Math.min(m, colorDist(d, i * 4, c)); return m; };
  while (st.length) {
    const p = st.pop(); if (seen[p]) continue; seen[p] = 1;
    const dd = near(p);
    if (dd > tol + soft) continue;
    const a = dd <= tol ? 0 : Math.round(255 * (dd - tol) / Math.max(1, soft));
    if (a < mask[p]) mask[p] = a;
    if (dd > tol) continue; // soft edge pixels do not spread
    const x = p % w, y = (p / w) | 0;
    if (x > 0) st.push(p - 1); if (x < w - 1) st.push(p + 1); if (y > 0) st.push(p - w); if (y < h - 1) st.push(p + w);
  }
}

function removeIslands(mask, w, h, minArea) {
  const lab = new Int32Array(w * h).fill(-1); const sizes = [];
  for (let i = 0; i < w * h; i++) {
    if (mask[i] < 128 || lab[i] >= 0) continue;
    const id = sizes.length, st = [i]; let n = 0; lab[i] = id;
    while (st.length) { const p = st.pop(); n++; const x = p % w, y = (p / w) | 0; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && lab[q] < 0 && mask[q] >= 128) { lab[q] = id; st.push(q); } }
    sizes.push(n);
  }
  for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && sizes[lab[i]] < minArea) mask[i] = 0;
}
function fillHoles(mask, w, h, maxArea) {
  // transparent pockets fully inside the object get filled back
  const lab = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) {
    if (mask[i] >= 128 || lab[i] >= 0) continue;
    const st = [i], list = []; lab[i] = 1; let edge = false;
    while (st.length) { const p = st.pop(); list.push(p); const x = p % w, y = (p / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && lab[q] < 0 && mask[q] < 128) { lab[q] = 1; st.push(q); } }
    if (!edge && list.length < maxArea) for (const p of list) mask[p] = 255;
  }
}

// distance (in px) from every pixel to the nearest solid pixel. Two-pass chamfer.
function distanceField(mask, w, h) {
  const INF = 1e9, D = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) D[i] = mask[i] >= 128 ? 0 : INF;
  const a = 1, b = 1.4142;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let v = D[i]; if (x > 0) v = Math.min(v, D[i - 1] + a); if (y > 0) { v = Math.min(v, D[i - w] + a); if (x > 0) v = Math.min(v, D[i - w - 1] + b); if (x < w - 1) v = Math.min(v, D[i - w + 1] + b); } D[i] = v; }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; let v = D[i]; if (x < w - 1) v = Math.min(v, D[i + 1] + a); if (y < h - 1) { v = Math.min(v, D[i + w] + a); if (x < w - 1) v = Math.min(v, D[i + w + 1] + b); if (x > 0) v = Math.min(v, D[i + w - 1] + b); } D[i] = v; }
  return D;
}
function hash(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }

// Build the final sticker canvas from source + mask + style.
export function composeSticker(src, mask, w, h, st) {
  const pad = Math.ceil((st.outline ? st.width + (st.style === 'torn' ? st.width * 0.8 : 0) : 0) + 8);
  const W = w + pad * 2, H = h + pad * 2;
  const big = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) big.set(mask.subarray(y * w, y * w + w), (y + pad) * W + pad);
  const out = mk(W, H), g = out.getContext('2d');
  if (st.outline && st.width > 0) {
    const D = distanceField(big, W, H), id = g.createImageData(W, H), d = id.data;
    const hex = c => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    const C1 = hex(st.color), C2 = hex(st.color2 || '#ff6ec7'), cx = W / 2, cy = H / 2, sw = st.width, lw = Math.max(1.5, sw * 0.09);
    const hsl = hh => { const a = 0.36, f = n => { const k = (n + hh / 30) % 12; return Math.round(255 * (0.6 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, th = Math.atan2(y - cy, x - cx); let r = sw;
      // the outer shape of the border
      if (st.style === 'torn') r = sw * (0.55 + 0.9 * vnoise(x / 26, y / 26, 3) + 0.35 * (vnoise(x / 4, y / 4, 9) - 0.5));
      else if (st.style === 'wavy') r = sw * (0.8 + 0.4 * Math.sin((x + y) / 14));
      else if (st.style === 'scallop') r = sw * (0.55 + 0.55 * Math.abs(Math.sin(th * (st.bumps || 18))));
      else if (st.style === 'zigzag') { const t = (th / Math.PI * (st.bumps || 18)) % 1; r = sw * (0.5 + 0.6 * Math.abs((t < 0 ? t + 1 : t) * 2 - 1)); }
      else if (st.style === 'cloud') r = sw * (0.6 + 0.35 * Math.abs(Math.sin(th * (st.bumps || 9))) + 0.25 * vnoise(x / 40, y / 40, 5));
      else if (st.style === 'glow') { const a = Math.max(0, 1 - D[i] / (sw * 1.6)); if (a > 0) { d[i * 4] = C1[0]; d[i * 4 + 1] = C1[1]; d[i * 4 + 2] = C1[2]; d[i * 4 + 3] = a * a * 230; } continue; }
      const a = Math.max(0, Math.min(1, r - D[i] + 0.5));
      if (a <= 0) continue;
      let c = C1, al = a;
      // how the border is colored
      if (st.fill === 'rainbow') c = hsl(((th + Math.PI) / (2 * Math.PI)) * 360);
      else if (st.fill === 'gradient') { const t = y / H; c = [C1[0] + (C2[0] - C1[0]) * t, C1[1] + (C2[1] - C1[1]) * t, C1[2] + (C2[2] - C1[2]) * t]; }
      else if (st.fill === 'twotone' && D[i] > r * 0.6) c = C2;
      else if (st.fill === 'double') { if (D[i] > r * 0.45 && D[i] < r * 0.7) { al = 0; } else if (D[i] >= r * 0.7) c = C2; }
      // lines on the border: dashed cut line or stitches
      if (st.line === 'dashed' && Math.abs(D[i] - r * 0.9) < lw && Math.floor((th + Math.PI) * (W + H) / 60) % 2 === 0) c = C2;
      if (st.line === 'stitched' && Math.abs(D[i] - r * 0.5) < lw && Math.floor((th + Math.PI) * (W + H) / 45) % 2 === 0) c = C2;
      if (st.line === 'outline' && D[i] > r - lw * 1.4) c = C2;
      if (al <= 0) continue;
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = al * 255;
    }
    g.putImageData(id, 0, 0);
    if (st.style === 'torn' || st.paperTex) { // paper fibers on the border
      g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.9;
      g.fillStyle = g.createPattern(paperTile('vintage', st.color).canvas, 'repeat'); g.fillRect(0, 0, W, H); g.restore();
    }
  }
  // the cut-out art
  const art = mk(w, h), ag = art.getContext('2d');
  ag.drawImage(src, 0, 0, w, h);
  const ad = ag.getImageData(0, 0, w, h); for (let i = 0; i < w * h; i++) ad.data[i * 4 + 3] = Math.min(ad.data[i * 4 + 3], mask[i]);
  ag.putImageData(ad, 0, 0);
  g.drawImage(art, pad, pad);
  if (st.gloss) { g.save(); g.globalCompositeOperation = 'source-atop'; const gr = g.createLinearGradient(0, 0, W * 0.6, H); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.36, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore(); }
  if (st.print) { g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.25; g.fillStyle = g.createPattern(paperTile('sketch').canvas, 'repeat'); g.globalCompositeOperation = 'multiply'; g.fillRect(0, 0, W, H); g.restore(); g.save(); g.globalCompositeOperation = 'destination-in'; g.drawImage(out, 0, 0); g.restore(); }
  return trimCanvas(out);
}
function trimCanvas(c) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 1) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return c;
  const o = mk(x1 - x0 + 3, y1 - y0 + 3); o.getContext('2d').drawImage(c, -x0 + 1, -y0 + 1); return o;
}

// ---------- factory UI ----------
export async function openFactory(source, onSaved) {
  const body = el('div', { class: 'factory' });
  const view = el('canvas', { class: 'fac-view checker' });
  const side = el('div', { class: 'fac-side' });
  const info = el('div', { class: 'muted small' });
  body.append(el('div', { class: 'fac-stage' }, view, info), side);
  const m = modal('Sticker factory', body, { wide: true, cls: 'xl' });
  let img = null, w = 0, h = 0, orig = null, mask = null, undo = [];
  let tool = 'remove', brush = 40, tol = 40;
  const st = { outline: true, style: 'diecut', width: 18, color: '#ffffff', color2: '#ff6ec7', fill: 'solid', line: 'none', bumps: 18, gloss: false, print: false, paperTex: false, look: null };
  const src = mk(1, 1);

  const load = async (blob, name) => {
    const bm = await createImageBitmap(blob);
    const s = Math.min(1, MAXS / Math.max(bm.width, bm.height));
    w = Math.round(bm.width * s); h = Math.round(bm.height * s);
    src.width = w; src.height = h; const g = src.getContext('2d'); g.drawImage(bm, 0, 0, w, h);
    orig = g.getImageData(0, 0, w, h).data;
    mask = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) mask[i] = orig[i * 4 + 3];
    img = { name: name || 'Sticker' }; undo = [];
    info.textContent = `${w} × ${h} px` + (s < 1 ? ` (scaled from ${bm.width} × ${bm.height} to keep it fast)` : '');
    draw(); renderSide();
  };
  const snap = () => { undo.push(mask.slice()); if (undo.length > 20) undo.shift(); };
  const preview = () => composeSticker(src, mask, w, h, st);
  let lastOut = null;
  const draw = () => {
    if (!img) { view.width = 600; view.height = 400; const g = view.getContext('2d'); g.fillStyle = '#888'; g.font = '18px sans-serif'; g.fillText('Pick a picture to start.', 190, 200); return; }
    // working view: masked image (fast); final style shown when outline is on
    const out = st.outline || st.gloss || st.print || st.look ? withLook(preview()) : null; lastOut = out;
    const showW = out ? out.width : w, showH = out ? out.height : h;
    view.width = showW; view.height = showH;
    const g = view.getContext('2d');
    if (out) g.drawImage(out, 0, 0);
    else { const id = new ImageData(w, h); id.data.set(orig); for (let i = 0; i < w * h; i++) id.data[i * 4 + 3] = Math.min(orig[i * 4 + 3], mask[i]); g.putImageData(id, 0, 0); }
    view.dataset.pad = out ? (out.width - w) / 2 : 0;
  };
  let raf = 0; const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };

  // click / paint on the image
  const toImg = e => { const r = view.getBoundingClientRect(), pad = +(view.dataset.pad || 0); return { x: (e.clientX - r.left) / r.width * view.width - pad, y: (e.clientY - r.top) / r.height * view.height - pad }; };
  let painting = false;
  view.addEventListener('pointerdown', e => {
    if (!img) return; const p = toImg(e); const x = Math.round(p.x), y = Math.round(p.y);
    if (tool === 'remove' || tool === 'keep') {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      snap();
      const i = (y * w + x) * 4, col = [orig[i], orig[i + 1], orig[i + 2]];
      if (tool === 'remove') {
        if (e.shiftKey) { for (let k = 0; k < w * h; k++) if (colorDist(orig, k * 4, col) <= tol) mask[k] = 0; }
        else floodRemove(orig, mask, w, h, [y * w + x], [col], tol, tol * 0.4);
      } else { // keep: bring back a connected region
        const tmp = new Uint8Array(w * h).fill(255); floodRemove(orig, tmp, w, h, [y * w + x], [col], tol, 0);
        for (let k = 0; k < w * h; k++) if (tmp[k] === 0) mask[k] = orig[k * 4 + 3];
      }
      redraw(); return;
    }
    painting = true; try { view.setPointerCapture(e.pointerId); } catch (_) { } snap(); paintAt(p);
  });
  view.addEventListener('pointermove', e => { if (painting) paintAt(toImg(e)); });
  view.addEventListener('pointerup', () => painting = false);
  const paintAt = p => {
    const r = brush / 2, x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(w - 1, Math.ceil(p.x + r)), y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(h - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - p.x, y - p.y); if (d > r) continue;
      const k = Math.min(1, (r - d) / Math.max(1, r * 0.25)), i = y * w + x;
      if (tool === 'erase') mask[i] = Math.round(mask[i] * (1 - k)); else mask[i] = Math.max(mask[i], Math.round(orig[i * 4 + 3] * k));
    }
    redraw();
  };

  const renderSide = () => {
    side.innerHTML = '';
    const toolBtn = (id, label) => el('button', { class: 'btn small' + (tool === id ? ' primary' : ''), onclick: () => { tool = id; renderSide(); } }, label);
    side.append(
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn small', onclick: async () => { const f = await pickFiles('image/*', false); if (f[0]) load(f[0], f[0].name.replace(/\.[^.]+$/, '')); } }, 'Pick a picture'),
        el('button', { class: 'btn small', onclick: async () => { const pick = el('div', {}); const mm = modal('Pick from library', pick, { wide: true }); pick.append(await assetGrid(['art', 'sticker', 'made'], async a => { mm.close(); load(await getBlob(a.blob), a.name); })); } }, 'From library')),
      el('h3', {}, '1. Remove the background'),
      el('button', { class: 'btn primary', onclick: () => { if (!img) return; snap(); const cols = borderColors(orig, w, h); const seeds = []; for (let x = 0; x < w; x++) seeds.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) seeds.push(y * w, y * w + w - 1); floodRemove(orig, mask, w, h, seeds, cols, tol, tol * 0.5); toast(cols.length > 1 ? 'Removed a two-tone background (like a fake checkerboard).' : 'Removed the background.'); redraw(); } }, 'Auto remove background'),
      el('p', { class: 'muted small' }, 'Works best on plain or checkerboard backgrounds. Then click leftovers to remove them, or paint to fix edges.'),
      slider('Tolerance', tol, 2, 160, 1, v => tol = v),
      el('div', { class: 'row wrap' }, toolBtn('remove', 'Click to remove'), toolBtn('keep', 'Click to keep'), toolBtn('erase', 'Erase brush'), toolBtn('restore', 'Restore brush')),
      el('p', { class: 'muted small' }, 'Shift + click with "Click to remove" removes that color everywhere.'),
      slider('Brush size', brush, 2, 300, 1, v => brush = v),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn small', onclick: () => { if (!img) return; snap(); removeIslands(mask, w, h, Math.max(30, w * h * 0.002)); redraw(); } }, 'Clear specks'),
        el('button', { class: 'btn small', onclick: () => { if (!img) return; snap(); fillHoles(mask, w, h, w * h * 0.01); redraw(); } }, 'Fill small holes'),
        el('button', { class: 'btn small', onclick: () => { if (!img) return; snap(); const D = distanceField(mask.map(v => 255 - v), w, h); for (let i = 0; i < w * h; i++) if (D[i] < 2.5) mask[i] = 0; redraw(); } }, 'Shrink edge'),
        el('button', { class: 'btn small', onclick: () => { if (!img) return; snap(); const t = mask.slice(); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; mask[i] = (t[i] * 4 + t[i - 1] + t[i + 1] + t[i - w] + t[i + w]) / 8; } redraw(); } }, 'Soften edge'),
        el('button', { class: 'btn small', onclick: () => { const u = undo.pop(); if (u) { mask = u; redraw(); } } }, 'Undo'),
        el('button', { class: 'btn small', onclick: () => { if (!img) return; snap(); for (let i = 0; i < w * h; i++) mask[i] = orig[i * 4 + 3]; redraw(); } }, 'Start over')),
      el('h3', {}, '2. Style it'),
      check('Outline', st.outline, v => { st.outline = v; redraw(); }),
      select('Outline shape', st.style, { diecut: 'Die-cut (smooth)', torn: 'Torn paper', wavy: 'Wavy', scallop: 'Scalloped', zigzag: 'Zigzag', cloud: 'Cloud', glow: 'Soft glow' }, v => { st.style = v; if (v === 'torn' && st.color === '#ffffff') st.color = '#efe6d2'; renderSide(); redraw(); }),
      ['scallop', 'zigzag', 'cloud'].includes(st.style) ? slider('Bumps', st.bumps, 4, 60, 1, v => { st.bumps = v; redraw(); }) : null,
      slider('Outline width', st.width, 1, 120, 1, v => { st.width = v; redraw(); }),
      select('Outline color style', st.fill, { solid: 'One color', twotone: 'Two colors', double: 'Double outline', gradient: 'Fade', rainbow: 'Rainbow' }, v => { st.fill = v; redraw(); }),
      colorInput('Outline color', st.color, v => { st.color = v; redraw(); }),
      colorInput('Second color', st.color2, v => { st.color2 = v; redraw(); }),
      select('Line on the outline', st.line, { none: 'None', outline: 'Thin outer line', dashed: 'Cut line (dashed)', stitched: 'Stitches' }, v => { st.line = v; redraw(); }),
      check('Paper texture on the outline', st.paperTex, v => { st.paperTex = v; redraw(); }),
      check('Glossy shine', st.gloss, v => { st.gloss = v; redraw(); }),
      check('Printed-on-paper look', st.print, v => { st.print = v; redraw(); }),
      el('h3', {}, 'Look (baked in)'),
      el('p', { class: 'muted small' }, 'Add a finish to the saved sticker. You can still add more looks later on the page.'),
      el('div', { class: 'fx-presets' }, ...Object.entries(FX_PRESETS).map(([k, pr]) => el('button', { class: 'btn small' + ((st.look ? st.lookKey : 'plain') === k ? ' lit' : ''), onclick: () => { const { name, ...v } = pr; st.look = k === 'plain' ? null : v; st.lookKey = k; renderSide(); redraw(); } }, pr.name))),
      el('h3', {}, '3. Save'),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn primary', onclick: () => save('sticker') }, 'Save as sticker'),
        el('button', { class: 'btn', onclick: () => save('art') }, 'Save as cut-out art')));
  };
  const withLook = c => { if (!st.look) return c; const r = applyFx(c, st.look, 'factory'); return r.canvas; };
  const save = async kind => {
    if (!img) return toast('Pick a picture first.');
    const out = withLook(preview());
    const blob = await canvasBlob(out, 'image/png');
    const a = await addAsset(blob, kind, img.name + (kind === 'sticker' ? ' sticker' : ' cut-out'), out.width, out.height);
    toast('Saved to your library.');
    m.close(); onSaved && onSaved(a);
  };
  renderSide();
  if (source && source.blob) load(await getBlob(source.blob), source.name); else draw();
}

// ---------- makers UI ----------
export function openMakers(onSaved) {
  const body = el('div', { class: 'makers' });
  const list = el('div', { class: 'mk-list' });
  const view = el('canvas', { class: 'mk-view checker' });
  const side = el('div', { class: 'fac-side' });
  body.append(list, el('div', { class: 'fac-stage' }, view), side);
  const m = modal('Makers', body, { wide: true, cls: 'xl' });
  let cur = MAKERS[0], params = defaultsOf(cur), out = null, raf = 0;
  const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { try { out = runMaker(cur, params); view.width = out.width; view.height = out.height; view.getContext('2d').drawImage(out, 0, 0); } catch (e) { console.error(e); toast('This maker hit a problem: ' + e.message, 'err'); } }); };
  const renderList = () => { list.innerHTML = ''; for (const mm of MAKERS) list.append(el('button', { class: 'mk-item' + (mm === cur ? ' on' : ''), onclick: () => { cur = mm; params = defaultsOf(mm); renderList(); renderSide(); run(); } }, mm.name)); };
  const renderSide = () => {
    side.innerHTML = '';
    side.append(el('h3', {}, cur.name));
    for (const q of cur.params) {
      if (q.t === 'r') side.append(slider(q.l, params[q.k], q.min, q.max, q.step, v => { params[q.k] = v; run(); }));
      else if (q.t === 'c') side.append(colorInput(q.l, params[q.k], v => { params[q.k] = v; run(); }));
      else if (q.t === 's') side.append(select(q.l, params[q.k], q.o, v => { params[q.k] = v; run(); }));
      else if (q.t === 'b') side.append(check(q.l, params[q.k], v => { params[q.k] = v; run(); }));
      else if (q.t === 'txt') { const ta = el('textarea', { rows: 2, class: 'full', 'aria-label': q.l }); ta.value = params[q.k]; ta.addEventListener('input', () => { params[q.k] = ta.value; run(); }); side.append(el('label', { class: 'row col' }, el('span', { class: 'lbl' }, q.l), ta)); }
    }
    side.append(el('div', { class: 'row wrap' },
      el('button', { class: 'btn small', onclick: () => { params.seed = (Math.random() * 99999) | 0; run(); } }, 'New variation'),
      el('button', { class: 'btn small', onclick: () => { params = defaultsOf(cur); renderSide(); run(); } }, 'Reset')),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn primary', onclick: () => save(true) }, onSaved ? 'Save and put on page' : 'Save to library'),
        onSaved ? el('button', { class: 'btn', onclick: () => save(false) }, 'Save only') : null),
      el('p', { class: 'muted small' }, 'Everything here comes out with no background. See-through windows let art you put under it show through.'));
  };
  const save = async place => {
    if (!out) return;
    const blob = await canvasBlob(out, 'image/png');
    const a = await addAsset(blob, 'made', cur.name, out.width, out.height, { maker: cur.id, params: { ...params } });
    toast('Saved to your library.');
    if (place && onSaved) { m.close(); onSaved(a); }
  };
  renderList(); renderSide(); run();
}

// first run: fill the library with code-made pieces
export async function seedStarters(STARTERS, onProgress) {
  let n = 0;
  for (const [id, over, name] of STARTERS) {
    const mm = MAKERS.find(x => x.id === id); if (!mm) continue;
    const p = { ...defaultsOf(mm), ...over };
    const out = runMaker(mm, p);
    const blob = await canvasBlob(out, 'image/png');
    await addAsset(blob, 'made', name, out.width, out.height, { maker: id, params: p, starter: true });
    onProgress && onProgress(++n, STARTERS.length);
    await new Promise(r => setTimeout(r, 0));
  }
}
