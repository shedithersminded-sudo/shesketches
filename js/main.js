// SHESKETCHES app shell: shelf, book view, customizing, settings and the welcome guide.
import { db, uid, getSetting, setSetting, persist, usage, collectGarbage, unpackBook, getBlob, putBlob } from './db.js';
import { createBook, addPages, removePages, deleteBook, newPageData, SIZES, BINDINGS, BOOK_TYPES, pagePx, SURFACES, surfaceSize } from './model.js';
import { PAPERS, COVERS, DESKS } from './paper.js';
import { Book3D } from './book3d.js';
import { Editor } from './editor.js';
import { openExport, verify } from './exporter.js';
import { openFactory, openMakers, seedStarters } from './stickers.js';
import { STARTERS, STARTERS_2 } from './makers.js';
import { openDither } from './dither.js';
import { openPaperMaker, loadCustomPapers } from './papermaker.js';
import { importFiles, assetGrid, assetURL, SYSTEM_FONTS, loadAllFonts, MEDIA_ACCEPT } from './library.js';
import { makeThumb, canvasBlob, itemSize, loadRes } from './render.js';
import { el, $, toast, modal, confirmBox, promptBox, slider, select, colorInput, check, numberInput, pickFiles, saveFile, chooseExportFolder, fmtBytes, safeName } from './ui.js';

const THEMES = { desk: "Artist's desk", studio: 'Digital studio', minimal: 'Minimal', scrap: 'Scrapbook', pro: 'Illustration studio' };
const VIEW_KEYS = ['angled', 'top', 'low', 'front', 'left', 'right', 'pageL', 'pageR', 'spine', 'edge'];
const BOOK_KEYS = [
  ['O', 'Turn the closed book over to see the back'], ['← / →', 'Turn the page back / forward'], ['Page Up / Page Down', 'Same as the arrows'], ['Home / End', 'Jump to the cover / the back'],
  ['Click a page edge', 'Turn that page'], ['Drag a page corner', 'Turn it by hand (grab a top or bottom corner to curl it)'], ['Double-click a page', 'Draw on it'],
  ['Right-drag', 'Look around the book'], ['Middle-drag', 'Slide the view'], ['Scroll', 'Zoom in and out'],
  ['1 to 9, 0', 'Camera angles: angled, top, low, front, left, right, left page, right page, spine, page edges'],
  ['F', 'Flick through the pages like a flip book (F again stops)'], ['Shift + F', 'Flick backwards'],
  ['C', 'Free camera on or off'], ['W A S D', 'Free camera: move'], ['Q / E', 'Free camera: down / up'], ['Shift', 'Free camera: move faster'], ['Drag', 'Free camera: look around'], ['Esc', 'Leave free camera'],
  ['R', 'Start or stop recording the view'], ['T', 'Open the sticker tray (drag stickers onto the book)'], ['K or ?', 'This list'],
];

const app = {
  book: null, book3d: null, editor: null,
  settings: {},
  async init() {
    this.settings = {
      theme: await getSetting('theme', 'desk'), quality: await getSetting('quality', 'balanced'),
      reducedMotion: await getSetting('reducedMotion', matchMedia('(prefers-reduced-motion: reduce)').matches),
    };
    document.documentElement.dataset.theme = this.settings.theme;
    persist();
    loadAllFonts();
    await loadCustomPapers();
    // starter stickers and pieces: the first set for new people, and newer sets for everyone once
    const sets = [];
    if (!(await getSetting('seeded', false))) { await setSetting('seeded', true); sets.push(STARTERS); }
    if (!(await getSetting('seeded2', false))) { await setSetting('seeded2', true); sets.push(STARTERS_2); }
    if (sets.length) {
      const t = el('div', { class: 'toast in' }, 'Adding starter stickers…'); document.body.append(t);
      (async () => { for (const set of sets) await seedStarters(set, (n, N) => t.textContent = `Adding starter stickers… ${n} of ${N}`); })().then(() => { t.remove(); if (!this.book && !this.editor) this.home(); });
    }
    window.addEventListener('beforeunload', e => { if (this.editor && this.editor.isChanged) { this.editor.save(); e.preventDefault(); e.returnValue = ''; } });
    await this.home();
    if (!(await getSetting('seenGuide', false))) this.guide(true);
  },

  // ---------- shelf ----------
  async home() {
    this.disposeBook();
    const root = $('#app'); root.innerHTML = '';
    const books = (await db.all('books')).sort((a, b) => (b.fav - a.fav) || (b.opened || b.updated) - (a.opened || a.updated));
    const head = el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'logo' }, 'SHESKETCHES'), el('span', { class: 'muted small' }, 'your sketchbooks live on this PC')),
      el('span', { class: 'grow' }),
      el('button', { class: 'btn primary', onclick: () => this.newBookDialog() }, '+ New sketchbook'),
      el('button', { class: 'btn', onclick: () => this.openProjectFile() }, 'Open a project file'),
      el('button', { class: 'btn', onclick: () => this.libraryDialog() }, 'Library'),
      el('button', { class: 'btn', onclick: () => openMakers(null) }, 'Makers'),
      el('button', { class: 'btn', onclick: () => openFactory(null, () => {}) }, 'Sticker factory'),
      el('button', { class: 'btn', onclick: () => openPaperMaker(null) }, 'Paper maker'),
      el('button', { class: 'btn', onclick: () => this.settingsDialog() }, 'Settings'),
      el('button', { class: 'icon-btn help', title: 'How it works', 'aria-label': 'How it works', onclick: () => this.guide() }, '?'));
    const shelf = el('section', { class: 'shelf' });
    if (!books.length) shelf.append(el('div', { class: 'empty' }, el('h2', {}, 'No sketchbooks yet.'), el('p', {}, 'Make your first one. Pick a kind of book, then change anything you like.'), el('button', { class: 'btn primary big', onclick: () => this.newBookDialog() }, '+ New sketchbook')));
    for (const b of books) shelf.append(await this.bookCard(b));
    const side = el('aside', { class: 'home-side' });
    const pages = (await db.all('pages')).filter(p => p.thumb && books.some(b => b.pages.includes(p.id))).sort((a, b) => b.updated - a.updated).slice(0, 8);
    if (pages.length) {
      const g = el('div', { class: 'recent' });
      for (const p of pages) { const b = books.find(x => x.id === p.bookId); if (!b) continue; const img = el('img', { alt: '' }); getBlob(p.thumb).then(bl => bl && (img.src = URL.createObjectURL(bl))); g.append(el('button', { class: 'recent-page', title: b.title, onclick: async () => { await this.openBook(b); this.openEditor(b.pages.indexOf(p.id)); } }, img)); }
      side.append(el('h3', {}, 'Recent pages'), g);
    }
    const assets = await db.all('assets');
    const count = k => assets.filter(a => a.kind === k).length;
    side.append(el('h3', {}, 'Library'), el('p', { class: 'muted' }, `${count('art')} art, ${count('media')} GIFs and videos, ${count('sticker')} stickers, ${count('made')} made pieces, ${count('font')} fonts`),
      el('button', { class: 'btn small', onclick: async () => { const fs = await pickFiles(MEDIA_ACCEPT, true); if (fs.length) { const a = await importFiles(fs, 'art'); toast(`Imported ${a.length} file(s).`); this.home(); } } }, 'Import art, GIFs or videos'));
    const ex = (await db.all('exports')).sort((a, b) => b.t - a.t).slice(0, 5);
    if (ex.length) side.append(el('h3', {}, 'Recent exports'), el('ul', { class: 'history-list small' }, ex.map(x => el('li', { class: x.ok ? 'ok' : 'bad' }, `${x.name} (${fmtBytes(x.size)})`))));
    const u = await usage();
    if (u) side.append(el('p', { class: 'muted small' }, `Using ${fmtBytes(u.usage || 0)} of storage on this PC.`));
    root.append(head, el('main', { class: 'home' }, shelf, side));
  },
  async bookCard(b) {
    const cv = await Book3D.prototype.coverCanvas.call(null, b, (b.size.wMM + 3) / (b.size.hMM + 6));
    cv.className = 'cover-img';
    const thick = Math.min(26, 4 + b.pages.length * (b.paperWeight || 150) / 4000);
    const card = el('div', { class: 'book-card' },
      el('button', { class: 'cover-btn', title: 'Open ' + b.title, onclick: () => this.openBook(b), style: { aspectRatio: `${b.size.wMM} / ${b.size.hMM}`, '--thick': thick + 'px' } }, cv, el('span', { class: 'spine-shade' })),
      el('div', { class: 'book-meta' },
        el('b', {}, b.title), el('span', { class: 'muted small' }, `${b.pages.length} pages, ${SIZES[b.size.preset]?.name || b.size.wMM + '×' + b.size.hMM + ' mm'}, ${BINDINGS[b.binding]}`),
        el('div', { class: 'row' },
          el('button', { class: 'icon-btn tiny', title: b.fav ? 'Unfavorite' : 'Favorite', onclick: async () => { b.fav = !b.fav; await db.put('books', b); this.home(); } }, b.fav ? '★' : '☆'),
          el('button', { class: 'icon-btn tiny', title: 'Rename', onclick: async () => { const n = await promptBox('Rename sketchbook', b.title); if (n) { b.title = n; await db.put('books', b); this.home(); } } }, '✎'),
          el('button', { class: 'icon-btn tiny', title: 'Delete', onclick: async () => { if (await confirmBox('Delete this sketchbook?', `"${b.title}" and all its pages will be deleted from this PC. Save a project file first if you want a backup.`, 'Delete')) { if (b.coverPage) await db.del('pages', b.coverPage); await deleteBook(b); await collectGarbage(); this.home(); } } }, '🗑'))));
    return card;
  },

  newBookDialog() {
    const o = { title: 'New sketchbook', type: 'classic', dpi: 300, ...BOOK_TYPES.classic };
    const est = el('p', { class: 'muted small' });
    const fields = el('div', { class: 'form' });
    const upd = () => { const s = o.size === 'custom' ? { w: o.wMM, h: o.hMM } : SIZES[o.size]; const w = Math.round(s.w / 25.4 * o.dpi), h = Math.round(s.h / 25.4 * o.dpi); const mm = (o.pages / 2) * (o.paperWeight || 150) * 0.00125; est.textContent = `Each page is ${w} × ${h} px. The page block is about ${mm.toFixed(1)} mm thick. Bigger pages and higher DPI look sharper in print but use more memory.`; };
    const types = el('div', { class: 'type-grid' });
    const drawFields = () => {
      fields.innerHTML = '';
      const custom = el('div', { class: 'row', style: { display: o.size === 'custom' ? '' : 'none' } }, numberInput('Width mm', o.wMM || 148, v => { o.wMM = v; upd(); }, { min: 40, max: 600 }), numberInput('Height mm', o.hMM || 210, v => { o.hMM = v; upd(); }, { min: 40, max: 600 }));
      fields.append(
        el('label', { class: 'row' }, el('span', { class: 'lbl' }, 'Title'), (() => { const i = el('input', { type: 'text', value: o.title }); i.addEventListener('input', () => o.title = i.value); return i; })()),
        select('Size', o.size, { ...Object.fromEntries(Object.entries(SIZES).map(([k, v]) => [k, `${v.name} (${v.w}×${v.h} mm)`])), custom: 'Custom size' }, v => { o.size = v; if (v === 'custom') { o.wMM ||= 148; o.hMM ||= 210; } custom.style.display = v === 'custom' ? '' : 'none'; upd(); }), custom,
        numberInput('Pages', o.pages, v => { o.pages = Math.max(2, Math.min(800, Math.round(v))); upd(); }, { min: 2, max: 800, step: 2 }),
        slider('Paper thickness', o.paperWeight, 60, 400, 10, v => { o.paperWeight = v; upd(); }, v => v + ' gsm'),
        el('p', { class: 'muted small' }, 'Thin paper (60 to 100 gsm) is for journals. Thick paper (200 to 400 gsm) is for paint.'),
        select('Resolution', String(o.dpi), { 150: '150 DPI (light, fast)', 200: '200 DPI', 300: '300 DPI (print quality)', 400: '400 DPI (big prints)' }, v => { o.dpi = +v; upd(); }),
        select('Binding', o.binding, BINDINGS, v => o.binding = v),
        select('Paper', o.paper, Object.fromEntries(Object.entries(PAPERS).map(([k, v]) => [k, v.name])), v => o.paper = v),
        select('Cover', o.material, Object.fromEntries(Object.entries(COVERS).map(([k, v]) => [k, v.name])), v => o.material = v),
        colorInput('Cover color', o.coverColor, v => o.coverColor = v), est,
        el('p', { class: 'muted small' }, 'You can change everything later in Customize, except page size and resolution.'));
      upd();
    };
    for (const [k, t] of Object.entries(BOOK_TYPES)) {
      const b = el('button', { class: 'type-card' + (k === o.type ? ' on' : ''), title: t.desc, onclick: () => { Object.assign(o, { size: 'a5', wMM: null, hMM: null, corners: 'none', wear: 0.25, edges: 'natural', flip: false }, t, { type: k, title: o.title === BOOK_TYPES[o.type]?.name || o.title === 'New sketchbook' ? t.name : o.title }); types.querySelectorAll('.type-card').forEach(x => x.classList.toggle('on', x === b)); drawFields(); } },
        el('span', { class: 'type-swatch', style: { background: t.coverColor, aspectRatio: t.size === 'custom' ? `${t.wMM}/${t.hMM}` : `${SIZES[t.size].w}/${SIZES[t.size].h}`, borderRightWidth: Math.min(14, 2 + t.pages * t.paperWeight / 9000) + 'px' } }),
        el('b', {}, t.name), el('span', { class: 'muted small' }, t.desc));
      types.append(b);
    }
    drawFields();
    modal('New sketchbook', el('div', { class: 'newbook' }, el('div', {}, el('h3', {}, '1. Pick a kind of book'), types), el('div', {}, el('h3', {}, '2. Adjust it'), fields)), {
      wide: true, buttons: [{ label: 'Cancel', onClick: c => c() }, { label: 'Make it', primary: true, onClick: async c => { c(); const b = await createBook(o); this.openBook(b); } }]
    });
  },

  async openProjectFile() {
    const fs = await pickFiles('.shesketch,.zip', false); if (!fs[0]) return;
    try { const b = await unpackBook(fs[0]); toast('Opened ' + b.title); this.openBook(b); } catch (e) { toast(e.message, 'err'); }
  },

  // ---------- book view ----------
  disposeBook() { if (this.book3d) { this.book3d.dispose(); this.book3d = null; } this.book = null; document.removeEventListener('keydown', this.bookKeys); document.removeEventListener('keyup', this.bookKeysUp); },
  async openBook(b) {
    this.disposeBook();
    this.book = b; b.opened = Date.now(); await db.put('books', b);
    const root = $('#app'); root.innerHTML = '';
    const stage = el('div', { class: 'book-stage' });
    const posLbl = el('span', { class: 'pos-lbl' });
    this.editBtns = el('span', { class: 'row' });
    this.flickBtn = el('button', { class: 'btn', title: 'Flick through the pages like a flip book (F)', onclick: () => this.flick(1) }, '⏩ Flick');
    const bar = el('header', { class: 'top book-top' },
      el('button', { class: 'btn', onclick: () => this.home() }, '← Shelf'),
      el('b', { class: 'book-title', title: 'Click to rename', onclick: async () => { const n = await promptBox('Rename sketchbook', b.title); if (n) { b.title = n; await db.put('books', b); bar.querySelector('.book-title').textContent = n; } } }, b.title),
      el('button', { class: 'icon-btn', title: 'Previous (←)', onclick: () => this.book3d.prev() }, '‹'), posLbl,
      el('button', { class: 'icon-btn', title: 'Next (→)', onclick: () => this.book3d.next() }, '›'),
      this.editBtns,
      el('span', { class: 'grow' }),
      el('button', { class: 'btn', onclick: () => this.pagesDialog() }, 'Pages'),
      el('button', { class: 'btn', onclick: () => this.customize() }, 'Customize'),
      el('button', { class: 'btn', title: 'Drag your stickers, made pieces, art and GIFs onto the cover or any page (T)', onclick: () => this.stickerTray() }, '★ Stickers'),
      el('button', { class: 'btn', title: 'Draw on any part: covers, insides, spine, page edges or the desk', onclick: e => this.surfaceMenu(e.currentTarget) }, '✎ Draw on…'),
      this.turnBtn = el('button', { class: 'btn', title: 'Turn the closed book over to see the back cover (O)', onclick: () => this.toggleFlip() }, '⟲ Turn over'),
      this.flickBtn,
      el('button', { class: 'btn', onclick: () => openExport(this, b, { tab: 'video', pageIndex: this.currentPage() }) }, 'Export'),
      this.recBtn = el('button', { class: 'btn', title: 'Record the view while you flip (R)', onclick: () => this.toggleRecord() }, '● Record'),
      el('button', { class: 'btn', title: 'Keys and controls (K)', onclick: () => this.bookKeysPanel() }, '⌨ Keys'),
      el('button', { class: 'icon-btn help', title: 'How it works', onclick: () => this.guide() }, '?'));
    this.viewPad = this.makeViewPad();
    this.freeHint = el('div', { class: 'free-hint' }, 'Free camera: drag to look, W A S D to move, Q and E for down and up, Shift for faster. Esc to leave.');
    stage.append(this.viewPad, this.freeHint);
    root.append(bar, stage, el('div', { class: 'book-hint muted small' }, 'Click a page edge to turn. Double-click a page to draw. Scroll to zoom. K for all keys.'));
    this.book3d = new Book3D(stage, { quality: this.settings.quality, reducedMotion: this.settings.reducedMotion });
    this.stage = stage; this.trayOpen = false;
    // drop a sticker straight onto the book
    stage.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-shesketches-asset')) { e.preventDefault(); stage.classList.add('drop-on'); } });
    stage.addEventListener('dragleave', () => stage.classList.remove('drop-on'));
    stage.addEventListener('drop', async e => {
      stage.classList.remove('drop-on');
      const id = e.dataTransfer.getData('application/x-shesketches-asset'); if (!id) return;
      e.preventDefault();
      const a = await db.get('assets', id); if (!a) return;
      const hit = this.book3d.hitAt(e.clientX, e.clientY);
      if (!hit) return toast('Drop it on the cover or on a page.');
      this.placeAsset(a, hit, e.clientX, e.clientY);
    });
    this.book3d.on('pos', () => this.updatePos(posLbl));
    this.book3d.on('openPage', i => this.openEditor(i));
    this.bindStickerDrag();
    this.book3d.on('camera', () => this.updPad());
    this.book3d.on('free', on => { stage.classList.toggle('free', on); this.viewPad.querySelector('.free-btn').classList.toggle('lit', on); });
    this.book3d.on('flickEnd', () => this.flickBtn.textContent = '⏩ Flick');
    await this.book3d.setBook(b);
    this.updatePos(posLbl); this.updPad();
    this.bookKeys = e => {
      if (this.editor || e.target.closest?.('input, textarea, select') || document.querySelector('.modal-back:not(:has(.side))')) return;
      const B = this.book3d, k = e.key.toLowerCase();
      if (B.free) {
        if (['w', 'a', 's', 'd', 'q', 'e', 'shift'].includes(k)) { B.keysDown.add(k); e.preventDefault(); return; }
        if (k === 'escape') { B.setFree(false); return; }
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (B.flipped && ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp'].includes(e.key)) { this.toggleFlip(false); return; }
      if (k === 'o') return this.toggleFlip();
      if (e.key === 'ArrowRight' || e.key === 'PageDown') B.next();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') B.prev();
      else if (e.key === 'Home') B.goTo(0);
      else if (e.key === 'End') B.goTo(B.maxPos);
      else if (k === 'f') this.flick(e.shiftKey ? -1 : 1);
      else if (k === 'c') B.setFree(!B.free);
      else if (k === 'r') this.toggleRecord();
      else if (k === 't') this.stickerTray();
      else if (k === 'k' || e.key === '?') this.bookKeysPanel();
      else if (/^[0-9]$/.test(k)) B.viewTo(VIEW_KEYS[(+k + 9) % 10]);
    };
    this.bookKeysUp = e => { const B = this.book3d; if (B && B.keysDown) B.keysDown.delete(e.key.toLowerCase()); };
    document.addEventListener('keydown', this.bookKeys); document.addEventListener('keyup', this.bookKeysUp);
  },
  flick(dir) {
    const B = this.book3d; if (!B) return;
    B.flick(dir, this.book.flip?.flick ?? 0.16);
    this.flickBtn.textContent = B.flicking ? '■ Stop' : '⏩ Flick';
  },
  // the camera pad: a dial you click or drag to aim the camera, plus quick angle buttons
  makeViewPad() {
    const dial = el('div', { class: 'vp-dial', title: 'Click or drag to aim the camera. Center is straight down, the edge is level with the desk. Up is the front.' }, el('span', { class: 'vp-dot' }), el('span', { class: 'vp-n' }, 'front'), el('span', { class: 'vp-s' }, 'back'), el('span', { class: 'vp-w' }, 'L'), el('span', { class: 'vp-e' }, 'R'));
    const aim = (e, animate) => {
      const r = dial.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
      const rad = Math.min(1, Math.hypot(x, y)), az = Math.atan2(x, -y) * 180 / Math.PI;
      const cur = this.book3d.getAngles();
      this.book3d.orbitTo(az, 90 - rad * 85, cur.d, 0, animate);
    };
    let dragging = false;
    dial.addEventListener('pointerdown', e => { dragging = true; try { dial.setPointerCapture(e.pointerId); } catch (_) { } aim(e, true); });
    dial.addEventListener('pointermove', e => { if (dragging) aim(e, false); });
    dial.addEventListener('pointerup', () => dragging = false);
    const zoom = el('input', { type: 'range', min: 0.25, max: 2.5, step: 0.01, value: 1, 'aria-label': 'Zoom', title: 'Zoom' });
    zoom.addEventListener('input', () => { const a = this.book3d.getAngles(); this.book3d.orbitTo(a.az, a.el, +zoom.value, 0, false); });
    this.padZoom = zoom;
    const vb = (k, label) => el('button', { title: Book3D.VIEWS[k].name + ' (' + ((VIEW_KEYS.indexOf(k) + 1) % 10) + ')', onclick: () => this.book3d.viewTo(k) }, label);
    const pad = el('div', { class: 'view-pad' },
      el('div', { class: 'vp-head' }, el('b', {}, 'Camera'), el('button', { class: 'icon-btn tiny', title: 'Hide', onclick: () => pad.classList.toggle('min') }, '–')),
      el('div', { class: 'vp-body' }, dial,
        el('div', { class: 'vp-grid' }, vb('angled', 'Angled'), vb('top', 'Top'), vb('low', 'Low'), vb('front', 'Front'), vb('left', 'Left'), vb('right', 'Right'), vb('pageL', 'L page'), vb('pageR', 'R page'), vb('spine', 'Spine'), vb('edge', 'Edges'), vb('cover', 'Cover'), vb('back', 'Under')),
        el('label', { class: 'vp-zoom' }, 'Zoom', zoom),
        el('div', { class: 'row' }, el('button', { class: 'btn small free-btn', title: 'Fly around freely (C)', onclick: () => this.book3d.setFree(!this.book3d.free) }, '✈ Free camera'), el('button', { class: 'btn small', title: 'Back to the normal view', onclick: () => this.book3d.viewTo('angled') }, 'Reset'))));
    if (innerWidth < 700) pad.classList.add('min'); // small screens start with the camera pad folded away
    return pad;
  },
  updPad() {
    if (!this.book3d || !this.viewPad) return;
    const a = this.book3d.getAngles(), rad = (90 - a.el) / 85, r = a.az * Math.PI / 180;
    const dot = this.viewPad.querySelector('.vp-dot'); dot.style.left = (50 + Math.sin(r) * rad * 46) + '%'; dot.style.top = (50 - Math.cos(r) * rad * 46) + '%';
    if (this.padZoom && document.activeElement !== this.padZoom) this.padZoom.value = a.d;
  },
  // ---------- sticker tray ----------
  async stickerTray(kinds) {
    const was = this.stage.querySelector('.sticker-tray');
    if (was) { was.remove(); this.trayOpen = false; if (!kinds) return; }
    kinds ||= ['sticker', 'made'];
    this.trayOpen = true;
    const grid = el('div', { class: 'st-grid' });
    const fill = async ks => {
      grid.innerHTML = '';
      const list = (await db.all('assets')).filter(a => ks.includes(a.kind)).sort((a, b) => b.created - a.created);
      if (!list.length) grid.append(el('p', { class: 'muted small', style: { gridColumn: '1 / -1' } }, 'Nothing here yet. Make stickers in the Sticker factory or Makers, or import art.'));
      for (const a of list) {
        const img = el('img', { alt: a.name }); assetURL(a).then(u => img.src = u);
        const it = el('div', { class: 'st-item', draggable: 'true', title: a.name + '. Drag onto the book, or click to put it on the page you see.' }, img);
        it.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-shesketches-asset', a.id); e.dataTransfer.effectAllowed = 'copy'; if (img.complete) e.dataTransfer.setDragImage(img, 40, 40); });
        it.addEventListener('click', () => {
          const B = this.book3d, [l, r] = B.spread();
          const hit = B.pos === 0 ? { kind: 'cover', x: 0.5, y: 0.5 } : r != null ? { kind: 'page', idx: r, x: 0.5, y: 0.5 } : l != null ? { kind: 'page', idx: l, x: 0.5, y: 0.5 } : null;
          if (!hit) return toast('Open the book to a page, or close it to the cover.');
          const rc = this.stage.getBoundingClientRect(); this.placeAsset(a, hit, rc.left + rc.width / 2, rc.top + rc.height / 2);
        });
        grid.append(it);
      }
    };
    const tab = (label, ks) => el('button', { class: 'btn small', onclick: e => { tray.querySelectorAll('.st-tabs .btn').forEach(b => b.classList.remove('lit')); e.target.classList.add('lit'); fill(ks); } }, label);
    const tray = el('div', { class: 'sticker-tray' },
      el('div', { class: 'st-head' }, el('b', {}, 'Stickers and pieces'), el('button', { class: 'icon-btn tiny', title: 'Close (T)', onclick: () => { tray.remove(); this.trayOpen = false; } }, '✕')),
      el('p', { class: 'muted small', style: { margin: '6px 10px 0' } }, 'Drag one onto the cover or a page. Press "Edit it" to move, resize or style it.'),
      el('div', { class: 'st-tabs' }, tab('Stickers', ['sticker', 'made']), tab('My art', ['art']), tab('GIFs', ['media']), tab('All', ['sticker', 'made', 'art', 'media']),
        el('button', { class: 'btn small', onclick: () => openFactory(null, () => fill(['sticker', 'made'])) }, '+ New')),
      grid);
    tray.querySelector('.st-tabs .btn').classList.add('lit');
    this.stage.append(tray);
    fill(kinds);
  },
  async ensureCoverPage() {
    const b = this.book;
    if (!b.coverPage) { const p = newPageData(b, 0); p.layers[0].name = 'Cover art'; p.paper = { type: 'smooth', color: b.cover.color }; await db.put('pages', p); b.coverPage = p.id; await db.put('books', b); }
    return db.get('pages', b.coverPage);
  },
  // ---------- move stickers right on the book ----------
  // press on a sticker (or text) on a page, the covers or the desk and drag it; double-click it to open it in the editor
  bindStickerDrag() {
    const c = this.book3d.canvas, B = this.book3d;
    // the pages you can see, kept ready so a press can be checked instantly (before the page starts turning)
    const cache = this.stickerPages = new Map();
    const idOf = hit => hit.kind === 'page' ? this.book.pages[hit.idx] : hit.kind === 'cover' ? this.book.coverPage : this.book.surf?.[hit.kind];
    let lastFill = 0;
    this.fillStickerCache = async () => {
      lastFill = performance.now(); if (!this.book || !this.book3d) return;
      const [l, r] = this.book3d.spread(), ids = [l, r].filter(i => i != null).map(i => this.book.pages[i]);
      ids.push(this.book.coverPage, this.book.surf?.back, this.book.surf?.desk);
      cache.clear();
      for (const id of ids) if (id) { const p = await db.get('pages', id); if (p) cache.set(id, p); }
    };
    this.fillStickerCache();
    const pageFor = hit => cache.get(idOf(hit));
    const itemAt = (page, x, y) => {
      for (let i = page.layers.length - 1; i >= 0; i--) {
        const L = page.layers[i]; if (!L.visible || L.locked || (L.kind !== 'image' && L.kind !== 'text')) continue;
        const sz = itemSize(L), sc = L.scale || 1, dx = x - L.x, dy = y - L.y, cs = Math.cos(-(L.rot || 0)), sn = Math.sin(-(L.rot || 0));
        if (Math.abs(dx * cs - dy * sn) <= sz.w * sc / 2 && Math.abs(dx * sn + dy * cs) <= sz.h * sc / 2) return L;
      }
      return null;
    };
    let drag = null, busy = false, pending = false, last = null;
    c.addEventListener('pointerdown', async e => {
      if (e.button !== 0 || B.free || B.anim || this.editor) return;
      const hit = B.hitAt(e.clientX, e.clientY); if (!hit) return;
      const page = pageFor(hit); if (!page) return;
      const L = itemAt(page, hit.x * page.w, hit.y * page.h); if (!L) return;
      e.stopImmediatePropagation(); e.preventDefault();
      // double-click: open it in the editor, picked up
      const now = performance.now();
      if (last && last.id === L.id && now - last.t < 450) {
        last = null; const label = hit.kind === 'page' ? null : SURFACES[hit.kind].name;
        if (hit.kind === 'page') await this.openEditor(hit.idx); else { this.lastSurface = hit.kind; await this.openEditor(-1, page.id, label); }
        const ed = this.editor; if (ed) { ed.setTool('move'); ed.selectOnly(L.id); }
        return;
      }
      last = { id: L.id, t: now };
      try { c.setPointerCapture(e.pointerId); } catch (_) { }
      drag = { hit, page, L, ox: hit.x * page.w - L.x, oy: hit.y * page.h - L.y, moved: false, res: await loadRes(page) };
      c.style.cursor = 'grabbing';
    }, true);
    const preview = async () => {
      if (busy) { pending = true; return; } busy = true;
      try { await B.previewPart(drag.hit.kind, drag.page, drag.res, drag.hit.idx); } catch (err) { console.warn(err); }
      busy = false; if (pending && drag) { pending = false; preview(); }
    };
    c.addEventListener('pointermove', e => {
      if (!drag) { if (!e.buttons && performance.now() - lastFill > 900) this.fillStickerCache(); return; }
      e.stopImmediatePropagation();
      const h = B.hitAt(e.clientX, e.clientY);
      if (!h || h.kind !== drag.hit.kind || (h.kind === 'page' && h.idx !== drag.hit.idx)) return; // stay on the same part
      drag.L.x = h.x * drag.page.w - drag.ox; drag.L.y = h.y * drag.page.h - drag.oy; drag.moved = true;
      preview();
    }, true);
    const up = async e => {
      if (!drag) return;
      e.stopImmediatePropagation();
      const d = drag; drag = null; c.style.cursor = '';
      if (!d.moved) return;
      const P = await db.get('pages', d.page.id); const L = P.layers.find(l => l.id === d.L.id); if (!L) return;
      L.x = d.L.x; L.y = d.L.y; P.ver = (P.ver || 1) + 1; P.updated = Date.now();
      P.thumb = await putBlob(await makeThumb(P, this.book, 2048)); await db.put('pages', P);
      await this.refreshPart(P);
      this.fillStickerCache();
    };
    c.addEventListener('pointerup', up, true); c.addEventListener('pointercancel', up, true);
  },

  // ---------- every part of the book ----------
  surfKeyOf(id) { const b = this.book; if (id === b.coverPage) return 'cover'; return Object.entries(b.surf || {}).find(([, v]) => v === id)?.[0] || null; },
  async ensureSurface(key) {
    const b = this.book;
    if (key === 'cover') return this.ensureCoverPage();
    b.surf ||= {};
    let p = b.surf[key] && await db.get('pages', b.surf[key]);
    if (!p) {
      p = newPageData(b, 0); const sz = surfaceSize(b, key); p.w = sz.w; p.h = sz.h;
      p.layers[0].name = SURFACES[key].name; p.surface = key;
      b.surf[key] = p.id; await db.put('books', b);
    }
    // the "paper" you draw on is the real material of that part, so you see what you get
    p.paper = { type: 'custom', custom: await putBlob(await canvasBlob(this.book3d.surfaceBase(key, p.w, p.h), 'image/jpeg', 0.9)) };
    await db.put('pages', p);
    return p;
  },
  async editSurface(key) {
    if (key === 'cover') return this.editCover();
    this.lastSurface = key;
    const p = await this.ensureSurface(key);
    this.openEditor(-1, p.id, SURFACES[key].name);
  },
  surfaceMenu(anchor) {
    document.querySelector('.surf-menu')?.remove();
    const r = anchor.getBoundingClientRect();
    const m = el('div', { class: 'surf-menu', role: 'menu', style: { left: r.left + 'px', top: (r.bottom + 6) + 'px' } },
      ...Object.entries(SURFACES).map(([k, v]) => el('button', { class: 'surf-item', role: 'menuitem', onclick: () => { m.remove(); this.editSurface(k); } }, el('b', {}, v.name), el('span', { class: 'muted small' }, v.help))));
    document.body.append(m);
    const away = e => { if (!m.contains(e.target) && e.target !== anchor) { m.remove(); document.removeEventListener('pointerdown', away, true); } };
    setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
  },
  toggleFlip(on = !this.book3d.flipped) {
    this.book3d.setFlip(on);
    this.turnBtn.classList.toggle('lit', on);
    this.turnBtn.textContent = on ? '⟲ Turn back' : '⟲ Turn over';
    if (on) setTimeout(() => this.book3d.viewTo('cover'), 300);
  },
  // redraw the part of the book a page belongs to
  async refreshPart(p) {
    const key = this.surfKeyOf(p.id);
    if (!key) return this.book3d.invalidatePage(p.id);
    if (key === 'desk') return this.book3d.loadDeskArt();
    const pos = this.book3d.pos; await this.book3d.setBook(this.book); this.book3d.goTo(pos);
  },
  async placeAsset(a, hit, cx, cy) {
    const b = this.book, cover = hit.kind !== 'page', surfKey = hit.kind;
    const page = cover ? await this.ensureSurface(surfKey) : await db.get('pages', b.pages[hit.idx]);
    const s = Math.min(1, (page.w * (surfKey === 'desk' ? 0.06 : cover ? 0.4 : 0.32)) / a.w, (page.h * (surfKey === 'desk' ? 0.06 : 0.4)) / a.h);
    const L = { id: uid('l_'), name: a.name || 'Sticker', kind: 'image', src: a.blob, asset: a.id, media: a.media || null, iw: a.w, ih: a.h, x: hit.x * page.w, y: hit.y * page.h, scale: s, rot: (Math.random() - 0.5) * 0.15, visible: true, opacity: 1, blend: 'source-over', locked: false, filter: {}, shadow: { on: true, blur: 10, dx: 4, dy: 6, color: '#000000', a: 0.3 }, fx: a.kind === 'sticker' ? { finish: 'satin', finishAmt: 0.35 } : null };
    page.layers.push(L);
    page.ver = Math.max(2, (page.ver || 1) + 1); page.updated = Date.now();
    page.thumb = await putBlob(await makeThumb(page, b, 2048));
    await db.put('pages', page);
    await this.refreshPart(page);
    // a little popup to edit or undo right away
    document.querySelector('.place-pop')?.remove();
    const pop = el('div', { class: 'place-pop', style: { left: cx + 'px', top: cy + 'px' } },
      el('span', {}, cover ? `On the ${SURFACES[surfKey].name.toLowerCase()}.` : `On page ${hit.idx + 1}.`),
      el('button', { class: 'btn small primary', onclick: async () => { pop.remove(); if (cover) await this.openEditor(-1, page.id, SURFACES[surfKey].name); else await this.openEditor(hit.idx); const ed = this.editor; if (ed) { ed.setTool('move'); ed.selectOnly(L.id); } } }, 'Edit it'),
      el('button', { class: 'btn small', onclick: async () => { pop.remove(); const p2 = await db.get('pages', page.id); p2.layers = p2.layers.filter(l => l.id !== L.id); p2.ver++; p2.thumb = null; await db.put('pages', p2); await this.refreshPart(p2); } }, 'Undo'));
    document.body.append(pop);
    setTimeout(() => pop.remove(), 8000);
  },

  bookKeysPanel() {
    modal('Keys and controls', el('div', { class: 'keys' },
      el('p', { class: 'muted' }, 'Everything here also has a button. The camera pad at the bottom right aims the camera with one click.'),
      el('table', { class: 'keytable' }, BOOK_KEYS.map(([k, v]) => el('tr', {}, el('td', {}, el('kbd', {}, k)), el('td', {}, v))))));
  },
  currentPage() { const [l, r] = this.book3d ? this.book3d.spread() : [null, 0]; return r ?? l ?? 0; },
  updatePos(lbl) {
    const [l, r] = this.book3d.spread(), N = this.book.pages.length;
    lbl.textContent = this.book3d.pos === 0 ? 'Cover' : `${l != null ? 'Page ' + (l + 1) : 'Inside cover'} / ${r != null ? 'Page ' + (r + 1) : 'Back cover'} of ${N}`;
    this.editBtns.innerHTML = '';
    if (this.book3d.pos === 0) this.editBtns.append(el('button', { class: 'btn small primary', onclick: () => this.editCover() }, 'Draw on the cover'));
    const btn = (i, primary) => { const b = el('button', { class: 'btn small' + (primary ? ' primary' : ''), title: 'Open this page to draw on it', onclick: () => this.openEditor(i) }, `Draw on page ${i + 1}`); db.get('pages', this.book.pages[i]).then(p => { if (p && p.title) b.textContent = `Draw on "${p.title.length > 22 ? p.title.slice(0, 21) + '…' : p.title}"`; }); return b; };
    if (l != null) this.editBtns.append(btn(l, false));
    if (r != null) this.editBtns.append(btn(r, true));
  },
  async openEditor(i, pageId, label) {
    if (this.editor) return;
    document.querySelectorAll('.modal-back').forEach(m => m.remove());
    document.querySelector('.surf-menu')?.remove();
    this.editor = new Editor(this);
    await this.editor.open(this.book, i, pageId, label);
  },
  async editCover() {
    const b = this.book;
    if (!b.coverPage) {
      const p = newPageData(b, 0); p.layers[0].name = 'Cover art'; p.paper = { type: 'smooth', color: b.cover.color };
      await db.put('pages', p); b.coverPage = p.id; await db.put('books', b);
      toast('Draw anything here. It becomes your whole front cover.');
    }
    this.openEditor(-1, b.coverPage);
  },
  onEditorClosed(i) {
    this.editor = null;
    if (!this.book3d) return;
    if (i < 0) {
      const k = this.lastSurface; this.lastSurface = null;
      const v = { back: () => { this.toggleFlip(true); }, inFront: () => { this.toggleFlip(false); this.book3d.goTo(1); this.book3d.viewTo('top'); }, inBack: () => { this.toggleFlip(false); this.book3d.goTo(this.book3d.maxPos); this.book3d.viewTo('top'); }, spine: () => { this.toggleFlip(false); this.book3d.goTo(0); this.book3d.viewTo('spine'); }, edge: () => { this.toggleFlip(false); this.book3d.goTo(0); this.book3d.viewTo('edge'); }, desk: () => this.book3d.viewTo('top') }[k];
      if (v) return v();
      this.toggleFlip(false); this.book3d.goTo(0); this.book3d.viewTo('cover'); return;
    }
    const want = Math.floor((i + 1) / 2) + 1; if (Math.abs(this.book3d.pos - want) > 0) this.book3d.goTo(want);
  },
  async onPageSaved(p) {
    if (!this.book3d) return;
    if (p.id === this.book.coverPage) { await this.book3d.setBook(this.book); this.book3d.goTo(0); if (!this.editor) this.book3d.viewTo('cover'); return; }
    this.refreshPart(p);
    this.fillStickerCache?.();
  },
  openFactory(src, cb) { openFactory(src, cb); },
  openMakers(cb) { openMakers(cb); },
  openDither(src, cb) { openDither(src, cb); },
  openExport(o) { openExport(this, this.book, o); },

  async pagesDialog() {
    const b = this.book, at = this.currentPage();
    const body = el('div', { class: 'form' },
      el('p', {}, `This book has ${b.pages.length} pages. Pages come in pairs because each sheet has a front and a back.`),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn', onclick: async () => { await addPages(b, Math.min(b.pages.length, (Math.floor(at / 2) + 1) * 2), 2); m.close(); await this.reloadBook(); toast('Added 2 pages after this spread.'); } }, '+ 2 pages here'),
        el('button', { class: 'btn', onclick: async () => { await addPages(b, b.pages.length, 10); m.close(); await this.reloadBook(); toast('Added 10 pages at the end.'); } }, '+ 10 at the end'),
        el('button', { class: 'btn', onclick: async () => { await addPages(b, b.pages.length, 50); m.close(); await this.reloadBook(); toast('Added 50 pages at the end.'); } }, '+ 50 at the end'),
        el('button', { class: 'btn danger', onclick: async () => {
          const s = Math.floor(at / 2) * 2, ids = b.pages.slice(s, s + 2);
          if (b.pages.length <= 2) return toast('A book needs at least 2 pages.');
          if (await confirmBox('Remove this sheet?', `Pages ${s + 1} and ${s + 2} will be removed with everything on them.`, 'Remove')) { await removePages(b, ids); m.close(); await this.reloadBook(); }
        } }, 'Remove this sheet')),
      el('p', { class: 'muted small' }, 'Tip: open a page and use its arrows to move through pages while you work.'));
    const m = modal('Pages', body);
  },
  async reloadBook() { const pos = this.book3d.pos; this.book = await db.get('books', this.book.id); await this.book3d.setBook(this.book); this.book3d.goTo(Math.min(pos, this.book3d.maxPos)); },

  // ---------- customize ----------
  customize() {
    const b = this.book, c = b.cover;
    b.light ||= { warmth: 0.3, strength: 1, angle: -50, height: 0.7, ambient: 1 };
    let timer = 0;
    const save = () => { b.updated = Date.now(); db.put('books', b); };
    const apply = (thumbs) => { clearTimeout(timer); timer = setTimeout(async () => { save(); if (thumbs) for (const id of b.pages) { const p = await db.get('pages', id); if (!p.paper || thumbs === 'all') { p.thumb = null; p.ver++; await db.put('pages', p); } } const pos = this.book3d.pos, cam = { p: this.book3d.camera.position.clone(), t: this.book3d.controls.target.clone() }; await this.book3d.setBook(b); this.book3d.goTo(pos); this.book3d.camera.position.copy(cam.p); this.book3d.controls.target.copy(cam.t); this.book3d.controls.update(); }, 250); };
    const show = (pos, view) => () => { if (pos != null && this.book3d.pos !== pos) this.book3d.goTo(pos); this.book3d.viewTo(view); };
    const showBtn = (label, fn) => el('button', { class: 'btn small show-me', title: 'Move the camera to this part of the book', onclick: fn }, '👁 ' + label);
    const help = t => el('p', { class: 'muted small' }, t);
    const papers = () => ({ ...Object.fromEntries(Object.entries(PAPERS).map(([k, v]) => [k, v.name])), custom: 'Picture of my own texture' });
    const tabs = {
      cover: () => [
        showBtn('Show me the cover', show(0, 'cover')),
        help('The front of the book. Pick a material, add your own art or draw a cover, and write a title.'),
        el('h3', {}, 'Draw on any part'),
        el('div', { class: 'row wrap' }, ...Object.entries(SURFACES).map(([k, v]) => el('button', { class: 'btn small', title: v.help, onclick: () => { m.close(); this.editSurface(k); } }, '✎ ' + v.name))),
        el('div', { class: 'row wrap' }, el('button', { class: 'btn small', onclick: () => this.toggleFlip() }, '⟲ Turn the book over')),
        help('Every part opens in the full editor with all brushes, layers and stickers.'),
        el('h3', {}, 'Material'),
        select('Material', c.material, Object.fromEntries(Object.entries(COVERS).map(([k, v]) => [k, v.name])), v => { c.material = v; apply(); }),
        colorInput('Cover color', c.color, v => { c.color = v; apply(); }),
        slider('Wear and age', c.wear ?? 0.25, 0, 1, 0.01, v => { c.wear = v; apply(); }, v => Math.round(v * 100) + '%'),
        slider('Board thickness', c.thickness || 1, 0.4, 3, 0.05, v => { c.thickness = v; apply(); }, v => v.toFixed(2) + '×'),
        select('Metal corners', c.corners && c.corners !== 0.02 ? c.corners : 'none', { none: 'None', gold: 'Gold', silver: 'Silver', brass: 'Brass', black: 'Black' }, v => { c.corners = v; apply(); }),
        el('h3', {}, 'Stickers on the cover'),
        el('div', { class: 'row wrap' },
          el('button', { class: 'btn small primary', onclick: () => { show(0, 'cover')(); this.stickerTray(['sticker', 'made']); } }, '★ Drag stickers onto it'),
          el('button', { class: 'btn small', onclick: () => this.editCover() }, 'Move and style them')),
        help("Open the tray and drag any sticker onto the cover. \"Move and style them\" opens the cover in the editor, where you can move, resize, lock and change each sticker's look: border, gloss, holo, glitter, texture and more."),
        el('h3', {}, 'Cover art'),
        el('div', { class: 'row wrap' },
          el('button', { class: 'btn small primary', onclick: () => this.editCover() }, '✎ Draw my own cover'),
          el('button', { class: 'btn small', onclick: async () => { const pick = el('div', {}); const mm = modal('Cover art', pick, { wide: true }); pick.append(await assetGrid(['art', 'sticker', 'made'], a => { c.art = a.blob; mm.close(); apply(); })); } }, 'From library'),
          el('button', { class: 'btn small', onclick: async () => { const f = await pickFiles('image/*', false); if (f[0]) { const [a] = await importFiles(f, 'art'); c.art = a.blob; apply(); } } }, 'From a file'),
          (c.art || b.coverPage) ? el('button', { class: 'btn small danger', onclick: async () => { c.art = null; if (b.coverPage) { await db.del('pages', b.coverPage); b.coverPage = null; } apply(); } }, 'Remove art') : null),
        help('"Draw my own cover" opens the full editor on the cover, with every brush, layer, sticker and GIF.'),
        select('Art fit', c.artFit, { cover: 'Fill the window', contain: 'Show all of it', full: 'Whole cover' }, v => { c.artFit = v; apply(); }),
        slider('Art margin', c.artInset ?? 0.12, 0, 0.3, 0.01, v => { c.artInset = v; apply(); }),
        el('h3', {}, 'Title'),
        el('label', { class: 'row col' }, el('span', { class: 'lbl' }, 'Title text (Enter for a new line)'), (() => { const t = el('textarea', { rows: 2, class: 'full' }); t.value = c.label || ''; t.addEventListener('input', () => { c.label = t.value; apply(); }); return t; })()),
        select('Title style', c.titleStyle || 'printed', { printed: 'Printed', 'foil-gold': 'Gold foil (shiny)', 'foil-silver': 'Silver foil (shiny)', emboss: 'Embossed (raised)', deboss: 'Debossed (pressed in)', label: 'Paper label' }, v => { c.titleStyle = v; apply(); }),
        select('Position', c.titlePos || (c.art ? 'bottom' : 'upper'), { top: 'Top', upper: 'Upper', center: 'Center', lower: 'Lower', bottom: 'Bottom' }, v => { c.titlePos = v; apply(); }),
        slider('Size', c.titleSize || 1, 0.4, 3, 0.05, v => { c.titleSize = v; apply(); }, v => Math.round(v * 100) + '%'),
        select('Font', c.labelFont, Object.fromEntries(SYSTEM_FONTS.map(f => [f, f])), v => { c.labelFont = v; apply(); }),
        check('Bold', !!c.titleBold, v => { c.titleBold = v; apply(); }),
        colorInput('Text color', c.labelColor, v => { c.labelColor = v; apply(); }),
        colorInput('Label paper color', c.labelBg || '#efe6d2', v => { c.labelBg = v; apply(); }),
        el('h3', {}, 'Band and ribbon'),
        check('Elastic band', !!c.band, v => { c.band = v; apply(); }), colorInput('Band color', c.bandColor || '#121212', v => { c.bandColor = v; apply(); }),
        check('Ribbon bookmark', !!c.ribbon, v => { c.ribbon = v; apply(); }), colorInput('Ribbon color', c.ribbonColor || '#8a1010', v => { c.ribbonColor = v; apply(); })],
      inside: () => [
        showBtn('Show me the pages', show(Math.max(1, this.book3d.pos), 'angled')),
        help('The paper on every page. One page can have its own paper in the editor.'),
        select('Paper type', b.paper.type, papers(), async v => { if (v === 'custom') { const f = await pickFiles('image/*', false); if (!f[0]) return; b.paper.custom = await putBlob(f[0]); } b.paper.type = v; b.paper.color = null; apply(true); }),
        colorInput('Paper tint', b.paper.color || (PAPERS[b.paper.type] || PAPERS.sketch).color, v => { b.paper.color = v; apply(true); }),
        el('div', { class: 'row wrap' }, el('button', { class: 'btn small primary', onclick: () => openPaperMaker(id => { if (id) { b.paper.type = id; b.paper.color = null; apply(true); m.close(); this.customize(); } }) }, '+ Make my own paper'),
          b.paper.type?.startsWith('u_') ? el('button', { class: 'btn small', onclick: () => openPaperMaker(id => { b.paper.type = id || 'sketch'; apply(true); }, b.paper.type) }, 'Edit this paper') : null),
        slider('Paper thickness', b.paperWeight || 150, 60, 400, 10, v => { b.paperWeight = v; apply(); }, v => v + ' gsm'),
        help('Thicker paper makes a fatter book and stiffer pages.'),
        check('Page numbers', !!b.pageNumbers, v => { b.pageNumbers = v; apply('all'); }),
        el('h3', {}, 'Page edges'), showBtn('Show me the edges', show(0, 'edge')),
        select('Edge color', b.edges || 'natural', { natural: 'Natural paper', gold: 'Gilded gold', silver: 'Silver', black: 'Black', red: 'Red', blue: 'Blue', custom: 'My color' }, v => { b.edges = v; apply(); }),
        colorInput('My edge color', b.edgeColor || '#888888', v => { b.edgeColor = v; if (b.edges === 'custom') apply(); }),
        el('h3', {}, 'Inside covers'), showBtn('Show me', show(1, 'pageL')),
        colorInput('Inside cover color', b.endpaper || '#2a2522', v => { b.endpaper = v; apply(); }),
        select('Pattern', b.endpaperPattern || 'plain', { plain: 'Plain', marbled: 'Marbled', dots: 'Dots', stripes: 'Stripes', grid: 'Grid', stars: 'Stars' }, v => { b.endpaperPattern = v; apply(); }),
        colorInput('Pattern color', b.endpaper2 || '#c9a46a', v => { b.endpaper2 = v; apply(); })],
      book: () => [
        showBtn('Show me the spine', show(0, 'spine')),
        help('How the book is put together.'),
        select('Binding', b.binding, BINDINGS, v => { b.binding = v; apply(); }),
        colorInput('Spine band color', b.headband || '#8a1d1d', v => { b.headband = v; apply(); }),
        help('The spine band is the little stitched strip at the top and bottom of a hardcover spine.'),
        el('p', {}, `${b.pages.length} pages, ${b.size.wMM} × ${b.size.hMM} mm, ${b.size.dpi} DPI.`),
        el('button', { class: 'btn small', onclick: () => { m.close(); this.pagesDialog(); } }, 'Add or remove pages'),
        el('h3', {}, 'Page turning'),
        slider('Turn speed', b.flip.speed, 0.2, 2.5, 0.05, v => { b.flip.speed = v; save(); }, v => v + ' s'),
        slider('Paper bend', b.flip.curl, 0, 1.2, 0.05, v => { b.flip.curl = v; save(); }),
        slider('Flick speed (flip book)', b.flip.flick ?? 0.16, 0.06, 0.6, 0.01, v => { b.flip.flick = v; save(); }, v => v + ' s per page'),
        el('button', { class: 'btn small', onclick: () => this.flick(1) }, '⏩ Try a flick')],
      scene: () => [
        showBtn('Show me the desk', show(null, 'low')),
        el('h3', {}, 'Desk'),
        select('Surface', b.desk.kind, { ...Object.fromEntries(Object.entries(DESKS).map(([k, v]) => [k, v.name])), ...(b.desk.photo ? { photo: 'My photo' } : {}) }, v => { b.desk.kind = v; save(); this.book3d.setDesk(v, b.desk.color, b.desk); }),
        colorInput('Color (felt, linen, plain)', b.desk.color || '#2a2420', v => { b.desk.color = v; save(); if (['plain', 'felt', 'linen'].includes(b.desk.kind)) this.book3d.setDesk(b.desk.kind, v, b.desk); }),
        slider('Pattern size', b.desk.scale || 1, 0.3, 3, 0.05, v => { b.desk.scale = v; save(); this.book3d.setDesk(b.desk.kind, b.desk.color, b.desk); }, v => Math.round(v * 100) + '%'),
        el('div', { class: 'row wrap' },
          el('button', { class: 'btn small', title: 'Use any photo as the desk, like your real table, a rug or a tablecloth', onclick: async () => { const f = await pickFiles('image/*', false); if (!f[0]) return; b.desk.photo = await putBlob(f[0]); b.desk.kind = 'photo'; save(); this.book3d.setDesk('photo', b.desk.color, b.desk); m.close(); this.czTab = 'scene'; this.customize(); } }, '🖼 Use my own photo'),
          el('button', { class: 'btn small primary', title: 'Draw on the desk or cover it in stickers', onclick: () => { m.close(); this.editSurface('desk'); } }, '✎ Draw on the desk'),
          b.surf?.desk ? el('button', { class: 'btn small danger', onclick: async () => { if (!(await confirmBox('Clear the desk?', 'Removes everything drawn and stuck on the desk. The book is not touched.', 'Clear'))) return; await db.del('pages', b.surf.desk); delete b.surf.desk; save(); this.book3d.book = b; this.book3d.loadDeskArt(); m.close(); this.czTab = 'scene'; this.customize(); } }, 'Clear desk') : null),
        help('Drag stickers from the tray straight onto the desk for a sticker bomb.'),
        el('h3', {}, 'Light'),
        slider('Warm or cool', b.light.warmth, -1, 1, 0.01, v => { b.light.warmth = v; save(); this.book3d.setLight(b.light); }, v => v > 0.05 ? 'warm' : v < -0.05 ? 'cool' : 'neutral'),
        slider('Brightness', b.light.strength, 0.2, 2, 0.01, v => { b.light.strength = v; save(); this.book3d.setLight(b.light); }, v => Math.round(v * 100) + '%'),
        slider('Light direction', b.light.angle, -180, 180, 1, v => { b.light.angle = v; save(); this.book3d.setLight(b.light); }, v => v + '°'),
        slider('Light height', b.light.height, 0, 1, 0.01, v => { b.light.height = v; save(); this.book3d.setLight(b.light); }, v => v < 0.35 ? 'low (long shadows)' : v > 0.75 ? 'high' : 'middle'),
        slider('Room light', b.light.ambient, 0.2, 2, 0.01, v => { b.light.ambient = v; save(); this.book3d.setLight(b.light); }, v => Math.round(v * 100) + '%'),
        help('A low light shows off the paper texture and the raised paint. Videos you export use this light too.')],
    };
    const TABN = { cover: 'Cover', inside: 'Paper & inside', book: 'Book & turning', scene: 'Desk & light' };
    const body = el('div', { class: 'form' });
    const tabBar = el('div', { class: 'tabs cz-tabs' });
    let cur = this.czTab || 'cover';
    const draw = () => { body.innerHTML = ''; tabBar.querySelectorAll('button').forEach(x => x.classList.toggle('lit', x.dataset.k === cur)); body.append(...tabs[cur]().filter(Boolean)); };
    for (const k of Object.keys(tabs)) tabBar.append(el('button', { class: 'btn small', 'data-k': k, onclick: () => { cur = this.czTab = k; draw(); } }, TABN[k]));
    draw();
    const m = modal('Customize ' + b.title, el('div', {}, tabBar, body), { cls: 'side' });
  },

  // ---------- record what's on screen ----------
  toggleRecord() {
    if (this.rec) { this.rec.stop(); return; }
    const cv = this.book3d.canvas, stream = cv.captureStream(60);
    const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 20e6 }), chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const keep = setInterval(() => { this.book3d.dirty = true; }, 1000 / 30);
    rec.onstop = async () => {
      clearInterval(keep); this.rec = null; this.recBtn.textContent = '● Record'; this.recBtn.classList.remove('rec');
      const blob = new Blob(chunks, { type: 'video/webm' });
      const checks = await verify(blob, { kind: 'recording', w: cv.width, h: cv.height }, 'recording');
      const ok = checks.every(c => c.ok);
      const name = `${safeName(this.book.title)}-recording-${Date.now()}.webm`;
      const where = ok ? await saveFile(blob, name) : null;
      await db.put('exports', { id: 'x_' + Date.now(), t: Date.now(), name, kind: 'recording', size: blob.size, ok, where: where?.where || '' });
      modal('Recording', el('div', { class: 'report' }, el('p', { class: ok ? 'ok' : 'bad' }, ok ? 'Recording saved.' : 'The recording did not pass its check.'), where ? el('p', {}, 'Saved to: ', el('b', {}, where.where)) : null, el('ul', { class: 'checks' }, checks.map(c => el('li', { class: c.ok ? 'ok' : 'bad' }, (c.ok ? '✓ ' : '✗ ') + c.label + (c.note ? ` (${c.note})` : ''))))), {});
    };
    rec.start(250); this.rec = rec;
    this.recBtn.textContent = '■ Stop recording'; this.recBtn.classList.add('rec');
    toast('Recording. Flip or fly around, then press Stop. Export > Flip-through video is smoother.');
  },

  // ---------- library & settings ----------
  async libraryDialog() {
    const body = el('div', {});
    const show = async kinds => { body.querySelector('.asset-grid')?.remove(); body.append(await assetGrid(kinds, a => {}, { onDelete: async (a, card) => { if (await confirmBox('Delete from library?', `"${a.name}" will be removed from your library. Pages that already use it keep their copy.`, 'Delete')) { await db.del('assets', a.id); card.remove(); } } })); };
    body.append(el('div', { class: 'tabs' },
      el('button', { class: 'btn small', onclick: () => show(['art']) }, 'My art'), el('button', { class: 'btn small', onclick: () => show(['media']) }, 'GIFs and videos'), el('button', { class: 'btn small', onclick: () => show(['sticker']) }, 'Stickers'),
      el('button', { class: 'btn small', onclick: () => show(['made']) }, 'Made pieces'), el('button', { class: 'btn small', onclick: () => show(['font']) }, 'Fonts'),
      el('button', { class: 'btn small primary', onclick: async () => { const fs = await pickFiles(MEDIA_ACCEPT + ',.ttf,.otf,.woff,.woff2', true); if (fs.length) { const a = await importFiles(fs, 'art'); toast(`Imported ${a.length} file(s).`); show(['art', 'media', 'font']); } } }, 'Import'),
      el('button', { class: 'btn small', onclick: () => openFactory(null, () => show(['sticker', 'art'])) }, 'Sticker factory'),
      el('button', { class: 'btn small', onclick: () => openMakers(null) }, 'Makers')));
    modal('Library', body, { wide: true });
    show(['art', 'media', 'sticker', 'made']);
  },
  async settingsDialog() {
    const s = this.settings, u = await usage(), dir = await getSetting('exportDir', null);
    const body = el('div', { class: 'form' },
      select('Look', s.theme, THEMES, v => { s.theme = v; document.documentElement.dataset.theme = v; setSetting('theme', v); }),
      select('Performance', s.quality, { max: 'Maximum quality', balanced: 'Balanced', performance: 'Performance (older PCs)' }, v => { s.quality = v; setSetting('quality', v); this.book3d?.setQuality(v); }),
      el('p', { class: 'muted small' }, 'This only changes the live preview. Exports always use the full quality you pick in Export.'),
      check('Reduce motion (instant page turns)', s.reducedMotion, v => { s.reducedMotion = v; setSetting('reducedMotion', v); if (this.book3d) this.book3d.reducedMotion = v; }),
      el('h3', {}, 'Saving'),
      el('p', {}, 'Everything saves in this browser on this PC. Nothing is uploaded. Clearing site data deletes it, so keep project files as backups.'),
      el('p', { class: 'muted small' }, `Export folder: ${dir ? dir.name : 'Downloads'}`),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn small', onclick: chooseExportFolder }, 'Choose export folder'),
        el('button', { class: 'btn small', onclick: async () => { const books = await db.all('books'); for (const b of books) openExport(this, b, { tab: 'project' }); toast('Open each Export window and press Save project file.'); } }, 'Back up all books'),
        el('button', { class: 'btn small', onclick: async () => { const r = await collectGarbage(); toast(`Cleaned up ${r.removed} unused file(s), freed ${fmtBytes(r.freed)}.`); } }, 'Clean up storage')),
      u ? el('p', { class: 'muted small' }, `Using ${fmtBytes(u.usage || 0)} of about ${fmtBytes(u.quota || 0)} this browser allows.`) : null);
    modal('Settings', body);
  },

  // ---------- welcome guide ----------
  guide(first) {
    const step = (n, t, ...p) => el('div', { class: 'g-step' }, el('span', { class: 'g-n' }, n), el('div', {}, el('h3', {}, t), ...p.map(x => el('p', {}, x))));
    const body = el('div', { class: 'guide' },
      el('p', { class: 'lead' }, 'A sketchbook you can flip and draw in, with a full art studio. Your work stays in your own browser. Nobody else can see it.'),
      step('1', 'Make a sketchbook', 'Press "+ New sketchbook" and pick a kind. "Customize" changes the cover, paper and desk any time.'),
      step('2', 'Flip through it', 'Click a page edge, drag a corner, or use the arrow keys. Press K for every key.'),
      step('3', 'Draw', 'Double-click a page. Tools are at the bottom, brushes on the right. Paints mix like real paint.'),
      step('4', 'Name and save', 'Name your art at the top of the page. It saves by itself, with a restore point every 5 minutes.'),
      step('5', 'Add your art', '"+ Add media" adds pictures, GIFs and videos. Stickers and Makers add cut-outs.'),
      step('6', 'Export', '"Export" makes images, print PDFs, videos and GIFs. Each file is checked for you.'),
      step('7', 'Back it up', 'Export > Project file saves a whole book. Open it on any PC with "Open a project file".'));
    modal(first ? 'Welcome to SHESKETCHES' : 'How it works', body, { wide: true, buttons: [{ label: first ? 'Start' : 'Close', primary: true, onClick: c => c() }], onClose: () => setSetting('seenGuide', true) });
  },
};

window.SHESKETCHES = app;
if (location.hostname === 'localhost') window.__app = app; // for the self-test and debugging on this PC only
app.init().catch(e => { console.error(e); document.body.append(el('pre', { class: 'fatal' }, 'SHESKETCHES could not start: ' + e.message)); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
