// Self-test: makes a temporary book, draws on it, runs every export, checks every file, then deletes the book.
// Open tests.html to run it. Nothing is downloaded.
import { db, collectGarbage } from './db.js';
import { createBook, deleteBook } from './model.js';
import { Stroke, PRESETS, mixPaint } from './brushes.js';
import { renderPage as rp, drawLayers } from './render.js';
import { registerPapers, paintPaper, PAPERS } from './paper.js';
import { MAKERS, defaultsOf, runMaker } from './makers.js';
import { makeThumb, canvasBlob } from './render.js';
import { putBlob } from './db.js';
import { verify, _jobs as J } from './exporter.js';

const out = document.getElementById('out');
const log = (ok, label, note = '') => { const li = document.createElement('li'); li.className = ok ? 'ok' : 'bad'; li.textContent = (ok ? 'PASS ' : 'FAIL ') + label + (note ? ' (' + note + ')' : ''); out.append(li); return ok; };
let pass = 0, fail = 0;
const t = (ok, label, note) => (log(ok, label, note) ? pass++ : fail++);

async function run() {
  const book = await createBook({ title: 'Self test', pages: 8, dpi: 150 });
  const app = { book3d: null };
  try {
    // draw with every brush on page 3
    const page = await db.get('pages', book.pages[2]);
    const c = document.createElement('canvas'); c.width = page.w; c.height = page.h; const g = c.getContext('2d');
    // every brush, one at a time, on its own canvas: drawing brushes must add paint, blenders and erasers must change paint
    const sum = cx => { const d = cx.getImageData(0, 0, 400, 120).data; let v = 0; for (let i = 0; i < d.length; i += 4) v += d[i] + d[i + 1] * 2 + d[i + 2] + d[i + 3] * 5; return v; };
    let bad = [];
    for (const p of PRESETS) {
      const cv = document.createElement('canvas'); cv.width = 400; cv.height = 120; const cx = cv.getContext('2d');
      if (p.kind !== 'draw') { cx.fillStyle = '#1f4fa8'; cx.fillRect(0, 20, 200, 80); cx.fillStyle = '#f2d21a'; cx.fillRect(200, 20, 200, 80); }
      const before = sum(cx), pre = document.createElement('canvas'); pre.width = 400; pre.height = 120; pre.getContext('2d').drawImage(cv, 0, 0);
      const s = new Stroke({ ...p, size: Math.min(p.size, 40) }, cx, { color: p.kind === 'blend' ? '#808080' : '#a02040', paper: 'sketch', layerCtx: cx, sampleSrc: pre });
      for (let k = 0; k <= 40; k++) s.add({ x: 30 + k * 8.5, y: 60 + Math.sin(k / 4) * 10, p: 0.6 });
      s.finish(cx);
      if (sum(cx) === before) bad.push(p.name);
    }
    t(!bad.length, `All ${PRESETS.length} brushes work (draw, blend, erase)`, bad.length ? 'no change: ' + bad.join(', ') : 'each one changed the page');
    // paint mixes like paint: yellow dragged through blue turns green
    {
      const cv = document.createElement('canvas'); cv.width = 600; cv.height = 100; const cx = cv.getContext('2d'); cx.fillStyle = '#1f4fa8'; cx.fillRect(0, 0, 600, 100);
      const pre = document.createElement('canvas'); pre.width = 600; pre.height = 100; pre.getContext('2d').drawImage(cv, 0, 0);
      const s = new Stroke(PRESETS.find(x => x.id === 'oil'), cx, { color: '#f2d21a', layerCtx: cx, sampleSrc: pre });
      for (let i = 0; i <= 50; i++) s.add({ x: 20 + i * 10, y: 50, p: 0.5 });
      const [r, gg, b] = cx.getImageData(400, 50, 1, 1).data;
      t(gg > r && gg > b, 'Oil paint mixes like real paint (yellow over blue makes green)', `rgb(${r}, ${gg}, ${b})`);
      const m = mixPaint('#1f4fa8', '#f2d21a', 0.5), n = parseInt(m.slice(1), 16);
      t(((n >> 8) & 255) > (n >> 16) && ((n >> 8) & 255) > (n & 255), 'Palette mixer: blue + yellow = green', m);
    }
    // the page drawing for the export tests
    PRESETS.filter(p => p.kind === 'draw' && p.engine !== 'paint').forEach((p, i) => {
      const s = new Stroke(p, g, { color: p.color || '#7a0f12', paper: 'sketch', layerCtx: g });
      const y = 40 + i * (page.h - 80) / PRESETS.length;
      for (let k = 0; k <= 40; k++) s.add({ x: 40 + k * (page.w - 80) / 40, y: y + Math.sin(k / 4) * 8, p: 0.3 + 0.6 * Math.sin(k / 40 * Math.PI) });
    });
    // clipping: a clipped layer only shows inside the layer under it
    {
      const base = document.createElement('canvas'); base.width = base.height = 100; const bg2 = base.getContext('2d'); bg2.fillStyle = '#000'; bg2.fillRect(0, 0, 50, 100);
      const top = document.createElement('canvas'); top.width = top.height = 100; const tg = top.getContext('2d'); tg.fillStyle = '#f00'; tg.fillRect(0, 0, 100, 100);
      const out = document.createElement('canvas'); out.width = out.height = 100; const og = out.getContext('2d');
      drawLayers(og, [{ id: 'a', kind: 'paint', visible: true }, { id: 'b', kind: 'paint', visible: true, clip: true }], { a: base, b: top }, 1, 100, 100);
      const L = og.getImageData(25, 50, 1, 1).data, Rr = og.getImageData(75, 50, 1, 1).data;
      t(L[0] > 200 && L[3] > 200 && Rr[3] === 0, 'Clipping masks work', `inside ${L[0]},${L[3]} outside alpha ${Rr[3]}`);
    }
    // custom paper with printed lines
    registerPapers([{ id: 'u_test', name: 'Test', color: '#f0e8d8', lines: 'grid', lineColor: '#ff0000', lineGap: 0.05, crumple: 0.5 }]);
    { const cv = document.createElement('canvas'); cv.width = 300; cv.height = 400; paintPaper(cv.getContext('2d'), 300, 400, 'u_test', null, null, 1); const d2 = cv.getContext('2d').getImageData(0, 0, 300, 400).data; let red = 0; for (let i = 0; i < d2.length; i += 4) if (d2[i] > d2[i + 1] + 30) red++; t(red > 500, 'Paper maker papers draw with printed lines', red + ' line pixels'); }
    registerPapers([]);
    page.layers[0].blob = await putBlob(await canvasBlob(c));
    page.thumb = await putBlob(await makeThumb(page, book, 800));
    page.ver++; await db.put('pages', page);
    const back = await db.get('pages', page.id);
    t(!!back.layers[0].blob && !!back.thumb, 'Page saves and reloads with its layer');
    // makers make cut-outs with transparent corners
    for (const m of MAKERS) {
      const cv = runMaker(m, defaultsOf(m)), cg = cv.getContext('2d');
      const corner = cg.getImageData(0, 0, 1, 1).data[3];
      const mid = cg.getImageData(cv.width >> 1, cv.height >> 1, 1, 1).data[3];
      t(cv.width > 10 && corner < 30, `Maker "${m.name}" has no background`, `${cv.width}×${cv.height}, corner alpha ${corner}, middle alpha ${mid}`);
    }
    // a moving GIF on page 4, so the video export has to animate it
    {
      const { GIFEncoder, quantize, applyPalette } = await import('../vendor/gifenc.js');
      const enc = GIFEncoder(), c2 = document.createElement('canvas'); c2.width = c2.height = 64; const g2 = c2.getContext('2d');
      for (const col of ['#e0533d', '#3b6ea8', '#f2c94c']) { g2.fillStyle = col; g2.fillRect(0, 0, 64, 64); const d2 = g2.getImageData(0, 0, 64, 64).data, pal = quantize(d2, 16); enc.writeFrame(applyPalette(d2, pal), 64, 64, { palette: pal, delay: 120 }); }
      enc.finish();
      const gid = await putBlob(new Blob([enc.bytes()], { type: 'image/gif' }));
      const p4 = await db.get('pages', book.pages[3]);
      p4.layers.push({ id: 'l_gif', name: 'GIF', kind: 'image', media: 'gif', src: gid, iw: 64, ih: 64, x: p4.w / 2, y: p4.h / 2, scale: 6, rot: 0, visible: true, opacity: 1, blend: 'source-over', filter: {}, shadow: { on: false } });
      p4.ver++; await db.put('pages', p4);
      const { mediaRes } = await import('./render.js');
      const r = await mediaRes(p4.layers[1]);
      t(r && r.frames && r.frames.length === 3, 'GIFs decode into frames', (r?.frames?.length || 0) + ' frames');
      const a1 = await rp(p4, book, { scale: 0.2, time: 0 }), a2 = await rp(p4, book, { scale: 0.2, time: 130 });
      const px = (c, ) => c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data.join(',');
      t(px(a1) !== px(a2), 'Moving media changes over time in renders', px(a1) + ' then ' + px(a2));
    }
    const jobs = [
      ['PNG full size', J.artJob(book, [2], { format: 'png', mode: 'original', bg: 'paper', layout: 'single' })],
      ['PNG transparent', J.artJob(book, [2], { format: 'png', mode: 'scale', value: 50, bg: 'transparent', layout: 'single' })],
      ['TIFF', J.artJob(book, [2], { format: 'tiff', mode: 'dpi', value: 300, bg: 'paper', layout: 'single' })],
      ['JPG', J.artJob(book, [2], { format: 'jpg', mode: 'original', bg: 'paper', q: 0.9, layout: 'single' })],
      ['WEBP', J.artJob(book, [2], { format: 'webp', mode: 'original', bg: 'paper', q: 0.95, layout: 'single' })],
      ['BMP', J.artJob(book, [2], { format: 'bmp', mode: 'scale', value: 40, bg: 'transparent', layout: 'single' })],
      ['All pages zip', J.artJob(book, [...Array(8).keys()], { format: 'png', mode: 'scale', value: 25, bg: 'paper', layout: 'single' })],
      ['Print PDF', J.pdfJob(book, [...Array(8).keys()], { dpi: 150, bleed: 3, marks: true, lossless: true, bg: 'paper', layout: 'single' })],
      ['GIF from layers', J.gifLayersJob(book, 2, { mode: 'build', w: 300, fps: 6, colors: 64, loop: true, repeat: 1 })],
      ['Flip GIF', J.gifFlipJob(app, book, { w: 320, h: 200, fps: 8, colors: 64, loop: true, hold: 0.3, flip: 0.5, introHold: 0.2, outroHold: 0.2, camera: 'angled', detail: 512, from: 0, to: 3 })],
      ['Flip video MP4', J.videoJob(app, book, { format: 'mp4', w: 640, h: 360, fps: 24, bitrate: 4, hold: 0.3, flip: 0.5, introHold: 0.2, outroHold: 0.2, camera: 'drift', detail: 512, sound: true, volume: 0.5, from: 0, to: 3 })],
      ['Flip video WebM', J.videoJob(app, book, { format: 'webm', w: 640, h: 360, fps: 24, bitrate: 4, hold: 0.3, flip: 0.5, introHold: 0.2, outroHold: 0.2, camera: 'orbit', detail: 512, sound: false, from: 1, to: 3 })],
      ['Project file', J.projectJob(book)],
    ];
    for (const [label, job] of jobs) {
      try {
        const r = await job.run(() => { }, {});
        const checks = await verify(r.blob, r.expect, r.name);
        const bad = checks.filter(c => !c.ok);
        t(!bad.length, `Export: ${label}`, bad.length ? bad.map(b => b.label + (b.note ? ': ' + b.note : '')).join('; ') : `${(r.blob.size / 1024).toFixed(0)} KB, ${checks.length} checks`);
      } catch (e) { t(false, `Export: ${label}`, e.message); }
    }
  } finally {
    await deleteBook(book); await collectGarbage();
    const sum = document.createElement('h2'); sum.textContent = `${pass} passed, ${fail} failed`; sum.className = fail ? 'bad' : 'ok'; out.before(sum);
  }
}
run();
