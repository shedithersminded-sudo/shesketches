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

export const MAKERS = [
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
export const STARTERS = [
  ['scrap', { print: 'lines' }, 'Lined scrap'], ['scrap', { paper: 'kraft', color: '#b8946a', print: 'none', crumple: 1.2, edge: 8 }, 'Kraft scrap'], ['scrap', { paper: 'cream', color: '#f2e8d0', print: 'grid', ink: '#7a8a9a', fold: 120 }, 'Grid scrap'],
  ['cardboard', {}, 'Torn cardboard frame'], ['tulle', {}, 'Tulle with dots'], ['doily', {}, 'Blue doily'], ['doily', { shape: 'round', color: '#f4f1ea', tex: 'smooth' }, 'Round doily'],
  ['card', {}, 'Library card'], ['envelope', {}, 'Striped envelope'], ['locket', {}, 'Silver locket'], ['locket', { metal: 'gold', state: 'closed', shape: 'heart' }, 'Gold heart locket'],
  ['tape', {}, 'Masking tape'], ['tape', { pattern: 'stripes', color: '#f4efe2', pcolor: '#7a0f12' }, 'Striped washi'], ['stamp', {}, 'Postage stamp'], ['polaroid', {}, 'Instant photo frame'],
  ['ticket', {}, 'Ticket'], ['tag', {}, 'Shipping tag'], ['clip', {}, 'Paper clip'],
  ['supply', { tool: 'brush', color: '#9aa83a' }, 'Paint brush'], ['supply', { tool: 'pastel', color: '#ef5a7a' }, 'Oil pastel'],
  ['mark', { brush: 'impasto', color: '#5b6a3c' }, 'Green impasto'], ['mark', { brush: 'impasto', color: '#f2b8c6', len: 600 }, 'Pink impasto'], ['mark', { brush: 'pastel', color: '#ef5a7a', passes: 6, curve: 0.7 }, 'Pastel scribble'], ['mark', { brush: 'sumi', color: '#0d0d0e', passes: 5, curve: 0.8, size: 50 }, 'Ink swirls'],
];
