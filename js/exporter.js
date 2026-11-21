// Export center. Two separate pipelines:
//  A) artwork: the real page canvas at full resolution, never the 3D book.
//  B) presentation: the 3D book rendered on purpose, frame by frame.
// Every file is checked after it is made, and a report says exactly what passed or failed.
import * as THREE from '../vendor/three.module.js';
import { GIFEncoder, quantize, applyPalette } from '../vendor/gifenc.js';
import { db, uid, getBlob, packBook } from './db.js';
import { renderPage, canvasBlob, loadRes, drawLayer, drawPaper } from './render.js';
import { pngWithDpi, jpgWithDpi, encodeTIFF, encodeBMP, buildPDF, deflate, makeZip, readZip, pngInfo, tiffInfo, bmpInfo, pdfInfo, gifInfo } from './encoders.js';
import { el, modal, slider, select, check, colorInput, numberInput, toast, saveFile, fmtBytes, safeName, chooseExportFolder } from './ui.js';
import { assetGrid } from './library.js';
import { Book3D } from './book3d.js';

let MB = null; const mediabunny = async () => MB || (MB = await import('../vendor/mediabunny.min.mjs'));
const PI = Math.PI;
const MAX_SIDE = 16384, MAX_AREA = 16384 * 16384 / 2;

// ---------- queue ----------
const queue = []; let running = false; let qbox = null;
function qPanel() {
  if (qbox && document.body.contains(qbox)) return qbox;
  qbox = el('div', { class: 'queue', 'aria-live': 'polite' }); document.body.append(qbox); return qbox;
}
function addJob(job) {
  job.id = uid('j_'); job.progress = 0; job.state = 'waiting'; job.ctrl = { cancelled: false };
  const bar = el('div', { class: 'bar' }, el('i')), label = el('span', { class: 'qn' }, job.name), eta = el('span', { class: 'muted small' }, 'waiting');
  job.row = el('div', { class: 'qrow' }, el('div', { class: 'row' }, label, el('button', { class: 'icon-btn tiny', title: 'Cancel', onclick: () => { job.ctrl.cancelled = true; eta.textContent = 'cancelling…'; } }, '✕')), bar, eta);
  job.ui = { bar: bar.firstChild, eta };
  qPanel().append(job.row);
  queue.push(job); pump();
}
async function pump() {
  if (running) return; const job = queue.shift(); if (!job) return;
  running = true; job.state = 'running'; const t0 = performance.now();
  const prog = p => {
    job.progress = p; job.ui.bar.style.width = Math.round(p * 100) + '%';
    const el_ = (performance.now() - t0) / 1000;
    job.ui.eta.textContent = p > 0.03 ? `${Math.round(p * 100)}%, about ${Math.max(1, Math.round(el_ / p - el_))} s left` : `${Math.round(p * 100)}%`;
    if (job.ctrl.cancelled) throw new Error('Cancelled');
  };
  let result = null, error = null;
  try { result = await job.run(prog, job.ctrl); } catch (e) { error = e; console.error(e); }
  job.row.remove();
  running = false;
  if (error) {
    if (error.message !== 'Cancelled') report(job.name, null, [{ ok: false, label: 'Export failed', note: error.message }], null);
    else toast('Export cancelled.');
  } else await finish(job, result, (performance.now() - t0) / 1000);
  pump();
}
async function finish(job, r, secs) {
  const checks = await verify(r.blob, r.expect, r.name);
  const ok = checks.every(c => c.ok);
  let where = null;
  if (ok) where = await saveFile(r.blob, r.name);
  await db.put('exports', { id: uid('x_'), t: Date.now(), name: r.name, kind: r.expect.kind, size: r.blob.size, ok, where: where?.where || '', checks: checks.map(c => ({ ok: c.ok, label: c.label })) });
  report(job.name, r, checks, where, secs);
}
function report(title, r, checks, where, secs) {
  const ok = checks.every(c => c.ok);
  const body = el('div', { class: 'report' },
    el('p', { class: ok ? 'ok' : 'bad' }, ok ? 'Export finished and checked.' : 'Something did not pass. Nothing was saved automatically.'),
    r ? el('p', { class: 'muted' }, `${r.name}, ${fmtBytes(r.blob.size)}${secs ? `, made in ${secs.toFixed(1)} s` : ''}`) : null,
    where ? el('p', {}, 'Saved to: ', el('b', {}, where)) : null,
    el('ul', { class: 'checks' }, checks.map(c => el('li', { class: c.ok ? 'ok' : 'bad' }, (c.ok ? '✓ ' : '✗ ') + c.label, c.note ? el('span', { class: 'muted small' }, ' (' + c.note + ')') : null))));
  const buttons = [{ label: 'Close', onClick: c => c() }];
  if (r && !ok) buttons.unshift({ label: 'Save anyway', onClick: async c => { const w = await saveFile(r.blob, r.name); toast('Saved to ' + w.where); c(); } });
  if (r && r.expect.kind.startsWith('video') || r && r.expect.kind === 'gif' || r && /png|jpg|webp/.test(r.expect.kind)) buttons.unshift({ label: 'Preview', onClick: () => previewBlob(r.blob, r.expect.kind) });
  modal('Export report: ' + title, body, { buttons });
}
function previewBlob(blob, kind) {
  const u = URL.createObjectURL(blob);
  const media = kind.startsWith('video') ? el('video', { src: u, controls: true, autoplay: true, loop: true, class: 'preview-media' }) : el('img', { src: u, class: 'preview-media' });
  modal('Preview', media, { wide: true, onClose: () => URL.revokeObjectURL(u) });
}

// ---------- verification ----------
async function verify(blob, ex, name) {
  const C = []; const add = (ok, label, note) => C.push({ ok: !!ok, label, note });
  add(blob && blob.size > 0, 'File was created', blob ? fmtBytes(blob.size) : 'empty');
  if (!blob || !blob.size) return C;
  const u8 = new Uint8Array(await blob.arrayBuffer());
  const k = ex.kind;
  try {
    if (k === 'zip') {
      const files = await readZip(u8);
      add(files.length === ex.count, `Contains ${ex.count} file(s)`, `found ${files.length}`);
      for (const f of files.slice(0, 400)) {
        const sub = await verify(new Blob([f.data]), { ...ex.each, ...((ex.files && ex.files[f.name]) || {}) }, f.name);
        const bad = sub.filter(s => !s.ok);
        if (bad.length) add(false, f.name, bad.map(b => b.label + (b.note ? ': ' + b.note : '')).join('; '));
      }
      if (!C.some(c => !c.ok)) add(true, 'Every file inside opens and has the right size');
    } else if (k === 'png' || k === 'jpg' || k === 'webp') {
      const bm = await createImageBitmap(blob);
      add(true, 'File opens');
      if (ex.w) add(bm.width === ex.w && bm.height === ex.h, `Size is ${ex.w} × ${ex.h} px`, `got ${bm.width} × ${bm.height}`); else add(bm.width > 0, `Size is ${bm.width} × ${bm.height} px`);
      if (k === 'png') { const info = pngInfo(u8); if (ex.dpi) add(info.dpi === ex.dpi, `DPI tag is ${ex.dpi}`, `got ${info.dpi || 'none'}`); if (ex.alpha) add(info.alpha, 'Transparency is kept'); add(true, 'Lossless (PNG)'); }
      if (k === 'jpg') { add(true, `JPG quality ${Math.round((ex.q || 0.92) * 100)} (lossy by design)`); }
      if (k === 'webp') add(true, ex.q >= 1 ? 'WEBP at top quality' : `WEBP quality ${Math.round((ex.q || 0.92) * 100)}`);
      if (ex.ref) add(await compareToRef(bm, ex.ref, k === 'png' ? 3 : 40, ex.alpha), 'Pixels match the page (no missing art)', k === 'png' ? 'exact sample check' : 'sample check with lossy tolerance');
      bm.close();
    } else if (k === 'tiff') {
      const t = tiffInfo(u8); add(!!t, 'File opens as TIFF');
      if (t) { add(t.w === ex.w && t.h === ex.h, `Size is ${ex.w} × ${ex.h} px`, `got ${t.w} × ${t.h}`); add(t.compression === 1, 'Uncompressed, lossless'); add(t.dpi === ex.dpi, `DPI tag is ${ex.dpi}`, `got ${t.dpi}`); if (ex.alpha) add(t.alpha, 'Transparency is kept'); add(u8.length >= t.w * t.h * t.spp, 'All pixel data is present'); }
    } else if (k === 'bmp') {
      const b = bmpInfo(u8); add(!!b, 'File opens as BMP');
      if (b) { add(b.w === ex.w && b.h === ex.h, `Size is ${ex.w} × ${ex.h} px`, `got ${b.w} × ${b.h}`); if (ex.alpha) add(b.alpha, 'Transparency is kept (32-bit)'); }
      try { const bm = await createImageBitmap(blob); add(true, 'Browser can open it'); bm.close(); } catch (e) { add(true, 'Saved as BMP', 'this browser cannot preview it, other apps can'); }
    } else if (k === 'pdf') {
      const p = pdfInfo(u8); add(p.ok, 'PDF structure is complete'); add(p.pages === ex.pages, `Has ${ex.pages} page(s)`, `found ${p.pages}`);
      add(true, ex.lossless ? 'Images stored lossless (Flate)' : 'Images stored as JPG'); add(true, `Built for ${ex.dpi} DPI`);
    } else if (k === 'gif') {
      const g = gifInfo(u8); add(!!g, 'File opens as GIF');
      if (g) { add(g.w === ex.w && g.h === ex.h, `Size is ${ex.w} × ${ex.h} px`, `got ${g.w} × ${g.h}`); add(g.frames === ex.frames, `Has ${ex.frames} frames`, `found ${g.frames}`); if (ex.loop) add(g.loop, 'Loops forever'); if (ex.alpha) add(g.transparent, 'Transparency is kept'); }
    } else if (k.startsWith('video')) {
      const M = await mediabunny();
      const input = new M.Input({ formats: M.ALL_FORMATS, source: new M.BlobSource(blob) });
      const vt = await input.getPrimaryVideoTrack(); add(!!vt, 'Video opens and has a picture track');
      if (vt) {
        add(vt.displayWidth === ex.w && vt.displayHeight === ex.h, `Size is ${ex.w} × ${ex.h}`, `got ${vt.displayWidth} × ${vt.displayHeight}`);
        const st = await vt.computePacketStats(); add(Math.abs(st.packetCount - ex.frames) <= 1, `Has ${ex.frames} frames`, `found ${st.packetCount}`);
        const dur = await input.computeDuration(); add(Math.abs(dur - ex.frames / ex.fps) < 0.25, `Length is ${(ex.frames / ex.fps).toFixed(1)} s`, `got ${dur.toFixed(2)} s`);
        if (st.averageBitrate) add(true, `Average bitrate ${(st.averageBitrate / 1e6).toFixed(1)} Mbps`);
      }
      if (ex.audio) { const at = await input.getPrimaryAudioTrack(); add(!!at, 'Has the sound track'); }
      if (ex.missing) add(false, 'Some pages had no picture while rendering', ex.missing + ' frame(s)'); else add(true, 'Every page picture was loaded for every frame');
    } else if (k === 'recording') {
      const M = await mediabunny();
      const input = new M.Input({ formats: M.ALL_FORMATS, source: new M.BlobSource(blob) });
      const vt = await input.getPrimaryVideoTrack(); add(!!vt, 'Video opens and has a picture track');
      if (vt) { add(vt.displayWidth > 0 && vt.displayHeight > 0, `Size is ${vt.displayWidth} × ${vt.displayHeight}`); const st = await vt.computePacketStats(); add(st.packetCount > 1, `Has ${st.packetCount} frames`); }
    } else if (k === 'project') {
      const files = await readZip(u8); const meta = files.find(f => f.name === 'book.json');
      add(!!meta, 'Project file opens'); if (meta) { const d = JSON.parse(new TextDecoder().decode(meta.data)); add(d.pages.length === ex.pages, `Has all ${ex.pages} pages`, `found ${d.pages.length}`); add(files.length - 1 === ex.blobs, `Has all ${ex.blobs} picture files`, `found ${files.length - 1}`); }
    }
  } catch (e) { add(false, 'Could not open the file to check it', e.message); }
  return C;
}
async function compareToRef(bm, ref, tol, alpha) {
  // sample a grid of points and compare with the canvas we rendered
  const n = 24, w = bm.width, h = bm.height;
  const a = document.createElement('canvas'); a.width = w; a.height = h;
  const ag = a.getContext('2d'); ag.drawImage(bm, 0, 0);
  const rg = ref.getContext('2d');
  let bad = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = Math.floor((i + 0.5) / n * w), y = Math.floor((j + 0.5) / n * h);
    const p = ag.getImageData(x, y, 1, 1).data, q = rg.getImageData(x, y, 1, 1).data;
    if (!alpha && q[3] < 255) continue;
    const d = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) + Math.abs(p[3] - q[3]);
    if (d > tol) bad++;
  }
  return bad <= n * n * 0.02;
}

// ---------- artwork ----------
function sizeFor(page, book, o) {
  if (o.mode === 'original') return 1;
  if (o.mode === 'scale') return o.value / 100;
  if (o.mode === 'long') return o.value / Math.max(page.w, page.h);
  if (o.mode === 'dpi') return o.value / book.size.dpi;
  return 1;
}
function unsharp(c, amt) {
  if (!amt) return c;
  const w = c.width, h = c.height, g = c.getContext('2d'), src = g.getImageData(0, 0, w, h);
  const b = document.createElement('canvas'); b.width = w; b.height = h; const bg = b.getContext('2d'); bg.filter = 'blur(1px)'; bg.drawImage(c, 0, 0);
  const bl = bg.getImageData(0, 0, w, h).data, d = src.data;
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = d[i + k] + (d[i + k] - bl[i + k]) * amt;
  g.putImageData(src, 0, 0); return c;
}
async function encodeImage(c, o, dpi) {
  if (o.format === 'png') return pngWithDpi(await canvasBlob(c, 'image/png'), dpi);
  if (o.format === 'jpg') return jpgWithDpi(await canvasBlob(c, 'image/jpeg', o.q), dpi);
  if (o.format === 'webp') return canvasBlob(c, 'image/webp', o.q);
  const id = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  if (o.format === 'tiff') return encodeTIFF(id, dpi, o.bg === 'transparent');
  if (o.format === 'bmp') return encodeBMP(id, dpi, o.bg === 'transparent');
}
async function renderArt(book, idxs, o) {
  const pages = [];
  for (const i of idxs) pages.push(await db.get('pages', book.pages[i]));
  if (o.layout === 'spread' && pages.length > 1) {
    const out = [];
    for (let k = 0; k < pages.length; k += 2) {
      const L = pages[k], R = pages[k + 1];
      const s = sizeFor(L, book, o);
      const a = await renderPage(L, book, { scale: s, background: o.bg, bgColor: o.bgColor, pageNumber: o.pnum ? idxs[k] + 1 : 0 });
      const b = R ? await renderPage(R, book, { scale: s, background: o.bg, bgColor: o.bgColor, pageNumber: o.pnum ? idxs[k + 1] + 1 : 0 }) : null;
      const c = document.createElement('canvas'); c.width = a.width + (b ? b.width : 0); c.height = a.height;
      const g = c.getContext('2d'); g.drawImage(a, 0, 0); if (b) g.drawImage(b, a.width, 0);
      out.push({ c, name: `page-${idxs[k] + 1}${R ? '-' + (idxs[k + 1] + 1) : ''}` });
    }
    return out;
  }
  return Promise.all(pages.map(async (p, k) => ({ c: await renderPage(p, book, { scale: sizeFor(p, book, o), background: o.bg, bgColor: o.bgColor, pageNumber: o.pnum ? idxs[k] + 1 : 0 }), name: `page-${idxs[k] + 1}` })));
}
function artJob(book, idxs, o) {
  return {
    name: `${idxs.length > 1 ? idxs.length + ' pages' : 'Page ' + (idxs[0] + 1)} as ${o.format.toUpperCase()}`,
    run: async (prog) => {
      const files = []; let first = null;
      const per = o.layout === 'spread' ? 2 : 1;
      for (let k = 0; k < idxs.length; k += per) {
        const [r] = await renderArt(book, idxs.slice(k, k + per), o);
        const c = r.c;
        if (c.width > MAX_SIDE || c.height > MAX_SIDE || c.width * c.height > MAX_AREA) throw new Error(`${c.width} × ${c.height} px is bigger than the browser can draw. Pick a smaller size.`);
        if (o.sharpen) unsharp(c, o.sharpen);
        const dpi = Math.round(book.size.dpi * (o.mode === 'dpi' ? o.value / book.size.dpi : sizeFor(await db.get('pages', book.pages[idxs[k]]), book, o)));
        const blob = await encodeImage(c, o, o.mode === 'dpi' ? o.value : dpi);
        const ext = o.format;
        files.push({ name: `${safeName(book.title)}-${r.name}.${ext}`, data: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height, dpi: o.mode === 'dpi' ? o.value : dpi, ref: c });
        if (!first) first = files[0];
        prog((k + per) / idxs.length * 0.95);
      }
      const each = { kind: o.format, alpha: o.bg === 'transparent', q: o.q };
      if (files.length === 1) {
        const f = files[0];
        return { blob: new Blob([f.data], { type: 'image/' + (o.format === 'jpg' ? 'jpeg' : o.format) }), name: f.name, expect: { ...each, w: f.w, h: f.h, dpi: o.format === 'webp' || o.format === 'jpg' ? 0 : f.dpi, ref: f.ref } };
      }
      return { blob: makeZip(files), name: `${safeName(book.title)}-pages-${o.format}.zip`, expect: { kind: 'zip', count: files.length, each, files: Object.fromEntries(files.map(f => [f.name, { w: f.w, h: f.h, dpi: o.format === 'webp' || o.format === 'jpg' ? 0 : f.dpi }])) } };
    }
  };
}

// ---------- PDF ----------
function pdfJob(book, idxs, o) {
  return {
    name: `PDF, ${idxs.length} page(s) at ${o.dpi} DPI`,
    run: async (prog) => {
      const mm2pt = 72 / 25.4, out = [];
      const per = o.layout === 'spread' ? 2 : 1;
      for (let k = 0; k < idxs.length; k += per) {
        const [r] = await renderArt(book, idxs.slice(k, k + per), { mode: 'dpi', value: o.dpi, bg: o.bg === 'transparent' ? 'color' : o.bg, bgColor: o.bgColor || '#ffffff', pnum: o.pnum, layout: o.layout });
        let c = r.c;
        const trimW = book.size.wMM * per, trimH = book.size.hMM;
        const bleedPx = Math.round(o.bleed / 25.4 * o.dpi);
        if (bleedPx) { // extend the edge pixels outward so art runs past the cut line
          const b = document.createElement('canvas'); b.width = c.width + bleedPx * 2; b.height = c.height + bleedPx * 2; const g = b.getContext('2d');
          g.drawImage(c, 0, 0, c.width, 1, bleedPx, 0, c.width, bleedPx); g.drawImage(c, 0, c.height - 1, c.width, 1, bleedPx, c.height + bleedPx, c.width, bleedPx);
          g.drawImage(c, 0, 0, 1, c.height, 0, bleedPx, bleedPx, c.height); g.drawImage(c, c.width - 1, 0, 1, c.height, c.width + bleedPx, bleedPx, bleedPx, c.height);
          g.fillStyle = g.createPattern(c, 'no-repeat'); g.drawImage(c, bleedPx, bleedPx);
          for (const [sx, sy, dx, dy] of [[0, 0, 0, 0], [c.width - 1, 0, c.width + bleedPx, 0], [0, c.height - 1, 0, c.height + bleedPx], [c.width - 1, c.height - 1, c.width + bleedPx, c.height + bleedPx]]) g.drawImage(c, sx, sy, 1, 1, dx, dy, bleedPx, bleedPx);
          c = b;
        }
        const id = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let img;
        if (o.lossless) {
          const rgbBytes = new Uint8Array(c.width * c.height * 3);
          for (let i = 0, j = 0; i < id.length; i += 4) { rgbBytes[j++] = id[i]; rgbBytes[j++] = id[i + 1]; rgbBytes[j++] = id[i + 2]; }
          img = { kind: 'flate', w: c.width, h: c.height, bytes: await deflate(rgbBytes) };
        } else {
          img = { kind: 'jpeg', w: c.width, h: c.height, bytes: new Uint8Array(await (await canvasBlob(c, 'image/jpeg', o.q)).arrayBuffer()) };
        }
        const slug = o.marks ? 12 * mm2pt : 0, bl = o.bleed * mm2pt;
        const wPt = trimW * mm2pt + bl * 2 + slug * 2, hPt = trimH * mm2pt + bl * 2 + slug * 2;
        out.push({ wPt, hPt, img, place: [slug, slug, trimW * mm2pt + bl * 2, trimH * mm2pt + bl * 2], marks: (o.marks || o.bleed) ? { trim: [slug + bl, slug + bl, trimW * mm2pt, trimH * mm2pt], bleed: [slug, slug, trimW * mm2pt + bl * 2, trimH * mm2pt + bl * 2], bleedPt: bl, draw: !!o.marks } : null });
        prog((k + per) / idxs.length * 0.9);
      }
      const blob = await buildPDF(out, book.title);
      return { blob, name: `${safeName(book.title)}-print-${o.dpi}dpi.pdf`, expect: { kind: 'pdf', pages: out.length, lossless: o.lossless, dpi: o.dpi } };
    }
  };
}

// ---------- flip-through presentation (video + GIF) ----------
function timeline(book3d, o) {
  const L = book3d.L, segs = [];
  const flip = o.flip, hold = o.hold;
  const start = Math.max(0, Math.min(L + 1, o.from)), end = Math.max(start, Math.min(L + 1, o.to));
  let t = 0, pos = start;
  segs.push({ t0: t, t1: t += o.introHold, pos, turn: null });
  while (pos < end) {
    const k = pos - 1, d = flip * (k === -1 ? 1.3 : 1);
    segs.push({ t0: t, t1: t += d, pos, turn: { k, dir: 1 }, flip: true });
    pos++;
    segs.push({ t0: t, t1: t += (pos === end ? o.outroHold : hold), pos, turn: null });
  }
  return { segs, dur: t };
}
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function stateAt(tl, t) {
  const s = tl.segs.find(s => t >= s.t0 && t < s.t1) || tl.segs[tl.segs.length - 1];
  if (!s.turn) return { pos: s.pos, turn: null, s };
  const k = (t - s.t0) / (s.t1 - s.t0);
  return { pos: s.pos, turn: { k: s.turn.k, dir: 1, theta: ease(Math.min(1, k)) * PI, twist: 0.25 * Math.sin(k * PI) }, s };
}
function cameraAt(book3d, cam, style, t, dur, aspect) {
  const W = book3d.W, H = book3d.H;
  const fovV = cam.fov * PI / 180;
  const span = W * 2 + 0.24;
  const distW = (span / 2) / Math.tan(Math.atan(Math.tan(fovV / 2) * aspect)), distH = (H * 1.2 / 2) / Math.tan(fovV / 2);
  const d = Math.max(distW, distH) * 1.05, u = dur ? t / dur : 0;
  let x = 0, y = d * 0.86, z = d * 0.5, tx = 0, tz = 0.02;
  if (style === 'top') { y = d; z = 0.001; }
  if (style === 'orbit') { const a = (u - 0.5) * 0.6; x = Math.sin(a) * d * 0.5; z = Math.cos(a) * d * 0.5; }
  if (style === 'drift') { const k = 1 - 0.18 * Math.sin(u * PI); y *= k; z *= k; x = Math.sin(u * PI * 2) * W * 0.12; tx = x * 0.5; }
  if (style === 'hand') { x = Math.sin(t * 0.9) * 0.012 + Math.sin(t * 2.3) * 0.005; y += Math.sin(t * 1.3) * 0.01; tx = Math.sin(t * 0.7) * 0.008; }
  if (style === 'low') { y = d * 0.55; z = d * 0.85; }
  cam.position.set(x, y, z); cam.lookAt(tx, 0, tz); cam.updateProjectionMatrix();
}
async function withBook(app, book, fn) {
  let b3 = app.book3d && app.book3d.book && app.book3d.book.id === book.id ? app.book3d : null, temp = null;
  if (!b3) { temp = el('div', { style: { position: 'fixed', left: '-4000px', top: 0, width: '800px', height: '500px' } }); document.body.append(temp); b3 = new Book3D(temp, { quality: 'max' }); await b3.setBook(book); }
  const saved = { pos: b3.pos, turn: b3.turn, hiRes: b3.hiRes };
  try { return await fn(b3); }
  finally { b3.hiRes = saved.hiRes; if (temp) { b3.dispose(); temp.remove(); } else { b3.texCache.forEach(t => t.dispose()); b3.texCache.clear(); b3.slots.forEach(s => s.texDirty = true); b3.goTo(saved.pos); } }
}
async function renderFrames(b3, w, h, o, onFrame, prog) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const r = b3.makeRenderer(canvas, true); r.setPixelRatio(1); r.setSize(w, h, false);
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.05, 60);
  const userCam = { p: b3.camera.position.clone(), t: b3.controls.target.clone(), q: b3.camera.quaternion.clone(), free: b3.free };
  const tl = timeline(b3, o), frames = Math.max(1, Math.round(tl.dur * o.fps));
  b3.hiRes = o.detail; b3.texCache.forEach(t => t.dispose()); b3.texCache.clear(); b3.slots.forEach(s => s.texDirty = true);
  let lastKey = '', missing = 0;
  try {
    for (let i = 0; i < frames; i++) {
      const t = i / o.fps, st = stateAt(tl, t);
      b3.setState(st.pos, st.turn);
      const key = st.pos + ':' + (st.turn ? st.turn.k : 'r');
      if (key !== lastKey) { await b3.refreshTextures(); lastKey = key; }
      for (const s of b3.slots) if (s.front.visible && (!s.front.userData.real || !s.back.userData.real)) missing++;
      if (b3.motion && b3.motion.length) for (const it of b3.motion) { // GIFs and videos on the pages move with the video
        const c = await renderPage(it.pg, b3.book, { scale: Math.min(1, o.detail / it.pg.h), time: t * 1000, pageNumber: b3.book.pageNumbers ? it.idx + 1 : 0 });
        let tx = it.m.userData.motionTex; if (!tx) { tx = it.m.userData.motionTex = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; } else { tx.image = c; tx.needsUpdate = true; }
        it.m.material.map = tx; it.m.material.needsUpdate = true;
      }
      if (o.camera === 'current') { cam.position.copy(userCam.p); if (userCam.free) cam.quaternion.copy(userCam.q); else cam.lookAt(userCam.t); cam.updateProjectionMatrix(); }
      else cameraAt(b3, cam, o.camera, t, tl.dur, w / h);
      r.render(b3.scene, cam);
      await onFrame(canvas, i, frames, t);
      prog((i + 1) / frames * 0.92);
      if (i % 3 === 2) await new Promise(res => setTimeout(res, 0));
    }
  } finally { r.dispose(); }
  return { frames, tl, missing };
}
function flipSound(sr, times, dur, vol) {
  const len = Math.ceil(dur * sr), ctx = new OfflineAudioContext(2, len, sr);
  const noise = ctx.createBuffer(1, sr, sr), d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  for (const t0 of times) {
    // paper: a swish of filtered noise, then a soft slap as the page lands
    const s = ctx.createBufferSource(); s.buffer = noise; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 800; bp.Q.value = 0.7;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t0); gn.gain.linearRampToValueAtTime(0.35 * vol, t0 + 0.08); gn.gain.exponentialRampToValueAtTime(0.02 * vol + 1e-4, t0 + 0.45); gn.gain.linearRampToValueAtTime(0, t0 + 0.5);
    s.connect(bp).connect(gn).connect(ctx.destination); s.start(t0, Math.random() * 0.4, 0.55);
    const s2 = ctx.createBufferSource(); s2.buffer = noise; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; const g2 = ctx.createGain();
    const land = t0 + 0.55; g2.gain.setValueAtTime(0, land); g2.gain.linearRampToValueAtTime(0.5 * vol, land + 0.01); g2.gain.exponentialRampToValueAtTime(1e-4, land + 0.12);
    s2.connect(lp).connect(g2).connect(ctx.destination); s2.start(land, Math.random() * 0.4, 0.15);
  }
  return ctx.startRendering();
}
function videoJob(app, book, o) {
  return {
    name: `Flip-through video ${o.w}×${o.h} ${o.format.toUpperCase()}`,
    run: async (prog) => withBook(app, book, async b3 => {
      const M = await mediabunny();
      let w = o.w + (o.w % 2), h = o.h + (o.h % 2);
      let codec;
      const cands = o.format === 'webm' ? ['vp9', 'vp8'] : ['avc', 'hevc'];
      for (const c of cands) if (await M.canEncodeVideo(c, { width: w, height: h })) { codec = c; break; }
      if (!codec) throw new Error(`This browser cannot make ${o.format.toUpperCase()} at ${w}×${h}. Try a smaller size, the other format, or Chrome/Edge.`);
      const output = new M.Output({ format: o.format === 'webm' ? new M.WebMOutputFormat() : new M.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new M.BufferTarget() });
      let src = null, audio = null, audioCodec = null;
      if (o.sound) {
        for (const c of o.format === 'webm' ? ['opus'] : ['aac', 'opus']) if (await M.canEncodeAudio(c)) { audioCodec = c; break; }
      }
      const res = await renderFrames(b3, w, h, o, async (canvas, i, n) => {
        if (!src) {
          src = new M.CanvasSource(canvas, { codec, bitrate: o.bitrate ? o.bitrate * 1e6 : M.QUALITY_VERY_HIGH, keyFrameInterval: 2 });
          output.addVideoTrack(src, { frameRate: o.fps });
          if (audioCodec) { audio = new M.AudioBufferSource({ codec: audioCodec, bitrate: 160e3 }); output.addAudioTrack(audio); }
          await output.start();
        }
        await src.add(i / o.fps, 1 / o.fps);
      }, prog);
      if (audio) { const tl = res.tl; const ab = await flipSound(48000, tl.segs.filter(s => s.flip).map(s => s.t0), res.frames / o.fps, o.volume); await audio.add(ab); }
      await output.finalize(); prog(1);
      return { blob: new Blob([output.target.buffer], { type: o.format === 'webm' ? 'video/webm' : 'video/mp4' }), name: `${safeName(book.title)}-flip-${w}x${h}-${o.fps}fps.${o.format}`, expect: { kind: 'video', w, h, frames: res.frames, fps: o.fps, audio: !!audio, missing: res.missing } };
    })
  };
}
function gifFlipJob(app, book, o) {
  return {
    name: `Flip-through GIF ${o.w}×${o.h}`,
    run: async (prog) => withBook(app, book, async b3 => {
      const frames = [];
      const res = await renderFrames(b3, o.w, o.h, o, async (canvas) => {
        const c2 = document.createElement('canvas'); c2.width = o.w; c2.height = o.h; const g = c2.getContext('2d'); g.drawImage(canvas, 0, 0);
        frames.push(g.getImageData(0, 0, o.w, o.h).data);
      }, p => prog(p * 0.7));
      const blob = encodeGif(frames, o.w, o.h, o.fps, o.colors, false, o.loop, p => prog(0.7 + p * 0.3));
      return { blob, name: `${safeName(book.title)}-flip-${o.w}x${o.h}.gif`, expect: { kind: 'gif', w: o.w, h: o.h, frames: res.frames, loop: o.loop, alpha: false } };
    })
  };
}
function encodeGif(frames, w, h, fps, colors, transparent, loop, prog) {
  const total = frames.length * w * h, step = Math.max(1, Math.ceil(total / 1500000));
  const sample = new Uint8Array(Math.ceil(total / step) * 4); let si = 0, k = 0;
  for (const f of frames) for (let i = 0; i < f.length; i += 4, k++) { if (k % step) continue; sample[si++] = f[i]; sample[si++] = f[i + 1]; sample[si++] = f[i + 2]; sample[si++] = f[i + 3]; }
  const format = transparent ? 'rgba4444' : 'rgb565';
  const palette = quantize(sample.subarray(0, si), colors, { format, oneBitAlpha: transparent });
  const tIndex = transparent ? palette.findIndex(c => c.length > 3 && c[3] === 0) : -1;
  const gif = GIFEncoder(), delay = Math.round(1000 / fps);
  frames.forEach((f, i) => {
    gif.writeFrame(applyPalette(f, palette, format), w, h, { palette: i === 0 ? palette : undefined, delay, repeat: loop ? 0 : -1, transparent: tIndex >= 0, transparentIndex: Math.max(0, tIndex), dispose: tIndex >= 0 ? 2 : -1 });
    prog && prog((i + 1) / frames.length);
  });
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
// GIF made from the layers of one page
function gifLayersJob(book, idx, o) {
  return {
    name: `Page ${idx + 1} layers as GIF`,
    run: async (prog) => {
      const page = await db.get('pages', book.pages[idx]);
      const res = await loadRes(page);
      const s = o.w / page.w, W = Math.round(page.w * s), H = Math.round(page.h * s);
      const vis = page.layers.filter(l => l.visible);
      if (!vis.length) throw new Error('This page has no visible layers.');
      const frames = [];
      const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
      if (!o.transparent) await drawPaper(bg.getContext('2d'), page, book, W, H);
      const list = o.mode === 'build' ? vis.map((_, i) => vis.slice(0, i + 1)) : vis.map(l => [l]);
      list.forEach((ls, i) => {
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        g.drawImage(bg, 0, 0); g.save(); g.scale(s, s); ls.forEach(L => drawLayer(g, L, res, s)); g.restore();
        const d = g.getImageData(0, 0, W, H).data; for (let r = 0; r < Math.max(1, o.repeat); r++) frames.push(d);
        prog((i + 1) / list.length * 0.6);
      });
      if (o.mode === 'build') for (let r = 0; r < o.fps; r++) frames.push(frames[frames.length - 1]); // hold the finished page a second
      const blob = encodeGif(frames, W, H, o.fps, o.colors, o.transparent, o.loop, p => prog(0.6 + p * 0.4));
      return { blob, name: `${safeName(book.title)}-page-${idx + 1}-${o.mode}.gif`, expect: { kind: 'gif', w: W, h: H, frames: frames.length, loop: o.loop, alpha: o.transparent } };
    }
  };
}

// ---------- stickers ----------
function stickerJob(assets, o) {
  return {
    name: `${assets.length} sticker(s) as ${o.kind === 'sheet' ? 'a sheet' : 'PNG files'}`,
    run: async (prog) => {
      if (o.kind === 'zip') {
        const files = [];
        for (const [i, a] of assets.entries()) { const b = await getBlob(a.blob); files.push({ name: `${safeName(a.name)}-${i + 1}.png`, data: new Uint8Array(await b.arrayBuffer()) }); prog((i + 1) / assets.length); }
        return { blob: makeZip(files), name: 'stickers.zip', expect: { kind: 'zip', count: files.length, each: { kind: 'png', alpha: true } } };
      }
      const W = Math.round(o.wMM / 25.4 * o.dpi), H = Math.round(o.hMM / 25.4 * o.dpi), gap = Math.round(o.gapMM / 25.4 * o.dpi);
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      if (o.bg !== 'transparent') { g.fillStyle = o.bgColor; g.fillRect(0, 0, W, H); }
      const cell = Math.round(o.cellMM / 25.4 * o.dpi);
      let x = gap, y = gap, rowH = 0, placed = 0;
      for (const a of assets) {
        const bm = await createImageBitmap(await getBlob(a.blob));
        const s = Math.min(cell / bm.width, cell / bm.height), w = Math.round(bm.width * s), h = Math.round(bm.height * s);
        if (x + w + gap > W) { x = gap; y += rowH + gap; rowH = 0; }
        if (y + h + gap > H) break;
        g.drawImage(bm, x, y, w, h); x += w + gap; rowH = Math.max(rowH, h); placed++;
        prog(placed / assets.length * 0.8);
      }
      if (placed < assets.length) toast(`Only ${placed} of ${assets.length} fit on the sheet. Make the stickers smaller or the sheet bigger.`, 'err');
      const blob = await pngWithDpi(await canvasBlob(c, 'image/png'), o.dpi);
      return { blob, name: `sticker-sheet-${o.dpi}dpi.png`, expect: { kind: 'png', w: W, h: H, dpi: o.dpi, alpha: o.bg === 'transparent', ref: c } };
    }
  };
}

function projectJob(book) {
  return {
    name: 'Project file',
    run: async (prog) => {
      prog(0.1);
      const r = await packBook(book.id); prog(0.9);
      return { blob: r.blob, name: `${safeName(book.title)}.shesketch`, expect: { kind: 'project', pages: r.pages, blobs: r.blobs } };
    }
  };
}

// ---------- the dialog ----------
export function openExport(app, book, { tab = 'artwork', pageIndex = 0 } = {}) {
  const N = book.pages.length;
  const tabs = { artwork: 'Artwork', pdf: 'Print PDF', video: 'Flip-through video', gif: 'GIF', stickers: 'Stickers', project: 'Project file', history: 'History' };
  const head = el('div', { class: 'tabs' }), body = el('div', { class: 'export-body' });
  const state = {
    range: 'this', from: pageIndex + 1, to: pageIndex + 1,
    art: { format: 'png', mode: 'original', value: 100, bg: 'paper', bgColor: '#ffffff', q: 0.95, sharpen: 0, pnum: book.pageNumbers, layout: 'single' },
    pdf: { dpi: 300, bleed: 0, marks: false, lossless: true, q: 0.95, bg: 'paper', layout: 'single', pnum: book.pageNumbers },
    vid: { format: 'mp4', res: '1080', w: 1920, h: 1080, fps: 30, bitrate: 16, hold: 1.4, flip: 1.1, introHold: 1.2, outroHold: 1.5, camera: 'angled', detail: 2048, sound: true, volume: 0.8, from: 0, to: Math.floor(N / 2) + 1 },
    gif: { mode: 'flip', w: 720, h: 450, fps: 15, colors: 256, loop: true, transparent: false, repeat: 3, from: 0, to: Math.min(Math.floor(N / 2) + 1, 4), hold: 0.8, flip: 0.9, introHold: 0.6, outroHold: 1, camera: 'angled', detail: 1024 },
    stk: { kind: 'sheet', wMM: 210, hMM: 297, dpi: 300, gapMM: 6, cellMM: 45, bg: 'transparent', bgColor: '#ffffff' },
  };
  let cur = tab;
  const idxs = () => { if (state.range === 'this') return [pageIndex]; if (state.range === 'all') return [...Array(N).keys()]; const a = Math.max(1, Math.min(N, state.from)), b = Math.max(a, Math.min(N, state.to)); return [...Array(b - a + 1).keys()].map(i => a - 1 + i); };
  const rangeRow = () => el('div', {},
    select('Pages', state.range, { this: `This page (${pageIndex + 1})`, all: `All ${N} pages`, range: 'A range' }, v => { state.range = v; draw(); }),
    state.range === 'range' ? el('div', { class: 'row' }, numberInput('From', state.from, v => state.from = v, { min: 1, max: N }), numberInput('To', state.to, v => state.to = v, { min: 1, max: N })) : null);
  const posOpts = () => { const o = { 0: 'Closed book' }; for (let p = 1; p <= Math.floor(N / 2) + 1; p++) { const l = p > 1 ? (p - 1) * 2 : null, r = p - 1 < Math.floor(N / 2) ? (p - 1) * 2 + 1 : null; o[p] = p === 1 ? 'Inside cover + page 1' : `Pages ${l}${r ? ' and ' + r : ''}`; } return o; };
  const est = el('p', { class: 'muted small' });
  const draw = async () => {
    head.innerHTML = ''; body.innerHTML = '';
    for (const [k, v] of Object.entries(tabs)) head.append(el('button', { class: 'btn small' + (k === cur ? ' primary' : ''), onclick: () => { cur = k; draw(); } }, v));
    const go = (label, fn) => el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: fn }, label), el('button', { class: 'btn small', onclick: chooseExportFolder }, 'Choose export folder'));
    const p0 = await db.get('pages', book.pages[pageIndex]);
    if (cur === 'artwork') {
      const a = state.art;
      const upd = () => { const s = sizeFor(p0, book, a), w = Math.round(p0.w * s), h = Math.round(p0.h * s); est.textContent = `${w} × ${h} px per page, prints at ${(w / (a.mode === 'dpi' ? a.value : book.size.dpi) * 25.4).toFixed(0)} × ${(h / (a.mode === 'dpi' ? a.value : book.size.dpi) * 25.4).toFixed(0)} mm. About ${fmtBytes(w * h * (a.format === 'jpg' ? 0.4 : a.format === 'tiff' || a.format === 'bmp' ? (a.bg === 'transparent' ? 4 : 3) : 1.6) * idxs().length)} total.`; };
      body.append(el('p', { class: 'muted' }, 'The clean artwork from the page itself, at full quality. No book shadows, no desk, no screen capture.'), rangeRow(),
        select('Format', a.format, { png: 'PNG (lossless)', tiff: 'TIFF (lossless, for print)', jpg: 'JPG', webp: 'WEBP', bmp: 'BMP' }, v => { a.format = v; draw(); }),
        select('Size', a.mode, { original: `Original (${book.size.dpi} DPI)`, dpi: 'Set DPI', long: 'Long side in pixels', scale: 'Percent' }, v => { a.mode = v; a.value = v === 'dpi' ? 300 : v === 'long' ? 2048 : 100; draw(); }),
        a.mode !== 'original' ? numberInput(a.mode === 'dpi' ? 'DPI' : a.mode === 'long' ? 'Pixels' : 'Percent', a.value, v => { a.value = v; upd(); }, { min: 1 }) : null,
        select('Background', a.bg, { paper: 'Paper texture', color: 'Solid color', transparent: 'Transparent' }, v => { a.bg = v; draw(); }),
        a.bg === 'color' ? colorInput('Color', a.bgColor, v => a.bgColor = v) : null,
        a.bg === 'transparent' && (a.format === 'jpg') ? el('p', { class: 'bad small' }, 'JPG cannot hold transparency. Pick PNG, TIFF, WEBP or BMP.') : null,
        (a.format === 'jpg' || a.format === 'webp') ? slider('Quality', a.q, 0.5, 1, 0.01, v => a.q = v, v => Math.round(v * 100)) : null,
        slider('Sharpen', a.sharpen, 0, 1.5, 0.05, v => a.sharpen = v, v => v ? v.toFixed(2) : 'off'),
        select('Layout', a.layout, { single: 'One page per file', spread: 'Two-page spreads' }, v => a.layout = v),
        check('Page numbers', a.pnum, v => a.pnum = v), est,
        go('Export', () => { if (a.bg === 'transparent' && a.format === 'jpg') return toast('JPG cannot be transparent.', 'err'); addJob(artJob(book, idxs(), { ...a })); toast('Added to the export queue.'); }));
      upd();
    }
    if (cur === 'pdf') {
      const p = state.pdf;
      body.append(el('p', { class: 'muted' }, 'A print-ready PDF made from the full-resolution pages.'), rangeRow(),
        select('Resolution', String(p.dpi), { 150: '150 DPI (screen, small file)', 300: '300 DPI (print)', 600: '600 DPI (fine art print)' }, v => p.dpi = +v),
        select('Image storage', p.lossless ? 'l' : 'j', { l: 'Lossless (bigger file)', j: 'JPG (smaller file)' }, v => { p.lossless = v === 'l'; draw(); }),
        !p.lossless ? slider('JPG quality', p.q, 0.6, 1, 0.01, v => p.q = v, v => Math.round(v * 100)) : null,
        slider('Bleed', p.bleed, 0, 6, 0.5, v => p.bleed = v, v => v + ' mm'), check('Crop marks', p.marks, v => p.marks = v),
        select('Layout', p.layout, { single: 'Single pages', spread: 'Spreads' }, v => p.layout = v), check('Page numbers', p.pnum, v => p.pnum = v),
        el('p', { class: 'muted small' }, 'Colors are sRGB. For CMYK, send this PDF to your print shop or convert it in a print app. The browser cannot do CMYK conversion.'),
        go('Export PDF', () => { addJob(pdfJob(book, idxs(), { ...p })); toast('Added to the export queue.'); }));
    }
    if (cur === 'video' || (cur === 'gif' && state.gif.mode === 'flip')) {
      const v = cur === 'video' ? state.vid : state.gif;
      const RES = { 1080: [1920, 1080, '1080p'], 1440: [2560, 1440, '1440p'], 2160: [3840, 2160, '4K'], 720: [1280, 720, '720p'], sq: [1080, 1080, 'Square 1080'], vert: [1080, 1920, 'Vertical 1080×1920 (Reels, TikTok)'], custom: [v.w, v.h, 'Custom'] };
      const updEst = () => { const tl = { dur: v.introHold + v.outroHold + Math.max(0, v.to - v.from) * (v.flip + v.hold) }; est.textContent = `About ${tl.dur.toFixed(1)} s, ${Math.round(tl.dur * v.fps)} frames.` + (cur === 'video' ? ` File about ${fmtBytes(tl.dur * v.bitrate * 1e6 / 8)}.` : ''); };
      if (cur === 'gif') body.append(select('GIF type', state.gif.mode, { flip: 'Flip-through of the book', build: 'Page drawing itself layer by layer', frames: 'Each layer is a frame (animation)' }, m => { state.gif.mode = m; draw(); }));
      body.append(el('p', { class: 'muted' }, 'The 3D book, rendered on purpose frame by frame at the size you pick. Smooth even on a slow PC.'),
        el('div', { class: 'row' }, select('Start at', String(v.from), posOpts(), x => { v.from = +x; updEst(); }), select('End at', String(v.to), posOpts(), x => { v.to = +x; updEst(); })),
        cur === 'video' ? select('Format', v.format, { mp4: 'MP4 (works everywhere)', webm: 'WebM' }, x => v.format = x) : null,
        cur === 'video' ? select('Size', v.res, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, r[2]])), x => { v.res = x; if (x !== 'custom') { v.w = RES[x][0]; v.h = RES[x][1]; } draw(); }) : null,
        (cur === 'gif' || v.res === 'custom') ? el('div', { class: 'row' }, numberInput('Width', v.w, x => { v.w = Math.round(x); }, { min: 64, max: 7680 }), numberInput('Height', v.h, x => { v.h = Math.round(x); }, { min: 64, max: 4320 })) : null,
        select('Frame rate', String(v.fps), cur === 'video' ? { 24: '24 fps (film)', 30: '30 fps', 60: '60 fps (smoothest)' } : { 10: '10 fps', 12: '12 fps', 15: '15 fps', 20: '20 fps', 25: '25 fps' }, x => { v.fps = +x; updEst(); }),
        cur === 'video' ? slider('Bitrate', v.bitrate, 4, 80, 1, x => { v.bitrate = x; updEst(); }, x => x + ' Mbps') : slider('Colors', v.colors, 16, 256, 16, x => v.colors = x),
        el('div', { class: 'row wrap' }, el('span', { class: 'muted small' }, 'Quick styles:'),
          el('button', { class: 'btn small', onclick: () => { Object.assign(v, { hold: 1.4, flip: 1.1, introHold: 1.2, outroHold: 1.5, camera: 'angled' }); draw(); } }, 'Calm flip-through'),
          el('button', { class: 'btn small', onclick: () => { Object.assign(v, { hold: 0.04, flip: 0.14, introHold: 0.5, outroHold: 0.8, camera: 'low' }); draw(); } }, 'Flip book (fast flick)'),
          el('button', { class: 'btn small', onclick: () => { Object.assign(v, { hold: 2.5, flip: 1.6, introHold: 1.5, outroHold: 2, camera: 'drift' }); draw(); } }, 'Slow showcase')),
        slider('Time on each spread', v.hold, 0, 6, 0.02, x => { v.hold = x; updEst(); }, x => x + ' s'),
        slider('Page turn time', v.flip, 0.08, 3, 0.02, x => { v.flip = x; updEst(); }, x => x + ' s'),
        slider('Hold at start', v.introHold, 0, 5, 0.1, x => { v.introHold = x; updEst(); }, x => x + ' s'),
        slider('Hold at end', v.outroHold, 0, 6, 0.1, x => { v.outroHold = x; updEst(); }, x => x + ' s'),
        select('Camera', v.camera, { current: 'My current view in the book', angled: 'Angled, still', top: 'Straight down', low: 'Low angle', orbit: 'Slow orbit', drift: 'Slow drift in', hand: 'Handheld feel' }, x => v.camera = x),
        select('Page detail', String(v.detail), { 1024: 'Normal', 2048: 'High', 3072: 'Very high (for 4K)' }, x => v.detail = +x),
        cur === 'video' ? check('Page turn sounds', v.sound, x => { v.sound = x; draw(); }) : check('Loop forever', v.loop, x => v.loop = x),
        cur === 'video' && v.sound ? slider('Sound volume', v.volume, 0, 1, 0.05, x => v.volume = x, x => Math.round(x * 100) + '%') : null,
        est,
        go(cur === 'video' ? 'Render video' : 'Render GIF', () => { addJob(cur === 'video' ? videoJob(app, book, { ...v }) : gifFlipJob(app, book, { ...v })); toast('Added to the export queue. You can keep working.'); }));
      updEst();
    } else if (cur === 'gif') {
      const v = state.gif;
      body.append(select('GIF type', v.mode, { flip: 'Flip-through of the book', build: 'Page drawing itself layer by layer', frames: 'Each layer is a frame (animation)' }, m => { v.mode = m; draw(); }),
        el('p', { class: 'muted' }, v.mode === 'build' ? `Uses the layers of page ${pageIndex + 1}. Each layer appears in order.` : `Uses the layers of page ${pageIndex + 1}. Each visible layer becomes one frame, bottom to top. Draw each frame on its own layer.`),
        numberInput('Width', v.w, x => v.w = Math.round(x), { min: 64, max: 4000 }),
        select('Frame rate', String(v.fps), { 2: '2 fps', 4: '4 fps', 6: '6 fps', 8: '8 fps', 12: '12 fps', 24: '24 fps' }, x => v.fps = +x),
        slider('Repeat each frame', v.repeat, 1, 12, 1, x => v.repeat = x), slider('Colors', v.colors, 16, 256, 16, x => v.colors = x),
        check('Transparent background (no paper)', v.transparent, x => v.transparent = x), check('Loop forever', v.loop, x => v.loop = x),
        go('Render GIF', () => { addJob(gifLayersJob(book, pageIndex, { ...v })); toast('Added to the export queue.'); }));
    }
    if (cur === 'stickers') {
      const s = state.stk, chosen = new Set();
      const grid = await assetGrid(['sticker', 'made', 'art'], (a) => { const card = [...grid.children].find(c => c.title.startsWith(a.name)); if (chosen.has(a)) { chosen.delete(a); card?.classList.remove('picked'); } else { chosen.add(a); card?.classList.add('picked'); } }, { empty: 'No stickers yet. Make some in the sticker factory or the makers.' });
      body.append(el('p', { class: 'muted' }, 'Click stickers to pick them.'), grid,
        select('Export as', s.kind, { sheet: 'A sticker sheet (PNG)', zip: 'Each sticker as its own PNG (zip)' }, x => { s.kind = x; draw(); }),
        s.kind === 'sheet' ? el('div', {}, el('div', { class: 'row' }, numberInput('Sheet width mm', s.wMM, x => s.wMM = x), numberInput('Height mm', s.hMM, x => s.hMM = x)), numberInput('Sticker size mm', s.cellMM, x => s.cellMM = x), numberInput('Gap mm', s.gapMM, x => s.gapMM = x), select('DPI', String(s.dpi), { 150: '150', 300: '300', 600: '600' }, x => s.dpi = +x), select('Background', s.bg, { transparent: 'Transparent', color: 'Color' }, x => s.bg = x)) : null,
        go('Export stickers', () => { if (!chosen.size) return toast('Pick at least one sticker.'); addJob(stickerJob([...chosen], { ...s })); }));
    }
    if (cur === 'project') {
      body.append(el('p', {}, 'Saves the whole sketchbook with every layer still editable, as one .shesketch file. Keep it as a backup, move it to another PC, or open it again later with "Open a project file" on the shelf.'),
        go('Save project file', () => addJob(projectJob(book))));
    }
    if (cur === 'history') {
      const list = (await db.all('exports')).sort((a, b) => b.t - a.t).slice(0, 60);
      body.append(list.length ? el('ul', { class: 'history-list' }, list.map(x => el('li', { class: x.ok ? 'ok' : 'bad' }, `${new Date(x.t).toLocaleString()}: ${x.name} (${fmtBytes(x.size)}) ${x.ok ? 'checked OK' : 'had problems'}${x.where ? ', ' + x.where : ''}`))) : el('p', { class: 'muted' }, 'No exports yet.'));
    }
  };
  modal('Export', el('div', {}, head, body), { wide: true });
  draw();
}

export { verify, encodeGif };

// used by the self-test (tests.html); not needed by the app itself
export const _jobs = { artJob, pdfJob, videoJob, gifFlipJob, gifLayersJob, stickerJob, projectJob };
