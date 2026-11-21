// Procedural paper, cover and desk materials. All tileable, all made in code (no stock images).

export const PAPERS = {
  smooth:     { name: 'Smooth drawing',     color: '#f7f5ef', grain: 0.025, scale: 2, tooth: 0.25, fibers: 0.25 },
  sketch:     { name: 'Heavy sketch',       color: '#f3efe4', grain: 0.05,  scale: 3, tooth: 0.55, fibers: 0.45 },
  coldpress:  { name: 'Watercolor cold press', color: '#f5f1e6', grain: 0.07, scale: 7, tooth: 1.0, fibers: 0.3, lumps: 1 },
  hotpress:   { name: 'Watercolor hot press',  color: '#f8f6f0', grain: 0.02, scale: 3, tooth: 0.2, fibers: 0.2 },
  textured:   { name: 'Textured art',       color: '#efe9dc', grain: 0.06,  scale: 5, tooth: 0.8, fibers: 0.5, lumps: 0.6 },
  canvas:     { name: 'Canvas texture',     color: '#efeadf', grain: 0.04,  scale: 3, tooth: 0.7, weave: 1 },
  vintage:    { name: 'Vintage',            color: '#e8dbbd', grain: 0.06,  scale: 4, tooth: 0.45, fibers: 0.6, stains: 1 },
  recycled:   { name: 'Recycled',           color: '#e4ded0', grain: 0.07,  scale: 3, tooth: 0.5, fibers: 0.8, speckle: 1 },
  cream:      { name: 'Cream',              color: '#f2e8d0', grain: 0.04,  scale: 3, tooth: 0.4, fibers: 0.35 },
  white:      { name: 'Bright white',       color: '#ffffff', grain: 0.015, scale: 2, tooth: 0.2, fibers: 0.15 },
  black:      { name: 'Black drawing',      color: '#1b1a19', grain: 0.05,  scale: 3, tooth: 0.5, fibers: 0.3 },
  kraft:      { name: 'Kraft',              color: '#b8946a', grain: 0.08,  scale: 3, tooth: 0.55, fibers: 1.2, speckle: 0.5 },
  dotgrid:    { name: 'Dot grid',           color: '#f6f3ec', grain: 0.025, scale: 2, tooth: 0.25, fibers: 0.2, lines: 'dots', lineColor: '#8a8f99', lineGap: 0.025 },
  ruled:      { name: 'Ruled notebook',     color: '#f7f5ef', grain: 0.025, scale: 2, tooth: 0.25, fibers: 0.2, lines: 'margin', lineColor: '#7c93b8', lineGap: 0.03 },
  graph:      { name: 'Graph paper',        color: '#f4f6f2', grain: 0.02,  scale: 2, tooth: 0.2, fibers: 0.15, lines: 'grid', lineColor: '#5fa08a', lineGap: 0.022 },
  toned:      { name: 'Toned gray',         color: '#bdb8ae', grain: 0.05,  scale: 3, tooth: 0.55, fibers: 0.4 },
  tan:        { name: 'Toned tan',          color: '#d2bf98', grain: 0.05,  scale: 3, tooth: 0.55, fibers: 0.5 },
  mixed:      { name: 'Mixed media',        color: '#f5f2ea', grain: 0.05,  scale: 5, tooth: 0.75, fibers: 0.35, lumps: 0.3 },
  crumpled:   { name: 'Crumpled',           color: '#efe9dc', grain: 0.06,  scale: 3, tooth: 0.5, fibers: 0.5, crumple: 0.8 },
};

export const COVERS = {
  linen:   { name: 'Linen cloth' },
  leather: { name: 'Leather' },
  croc:    { name: 'Embossed croc leather' },
  suede:   { name: 'Suede' },
  cloth:   { name: 'Book cloth' },
  canvas:  { name: 'Heavy canvas' },
  denim:   { name: 'Denim' },
  kraft:   { name: 'Kraft board' },
  cork:    { name: 'Cork' },
  wood:    { name: 'Wood' },
  marble:  { name: 'Marbled paper' },
  velvet:  { name: 'Velvet' },
  metal:   { name: 'Metallic foil' },
  board:   { name: 'Smooth board' },
};

// ---------- your own papers ----------
// A custom paper is a set of numbers, so it is tiny to save and is drawn fresh at any size.
export const PAPER_PARAMS = [
  { k: 'color', label: 'Paper color', type: 'color', help: 'The base color of the sheet.' },
  { k: 'grain', label: 'Color variation', min: 0, max: 0.2, step: 0.005, help: 'How blotchy and uneven the color looks up close.' },
  { k: 'tooth', label: 'Tooth (bumpiness)', min: 0, max: 1.5, step: 0.01, help: 'How bumpy the surface is. Pencil and pastel skip over the bumps.' },
  { k: 'scale', label: 'Bump size', min: 1, max: 10, step: 1, help: 'Small numbers give fine grain, big numbers give a rough watercolor surface.' },
  { k: 'lumps', label: 'Lumps', min: 0, max: 1, step: 0.01, help: 'Big soft bumps, like cold press watercolor paper.' },
  { k: 'weave', label: 'Canvas weave', type: 'check', help: 'A woven canvas surface.' },
  { k: 'fibers', label: 'Fibers', min: 0, max: 2, step: 0.01, help: 'Thin strands pressed into the paper.' },
  { k: 'speckle', label: 'Speckles', min: 0, max: 2, step: 0.01, help: 'Little flecks, like recycled or kraft paper.' },
  { k: 'crumple', label: 'Creases', min: 0, max: 1, step: 0.01, help: 'Folds and crumples pressed into the sheet.' },
  { k: 'stains', label: 'Aged spots and edges', type: 'check', help: 'Old paper: brown spots and darker edges.' },
  { k: 'lines', label: 'Printed lines', type: 'select', options: { none: 'None', ruled: 'Ruled lines', margin: 'Ruled with margin', grid: 'Grid', dots: 'Dot grid', music: 'Music staff', cornell: 'Cornell notes' }, help: 'Lines printed on every page.' },
  { k: 'lineColor', label: 'Line color', type: 'color', help: 'Color of the printed lines.' },
  { k: 'lineGap', label: 'Line spacing', min: 0.012, max: 0.08, step: 0.001, help: 'Space between lines, as a part of the page height.' },
];
export const PAPER_DEFAULT = { name: 'My paper', color: '#f3efe4', grain: 0.05, tooth: 0.55, scale: 3, lumps: 0, weave: false, fibers: 0.45, speckle: 0, crumple: 0, stains: false, lines: 'none', lineColor: '#7c93b8', lineGap: 0.03 };
export function dropPaperCache(prefix) { for (const k of [...paperCache.keys()]) if (k.startsWith(prefix)) paperCache.delete(k); for (const k of [...grainCache.keys()]) if (k.startsWith(prefix)) grainCache.delete(k); }
export function registerPapers(list) {
  for (const k of Object.keys(PAPERS)) if (k.startsWith('u_')) delete PAPERS[k];
  for (const p of list || []) { PAPERS[p.id] = { ...PAPER_DEFAULT, ...p, custom: true }; }
  for (const k of [...paperCache.keys()]) if (k.startsWith('u_')) paperCache.delete(k);
  for (const k of [...grainCache.keys()]) if (k.startsWith('u_')) grainCache.delete(k);
}

export const DESKS = {
  walnut: { name: 'Dark walnut' },
  oak:    { name: 'Light oak' },
  pine:   { name: 'Pine wood' },
  felt:   { name: 'Felt (any color)' },
  linen:  { name: 'Linen tablecloth (any color)' },
  marble: { name: 'White marble' },
  slate:  { name: 'Dark slate' },
  cork:   { name: 'Cork board' },
  concrete: { name: 'Concrete' },
  cutmat: { name: 'Cutting mat' },
  plain:  { name: 'Plain color' },
};

// ---------- tileable value noise ----------
function hash(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function noiseTile(N, cells, seed) {
  const out = new Float32Array(N * N), c = cells;
  for (let y = 0; y < N; y++) {
    const fy = y / N * c, yi = Math.floor(fy), ty = fy - yi, v = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < N; x++) {
      const fx = x / N * c, xi = Math.floor(fx), tx = fx - xi, u = tx * tx * (3 - 2 * tx);
      const x0 = xi % c, x1 = (xi + 1) % c, y0 = yi % c, y1 = (yi + 1) % c;
      const a = hash(x0, y0, seed), b = hash(x1, y0, seed), cc = hash(x0, y1, seed), d = hash(x1, y1, seed);
      out[y * N + x] = a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
    }
  }
  return out;
}
function fbm(N, base, oct, seed, gain = 0.5) {
  const out = new Float32Array(N * N); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const n = noiseTile(N, base << o, seed + o * 17);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true }); return c; }; // paper tiles are built pixel by pixel

// height map -> normal map canvas
function normalMap(height, N, strength) {
  const c = mk(N, N), g = c.getContext('2d'), id = g.createImageData(N, N), d = id.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const l = height[y * N + (x - 1 + N) % N], r = height[y * N + (x + 1) % N];
    const t = height[((y - 1 + N) % N) * N + x], b = height[((y + 1) % N) * N + x];
    let nx = (l - r) * strength, ny = (b - t) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * N + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = nz * 255; d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return c;
}

// ---------- paper tile ----------
const paperCache = new Map();
export function paperTile(type, colorOverride) {
  const P = PAPERS[type] || PAPERS.sketch, N = 512, seed = P.seed || Object.keys(PAPERS).indexOf(type) * 101 + 7;
  const key = type + '|' + (colorOverride || '') + (P.custom ? JSON.stringify(P) : '');
  if (paperCache.has(key)) return paperCache.get(key);
  const height = new Float32Array(N * N);
  const fine = fbm(N, 64, 3, seed, 0.55);
  const mid = fbm(N, 8 * P.scale, 3, seed + 3, 0.5);
  for (let i = 0; i < height.length; i++) height[i] = fine[i] * 0.55 + mid[i] * 0.45;
  if (P.lumps) { const l = fbm(N, 16, 2, seed + 9, 0.6); for (let i = 0; i < height.length; i++) height[i] = height[i] * (1 - 0.5 * P.lumps) + Math.pow(l[i], 2) * P.lumps; }
  if (P.weave) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const wx = Math.sin(x / N * Math.PI * 2 * 64), wy = Math.sin(y / N * Math.PI * 2 * 64);
    const over = ((Math.floor(x / N * 64) + Math.floor(y / N * 64)) & 1) ? wx : wy;
    height[y * N + x] = height[y * N + x] * 0.4 + (0.5 + 0.5 * Math.abs(over)) * 0.6;
  }
  if (P.crumple) { // creases: sharp ridges along random lines, wrapped so the tile repeats
    let s2 = seed + 77; const rnd = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
    const lines = Array.from({ length: Math.round(6 + 10 * P.crumple) }, () => { const a = rnd() * Math.PI; return { c: Math.cos(a), sn: Math.sin(a), o: rnd() * N, w: 2 + rnd() * 10, h: (rnd() - 0.5) * 0.5 * P.crumple }; });
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0;
      for (const L of lines) { let dd = ((x * L.c + y * L.sn - L.o) % N + N) % N; dd = Math.min(dd, N - dd); v += L.h * Math.max(0, 1 - dd / L.w); }
      height[y * N + x] += v;
    }
  }
  const c = mk(N, N), g = c.getContext('2d'), id = g.createImageData(N, N), d = id.data;
  const base = rgb(colorOverride || P.color), dark = (base[0] + base[1] + base[2]) / 3 < 80;
  for (let i = 0; i < N * N; i++) {
    const k = 1 + (height[i] - 0.5) * P.grain * 2 * (dark ? 2.5 : 1);
    d[i * 4] = base[0] * k + (dark ? (height[i] - 0.5) * 18 : 0); d[i * 4 + 1] = base[1] * k + (dark ? (height[i] - 0.5) * 18 : 0); d[i * 4 + 2] = base[2] * k + (dark ? (height[i] - 0.5) * 18 : 0); d[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  // fibers: thin curved strands, drawn wrapped so the tile still repeats
  if (P.fibers) {
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const n = Math.round(260 * P.fibers);
    for (let f = 0; f < n; f++) {
      const x = rnd() * N, y = rnd() * N, len = 6 + rnd() * 26, a = rnd() * Math.PI * 2, bend = (rnd() - 0.5) * 1.2;
      const light = rnd() > 0.5;
      g.strokeStyle = light ? `rgba(255,255,255,${0.10 + rnd() * 0.15})` : `rgba(${dark ? '255,255,255' : '60,45,30'},${0.04 + rnd() * 0.08})`;
      g.lineWidth = 0.4 + rnd() * 0.7;
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
        g.beginPath(); g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + Math.cos(a + bend) * len / 2, y + oy + Math.sin(a + bend) * len / 2, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        g.stroke();
      }
    }
  }
  if (P.speckle) {
    let s = seed + 5; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 500 * P.speckle; i++) {
      const x = rnd() * N, y = rnd() * N, r = 0.4 + rnd() * 1.4, hue = rnd();
      g.fillStyle = hue < 0.6 ? `rgba(70,55,40,${0.25 + rnd() * 0.4})` : hue < 0.8 ? `rgba(90,110,150,${0.3})` : `rgba(160,60,50,${0.25})`;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }
  const tile = { canvas: c, normal: normalMap(height, N, 6 * P.tooth + 1), height, N, tooth: P.tooth, stains: !!P.stains, color: colorOverride || P.color, lines: P.lines && P.lines !== 'none' ? { kind: P.lines, color: P.lineColor || '#7c93b8', gap: P.lineGap || 0.03 } : null };
  paperCache.set(key, tile);
  return tile;
}

// Grain canvas for brushes: alpha = paper tooth (high spots catch pigment)
const grainCache = new Map();
export function grainTile(type) {
  if (grainCache.has(type)) return grainCache.get(type);
  const t = paperTile(type), N = t.N, c = mk(N, N), g = c.getContext('2d'), id = g.createImageData(N, N), d = id.data;
  let lo = 1, hi = 0; for (const v of t.height) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < N * N; i++) { const v = (t.height[i] - lo) / (hi - lo || 1); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = Math.max(0, Math.min(1, (v - 0.3) * 1.9)) * 255; }
  g.putImageData(id, 0, 0);
  grainCache.set(type, c);
  return c;
}

// Full page background at any resolution. Big soft variation is added so tiles do not look repeated.
export function paintPaper(ctx, w, h, type, color, customImg, seed = 1) {
  if (type === 'custom' && customImg) {
    const pat = ctx.createPattern(customImg, 'repeat');
    ctx.fillStyle = pat; ctx.fillRect(0, 0, w, h);
    return;
  }
  const t = paperTile(type, color);
  const scale = Math.max(0.5, Math.min(w, h) / 1700); // keep grain size physical-ish across resolutions
  ctx.save();
  const pat = ctx.createPattern(t.canvas, 'repeat');
  pat.setTransform(new DOMMatrix().scale(scale));
  ctx.fillStyle = pat; ctx.fillRect(0, 0, w, h);
  // soft cloudy variation
  let s = seed * 9973 + 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const dark = (rgb(t.color)[0] < 80);
  for (let i = 0; i < 9; i++) {
    const x = rnd() * w, y = rnd() * h, r = (0.2 + rnd() * 0.5) * Math.max(w, h);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.025 + rnd() * 0.03;
    gr.addColorStop(0, dark ? `rgba(255,255,255,${a * 0.4})` : (rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(120,95,60,${a * 0.6})`));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  }
  if (t.stains) {
    for (let i = 0; i < 14; i++) { // foxing spots and an aged edge
      const x = rnd() * w, y = rnd() * h, r = (0.004 + rnd() * 0.02) * w;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(140,90,40,${0.12 + rnd() * 0.12})`); gr.addColorStop(1, 'rgba(140,90,40,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    const e = ctx.createLinearGradient(0, 0, w, 0);
    e.addColorStop(0, 'rgba(150,105,50,0.16)'); e.addColorStop(0.06, 'rgba(150,105,50,0)'); e.addColorStop(0.94, 'rgba(150,105,50,0)'); e.addColorStop(1, 'rgba(150,105,50,0.18)');
    ctx.fillStyle = e; ctx.fillRect(0, 0, w, h);
  }
  if (t.lines) drawLines(ctx, w, h, t.lines);
  ctx.restore();
}

// printed lines on a page (ruled, grid, dots...)
function drawLines(ctx, w, h, L) {
  const gap = Math.max(4, L.gap * h), lw = Math.max(1, h / 1600);
  ctx.save(); ctx.strokeStyle = L.color; ctx.fillStyle = L.color; ctx.globalAlpha = 0.55; ctx.lineWidth = lw;
  const top = L.kind === 'grid' || L.kind === 'dots' ? (h % gap) / 2 : gap * 2.2;
  const hl = y => { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); };
  if (L.kind === 'ruled' || L.kind === 'margin' || L.kind === 'cornell') {
    for (let y = top; y < h - gap * 0.5; y += gap) hl(y);
    if (L.kind !== 'ruled') { ctx.strokeStyle = '#d06060'; ctx.globalAlpha = 0.6; const x = L.kind === 'cornell' ? w * 0.3 : w * 0.12; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, L.kind === 'cornell' ? h * 0.8 : h); ctx.stroke(); if (L.kind === 'cornell') hl(h * 0.8); }
  } else if (L.kind === 'grid') {
    ctx.globalAlpha = 0.35; for (let y = top; y < h; y += gap) hl(y); for (let x = (w % gap) / 2; x < w; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  } else if (L.kind === 'dots') {
    const r = Math.max(1, lw * 1.4); for (let y = top; y < h; y += gap) for (let x = (w % gap) / 2; x < w; x += gap) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  } else if (L.kind === 'music') {
    for (let y = gap * 3; y + gap * 2 < h; y += gap * 7) for (let k = 0; k < 5; k++) hl(y + k * gap * 0.5);
  }
  ctx.restore();
}

// ---------- cover material tile (albedo + normal) ----------
const coverCache = new Map();
export function coverTile(material, color) {
  const key = material + color;
  if (coverCache.has(key)) return coverCache.get(key);
  const N = 512, seed = 31 + Object.keys(COVERS).indexOf(material) * 13;
  let height;
  if (material === 'linen' || material === 'cloth') {
    const k = material === 'linen' ? 128 : 96, n = fbm(N, 64, 2, seed);
    height = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = 0.5 + 0.5 * Math.sin(x / N * Math.PI * 2 * k), b = 0.5 + 0.5 * Math.sin(y / N * Math.PI * 2 * k);
      const over = ((Math.floor(x / N * k * 2) + Math.floor(y / N * k * 2)) & 1);
      height[y * N + x] = (over ? a : b) * 0.7 + n[y * N + x] * 0.3;
    }
  } else if (material === 'leather') {
    // cell-like wrinkles from distance to random points
    height = new Float32Array(N * N);
    const pts = []; let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const G = 24; for (let i = 0; i < G * G; i++) pts.push([((i % G) + rnd()) / G * N, (Math.floor(i / G) + rnd()) / G * N]);
    const n = fbm(N, 16, 3, seed);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cx = Math.floor(x / N * G), cy = Math.floor(y / N * G); let d1 = 1e9, d2 = 1e9;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = (cx + ox + G) % G, gy = (cy + oy + G) % G, p = pts[gy * G + gx];
        const px = p[0] + (cx + ox < 0 ? -N : cx + ox >= G ? N : 0), py = p[1] + (cy + oy < 0 ? -N : cy + oy >= G ? N : 0);
        const d = Math.hypot(px - x, py - y); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      height[y * N + x] = Math.min(1, (d2 - d1) / 8) * 0.75 + n[y * N + x] * 0.25;
    }
  } else if (material === 'croc') {
    height = new Float32Array(N * N); const n = fbm(N, 32, 2, seed);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const row = Math.floor(y / N * 12), off = (row & 1) * 0.5, cx = (x / N * 8 + off) % 1, cy = (y / N * 12) % 1;
      const dd = Math.min(cx, 1 - cx, cy, 1 - cy); height[y * N + x] = Math.min(1, dd * 6) * 0.8 + n[y * N + x] * 0.2;
    }
  } else if (material === 'canvas' || material === 'denim') {
    const k = material === 'canvas' ? 64 : 96, n = fbm(N, 64, 2, seed); height = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const tw = material === 'denim' ? ((x + y) / N * k) : (x / N * k), a = 0.5 + 0.5 * Math.sin(tw * Math.PI * 2), b = 0.5 + 0.5 * Math.sin(y / N * k * Math.PI * 2);
      height[y * N + x] = (material === 'denim' ? a * 0.8 : Math.max(a, b) * 0.7) + n[y * N + x] * 0.3;
    }
  } else if (material === 'cork') {
    height = new Float32Array(N * N); const n = fbm(N, 64, 3, seed, 0.7), m = fbm(N, 16, 2, seed + 5);
    for (let i = 0; i < N * N; i++) height[i] = n[i] > 0.62 ? 0.15 : n[i] * 0.6 + m[i] * 0.4;
  } else if (material === 'wood') {
    height = new Float32Array(N * N); const n = fbm(N, 4, 4, seed, 0.55);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; height[i] = 0.5 + 0.5 * Math.sin((x / N * 14 + n[i] * 5) * Math.PI * 2); }
  } else if (material === 'marble') {
    height = new Float32Array(N * N); const n = fbm(N, 4, 5, seed, 0.6);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; height[i] = 0.5 + 0.5 * Math.sin((x / N * 4 + y / N * 2 + n[i] * 9) * Math.PI * 2); }
  } else if (material === 'suede') {
    height = fbm(N, 96, 3, seed, 0.65);
  } else if (material === 'metal') {
    height = fbm(N, 8, 3, seed, 0.4);
  } else if (material === 'velvet') {
    height = fbm(N, 32, 4, seed, 0.6);
  } else if (material === 'kraft') {
    height = fbm(N, 24, 4, seed, 0.55);
  } else {
    height = fbm(N, 64, 2, seed, 0.5);
  }
  const strength = { linen: 3, cloth: 2.5, leather: 4, croc: 6, suede: 1.2, canvas: 3.5, denim: 3, cork: 4, wood: 1.5, marble: 0.3, velvet: 1.5, kraft: 2, metal: 0.4, board: 0.6 }[material] || 1;
  const base = rgb(color), c = mk(N, N), g = c.getContext('2d'), id = g.createImageData(N, N), d = id.data;
  const amt = { linen: 0.22, cloth: 0.18, leather: 0.25, croc: 0.3, suede: 0.2, canvas: 0.2, denim: 0.35, cork: 0.45, wood: 0.35, marble: 0.6, velvet: 0.3, kraft: 0.2, metal: 0.15, board: 0.05 }[material] || 0.1;
  for (let i = 0; i < N * N; i++) { const k = 1 + (height[i] - 0.5) * amt * 2; d[i * 4] = base[0] * k; d[i * 4 + 1] = base[1] * k; d[i * 4 + 2] = base[2] * k; d[i * 4 + 3] = 255; }
  g.putImageData(id, 0, 0);
  if (material === 'kraft') { const t = paperTile('kraft', color); g.globalAlpha = 0.6; g.drawImage(t.canvas, 0, 0); g.globalAlpha = 1; }
  const out = { canvas: c, normal: normalMap(height, N, strength), rough: { leather: 0.55, croc: 0.45, suede: 1, canvas: 0.95, denim: 0.95, cork: 0.95, wood: 0.6, marble: 0.35, velvet: 1, linen: 0.9, cloth: 0.85, kraft: 0.9, metal: 0.28, board: 0.45 }[material] ?? 0.8, metal: material === 'metal' ? 0.85 : 0, sheen: material === 'velvet' || material === 'suede' };
  coverCache.set(key, out);
  return out;
}

// ---------- desk ----------
export function deskTile(kind, color = '#2a2420') {
  const N = 1024, c = mk(N, N), g = c.getContext('2d');
  if (kind === 'marble') {
    const n = fbm(N, 6, 5, 31, 0.55), v = fbm(N, 24, 3, 37, 0.5), id = g.createImageData(N, N), d = id.data;
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0, vein = Math.abs(Math.sin((x / N * 3 + y / N * 2 + n[i] * 4) * Math.PI));
      const k = Math.pow(vein, 18) * 0.55 + Math.pow(vein, 4) * 0.12, base = 236 + v[i] * 14;
      d[i * 4] = base - k * 150; d[i * 4 + 1] = base - k * 150; d[i * 4 + 2] = base - k * 140 + 4; d[i * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0); return c;
  }
  if (kind === 'slate') {
    const n = fbm(N, 8, 5, 41, 0.6), f = fbm(N, 160, 2, 43), id = g.createImageData(N, N), d = id.data;
    for (let i = 0; i < N * N; i++) { const k = 0.75 + n[i] * 0.35 + f[i] * 0.1; d[i * 4] = 52 * k; d[i * 4 + 1] = 56 * k; d[i * 4 + 2] = 62 * k; d[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0); return c;
  }
  if (kind === 'cork') {
    const n = fbm(N, 64, 3, 51, 0.6), id = g.createImageData(N, N), d = id.data;
    let sd = 5; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N * N; i++) { const k = 0.7 + n[i] * 0.5; d[i * 4] = 176 * k; d[i * 4 + 1] = 128 * k; d[i * 4 + 2] = 82 * k; d[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0);
    for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(60,35,15,0.35)' : 'rgba(230,190,140,0.3)'; g.beginPath(); g.arc(rnd() * N, rnd() * N, 0.6 + rnd() * 2.2, 0, 7); g.fill(); }
    return c;
  }
  if (kind === 'linen') {
    const [r0, g0, b0] = rgb(color), n = fbm(N, 32, 3, 61, 0.5), id = g.createImageData(N, N), d = id.data;
    for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0, w = 0.9 + 0.06 * Math.sin(x * 1.6) + 0.06 * Math.sin(y * 1.6 + n[i] * 3) + n[i] * 0.1; d[i * 4] = r0 * w; d[i * 4 + 1] = g0 * w; d[i * 4 + 2] = b0 * w; d[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0); return c;
  }
  if (kind === 'walnut' || kind === 'oak' || kind === 'pine') {
    const n = fbm(N, 4, 4, kind === 'oak' ? 3 : kind === 'pine' ? 7 : 5, 0.55), fine = fbm(N, 128, 2, 9);
    const id = g.createImageData(N, N), d = id.data;
    const A = kind === 'oak' ? [196, 156, 106] : kind === 'pine' ? [226, 192, 140] : [74, 46, 30], B = kind === 'oak' ? [160, 118, 74] : kind === 'pine' ? [190, 140, 86] : [44, 26, 17];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, ring = 0.5 + 0.5 * Math.sin((y / N * 18 + n[i] * 6) * Math.PI * 2 / 2);
      const k = ring * 0.8 + fine[(y % N) * N + ((x * 7) % N)] * 0.2;
      for (let q = 0; q < 3; q++) d[i * 4 + q] = A[q] * k + B[q] * (1 - k);
      d[i * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
  } else if (kind === 'felt' || kind === 'concrete') {
    const n = fbm(N, kind === 'felt' ? 128 : 16, 4, 21, 0.6), id = g.createImageData(N, N), d = id.data;
    const base = kind === 'felt' ? (color && color !== '#2a2420' ? rgb(color) : [28, 27, 27]) : [128, 126, 122];
    for (let i = 0; i < N * N; i++) { const k = 0.8 + n[i] * 0.4; d[i * 4] = base[0] * k; d[i * 4 + 1] = base[1] * k; d[i * 4 + 2] = base[2] * k; d[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0);
  } else if (kind === 'cutmat') {
    g.fillStyle = '#1f3d33'; g.fillRect(0, 0, N, N);
    g.strokeStyle = 'rgba(220,240,220,0.25)'; g.lineWidth = 1;
    for (let i = 0; i <= N; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, N); g.moveTo(0, i); g.lineTo(N, i); g.stroke(); }
    g.strokeStyle = 'rgba(220,240,220,0.5)'; g.lineWidth = 2;
    for (let i = 0; i <= N; i += 256) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, N); g.moveTo(0, i); g.lineTo(N, i); g.stroke(); }
  } else {
    g.fillStyle = color; g.fillRect(0, 0, N, N);
  }
  return c;
}

// Page edge stripes for the side of a page block
export function edgeTile(paperColor) {
  const c = mk(4, 256), g = c.getContext('2d'), base = rgb(paperColor);
  // dark paper: darker gaps barely show, so the sheet edges are lit instead
  const dark = (0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2]) / 255 < 0.3, lift = dark ? 28 : 0;
  for (let y = 0; y < 256; y++) {
    const k = (y % 4 === 0) ? (dark ? 0.55 : 0.78) : (y % 4 === 2 ? (dark ? 1.5 : 0.92) : 1);
    if (dark && y % 4 === 2) { g.fillStyle = `rgb(${base[0] * k + lift},${base[1] * k + lift},${base[2] * k + lift})`; g.fillRect(0, y, 4, 1); continue; }
    g.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`; g.fillRect(0, y, 4, 1);
  }
  return c;
}
