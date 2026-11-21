// Sticker looks: border, finish (gloss, holo, glitter, metal...), texture, puffy, wrinkles, wear, peeling corner, tint.
// Applied when a picture is drawn, so the original file is never changed and every setting can be undone.
import { paperTile, coverTile } from './paper.js';

export const FX_DEFAULT = { border: 0, borderColor: '#ffffff', finish: 'none', finishAmt: 0.7, texture: 'none', texAmt: 0.5, puffy: 0, wrinkle: 0, wear: 0, peel: 0, peelCorner: 'br', peelBack: '#f4f1ea', tint: 0, tintColor: '#ff7aa8', tintMode: 'multiply', seed: 1 };

export const FX_PARAMS = [
  { k: 'border', g: 'Border', label: 'Die-cut border', min: 0, max: 0.12, step: 0.002, pct: 1 / 0.12, help: 'A border around the shape, like a cut-out sticker.' },
  { k: 'borderColor', g: 'Border', label: 'Border color', type: 'color', help: 'Color of the border.' },
  { k: 'finish', g: 'Finish', label: 'Finish', type: 'select', options: { none: 'None', gloss: 'Glossy', satin: 'Satin', matte: 'Matte paper', holo: 'Holographic', glitter: 'Glitter', metal: 'Metallic foil', vinyl: 'Vinyl' }, help: 'The surface of the sticker: shiny, rainbow, sparkly, metal and more.' },
  { k: 'finishAmt', g: 'Finish', label: 'Finish strength', min: 0, max: 1, step: 0.01, pct: 1, help: 'How strong the finish looks.' },
  { k: 'texture', g: 'Texture', label: 'Texture', type: 'select', options: { none: 'None', sketch: 'Paper', coldpress: 'Watercolor paper', kraft: 'Kraft paper', recycled: 'Recycled paper', crumpled: 'Crumpled paper', canvas: 'Canvas', linen: 'Linen cloth', denim: 'Denim', leather: 'Leather', cork: 'Cork', suede: 'Felt' }, help: 'Prints the sticker onto a material, so the grain shows through.' },
  { k: 'texAmt', g: 'Texture', label: 'Texture strength', min: 0, max: 1, step: 0.01, pct: 1, help: 'How much the material shows.' },
  { k: 'puffy', g: 'Texture', label: 'Puffy', min: 0, max: 1, step: 0.01, pct: 1, help: 'Raised, rounded edges like a puffy or foam sticker.' },
  { k: 'wrinkle', g: 'Texture', label: 'Wrinkles', min: 0, max: 1, step: 0.01, pct: 1, help: 'Creases, like a sticker that was stuck on a little badly.' },
  { k: 'wear', g: 'Age', label: 'Worn and scratched', min: 0, max: 1, step: 0.01, pct: 1, help: 'Scratches and rubbed-off spots, like an old sticker.' },
  { k: 'peel', g: 'Age', label: 'Peeling corner', min: 0, max: 1, step: 0.01, pct: 1, help: 'One corner lifts and folds back. Works best on square and round-cornered stickers.' },
  { k: 'peelCorner', g: 'Age', label: 'Which corner', type: 'select', options: { br: 'Bottom right', bl: 'Bottom left', tr: 'Top right', tl: 'Top left' }, help: 'The corner that peels.' },
  { k: 'peelBack', g: 'Age', label: 'Back of the sticker', type: 'color', help: 'Color of the folded-back paper.' },
  { k: 'tint', g: 'Color', label: 'Tint', min: 0, max: 1, step: 0.01, pct: 1, help: 'Wash the sticker with a color.' },
  { k: 'tintColor', g: 'Color', label: 'Tint color', type: 'color', help: 'The tint color.' },
  { k: 'tintMode', g: 'Color', label: 'Tint style', type: 'select', options: { multiply: 'Darken with color', color: 'Recolor', screen: 'Lighten with color', overlay: 'Strong color' }, help: 'How the tint mixes in.' },
  { k: 'seed', g: 'Color', label: 'Random pattern', min: 1, max: 50, step: 1, help: 'Changes where glitter, scratches and wrinkles land.' },
];

export const FX_PRESETS = {
  plain: { name: 'Plain' },
  diecut: { name: 'Die-cut glossy', border: 0.04, finish: 'gloss', finishAmt: 0.6 },
  holo: { name: 'Holographic', border: 0.03, finish: 'holo', finishAmt: 0.75 },
  glitter: { name: 'Glitter', border: 0.025, finish: 'glitter', finishAmt: 0.8 },
  foil: { name: 'Gold foil', finish: 'metal', finishAmt: 0.8, tint: 0.55, tintColor: '#d8b25a', tintMode: 'color' },
  puffy: { name: 'Puffy', border: 0.03, puffy: 0.8, finish: 'satin', finishAmt: 0.5 },
  paper: { name: 'Paper print', texture: 'sketch', texAmt: 0.6, finish: 'matte', finishAmt: 0.5 },
  vintage: { name: 'Vintage', texture: 'recycled', texAmt: 0.6, wear: 0.55, tint: 0.25, tintColor: '#c9a46a', tintMode: 'multiply', finish: 'matte', finishAmt: 0.6 },
  patch: { name: 'Fabric patch', border: 0.05, borderColor: '#2a2a2c', texture: 'denim', texAmt: 0.7, puffy: 0.35 },
  peeling: { name: 'Peeling', border: 0.03, peel: 0.6, finish: 'gloss', finishAmt: 0.4, wrinkle: 0.25 },
  worn: { name: 'Worn label', texture: 'kraft', texAmt: 0.5, wear: 0.8, wrinkle: 0.5 },
};

export const hasFx = fx => !!fx && Object.keys(FX_DEFAULT).some(k => k !== 'seed' && k !== 'borderColor' && k !== 'tintColor' && k !== 'tintMode' && k !== 'peelCorner' && k !== 'peelBack' && k !== 'finishAmt' && k !== 'texAmt' && fx[k] != null && fx[k] !== FX_DEFAULT[k]);

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const cache = new Map(); // key -> result
let srcIds = new WeakMap(), nextId = 1;
const idOf = s => { let i = srcIds.get(s); if (!i) { i = nextId++; srcIds.set(s, i); } return i; };

// keep only the pixels inside the sticker's shape
function masked(c, mask) { const g = c.getContext('2d'); g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-over'; return c; }
function layer(base, fill, mode, alpha) {
  const g = base.getContext('2d'); g.save(); g.globalCompositeOperation = mode; g.globalAlpha = alpha; g.drawImage(fill, 0, 0); g.restore();
}

/**
 * Returns { canvas, pad, w0 } where w0 is the width the source was worked at and pad the extra room (border, flap) around it.
 */
export function applyFx(src, fx0, key = '') {
  const fx = { ...FX_DEFAULT, ...fx0 };
  const k = idOf(src) + '|' + key + '|' + JSON.stringify(fx);
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const s0 = Math.min(1, 1400 / Math.max(src.width, src.height));
  const w = Math.round(src.width * s0), h = Math.round(src.height * s0), M = Math.max(w, h);
  const bw = Math.round(fx.border * M), pad = bw + Math.ceil(fx.peel * 0.04 * M) + 4;
  const W = w + pad * 2, H = h + pad * 2;
  let sd = (fx.seed || 1) * 7919; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const out = mk(W, H), g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  // border: grow the silhouette outward
  if (bw > 0) {
    const sil = mk(W, H), sg = sil.getContext('2d'); sg.drawImage(src, pad, pad, w, h); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = fx.borderColor; sg.fillRect(0, 0, W, H);
    const steps = 32;
    for (const r of [bw, bw * 0.66, bw * 0.33]) for (let i = 0; i < steps; i++) { const a = i / steps * Math.PI * 2; g.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r); }
    g.drawImage(sil, 0, 0);
  }
  g.drawImage(src, pad, pad, w, h);
  const shape = mk(W, H); shape.getContext('2d').drawImage(out, 0, 0); // the full sticker shape incl. border
  // tint
  if (fx.tint > 0) { const t = mk(W, H), tg = t.getContext('2d'); tg.fillStyle = fx.tintColor; tg.fillRect(0, 0, W, H); masked(t, shape); layer(out, t, fx.tintMode, fx.tint); }
  // texture: material grain printed through
  if (fx.texture !== 'none' && fx.texAmt > 0) {
    const covers = { linen: 1, denim: 1, leather: 1, cork: 1, suede: 1 };
    const tile = covers[fx.texture] ? coverTile(fx.texture, '#9a9a9a').canvas : paperTile(fx.texture).canvas;
    const t = mk(W, H), tg = t.getContext('2d');
    tg.filter = 'grayscale(1) contrast(2.2)'; const pat = tg.createPattern(tile, 'repeat'); pat.setTransform(new DOMMatrix().scale(Math.max(0.6, M / 900))); tg.fillStyle = pat; tg.fillRect(0, 0, W, H); tg.filter = 'none';
    masked(t, shape); layer(out, t, 'overlay', fx.texAmt); layer(out, t, 'multiply', fx.texAmt * 0.35);
  }
  // wrinkles: creases with a light and a dark side
  if (fx.wrinkle > 0) {
    const t = mk(W, H), tg = t.getContext('2d'), n = Math.round(3 + fx.wrinkle * 9);
    for (let i = 0; i < n; i++) {
      const x0 = rnd() * W, y0 = rnd() * H, a = rnd() * Math.PI, L = (0.3 + rnd() * 0.6) * M, x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L, mx = (x0 + x1) / 2 + (rnd() - 0.5) * M * 0.1, my = (y0 + y1) / 2 + (rnd() - 0.5) * M * 0.1;
      const lw = Math.max(1, M / 500);
      tg.lineWidth = lw * 2; tg.strokeStyle = 'rgba(255,255,255,0.55)'; tg.beginPath(); tg.moveTo(x0, y0); tg.quadraticCurveTo(mx, my, x1, y1); tg.stroke();
      tg.lineWidth = lw * 1.5; tg.strokeStyle = 'rgba(0,0,0,0.35)'; tg.beginPath(); tg.moveTo(x0 + lw * 1.6, y0 + lw * 1.6); tg.quadraticCurveTo(mx + lw * 1.6, my + lw * 1.6, x1 + lw * 1.6, y1 + lw * 1.6); tg.stroke();
    }
    tg.filter = `blur(${Math.max(0.5, M / 900)}px)`; tg.drawImage(t, 0, 0); tg.filter = 'none';
    masked(t, shape); layer(out, t, 'source-over', fx.wrinkle);
  }
  // puffy: light the rounded edge from the top left
  if (fx.puffy > 0) {
    const r = Math.max(2, M * 0.02 * fx.puffy + 2);
    const b = mk(W, H), bg = b.getContext('2d'); bg.filter = `blur(${r}px)`; bg.drawImage(shape, 0, 0); bg.filter = 'none';
    const lit = mk(W, H), lg = lit.getContext('2d');
    lg.drawImage(b, -r * 0.6, -r * 0.6); lg.globalCompositeOperation = 'destination-out'; lg.drawImage(b, r * 0.6, r * 0.6); // highlight on the top-left rim
    lg.globalCompositeOperation = 'source-in'; lg.fillStyle = '#ffffff'; lg.fillRect(0, 0, W, H);
    const dark = mk(W, H), dg = dark.getContext('2d');
    dg.drawImage(b, r * 0.6, r * 0.6); dg.globalCompositeOperation = 'destination-out'; dg.drawImage(b, -r * 0.6, -r * 0.6);
    dg.globalCompositeOperation = 'source-in'; dg.fillStyle = '#000000'; dg.fillRect(0, 0, W, H);
    masked(lit, shape); masked(dark, shape);
    layer(out, lit, 'screen', 0.55 * fx.puffy); layer(out, dark, 'multiply', 0.5 * fx.puffy);
  }
  // finish
  const a = fx.finishAmt;
  if (fx.finish !== 'none' && a > 0) {
    const t = mk(W, H), tg = t.getContext('2d');
    if (fx.finish === 'gloss' || fx.finish === 'vinyl' || fx.finish === 'satin') {
      const gr = tg.createLinearGradient(0, 0, W, H);
      const sharp = fx.finish === 'vinyl' ? 0.02 : fx.finish === 'satin' ? 0.18 : 0.08;
      gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(Math.max(0, 0.32 - sharp), 'rgba(255,255,255,0)'); gr.addColorStop(0.36, `rgba(255,255,255,${fx.finish === 'satin' ? 0.35 : 0.75})`); gr.addColorStop(Math.min(1, 0.4 + sharp), 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.08)');
      tg.fillStyle = gr; tg.fillRect(0, 0, W, H); masked(t, shape); layer(out, t, 'screen', a);
    } else if (fx.finish === 'holo') {
      const gr = tg.createLinearGradient(0, H, W, 0);
      ['#ff6ec7', '#ffd36e', '#7dffb0', '#6ec8ff', '#b06eff', '#ff6ec7', '#ffd36e'].forEach((c, i, arr) => gr.addColorStop(i / (arr.length - 1), c));
      tg.fillStyle = gr; tg.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i++) { tg.globalAlpha = 0.25; tg.fillStyle = '#ffffff'; tg.fillRect(0, (i / 6 + rnd() * 0.05) * H, W, H * 0.02); } tg.globalAlpha = 1;
      masked(t, shape); layer(out, t, 'overlay', a); layer(out, t, 'soft-light', a * 0.6);
    } else if (fx.finish === 'glitter') {
      const n = Math.round(W * H / 220 * a);
      for (let i = 0; i < n; i++) { const x = rnd() * W, y = rnd() * H, r = 0.6 + rnd() * Math.max(1, M / 700); tg.fillStyle = `hsla(${rnd() * 360},80%,${70 + rnd() * 30}%,${0.4 + rnd() * 0.6})`; tg.fillRect(x, y, r, r); }
      for (let i = 0; i < n / 40; i++) { const x = rnd() * W, y = rnd() * H, r = (2 + rnd() * 5) * Math.max(1, M / 600); tg.strokeStyle = 'rgba(255,255,255,0.95)'; tg.lineWidth = Math.max(1, r / 4); tg.beginPath(); tg.moveTo(x - r, y); tg.lineTo(x + r, y); tg.moveTo(x, y - r); tg.lineTo(x, y + r); tg.stroke(); }
      masked(t, shape); layer(out, t, 'screen', 1);
    } else if (fx.finish === 'metal') {
      const gr = tg.createLinearGradient(0, 0, W * 0.3, H);
      for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? 'rgba(255,255,255,0.9)' : 'rgba(40,40,40,0.6)');
      tg.fillStyle = gr; tg.fillRect(0, 0, W, H); masked(t, shape);
      const gray = mk(W, H), gg = gray.getContext('2d'); gg.filter = 'grayscale(0.6) contrast(1.2)'; gg.drawImage(out, 0, 0); gg.filter = 'none';
      layer(out, gray, 'source-atop', a * 0.6); layer(out, t, 'overlay', a);
    } else if (fx.finish === 'matte') {
      const gray = mk(W, H), gg = gray.getContext('2d'); gg.filter = 'saturate(0.85) contrast(0.92) brightness(1.04)'; gg.drawImage(out, 0, 0);
      layer(out, gray, 'source-atop', a);
    }
  }
  // wear: rubbed spots and scratches
  if (fx.wear > 0) {
    g.save(); g.globalCompositeOperation = 'destination-out';
    const n = Math.round(60 + fx.wear * 500);
    for (let i = 0; i < n; i++) {
      const edge = rnd() < 0.6, x = edge ? (rnd() < 0.5 ? pad + rnd() * w * 0.12 : pad + w - rnd() * w * 0.12) : pad + rnd() * w, y = pad + rnd() * h;
      g.globalAlpha = 0.25 + rnd() * 0.6 * fx.wear; g.beginPath(); g.arc(rnd() < 0.5 ? x : pad + rnd() * w, edge && rnd() < 0.5 ? (rnd() < 0.5 ? pad + rnd() * h * 0.1 : pad + h - rnd() * h * 0.1) : y, rnd() * M * 0.008 * fx.wear + 0.5, 0, 7); g.fill();
    }
    g.lineWidth = Math.max(1, M / 700);
    for (let i = 0; i < 6 + fx.wear * 25; i++) { const x = pad + rnd() * w, y = pad + rnd() * h, L = rnd() * M * 0.25, an = rnd() * Math.PI; g.globalAlpha = 0.3 + rnd() * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * L, y + Math.sin(an) * L); g.stroke(); }
    g.restore();
    const wash = mk(W, H), wg = wash.getContext('2d'); wg.fillStyle = 'rgba(255,250,240,1)'; wg.fillRect(0, 0, W, H); masked(wash, out); layer(out, wash, 'screen', 0.12 * fx.wear);
  }
  // peeling corner: cut the corner off and fold it back with a shadow
  if (fx.peel > 0) {
    const sz = fx.peel * 0.35 * Math.min(w, h) + bw;
    const L0 = pad - bw, T0 = pad - bw, R0 = pad + w + bw, B0 = pad + h + bw;
    const cn = fx.peelCorner, cx = cn.includes('r') ? R0 : L0, cy = cn.includes('b') ? B0 : T0, sx = cn.includes('r') ? -1 : 1, sy = cn.includes('b') ? -1 : 1;
    const A = [cx + sx * sz, cy], Bp = [cx, cy + sy * sz];
    // reflect the corner across the fold line A-B
    const dx = Bp[0] - A[0], dy = Bp[1] - A[1], t = ((cx - A[0]) * dx + (cy - A[1]) * dy) / (dx * dx + dy * dy), fx2 = A[0] + t * dx, fy2 = A[1] + t * dy, C2 = [2 * fx2 - cx, 2 * fy2 - cy];
    g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(cx, cy); g.lineTo(Bp[0], Bp[1]); g.closePath(); g.fill(); g.restore();
    g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = sz * 0.15; g.shadowOffsetX = -sx * sz * 0.04; g.shadowOffsetY = -sy * sz * 0.06;
    const gr = g.createLinearGradient(fx2, fy2, C2[0], C2[1]); gr.addColorStop(0, fx.peelBack); gr.addColorStop(1, shadeHex(fx.peelBack, -0.18));
    g.fillStyle = gr; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(C2[0], C2[1]); g.lineTo(Bp[0], Bp[1]); g.closePath(); g.fill(); g.restore();
  }
  const res = { canvas: out, pad: pad, w0: w };
  cache.set(k, res);
  while (cache.size > 24) cache.delete(cache.keys().next().value);
  return res;
}
function shadeHex(hex, k) { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * (1 + k)))); return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`; }
