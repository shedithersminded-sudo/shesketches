// Sticker looks: border, finish (gloss, holo, glitter, metal...), texture, puffy, wrinkles, wear, peeling corner, tint.
// Applied when a picture is drawn, so the original file is never changed and every setting can be undone.
import { paperTile, coverTile } from './paper.js';

export const FX_DEFAULT = { border: 0, borderColor: '#ffffff', borderStyle: 'solid', borderColor2: '#ff6ec7', outline2: 0, keyline: 0, keyColor: '#1a1a1a', glow: 0, glowColor: '#7df9ff', finish: 'none', finishAngle: 35, opacity: 1, finish2: 'none', finishAmt: 0.7, texture: 'none', texAmt: 0.5, puffy: 0, wrinkle: 0, wear: 0, peel: 0, peelCorner: 'br', peelBack: '#f4f1ea', tint: 0, tintColor: '#ff7aa8', tintMode: 'multiply', seed: 1 };

const FINISHES = { none: 'None', gloss: 'Glossy', satin: 'Satin', matte: 'Matte paper', vinyl: 'Vinyl', epoxy: 'Epoxy dome (3D gloss)', holo: 'Holographic', prism: 'Prism shards', galaxy: 'Galaxy holo', pearl: 'Pearl', chrome: 'Chrome mirror', metal: 'Metallic foil', glitter: 'Glitter', sparkle: 'Fine sparkle', frosted: 'Frosted', neon: 'Neon' };
export const FX_PARAMS = [
  { k: 'border', g: 'Border', label: 'Die-cut border', min: 0, max: 0.12, step: 0.002, pct: 1 / 0.12, help: 'A border around the shape, like a cut-out sticker.' },
  { k: 'borderColor', g: 'Border', label: 'Border color', type: 'color', help: 'Color of the border.' },
  { k: 'borderStyle', g: 'Border', label: 'Border style', type: 'select', options: { solid: 'Solid', twotone: 'Two colors', rainbow: 'Rainbow', gradient: 'Fade between two colors', dashed: 'Cut line (dashed)', stitched: 'Stitched', glitter: 'Glitter', chrome: 'Chrome', sketchy: 'Hand drawn' }, help: 'How the border looks.' },
  { k: 'borderColor2', g: 'Border', label: 'Second color', type: 'color', help: 'Used by two colors, fade, cut line and stitched.' },
  { k: 'outline2', g: 'Border', label: 'Outer line', min: 0, max: 0.04, step: 0.001, pct: 1 / 0.04, help: 'A thin line around the outside of the border, in the second color.' },
  { k: 'keyline', g: 'Border', label: 'Inner line', min: 0, max: 0.02, step: 0.0005, pct: 1 / 0.02, help: 'A thin line hugging the art, like a printed keyline.' },
  { k: 'keyColor', g: 'Border', label: 'Inner line color', type: 'color', help: 'Color of the inner line.' },
  { k: 'glow', g: 'Border', label: 'Glow', min: 0, max: 1, step: 0.01, pct: 1, help: 'A soft neon glow around the sticker.' },
  { k: 'glowColor', g: 'Border', label: 'Glow color', type: 'color', help: 'Color of the glow.' },
  { k: 'finish', g: 'Finish', label: 'Finish', type: 'select', options: FINISHES, help: 'The surface: shiny, rainbow, sparkly, metal and more.' },
  { k: 'finish2', g: 'Finish', label: 'Second finish', type: 'select', options: FINISHES, help: 'Stack a second finish, like holo plus glitter.' },
  { k: 'finishAngle', g: 'Finish', label: 'Shine angle', min: 0, max: 180, step: 1, unit: '°', help: 'Which way the shine and rainbow run.' },
  { k: 'finishAmt', g: 'Finish', label: 'Finish strength', min: 0, max: 1, step: 0.01, pct: 1, help: 'How strong the finish looks.' },
  { k: 'texture', g: 'Texture', label: 'Texture', type: 'select', options: { none: 'None', sketch: 'Paper', coldpress: 'Watercolor paper', kraft: 'Kraft paper', recycled: 'Recycled paper', crumpled: 'Crumpled paper', vintage: 'Old paper', canvas: 'Canvas', linen: 'Linen cloth', cloth: 'Book cloth', denim: 'Denim', leather: 'Leather', croc: 'Croc leather', suede: 'Felt', velvet: 'Velvet', cork: 'Cork', wood: 'Wood', marble: 'Marble', metal: 'Brushed metal', halftone: 'Print dots (halftone)', riso: 'Risograph grain', embroidery: 'Embroidery thread', crackle: 'Cracked', washi: 'Washi fibers', sandpaper: 'Rough grain' }, help: 'Prints the sticker onto a material, so the grain shows through.' },
  { k: 'texAmt', g: 'Texture', label: 'Texture strength', min: 0, max: 1, step: 0.01, pct: 1, help: 'How much the material shows.' },
  { k: 'puffy', g: 'Texture', label: 'Puffy', min: 0, max: 1, step: 0.01, pct: 1, help: 'Raised, rounded edges like a puffy or foam sticker.' },
  { k: 'wrinkle', g: 'Texture', label: 'Wrinkles', min: 0, max: 1, step: 0.01, pct: 1, help: 'Creases, like a sticker that was stuck on a little badly.' },
  { k: 'wear', g: 'Age', label: 'Worn and scratched', min: 0, max: 1, step: 0.01, pct: 1, help: 'Scratches and rubbed-off spots, like an old sticker.' },
  { k: 'peel', g: 'Age', label: 'Peeling corner', min: 0, max: 1, step: 0.01, pct: 1, help: 'One corner lifts and folds back. Works best on square and round-cornered stickers.' },
  { k: 'peelCorner', g: 'Age', label: 'Which corner', type: 'select', options: { br: 'Bottom right', bl: 'Bottom left', tr: 'Top right', tl: 'Top left' }, help: 'The corner that peels.' },
  { k: 'peelBack', g: 'Age', label: 'Back of the sticker', type: 'color', help: 'Color of the folded-back paper.' },
  { k: 'opacity', g: 'Color', label: 'See-through', min: 0.1, max: 1, step: 0.01, pct: 1, help: 'Lower it for a clear or frosted sticker.' },
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
  chrome: { name: 'Chrome', border: 0.03, borderStyle: 'chrome', finish: 'chrome', finishAmt: 0.8 },
  pearl: { name: 'Pearl', border: 0.03, finish: 'pearl', finishAmt: 0.8 },
  galaxy: { name: 'Galaxy holo', border: 0.03, borderStyle: 'rainbow', finish: 'galaxy', finishAmt: 0.85 },
  prism: { name: 'Prism', border: 0.03, finish: 'prism', finishAmt: 0.8 },
  epoxy: { name: 'Epoxy dome', border: 0.02, finish: 'epoxy', finishAmt: 0.9, puffy: 0.5 },
  clear: { name: 'Clear vinyl', finish: 'gloss', finishAmt: 0.5, opacity: 0.7 },
  frosted: { name: 'Frosted', border: 0.03, finish: 'frosted', finishAmt: 0.7, opacity: 0.85 },
  neon: { name: 'Neon', border: 0.015, borderColor: '#111111', glow: 0.8, glowColor: '#ff3df2', finish: 'neon', finishAmt: 0.6 },
  rainbowGlitter: { name: 'Rainbow glitter', border: 0.035, borderStyle: 'glitter', finish: 'glitter', finishAmt: 0.9, finish2: 'holo' },
  enamel: { name: 'Enamel pin', border: 0.025, borderStyle: 'chrome', borderColor: '#d8b25a', keyline: 0.004, keyColor: '#8a6a2a', finish: 'epoxy', finishAmt: 0.7 },
  embroidered: { name: 'Embroidered', border: 0.045, borderStyle: 'stitched', borderColor: '#2a2a2c', borderColor2: '#f2c94c', texture: 'embroidery', texAmt: 0.8, puffy: 0.4 },
  street: { name: 'Street slap', border: 0.05, outline2: 0.006, borderColor2: '#111111', finish: 'vinyl', finishAmt: 0.5, wear: 0.35, wrinkle: 0.2 },
  riso: { name: 'Risograph', texture: 'riso', texAmt: 0.8, tint: 0.2, tintColor: '#ff5a8a', tintMode: 'multiply', finish: 'matte', finishAmt: 0.6 },
  halftone: { name: 'Comic print', border: 0.03, keyline: 0.006, texture: 'halftone', texAmt: 0.7 },
  kawaii: { name: 'Kawaii', border: 0.045, borderStyle: 'twotone', borderColor: '#ffffff', borderColor2: '#ff9ccf', outline2: 0.005, finish: 'gloss', finishAmt: 0.5, finish2: 'sparkle' },
  cutline: { name: 'Cut line', border: 0.04, borderStyle: 'dashed', borderColor2: '#9a9a9a', finish: 'matte', finishAmt: 0.4 },
  sketchy: { name: 'Doodle', border: 0.035, borderStyle: 'sketchy', borderColor2: '#1a1a1a', texture: 'sketch', texAmt: 0.5 },
  washi: { name: 'Washi paper', texture: 'washi', texAmt: 0.8, opacity: 0.85, finish: 'matte', finishAmt: 0.4 },
  velvet: { name: 'Velvet', border: 0.03, texture: 'velvet', texAmt: 0.8, puffy: 0.3 },
  wood: { name: 'Wood cut', border: 0.03, borderColor: '#c9a06a', texture: 'wood', texAmt: 0.75, finish: 'satin', finishAmt: 0.4 },
  cracked: { name: 'Cracked', border: 0.03, texture: 'crackle', texAmt: 0.8, wear: 0.3 },
};

const FX_PASSIVE = new Set(['seed', 'borderColor', 'borderColor2', 'borderStyle', 'keyColor', 'glowColor', 'tintColor', 'tintMode', 'peelCorner', 'peelBack', 'finishAmt', 'texAmt', 'finishAngle']);
export const hasFx = fx => !!fx && Object.keys(FX_DEFAULT).some(k => !FX_PASSIVE.has(k) && fx[k] != null && fx[k] !== FX_DEFAULT[k]);

// textures made here: print dots, riso grain, thread, cracks, fibers, grit
const GEN_TEX = { halftone: 1, riso: 1, embroidery: 1, crackle: 1, washi: 1, sandpaper: 1 }, genCache = new Map();
function genTex(kind) {
  if (genCache.has(kind)) return genCache.get(kind);
  const N = 512, c = mk(N, N), g = c.getContext('2d'); let sd = 17; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, N, N);
  if (kind === 'halftone') { g.fillStyle = '#3a3a3a'; for (let y = 0; y < N; y += 12) for (let x = (y / 12 & 1) * 6; x < N; x += 12) { g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill(); } }
  if (kind === 'riso') { const id = g.getImageData(0, 0, N, N), d = id.data; for (let i = 0; i < N * N; i++) { const v = 154 + (rnd() - 0.5) * 140 * (rnd() < 0.3 ? 1 : 0.4); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; } g.putImageData(id, 0, 0); }
  if (kind === 'embroidery') { g.lineWidth = 3; for (let y = 0; y < N; y += 5) for (let x = 0; x < N; x += 14) { const o = (y / 5 & 1) * 7; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.moveTo(x + o, y); g.lineTo(x + o + 12, y + 3); g.stroke(); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(x + o, y + 2); g.lineTo(x + o + 12, y + 5); g.stroke(); } }
  if (kind === 'crackle') { g.strokeStyle = 'rgba(40,40,40,0.9)'; for (let i = 0; i < 90; i++) { let x = rnd() * N, y = rnd() * N; g.lineWidth = 0.6 + rnd() * 1.4; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 90; y += (rnd() - 0.5) * 90; g.lineTo(x, y); } g.stroke(); } }
  if (kind === 'washi') { for (let i = 0; i < 700; i++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '60,60,60'},${0.15 + rnd() * 0.3})`; g.lineWidth = 0.5 + rnd(); const x = rnd() * N, y = rnd() * N, a = rnd() * 6.28, l = 10 + rnd() * 50; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 1) * l / 2, y + Math.sin(a + 1) * l / 2, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } }
  if (kind === 'sandpaper') { for (let i = 0; i < 26000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'; g.fillRect(rnd() * N, rnd() * N, 1 + rnd() * 1.5, 1 + rnd() * 1.5); } }
  genCache.set(kind, c); return c;
}
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
  const bw = Math.round(fx.border * M), pad = bw + Math.round((fx.outline2 || 0) * M) + Math.ceil(fx.peel * 0.04 * M) + Math.ceil((fx.glow || 0) * M * 0.09) + 4;
  const W = w + pad * 2, H = h + pad * 2;
  let sd = (fx.seed || 1) * 7919; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const out = mk(W, H), g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  // glow: a soft colored halo behind everything
  if (fx.glow > 0) {
    const gl = mk(W, H), gg = gl.getContext('2d'); gg.drawImage(src, pad, pad, w, h); gg.globalCompositeOperation = 'source-in'; gg.fillStyle = fx.glowColor; gg.fillRect(0, 0, W, H);
    g.save(); g.filter = `blur(${Math.max(2, M * 0.03 * fx.glow)}px)`; g.globalAlpha = Math.min(1, 0.6 + fx.glow * 0.4); for (let i = 0; i < 3; i++) g.drawImage(gl, 0, 0); g.restore();
  }
  // border: grow the silhouette outward, then color it in the chosen style
  const ring = (r, color) => { // the silhouette grown by r, filled with one color
    const c = mk(W, H), cg = c.getContext('2d'), sil = mk(W, H), sg = sil.getContext('2d');
    sg.drawImage(src, pad, pad, w, h); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = color; sg.fillRect(0, 0, W, H);
    const steps = Math.max(24, Math.min(64, Math.round(r))); for (const rr of [r, r * 0.66, r * 0.33]) for (let i = 0; i < steps; i++) { const a = i / steps * Math.PI * 2; cg.drawImage(sil, Math.cos(a) * rr, Math.sin(a) * rr); }
    cg.drawImage(sil, 0, 0); return c;
  };
  const o2 = Math.round((fx.outline2 || 0) * M);
  if (bw > 0 && o2 > 0) g.drawImage(ring(bw + o2, fx.borderColor2), 0, 0);
  if (bw > 0) {
    const bc = ring(bw, fx.borderColor), bg2 = bc.getContext('2d'), st = fx.borderStyle || 'solid';
    const recolor = paint => { bg2.save(); bg2.globalCompositeOperation = 'source-in'; paint(bg2); bg2.restore(); };
    const ang = (fx.finishAngle ?? 35) * Math.PI / 180, lin = (c0, c1) => { const gr = bg2.createLinearGradient(W / 2 - Math.cos(ang) * W / 2, H / 2 - Math.sin(ang) * H / 2, W / 2 + Math.cos(ang) * W / 2, H / 2 + Math.sin(ang) * H / 2); c0.forEach((c, i) => gr.addColorStop(i / (c0.length - 1), c)); return gr; };
    if (st === 'twotone') { const inner = ring(bw * 0.55, fx.borderColor); recolor(x => { x.fillStyle = fx.borderColor2; x.fillRect(0, 0, W, H); }); bg2.drawImage(inner, 0, 0); }
    else if (st === 'rainbow') recolor(x => { const gr = x.createConicGradient(ang, W / 2, H / 2); ['#ff5a5a', '#ffb347', '#fff36e', '#6eff9a', '#6ec8ff', '#a36eff', '#ff6ec7', '#ff5a5a'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c)); x.fillStyle = gr; x.fillRect(0, 0, W, H); });
    else if (st === 'gradient') recolor(x => { x.fillStyle = lin([fx.borderColor, fx.borderColor2]); x.fillRect(0, 0, W, H); });
    else if (st === 'chrome') recolor(x => { const cs = []; for (let i = 0; i <= 10; i++) cs.push(i % 2 ? shadeHex(fx.borderColor, 0.35) : shadeHex(fx.borderColor, -0.45)); x.fillStyle = lin(cs); x.fillRect(0, 0, W, H); });
    else if (st === 'glitter') recolor(x => { x.fillStyle = fx.borderColor; x.fillRect(0, 0, W, H); const n = Math.round(W * H / 60); for (let i = 0; i < n; i++) { x.fillStyle = `hsl(${rnd() * 360},90%,${60 + rnd() * 35}%)`; const r = 0.8 + rnd() * Math.max(1, M / 500); x.fillRect(rnd() * W, rnd() * H, r, r); } });
    g.drawImage(bc, 0, 0);
    // lines drawn along the border: cut line, stitches, hand-drawn outline
    if (st === 'dashed' || st === 'stitched' || st === 'sketchy') {
      const edgeAt = st === 'stitched' ? bw * 0.5 : st === 'dashed' ? bw * 0.92 : bw;
      const outer = ring(edgeAt, '#000'), inner = ring(Math.max(0, edgeAt - Math.max(1.2, M / 450) * (st === 'sketchy' ? 2.2 : 1.4)), '#000');
      const line = mk(W, H), lg = line.getContext('2d'); lg.drawImage(outer, 0, 0); lg.globalCompositeOperation = 'destination-out'; lg.drawImage(inner, 0, 0);
      lg.globalCompositeOperation = 'source-in'; lg.fillStyle = fx.borderColor2; lg.fillRect(0, 0, W, H);
      if (st !== 'sketchy') { // break the line into dashes around the shape
        const dash = mk(W, H), dg = dash.getContext('2d'), cg2 = dg.createConicGradient(0, W / 2, H / 2), n = Math.round((W + H) / Math.max(10, M / 50));
        for (let i = 0; i < n; i++) { cg2.addColorStop(i / n, 'rgba(0,0,0,1)'); cg2.addColorStop((i + 0.55) / n, 'rgba(0,0,0,1)'); cg2.addColorStop(Math.min(1, (i + 0.56) / n), 'rgba(0,0,0,0)'); cg2.addColorStop(Math.min(1, (i + 0.99) / n), 'rgba(0,0,0,0)'); }
        dg.fillStyle = cg2; dg.fillRect(0, 0, W, H); masked(line, dash);
      } else { lg.globalCompositeOperation = 'source-over'; const j = line; g.save(); g.globalAlpha = 0.5; g.drawImage(j, M / 500, -M / 600); g.restore(); }
      g.drawImage(line, 0, 0);
    }
  }
  g.drawImage(src, pad, pad, w, h);
  if (fx.keyline > 0) {
    const kw = Math.max(1, fx.keyline * M), k1 = ringOf(src, pad, w, h, W, H, kw, fx.keyColor);
    const cut = mk(W, H), cg = cut.getContext('2d'); cg.drawImage(k1, 0, 0); cg.globalCompositeOperation = 'destination-out'; cg.drawImage(src, pad, pad, w, h);
    g.drawImage(cut, 0, 0);
  }
  const shape = mk(W, H); shape.getContext('2d').drawImage(out, 0, 0); // the full sticker shape incl. border
  // tint
  if (fx.tint > 0) { const t = mk(W, H), tg = t.getContext('2d'); tg.fillStyle = fx.tintColor; tg.fillRect(0, 0, W, H); masked(t, shape); layer(out, t, fx.tintMode, fx.tint); }
  // texture: material grain printed through
  if (fx.texture !== 'none' && fx.texAmt > 0) {
    const covers = { linen: 1, denim: 1, leather: 1, cork: 1, suede: 1, croc: 1, velvet: 1, wood: 1, marble: 1, metal: 1, cloth: 1 };
    const tile = GEN_TEX[fx.texture] ? genTex(fx.texture) : covers[fx.texture] ? coverTile(fx.texture, '#9a9a9a').canvas : paperTile(fx.texture).canvas;
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
  // finish (and an optional second finish on top)
  const a = fx.finishAmt;
  for (const fin of [fx.finish, fx.finish2]) {
  if (!fin || fin === 'none' || a <= 0) continue;
  const fxF = { ...fx, finish: fin };
  {
    const fx = fxF;
    const t = mk(W, H), tg = t.getContext('2d');
    const ang = (fx.finishAngle ?? 35) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const lin = (...stops) => { const gr = tg.createLinearGradient(W / 2 - ca * W * 0.6, H / 2 - sa * H * 0.6, W / 2 + ca * W * 0.6, H / 2 + sa * H * 0.6); stops.forEach(([p, c]) => gr.addColorStop(p, c)); return gr; };
    if (fx.finish === 'epoxy') { // a clear resin dome: bright rim light, soft center highlight
      const b = mk(W, H), bg3 = b.getContext('2d'); bg3.filter = `blur(${Math.max(2, M * 0.025)}px)`; bg3.drawImage(shape, 0, 0);
      tg.drawImage(b, -M * 0.012, -M * 0.012); tg.globalCompositeOperation = 'destination-out'; tg.drawImage(b, M * 0.012, M * 0.012); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#fff'; tg.fillRect(0, 0, W, H);
      tg.globalCompositeOperation = 'source-over'; const rg = tg.createRadialGradient(W * 0.35, H * 0.3, 0, W * 0.35, H * 0.3, M * 0.35); rg.addColorStop(0, 'rgba(255,255,255,0.6)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); tg.fillStyle = rg; tg.fillRect(0, 0, W, H);
      masked(t, shape); layer(out, t, 'screen', a);
      continue;
    }
    if (fx.finish === 'pearl') { tg.fillStyle = lin([0, '#ffe3f1'], [0.3, '#e3f6ff'], [0.55, '#fff6dc'], [0.8, '#e9e1ff'], [1, '#ffe3f1']); tg.fillRect(0, 0, W, H); masked(t, shape); layer(out, t, 'soft-light', a); layer(out, t, 'screen', a * 0.35); continue; }
    if (fx.finish === 'chrome') { const st = []; for (let i = 0; i <= 12; i++) st.push([i / 12, i % 3 === 0 ? 'rgba(255,255,255,0.95)' : i % 3 === 1 ? 'rgba(30,30,40,0.7)' : 'rgba(150,160,175,0.6)']); tg.fillStyle = lin(...st); tg.fillRect(0, 0, W, H); masked(t, shape); const gray = mk(W, H), gg = gray.getContext('2d'); gg.filter = 'grayscale(1) contrast(1.4)'; gg.drawImage(out, 0, 0); layer(out, gray, 'source-atop', a * 0.7); layer(out, t, 'overlay', a); layer(out, t, 'screen', a * 0.25); continue; }
    if (fx.finish === 'prism') { for (let i = 0; i < 40; i++) { tg.fillStyle = `hsla(${rnd() * 360},100%,65%,0.8)`; tg.beginPath(); const x = rnd() * W, y = rnd() * H, r = (0.05 + rnd() * 0.15) * M; tg.moveTo(x, y - r); tg.lineTo(x + r * (rnd() + 0.3), y + r * 0.6); tg.lineTo(x - r * (rnd() + 0.3), y + r * (rnd() * 0.8)); tg.closePath(); tg.fill(); } masked(t, shape); layer(out, t, 'overlay', a); layer(out, t, 'soft-light', a * 0.5); continue; }
    if (fx.finish === 'galaxy') { tg.fillStyle = lin([0, '#3a1c71'], [0.35, '#d76d77'], [0.65, '#4ac6ff'], [1, '#7a3cff']); tg.fillRect(0, 0, W, H); for (let i = 0; i < W * H / 900; i++) { tg.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`; const r = 0.5 + rnd() * Math.max(1, M / 600); tg.fillRect(rnd() * W, rnd() * H, r, r); } masked(t, shape); layer(out, t, 'overlay', a); layer(out, t, 'screen', a * 0.3); continue; }
    if (fx.finish === 'sparkle') { const n = Math.round(W * H / 160 * a); for (let i = 0; i < n; i++) { tg.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; tg.fillRect(rnd() * W, rnd() * H, 1, 1); } masked(t, shape); layer(out, t, 'screen', 1); continue; }
    if (fx.finish === 'frosted') { const b = mk(W, H), bg3 = b.getContext('2d'); bg3.filter = `blur(${Math.max(1, M / 300)}px) brightness(1.12) saturate(0.8)`; bg3.drawImage(out, 0, 0); layer(out, b, 'source-atop', a); tg.fillStyle = 'rgba(255,255,255,0.25)'; tg.fillRect(0, 0, W, H); masked(t, shape); layer(out, t, 'screen', a); continue; }
    if (fx.finish === 'neon') { const b = mk(W, H), bg3 = b.getContext('2d'); bg3.filter = 'saturate(1.8) brightness(1.15)'; bg3.drawImage(out, 0, 0); layer(out, b, 'source-atop', a); continue; }
    if (fx.finish === 'gloss' || fx.finish === 'vinyl' || fx.finish === 'satin') {
      const gr = tg.createLinearGradient(W / 2 - ca * W * 0.6, H / 2 - sa * H * 0.6, W / 2 + ca * W * 0.6, H / 2 + sa * H * 0.6);
      const sharp = fx.finish === 'vinyl' ? 0.02 : fx.finish === 'satin' ? 0.18 : 0.08;
      gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(Math.max(0, 0.32 - sharp), 'rgba(255,255,255,0)'); gr.addColorStop(0.36, `rgba(255,255,255,${fx.finish === 'satin' ? 0.35 : 0.75})`); gr.addColorStop(Math.min(1, 0.4 + sharp), 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.08)');
      tg.fillStyle = gr; tg.fillRect(0, 0, W, H); masked(t, shape); layer(out, t, 'screen', a);
    } else if (fx.finish === 'holo') {
      const gr = tg.createLinearGradient(W / 2 - sa * W * 0.6, H / 2 + ca * H * 0.6, W / 2 + sa * W * 0.6, H / 2 - ca * H * 0.6);
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
  if (fx.opacity < 1) { const o = mk(W, H), og = o.getContext('2d'); og.globalAlpha = fx.opacity; og.drawImage(out, 0, 0); g.clearRect(0, 0, W, H); g.drawImage(o, 0, 0); }
  const res = { canvas: out, pad: pad, w0: w };
  cache.set(k, res);
  while (cache.size > 24) cache.delete(cache.keys().next().value);
  return res;
}
function ringOf(src, pad, w, h, W, H, r, color) {
  const c = mk(W, H), cg = c.getContext('2d'), sil = mk(W, H), sg = sil.getContext('2d');
  sg.drawImage(src, pad, pad, w, h); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = color; sg.fillRect(0, 0, W, H);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; cg.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r); }
  cg.drawImage(sil, 0, 0); return c;
}
function shadeHex(hex, k) { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * (1 + k)))); return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`; }
