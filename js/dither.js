// SHEDITHERS link: the dither/glitch engine runs here on any picture, sticker or cut-out.
// vendor/shd-engine.js is a copy of shedithers/js/engine.js. Copy it again to get new effects.
import { getBlob } from './db.js';
import { addAsset } from './library.js';
import { canvasBlob } from './render.js';
import { el, modal, slider, select, colorInput, check, toast } from './ui.js';

let E = null, src = null;
async function engine() {
  if (E) return E;
  src = await (await fetch('vendor/shd-engine.js')).text();
  E = new Function(src + '\nreturn SHD_ENGINE();')();
  return E;
}
let worker = null;
async function runInWorker(img, w, h, stack, S) {
  await engine();
  if (!worker) {
    const code = src + `\nconst E = SHD_ENGINE();\nonmessage = e => { const { img, w, h, stack, S } = e.data; try { const out = E.run(img, w, h, stack, { S }); postMessage({ out }, [out.buffer]); } catch (err) { postMessage({ err: String(err && err.message || err) }); } };`;
    worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  }
  return new Promise((res, rej) => {
    worker.onmessage = e => e.data.err ? rej(new Error(e.data.err)) : res(e.data.out);
    worker.postMessage({ img, w, h, stack, S }, [img.buffer]);
  });
}

export async function openDither(source, onSaved) {
  const Eng = await engine();
  const blob = await getBlob(source.blob);
  const bm = await createImageBitmap(blob);
  const W = bm.width, H = bm.height;
  const ps = Math.min(1, 900 / Math.max(W, H)), pw = Math.round(W * ps), ph = Math.round(H * ps);
  const pc = document.createElement('canvas'); pc.width = pw; pc.height = ph; pc.getContext('2d').drawImage(bm, 0, 0, pw, ph);
  const pData = pc.getContext('2d').getImageData(0, 0, pw, ph);
  const view = el('canvas', { class: 'fac-view checker', width: pw, height: ph });
  const side = el('div', { class: 'fac-side' });
  const m = modal('Dither (SHEDITHERS)', el('div', { class: 'factory' }, el('div', { class: 'fac-stage' }, view, el('div', { class: 'muted small' }, `Preview. The final is made at full size: ${W} × ${H} px.`)), side), { wide: true, cls: 'xl' });
  const byCat = {}; Eng.EFFECTS.forEach(e => (byCat[e.cat] ||= []).push(e));
  const firstDither = (byCat.dither || Eng.EFFECTS)[0];
  const stack = [{ id: firstDither.id, mix: 100, p: Eng.defaults(firstDither) }];
  let busy = false, again = false;
  const keepAlpha = (out, orig) => { for (let i = 3; i < out.length; i += 4) out[i] = orig[i]; return out; };
  const preview = async () => {
    if (busy) { again = true; return; } busy = true;
    try {
      const img = new Uint8ClampedArray(pData.data);
      const out = await runInWorker(img, pw, ph, stack, Math.max(0.25, pw / 1200));
      view.getContext('2d').putImageData(new ImageData(keepAlpha(out, pData.data), pw, ph), 0, 0);
    } catch (e) { toast('Dither error: ' + e.message, 'err'); }
    busy = false; if (again) { again = false; preview(); }
  };
  const cats = Object.fromEntries(Eng.CATS.filter(([k]) => byCat[k]).map(([k, n]) => [k, n]));
  const render = () => {
    side.innerHTML = '';
    stack.forEach((s, si) => {
      const def = Eng.MAP[s.id];
      const box = el('div', { class: 'fx' });
      box.append(select('Type', def.cat, cats, v => { const e = byCat[v][0]; stack[si] = { id: e.id, mix: 100, p: Eng.defaults(e) }; render(); preview(); }),
        select('Effect', s.id, Object.fromEntries(byCat[def.cat].map(e => [e.id, e.name])), v => { stack[si] = { id: v, mix: 100, p: Eng.defaults(Eng.MAP[v]) }; render(); preview(); }));
      for (const q of def.params) {
        const set = v => { s.p[q.k] = v; preview(); };
        if (q.t === 'r') box.append(slider(q.l, s.p[q.k], q.min, q.max, q.step, set));
        else if (q.t === 's') box.append(select(q.l, String(s.p[q.k]), Object.fromEntries(q.o.map(([k, v]) => [String(k), v])), v => set(isNaN(+v) ? v : +v)));
        else if (q.t === 'b') box.append(check(q.l, !!s.p[q.k], set));
        else if (q.t === 'c') box.append(colorInput(q.l, s.p[q.k], set));
        else if (q.t === 'p') box.append(select(q.l, s.p[q.k], Object.fromEntries([['gray', 'GRAY'], ['rgb', 'RGB'], ...Object.entries(Eng.PALETTES).map(([k, v]) => [k, v.n])]), set));
      }
      box.append(slider('Mix', s.mix, 0, 100, 1, v => { s.mix = v; preview(); }, v => v + '%'));
      if (stack.length > 1) box.append(el('button', { class: 'btn small danger', onclick: () => { stack.splice(si, 1); render(); preview(); } }, 'Remove effect'));
      side.append(box);
    });
    side.append(el('button', { class: 'btn small', onclick: () => { stack.push({ id: firstDither.id, mix: 100, p: Eng.defaults(firstDither) }); render(); preview(); } }, '+ Add another effect'),
      el('div', { class: 'row wrap' }, el('button', { class: 'btn primary', onclick: apply }, 'Make it full size and save')));
  };
  const apply = async () => {
    toast('Making the full size version…');
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(bm, 0, 0);
    const id = g.getImageData(0, 0, W, H), orig = new Uint8ClampedArray(id.data);
    try {
      const out = await runInWorker(id.data, W, H, stack, Math.max(0.25, W / 1200));
      g.putImageData(new ImageData(keepAlpha(out, orig), W, H), 0, 0);
      const a = await addAsset(await canvasBlob(c, 'image/png'), 'art', (source.name || 'Art') + ' dithered', W, H);
      toast('Saved. The original is kept too.');
      m.close(); onSaved && onSaved(a);
    } catch (e) { toast('Dither failed: ' + e.message, 'err'); }
  };
  render(); preview();
}
