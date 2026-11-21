// Makers: build scrapbook pieces in code. Every result is a cutout on a transparent background.
// Nothing here is a copied photo, so the public version can ship all of it.
import { paperTile, coverTile, PAPERS } from './paper.js';
import { Stroke, PRESETS, drawTool, impastoFinish } from './brushes.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const hexA = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
const shade = (hex, k) => { const [r, g, b] = rgb(hex); const f = v => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))).toString(16).padStart(2, '0'); return '#' + f(r) + f(g) + f(b); };
function rng(seed) { let s = (seed | 0) % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// a wobbly 1D noise for edges
function edgeNoise(r, n = 6) { const ph = Array.from({ length: n }, () => [r() * 6.283, 1 + r() * 2]); return t => { let v = 0; ph.forEach(([p, f], i) => v += Math.sin(t * f * (i + 1) * 2 + p) / (i + 1)); return v / 1.8; }; }

// torn outline around a rectangle. Returns points.
function tornRect(x, y, w, h, rough, r, step = 3) {
  const pts = [], n = edgeNoise(r), per = 2 * (w + h);
  for (let d = 0; d < per; d += step) {
    let px, py, nx, ny;
    if (d < w) { px = x + d; py = y; nx = 0; ny = -1; }
    else if (d < w + h) { px = x + w; py = y + d - w; nx = 1; ny = 0; }
    else if (d < 2 * w + h) { px = x + w - (d - w - h); py = y + h; nx = 0; ny = 1; }
    else { px = x; py = y + h - (d - 2 * w - h); nx = -1; ny = 0; }
    const o = (n(d / per * 9) * 0.6 + (r() - 0.5) * 0.9) * rough;
    pts.push([px + nx * o, py + ny * o]);
  }
  return pts;
}
// torn blob (for holes)
function tornBlob(cx, cy, rx, ry, rough, r, wob = 0.18) {
  const pts = [], n = edgeNoise(r, 5), N = Math.round((rx + ry) * 1.2);
  for (let i = 0; i < N; i++) {
    const a = i / N * 6.283, k = 1 + n(a) * wob + (r() - 0.5) * rough / Math.max(rx, ry);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}
const pathOf = (g, pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
function paperPattern(g, type, color, scale = 1) { const t = paperTile(type, color); const p = g.createPattern(t.canvas, 'repeat'); p.setTransform(new DOMMatrix().scale(scale)); return p; }
function mottle(g, w, h, r, amt = 0.08, dark = '90,60,30') {
  for (let i = 0; i < 10; i++) {
    const x = r() * w, y = r() * h, rad = (0.15 + r() * 0.4) * Math.max(w, h), gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, r() > 0.5 ? `rgba(255,255,255,${amt})` : `rgba(${dark},${amt})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
}
// crumple / fold lighting overlay
function crumple(g, w, h, r, amt) {
  if (!amt) return;
  g.save(); g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 18 * amt; i++) {
    const x1 = r() * w, y1 = r() * h, a = r() * 6.283, L = (0.3 + r() * 0.7) * Math.max(w, h);
    const x2 = x1 + Math.cos(a) * L, y2 = y1 + Math.sin(a) * L;
    const gr = g.createLinearGradient(x1, y1, x1 - Math.sin(a) * 30, y1 + Math.cos(a) * 30);
    gr.addColorStop(0, `rgba(255,255,255,${0.12 * amt})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.strokeStyle = `rgba(0,0,0,${0.10 * amt})`; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = `rgba(255,255,255,${0.16 * amt})`; g.beginPath(); g.moveTo(x1 + 1.5, y1 + 1.5); g.lineTo(x2 + 1.5, y2 + 1.5); g.stroke();
  }
  g.restore();
}
function trim(c, pad = 6) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) return c;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
  const o = mk(x1 - x0 + 1, y1 - y0 + 1); o.getContext('2d').drawImage(c, -x0, -y0); return o;
}

const R = (k, l, min, max, def, step = 1) => ({ k, l, t: 'r', min, max, def, step });
const C = (k, l, def) => ({ k, l, t: 'c', def });
const S = (k, l, o, def) => ({ k, l, t: 's', o, def });
const B = (k, l, def) => ({ k, l, t: 'b', def });
const T = (k, l, def) => ({ k, l, t: 'txt', def });
const paperOpts = Object.fromEntries(Object.entries(PAPERS).map(([k, v]) => [k, v.name]));
const FONT_OPTS = { 'Ink Free': 'Handwritten', 'Segoe Print': 'Marker hand', 'Courier New': 'Typewriter', 'Arial Black': 'Bold print', Georgia: 'Book serif', Impact: 'Poster' };


// ---------- cute sticker shapes for scrapbooks ----------
const SHAPES = {
  heart: (g, R) => { g.moveTo(0, R * 0.9); g.bezierCurveTo(-R * 1.3, -R * 0.05, -R * 0.7, -R * 1.05, 0, -R * 0.45); g.bezierCurveTo(R * 0.7, -R * 1.05, R * 1.3, -R * 0.05, 0, R * 0.9); },
  star: (g, R) => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.45 : R; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } },
  sparkle: (g, R) => { for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4, r = i % 2 ? R * 0.22 : R; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } },
  flower: (g, R) => { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; g.moveTo(Math.cos(a) * R * 0.5 + R * 0.45 * Math.cos(a), Math.sin(a) * R * 0.5 + R * 0.45 * Math.sin(a)); g.arc(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, R * 0.45, a, a + Math.PI * 2); } },
  daisy: (g, R) => { for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; g.moveTo(0, 0); g.ellipse(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, R * 0.45, R * 0.13, a, 0, Math.PI * 2); } },
  cloud: (g, R) => { for (const [x, y, r] of [[-0.5, 0.15, 0.4], [-0.1, -0.15, 0.5], [0.42, 0.05, 0.42], [0.1, 0.32, 0.38], [-0.35, 0.38, 0.3]]) { g.moveTo(x * R + r * R, y * R); g.arc(x * R, y * R, r * R, 0, Math.PI * 2); } },
  moon: (g, R) => { g.arc(0, 0, R * 0.9, Math.PI * 0.35, Math.PI * 1.65); g.arc(R * 0.42, -R * 0.1, R * 0.7, Math.PI * 1.45, Math.PI * 0.55, true); },
  sun: (g, R) => { g.arc(0, 0, R * 0.55, 0, Math.PI * 2); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.moveTo(Math.cos(a - 0.12) * R * 0.62, Math.sin(a - 0.12) * R * 0.62); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.lineTo(Math.cos(a + 0.12) * R * 0.62, Math.sin(a + 0.12) * R * 0.62); } },
  butterfly: (g, R) => { for (const sx of [-1, 1]) { g.moveTo(0, 0); g.ellipse(sx * R * 0.48, -R * 0.3, R * 0.5, R * 0.4, sx * -0.5, 0, Math.PI * 2); g.moveTo(0, 0); g.ellipse(sx * R * 0.38, R * 0.38, R * 0.36, R * 0.3, sx * 0.6, 0, Math.PI * 2); } g.moveTo(R * 0.07, -R * 0.55); g.ellipse(0, 0, R * 0.07, R * 0.6, 0, 0, Math.PI * 2); },
  cherry: (g, R) => { g.moveTo(-R * 0.05, R * 0.45); g.arc(-R * 0.4, R * 0.45, R * 0.36, 0, Math.PI * 2); g.moveTo(R * 0.76, R * 0.35); g.arc(R * 0.4, R * 0.35, R * 0.36, 0, Math.PI * 2); g.moveTo(R * 0.1, -R * 0.75); g.ellipse(R * 0.3, -R * 0.75, R * 0.32, R * 0.14, -0.3, 0, Math.PI * 2); },
  bow: (g, R) => { g.moveTo(0, 0); g.bezierCurveTo(-R * 0.4, -R * 0.7, -R * 1.05, -R * 0.55, -R * 0.95, 0); g.bezierCurveTo(-R * 1.05, R * 0.55, -R * 0.4, R * 0.7, 0, 0); g.bezierCurveTo(R * 0.4, -R * 0.7, R * 1.05, -R * 0.55, R * 0.95, 0); g.bezierCurveTo(R * 1.05, R * 0.55, R * 0.4, R * 0.7, 0, 0); g.moveTo(-R * 0.1, R * 0.1); g.lineTo(-R * 0.45, R * 0.95); g.lineTo(-R * 0.25, R * 0.85); g.lineTo(-R * 0.15, R * 1); g.lineTo(0, R * 0.12); g.lineTo(R * 0.15, R * 1); g.lineTo(R * 0.25, R * 0.85); g.lineTo(R * 0.45, R * 0.95); g.lineTo(R * 0.1, R * 0.1); g.moveTo(R * 0.16, 0); g.arc(0, 0, R * 0.16, 0, Math.PI * 2); },
  rainbow: (g, R) => { g.arc(0, R * 0.35, R, Math.PI, 0); g.lineTo(R * 0.45, R * 0.35); g.arc(0, R * 0.35, R * 0.45, 0, Math.PI, true); },
  mushroom: (g, R) => { g.moveTo(-R, 0); g.bezierCurveTo(-R, -R * 1.1, R, -R * 1.1, R, 0); g.closePath(); g.moveTo(-R * 0.3, 0); g.lineTo(-R * 0.35, R * 0.85); g.quadraticCurveTo(0, R * 0.95, R * 0.35, R * 0.85); g.lineTo(R * 0.3, 0); },
  leaf: (g, R) => { g.moveTo(0, -R); g.bezierCurveTo(R * 0.9, -R * 0.4, R * 0.6, R * 0.6, 0, R); g.bezierCurveTo(-R * 0.6, R * 0.6, -R * 0.9, -R * 0.4, 0, -R); },
  bolt: (g, R) => { [[0.15, -1], [-0.55, 0.12], [-0.05, 0.12], [-0.25, 1], [0.6, -0.2], [0.08, -0.2], [0.35, -1]].forEach(([x, y]) => g.lineTo(x * R, y * R)); },
  bubble: (g, R) => { g.ellipse(0, -R * 0.1, R, R * 0.72, 0, 0, Math.PI * 2); g.moveTo(-R * 0.35, R * 0.45); g.lineTo(-R * 0.6, R * 0.98); g.lineTo(R * 0.05, R * 0.55); },
  banner: (g, R) => { const h = R * 0.36; [[-R, -h], [R, -h], [R * 0.82, 0], [R, h], [-R, h], [-R * 0.82, 0]].forEach(([x, y]) => g.lineTo(x, y)); },
  badge: (g, R) => { for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2, r = R * (0.9 + 0.08 * Math.cos(a * 16)); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } },
  label: (g, R) => { g.roundRect(-R, -R * 0.42, R * 2, R * 0.84, R * 0.42); },
  arrow: (g, R) => { [[-R, -R * 0.18], [R * 0.3, -R * 0.18], [R * 0.3, -R * 0.5], [R, 0], [R * 0.3, R * 0.5], [R * 0.3, R * 0.18], [-R, R * 0.18]].forEach(([x, y]) => g.lineTo(x, y)); },
  note: (g, R) => { g.ellipse(-R * 0.3, R * 0.55, R * 0.35, R * 0.26, -0.4, 0, Math.PI * 2); g.moveTo(-R * 0.02, R * 0.55); g.lineTo(-R * 0.02, -R * 0.9); g.lineTo(R * 0.6, -R * 0.65); g.lineTo(R * 0.6, -R * 0.4); g.lineTo(R * 0.1, -R * 0.6); g.lineTo(R * 0.1, R * 0.55); },
  crown: (g, R) => { [[-R, R * 0.6], [-R, -R * 0.5], [-R * 0.5, 0], [0, -R * 0.8], [R * 0.5, 0], [R, -R * 0.5], [R, R * 0.6]].forEach(([x, y]) => g.lineTo(x, y)); },
  smiley: (g, R) => { g.arc(0, 0, R * 0.95, 0, Math.PI * 2); },
  planet: (g, R) => { g.arc(0, 0, R * 0.55, 0, Math.PI * 2); g.moveTo(R, 0); g.ellipse(0, 0, R, R * 0.28, -0.35, 0, Math.PI * 2); },
  strawberry: (g, R) => { g.moveTo(0, R); g.bezierCurveTo(-R * 1.05, R * 0.2, -R * 0.75, -R * 0.7, 0, -R * 0.55); g.bezierCurveTo(R * 0.75, -R * 0.7, R * 1.05, R * 0.2, 0, R); },
  tulip: (g, R) => { g.moveTo(-R * 0.55, -R * 0.75); g.lineTo(-R * 0.25, -R * 0.4); g.lineTo(0, -R * 0.85); g.lineTo(R * 0.25, -R * 0.4); g.lineTo(R * 0.55, -R * 0.75); g.bezierCurveTo(R * 0.7, R * 0.1, R * 0.25, R * 0.25, 0, R * 0.25); g.bezierCurveTo(-R * 0.25, R * 0.25, -R * 0.7, R * 0.1, -R * 0.55, -R * 0.75); g.moveTo(R * 0.04, R * 0.2); g.lineTo(R * 0.04, R); g.lineTo(-R * 0.04, R); g.lineTo(-R * 0.04, R * 0.2); },
  circle: (g, R) => { g.arc(0, 0, R, 0, Math.PI * 2); },
};
const SHAPE_NAMES = { heart: 'Heart', star: 'Star', sparkle: 'Sparkle', flower: 'Flower', daisy: 'Daisy', tulip: 'Tulip', cloud: 'Cloud', moon: 'Moon', sun: 'Sun', butterfly: 'Butterfly', cherry: 'Cherries', strawberry: 'Strawberry', bow: 'Bow', rainbow: 'Rainbow', mushroom: 'Mushroom', leaf: 'Leaf', bolt: 'Lightning', bubble: 'Speech bubble', banner: 'Banner', badge: 'Badge', label: 'Label', arrow: 'Arrow', note: 'Music note', crown: 'Crown', smiley: 'Smiley', planet: 'Planet', circle: 'Circle' };
function cuteSticker(p, r) {
  const S = 1000, pad = 90 + p.border, c = mk(S + pad * 2, S + pad * 2), g = c.getContext('2d'), R = S * 0.42, cx = c.width / 2, cy = c.height / 2;
  const shape = mk(c.width, c.height), sg = shape.getContext('2d');
  sg.translate(cx, cy); sg.rotate((p.tilt || 0) * Math.PI / 180); sg.fillStyle = p.color; sg.beginPath(); SHAPES[p.shape](sg, R); sg.closePath(); sg.fill('nonzero');
  sg.setTransform(1, 0, 0, 1, 0, 0);
  // pattern printed on the shape
  sg.save(); sg.globalCompositeOperation = 'source-atop'; sg.fillStyle = p.color2; sg.strokeStyle = p.color2; sg.globalAlpha = 0.9;
  if (p.pattern === 'dots') for (let y = 0; y < c.height; y += 70) for (let x = (y / 70 & 1) * 35; x < c.width; x += 70) { sg.beginPath(); sg.arc(x, y, 14, 0, 7); sg.fill(); }
  if (p.pattern === 'stripes') { sg.lineWidth = 34; for (let x = -c.height; x < c.width; x += 90) { sg.beginPath(); sg.moveTo(x, 0); sg.lineTo(x + c.height, c.height); sg.stroke(); } }
  if (p.pattern === 'gingham') { sg.globalAlpha = 0.45; for (let x = 0; x < c.width; x += 120) sg.fillRect(x, 0, 60, c.height); for (let y = 0; y < c.height; y += 120) sg.fillRect(0, y, c.width, 60); }
  if (p.pattern === 'checker') { for (let y = 0; y < c.height; y += 100) for (let x = (y / 100 & 1) * 100; x < c.width; x += 200) sg.fillRect(x, y, 100, 100); }
  if (p.pattern === 'hearts') { sg.font = '70px serif'; for (let y = 40; y < c.height; y += 110) for (let x = (y / 110 & 1) * 55; x < c.width; x += 110) sg.fillText('♥', x, y); }
  if (p.pattern === 'stars') { sg.font = '64px serif'; for (let y = 40; y < c.height; y += 110) for (let x = (y / 110 & 1) * 55; x < c.width; x += 110) sg.fillText('★', x, y); }
  if (p.pattern === 'fade') { sg.globalAlpha = 1; const gr = sg.createLinearGradient(0, cy - R, 0, cy + R); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, p.color2); sg.fillStyle = gr; sg.fillRect(0, 0, c.width, c.height); }
  sg.restore();
  // cartoon shine and a soft inner shadow
  if (p.shine) {
    sg.save(); sg.globalCompositeOperation = 'source-atop';
    const gr = sg.createRadialGradient(cx - R * 0.35, cy - R * 0.4, 0, cx - R * 0.35, cy - R * 0.4, R * 0.55); gr.addColorStop(0, 'rgba(255,255,255,0.65)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, c.width, c.height);
    const sh = sg.createLinearGradient(0, cy - R, 0, cy + R); sh.addColorStop(0.55, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.18)'); sg.fillStyle = sh; sg.fillRect(0, 0, c.width, c.height); sg.restore();
  }
  // face on smileys and planets
  if (p.face) { sg.save(); sg.fillStyle = p.line; sg.translate(cx, cy); sg.beginPath(); sg.arc(-R * 0.25, -R * 0.12, R * 0.07, 0, 7); sg.arc(R * 0.25, -R * 0.12, R * 0.07, 0, 7); sg.fill(); sg.lineWidth = R * 0.05; sg.strokeStyle = p.line; sg.lineCap = 'round'; sg.beginPath(); sg.arc(0, R * 0.05, R * 0.3, 0.2 * Math.PI, 0.8 * Math.PI); sg.stroke(); sg.fillStyle = 'rgba(255,120,150,0.45)'; sg.beginPath(); sg.ellipse(-R * 0.48, R * 0.12, R * 0.12, R * 0.07, 0, 0, 7); sg.ellipse(R * 0.48, R * 0.12, R * 0.12, R * 0.07, 0, 0, 7); sg.fill(); sg.restore(); }
  // words on it
  if (p.text) {
    sg.save(); sg.translate(cx, cy); const fs = R * (p.shape === 'banner' || p.shape === 'label' ? 0.42 : 0.36) * (p.textSize || 1);
    sg.font = `${p.bold ? '700 ' : ''}${fs}px "${p.font}", "Segoe Print", cursive`; sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.lineJoin = 'round'; sg.lineWidth = fs * 0.12; sg.strokeStyle = p.color; sg.strokeText(p.text, 0, 0); sg.fillStyle = p.textColor; sg.fillText(p.text, 0, 0); sg.restore();
  }
  // outline line hugging the shape
  if (p.lineW > 0) {
    const o = mk(c.width, c.height), og = o.getContext('2d'), k = p.lineW;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; og.drawImage(shape, Math.cos(a) * k, Math.sin(a) * k); }
    og.globalCompositeOperation = 'source-in'; og.fillStyle = p.line; og.fillRect(0, 0, c.width, c.height); og.globalCompositeOperation = 'source-over'; og.drawImage(shape, 0, 0);
    sg.clearRect(0, 0, c.width, c.height); sg.drawImage(o, 0, 0);
  }
  // white die-cut border and a soft shadow line
  if (p.border > 0) {
    const b = mk(c.width, c.height), bg = b.getContext('2d');
    for (const k of [p.border, p.border * 0.6, p.border * 0.3]) for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; bg.drawImage(shape, Math.cos(a) * k, Math.sin(a) * k); }
    bg.globalCompositeOperation = 'source-in'; bg.fillStyle = p.borderColor; bg.fillRect(0, 0, c.width, c.height);
    g.save(); g.shadowColor = 'rgba(0,0,0,0.22)'; g.shadowBlur = 10; g.shadowOffsetY = 5; g.drawImage(b, 0, 0); g.restore();
  }
  g.drawImage(shape, 0, 0);
  return c;
}

// ---------- scrapbook pieces (inspired by collage journals) ----------
const PIECE_KINDS = { seal: 'Wax seal', key: 'Heart key charm', cutwords: 'Cut-out words', arch: 'Words in an arch', gem: 'Rhinestone', gems: 'Rhinestone strip', fancylabel: 'Scalloped label', receipt: 'Barcode receipt', safetypin: 'Safety pin', disco: 'Disco ball', checker: 'Checkerboard strip', burst: 'Starburst shape', flowerword: 'Flower with letters', roundbadge: 'Round text badge', oval: 'Oval text sticker', sign: 'Sign pictogram', locker: 'Locker door', note: 'Note paper with tape', binderclip: 'Binder clip', plasticclip: 'Plastic clip', spiral: 'Hypnotic spiral', window: 'Retro computer window', block: 'Bold block words', quote: 'Typed quote strip', dymo: 'Label maker tape', keycap: 'Keyboard key', facts: 'Facts label', wavypaper: 'Wavy lined paper', monoprint: 'Monoprint rings', oldposter: 'Old folded paper' };
function metalGrad(g, x0, y0, x1, y1, base) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  [[0, shade(base, 0.6)], [0.25, shade(base, -0.25)], [0.45, shade(base, 0.75)], [0.7, shade(base, -0.35)], [1, shade(base, 0.4)]].forEach(([p, c]) => gr.addColorStop(p, c));
  return gr;
}
function heartPath(g, x, y, R) { g.moveTo(x, y + R * 0.9); g.bezierCurveTo(x - R * 1.3, y - R * 0.05, x - R * 0.7, y - R * 1.05, x, y - R * 0.45); g.bezierCurveTo(x + R * 0.7, y - R * 1.05, x + R * 1.3, y - R * 0.05, x, y + R * 0.9); }
function textOnArc(g, text, cx, cy, R, a0, a1, fs) {
  const n = text.length; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)); g.save(); g.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.rotate(a + Math.PI / 2); g.fillText(text[i], 0, 0); g.restore(); }
}
function scrapPiece(p, r) {
  const k = p.kind, col = p.color, col2 = p.color2, txt = p.text || '', font = p.font;
  if (k === 'seal') {
    const S = 900, c = mk(S, S), g = c.getContext('2d'), cx = S / 2, R = S * 0.42;
    g.beginPath(); for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, rr = R * (1 + (r() - 0.5) * 0.06 + Math.sin(a * 5 + r()) * 0.025); g.lineTo(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr); } g.closePath();
    const gr = g.createRadialGradient(cx - R * 0.3, cx - R * 0.35, R * 0.1, cx, cx, R * 1.05); gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(0.7, col); gr.addColorStop(1, shade(col, -0.35));
    g.fillStyle = gr; g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 18; g.shadowOffsetY = 8; g.fill(); g.shadowColor = 'transparent';
    // pressed rim and the stamped emblem with light and shadow
    g.lineWidth = R * 0.05; g.strokeStyle = shade(col, -0.3); g.beginPath(); g.arc(cx + 3, cx + 4, R * 0.72, 0, 7); g.stroke(); g.strokeStyle = shade(col, 0.4); g.beginPath(); g.arc(cx - 2, cx - 3, R * 0.72, 0, 7); g.stroke();
    const emb = (dx, dy, fill) => { g.save(); g.translate(cx + dx, cx + dy); g.fillStyle = fill; g.beginPath(); if (p.emblem === 'heart') heartPath(g, 0, 0, R * 0.38); else if (p.emblem === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.18 : R * 0.42; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); } if (p.emblem !== 'letter') g.fill(); else { g.font = `700 ${R * 0.7}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((txt || 'S')[0].toUpperCase(), 0, R * 0.04); } g.restore(); };
    emb(4, 5, shade(col, -0.35)); emb(-3, -3, shade(col, 0.45)); emb(0, 0, shade(col, 0.05));
    if (p.shine) { g.globalCompositeOperation = 'source-atop'; const sh = g.createLinearGradient(0, 0, S, S); sh.addColorStop(0.3, 'rgba(255,255,255,0)'); sh.addColorStop(0.42, 'rgba(255,255,255,0.35)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(0, 0, S, S); }
    return c;
  }
  if (k === 'key') {
    const W = 700, H = 1100, c = mk(W, H), g = c.getContext('2d'), cx = W / 2, R = 230;
    g.save(); g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
    g.beginPath(); heartPath(g, cx, 330, R); g.rect(cx - 55, 520, 110, 470); g.moveTo(cx + 55, 760); g.lineTo(cx + 110, 790); g.lineTo(cx + 55, 830); g.lineTo(cx + 105, 870); g.lineTo(cx + 55, 910);
    g.moveTo(cx + 30, 120); g.arc(cx, 120, 30, 0, 7);
    g.fillStyle = metalGrad(g, 0, 0, W, H, col); g.fill('nonzero'); g.restore();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx, 120, 15, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 15, 560); g.lineTo(cx - 15, 960); g.moveTo(cx + 12, 560); g.lineTo(cx + 12, 960); g.stroke();
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(255,255,255,${0.1 + r() * 0.2})`; g.lineWidth = 1; const x = cx - 180 + r() * 360, y = 160 + r() * 380; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 10); g.stroke(); }
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(40,40,45,0.75)'; g.font = `600 ${p.size * 0.6}px Georgia, serif`; g.textAlign = 'center';
    const lines = (txt || 'always').split('\\n').join('\n').split('\n'); lines.forEach((ln, i) => g.fillText(ln, cx, 330 - (lines.length - 1) * p.size * 0.33 + i * p.size * 0.66));
    return c;
  }
  if (k === 'cutwords' || k === 'arch') {
    const words = (txt || (k === 'arch' ? 'slow down' : 'to love\nand be loved')).split('\\n').join('\n');
    const fs = p.size * 2.2, c = mk(2400, 1800), g = c.getContext('2d');
    g.font = `${p.bold ? '700 ' : ''}${fs}px "${font}", "Segoe Print", cursive`; g.textBaseline = 'middle';
    const piece = (x, y, w, h, rot, draw) => { g.save(); g.translate(x, y); g.rotate(rot); const pts = tornRect(-w / 2, -h / 2, w, h, p.rough, r, 6); g.save(); g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 8; g.shadowOffsetY = 4; pathOf(g, pts); g.fillStyle = paperPattern(g, p.paper, col2); g.fill(); g.restore();
      if (p.lines) { g.save(); pathOf(g, pts); g.clip(); g.strokeStyle = 'rgba(90,120,170,0.35)'; g.lineWidth = 2; for (let yy = -h / 2 + 18; yy < h / 2; yy += fs * 0.42) { g.beginPath(); g.moveTo(-w / 2, yy); g.lineTo(w / 2, yy); g.stroke(); } g.restore(); }
      draw(); g.restore(); };
    if (k === 'arch') {
      const t = words.replace(/\n/g, ' ').toUpperCase(), R = 700, cx = 1200, cy = 1150, n = t.length, a0 = Math.PI * 1.05, a1 = Math.PI * 1.95;
      g.save(); g.beginPath(); g.arc(cx, cy, R + fs * 0.75, a0 - 0.12, a1 + 0.12); g.arc(cx, cy, R - fs * 0.55, a1 + 0.12, a0 - 0.12, true); g.closePath(); g.shadowColor = 'rgba(0,0,0,0.2)'; g.shadowBlur = 8; g.fillStyle = paperPattern(g, p.paper, col2); g.fill(); g.restore();
      g.fillStyle = col; g.font = `700 ${fs * 0.85}px "${font}", Georgia, serif`; g.textAlign = 'center'; textOnArc(g, t, cx, cy, R, a0, a1, fs);
      return c;
    }
    let y = 220;
    for (const line of words.split('\n')) {
      let x = 120;
      for (const w of line.split(' ').filter(Boolean)) {
        const tw = g.measureText(w).width, pw = tw + fs * 0.5, ph = fs * 1.25;
        if (x + pw > 2300) { x = 120; y += ph * 1.15; }
        piece(x + pw / 2, y, pw, ph, (r() - 0.5) * 0.08, () => { g.fillStyle = col; g.textAlign = 'center'; g.fillText(w, 0, fs * 0.04); });
        x += pw + fs * 0.25;
      }
      y += fs * 1.5;
    }
    return c;
  }
  if (k === 'gem' || k === 'gems') {
    const n = k === 'gems' ? 7 : 1, S = 300, c = mk(S * n + 40, S + 40), g = c.getContext('2d');
    for (let i = 0; i < n; i++) {
      const cx = 20 + S * i + S / 2, cy = 20 + S / 2, R = S * 0.4, hue = k === 'gems' && p.mixed ? ['#ff5fa2', '#7cd992', '#b07cff', '#5fc4ff', '#ffd25f', '#ff7b5f', '#e5e5e5'][i % 7] : col;
      g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 10; g.shadowOffsetY = 5; g.beginPath(); if (p.emblem === 'heart') heartPath(g, cx, cy, R); else g.arc(cx, cy, R, 0, 7); g.fillStyle = hue; g.fill(); g.restore();
      // facets
      g.save(); g.beginPath(); if (p.emblem === 'heart') heartPath(g, cx, cy, R); else g.arc(cx, cy, R, 0, 7); g.clip();
      for (let f = 0; f < 10; f++) { const a = f / 10 * Math.PI * 2; g.fillStyle = f % 2 ? shade(hue, 0.35) : shade(hue, -0.3); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R * 1.4, cy + Math.sin(a) * R * 1.4); g.lineTo(cx + Math.cos(a + 0.63) * R * 1.4, cy + Math.sin(a + 0.63) * R * 1.4); g.fill(); }
      g.fillStyle = shade(hue, 0.15); g.beginPath(); g.arc(cx, cy, R * 0.45, 0, 7); g.fill();
      const sp = g.createRadialGradient(cx - R * 0.35, cy - R * 0.35, 0, cx - R * 0.35, cy - R * 0.35, R * 0.5); sp.addColorStop(0, 'rgba(255,255,255,0.95)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sp; g.fillRect(cx - R, cy - R, R * 2, R * 2); g.restore();
    }
    return c;
  }
  if (k === 'fancylabel') {
    const W = 1300, H = 900, c = mk(W, H), g = c.getContext('2d');
    g.save(); g.beginPath(); for (let i = 0; i <= 200; i++) { const t = i / 200, a = t * Math.PI * 2, rx = 560, ry = 330, wob = 1 + 0.06 * Math.cos(a * 12); g.lineTo(W / 2 + Math.cos(a) * rx * wob * (Math.abs(Math.cos(a)) > 0.9 ? 1.02 : 1), H / 2 + Math.sin(a) * ry * wob); } g.closePath();
    g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 12; g.shadowOffsetY = 6; g.fillStyle = paperPattern(g, 'textured', col); g.fill(); g.restore();
    g.strokeStyle = col2; g.fillStyle = col2; g.lineWidth = 10; g.lineCap = 'round';
    for (const sy of [-1, 1]) { const y = H / 2 + sy * 230; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(W / 2, y); g.bezierCurveTo(W / 2 + sx * 120, y - sy * 80, W / 2 + sx * 220, y + sy * 40, W / 2 + sx * 330, y - sy * 10); g.stroke(); g.beginPath(); g.arc(W / 2 + sx * 200, y - sy * 30, 26, 0, Math.PI * 1.6); g.stroke(); } g.beginPath(); heartPath(g, W / 2, y - sy * 10, 34); g.fill(); }
    g.setLineDash([2, 18]); g.lineWidth = 6; for (let i = 0; i < 4; i++) { const y = H / 2 - 105 + i * 70; g.beginPath(); g.moveTo(W / 2 - 360, y); g.lineTo(W / 2 + 360, y); g.stroke(); } g.setLineDash([]);
    if (txt) { g.fillStyle = col2; g.font = `${p.size * 1.2}px "${font}", cursive`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, W / 2, H / 2 - 105); }
    if (p.shine) { g.globalCompositeOperation = 'source-atop'; for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.5})`; g.fillRect(r() * W, r() * H, 2, 2); } }
    return c;
  }
  if (k === 'receipt') {
    const W = 900, H = 300, c = mk(W, H), g = c.getContext('2d');
    const pts = tornRect(20, 20, W - 40, H - 40, 6, r, 5); g.save(); g.shadowColor = 'rgba(0,0,0,0.2)'; g.shadowBlur = 6; pathOf(g, pts); g.fillStyle = paperPattern(g, 'white', '#f4f2ee'); g.fill(); g.restore();
    let x = 60; g.fillStyle = '#111'; while (x < 560) { const w = 2 + Math.floor(r() * 4) * 2; g.fillRect(x, 50, w, 110); x += w + 2 + Math.floor(r() * 3) * 2; }
    g.font = '700 30px "Courier New", monospace'; g.fillText(Array.from({ length: 12 }, () => Math.floor(r() * 10)).join(''), 70, 195); g.fillText(Array.from({ length: 6 }, () => Math.floor(r() * 10)).join(''), 600, 120);
    g.font = '26px "Courier New", monospace'; g.fillText((txt || 'ITEM 001  QTY 1').slice(0, 40), 60, 245);
    return c;
  }
  if (k === 'safetypin') {
    const W = 1100, H = 360, c = mk(W, H), g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
    g.save(); g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 8; g.shadowOffsetY = 5; g.strokeStyle = metalGrad(g, 0, 60, 0, 300, col); g.lineWidth = 20;
    g.beginPath(); g.moveTo(120, 230); g.lineTo(880, 130); g.moveTo(120, 230); g.arc(120, 180, 50, Math.PI / 2, Math.PI * 1.5, false); g.lineTo(840, 100); g.stroke();
    g.fillStyle = metalGrad(g, 0, 60, 0, 280, col); g.beginPath(); g.roundRect(820, 70, 180, 110, 24); g.fill(); g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 4; g.beginPath(); g.roundRect(835, 85, 150, 80, 16); g.stroke();
    if (p.charm) { g.fillStyle = col2; g.beginPath(); heartPath(g, 480, 270, 45); g.fill(); g.strokeStyle = shade(col, -0.2); g.lineWidth = 4; g.beginPath(); g.moveTo(480, 170); g.lineTo(480, 230); g.stroke(); }
    return c;
  }
  if (k === 'disco') {
    const S = 900, c = mk(S, S + 200), g = c.getContext('2d'), cx = S / 2, cy = S / 2 + 200, R = S * 0.4;
    g.strokeStyle = '#888'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, cy - R); g.stroke();
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
    const rows = 16; for (let i = 0; i < rows; i++) { const lat = -Math.PI / 2 + (i + 0.5) / rows * Math.PI, y = cy + Math.sin(lat) * R, rr = Math.cos(lat) * R, cols = Math.max(4, Math.round(rows * 2 * Math.cos(lat))); for (let j = 0; j < cols; j++) { const lon = j / cols * Math.PI - Math.PI / 2, x = cx + Math.sin(lon) * rr, w = Math.PI * rr / cols * Math.cos(lon) * 0.95, h = Math.PI * R / rows * 0.92; const v = 90 + r() * 140 + Math.cos(lon - 0.6) * 40 - Math.sin(lat) * 30; g.fillStyle = `rgb(${v},${v},${v + 8})`; g.fillRect(x - w / 2, y - h / 2, Math.max(1, w), h); if (r() < 0.06) { g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(x - w / 2, y - h / 2, Math.max(1, w), h); } } }
    const sh = g.createRadialGradient(cx - R * 0.4, cy - R * 0.4, 0, cx, cy, R * 1.1); sh.addColorStop(0, 'rgba(255,255,255,0.25)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = sh; g.fillRect(0, 0, S, S + 200); g.restore();
    for (let i = 0; i < 6; i++) { const x = cx + (r() - 0.5) * R * 1.4, y = cy + (r() - 0.5) * R * 1.4, s2 = 20 + r() * 30; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - s2, y); g.lineTo(x + s2, y); g.moveTo(x, y - s2); g.lineTo(x, y + s2); g.stroke(); }
    return c;
  }
  if (k === 'checker') {
    const n = 14, sq = 80, c = mk(sq * 2 + 20, sq * n + 20), g = c.getContext('2d');
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? col2 : col; g.save(); g.translate(10 + j * sq, 10 + i * sq); g.rotate((r() - 0.5) * 0.03); g.fillRect(0, 0, sq + 1, sq + 1); g.restore(); }
    return c;
  }
  if (k === 'burst') {
    const S = 1100, c = mk(S, S), g = c.getContext('2d'), cx = S / 2, pts = [], n = 9;
    for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n + (r() - 0.5) * 0.12, rr = (i % 2 ? 0.48 : 1) * S * 0.45 * (0.85 + r() * 0.25); pts.push([cx + Math.cos(a) * rr, cx + Math.sin(a) * rr]); }
    g.save(); g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 14; g.shadowOffsetY = 7; pathOf(g, pts); g.fillStyle = col2; g.fill(); g.restore();
    g.save(); g.translate(cx, cx); g.scale(0.88, 0.88); g.translate(-cx, -cx); pathOf(g, pts); g.fillStyle = paperPattern(g, p.paper, col); g.fill(); g.restore();
    if (txt) { g.fillStyle = col2; g.font = `700 ${p.size * 1.6}px "${font}", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, cx, cx); }
    return c;
  }
  if (k === 'flowerword') {
    const S = 1000, c = mk(S, S), g = c.getContext('2d'), cx = S / 2, R = S * 0.44, t = (txt || 'bloom').toUpperCase().replace(/\s+/g, '').slice(0, 6);
    const n = Math.max(5, t.length);
    g.save(); g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 10; g.beginPath(); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 - Math.PI / 2; g.moveTo(cx + Math.cos(a) * R * 0.55 + R * 0.38, cx + Math.sin(a) * R * 0.55); g.arc(cx + Math.cos(a) * R * 0.55, cx + Math.sin(a) * R * 0.55, R * 0.38, 0, 7); } g.fillStyle = col; g.fill(); g.restore();
    g.lineWidth = 14; g.strokeStyle = col2; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 - Math.PI / 2; g.beginPath(); for (let k2 = 0; k2 < 3; k2++) g.ellipse(cx + Math.cos(a) * R * 0.55 + (r() - 0.5) * 12, cx + Math.sin(a) * R * 0.55 + (r() - 0.5) * 12, R * 0.27, R * 0.24, r() * 3, 0, 6.5); g.stroke(); }
    g.fillStyle = col2; g.beginPath(); g.arc(cx, cx, R * 0.16, 0, 7); g.fill();
    g.fillStyle = p.textColor; g.font = `${R * 0.3}px "${font}", "Segoe Print", cursive`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < t.length; i++) { const a = i / n * Math.PI * 2 - Math.PI / 2; g.fillText(t[i], cx + Math.cos(a) * R * 0.55, cx + Math.sin(a) * R * 0.55); }
    return c;
  }
  if (k === 'roundbadge' || k === 'oval') {
    const W = k === 'oval' ? 1500 : 1000, H = k === 'oval' ? 560 : 1000, c = mk(W, H), g = c.getContext('2d'), cx = W / 2, cy = H / 2;
    g.save(); g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 10; g.shadowOffsetY = 5; g.beginPath(); g.ellipse(cx, cy, W * 0.46, H * 0.46, k === 'oval' ? -0.08 : 0, 0, 7); g.fillStyle = col; g.fill(); g.restore();
    g.strokeStyle = col2; g.lineWidth = 16; g.beginPath(); g.ellipse(cx, cy, W * 0.4, H * 0.38, k === 'oval' ? -0.08 : 0, 0, 7); g.stroke();
    g.fillStyle = p.textColor; g.textAlign = 'center'; g.textBaseline = 'middle';
    const t = (txt || (k === 'oval' ? 'ONE OF A KIND' : 'MADE WITH LOVE')).toUpperCase();
    if (k === 'oval') { g.save(); g.translate(cx, cy); g.rotate(-0.08); g.font = `700 ${p.size * 1.4}px "Arial Black", Impact, sans-serif`; g.scale(Math.min(1, W * 0.7 / g.measureText(t).width), 1); g.fillText(t, 0, 0); g.restore(); }
    else { g.font = `700 ${p.size * 0.9}px "Arial Black", Impact, sans-serif`; textOnArc(g, t, cx, cy, W * 0.33, -Math.PI * 0.85, -Math.PI * 0.15, 0); g.fillStyle = col2; g.beginPath(); for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, rr = i % 2 ? W * 0.09 : W * 0.15; g.lineTo(cx + Math.cos(a) * rr, cy + 60 + Math.sin(a) * rr); } g.fill(); g.fillStyle = p.textColor; g.beginPath(); g.arc(cx - 20, cy + 50, 8, 0, 7); g.arc(cx + 20, cy + 50, 8, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = p.textColor; g.beginPath(); g.arc(cx, cy + 62, 24, 0.2, Math.PI - 0.2); g.stroke(); }
    return c;
  }
  if (k === 'sign') {
    const S = 900, c = mk(S, S), g = c.getContext('2d'); g.fillStyle = col; g.beginPath(); g.roundRect(20, 20, S - 40, S - 40, 30); g.fill();
    g.fillStyle = col2; const cx = S / 2;
    g.beginPath(); g.arc(cx, 190, 80, 0, 7); g.fill(); g.beginPath(); g.roundRect(cx - 150, 290, 300, 300, 40); g.fill(); g.fillRect(cx - 105, 560, 95, 270); g.fillRect(cx + 10, 560, 95, 270);
    g.fillStyle = col; g.fillRect(cx - 120, 330, 10, 230); g.fillRect(cx + 110, 330, 10, 230);
    if (txt) { g.fillStyle = col2; g.font = `700 ${p.size}px "Arial Black", sans-serif`; g.textAlign = 'center'; g.fillText(txt.toUpperCase(), cx, S - 40); }
    return c;
  }
  if (k === 'locker') {
    const W = 1000, H = 1500, c = mk(W, H), g = c.getContext('2d');
    g.fillStyle = shade(col, -0.15); g.fillRect(0, 0, W, H); g.fillStyle = col; g.fillRect(40, 40, W - 80, H - 80);
    const tex = g.createLinearGradient(0, 0, W, 0); tex.addColorStop(0, 'rgba(0,0,0,0.08)'); tex.addColorStop(0.5, 'rgba(255,255,255,0.06)'); tex.addColorStop(1, 'rgba(0,0,0,0.1)'); g.fillStyle = tex; g.fillRect(40, 40, W - 80, H - 80);
    for (const yy of [260, 330, 1120, 1190]) for (const xx of [220, 600]) { g.fillStyle = shade(col, -0.3); g.fillRect(xx, yy, 220, 16); g.fillStyle = shade(col, 0.25); g.fillRect(xx, yy - 10, 220, 10); }
    g.fillStyle = '#d8d8dc'; g.beginPath(); g.roundRect(W / 2 - 90, 120, 180, 70, 10); g.fill(); g.fillStyle = '#111'; g.font = '700 46px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt || String(1000 + Math.floor(r() * 9000)), W / 2, 156);
    g.fillStyle = '#1b1b1e'; g.beginPath(); g.roundRect(730, 640, 100, 250, 8); g.fill(); g.fillStyle = '#000'; g.fillRect(750, 660, 60, 210);
    g.fillStyle = shade(col, -0.35); for (const yy of [200, 1220]) g.fillRect(40, yy, 18, 140);
    return c;
  }
  if (k === 'binderclip') {
    const W = 700, H = 760, c = mk(W, H), g = c.getContext('2d');
    g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 12; g.shadowOffsetY = 6;
    g.beginPath(); g.moveTo(120, 420); g.lineTo(580, 420); g.lineTo(540, 720); g.lineTo(160, 720); g.closePath(); const bg = g.createLinearGradient(0, 420, 0, 720); bg.addColorStop(0, shade(col, 0.25)); bg.addColorStop(0.5, col); bg.addColorStop(1, shade(col, -0.35)); g.fillStyle = bg; g.fill(); g.restore();
    g.lineCap = 'round'; g.lineWidth = 18; g.strokeStyle = metalGrad(g, 0, 0, W, 0, '#bfc0c4');
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(350 + sx * 170, 440); g.lineTo(350 + sx * 200, 120); g.arc(350 + sx * 120, 120, 80, sx > 0 ? 0 : Math.PI, sx > 0 ? Math.PI : 0, sx < 0); g.lineTo(350 + sx * 60, 300); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(140, 430, 420, 30);
    return c;
  }
  if (k === 'plasticclip') {
    const W = 600, H = 700, c = mk(W, H), g = c.getContext('2d');
    g.save(); g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 12; g.shadowOffsetY = 6; g.fillStyle = col;
    g.beginPath(); g.roundRect(150, 300, 300, 360, 40); g.fill(); g.beginPath(); g.roundRect(230, 40, 140, 300, 70); g.fill(); g.restore();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.roundRect(265, 80, 70, 170, 35); g.fill(); g.globalCompositeOperation = 'source-over';
    const sh = g.createLinearGradient(150, 0, 450, 0); sh.addColorStop(0, 'rgba(255,255,255,0.35)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.18)'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = sh; g.fillRect(0, 0, W, H);
    return c;
  }
  if (k === 'spiral') {
    const S = 1200, c = mk(S, S), g = c.getContext('2d'), cx = S / 2; g.fillStyle = col2; g.fillRect(0, 0, S, S);
    g.strokeStyle = col; g.lineWidth = 34; g.lineCap = 'round'; g.beginPath();
    for (let t = 0; t < Math.PI * 2 * 11; t += 0.04) { const rr = 8 + t * 15.5; g.lineTo(cx + Math.cos(t) * rr, cx + Math.sin(t) * rr * 1.03); } g.stroke();
    return c;
  }
  if (k === 'window') {
    const W = 1000, H = 1150, c = mk(W, H), g = c.getContext('2d');
    g.fillStyle = '#d4d0c8'; g.fillRect(0, 0, W, H); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
    const tb = g.createLinearGradient(0, 0, W, 0); tb.addColorStop(0, col); tb.addColorStop(1, shade(col, 0.45)); g.fillStyle = tb; g.fillRect(10, 10, W - 20, 54);
    g.fillStyle = '#fff'; g.font = '600 30px Tahoma, Arial, sans-serif'; g.fillText(txt || 'untitled - Draw', 26, 47);
    for (let i = 0; i < 3; i++) { g.fillStyle = '#d4d0c8'; g.fillRect(W - 60 - i * 50, 18, 40, 38); g.fillStyle = '#000'; g.font = '700 26px Arial'; g.fillText(['×', '□', '_'][i], W - 50 - i * 50, 48); }
    g.fillStyle = '#000'; g.font = '26px Tahoma, Arial'; ['File', 'Edit', 'View', 'Image', 'Colors', 'Help'].forEach((m, i) => g.fillText(m, 24 + i * 100, 100));
    for (let i = 0; i < 16; i++) { g.fillStyle = '#c0c0c0'; g.fillRect(20 + (i % 2) * 44, 130 + Math.floor(i / 2) * 44, 40, 40); }
    g.fillStyle = '#fff'; g.fillRect(130, 130, W - 150, H - 330); g.strokeStyle = '#808080'; g.strokeRect(130, 130, W - 150, H - 330);
    const pal = ['#000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#fff', '#c0c0c0', '#f00', '#ff0', '#0f0', '#0ff', '#00f', '#f0f']; pal.forEach((pc, i) => { g.fillStyle = pc; g.fillRect(130 + (i % 8) * 50, H - 180 + Math.floor(i / 8) * 46, 42, 40); });
    g.fillStyle = '#000'; g.font = '22px Tahoma, Arial'; g.fillText('For help, click Help Topics on the Help menu.', 20, H - 30);
    return c;
  }
  if (k === 'block' || k === 'quote' || k === 'dymo') {
    const lines = (txt || (k === 'block' ? 'STOP\nOVERTHINKING' : k === 'dymo' ? 'THIS WEEK' : 'she seeks answers\nin outer realms')).split('\\n').join('\n').split('\n');
    const fs = p.size * (k === 'block' ? 2 : k === 'dymo' ? 1.1 : 0.9), padX = fs * 0.5, c0 = mk(10, 10).getContext('2d');
    c0.font = k === 'block' ? `900 ${fs}px Impact, "Arial Black", sans-serif` : k === 'dymo' ? `700 ${fs}px "Courier New", monospace` : `${fs}px Georgia, "Times New Roman", serif`;
    if (k === 'dymo') try { c0.letterSpacing = fs * 0.35 + 'px'; } catch (_) { }
    const tw = Math.max(...lines.map(l => c0.measureText(k === 'block' ? l.toUpperCase() : l).width)), lh = fs * (k === 'block' ? 1 : 1.25);
    const W = Math.ceil(tw + padX * 2 + 40), H = Math.ceil(lh * lines.length + fs * 0.6 + 40), c = mk(W, H), g = c.getContext('2d');
    g.save(); g.shadowColor = 'rgba(0,0,0,0.2)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
    if (k === 'quote') { pathOf(g, tornRect(20, 20, W - 40, H - 40, 2, r, 8)); g.fillStyle = paperPattern(g, 'white', col2); g.fill(); }
    else { g.fillStyle = col2; g.fillRect(20, 20, W - 40, H - 40); }
    g.restore();
    if (k === 'dymo') { const gl = g.createLinearGradient(0, 20, 0, H - 20); gl.addColorStop(0, 'rgba(255,255,255,0.18)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.2)'); g.fillStyle = gl; g.fillRect(20, 20, W - 40, H - 40); }
    g.font = c0.font; if (k === 'dymo') try { g.letterSpacing = fs * 0.35 + 'px'; } catch (_) { }
    g.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const y = 20 + fs * 0.3 + lh * (i + 0.5), t2 = k === 'block' ? l.toUpperCase() : l;
      if (k === 'dymo') { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText(t2, 20 + padX + 3, y + 3); }
      g.fillStyle = col; g.fillText(t2, 20 + padX, y);
    });
    return c;
  }
  if (k === 'keycap') {
    const S = 600, c = mk(S, S), g = c.getContext('2d');
    g.save(); g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 14; g.shadowOffsetY = 8; g.fillStyle = shade(col, -0.35); g.beginPath(); g.roundRect(40, 40, S - 80, S - 80, 50); g.fill(); g.restore();
    const tg = g.createLinearGradient(0, 80, 0, S - 120); tg.addColorStop(0, shade(col, 0.15)); tg.addColorStop(1, col); g.fillStyle = tg; g.beginPath(); g.roundRect(90, 70, S - 180, S - 190, 36); g.fill();
    g.fillStyle = col2; g.font = `600 ${p.size * 1.1}px Arial, sans-serif`; g.fillText(txt || 'Ctrl', 130, S - 170);
    return c;
  }
  if (k === 'facts') {
    const W = 800, H = 1100, c = mk(W, H), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.strokeStyle = '#000'; g.lineWidth = 6; g.strokeRect(20, 20, W - 40, H - 40);
    g.fillStyle = '#000'; g.font = '900 88px "Arial Black", Impact, sans-serif'; g.fillText((txt || 'Feelings Facts').slice(0, 16), 40, 120);
    const row = (y, a, b, bold, rule) => { g.fillStyle = '#000'; g.fillRect(40, y - 40, W - 80, rule); g.font = `${bold ? 700 : 400} 38px Arial, sans-serif`; g.fillText(a, 40, y); g.textAlign = 'right'; g.fillText(b, W - 40, y); g.textAlign = 'left'; };
    row(190, 'Serving size', '1 heart', false, 3); row(250, 'Servings per day', 'many', false, 3); row(340, 'Calories', '20', true, 18);
    [['Daydreams', '100%'], ['Overthinking', '0%'], ['Glitter', '45%'], ['Kindness', '80%'], ['Sleep', '15%'], ['Snacks', '70%'], ['Joy', '99%']].forEach(([a, b], i) => row(430 + i * 80, a, b, i % 2 === 0, 3));
    g.font = '24px Arial'; g.fillText('* Percent of what you need to get through today.', 40, H - 60);
    return c;
  }
  if (k === 'wavypaper') {
    const S = 1100, c = mk(S, S), g = c.getContext('2d'), n = 9, pad = 80, L = S - pad * 2, step = L / n;
    g.beginPath();
    for (let i = 0; i <= n * 8; i++) { const t = i / (n * 8), x = pad + t * L; g.lineTo(x, pad + Math.sin(t * n * Math.PI * 2) * 22); }
    for (let i = 0; i <= n * 8; i++) { const t = i / (n * 8), y = pad + t * L; g.lineTo(S - pad + Math.sin(t * n * Math.PI * 2) * 22, y); }
    for (let i = n * 8; i >= 0; i--) { const t = i / (n * 8), x = pad + t * L; g.lineTo(x, S - pad + Math.sin(t * n * Math.PI * 2) * 22); }
    for (let i = n * 8; i >= 0; i--) { const t = i / (n * 8), y = pad + t * L; g.lineTo(pad + Math.sin(t * n * Math.PI * 2) * 22, y); }
    g.closePath(); g.save(); g.shadowColor = 'rgba(0,0,0,0.2)'; g.shadowBlur = 10; g.fillStyle = paperPattern(g, 'white', col2); g.fill(); g.restore();
    g.save(); g.clip(); g.strokeStyle = 'rgba(90,130,200,0.45)'; g.lineWidth = 3; for (let y = pad + 90; y < S - pad; y += 58) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    g.strokeStyle = 'rgba(220,80,90,0.6)'; g.beginPath(); g.moveTo(pad + 90, 0); g.lineTo(pad + 90, S); g.stroke(); g.restore();
    crumple(g, S, S, r, 1.4);
    return c;
  }
  if (k === 'monoprint') {
    const W = 1000, H = 1400, c = mk(W, H), g = c.getContext('2d'); g.fillStyle = paperPattern(g, 'white', col2); g.fillRect(0, 0, W, H);
    g.strokeStyle = col; g.lineCap = 'round';
    for (let i = 0; i < 16; i++) { const x = r() * W, y = r() * H, rr = 80 + r() * 230; g.lineWidth = 30 + r() * 40; g.globalAlpha = 0.55 + r() * 0.3; g.beginPath(); g.ellipse(x, y, rr, rr * (0.85 + r() * 0.3), r() * 3, 0, 7); g.stroke(); }
    for (let i = 0; i < 5; i++) { g.lineWidth = 34; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(0, r() * H); g.lineTo(W, r() * H); g.stroke(); }
    // the dry, streaky print: knock out streaks and specks
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3500; i++) { g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.6})`; g.fillRect(r() * W, r() * H, 1 + r() * 3, 6 + r() * 40); }
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = paperPattern(g, 'white', col2); g.fillRect(0, 0, W, H);
    return c;
  }
  if (k === 'oldposter') {
    const W = 1000, H = 1560, c = mk(W, H), g = c.getContext('2d'), x0 = 60, y0 = 60, w = W - 120, h = H - 120;
    const pts = tornRect(x0, y0, w, h, 2, r, 10); g.save(); g.shadowColor = 'rgba(0,0,0,0.2)'; g.shadowBlur = 10; pathOf(g, pts); g.fillStyle = paperPattern(g, 'vintage', col); g.fill(); g.restore();
    g.save(); pathOf(g, pts); g.clip();
    mottle(g, W, H, r, 0.14, '40,70,60');
    // fold lines: a soft dark side and a light crease
    const folds = [[x0 + w / 2, 'v'], [y0 + h / 4, 'h'], [y0 + h / 2, 'h'], [y0 + h * 3 / 4, 'h']];
    for (const [v, d] of folds) { g.fillStyle = 'rgba(0,0,0,0.12)'; d === 'v' ? g.fillRect(v + 2, 0, 6, H) : g.fillRect(0, v + 2, W, 6); g.fillStyle = 'rgba(255,255,255,0.7)'; d === 'v' ? g.fillRect(v - 1, 0, 3, H) : g.fillRect(0, v - 1, W, 3); }
    // scratches and worn white spots
    g.strokeStyle = 'rgba(255,255,255,0.55)'; for (let i = 0; i < 160; i++) { g.lineWidth = 0.6 + r() * 1.6; const x = x0 + r() * w, y = y0 + r() * h, l = 10 + r() * 70, a = r() * 6.28; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l / 2, y + Math.sin(a + 0.6) * l / 2, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    const edge = g.createLinearGradient(x0, 0, x0 + 80, 0); edge.addColorStop(0, 'rgba(255,255,255,0.45)'); edge.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = edge; g.fillRect(x0, 0, 80, H);
    g.restore();
    // old yellowed tape at the top and bottom
    for (const y of [y0 - 30, y0 + h - 110]) { g.save(); g.globalAlpha = 0.6; g.fillStyle = '#c8a15a'; g.translate(x0 + w / 2 - 35, y); g.fillRect(0, 0, 70, 140); g.globalAlpha = 0.35; g.fillStyle = '#8a6a2a'; g.fillRect(0, 0, 70, 8); g.fillRect(0, 132, 70, 8); g.restore(); }
    return c;
  }
  // note paper with tape, a little label strip and gems
  const W = 1000, H = 1500, c = mk(W, H + 200), g = c.getContext('2d');
  const pts = tornRect(120, 200, W - 240, H - 260, 3, r, 6); g.save(); g.shadowColor = 'rgba(0,0,0,0.2)'; g.shadowBlur = 10; g.shadowOffsetY = 6; pathOf(g, pts); g.fillStyle = paperPattern(g, 'smooth', col); g.fill(); g.restore();
  g.save(); pathOf(g, pts); g.clip(); for (let i = 0; i < 300; i++) { g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1; const x = 120 + r() * (W - 240), y = 200 + r() * (H - 260); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 10 + r() * 20); g.stroke(); } g.restore();
  g.save(); g.globalAlpha = 0.85; g.fillStyle = shade(col, 0.25); g.translate(W / 2, 200); g.rotate(-0.04); g.fillRect(-120, -50, 240, 110); g.restore();
  if (p.charm) { for (const [x, y, cc] of [[260, 330, '#c0359a'], [690, 1260, '#5fbf3a'], [700, 1360, '#8a4bd1']]) { g.fillStyle = cc; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(x - 7, y - 7, 6, 0, 7); g.fill(); } }
  if (txt) { g.fillStyle = col2; g.font = `${p.size * 1.1}px "${font}", cursive`; g.fillText(txt, 180, 420); }
  return c;
}

export const MAKERS = [
  {
    id: 'piece', name: 'Scrapbook piece', params: [
      S('kind', 'Piece', PIECE_KINDS, 'seal'), C('color', 'Main color', '#d98aa6'), C('color2', 'Second color', '#ffffff'), C('textColor', 'Word color', '#1a1a1a'),
      T('text', 'Words (use \\n for a new line)', ''), S('font', 'Font', FONT_OPTS, 'Ink Free'), R('size', 'Word size', 30, 200, 90), B('bold', 'Bold', true),
      S('emblem', 'Emblem / gem shape', { heart: 'Heart', star: 'Star', letter: 'First letter', round: 'Round' }, 'heart'), S('paper', 'Paper', paperOpts, 'cream'),
      B('lines', 'Lined paper', true), R('rough', 'Torn edges', 0, 20, 6), B('shine', 'Shine', true), B('charm', 'Extras (charm, gems)', true), B('mixed', 'Mixed gem colors', true)],
    draw(p, r) { return scrapPiece(p, r); }
  },
  {
    id: 'cute', name: 'Cute sticker', params: [
      S('shape', 'Shape', SHAPE_NAMES, 'heart'), C('color', 'Color', '#ff8fb1'), S('pattern', 'Pattern', { none: 'Plain', dots: 'Polka dots', stripes: 'Stripes', gingham: 'Gingham', checker: 'Checks', hearts: 'Little hearts', stars: 'Little stars', fade: 'Fade' }, 'none'), C('color2', 'Pattern color', '#ffffff'),
      B('shine', 'Cartoon shine', true), B('face', 'Cute face', false), R('lineW', 'Outline', 0, 30, 0), C('line', 'Outline and face color', '#3a2a2a'),
      R('border', 'White border', 0, 80, 36), C('borderColor', 'Border color', '#ffffff'), R('tilt', 'Tilt', -45, 45, 0),
      T('text', 'Words on it', ''), S('font', 'Font', FONT_OPTS, 'Ink Free'), C('textColor', 'Word color', '#ffffff'), R('textSize', 'Word size', 0.4, 2, 1, 0.05), B('bold', 'Bold words', true)],
    draw(p, r) { return cuteSticker(p, r); }
  },
  {
    id: 'scrap', name: 'Torn paper scrap', params: [
      S('paper', 'Paper', paperOpts, 'vintage'), C('color', 'Paper color', '#efe6d2'), R('w', 'Width', 300, 2000, 1100, 10), R('h', 'Height', 200, 2000, 800, 10),
      R('rough', 'Tear roughness', 0, 40, 14), R('edge', 'Torn white edge', 0, 20, 6), S('print', 'Printed on it', { none: 'Nothing', lines: 'Lined', grid: 'Grid', dots: 'Dot grid', music: 'Music staff', text: 'Old text' }, 'lines'),
      C('ink', 'Print color', '#5a7fa8'), R('fold', 'Folded corner', 0, 300, 0), R('crumple', 'Crumple', 0, 2, 0.6, 0.1), R('age', 'Age stains', 0, 1, 0.4, 0.05)],
    draw(p, r) {
      const pad = 60, c = mk(p.w + pad * 2, p.h + pad * 2), g = c.getContext('2d');
      const outer = tornRect(pad, pad, p.w, p.h, p.rough, r), inner = tornRect(pad + p.edge * 0.6, pad + p.edge * 0.6, p.w - p.edge * 1.2, p.h - p.edge * 1.2, p.rough, rng(r() * 1e6));
      if (p.edge) { pathOf(g, outer); g.fillStyle = shade(p.color, 0.5); g.fill(); }
      pathOf(g, p.edge ? inner : outer); g.fillStyle = paperPattern(g, p.paper, p.color); g.fill();
      g.save(); g.globalCompositeOperation = 'source-atop';
      drawPrint(g, p, pad, r);
      if (p.age) { mottle(g, c.width, c.height, r, 0.12 * p.age); for (let i = 0; i < 12 * p.age; i++) { const x = r() * c.width, y = r() * c.height, rr = 4 + r() * 18, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(130,85,35,${0.2 * p.age})`); gr.addColorStop(1, 'rgba(130,85,35,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); } }
      g.restore();
      crumple(g, c.width, c.height, r, p.crumple);
      if (p.fold) foldCorner(g, pad + p.w, pad, p.fold, p.color, p.paper);
      return c;
    }
  },
  {
    id: 'cardboard', name: 'Torn cardboard frame', params: [
      C('color', 'Cardboard color', '#c79a68'), R('w', 'Width', 400, 2000, 1000, 10), R('h', 'Height', 400, 2000, 1250, 10), R('hole', 'Hole size', 0.2, 0.85, 0.55, 0.01),
      R('layers', 'Torn layers', 1, 5, 3), R('rough', 'Roughness', 2, 40, 16), B('tornOut', 'Torn outer edge', false), B('see', 'See-through hole', true), C('holeColor', 'Hole color (if not see-through)', '#f4f1ea')],
    draw(p, r) {
      const pad = 40, W = p.w, H = p.h, c = mk(W + pad * 2, H + pad * 2), g = c.getContext('2d');
      const outer = p.tornOut ? tornRect(pad, pad, W, H, p.rough * 0.6, r) : [[pad, pad], [pad + W, pad], [pad + W, pad + H], [pad, pad + H]];
      pathOf(g, outer); g.fillStyle = paperPattern(g, 'kraft', p.color); g.fill();
      g.save(); g.globalCompositeOperation = 'source-atop'; mottle(g, c.width, c.height, r, 0.1); crumple(g, c.width, c.height, r, 0.5); g.restore();
      const cx = pad + W / 2, cy = pad + H / 2, rx = W * p.hole / 2, ry = H * p.hole / 2;
      const peel = shade(p.color, 0.35), liner = shade(p.color, 0.18);
      for (let L = p.layers; L >= 1; L--) {
        const k = 1 + L * 0.14, blob = tornBlob(cx, cy, rx * k, ry * k, p.rough * (1 + L * 0.4), r, 0.16 + L * 0.03);
        // inner shadow of the layer above
        g.save(); pathOf(g, blob); g.clip();
        if (L % 2 === 0) { // corrugated ring
          g.fillStyle = shade(p.color, 0.1); g.fillRect(0, 0, c.width, c.height);
          for (let y = 0; y < c.height; y += 14) { const gr = g.createLinearGradient(0, y, 0, y + 14); gr.addColorStop(0, shade(p.color, -0.25)); gr.addColorStop(0.5, shade(p.color, 0.3)); gr.addColorStop(1, shade(p.color, -0.25)); g.fillStyle = gr; g.fillRect(0, y, c.width, 14); }
        } else { g.fillStyle = paperPattern(g, 'recycled', L === 1 ? peel : liner); g.fillRect(0, 0, c.width, c.height); }
        g.restore();
        pathOf(g, blob); g.strokeStyle = 'rgba(60,35,15,0.35)'; g.lineWidth = 3; g.stroke();
        pathOf(g, blob.map(([x, y]) => [x + (r() - 0.5) * 3, y + (r() - 0.5) * 3])); g.strokeStyle = 'rgba(255,248,235,0.55)'; g.lineWidth = 1.2; g.stroke();
      }
      const hole = tornBlob(cx, cy, rx, ry, p.rough, r, 0.14);
      g.save(); pathOf(g, hole);
      if (p.see) { g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fill(); }
      else { g.fillStyle = p.holeColor; g.fill(); }
      g.restore();
      // shadow just inside the hole edge
      if (!p.see) { g.save(); pathOf(g, hole); g.clip(); pathOf(g, hole); g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 18; g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.3)'; g.stroke(); g.restore(); }
      return c;
    }
  },
  {
    id: 'tulle', name: 'Tulle / lace mesh', params: [
      C('color', 'Thread color', '#f1e4e0'), R('w', 'Width', 300, 1800, 1000, 10), R('h', 'Height', 300, 1800, 950, 10), R('mesh', 'Mesh size', 4, 30, 9), R('dots', 'Dot spacing', 0, 120, 48),
      R('dot', 'Dot size', 1, 12, 4, 0.5), R('alpha', 'Thread strength', 0.1, 1, 0.55, 0.05), R('rough', 'Edge wobble', 0, 40, 18), R('hem', 'Sewn edge', 0, 8, 3, 0.5), R('fold', 'Folded flap', 0, 0.6, 0.25, 0.01)],
    draw(p, r) {
      const pad = 50, c = mk(p.w + pad * 2, p.h + pad * 2), g = c.getContext('2d');
      const shape = tornRect(pad, pad, p.w, p.h, p.rough, r, 6);
      const net = (alpha, flip) => {
        g.save(); pathOf(g, shape); g.clip();
        g.strokeStyle = hexA(p.color, alpha); g.lineWidth = 0.9;
        const s = p.mesh, W = c.width, H = c.height;
        g.beginPath();
        for (let x = -H; x < W + H; x += s) { g.moveTo(x, 0); g.lineTo(x + H * 0.58, H); g.moveTo(x, 0); g.lineTo(x - H * 0.58, H); }
        for (let y = 0; y < H; y += s * 0.86) { g.moveTo(0, y); g.lineTo(W, y); }
        g.stroke();
        if (p.dots) { g.fillStyle = hexA(p.color, Math.min(1, alpha * 1.6)); let row = 0; for (let y = pad; y < H; y += p.dots * 0.87, row++) for (let x = pad + (row % 2) * p.dots / 2; x < W; x += p.dots) { g.beginPath(); g.ellipse(x, y, p.dot, p.dot * 0.85, 0, 0, 7); g.fill(); } }
        g.restore();
      };
      net(p.alpha);
      if (p.hem) { pathOf(g, shape); g.strokeStyle = hexA(p.color, 0.95); g.lineWidth = p.hem; g.lineJoin = 'round'; g.stroke(); }
      if (p.fold > 0) { // a corner folded back over itself: denser, slightly shiny
        const fx = pad + p.w * (1 - p.fold), fy = pad + p.h * p.fold;
        g.save(); g.beginPath(); g.moveTo(fx, pad - 20); g.lineTo(pad + p.w + 20, pad - 20); g.lineTo(pad + p.w + 20, fy); g.closePath(); g.clip();
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.restore();
        g.save(); g.beginPath(); g.moveTo(fx, pad); g.quadraticCurveTo(fx + (pad + p.w - fx) * 0.35, fy * 0.5 + pad * 0.5, pad + p.w, fy); g.lineTo(fx - (pad + p.w - fx) * 0.4, fy + (fy - pad) * 0.2); g.closePath(); g.clip();
        g.fillStyle = hexA(p.color, 0.18); g.fillRect(0, 0, c.width, c.height); net(Math.min(1, p.alpha * 1.3)); g.restore();
        g.strokeStyle = hexA(p.color, 0.9); g.lineWidth = p.hem || 2; g.beginPath(); g.moveTo(fx, pad); g.quadraticCurveTo(fx + (pad + p.w - fx) * 0.35, fy * 0.5 + pad * 0.5, pad + p.w, fy); g.stroke();
      }
      return c;
    }
  },
  {
    id: 'doily', name: 'Paper doily', params: [
      S('shape', 'Shape', { rect: 'Rectangle', round: 'Round', oval: 'Oval' }, 'rect'), C('color', 'Color', '#9fb4c8'), R('w', 'Width', 300, 1600, 760, 10), R('h', 'Height', 300, 1800, 1060, 10),
      R('scallop', 'Scallop size', 30, 160, 80), B('flowers', 'Flower cut-outs', true), B('dotsRow', 'Dotted ring', true), R('cracks', 'Wear lines', 0, 8, 3), S('tex', 'Material', { linen: 'Fabric', smooth: 'Paper' }, 'linen')],
    draw(p, r) {
      const pad = 20, c = mk(p.w + pad * 2, p.h + pad * 2), g = c.getContext('2d'), sc = p.scallop;
      const cx = c.width / 2, cy = c.height / 2;
      const ring = []; // scallop centers
      if (p.shape === 'rect') {
        const x0 = pad + sc / 2, y0 = pad + sc / 2, x1 = c.width - pad - sc / 2, y1 = c.height - pad - sc / 2;
        const nx = Math.max(2, Math.round((x1 - x0) / sc)), ny = Math.max(2, Math.round((y1 - y0) / sc));
        for (let i = 0; i <= nx; i++) { ring.push([x0 + (x1 - x0) * i / nx, y0]); ring.push([x0 + (x1 - x0) * i / nx, y1]); }
        for (let j = 1; j < ny; j++) { ring.push([x0, y0 + (y1 - y0) * j / ny]); ring.push([x1, y0 + (y1 - y0) * j / ny]); }
        g.fillStyle = '#000'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      } else {
        const rx = (p.shape === 'round' ? Math.min(p.w, p.h) : p.w) / 2 - sc / 2, ry = (p.shape === 'round' ? Math.min(p.w, p.h) : p.h) / 2 - sc / 2;
        const N = Math.max(8, Math.round(6.283 * Math.sqrt((rx * rx + ry * ry) / 2) / sc));
        for (let i = 0; i < N; i++) { const a = i / N * 6.283; ring.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
        g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.fill();
      }
      for (const [x, y] of ring) { g.beginPath(); g.arc(x, y, sc / 2, 0, 7); g.fill(); }
      // material
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = p.tex === 'linen' ? g.createPattern(coverTile('linen', p.color).canvas, 'repeat') : paperPattern(g, 'smooth', p.color); g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-atop'; mottle(g, c.width, c.height, r, 0.08, '40,50,70');
      if (p.cracks) { g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.2; for (let i = 0; i < p.cracks; i++) { let x = r() * c.width, y = r() * c.height; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 14; k++) { x += (r() - 0.4) * 40; y += (r() - 0.3) * 40; g.lineTo(x, y); } g.stroke(); } }
      // cut-outs
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
      if (p.flowers) for (const [x, y] of ring) { const pr = sc * 0.13; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; g.beginPath(); g.ellipse(x + Math.cos(a) * pr * 1.4, y + Math.sin(a) * pr * 1.4, pr * 0.9, pr * 0.5, a, 0, 7); g.fill(); } g.beginPath(); g.arc(x, y, pr * 0.35, 0, 7); g.fill(); }
      if (p.dotsRow) {
        if (p.shape === 'rect') { const ins = sc * 1.05, x0 = pad + ins, y0 = pad + ins, x1 = c.width - pad - ins, y1 = c.height - pad - ins, st = sc * 0.28; for (let x = x0; x <= x1; x += st) { dot(g, x, y0, sc * 0.045); dot(g, x, y1, sc * 0.045); } for (let y = y0 + st; y < y1; y += st) { dot(g, x0, y, sc * 0.045); dot(g, x1, y, sc * 0.045); } }
        else { const rx = (p.shape === 'round' ? Math.min(p.w, p.h) : p.w) / 2 - sc * 1.1, ry = (p.shape === 'round' ? Math.min(p.w, p.h) : p.h) / 2 - sc * 1.1, N = Math.round(6.283 * rx / (sc * 0.28)); for (let i = 0; i < N; i++) { const a = i / N * 6.283; dot(g, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, sc * 0.045); } }
      }
      g.globalCompositeOperation = 'source-over';
      return c;
    }
  },
  {
    id: 'card', name: 'Library card / form', params: [
      T('title', 'Heading', 'LIBRARY CARD'), T('code', 'Corner code', 'BSS 28'), T('fields', 'Fields (comma separated)', 'AUTHOR, TITLE'), T('cols', 'Table columns (comma separated)', "BORROWER'S NAME, , DATE DUE"),
      R('rows', 'Table rows', 2, 20, 9), C('color', 'Card color', '#f6e3b4'), C('ink', 'Ink color', '#1b1a18'), R('w', 'Width', 400, 1600, 1000, 10), R('h', 'Height', 600, 2400, 1700, 10), R('age', 'Age', 0, 1, 0.5, 0.05), B('roundCorners', 'Round corners', false)],
    draw(p, r) {
      const c = mk(p.w, p.h), g = c.getContext('2d'), W = p.w, H = p.h;
      g.beginPath(); g.roundRect(0, 0, W, H, p.roundCorners ? 26 : Math.max(3, W * 0.008)); g.clip();
      g.fillStyle = paperPattern(g, 'smooth', p.color); g.fillRect(0, 0, W, H);
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, 'rgba(255,240,200,0.0)'); gr.addColorStop(1, `rgba(240,190,120,${0.25 * p.age})`); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      mottle(g, W, H, r, 0.1 * p.age);
      g.fillStyle = p.ink; g.strokeStyle = p.ink;
      const u = W / 1000;
      g.font = `bold ${46 * u}px Arial, sans-serif`; g.textBaseline = 'alphabetic';
      spaced(g, p.title, 90 * u, 140 * u, 3 * u);
      g.font = `bold ${22 * u}px Arial, sans-serif`; g.textAlign = 'right'; g.fillText(p.code, W - 70 * u, 140 * u); g.textAlign = 'left';
      let y = 300 * u;
      const line = (yy, x0 = 0, x1 = W) => { g.lineWidth = 2.6 * u; g.beginPath(); let x = x0; g.moveTo(x, yy + (r() - 0.5) * 1.5); while (x < x1) { x += 40 + r() * 80; if (r() < 0.06) { g.stroke(); x += 6 + r() * 12; g.beginPath(); g.moveTo(x, yy); } else g.lineTo(Math.min(x, x1), yy + (r() - 0.5) * 2); } g.stroke(); };
      line(y);
      g.font = `bold ${21 * u}px Arial, sans-serif`;
      for (const f of p.fields.split(',').map(s => s.trim()).filter(Boolean)) { spaced(g, f, 90 * u, y + 50 * u, 1.5 * u); y += 125 * u; line(y); }
      y += 10 * u; line(y);
      const cols = p.cols.split(',').map(s => s.trim()); const colX = [0, 0.545, 0.75, 1].slice(0, cols.length + 1); if (cols.length !== 3) { colX.length = 0; for (let i = 0; i <= cols.length; i++) colX.push(i / cols.length); }
      const head = 90 * u, rowH = (H - y - head - 20 * u) / p.rows;
      g.textAlign = 'center';
      cols.forEach((t, i) => { const mid = (colX[i] + colX[i + 1]) / 2 * W; t.split(' ').length > 1 ? (spacedC(g, t.split(' ').slice(0, -1).join(' '), mid, y + 40 * u, 1.5 * u), spacedC(g, t.split(' ').slice(-1)[0], mid, y + 66 * u, 1.5 * u)) : spacedC(g, t, mid, y + 54 * u, 1.5 * u); });
      g.textAlign = 'left';
      for (let i = 1; i < cols.length; i++) { const x = colX[i] * W; g.lineWidth = 2.6 * u; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, H); g.stroke(); }
      y += head; line(y);
      for (let i = 1; i <= p.rows; i++) line(y + rowH * i, r() < 0.15 ? 40 * u : 0);
      // print specks
      for (let i = 0; i < 30 * p.age; i++) { g.globalAlpha = 0.5; g.fillRect(r() * W, r() * H, 1.5 * u + r() * 2, 1.5 * u + r() * 2); } g.globalAlpha = 1;
      return c;
    }
  },
  {
    id: 'envelope', name: 'Kraft envelope', params: [
      C('color', 'Paper color', '#6e4a3a'), R('w', 'Width', 400, 1800, 900, 10), R('h', 'Height', 300, 1800, 1400, 10), R('stripes', 'Stripe spacing', 0, 30, 9), R('stripeStr', 'Stripe strength', 0, 1, 0.35, 0.05),
      T('label', 'Stamped text', 'Nr. 218'), C('labelColor', 'Stamp ink', '#1f2a36'), S('font', 'Stamp font', FONT_OPTS, 'Arial Black'), R('crumple', 'Crumple', 0, 2, 1, 0.1), S('side', 'Side', { back: 'Back with flaps', front: 'Front' }, 'back')],
    draw(p, r) {
      const W = p.w, H = p.h, c = mk(W, H), g = c.getContext('2d');
      g.beginPath(); g.roundRect(0, 0, W, H, Math.max(3, W * 0.006)); g.clip();
      g.fillStyle = paperPattern(g, 'kraft', p.color); g.fillRect(0, 0, W, H);
      if (p.stripes) { g.fillStyle = `rgba(0,0,0,${0.18 * p.stripeStr})`; for (let y = 0; y < H; y += p.stripes) g.fillRect(0, y, W, p.stripes * 0.45); }
      mottle(g, W, H, r, 0.08);
      if (p.side === 'back') {
        const mx = W * 0.62, my = H * 0.5, top = [W * 0.55, H * 0.3], bot = [W * 0.55, H * 0.72];
        const flap = (pts, k) => { pathOf(g, pts); g.fillStyle = k > 0 ? `rgba(255,240,220,${k})` : `rgba(0,0,0,${-k})`; g.fill(); };
        flap([[0, 0], [W, 0], top], 0.04); flap([[0, H], [W, H], bot], -0.06); flap([[W, 0], [W, H], bot, [mx * 0.38, my], top], -0.03);
        const crease = (a, b) => { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); g.strokeStyle = 'rgba(255,235,210,0.18)'; g.beginPath(); g.moveTo(a[0] + 2, a[1] + 2); g.lineTo(b[0] + 2, b[1] + 2); g.stroke(); };
        crease([0, 0], top); crease([W, 0], top); crease([0, H], bot); crease([W, H], bot); crease(top, [mx * 0.38, my]); crease([mx * 0.38, my], bot);
      }
      crumple(g, W, H, r, p.crumple);
      if (p.label) { g.save(); g.translate(W * 0.1, H * 0.62); g.rotate(-Math.PI / 2); g.font = `${W * 0.07}px "${p.font}", sans-serif`; g.fillStyle = hexA(p.labelColor, 0.85); g.fillText(p.label, 0, 0); g.restore(); }
      return c;
    }
  },
  {
    id: 'locket', name: 'Locket', params: [
      S('metal', 'Metal', { silver: 'Silver', gold: 'Gold', rose: 'Rose gold', antique: 'Antique brass', black: 'Black metal' }, 'silver'), S('state', 'Open or closed', { open: 'Open', closed: 'Closed' }, 'open'),
      S('shape', 'Shape', { oval: 'Oval', heart: 'Heart', round: 'Round' }, 'oval'), B('see', 'See-through inside (put art under it)', true), R('size', 'Size', 400, 1600, 900, 10), B('engrave', 'Engraved swirl (closed)', true)],
    draw(p, r) {
      const M = { silver: ['#f4f4f6', '#9a9aa2', '#5c5c63'], gold: ['#fff1c2', '#d4a64a', '#7a5517'], rose: ['#ffe2d4', '#d99a82', '#8a4e3c'], antique: ['#e9d7a2', '#9b7d42', '#4f3b18'], black: ['#7a7a80', '#2a2a2e', '#0c0c0e'] }[p.metal];
      const S0 = p.size, half = S0 * 0.42, c = mk(p.state === 'open' ? S0 * 2.05 : S0 * 1.1, S0 * 1.55), g = c.getContext('2d');
      const shapePath = (cx, cy, rw, rh) => {
        g.beginPath();
        if (p.shape === 'heart') { g.moveTo(cx, cy + rh); g.bezierCurveTo(cx - rw * 1.6, cy + rh * 0.1, cx - rw * 0.9, cy - rh * 1.2, cx, cy - rh * 0.45); g.bezierCurveTo(cx + rw * 0.9, cy - rh * 1.2, cx + rw * 1.6, cy + rh * 0.1, cx, cy + rh); }
        else g.ellipse(cx, cy, rw, p.shape === 'round' ? rw : rh, 0, 0, 7);
      };
      const metalFill = (cx, cy, rw, rh, flip) => { const gr = g.createLinearGradient(cx - rw, cy - rh, cx + rw, cy + rh); const s = flip ? [2, 1, 0, 1, 2] : [0, 1, 2, 1, 0]; [0, 0.3, 0.5, 0.75, 1].forEach((t, i) => gr.addColorStop(t, M[s[i]])); return gr; };
      const half_ = (cx, cy, inside) => {
        const rw = half, rh = half * 1.32;
        g.save(); g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
        shapePath(cx, cy, rw, rh); g.fillStyle = metalFill(cx, cy, rw, rh); g.fill(); g.restore();
        shapePath(cx, cy, rw * 0.93, rh * 0.93); g.fillStyle = metalFill(cx, cy, rw, rh, true); g.fill();
        shapePath(cx, cy, rw * 0.86, rh * 0.86); g.fillStyle = metalFill(cx, cy, rw, rh); g.fill();
        if (inside) {
          shapePath(cx, cy, rw * 0.74, rh * 0.74);
          if (p.see) { g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fill(); g.restore(); shapePath(cx, cy, rw * 0.74, rh * 0.74); g.strokeStyle = M[2]; g.lineWidth = 3; g.stroke(); }
          else { const gr = g.createRadialGradient(cx - rw * 0.2, cy - rh * 0.3, 0, cx, cy, rw); gr.addColorStop(0, M[0]); gr.addColorStop(1, M[1]); g.fillStyle = gr; g.fill(); g.save(); g.clip(); g.strokeStyle = 'rgba(255,255,255,0.12)'; for (let x = cx - rw; x < cx + rw; x += 3) { g.beginPath(); g.moveTo(x, cy - rh); g.lineTo(x, cy + rh); g.stroke(); } g.restore(); }
        } else if (p.engrave) {
          g.save(); shapePath(cx, cy, rw * 0.8, rh * 0.8); g.clip(); g.strokeStyle = hexA('#000000', 0.25); g.lineWidth = 3;
          for (let k = 0; k < 3; k++) { g.beginPath(); for (let t = 0; t < 12; t += 0.05) { const rr = t * rw * 0.06, x = cx + Math.cos(t + k * 2.1) * rr, y = cy + Math.sin(t + k * 2.1) * rr * 1.3; t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
          g.restore();
        }
        // highlight
        g.save(); shapePath(cx, cy, rw, rh); g.clip(); const hl = g.createLinearGradient(cx - rw, cy - rh, cx, cy); hl.addColorStop(0, 'rgba(255,255,255,0.45)'); hl.addColorStop(0.4, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.fillRect(cx - rw, cy - rh, rw * 2, rh * 2); g.restore();
      };
      const bail = (cx, top) => {
        const gr = g.createLinearGradient(cx - 30, 0, cx + 30, 0); gr.addColorStop(0, M[2]); gr.addColorStop(0.4, M[0]); gr.addColorStop(1, M[1]);
        g.strokeStyle = gr; g.lineWidth = S0 * 0.03; g.beginPath(); g.arc(cx, top - S0 * 0.04, S0 * 0.045, 0, 7); g.stroke();
        g.fillStyle = gr; g.beginPath(); g.moveTo(cx - S0 * 0.05, top - S0 * 0.08); g.quadraticCurveTo(cx - S0 * 0.06, top - S0 * 0.24, cx, top - S0 * 0.26); g.quadraticCurveTo(cx + S0 * 0.06, top - S0 * 0.24, cx + S0 * 0.05, top - S0 * 0.08); g.closePath(); g.fill();
      };
      if (p.state === 'open') {
        const cy = c.height * 0.58, lx = c.width * 0.27, rx = c.width * 0.73;
        half_(lx, cy, true); half_(rx, cy, true);
        g.fillStyle = metalFill(c.width / 2, cy, 20, 80); g.beginPath(); g.roundRect(c.width / 2 - S0 * 0.025, cy - S0 * 0.13, S0 * 0.05, S0 * 0.26, 10); g.fill();
        bail(rx, cy - half * 1.32);
      } else {
        const cx = c.width / 2, cy = c.height * 0.58; bail(cx, cy - half * 1.32); half_(cx, cy, false);
      }
      return c;
    }
  },
  {
    id: 'tape', name: 'Washi / masking tape', params: [
      C('color', 'Tape color', '#d9c7a8'), R('w', 'Length', 200, 1600, 700, 10), R('h', 'Width', 40, 300, 120, 2), R('alpha', 'See-through', 0.2, 1, 0.78, 0.02),
      S('pattern', 'Pattern', { none: 'Plain (masking)', stripes: 'Stripes', dots: 'Dots', grid: 'Grid', check: 'Gingham', text: 'Words' }, 'none'), C('pcolor', 'Pattern color', '#7a0f12'), T('text', 'Words (for Words)', 'keep going'), R('tear', 'Torn ends', 0, 20, 8)],
    draw(p, r) {
      const c = mk(p.w + 20, p.h + 20), g = c.getContext('2d'), x0 = 10, y0 = 10;
      g.beginPath(); g.moveTo(x0, y0);
      for (let x = x0; x <= x0 + p.w; x += 8) g.lineTo(x, y0 + (r() - 0.5) * 1.5);
      for (let y = y0; y <= y0 + p.h; y += 4) g.lineTo(x0 + p.w - r() * p.tear, y);
      for (let x = x0 + p.w; x >= x0; x -= 8) g.lineTo(x, y0 + p.h + (r() - 0.5) * 1.5);
      for (let y = y0 + p.h; y >= y0; y -= 4) g.lineTo(x0 + r() * p.tear, y);
      g.closePath(); g.save(); g.clip();
      g.globalAlpha = p.alpha; g.fillStyle = paperPattern(g, 'smooth', p.color); g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = p.pcolor;
      if (p.pattern === 'stripes') for (let x = -p.h; x < c.width; x += p.h * 0.4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + p.h * 0.18, 0); g.lineTo(x + p.h * 0.18 + p.h, c.height); g.lineTo(x + p.h, c.height); g.fill(); }
      if (p.pattern === 'dots') for (let y = y0 + p.h * 0.2; y < c.height; y += p.h * 0.3) for (let x = x0 + ((y / (p.h * 0.3)) % 2) * p.h * 0.15; x < c.width; x += p.h * 0.3) { g.beginPath(); g.arc(x, y, p.h * 0.05, 0, 7); g.fill(); }
      if (p.pattern === 'grid') { g.globalAlpha = p.alpha * 0.6; for (let x = 0; x < c.width; x += p.h / 5) g.fillRect(x, 0, 1.5, c.height); for (let y = 0; y < c.height; y += p.h / 5) g.fillRect(0, y, c.width, 1.5); }
      if (p.pattern === 'check') { g.globalAlpha = p.alpha * 0.45; const s = p.h / 4; for (let x = 0; x < c.width; x += s * 2) g.fillRect(x, 0, s, c.height); for (let y = 0; y < c.height; y += s * 2) g.fillRect(0, y, c.width, s); }
      if (p.pattern === 'text') { g.font = `${p.h * 0.42}px "Courier New", monospace`; g.textBaseline = 'middle'; let x = x0 + 20; while (x < c.width) { g.fillText(p.text, x, y0 + p.h / 2); x += g.measureText(p.text).width + p.h * 0.6; } }
      g.restore();
      g.globalAlpha = 1;
      return c;
    }
  },
  {
    id: 'stamp', name: 'Postage stamp', params: [
      C('color', 'Main color', '#7a0f12'), C('paper', 'Border color', '#f4efe2'), R('w', 'Width', 200, 1200, 520, 10), R('h', 'Height', 200, 1400, 640, 10), R('perf', 'Perforation size', 6, 30, 14),
      T('value', 'Value', '25'), T('country', 'Text', 'SKETCHBOOK POST'), S('art', 'Inside', { sun: 'Sunburst', waves: 'Waves', flower: 'Flower', plain: 'Plain', window: 'See-through window' }, 'sun'), B('cancel', 'Postmark', true)],
    draw(p, r) {
      const pr = p.perf, c = mk(p.w + pr * 2, p.h + pr * 2), g = c.getContext('2d'), x0 = pr, y0 = pr, W = p.w, H = p.h;
      g.fillStyle = paperPattern(g, 'smooth', p.paper); g.fillRect(x0, y0, W, H);
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
      const step = pr * 2.2;
      for (let x = x0; x <= x0 + W; x += step) { dot(g, x, y0, pr * 0.62); dot(g, x, y0 + H, pr * 0.62); }
      for (let y = y0; y <= y0 + H; y += step) { dot(g, x0, y, pr * 0.62); dot(g, x0 + W, y, pr * 0.62); }
      g.globalCompositeOperation = 'source-over';
      const ix = x0 + W * 0.09, iy = y0 + H * 0.08, iw = W * 0.82, ih = H * 0.84;
      g.save(); g.beginPath(); g.rect(ix, iy, iw, ih); g.clip();
      if (p.art === 'window') { g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fillRect(ix, iy, iw, ih); g.globalCompositeOperation = 'source-over'; }
      else {
        g.fillStyle = p.color; g.fillRect(ix, iy, iw, ih);
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.fillStyle = 'rgba(255,255,255,0.3)';
        if (p.art === 'sun') for (let a = 0; a < 6.283; a += 0.18) { g.beginPath(); g.moveTo(ix + iw / 2, iy + ih * 0.6); g.lineTo(ix + iw / 2 + Math.cos(a) * iw, iy + ih * 0.6 + Math.sin(a) * iw); g.lineTo(ix + iw / 2 + Math.cos(a + 0.08) * iw, iy + ih * 0.6 + Math.sin(a + 0.08) * iw); g.fill(); }
        if (p.art === 'waves') { g.lineWidth = 3; for (let y = iy + 20; y < iy + ih; y += 18) { g.beginPath(); for (let x = ix; x <= ix + iw; x += 4) g.lineTo(x, y + Math.sin(x * 0.05) * 5); g.stroke(); } }
        if (p.art === 'flower') { for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; g.beginPath(); g.ellipse(ix + iw / 2 + Math.cos(a) * iw * 0.16, iy + ih * 0.52 + Math.sin(a) * iw * 0.16, iw * 0.14, iw * 0.06, a, 0, 7); g.fill(); } }
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = `bold ${iw * 0.2}px Georgia, serif`; g.fillText(p.value, ix + iw * 0.07, iy + iw * 0.24);
        g.font = `${iw * 0.07}px Georgia, serif`; g.textAlign = 'center'; g.fillText(p.country, ix + iw / 2, iy + ih - iw * 0.06); g.textAlign = 'left';
      }
      g.restore();
      if (p.cancel) { g.strokeStyle = 'rgba(25,25,30,0.55)'; g.lineWidth = 3; g.beginPath(); g.arc(x0 + W * 0.78, y0 + H * 0.3, W * 0.22, 0, 7); g.stroke(); for (let k = 0; k < 4; k++) { g.beginPath(); for (let x = x0 + W * 0.2; x < x0 + W * 1.2; x += 5) g.lineTo(x, y0 + H * 0.24 + k * 14 + Math.sin(x * 0.04) * 6); g.stroke(); } }
      return c;
    }
  },
  {
    id: 'polaroid', name: 'Instant photo frame', params: [
      C('color', 'Frame color', '#f6f3ec'), R('size', 'Size', 400, 1600, 800, 10), S('window', 'Photo area', { see: 'See-through (put art under it)', dark: 'Dark (undeveloped)', paper: 'Paper' }, 'see'),
      T('caption', 'Caption', 'summer'), S('font', 'Caption font', FONT_OPTS, 'Ink Free'), C('ink', 'Caption color', '#2a2a6a'), R('wear', 'Wear', 0, 1, 0.3, 0.05)],
    draw(p, r) {
      const W = p.size, H = W * 1.2, c = mk(W, H), g = c.getContext('2d');
      g.beginPath(); g.roundRect(0, 0, W, H, Math.max(3, W * 0.012)); g.clip();
      g.fillStyle = paperPattern(g, 'smooth', p.color); g.fillRect(0, 0, W, H);
      mottle(g, W, H, r, 0.06 * p.wear + 0.02);
      const m = W * 0.06, ph = W - m * 2;
      g.save(); g.beginPath(); g.rect(m, m, ph, ph);
      if (p.window === 'see') { g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fill(); }
      else { g.fillStyle = p.window === 'dark' ? '#1d1f22' : '#e9e4d8'; g.fill(); }
      g.restore();
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; g.strokeRect(m, m, ph, ph);
      g.fillStyle = p.ink; g.font = `${W * 0.075}px "${p.font}", cursive`; g.textAlign = 'center'; g.fillText(p.caption, W / 2, H - (H - W) * 0.42);
      return c;
    }
  },
  {
    id: 'ticket', name: 'Ticket stub', params: [
      C('color', 'Color', '#e8c75a'), C('ink', 'Ink', '#2a1a10'), R('w', 'Width', 300, 1400, 760, 10), R('h', 'Height', 150, 700, 320, 10), T('title', 'Text', 'ADMIT ONE'), T('num', 'Number', 'No 004218'), B('stub', 'Keep the stub', true)],
    draw(p, r) {
      const c = mk(p.w, p.h), g = c.getContext('2d'), W = p.w, H = p.h, n = H * 0.12;
      g.beginPath(); g.moveTo(n, 0); g.lineTo(W - n, 0); g.arc(W, 0, n, Math.PI, Math.PI / 2, true); g.lineTo(W, H - n); g.arc(W, H, n, -Math.PI / 2, Math.PI, true); g.lineTo(n, H); g.arc(0, H, n, 0, -Math.PI / 2, true); g.lineTo(0, n); g.arc(0, 0, n, Math.PI / 2, 0, true); g.closePath();
      g.fillStyle = paperPattern(g, 'smooth', p.color); g.fill();
      g.save(); g.clip(); mottle(g, W, H, r, 0.08); g.restore();
      g.strokeStyle = p.ink; g.lineWidth = 2; g.strokeRect(H * 0.12, H * 0.14, W * (p.stub ? 0.72 : 1) - H * 0.24, H * 0.72);
      g.fillStyle = p.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold ${H * 0.22}px "Arial Black", sans-serif`; g.fillText(p.title, W * (p.stub ? 0.36 : 0.5), H * 0.45);
      g.font = `${H * 0.09}px "Courier New", monospace`; g.fillText(p.num, W * (p.stub ? 0.36 : 0.5), H * 0.7);
      if (p.stub) { g.setLineDash([6, 6]); g.beginPath(); g.moveTo(W * 0.76, 6); g.lineTo(W * 0.76, H - 6); g.stroke(); g.setLineDash([]); g.save(); g.translate(W * 0.88, H / 2); g.rotate(-Math.PI / 2); g.font = `${H * 0.1}px "Courier New", monospace`; g.fillText(p.num, 0, 0); g.restore(); }
      return c;
    }
  },
  {
    id: 'tag', name: 'Shipping tag', params: [
      C('color', 'Tag color', '#c9a46a'), C('ink', 'Ink', '#2a1a10'), R('w', 'Width', 200, 900, 420, 10), R('h', 'Height', 300, 1600, 780, 10), T('text', 'Text', 'handle\nwith care'), S('font', 'Font', FONT_OPTS, 'Courier New'), B('string', 'String', true), C('stringColor', 'String color', '#efe6d2')],
    draw(p, r) {
      const W = p.w, H = p.h, top = p.string ? H * 0.35 : 20, c = mk(W + 40, H + top + 20), g = c.getContext('2d'), x0 = 20, y0 = top, cut = W * 0.22;
      g.beginPath(); g.moveTo(x0 + cut, y0); g.lineTo(x0 + W - cut, y0); g.lineTo(x0 + W, y0 + cut); g.lineTo(x0 + W, y0 + H); g.lineTo(x0, y0 + H); g.lineTo(x0, y0 + cut); g.closePath();
      g.fillStyle = paperPattern(g, 'kraft', p.color); g.fill();
      g.save(); g.clip(); mottle(g, c.width, c.height, r, 0.08); crumple(g, c.width, c.height, r, 0.5); g.restore();
      const hx = x0 + W / 2, hy = y0 + cut * 0.8;
      g.fillStyle = shade(p.color, 0.25); g.beginPath(); g.arc(hx, hy, W * 0.09, 0, 7); g.fill();
      g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); g.arc(hx, hy, W * 0.045, 0, 7); g.fill(); g.restore();
      g.fillStyle = p.ink; g.font = `${W * 0.1}px "${p.font}", monospace`; g.textAlign = 'center';
      p.text.split('\n').forEach((ln, i) => g.fillText(ln, x0 + W / 2, y0 + H * 0.5 + i * W * 0.13));
      if (p.string) { g.strokeStyle = p.stringColor; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(hx, hy); g.bezierCurveTo(hx - W * 0.4, top * 0.2, hx + W * 0.1, 0, hx + W * 0.3, top * 0.1); g.stroke(); g.beginPath(); g.moveTo(hx, hy); g.bezierCurveTo(hx + W * 0.3, top * 0.3, hx - W * 0.2, top * 0.1, hx - W * 0.35, 6); g.stroke(); }
      return c;
    }
  },
  {
    id: 'clip', name: 'Paper clip / pin', params: [S('kind', 'Kind', { clip: 'Paper clip', pin: 'Push pin', staple: 'Staple' }, 'clip'), S('metal', 'Color', { silver: 'Silver', gold: 'Gold', red: 'Red', black: 'Black' }, 'silver'), R('size', 'Size', 100, 800, 360, 10)],
    draw(p, r) {
      const col = { silver: ['#f2f2f4', '#8d8d94'], gold: ['#ffe9a8', '#a87a22'], red: ['#ff8a80', '#8a1010'], black: ['#6a6a70', '#101012'] }[p.metal];
      const S0 = p.size, c = mk(S0 * 0.5, S0 * 1.1), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, c.width, 0); gr.addColorStop(0, col[1]); gr.addColorStop(0.45, col[0]); gr.addColorStop(1, col[1]);
      g.strokeStyle = gr; g.lineCap = 'round'; g.lineJoin = 'round';
      if (p.kind === 'clip') {
        g.lineWidth = S0 * 0.03; const w = c.width, h = c.height;
        g.beginPath(); g.moveTo(w * 0.62, h * 0.32); g.lineTo(w * 0.62, h * 0.82); g.arc(w * 0.47, h * 0.82, w * 0.15, 0, Math.PI); g.lineTo(w * 0.32, h * 0.18); g.arc(w * 0.52, h * 0.18, w * 0.2, Math.PI, 0); g.lineTo(w * 0.72, h * 0.9); g.arc(w * 0.47, h * 0.9, w * 0.25, 0, Math.PI); g.lineTo(w * 0.22, h * 0.3); g.stroke();
      } else if (p.kind === 'pin') {
        const cx = c.width / 2; g.fillStyle = gr; g.beginPath(); g.ellipse(cx, S0 * 0.2, S0 * 0.18, S0 * 0.12, 0, 0, 7); g.fill();
        g.fillRect(cx - S0 * 0.06, S0 * 0.2, S0 * 0.12, S0 * 0.25); g.beginPath(); g.ellipse(cx, S0 * 0.47, S0 * 0.14, S0 * 0.06, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(cx - S0 * 0.06, S0 * 0.16, S0 * 0.05, S0 * 0.03, -0.4, 0, 7); g.fill();
      } else { g.lineWidth = S0 * 0.025; g.beginPath(); g.moveTo(c.width * 0.15, S0 * 0.55); g.lineTo(c.width * 0.15, S0 * 0.45); g.lineTo(c.width * 0.85, S0 * 0.45); g.lineTo(c.width * 0.85, S0 * 0.55); g.stroke(); }
      return c;
    }
  },
  {
    id: 'supply', name: 'Art supply', params: [S('tool', 'Tool', { brush: 'Paint brush', pencil: 'Pencil', pastel: 'Oil pastel', knife: 'Palette knife', inkbrush: 'Ink brush', marker: 'Marker', pen: 'Pen', charcoal: 'Charcoal', eraser: 'Eraser' }, 'brush'), C('color', 'Paint / color', '#9aa83a'), R('size', 'Size', 2, 8, 4, 0.5), R('angle', 'Angle', -90, 90, 0)],
    draw(p, r) {
      const k = p.size, c = mk(120 * k, 230 * k), g = c.getContext('2d');
      g.translate(c.width / 2, 30 * k); g.scale(k, k); g.rotate(0.62 + p.angle * Math.PI / 180);
      drawTool(g, p.tool, p.color, 30, 0);
      return c;
    }
  },
  {
    id: 'mark', name: 'Paint mark', params: [
      S('brush', 'Mark', { impasto: 'Impasto smear', oil: 'Oil stroke', pastel: 'Oil pastel scribble', sumi: 'Ink brush swirl', charcoal: 'Charcoal smudge', watercolor: 'Watercolor wash', drybrush: 'Dry brush', splatter: 'Splatter' }, 'impasto'),
      C('color', 'Color', '#5b6a3c'), C('color2', 'Second color (blend)', '#ef9fb0'), B('two', 'Use two colors', false), R('size', 'Brush size', 10, 160, 80), R('len', 'Length', 200, 1400, 800, 10), R('curve', 'Wildness', 0, 1, 0.3, 0.05), R('passes', 'Strokes', 1, 12, 3)],
    draw(p, r) {
      const W = p.len + p.size * 3, H = p.len * 1.2 + p.size * 3, c = mk(W, H), g = c.getContext('2d');
      const preset = PRESETS.find(x => x.id === p.brush) || PRESETS[0];
      for (let s = 0; s < p.passes; s++) {
        const col = p.two && s % 2 ? p.color2 : p.color;
        const st = new Stroke({ ...preset, size: p.size }, g, { color: col, paper: 'sketch', layerCtx: g });
        const x0 = W * (0.3 + r() * 0.4), y0 = p.size * 1.5 + r() * H * 0.1;
        const pts = 40 + p.curve * 60;
        for (let i = 0; i <= pts; i++) {
          const t = i / pts, wob = Math.sin(t * (3 + p.curve * 9) + s) * p.len * 0.25 * p.curve;
          const x = x0 + wob + (r() - 0.5) * p.curve * 20, y = y0 + t * (H - p.size * 3) * (0.8 + r() * 0.05);
          st.add({ x, y, p: Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.8 + 0.2 });
        }
        st.finish();
      }
      return c;
    }
  },
];

function dot(g, x, y, rr) { g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }
function spaced(g, t, x, y, sp) { for (const ch of t) { g.fillText(ch, x, y); x += g.measureText(ch).width + sp; } }
function spacedC(g, t, cx, y, sp) { let w = 0; for (const ch of t) w += g.measureText(ch).width + sp; const a = g.textAlign; g.textAlign = 'left'; spaced(g, t, cx - w / 2, y, sp); g.textAlign = a; }

function drawPrint(g, p, pad, r) {
  const W = g.canvas.width, H = g.canvas.height;
  g.strokeStyle = hexA(p.ink, 0.55); g.fillStyle = hexA(p.ink, 0.55); g.lineWidth = 1.5;
  if (p.print === 'lines') { for (let y = pad + 60; y < H; y += 36) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } g.strokeStyle = 'rgba(200,60,60,0.5)'; g.beginPath(); g.moveTo(pad + 70, 0); g.lineTo(pad + 70, H); g.stroke(); }
  if (p.print === 'grid') { g.lineWidth = 1; for (let x = 0; x < W; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
  if (p.print === 'dots') for (let y = 15; y < H; y += 30) for (let x = 15; x < W; x += 30) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
  if (p.print === 'music') for (let y = pad + 80; y < H; y += 150) for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(0, y + k * 14); g.lineTo(W, y + k * 14); g.stroke(); }
  if (p.print === 'text') { g.font = '22px Georgia, serif'; const words = 'the quiet hour of the evening light upon the long road home and every small thing kept'.split(' '); for (let y = pad + 50; y < H; y += 32) { let x = pad + 20, line = ''; while (x < W - pad) { const w = words[(r() * words.length) | 0] + ' '; g.fillText(w, x, y); x += g.measureText(w).width; } } }
}

function foldCorner(g, x, y, s, color, paper) {
  g.save();
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); g.moveTo(x - s, y - 5); g.lineTo(x + 5, y - 5); g.lineTo(x + 5, y + s); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.beginPath(); g.moveTo(x - s, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.95, y + s * 0.95); g.closePath();
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 12; g.shadowOffsetX = -4; g.shadowOffsetY = 4;
  g.fillStyle = paperPattern(g, paper, shade(color, -0.06)); g.fill();
  g.restore();
}

export function defaultsOf(m) { const o = { seed: 7 }; m.params.forEach(q => o[q.k] = q.def); return o; }
export function runMaker(m, params) {
  const r = rng((params.seed || 1) * 7919 + 13);
  return trim(m.draw(params, r));
}

// First visit: a small starter set so the library is not empty. All made in code.
const cs = (shape, o = {}) => ['cute', { shape, ...o }, o.name || SHAPE_NAMES[shape]];
export const STARTERS_2 = [
  ['piece', { kind: 'oldposter', color: '#7fb3a4' }, 'Old folded paper'], ['piece', { kind: 'oldposter', color: '#e8c6a0' }, 'Old folded tan paper'],
  ['piece', { kind: 'binderclip', color: '#1a1a1a' }, 'Binder clip'], ['piece', { kind: 'plasticclip', color: '#c9a3b8' }, 'Pink plastic clip'], ['piece', { kind: 'spiral', color: '#111111', color2: '#ffffff' }, 'Hypnotic spiral'],
  ['piece', { kind: 'window', color: '#0a246a' }, 'Retro window'], ['piece', { kind: 'block', color: '#ffffff', color2: '#d6235a', text: 'STOP\nOVERTHINKING', size: 90 }, 'Stop overthinking'], ['piece', { kind: 'quote', color: '#111111', color2: '#ffffff', text: 'those detours are\nupgrades in disguise', size: 70 }, 'Typed quote'],
  ['piece', { kind: 'dymo', color: '#ffffff', color2: '#111111', text: 'THIS WEEK', size: 70 }, 'Label tape: this week'], ['piece', { kind: 'dymo', color: '#ffffff', color2: '#111111', text: 'MONDAY', size: 70 }, 'Label tape: Monday'], ['piece', { kind: 'dymo', color: '#ffffff', color2: '#c0182a', text: 'FRIDAY', size: 70 }, 'Label tape: Friday'],
  ['piece', { kind: 'keycap', color: '#2a2a2e', color2: '#ffffff', text: 'Ctrl', size: 90 }, 'Ctrl key'], ['piece', { kind: 'keycap', color: '#f2f2f2', color2: '#222222', text: 'Esc', size: 90 }, 'Esc key'], ['piece', { kind: 'facts' }, 'Facts label'],
  ['piece', { kind: 'wavypaper', color2: '#ffffff' }, 'Wavy lined paper'], ['piece', { kind: 'monoprint', color: '#d6237a', color2: '#ffffff' }, 'Pink monoprint'],
  ['piece', { kind: 'seal', color: '#d98aa6', emblem: 'heart' }, 'Pink wax seal'], ['piece', { kind: 'seal', color: '#8a1d2a', emblem: 'star' }, 'Red wax seal'], ['piece', { kind: 'seal', color: '#c9a24a', emblem: 'letter', text: 'S' }, 'Gold initial seal'],
  ['piece', { kind: 'key', color: '#c8c8cc', text: 'always' }, 'Heart key charm'], ['piece', { kind: 'cutwords', color: '#1a1a1a', color2: '#f2ead0', text: 'to love\nand be loved', size: 90 }, 'Cut-out words'], ['piece', { kind: 'cutwords', color: '#c0182a', color2: '#ffffff', text: 'remember this', lines: false }, 'Red cut-out words'],
  ['piece', { kind: 'arch', color: '#1a1a1a', color2: '#efe6d2', text: 'slow down and breathe', paper: 'vintage' }, 'Arched words'],
  ['piece', { kind: 'gem', color: '#ff5fa2', emblem: 'heart' }, 'Heart rhinestone'], ['piece', { kind: 'gems', mixed: true, emblem: 'round' }, 'Rhinestone strip'], ['piece', { kind: 'gems', mixed: false, color: '#c0182a', emblem: 'round' }, 'Red rhinestones'],
  ['piece', { kind: 'fancylabel', color: '#f6b8c9', color2: '#6b4a3a' }, 'Swirly label'], ['piece', { kind: 'receipt' }, 'Barcode strip'], ['piece', { kind: 'safetypin', color: '#c8c8cc', color2: '#c0182a' }, 'Safety pin'],
  ['piece', { kind: 'disco' }, 'Disco ball'], ['piece', { kind: 'checker', color: '#111111', color2: '#ffffff' }, 'Checker strip'], ['piece', { kind: 'burst', color: '#ffffff', color2: '#d61f2c', paper: 'dotgrid' }, 'Starburst page'],
  ['piece', { kind: 'flowerword', color: '#9cf04a', color2: '#c03ad0', text: 'bloom' }, 'Flower letters'], ['piece', { kind: 'roundbadge', color: '#3d4fd6', color2: '#f2c62a', textColor: '#f2c62a', text: 'one of a kind' }, 'Round badge'],
  ['piece', { kind: 'oval', color: '#f7e43a', color2: '#111111', textColor: '#111111', text: 'no copies' }, 'Oval sticker'], ['piece', { kind: 'sign', color: '#ffd400', color2: '#111111' }, 'Sign figure'],
  ['piece', { kind: 'locker', color: '#6a3fb5' }, 'Purple locker'], ['piece', { kind: 'note', color: '#f4b6c2', color2: '#5a2a3a' }, 'Pink note with tape'],
  cs('heart', { color: '#ff5d8f', name: 'Pink heart' }), cs('heart', { color: '#d62839', pattern: 'dots', name: 'Polka heart' }), cs('heart', { color: '#ffd6e0', pattern: 'gingham', color2: '#ff8fb1', name: 'Gingham heart' }),
  cs('star', { color: '#ffd23f', name: 'Gold star' }), cs('star', { color: '#7bdff2', pattern: 'stripes', name: 'Striped star' }), cs('sparkle', { color: '#fff3b0', name: 'Sparkle' }), cs('sparkle', { color: '#c8b6ff', name: 'Lilac sparkle' }),
  cs('flower', { color: '#ffb5c2', name: 'Pink flower' }), cs('daisy', { color: '#ffffff', lineW: 6, line: '#e0c040', name: 'Daisy' }), cs('tulip', { color: '#ff6b6b', name: 'Tulip' }),
  cs('cloud', { color: '#ffffff', lineW: 8, line: '#9ec9ff', face: true, name: 'Happy cloud' }), cs('moon', { color: '#ffe066', name: 'Moon' }), cs('sun', { color: '#ffb703', face: true, line: '#8a4b00', name: 'Sunshine' }),
  cs('butterfly', { color: '#a0c4ff', pattern: 'dots', name: 'Butterfly' }), cs('cherry', { color: '#e63946', name: 'Cherries' }), cs('strawberry', { color: '#ef476f', pattern: 'dots', color2: '#ffe066', name: 'Strawberry' }),
  cs('bow', { color: '#ffafcc', name: 'Pink bow' }), cs('bow', { color: '#2b2d42', pattern: 'dots', name: 'Polka bow' }), cs('rainbow', { color: '#ff8fab', pattern: 'fade', color2: '#a0c4ff', name: 'Rainbow' }),
  cs('mushroom', { color: '#e63946', pattern: 'dots', name: 'Toadstool' }), cs('leaf', { color: '#80b918', name: 'Leaf' }), cs('bolt', { color: '#ffd60a', lineW: 6, line: '#3a2a2a', name: 'Lightning' }),
  cs('smiley', { color: '#ffd60a', face: true, name: 'Smiley' }), cs('planet', { color: '#cdb4db', name: 'Planet' }), cs('crown', { color: '#ffc300', name: 'Crown' }), cs('note', { color: '#3a2a2a', name: 'Music note' }),
  cs('bubble', { color: '#ffffff', lineW: 8, line: '#3a2a2a', text: 'hi!', textColor: '#3a2a2a', name: 'Speech bubble' }), cs('bubble', { color: '#ffc8dd', text: 'omg', name: 'OMG bubble' }),
  cs('banner', { color: '#ff8fab', text: 'memories', name: 'Memories banner' }), cs('banner', { color: '#3a5a40', text: 'adventure', name: 'Adventure banner' }), cs('banner', { color: '#264653', text: 'best day', name: 'Best day banner' }),
  cs('label', { color: '#f4a261', text: 'today', name: 'Today label' }), cs('label', { color: '#111111', text: 'xoxo', name: 'XOXO label' }), cs('label', { color: '#ffffff', lineW: 6, line: '#e63946', text: 'love', textColor: '#e63946', name: 'Love label' }),
  cs('label', { color: '#bde0fe', text: 'hello', textColor: '#1d3557', name: 'Hello label' }), cs('label', { color: '#ffe5ec', text: 'cute!', textColor: '#d62839', name: 'Cute label' }),
  cs('badge', { color: '#e9c46a', text: 'yay!', name: 'Yay badge' }), cs('badge', { color: '#2a9d8f', text: '100%', name: '100% badge' }), cs('badge', { color: '#ff70a6', pattern: 'stars', text: 'wow', name: 'Wow badge' }),
  cs('arrow', { color: '#ff595e', name: 'Arrow' }), cs('circle', { color: '#ffffff', lineW: 6, line: '#3a2a2a', text: '♡', textColor: '#e63946', textSize: 2, name: 'Heart dot' }),
  ['tape', { pattern: 'dots', color: '#ffd6e0', pcolor: '#ff8fb1' }, 'Pink dot washi'], ['tape', { pattern: 'grid', color: '#e0f2ff', pcolor: '#7bb3e0' }, 'Blue grid washi'], ['tape', { color: '#fff3b0' }, 'Yellow washi'],
  ['scrap', { print: 'grid', paper: 'cream', color: '#f7f1e3' }, 'Grid paper scrap'], ['scrap', { print: 'music', paper: 'vintage' }, 'Sheet music scrap'], ['scrap', { print: 'text', paper: 'vintage', crumple: 1.4 }, 'Old book page'],
  ['ticket', { color: '#ffb5a7' }, 'Pink ticket'], ['stamp', { color: '#a8dadc' }, 'Blue stamp'], ['tag', { color: '#e9c46a' }, 'Kraft tag'], ['polaroid', { color: '#ffffff' }, 'Photo frame'],
  ['clip', { kind: 'pin', color: '#e63946' }, 'Red push pin'], ['clip', { color: '#ffd60a' }, 'Gold paper clip'],
];
export const STARTERS = [
  ['scrap', { print: 'lines' }, 'Lined scrap'], ['scrap', { paper: 'kraft', color: '#b8946a', print: 'none', crumple: 1.2, edge: 8 }, 'Kraft scrap'], ['scrap', { paper: 'cream', color: '#f2e8d0', print: 'grid', ink: '#7a8a9a', fold: 120 }, 'Grid scrap'],
  ['cardboard', {}, 'Torn cardboard frame'], ['tulle', {}, 'Tulle with dots'], ['doily', {}, 'Blue doily'], ['doily', { shape: 'round', color: '#f4f1ea', tex: 'smooth' }, 'Round doily'],
  ['card', {}, 'Library card'], ['envelope', {}, 'Striped envelope'], ['locket', {}, 'Silver locket'], ['locket', { metal: 'gold', state: 'closed', shape: 'heart' }, 'Gold heart locket'],
  ['tape', {}, 'Masking tape'], ['tape', { pattern: 'stripes', color: '#f4efe2', pcolor: '#7a0f12' }, 'Striped washi'], ['stamp', {}, 'Postage stamp'], ['polaroid', {}, 'Instant photo frame'],
  ['ticket', {}, 'Ticket'], ['tag', {}, 'Shipping tag'], ['clip', {}, 'Paper clip'],
  ['supply', { tool: 'brush', color: '#9aa83a' }, 'Paint brush'], ['supply', { tool: 'pastel', color: '#ef5a7a' }, 'Oil pastel'],
  ['mark', { brush: 'impasto', color: '#5b6a3c' }, 'Green impasto'], ['mark', { brush: 'impasto', color: '#f2b8c6', len: 600 }, 'Pink impasto'], ['mark', { brush: 'pastel', color: '#ef5a7a', passes: 6, curve: 0.7 }, 'Pastel scribble'], ['mark', { brush: 'sumi', color: '#0d0d0e', passes: 5, curve: 0.8, size: 50 }, 'Ink swirls'],
];
