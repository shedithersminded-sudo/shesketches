// The artwork renderer. One code path draws a page for the editor, the book textures and the final export.
// The 3D book never feeds back into this: exports always come from here at full resolution.
import { getBlob, db } from './db.js';
import { paintPaper } from './paper.js';

const bmpCache = new Map(); // blobId -> ImageBitmap (small LRU)
const MAX_BMP = 48;
export async function bitmap(blobId) {
  if (!blobId) return null;
  if (bmpCache.has(blobId)) { const b = bmpCache.get(blobId); bmpCache.delete(blobId); bmpCache.set(blobId, b); return b; }
  const blob = await getBlob(blobId);
  if (!blob) return null;
  const bm = await createImageBitmap(blob, { premultiplyAlpha: 'default', colorSpaceConversion: 'default' });
  bmpCache.set(blobId, bm);
  while (bmpCache.size > MAX_BMP) { const k = bmpCache.keys().next().value; bmpCache.get(k).close?.(); bmpCache.delete(k); }
  return bm;
}
export function dropBitmaps() { for (const b of bmpCache.values()) b.close?.(); bmpCache.clear(); }

const customPaper = new Map();
async function customPaperImg(blobId) {
  if (!blobId) return null;
  if (!customPaper.has(blobId)) customPaper.set(blobId, await bitmap(blobId));
  return customPaper.get(blobId);
}

// ---------- moving media (GIF, animated WEBP/PNG, short videos) ----------
// Decoded once into frames. drawLayer picks the frame for the current time.
const mediaCache = new Map();
export const isAnimated = r => !!(r && r.frames && r.frames.length > 1);
export let mediaClock = null; // set to a time in ms to render a fixed moment (exports); null = live
export function setMediaClock(t) { mediaClock = t; }
async function decodeGif(blob) {
  if (!('ImageDecoder' in window)) return null;
  const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type || 'image/gif' });
  await dec.tracks.ready; const tr = dec.tracks.selectedTrack, n = Math.min(tr ? tr.frameCount : 1, 600);
  const frames = [], durs = [];
  for (let i = 0; i < n; i++) {
    const { image } = await dec.decode({ frameIndex: i });
    frames.push(await createImageBitmap(image)); durs.push(Math.max(20, (image.duration || 100000) / 1000)); image.close();
  }
  dec.close();
  let t = 0; const starts = durs.map(d => (t += d) - d);
  return { frames, durs, starts, total: t, width: frames[0].width, height: frames[0].height };
}
async function decodeVideo(blob) {
  const M = await import('../vendor/mediabunny.min.mjs');
  const input = new M.Input({ source: new M.BlobSource(blob), formats: M.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack(); if (!track) return null;
  const dur = Math.min(15, await input.computeDuration()), fps = 12, n = Math.max(1, Math.floor(dur * fps));
  const s = Math.min(1, 720 / Math.max(track.displayWidth, track.displayHeight));
  const sink = new M.CanvasSink(track, { width: Math.round(track.displayWidth * s), height: Math.round(track.displayHeight * s), fit: 'fill' });
  const frames = [], durs = [];
  for await (const w of sink.canvasesAtTimestamps(Array.from({ length: n }, (_, i) => i / fps))) { if (w) { frames.push(await createImageBitmap(w.canvas)); durs.push(1000 / fps); } }
  if (!frames.length) return null;
  let t = 0; const starts = durs.map(d => (t += d) - d);
  return { frames, durs, starts, total: t, width: frames[0].width, height: frames[0].height, video: true };
}
export async function mediaRes(L) {
  if (!L.media) return bitmap(L.src);
  if (mediaCache.has(L.src)) return mediaCache.get(L.src);
  const p = (async () => {
    const blob = await getBlob(L.src); if (!blob) return null;
    try { const r = L.media === 'video' ? await decodeVideo(blob) : await decodeGif(blob); if (r) return r; } catch (e) { console.warn('media decode', e); }
    return createImageBitmap(blob).catch(() => null);
  })();
  mediaCache.set(L.src, p);
  return p;
}
function frameOf(r, L) {
  if (!isAnimated(r)) return r && r.frames ? r.frames[0] : r;
  if (L.play === false || mediaClock === 'still') return r.frames[Math.min(r.frames.length - 1, L.still || 0)];
  const now = (mediaClock ?? performance.now()) * (L.speed || 1), t = now % r.total;
  let lo = 0, hi = r.starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (r.starts[m] <= t) lo = m; else hi = m - 1; }
  return r.frames[lo];
}
export function stillFrame(r, L) { return r && r.frames ? r.frames[Math.min(r.frames.length - 1, L.still || 0)] : r; }

export function paperOf(page, book) { return page.paper || book.paper; }

export async function loadRes(page) {
  const res = {};
  for (const L of page.layers) {
    if (L.kind === 'paint' && L.blob) res[L.id] = await bitmap(L.blob);
    if (L.kind === 'image') res[L.id] = await mediaRes(L);
  }
  return res;
}

export function filterString(f) {
  if (!f) return 'none';
  const s = [];
  if (f.b != null && f.b !== 100) s.push(`brightness(${f.b}%)`);
  if (f.c != null && f.c !== 100) s.push(`contrast(${f.c}%)`);
  if (f.s != null && f.s !== 100) s.push(`saturate(${f.s}%)`);
  if (f.h) s.push(`hue-rotate(${f.h}deg)`);
  if (f.gray) s.push(`grayscale(${f.gray}%)`);
  if (f.sepia) s.push(`sepia(${f.sepia}%)`);
  if (f.inv) s.push(`invert(${f.inv}%)`);
  if (f.blur) s.push(`blur(${f.blur}px)`);
  return s.length ? s.join(' ') : 'none';
}

export function textLines(L) { return String(L.text || '').split('\n'); }
export function fontString(L, S = 1) { return `${L.italic ? 'italic ' : ''}${L.weight || 400} ${L.size * S}px "${L.font || 'Ink Free'}", "Segoe Print", cursive`; }
export function itemSize(L, ctx) {
  if (L.kind === 'image') return { w: L.iw, h: L.ih };
  if (L.kind === 'text') {
    const c = ctx || measureCtx(); c.font = fontString(L); try { c.letterSpacing = (L.spacing || 0) + 'px'; } catch (e) { }
    const lines = textLines(L); let w = 1;
    for (const ln of lines) w = Math.max(w, c.measureText(ln).width);
    return { w: w + L.size * 0.2, h: lines.length * L.size * (L.lineH || 1.25) };
  }
  return { w: 0, h: 0 };
}
let mctx; const measureCtx = () => mctx || (mctx = document.createElement('canvas').getContext('2d'));

// Draw one layer. ctx must already be transformed so 1 unit = 1 page pixel.
export function drawLayer(ctx, L, res, S = 1) {
  if (!L.visible) return;
  ctx.save();
  ctx.globalAlpha = L.opacity ?? 1;
  ctx.globalCompositeOperation = L.blend || 'source-over';
  if (L.kind === 'paint') {
    const src = res[L.id];
    if (src) ctx.drawImage(src, 0, 0);
  } else if (L.kind === 'image' || L.kind === 'text') {
    const sz = itemSize(L, ctx);
    ctx.translate(L.x, L.y); ctx.rotate(L.rot || 0); ctx.scale((L.scale || 1) * (L.flipX ? -1 : 1), (L.scale || 1) * (L.flipY ? -1 : 1));
    if (L.shadow && L.shadow.on) {
      ctx.shadowColor = hexA(L.shadow.color || '#000000', L.shadow.a ?? 0.4);
      ctx.shadowBlur = (L.shadow.blur ?? 12) * S * (L.scale || 1);
      ctx.shadowOffsetX = (L.shadow.dx ?? 6) * S * (L.scale || 1); ctx.shadowOffsetY = (L.shadow.dy ?? 8) * S * (L.scale || 1);
    }
    const f = filterString(L.filter);
    if (f !== 'none') ctx.filter = f;
    if (L.kind === 'image') {
      const src = frameOf(res[L.id], L);
      if (src) ctx.drawImage(src, -sz.w / 2, -sz.h / 2, sz.w, sz.h);
    } else {
      ctx.font = fontString(L); ctx.textBaseline = 'top';
      if (L.spacing) try { ctx.letterSpacing = (L.spacing * 1) + 'px'; } catch (e) { }
      ctx.textAlign = L.align || 'left';
      const lh = L.size * (L.lineH || 1.25), x0 = L.align === 'center' ? 0 : L.align === 'right' ? sz.w / 2 : -sz.w / 2 + L.size * 0.1;
      textLines(L).forEach((ln, i) => {
        const y = -sz.h / 2 + i * lh + (lh - L.size) / 2;
        if (L.stroke && L.strokeW) { ctx.lineWidth = L.strokeW; ctx.strokeStyle = L.stroke; ctx.lineJoin = 'round'; ctx.strokeText(ln, x0, y); }
        ctx.fillStyle = L.color || '#111'; ctx.fillText(ln, x0, y);
      });
    }
  }
  ctx.restore();
}

// Draw a list of layers. Layers marked "clip" only show where the layer under them has pixels.
// hook(L, ctx, clipped) lets the editor draw a stroke in progress right after its layer.
let clipTmp = null;
export function drawLayers(ctx, layers, res, S, pw, ph, hook, q = 1) {
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    let j = i + 1; const clipped = [];
    while (j < layers.length && layers[j].clip) clipped.push(layers[j++]);
    if (!clipped.length) { drawLayer(ctx, L, res, S); if (L.visible && hook) hook(L, ctx, false); continue; }
    i = j - 1;
    if (!L.visible) continue; // clipped layers hide with their base
    const w = Math.max(1, Math.round(pw * q)), h = Math.max(1, Math.round(ph * q));
    if (!clipTmp) clipTmp = document.createElement('canvas');
    if (clipTmp.width !== w || clipTmp.height !== h) { clipTmp.width = w; clipTmp.height = h; }
    const tg = clipTmp.getContext('2d');
    tg.setTransform(1, 0, 0, 1, 0, 0); tg.clearRect(0, 0, w, h); tg.setTransform(q, 0, 0, q, 0, 0);
    drawLayer(tg, { ...L, opacity: 1, blend: 'source-over' }, res, S); if (hook) hook(L, tg, false);
    for (const C of clipped) { drawLayer(tg, { ...C, blend: 'source-atop' }, res, S); if (C.visible && hook) hook(C, tg, true); }
    ctx.save(); ctx.globalAlpha = L.opacity ?? 1; ctx.globalCompositeOperation = L.blend || 'source-over';
    ctx.drawImage(clipTmp, 0, 0, w, h, 0, 0, pw, ph); ctx.restore();
  }
}

export function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }

// Draw the paper background
export async function drawPaper(ctx, page, book, w, h) {
  const P = paperOf(page, book);
  const custom = P.type === 'custom' ? await customPaperImg(P.custom) : null;
  paintPaper(ctx, w, h, P.type, P.color, custom, page.seed || 1);
}

export function drawPageNumber(ctx, page, book, w, h, num) {
  const right = num % 2 === 0;
  const s = Math.round(h * 0.016);
  ctx.save();
  ctx.font = `${s}px "Ink Free", "Segoe Print", cursive`;
  const P = paperOf(page, book), dark = (P.color || '').toLowerCase() === '#1b1a19' || P.type === 'black';
  ctx.fillStyle = dark ? 'rgba(240,235,225,0.6)' : 'rgba(40,30,25,0.55)';
  ctx.textAlign = right ? 'right' : 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(String(num), right ? w - s * 2 : s * 2, h - s * 1.4);
  ctx.restore();
}

/**
 * Render a page.
 * opts.scale: output = page px * scale. opts.background: 'paper' | 'color' | 'transparent'.
 * opts.res: preloaded layer resources (editor passes its live canvases).
 */
export async function renderPage(page, book, opts = {}) {
  const S = opts.scale || 1;
  const w = Math.max(1, Math.round(page.w * S)), h = Math.max(1, Math.round(page.h * S));
  const c = opts.canvas || new OffscreenCanvasOr(w, h);
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const bg = opts.background || 'paper';
  if (bg === 'paper') await drawPaper(ctx, page, book, w, h);
  else if (bg === 'color') { ctx.fillStyle = opts.bgColor || '#ffffff'; ctx.fillRect(0, 0, w, h); }
  const res = opts.res || await loadRes(page);
  ctx.save(); ctx.scale(S, S);
  const was = mediaClock; mediaClock = opts.time ?? 'still';
  try { drawLayers(ctx, page.layers, res, S, page.w, page.h, null, Math.min(1, S)); } finally { mediaClock = was; }
  ctx.restore();
  if (opts.pageNumber) drawPageNumber(ctx, page, book, w, h, opts.pageNumber);
  return c;
}
function OffscreenCanvasOr(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export const canvasBlob = (c, type = 'image/png', q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('The browser could not encode this image. It may be too large.')), type, q));

// Small preview stored with each page, used by the book and the shelf.
export async function makeThumb(page, book, longSide = 1536, res) {
  const S = Math.min(1, longSide / Math.max(page.w, page.h));
  const book1 = book;
  const idx = book1.pages.indexOf(page.id);
  const c = await renderPage(page, book, { scale: S, res, pageNumber: book.pageNumbers ? idx + 1 : 0 });
  return canvasBlob(c, 'image/webp', 0.92);
}

export async function getPage(id) { return db.get('pages', id); }

export const pageHasMotion = page => page.layers.some(l => l.kind === 'image' && l.visible && (l.media === 'gif' || l.media === 'video') && l.play !== false);
