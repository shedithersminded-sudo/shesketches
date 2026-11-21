import { Stroke, PRESETS } from './brushes.js';
// Make your own paper: color, tooth, fibers, speckles, creases, aging and printed lines.
// Saved as a few numbers in this browser, then it shows up in every paper list.
import { getSetting, setSetting, uid } from './db.js';
import { PAPERS, PAPER_PARAMS, PAPER_DEFAULT, registerPapers, paintPaper, paperTile, dropPaperCache } from './paper.js';
import { el, modal, slider, select, colorInput, check, toast, confirmBox } from './ui.js';

export async function loadCustomPapers() { registerPapers(await getSetting('customPapers', [])); }

export async function openPaperMaker(onSaved, startFrom) {
  const list = await getSetting('customPapers', []);
  const editing = startFrom && startFrom.startsWith?.('u_') ? list.find(p => p.id === startFrom) : null;
  const base = editing || (startFrom && PAPERS[startFrom] ? { ...PAPER_DEFAULT, ...PAPERS[startFrom], name: PAPERS[startFrom].name + ' (mine)' } : { ...PAPER_DEFAULT });
  const P = { ...PAPER_DEFAULT, ...base, id: editing ? editing.id : uid('u_') };
  delete P.custom;
  const view = el('canvas', { class: 'pm-view', width: 600, height: 800 });
  const close = el('canvas', { class: 'pm-close', width: 300, height: 300 });
  let t = 0;
  const draw = () => {
    clearTimeout(t); t = setTimeout(() => {
      PAPERS.__preview = { ...P, custom: true, seed: 991 };
      paintPaper(view.getContext('2d'), 600, 800, '__preview', null, null, 2);
      // a close-up with a pencil and pastel test so you can see the tooth
      const g = close.getContext('2d'); paintPaper(g, 300, 300, '__preview', null, null, 2);
      const tile = paperTile('__preview');
      // light the bumps from the side: turn the bump map (stored as colors) into light and shadow
      const nc = tile.normal, nw = nc.width, nh = nc.height, nd = nc.getContext('2d').getImageData(0, 0, nw, nh).data;
      const lit = document.createElement('canvas'); lit.width = nw; lit.height = nh; const lg = lit.getContext('2d'), li = lg.createImageData(nw, nh), ld = li.data;
      const L = [-0.75, -0.45, 0.5], ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
      for (let i = 0; i < nw * nh; i++) {
        const x = nd[i * 4] / 127.5 - 1, y = nd[i * 4 + 1] / 127.5 - 1, z = nd[i * 4 + 2] / 127.5 - 1;
        const v = Math.max(0, Math.min(255, 128 + ((x * L[0] + y * L[1] + z * L[2]) - L[2]) * 420));
        ld[i * 4] = ld[i * 4 + 1] = ld[i * 4 + 2] = v; ld[i * 4 + 3] = 255;
      }
      lg.putImageData(li, 0, 0);
      g.save(); g.globalAlpha = 0.8; g.fillStyle = g.createPattern(lit, 'repeat'); g.globalCompositeOperation = 'soft-light'; g.fillRect(0, 0, 300, 300); g.restore();
      // a soft pencil scribble and a pastel stroke, so you can see how the tooth catches them
      const mark = (id, color, pts) => { const pr = PRESETS.find(q => q.id === id); if (!pr) return; const st = new Stroke({ ...pr, size: pr.size * 0.9 }, g, { color, paper: '__preview', layerCtx: g }); for (const q of pts) st.add(q); st.finish(g); };
      mark('pencil-6b', '#2a2a2c', Array.from({ length: 40 }, (_, i) => ({ x: 40 + i * 5.5, y: 95 + Math.sin(i / 3) * 18, p: 0.55 })));
      mark('soft-pastel', '#c86aa0', Array.from({ length: 30 }, (_, i) => ({ x: 50 + i * 7, y: 205 + Math.cos(i / 4) * 12, p: 0.5 })));
      delete PAPERS.__preview; dropPaperCache('__preview');
    }, 80);
  };
  const side = el('div', { class: 'pm-side' });
  const nameI = el('input', { type: 'text', value: P.name, class: 'full' }); nameI.addEventListener('input', () => P.name = nameI.value);
  side.append(el('label', { class: 'row' }, el('span', { class: 'lbl' }, 'Name'), nameI),
    select('Start from', '', { '': 'Pick a paper to copy…', ...Object.fromEntries(Object.entries(PAPERS).filter(([k]) => !k.startsWith('__')).map(([k, v]) => [k, v.name])) }, v => { if (!v) return; Object.assign(P, { ...PAPER_DEFAULT, ...PAPERS[v], id: P.id, name: P.name }); delete P.custom; build(); draw(); }));
  const ctrls = el('div', {});
  const build = () => {
    ctrls.innerHTML = '';
    for (const d of PAPER_PARAMS) {
      let row;
      if (d.type === 'color') row = colorInput(d.label, P[d.k] || '#ffffff', v => { P[d.k] = v; draw(); });
      else if (d.type === 'select') row = select(d.label, P[d.k] || 'none', d.options, v => { P[d.k] = v; draw(); });
      else if (d.type === 'check') row = check(d.label, !!P[d.k], v => { P[d.k] = v; draw(); });
      else row = slider(d.label, P[d.k] ?? 0, d.min, d.max, d.step, v => { P[d.k] = v; draw(); });
      ctrls.append(el('div', { class: 'param' }, row, el('div', { class: 'help' }, d.help)));
    }
  };
  build(); side.append(ctrls);
  const body = el('div', { class: 'pmaker' }, el('div', { class: 'pm-stage' }, view, el('div', { class: 'pm-closebox' }, el('div', { class: 'muted small' }, 'Close up, lit from the side'), close)), side);
  draw();
  modal(editing ? 'Edit my paper' : 'Make my own paper', body, {
    wide: true, buttons: [
      editing ? { label: 'Delete paper', onClick: async c => { if (await confirmBox('Delete this paper?', 'Books using it go back to heavy sketch paper.', 'Delete')) { const l = list.filter(p => p.id !== P.id); await setSetting('customPapers', l); registerPapers(l); c(); onSaved && onSaved(null); } } } : null,
      { label: 'Cancel', onClick: c => c() },
      { label: 'Save paper', primary: true, onClick: async c => { const l = list.filter(p => p.id !== P.id); l.push({ ...P }); await setSetting('customPapers', l); registerPapers(l); c(); toast(`Saved "${P.name}". It is now in every paper list.`); onSaved && onSaved(P.id); } },
    ].filter(Boolean)
  });
}
