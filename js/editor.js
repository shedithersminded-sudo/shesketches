// The page editor: a real canvas engine with layers, brushes, images, stickers and text.
// It edits the same page data the book shows. Saving refreshes the page in the book.
import { db, uid, putBlob, getSetting, setSetting } from './db.js';
import { PRESETS, PARAMS, ENGINES, TOOLS, TIP_SHAPES, shapePath, paramsFor, fullBrush, Stroke, watercolorFinish, floodFill, drawTool, mixPaint } from './brushes.js';
import { colorWheel } from './colorwheel.js';
import { drawLayer, drawLayers, drawPaper, bitmap, mediaRes, isAnimated, itemSize, makeThumb, canvasBlob, paperOf } from './render.js';
import { pushHistory } from './model.js';
import { FX_PARAMS, FX_PRESETS, FX_DEFAULT } from './stickerfx.js';
import { PAPERS } from './paper.js';
import { el, toast, slider, select, colorInput, check, pickFiles, confirmBox, promptBox, modal, saveFile } from './ui.js';
import { importFiles, assetGrid, pieceTray, KINDS, SYSTEM_FONTS, loadAllFonts, MEDIA_ACCEPT } from './library.js';

const BLENDS = { 'source-over': 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', darken: 'Darken', lighten: 'Lighten', 'color-dodge': 'Color dodge', 'color-burn': 'Color burn', 'hard-light': 'Hard light', 'soft-light': 'Soft light', difference: 'Difference', exclusion: 'Exclusion', hue: 'Hue', saturation: 'Saturation', color: 'Color', luminosity: 'Luminosity' };
const PALETTE = ['#101012', '#3a3a3c', '#8a8a8a', '#f4f1ea', '#ffffff', '#7a0f12', '#b3211e', '#e0533d', '#ef8fa0', '#f2c94c', '#e8b23a', '#c9a46a', '#8a6a46', '#4c3a2a', '#5b6a3c', '#2f5d3a', '#2e8a7a', '#3b6ea8', '#1f2f55', '#7fa6c9', '#6b4a8a', '#c86aa0', '#d9d2c3', '#1b1a19'];
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const clone = o => JSON.parse(JSON.stringify(o));
const AUTOSAVE_MS = 5 * 60 * 1000; // a full save and a restore point every 5 minutes
const seededRnd = s => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const TOOLS_UI = [
  ['brush', 'Draw', 'B', '✎', 'Draw and paint. Pick a brush on the right.'],
  ['blend', 'Blend', 'S', '☝', 'Smudge and blend colors together.'],
  ['eraser', 'Erase', 'E', '⌫', 'Erase on the selected layer.'],
  ['fill', 'Fill', 'G', '◍', 'Fill an area with your color.'],
  ['pick', 'Pick color', 'I', '⌖', 'Click the page to copy a color. Or hold Alt with any brush.'],
  ['move', 'Select & move', 'V', '✥', 'Click to select, drag to move. Shift-click picks several.'],
  ['text', 'Text', 'T', 'T', 'Click on the page to write.'],
  ['hand', 'Pan', 'H', '✋', 'Drag to move around the page. Or hold Space.'],
];
const KEYS = [
  ['B', 'Draw'], ['S', 'Blend'], ['E', 'Erase'], ['G', 'Fill'], ['I', 'Pick a color from the page (or hold Alt with any brush)'], ['C', 'Color wheel at the cursor'], ['V', 'Select and move'], ['T', 'Text'], ['H or hold Space', 'Pan'],
  ['[  and  ]', 'Brush smaller / bigger'], ['Shift + [  and  ]', 'Brush weaker / stronger'], ['X', 'Swap main and second color'],
  ['Ctrl + Z', 'Undo'], ['Ctrl + Y or Ctrl + Shift + Z', 'Redo'], ['Ctrl + S', 'Save now'],
  ['Ctrl + Shift + N', 'New layer'], ['Ctrl + J', 'Duplicate layer'], ['Ctrl + E', 'Merge down'], ['Ctrl + ]  and  Ctrl + [', 'Move layer up / down'],
  ['/', 'Protect transparent areas on this layer'], ['Ctrl + Alt + G', 'Clip layer to the one below'], ['Ctrl + ,', 'Hide or show layer'],
  ['Ctrl + A', 'Select all pictures and text'], ['Delete', 'Delete what is selected'], ['Esc', 'Deselect'], ['Arrow keys', 'Nudge selected items (Shift for 10 px)'],
  ['Double-click', 'Quick menu: every brush setting, tools, colors, zoom, undo'], ['Q', 'Quick menu at the cursor'], ['Alt + scroll', 'Brush size'], ['Alt + Shift + scroll', 'Brush strength'],
  ['K', 'Stickers tray (drag stickers onto the page)'], ['P', 'Preview: hide all tools'], ['0', 'Fit page'], ['1, 2, 3', 'Zoom to 100%, 200%, 400% where the cursor is'], ['Hold Z + click', 'Zoom in there (Alt + click zooms out)'], ['Hold Z + drag', 'Drag right to zoom in, left to zoom out'], ['Scroll', 'Zoom'], ['+  and  -', 'Zoom'], ['Middle-drag or hold Space', 'Move around the page'], ['Page Up / Page Down', 'Previous / next page'], ['?', 'This list'],
];

export class Editor {
  constructor(app) { this.app = app; }

  async open(book, pageIndex, pageId) {
    this.book = book; this.idx = pageIndex; this.coverMode = !!pageId;
    this.page = await db.get('pages', pageId || book.pages[pageIndex]);
    this.res = {}; this.dirtyLayers = new Set(); this.undo = []; this.redo = [];
    this.tool = 'brush'; this.selection = new Set(); this.primary = null;
    this.overrides = await getSetting('brushOverrides', {});
    this.custom = await getSetting('customBrushes', []);
    this.presetId = await getSetting('brushPreset', 'pencil-hb');
    this.blendId = await getSetting('blendPreset', 'smudge');
    this.eraseId = await getSetting('erasePreset', 'eraser');
    this.color = await getSetting('brushColor', '#2a2a2c');
    this.color2 = await getSetting('brushColor2', '#f2c94c');
    this.recent = await getSetting('recentColors', []);
    this.myPalette = await getSetting('myPalette', []);
    this.explain = await getSetting('explainSettings', true);
    this.recentBrushes = await getSetting('recentBrushes', []);
    this.moveMode = 'items';
    this.pickFrom = await getSetting('pickFrom', 'all');
    this.pickSize = await getSetting('pickSize', 1);
    this.pickStay = await getSetting('pickStay', false);
    this.dblMenu = await getSetting('dblMenu', true);
    this.fonts = [...SYSTEM_FONTS, ...(await loadAllFonts())];
    this.buildDOM();
    await this.loadPage();
    this.bindKeys();
    this.fit();
    // safety net: save every 5 minutes, and whenever you switch tabs or close the window
    this.autoT = setInterval(() => { if (this.root && this.editedSinceSnap) { this.editedSinceSnap = false; this.save(true); } }, AUTOSAVE_MS);
    this.statusT = setInterval(() => this.updStatus(), 30000);
    this.onHide = () => { if (document.visibilityState === 'hidden' && this.isChanged) this.save(); };
    document.addEventListener('visibilitychange', this.onHide); window.addEventListener('pagehide', this.onHide);
    if (!(await getSetting('seenEditorTips', false))) { setSetting('seenEditorTips', true); setTimeout(() => this.showTips(), 300); }
  }

  get brushes() { return [...PRESETS, ...this.custom]; }
  get curId() { return this.tool === 'blend' ? this.blendId : this.tool === 'eraser' ? this.eraseId : this.presetId; }
  noteBrush(v) { this.recentBrushes = [v, ...(this.recentBrushes || []).filter(x => x !== v)].slice(0, 8); setSetting('recentBrushes', this.recentBrushes); }
  set curId(v) { this.noteBrush(v); if (this.tool === 'blend') { this.blendId = v; setSetting('blendPreset', v); } else if (this.tool === 'eraser') { this.eraseId = v; setSetting('erasePreset', v); } else { this.presetId = v; setSetting('brushPreset', v); } }
  get preset() { const all = this.brushes, p = all.find(p => p.id === this.curId) || all.find(p => p.kind === this.kindForTool) || PRESETS[0]; return fullBrush({ ...p, ...(this.overrides[p.id] || {}) }); }
  get kindForTool() { return this.tool === 'blend' ? 'blend' : this.tool === 'eraser' ? 'erase' : 'draw'; }
  get active() { return this.page.layers.find(l => l.id === this.activeId); }
  get selItems() { return this.page.layers.filter(l => this.selection.has(l.id) && l.kind !== 'paint'); }

  // ---------- page loading ----------
  async loadPage() {
    const P = this.page;
    this.paperCanvas = mk(P.w, P.h);
    await drawPaper(this.paperCanvas.getContext('2d'), P, this.book, P.w, P.h);
    for (const L of P.layers) await this.ensureRes(L);
    this.updAnim();
    this.stroke = mk(P.w, P.h); this.strokeCtx = this.stroke.getContext('2d');
    this.pre = mk(P.w, P.h);
    this.activeId = (P.layers.slice().reverse().find(l => l.kind === 'paint') || P.layers[P.layers.length - 1] || {}).id;
    this.selection = new Set(); this.primary = null;
    this.title.textContent = this.coverMode ? 'Cover art' : `Page ${this.idx + 1} of ${this.book.pages.length}`;
    this.nameI.value = this.page.title || ''; this.nameI.style.display = this.coverMode ? 'none' : '';
    this.renderPanels(); this.updUndo();
    this.dirty = true;
  }
  async ensureRes(L) {
    if (this.res[L.id]) return;
    if (L.kind === 'paint') {
      const c = mk(this.page.w, this.page.h);
      if (L.blob) { const bm = await bitmap(L.blob); if (bm) c.getContext('2d').drawImage(bm, 0, 0); }
      this.res[L.id] = c;
    } else if (L.kind === 'image') this.res[L.id] = await mediaRes(L);
  }
  layerCtx(L) { return this.res[L.id].getContext('2d'); }

  // ---------- DOM ----------
  buildDOM() {
    this.title = el('span', { class: 'ed-title' });
    this.nameI = el('input', { type: 'text', class: 'ed-name', maxlength: 60, placeholder: 'Name this art', 'aria-label': 'Name of this page', title: 'Give this page a name. It shows in the book and is used as the file name when you export.' });
    this.nameI.addEventListener('change', () => this.setName(this.nameI.value));
    this.nameI.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') this.nameI.blur(); });
    this.status = el('span', { class: 'ed-status muted' }, 'Saved');
    this.zoomLbl = el('span', { class: 'zoom-lbl' }, '100%');
    this.canvas = el('canvas', { class: 'ed-canvas', 'aria-label': 'Page canvas' });
    this.undoBtn = el('button', { class: 'dock-btn', title: 'Undo (Ctrl+Z)', onclick: () => this.doUndo() }, el('span', { class: 'ti' }, '↶'), el('span', { class: 'tl' }, 'Undo'));
    this.redoBtn = el('button', { class: 'dock-btn', title: 'Redo (Ctrl+Y)', onclick: () => this.doRedo() }, el('span', { class: 'ti' }, '↷'), el('span', { class: 'tl' }, 'Redo'));
    this.chip = el('button', { class: 'color-chip', title: 'Main color. Click for the color wheel (C). Press X to swap.', onclick: e => { const r = e.currentTarget.getBoundingClientRect(); this.colorPop(r.left + r.width / 2, r.top - 470); } });
    this.chip2 = el('button', { class: 'color-chip two', title: 'Second color. Click to swap (X).', onclick: () => this.swapColors() });
    this.sizeS = el('input', { type: 'range', min: 1, max: 600, step: 0.5, 'aria-label': 'Brush size' });
    this.sizeS.addEventListener('input', () => this.setBrushProp('size', +this.sizeS.value, true));
    this.sizeS.addEventListener('change', () => { this.sizeS.blur(); this.renderPanels(); });
    this.opS = el('input', { type: 'range', min: 0.02, max: 1, step: 0.01, 'aria-label': 'Brush strength' });
    this.opS.addEventListener('input', () => this.setBrushProp('opacity', +this.opS.value, true));
    this.opS.addEventListener('change', () => { this.opS.blur(); this.renderPanels(); });
    this.toolHint = el('div', { class: 'tool-hint' });
    const toolBtn = ([id, label, key, icon, help]) => el('button', { class: 'dock-btn tool', 'data-tool': id, title: `${label} (${key}). ${help}`, 'aria-label': label, onclick: () => this.setTool(id) }, el('span', { class: 'ti' }, icon), el('span', { class: 'tl' }, label));
    this.dock = el('div', { class: 'dock', role: 'toolbar', 'aria-label': 'Tools' },
      el('div', { class: 'dock-group' }, ...TOOLS_UI.map(toolBtn)),
      el('span', { class: 'dock-sep' }),
      el('div', { class: 'dock-group' }, this.undoBtn, this.redoBtn),
      el('span', { class: 'dock-sep' }),
      el('div', { class: 'dock-group sliders' },
        el('label', { class: 'mini', title: 'Brush size ([ and ])' }, el('span', {}, 'Size'), this.sizeS),
        el('label', { class: 'mini', title: 'Brush strength (Shift + [ and ])' }, el('span', {}, 'Strength'), this.opS),
        this.mixWrap = el('label', { class: 'mini', title: 'How much the brush picks up and blends the colors under it' }, el('span', {}, 'Mix'), this.mixS = el('input', { type: 'range', min: 0, max: 1, step: 0.01, 'aria-label': 'Mix' })),
        this.dragWrap = el('label', { class: 'mini', title: 'How far the brush smears colors along the stroke' }, el('span', {}, 'Drag'), this.dragS = el('input', { type: 'range', min: 0, max: 1, step: 0.01, 'aria-label': 'Drag' })),
        el('button', { class: 'dock-btn', title: 'Quick menu with every setting (double-click the page or Q)', onclick: e => { const r = e.currentTarget.getBoundingClientRect(); this.quickMenu(r.left + r.width / 2, r.top - 330); } }, el('span', { class: 'ti' }, '⚙'), el('span', { class: 'tl' }, 'Quick'))),
      el('div', { class: 'chips' }, this.chip, this.chip2),
      el('span', { class: 'dock-sep' }),
      el('div', { class: 'dock-group' },
        el('button', { class: 'dock-btn', title: 'Stickers tray: drag stickers and pieces onto the page (K)', onclick: () => this.toggleTray() }, el('span', { class: 'ti' }, '★'), el('span', { class: 'tl' }, 'Stickers')),
        el('button', { class: 'dock-btn', title: 'Preview without tools (P)', onclick: () => this.togglePreview() }, el('span', { class: 'ti' }, '◐'), el('span', { class: 'tl' }, 'Preview')),
        el('button', { class: 'dock-btn', title: 'Keys and controls (?)', onclick: () => this.showKeys() }, el('span', { class: 'ti' }, '⌨'), el('span', { class: 'tl' }, 'Keys')),
        el('button', { class: 'dock-btn', title: 'Quick tips', onclick: () => this.showTips() }, el('span', { class: 'ti' }, '?'), el('span', { class: 'tl' }, 'Help'))));
    this.mixS.addEventListener('input', () => this.setBrushProp('pickup', +this.mixS.value, true));
    this.mixS.addEventListener('change', () => { this.mixS.blur(); this.renderPanels(); });
    this.dragS.addEventListener('input', () => this.setBrushProp('drag', +this.dragS.value, true));
    this.dragS.addEventListener('change', () => { this.dragS.blur(); this.renderPanels(); });
    this.previewExit = el('button', { class: 'btn preview-exit', onclick: () => this.togglePreview(false) }, 'Exit preview (P)');
    this.stage = el('div', { class: 'ed-stage' }, this.canvas, this.toolHint, this.dock, this.previewExit);
    this.panel = el('div', { class: 'ed-panel' });
    this.root = el('div', { class: 'editor' },
      el('header', { class: 'ed-top' },
        el('button', { class: 'btn', onclick: () => this.close(), title: 'Save and go back to the book' }, '← Book'),
        el('button', { class: 'icon-btn', title: 'Previous page (Page Up)', onclick: () => this.gotoPage(this.idx - 1) }, '‹'), this.title, this.nameI,
        el('button', { class: 'icon-btn', title: 'Next page (Page Down)', onclick: () => this.gotoPage(this.idx + 1) }, '›'),
        el('span', { class: 'sep' }),
        el('button', { class: 'icon-btn', title: 'Zoom out (-)', onclick: () => this.zoomBy(1 / 1.25) }, '−'), this.zoomLbl,
        el('button', { class: 'icon-btn', title: 'Zoom in (+)', onclick: () => this.zoomBy(1.25) }, '+'),
        el('button', { class: 'btn small', title: 'Fit page (0)', onclick: () => this.fit() }, 'Fit'),
        el('button', { class: 'btn small', title: 'Actual pixels', onclick: () => this.zoomTo(1) }, '1:1'),
        el('span', { class: 'grow' }),
        el('button', { class: 'btn', onclick: () => this.openLibrary(), title: 'Add your art, stickers, GIFs and videos' }, '+ Add media'),
        el('button', { class: 'btn', onclick: () => this.app.openMakers(a => this.addImageAsset(a)) }, 'Makers'),
        el('button', { class: 'btn', onclick: () => this.app.openFactory(null, a => this.addImageAsset(a)) }, 'Sticker factory'),
        el('button', { class: 'btn', onclick: async () => { await this.save(); this.app.openExport({ tab: 'artwork', pageIndex: this.idx }); } }, 'Export page'),
        this.status),
      el('div', { class: 'ed-body' }, this.stage, this.panel));
    document.body.append(this.root);
    this.ro = new ResizeObserver(() => { this.resize(); }); this.ro.observe(this.stage);
    this.bindPointer();
    this.loop = () => {
      if (!this.root) return; requestAnimationFrame(this.loop);
      if (this.hasAnim) this.dirty = true;
      if (this.dirty) { this.dirty = false; this.draw(); }
    };
    requestAnimationFrame(this.loop);
    this.setTool('brush');
  }

  setTool(t) {
    if (t === 'pick' && this.tool !== 'pick') this.prevTool = this.tool;
    this.tool = t;
    this.root.querySelectorAll('.dock-btn.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    this.updCursor();
    const info = TOOLS_UI.find(x => x[0] === t);
    this.toolHint.textContent = info ? info[4] : '';
    this.toolHint.classList.remove('show'); void this.toolHint.offsetWidth; this.toolHint.classList.add('show');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => this.toolHint.classList.remove('show'), 3500);
    if (t !== 'move') { this.selection.clear(); this.primary = null; }
    this.renderPanels(); this.dirty = true;
  }
  pickMode() { return this.tool === 'pick' || (this.altDown && ['brush', 'blend', 'fill', 'text'].includes(this.tool)); }
  updCursor() {
    const t = this.tool;
    this.stage.style.cursor = this.space ? 'grab' : this.zDown ? (this.altDown ? 'zoom-out' : 'zoom-in') : this.pickMode() ? 'none' : t === 'hand' ? 'grab' : t === 'move' ? 'default' : t === 'text' ? 'text' : t === 'fill' ? 'crosshair' : 'none';
    this.dirty = true;
  }
  updDock() {
    const p = this.preset;
    this.sizeS.value = p.size; this.opS.value = p.opacity;
    if (this.mixS) { this.mixWrap.style.display = p.engine === 'paint' ? '' : 'none'; this.mixS.value = p.pickup ?? 0; }
    if (this.dragS) { this.dragWrap.style.display = p.engine === 'paint' ? '' : 'none'; this.dragS.value = p.drag ?? 0.5; }
    this.chip.style.background = this.color; this.chip2.style.background = this.color2;
  }
  updUndo() { this.undoBtn.disabled = !this.undo.length; this.redoBtn.disabled = !this.redo.length; this.undoBtn.title = this.undo.length ? `Undo: ${this.undo[this.undo.length - 1].label || 'last step'} (Ctrl+Z)` : 'Nothing to undo'; this.redoBtn.title = this.redo.length ? `Redo: ${this.redo[this.redo.length - 1].label || 'step'} (Ctrl+Y)` : 'Nothing to redo'; }
  swapColors() { [this.color, this.color2] = [this.color2, this.color]; setSetting('brushColor', this.color); setSetting('brushColor2', this.color2); this.renderPanels(); this.dirty = true; }
  togglePreview(on = !this.previewOn) { this.previewOn = on; this.root.classList.toggle('preview', on); this.dirty = true; setTimeout(() => this.resize(), 260); }

  resize() {
    const r = this.stage.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
    this.vw = r.width; this.vh = r.height; this.dirty = true;
  }
  fit() {
    if (!this.vw) this.resize();
    const P = this.page, z = Math.min((this.vw - 60) / P.w, (this.vh - 150) / P.h);
    this.z = z; this.px = (this.vw - P.w * z) / 2; this.py = (this.vh - 90 - P.h * z) / 2 + 10; this.updZoom();
  }
  zoomTo(z, cx = this.vw / 2, cy = this.vh / 2) {
    z = Math.max(0.03, Math.min(16, z));
    const ux = (cx - this.px) / this.z, uy = (cy - this.py) / this.z;
    this.z = z; this.px = cx - ux * z; this.py = cy - uy * z; this.updZoom();
  }
  zoomBy(k, cx, cy) { this.zoomTo(this.z * k, cx, cy); }
  updZoom() { this.zoomLbl.textContent = Math.round(this.z * 100) + '%'; this.dirty = true; }
  toPage(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - this.px) / this.z, y: (e.clientY - r.top - this.py) / this.z }; }

  // ---------- drawing the view ----------
  draw() {
    const g = this.canvas.getContext('2d'), dpr = devicePixelRatio || 1, P = this.page;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, this.vw, this.vh);
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 30; g.shadowOffsetY = 10;
    g.fillStyle = '#fff'; g.fillRect(this.px, this.py, P.w * this.z, P.h * this.z);
    g.restore();
    g.save();
    g.translate(this.px, this.py); g.scale(this.z, this.z);
    g.beginPath(); g.rect(0, 0, P.w, P.h); g.clip();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = this.z < 1 ? 'high' : 'medium';
    g.drawImage(this.paperCanvas, 0, 0);
    const hook = (L, ctx, clipped) => {
      if (this.stroking && L.id === this.activeId && this.strokeOnCanvas) {
        ctx.save(); ctx.globalAlpha = this.preset.opacity; ctx.globalCompositeOperation = (clipped || L.alphaLock) ? 'source-atop' : (this.preset.blend || 'source-over');
        ctx.drawImage(this.stroke, 0, 0); ctx.restore();
      }
    };
    this.renderTime = performance.now();
    drawLayers(g, P.layers, this.res, this.z, P.w, P.h, hook, Math.min(1, this.z * dpr));
    g.restore();
    const picking = this.hover && this.pickMode() && !this.previewOn;
    if (picking) this.pickPreview = this.sampleAt(this.hover.sx, this.hover.sy);
    if (this.previewOn) return;
    for (const id of this.selection) { const L = P.layers.find(l => l.id === id); if (L && L.kind !== 'paint') this.drawHandles(g, L, id === this.primary && this.selection.size === 1); }
    if (this.marquee) { const m = this.marquee; g.save(); g.strokeStyle = '#e0533d'; g.setLineDash([4, 3]); g.fillStyle = 'rgba(224,83,61,0.08)'; const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1); g.fillRect(x, y, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0)); g.strokeRect(x, y, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0)); g.restore(); }
    if (!this.hover && this.sizeFlash && performance.now() - this.sizeFlash < 650) { const r = this.preset.size / 2 * this.z; g.save(); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5; g.beginPath(); g.arc(this.vw / 2, this.vh / 2, Math.max(2, r), 0, 7); g.stroke(); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(this.vw / 2, this.vh / 2, Math.max(2, r) + 1.5, 0, 7); g.stroke(); g.restore(); }
    if (this.hover && ['brush', 'eraser', 'blend'].includes(this.tool)) {
      const b = this.preset, r = b.size / 2 * this.z, h = this.hover;
      g.save();
      if (picking) { g.restore(); } else {
      const shaped = ['square', 'triangle', 'diamond', 'star', 'heart', 'fan', 'flat'].includes(b.tip) && r > 3;
      const outline = (rr) => { if (!shaped) { g.beginPath(); g.arc(h.sx, h.sy, rr, 0, 7); return; } g.save(); g.translate(h.sx, h.sy); g.rotate((b.angle || 0) * Math.PI / 180); g.scale(b.tip === 'flat' ? Math.max(0.08, b.round ?? 0.25) : 1, b.tip === 'flat' ? 1 : Math.max(0.08, b.round ?? 1)); shapePath(g, b.tip === 'flat' ? 'square' : b.tip, rr); g.restore(); };
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; outline(Math.max(1.5, r)); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; outline(Math.max(1.5, r) + 1); g.stroke();
      if (this.showTool !== false) { g.translate(h.sx, h.sy); drawTool(g, b.tool, b.engine === 'erase' ? '#ddd' : b.kind === 'blend' ? '#d9d2c3' : this.color, b.size * this.z, this.lean || 0); }
      g.restore();
      }
    }
    if (picking && this.pickPreview) this.drawLoupe(g, this.hover.sx, this.hover.sy);
  }
  // the color under the cursor: from everything you see, or only the selected layer
  sampleAt(sx, sy) {
    const n = Math.max(1, this.pickSize | 0), hlf = (n - 1) / 2;
    let d;
    const L = this.active;
    if (this.pickFrom === 'layer' && L && this.res[L.id] && (L.kind === 'paint')) {
      const x = Math.floor((sx - this.px) / this.z), y = Math.floor((sy - this.py) / this.z);
      if (x < 0 || y < 0 || x >= this.page.w || y >= this.page.h) return null;
      d = this.res[L.id].getContext('2d').getImageData(Math.max(0, x - hlf), Math.max(0, y - hlf), n, n).data;
    } else {
      const dpr = devicePixelRatio || 1, x = Math.round(sx * dpr), y = Math.round(sy * dpr);
      if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return null;
      d = this.canvas.getContext('2d', { willReadFrequently: true }).getImageData(Math.max(0, x - Math.round(hlf * dpr)), Math.max(0, y - Math.round(hlf * dpr)), Math.max(1, Math.round(n * dpr)), Math.max(1, Math.round(n * dpr))).data;
    }
    let r = 0, gg = 0, b = 0, a = 0;
    for (let i = 0; i < d.length; i += 4) { const w = d[i + 3]; r += d[i] * w; gg += d[i + 1] * w; b += d[i + 2] * w; a += w; }
    if (!a) return null; // see-through spot on a layer
    return '#' + [r / a, gg / a, b / a].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  drawLoupe(g, x, y) {
    const R = 46, w = 13;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 10;
    g.lineWidth = w;
    g.strokeStyle = this.pickPreview; g.beginPath(); g.arc(x, y, R, Math.PI, 0); g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = this.color; g.beginPath(); g.arc(x, y, R, 0, Math.PI); g.stroke();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x, y, R + w / 2, 0, 7); g.stroke(); g.beginPath(); g.arc(x, y, R - w / 2, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y); g.moveTo(x, y - 7); g.lineTo(x, y + 7); g.stroke();
    g.font = '600 11px system-ui, sans-serif'; g.textAlign = 'center';
    const tx = this.pickPreview.toUpperCase(), tw = g.measureText(tx).width + 10;
    g.fillStyle = 'rgba(20,20,22,0.85)'; g.beginPath(); g.roundRect(x - tw / 2, y + R + 12, tw, 18, 6); g.fill();
    g.fillStyle = '#fff'; g.fillText(tx, x, y + R + 25);
    g.restore();
  }

  itemCorners(L) {
    const s = itemSize(L), sc = L.scale || 1, w = s.w * sc / 2, h = s.h * sc / 2, c = Math.cos(L.rot || 0), sn = Math.sin(L.rot || 0);
    return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => [L.x + x * c - y * sn, L.y + x * sn + y * c]);
  }
  drawHandles(g, L, full) {
    const pts = this.itemCorners(L).map(([x, y]) => [this.px + x * this.z, this.py + y * this.z]);
    g.save(); g.strokeStyle = L.locked ? '#888' : '#d13b3b'; g.lineWidth = 1.5; g.setLineDash([5, 4]);
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.stroke();
    g.setLineDash([]); g.fillStyle = '#fff';
    if (L.locked) { g.fillStyle = '#888'; g.font = '14px sans-serif'; g.fillText('🔒', pts[1][0] + 4, pts[1][1] - 4); g.restore(); return; }
    if (full) {
      for (const p of pts) { g.beginPath(); g.rect(p[0] - 5, p[1] - 5, 10, 10); g.fill(); g.stroke(); }
      const rh = this.rotHandle(L);
      g.beginPath(); g.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2); g.lineTo(rh[0], rh[1]); g.stroke();
      g.beginPath(); g.arc(rh[0], rh[1], 7, 0, 7); g.fill(); g.stroke();
    }
    g.restore();
  }
  rotHandle(L) {
    const pts = this.itemCorners(L), mx = (pts[0][0] + pts[1][0]) / 2, my = (pts[0][1] + pts[1][1]) / 2;
    const a = (L.rot || 0) - Math.PI / 2;
    return [this.px + mx * this.z + Math.cos(a) * 28, this.py + my * this.z + Math.sin(a) * 28];
  }
  hitItem(p, includeLocked) {
    for (let i = this.page.layers.length - 1; i >= 0; i--) {
      const L = this.page.layers[i];
      if (!L.visible || (L.locked && !includeLocked) || L.kind === 'paint') continue;
      const s = itemSize(L), sc = L.scale || 1, dx = p.x - L.x, dy = p.y - L.y, c = Math.cos(-(L.rot || 0)), sn = Math.sin(-(L.rot || 0));
      const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
      if (Math.abs(lx) <= s.w * sc / 2 && Math.abs(ly) <= s.h * sc / 2) return L;
    }
    return null;
  }

  // ---------- pointer ----------
  bindPointer() {
    const c = this.canvas;
    let pan = null, stroke = null, xf = null, lastMove = null, zoomDrag = null, picking = false, down = null;
    c.addEventListener('pointerdown', e => {
      try { c.setPointerCapture(e.pointerId); } catch (_) { }
      const p = this.toPage(e), rc = c.getBoundingClientRect();
      if (e.button === 1 || this.tool === 'hand' || this.space) { pan = { x: e.clientX, y: e.clientY, px: this.px, py: this.py }; this.stage.style.cursor = 'grabbing'; return; }
      if (e.button !== 0) return; // the right button does nothing here, so no menus pop up
      this.altDown = e.altKey;
      // hold Z: click to zoom in (Alt + click out), drag left or right to zoom smoothly
      if (this.zDown) { zoomDrag = { x: e.clientX, sx: e.clientX - rc.left, sy: e.clientY - rc.top, z0: this.z, moved: false, out: e.altKey }; return; }
      // double-click (or double-tap) opens the quick menu; the dot the first click made is taken back
      const now = performance.now(), lt = this.lastTap;
      if (this.dblMenu !== false && lt && now - lt.t < 420 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 12 && lt.type === e.pointerType && !['text', 'pick'].includes(lt.tool) && !this.pickMode()) {
        this.lastTap = null; down = null;
        if (lt.entries.length && this.undo.length === lt.undoLen + lt.entries.length && this.undo[this.undo.length - 1] === lt.entries[lt.entries.length - 1]) {
          for (let i = lt.entries.length - 1; i >= 0; i--) { const en = this.undo.pop(); this.applyEntry(en, -1); if (en.before?.width) en.before.width = 0; if (en.after?.width) en.after.width = 0; }
          this.changed(); this.updUndo(); this.renderPanels();
        }
        this.quickMenu(e.clientX, e.clientY); return;
      }
      down = { t: now, x: e.clientX, y: e.clientY, type: e.pointerType, undoLen: this.undo.length, tool: this.tool, far: false };
      this.closeQuick();
      if (this.pickMode()) { picking = true; this.hover = { sx: e.clientX - rc.left, sy: e.clientY - rc.top }; this.draw(); return; }
      if (['brush', 'eraser', 'blend'].includes(this.tool)) { stroke = this.beginStroke(e, p); return; }
      if (this.tool === 'fill') { this.fill(p); return; }
      if (this.tool === 'text') { const hit = this.hitItem(p); if (hit && hit.kind === 'text') { this.setTool('move'); this.selectOnly(hit.id); } else this.addText(p); return; }
      if (this.tool === 'move') {
        const r = c.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
        const sel = this.selection.size === 1 ? this.page.layers.find(l => l.id === this.primary && !l.locked && l.kind !== 'paint') : null;
        if (sel) {
          const rh = this.rotHandle(sel);
          if (Math.hypot(sx - rh[0], sy - rh[1]) < 12) { xf = { mode: 'rot', L: sel, before: clone(this.page.layers) }; return; }
          const corners = this.itemCorners(sel).map(([x, y]) => [this.px + x * this.z, this.py + y * this.z]);
          if (corners.some(q => Math.hypot(sx - q[0], sy - q[1]) < 10)) { xf = { mode: 'scale', L: sel, d0: Math.hypot(p.x - sel.x, p.y - sel.y), s0: sel.scale || 1, before: clone(this.page.layers) }; return; }
        }
        if (this.moveMode === 'layer') {
          const L = this.active;
          if (L && L.kind === 'paint' && !L.locked) { const pg = this.pre.getContext('2d'); pg.globalCompositeOperation = 'copy'; pg.drawImage(this.res[L.id], 0, 0); xf = { mode: 'paint', L, x0: p.x, y0: p.y }; }
          else toast(L && L.locked ? 'This layer is locked.' : 'Pick a drawing layer to move.');
          return;
        }
        const hit = this.hitItem(p, true);
        if (hit) {
          if (e.shiftKey || e.ctrlKey) { this.selection.has(hit.id) ? this.selection.delete(hit.id) : this.selection.add(hit.id); this.primary = hit.id; }
          else if (!this.selection.has(hit.id)) this.selectOnly(hit.id);
          else this.primary = hit.id;
          this.activeId = hit.id;
          if (hit.locked) { toast('This one is locked. Unlock it in Layers to move it.'); this.renderPanels(); this.dirty = true; return; }
          const items = this.selItems.filter(l => !l.locked);
          xf = { mode: 'move', items: items.map(l => ({ L: l, ox: p.x - l.x, oy: p.y - l.y })), before: clone(this.page.layers) };
          this.renderPanels(); this.dirty = true;
        } else {
          if (!e.shiftKey) this.selection.clear();
          this.marquee = { x0: sx, y0: sy, x1: sx, y1: sy, add: e.shiftKey };
          this.renderPanels(); this.dirty = true;
        }
      }
    });
    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (lastMove) { const vx = sx - lastMove.x; this.lean = (this.lean || 0) * 0.85 + Math.max(-0.25, Math.min(0.25, vx * 0.01)) * 0.15; }
      lastMove = { x: sx, y: sy }; this.lastInput = performance.now();
      this.hover = { sx, sy }; this.dirty = true;
      if (down && !down.far && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.far = true;
      if (!e.buttons && this.altDown !== e.altKey) { this.altDown = e.altKey; this.updCursor(); }
      if (zoomDrag) { const dx = e.clientX - zoomDrag.x; if (Math.abs(dx) > 4) zoomDrag.moved = true; if (zoomDrag.moved) this.zoomTo(zoomDrag.z0 * Math.exp(dx * 0.012), zoomDrag.sx, zoomDrag.sy); return; }
      if (picking) return;
      if (pan) { this.px = pan.px + e.clientX - pan.x; this.py = pan.py + e.clientY - pan.y; return; }
      if (stroke) { let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; if (!evs.length) evs = [e]; for (const ev of evs) this.strokeMove(stroke, ev); return; }
      if (this.marquee) { this.marquee.x1 = sx; this.marquee.y1 = sy; return; }
      if (xf) {
        const p = this.toPage(e), L = xf.L;
        if (xf.mode === 'move') for (const it of xf.items) { it.L.x = p.x - it.ox; it.L.y = p.y - it.oy; }
        if (xf.mode === 'scale') L.scale = Math.max(0.02, xf.s0 * Math.hypot(p.x - L.x, p.y - L.y) / (xf.d0 || 1));
        if (xf.mode === 'rot') { let a = Math.atan2(p.y - L.y, p.x - L.x) + Math.PI / 2; if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); L.rot = a; }
        if (xf.mode === 'paint') { const ctx = this.layerCtx(L); ctx.save(); ctx.globalCompositeOperation = 'copy'; ctx.drawImage(this.pre, Math.round(p.x - xf.x0), Math.round(p.y - xf.y0)); ctx.restore(); }
      }
    });
    const up = e => {
      if (zoomDrag) { if (!zoomDrag.moved) this.zoomBy(zoomDrag.out || e.altKey ? 0.5 : 2, zoomDrag.sx, zoomDrag.sy); zoomDrag = null; }
      if (picking) { picking = false; const rc = c.getBoundingClientRect(); this.hover = { sx: e.clientX - rc.left, sy: e.clientY - rc.top }; this.draw(); this.commitPick(); }
      if (pan) { pan = null; this.updCursor(); }
      if (stroke) { this.endStroke(stroke); stroke = null; }
      if (this.marquee) {
        const m = this.marquee; this.marquee = null;
        const a = this.toPage({ clientX: Math.min(m.x0, m.x1) + c.getBoundingClientRect().left, clientY: Math.min(m.y0, m.y1) + c.getBoundingClientRect().top });
        const b = this.toPage({ clientX: Math.max(m.x0, m.x1) + c.getBoundingClientRect().left, clientY: Math.max(m.y0, m.y1) + c.getBoundingClientRect().top });
        if (Math.abs(m.x1 - m.x0) > 4 || Math.abs(m.y1 - m.y0) > 4) for (const L of this.page.layers) {
          if (L.kind === 'paint' || !L.visible) continue;
          const cs = this.itemCorners(L), xs = cs.map(q => q[0]), ys = cs.map(q => q[1]);
          if (Math.max(...xs) >= a.x && Math.min(...xs) <= b.x && Math.max(...ys) >= a.y && Math.min(...ys) <= b.y) { this.selection.add(L.id); this.primary = L.id; }
        }
        this.renderPanels(); this.dirty = true;
      }
      if (xf) {
        if (xf.mode === 'paint') { this.pushPaint(xf.L, [0, 0, this.page.w, this.page.h], 'Move drawing'); this.dirtyLayers.add(xf.L.id); }
        else this.pushState(xf.before, xf.mode === 'move' ? 'Move' : xf.mode === 'rot' ? 'Rotate' : 'Resize');
        xf = null; this.changed(); this.renderPanels();
      }
      if (down && e.type === 'pointerup') {
        const quick = !down.far && performance.now() - down.t < 320, n = this.undo.length - down.undoLen;
        this.lastTap = quick && n >= 0 && n <= 2 ? { ...down, t: performance.now(), entries: this.undo.slice(down.undoLen) } : null;
      } else this.lastTap = null;
      down = null;
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { this.hover = null; this.dirty = true; });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      if (e.altKey) { // quick resize: Alt + scroll is size, Alt + Shift + scroll is strength
        const p = this.preset, up = (e.deltaY || e.deltaX) < 0;
        if (e.shiftKey) this.setBrushProp('opacity', Math.max(0.02, Math.min(1, p.opacity + (up ? 0.04 : -0.04))), true);
        else this.setBrushProp('size', Math.max(1, Math.min(600, p.size * (up ? 1.1 : 1 / 1.1))), true);
        this.updDock(); this.flashSize(); clearTimeout(this.rpT); this.rpT = setTimeout(() => this.renderPanels(), 500); return;
      }
      if (e.shiftKey) { this.px -= e.deltaY; this.dirty = true; return; }
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
    // drop stickers from the tray right where you want them
    this.stage.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-shesketches-asset')) { e.preventDefault(); this.stage.classList.add('drop-on'); } });
    this.stage.addEventListener('dragleave', () => this.stage.classList.remove('drop-on'));
    this.stage.addEventListener('drop', async e => {
      this.stage.classList.remove('drop-on');
      const id = e.dataTransfer.getData('application/x-shesketches-asset'); if (!id) return;
      e.preventDefault(); const a = await db.get('assets', id); if (a) this.addImageAsset(a, this.toPage(e));
    });
  }
  selectOnly(id) { this.selection = new Set(id ? [id] : []); this.primary = id; if (id) this.activeId = id; this.renderPanels(); this.dirty = true; }

  beginStroke(e, p) {
    let L = this.active;
    if (!L || L.kind !== 'paint' || !L.visible) {
      if (this.tool === 'eraser') { toast('Pick a drawing layer to erase on.'); return null; }
      L = this.addPaintLayer(true);
    }
    if (L.locked) { toast('This layer is locked. Click the lock in Layers to unlock it.'); return null; }
    const b = this.preset, ctx = this.layerCtx(L);
    const pg = this.pre.getContext('2d'); pg.globalCompositeOperation = 'copy'; pg.drawImage(this.res[L.id], 0, 0); pg.globalCompositeOperation = 'source-over';
    const direct = b.engine === 'erase' || b.engine === 'paint';
    this.strokeCtx.clearRect(0, 0, this.page.w, this.page.h);
    this.strokeOnCanvas = !direct;
    // what the paint brush mixes with: this layer as it was before the stroke, plus (by default) everything under it
    let sampleSrc = this.pre;
    if (b.engine === 'paint' && b.sampleAll !== false) {
      const i = this.page.layers.indexOf(L);
      if (i > 0) {
        this.belowC ||= mk(this.page.w, this.page.h);
        const bg = this.belowC.getContext('2d'); bg.clearRect(0, 0, this.page.w, this.page.h);
        drawLayers(bg, this.page.layers.slice(0, i), this.res, 1, this.page.w, this.page.h);
        bg.drawImage(this.pre, 0, 0);
        sampleSrc = this.belowC;
      }
    }
    const paper = paperOf(this.page, this.book).type;
    const color = b.kind === 'blend' ? '#808080' : this.color;
    const s = new Stroke(b, direct ? ctx : this.strokeCtx, { color, paper: paper === 'custom' ? 'sketch' : paper, layerCtx: ctx, sampleSrc, heightCtx: this.strokeCtx, alphaLock: !!L.alphaLock, grainScale: Math.max(0.5, Math.min(this.page.w, this.page.h) / 1700) });
    this.stroking = true;
    const st = { s, L, sm: null, direct, name: b.name };
    this.strokeMove(st, e);
    return st;
  }
  strokeMove(st, e) {
    if (!st) return;
    const p = this.toPage(e), b = this.preset;
    let pr = e.pointerType === 'mouse' ? 0.6 : (e.pressure || 0.5);
    if (e.pointerType === 'pen' && e.pressure === 0) return;
    const k = Math.min(0.95, b.smooth || 0);
    st.sm = st.sm ? { x: st.sm.x + (p.x - st.sm.x) * (1 - k), y: st.sm.y + (p.y - st.sm.y) * (1 - k), p: st.sm.p + (pr - st.sm.p) * 0.5 } : { x: p.x, y: p.y, p: pr };
    st.s.add({ ...st.sm });
    this.dirty = true;
  }
  endStroke(st) {
    if (!st) return;
    this.stroking = false;
    const { s, L } = st, b = this.preset;
    const ctx = this.layerCtx(L);
    s.finish(ctx);
    const bb = s.bbox;
    const x0 = Math.max(0, Math.floor(bb[0]) - 4), y0 = Math.max(0, Math.floor(bb[1]) - 4), x1 = Math.min(this.page.w, Math.ceil(bb[2]) + 4), y1 = Math.min(this.page.h, Math.ceil(bb[3]) + 4);
    if (x1 <= x0 || y1 <= y0) { this.dirty = true; return; }
    if (!st.direct) {
      if (b.engine === 'water') watercolorFinish(this.stroke, [x0, y0, x1, y1], b.wetEdge ?? 0.7);
      const i = this.page.layers.indexOf(L);
      ctx.save(); ctx.globalAlpha = b.opacity; ctx.globalCompositeOperation = L.alphaLock ? 'source-atop' : (b.blend || 'source-over');
      ctx.drawImage(this.stroke, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0); ctx.restore();
      this.strokeCtx.clearRect(x0, y0, x1 - x0, y1 - y0);
    }
    this.pushPaint(L, [x0, y0, x1 - x0, y1 - y0], st.name);
    this.dirtyLayers.add(L.id); (this.thumbVer ||= {})[L.id] = (this.thumbVer[L.id] || 0) + 1;
    if (b.kind === 'draw' && !this.recent.includes(this.color)) { this.recent = [this.color, ...this.recent].slice(0, 12); setSetting('recentColors', this.recent); }
    this.changed(); this.dirty = true; this.renderLayersOnly();
  }

  // take the color under the cursor (the loupe already shows it)
  commitPick() {
    const c = this.pickPreview;
    if (!c) { toast('Nothing to pick there. Try a spot with color on it.'); return; }
    this.userColor = true; this.noteColor(c); this.setColor(c);
    if (this.tool === 'pick' && !this.pickStay) this.setTool(this.prevTool && this.prevTool !== 'pick' ? this.prevTool : 'brush');
  }
  noteColor(c) { if (!this.recent.includes(c)) { this.recent = [c, ...this.recent].slice(0, 12); setSetting('recentColors', this.recent); } }
  async pickFromScreen() {
    if (!('EyeDropper' in window)) return toast('This browser cannot pick from the whole screen. Use Pick color (I) on the page instead.');
    try { const r = await new window.EyeDropper().open(); const c = r.sRGBHex.length === 7 ? r.sRGBHex.toLowerCase() : null; if (c) { this.userColor = true; this.noteColor(c); this.setColor(c); toast('Took ' + c + '.'); } } catch (_) { }
  }
  copyHex(c = this.color) { navigator.clipboard?.writeText(c).then(() => toast('Copied ' + c + '.'), () => toast(c)); }
  fill(p) {
    let L = this.active; if (!L || L.kind !== 'paint') L = this.addPaintLayer(true);
    if (L.locked) return toast('This layer is locked.');
    const pg = this.pre.getContext('2d'); pg.globalCompositeOperation = 'copy'; pg.drawImage(this.res[L.id], 0, 0);
    const rect = floodFill(this.layerCtx(L), p.x, p.y, this.color, this.fillTol ?? 32);
    if (rect) { this.pushPaint(L, [rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]], 'Fill'); this.dirtyLayers.add(L.id); this.changed(); this.dirty = true; this.renderLayersOnly(); }
  }

  // ---------- undo ----------
  pushPaint(L, rect, label = 'Paint') {
    const [x, y, w, h] = rect, before = mk(w, h);
    before.getContext('2d').drawImage(this.pre, x, y, w, h, 0, 0, w, h);
    this.undo.push({ kind: 'paint', id: L.id, rect, before, after: null, label: label + ' on ' + L.name }); this.dropRedo();
    this.trimUndo();
    this.updUndo();
  }
  dropRedo() { for (const en of this.redo) { if (en.before?.width) en.before.width = 0; if (en.after?.width) en.after.width = 0; } this.redo = []; }
  // keep undo memory in check so drawing stays fast however long you work
  trimUndo() {
    const px = en => en.kind === 'paint' ? en.rect[2] * en.rect[3] * (en.after ? 2 : 1) : en.paint ? Object.values(en.paint.before).concat(Object.values(en.paint.after)).reduce((s, c) => s + c.width * c.height, 0) : 0;
    let total = this.undo.reduce((s, en) => s + px(en), 0);
    const limit = 90e6; // about 360 MB of pixels
    while ((this.undo.length > 100 || total > limit) && this.undo.length > 5) { const en = this.undo.shift(); total -= px(en); if (en.before?.width) en.before.width = 0; }
  }
  pushState(before, label = 'Change') { this.undo.push({ kind: 'state', before, after: clone(this.page.layers), label }); this.dropRedo(); this.trimUndo(); this.updUndo(); }
  applyEntry(en, dir) {
    if (en.kind === 'paint') {
      if (!this.res[en.id]) return;
      const [x, y, w, h] = en.rect, c = this.res[en.id].getContext('2d');
      if (dir < 0 && !en.after) { en.after = mk(w, h); en.after.getContext('2d').drawImage(this.res[en.id], x, y, w, h, 0, 0, w, h); }
      c.save(); c.globalCompositeOperation = 'copy'; c.drawImage(dir < 0 ? en.before : en.after, 0, 0, w, h, x, y, w, h); c.restore();
      this.dirtyLayers.add(en.id);
    } else {
      this.page.layers = clone(dir < 0 ? en.before : en.after);
      if (en.paint) for (const [id, c] of Object.entries(dir < 0 ? en.paint.before : en.paint.after)) { const t = mk(c.width, c.height); t.getContext('2d').drawImage(c, 0, 0); this.res[id] = t; this.dirtyLayers.add(id); }
      if (!this.page.layers.find(l => l.id === this.activeId)) this.activeId = this.page.layers[this.page.layers.length - 1]?.id;
      for (const id of [...this.selection]) if (!this.page.layers.find(l => l.id === id)) this.selection.delete(id);
      this.page.layers.forEach(l => this.ensureRes(l).then(() => this.dirty = true));
    }
  }
  doUndo() { const en = this.undo.pop(); if (!en) return toast('Nothing to undo.'); this.applyEntry(en, -1); this.redo.push(en); this.changed(); this.renderPanels(); this.updUndo(); this.dirty = true; }
  doRedo() { const en = this.redo.pop(); if (!en) return toast('Nothing to redo.'); this.applyEntry(en, 1); this.undo.push(en); this.changed(); this.renderPanels(); this.updUndo(); this.dirty = true; }
  jumpHistory(n) { // n = how many steps to keep
    while (this.undo.length > n) { const en = this.undo.pop(); this.applyEntry(en, -1); this.redo.push(en); }
    while (this.undo.length < n && this.redo.length) { const en = this.redo.pop(); this.applyEntry(en, 1); this.undo.push(en); }
    this.changed(); this.renderPanels(); this.updUndo(); this.dirty = true;
  }

  // ---------- layers ----------
  newLayerData(name) { return { id: uid('l_'), name: name || 'Layer ' + (this.page.layers.length + 1), kind: 'paint', visible: true, opacity: 1, blend: 'source-over', locked: false, alphaLock: false, clip: false, blob: null }; }
  addPaintLayer(silent, name) {
    const before = clone(this.page.layers);
    const L = this.newLayerData(name);
    const i = this.page.layers.findIndex(l => l.id === this.activeId);
    this.page.layers.splice(i + 1, 0, L);
    this.res[L.id] = mk(this.page.w, this.page.h);
    this.dirtyLayers.add(L.id);
    this.activeId = L.id; this.pushState(before, 'New layer');
    if (silent) toast('Added a new drawing layer for you.');
    this.changed(); this.renderPanels(); return L;
  }
  // ---------- quick menu ----------
  closeQuick() { const q = document.querySelector('.quick-menu'); if (q) { q.remove(); document.removeEventListener('pointerdown', this.quickAway, true); return true; } return false; }
  quickMenu(x, y) {
    this.closeQuick();
    const p = this.preset;
    const q = el('div', { class: 'quick-menu', role: 'dialog', 'aria-label': 'Quick menu' });
    const tools = el('div', { class: 'qm-tools' }, ...TOOLS_UI.filter(t => t[0] !== 'hand').map(([id, label, key, icon]) => el('button', { class: 'qm-tool' + (this.tool === id ? ' on' : ''), title: `${label} (${key})`, onclick: () => { this.setTool(id); this.quickMenu(x, y); } }, icon)));
    const acts = el('div', { class: 'qm-acts' },
      el('button', { class: 'btn small', title: 'Undo (Ctrl+Z)', disabled: !this.undo.length, onclick: () => { this.doUndo(); } }, '↶ Undo'),
      el('button', { class: 'btn small', title: 'Redo (Ctrl+Shift+Z)', disabled: !this.redo.length, onclick: () => { this.doRedo(); } }, '↷ Redo'),
      el('button', { class: 'btn small', title: 'Swap colors (X)', onclick: () => { this.swapColors(); this.quickMenu(x, y); } }, '⇄'),
      el('button', { class: 'btn small', title: 'Color wheel (C)', onclick: () => this.colorPop(x, y) }, '◕ Wheel'),
      el('button', { class: 'btn small', title: 'Pick a color from the page (I, or hold Alt)', onclick: () => { this.closeQuick(); this.setTool('pick'); } }, '⌖'),
      el('button', { class: 'btn small', title: 'Stickers tray (K)', onclick: () => { this.closeQuick(); this.toggleTray(); } }, '★'));
    const zl = el('span', { class: 'qv' }, Math.round(this.z * 100) + '%');
    const zb = (label, title, fn) => el('button', { class: 'btn small', title, onclick: () => { fn(); zl.textContent = Math.round(this.z * 100) + '%'; } }, label);
    const zoomRow = el('div', { class: 'qm-acts qm-zoom' }, el('span', { class: 'ql' }, 'Zoom'),
      zb('−', 'Zoom out (-)', () => this.zoomBy(0.8)), zl, zb('+', 'Zoom in (+)', () => this.zoomBy(1.25)),
      zb('Fit', 'Fit page (0)', () => this.fit()), zb('100%', '100% (1)', () => this.zoomTo(1)), zb('200%', '200% (2)', () => this.zoomTo(2)));
    const sliders = el('div', { class: 'qm-sliders' });
    if (['brush', 'blend', 'eraser'].includes(this.tool)) {
      for (const d of paramsFor(p.engine)) {
        if (d.type) continue;
        const v = p[d.k] ?? 0, fmt = d.unit === 'px' ? x => Math.round(x) : d.unit === '°' ? x => Math.round(x) + '°' : d.pct ? x => Math.round(x * 100 / (d.pct === 0.5 ? 2 : 1)) + '%' : x => Math.round(x);
        const val = el('span', { class: 'qv' }, fmt(v));
        const r = el('input', { type: 'range', min: d.min, max: d.max, step: d.step, value: v, 'aria-label': d.label });
        r.addEventListener('input', () => { this.setBrushProp(d.k, +r.value, true); val.textContent = fmt(+r.value); this.updDock(); if (d.k === 'size') this.flashSize(); });
        r.addEventListener('change', () => r.blur());
        sliders.append(el('label', { class: 'qs', title: d.help }, el('span', { class: 'ql' }, d.short || d.label), r, val));
      }
    }
    const sw = list => el('div', { class: 'qm-sw' }, list.slice(0, 12).map(c => el('button', { class: 'sw' + (c === this.color ? ' on' : ''), style: { background: c }, title: c, onclick: () => { this.userColor = true; this.setColor(c); this.quickMenu(x, y); } })));
    const recentB = (this.recentBrushes || []).map(id => this.brushes.find(b => b.id === id)).filter(Boolean).slice(0, 6);
    q.append(el('div', { class: 'qm-head' }, el('b', {}, this.tool === 'brush' || this.tool === 'blend' || this.tool === 'eraser' ? p.name : (TOOLS_UI.find(t => t[0] === this.tool) || [, ''])[1]), el('button', { class: 'icon-btn tiny', title: 'Close (Esc)', onclick: () => this.closeQuick() }, '✕')),
      tools, acts, zoomRow, sliders);
    if (recentB.length) q.append(el('div', { class: 'qm-lbl' }, 'Recent brushes'), el('div', { class: 'qm-brushes' }, recentB.map(b => el('button', { class: 'btn small' + (b.id === p.id ? ' lit' : ''), onclick: () => { const t = b.kind === 'blend' ? 'blend' : b.kind === 'erase' ? 'eraser' : 'brush'; if (t !== this.tool) this.setTool(t); this.curId = b.id; this.renderPanels(); this.quickMenu(x, y); } }, b.name))));
    if (this.tool !== 'eraser') q.append(el('div', { class: 'qm-lbl' }, 'Colors'), sw([this.color, this.color2, ...this.recent.filter(c => c !== this.color && c !== this.color2), ...PALETTE].filter((c, i, a) => a.indexOf(c) === i)));
    q.append(el('div', { class: 'qm-tip muted small' }, check('Double-click opens this menu', this.dblMenu !== false, v => { this.dblMenu = v; setSetting('dblMenu', v); }), 'Q also opens it. Alt + scroll changes the size.'));
    document.body.append(q);
    const W = q.offsetWidth, H = q.offsetHeight;
    q.style.left = Math.max(8, Math.min(innerWidth - W - 8, x - W / 2)) + 'px'; q.style.top = Math.max(8, Math.min(innerHeight - H - 8, y - 30)) + 'px';
    this.quickAway = ev => { if (!q.contains(ev.target)) this.closeQuick(); };
    setTimeout(() => document.addEventListener('pointerdown', this.quickAway, true), 0);
  }
  // the color wheel as a popup near the cursor or the color chip
  colorPop(x, y) {
    this.closeQuick();
    const q = el('div', { class: 'quick-menu cpop', role: 'dialog', 'aria-label': 'Color wheel' });
    const hex = el('input', { type: 'text', class: 'hex', value: this.color, maxlength: 7, 'aria-label': 'Hex color' });
    const wheel = colorWheel({ value: this.color, size: 230,
      onInput: c => { this.color = c; this.userColor = true; hex.value = c; this.chip.style.background = c; this.dirty = true; },
      onChange: c => { this.userColor = true; hex.value = c; this.setColor(c); } });
    hex.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { const c = hex.value.toLowerCase(); this.userColor = true; this.setColor(c); wheel.set(c); } });
    const sw = list => el('div', { class: 'qm-sw' }, list.slice(0, 14).map(c => el('button', { class: 'sw' + (c === this.color ? ' on' : ''), style: { background: c }, title: c, onclick: () => { this.userColor = true; this.setColor(c); wheel.set(c); hex.value = c; } })));
    q.append(el('div', { class: 'qm-head' }, el('b', {}, 'Color'), el('button', { class: 'icon-btn tiny', title: 'Close (Esc)', onclick: () => this.closeQuick() }, '✕')),
      wheel,
      el('div', { class: 'qm-acts' }, hex,
        el('button', { class: 'btn small', title: 'Pick a color from the page (I, or hold Alt)', onclick: () => { this.closeQuick(); this.setTool('pick'); } }, '⌖ Pick'),
        'EyeDropper' in window ? el('button', { class: 'btn small', title: 'Take a color from anywhere on your screen, even outside this app', onclick: async () => { this.closeQuick(); await this.pickFromScreen(); } }, 'Screen') : null,
        el('button', { class: 'btn small', title: 'Copy the hex code', onclick: () => this.copyHex() }, 'Copy'),
        el('button', { class: 'btn small', title: 'Swap with second color (X)', onclick: () => { this.swapColors(); wheel.set(this.color); hex.value = this.color; } }, '⇄')));
    if (this.recent.length) q.append(el('div', { class: 'qm-lbl' }, 'Recent'), sw(this.recent));
    if (this.myPalette.length) q.append(el('div', { class: 'qm-lbl' }, 'My palette'), sw(this.myPalette));
    q.append(el('div', { class: 'qm-tip muted small' }, 'Drag the ring to change the color, the square for how strong and how light. Press C to open this anywhere.'));
    document.body.append(q);
    const W = q.offsetWidth, H = q.offsetHeight;
    q.style.left = Math.max(8, Math.min(innerWidth - W - 8, x - W / 2)) + 'px'; q.style.top = Math.max(8, Math.min(innerHeight - H - 8, y)) + 'px';
    this.quickAway = ev => { if (!q.contains(ev.target)) this.closeQuick(); };
    setTimeout(() => document.addEventListener('pointerdown', this.quickAway, true), 0);
  }
  flashSize() { this.sizeFlash = performance.now(); this.dirty = true; clearTimeout(this.sfT); this.sfT = setTimeout(() => { this.dirty = true; }, 700); }

  toggleTray() {
    const was = this.stage.querySelector('.sticker-tray'); if (was) { was.remove(); return; }
    this.stage.append(pieceTray({ onPick: a => this.addImageAsset(a), onNew: done => this.app.openFactory(null, a => { this.addImageAsset(a); done(); }) }));
  }
  async addImageAsset(a, at) {
    const before = clone(this.page.layers), P = this.page;
    const s = Math.min(1, (P.w * 0.6) / a.w, (P.h * 0.6) / a.h);
    const L = { id: uid('l_'), name: a.name || 'Image', kind: 'image', src: a.blob, asset: a.id, media: a.media || null, iw: a.w, ih: a.h, x: at ? at.x : P.w / 2, y: at ? at.y : P.h / 2, fx: a.kind === 'sticker' ? { finish: 'satin', finishAmt: 0.35 } : null, scale: s, rot: (a.kind === 'sticker' || a.kind === 'made') ? (Math.random() - 0.5) * 0.12 : 0, visible: true, opacity: 1, blend: 'source-over', locked: false, filter: {}, shadow: { on: a.kind === 'sticker' || a.kind === 'made', blur: 10, dx: 4, dy: 6, color: '#000000', a: 0.3 } };
    this.res[L.id] = await mediaRes(L);
    if (!this.res[L.id]) return toast('This file could not be opened.', 'err');
    const i = this.page.layers.findIndex(l => l.id === this.activeId);
    this.page.layers.splice(i + 1, 0, L);
    this.updAnim();
    this.activeId = L.id; this.pushState(before, 'Add ' + L.name);
    this.setTool('move'); this.selectOnly(L.id); this.changed();
    if (L.media === 'gif' || L.media === 'video') toast('Moving media plays in the book view, flip-through videos and GIF exports. Still exports use the frame you pick.');
  }
  updAnim() { this.hasAnim = this.page.layers.some(l => l.kind === 'image' && l.visible && isAnimated(this.res[l.id])); }
  addText(p) {
    const before = clone(this.page.layers);
    const L = { id: uid('l_'), name: 'Text', kind: 'text', text: 'Write here', font: 'Ink Free', size: Math.round(this.page.h * 0.035), color: this.color, align: 'left', lineH: 1.25, weight: 400, italic: false, x: p.x, y: p.y, scale: 1, rot: 0, visible: true, opacity: 1, blend: 'source-over', locked: false, filter: {}, shadow: { on: false } };
    this.page.layers.push(L); this.activeId = L.id; this.pushState(before, 'Add text');
    this.setTool('move'); this.selectOnly(L.id); this.changed();
    setTimeout(() => { const ta = this.panel.querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } }, 50);
  }
  deleteSelected() {
    const ids = this.selection.size ? [...this.selection] : this.activeId ? [this.activeId] : [];
    const P = this.page, locked = ids.filter(id => P.layers.find(l => l.id === id)?.locked);
    const del = ids.filter(id => !locked.includes(id));
    if (!del.length) return toast(locked.length ? 'Locked layers are not deleted. Unlock them first.' : 'Nothing selected.');
    if (P.layers.length - del.length < 1) return toast('A page needs at least one layer.');
    const before = clone(P.layers), paintBefore = {};
    for (const id of del) { const L = P.layers.find(l => l.id === id); if (L.kind === 'paint') { const c = mk(P.w, P.h); c.getContext('2d').drawImage(this.res[id], 0, 0); paintBefore[id] = c; } }
    P.layers = P.layers.filter(l => !del.includes(l.id));
    const en = { kind: 'state', before, after: clone(P.layers), label: del.length > 1 ? `Delete ${del.length} layers` : 'Delete layer', paint: { before: paintBefore, after: {} } };
    this.undo.push(en); this.redo = []; this.updAnim(); this.updUndo();
    this.selection.clear(); this.primary = null;
    if (!P.layers.find(l => l.id === this.activeId)) this.activeId = P.layers[P.layers.length - 1].id;
    if (locked.length) toast(`${locked.length} locked layer(s) were kept.`);
    this.changed(); this.renderPanels(); this.dirty = true;
  }
  layerOp(op) {
    const P = this.page, i = P.layers.findIndex(l => l.id === this.activeId), L = P.layers[i];
    if (op === 'add') return this.addPaintLayer();
    if (!L) return;
    const before = clone(P.layers);
    let label = op;
    if (op === 'del') return this.deleteSelected();
    if (op === 'up') { if (i >= P.layers.length - 1) return; [P.layers[i], P.layers[i + 1]] = [P.layers[i + 1], P.layers[i]]; label = 'Move layer up'; }
    if (op === 'down') { if (i <= 0) return; [P.layers[i], P.layers[i - 1]] = [P.layers[i - 1], P.layers[i]]; label = 'Move layer down'; }
    if (op === 'dup') {
      const n = { ...clone(L), id: uid('l_'), name: L.name + ' copy', locked: false };
      if (L.kind === 'paint') { const c = mk(P.w, P.h); c.getContext('2d').drawImage(this.res[L.id], 0, 0); this.res[n.id] = c; this.dirtyLayers.add(n.id); n.blob = null; }
      else { this.res[n.id] = this.res[L.id]; n.x += 30; n.y += 30; }
      P.layers.splice(i + 1, 0, n); this.activeId = n.id; label = 'Duplicate layer';
    }
    if (op === 'clear') {
      if (L.kind !== 'paint') return toast('Clear works on drawing layers. Use Delete for pictures and text.');
      if (L.locked) return toast('This layer is locked.');
      const pg = this.pre.getContext('2d'); pg.globalCompositeOperation = 'copy'; pg.drawImage(this.res[L.id], 0, 0);
      this.layerCtx(L).clearRect(0, 0, P.w, P.h); this.pushPaint(L, [0, 0, P.w, P.h], 'Clear'); this.dirtyLayers.add(L.id); this.changed(); this.renderPanels(); this.dirty = true; return;
    }
    if (op === 'clip') { L.clip = !L.clip; label = L.clip ? 'Clip to layer below' : 'Unclip'; if (L.clip && i === 0) toast('Clipping needs a layer below this one.'); }
    if (op === 'alpha') { if (L.kind !== 'paint') return toast('This works on drawing layers.'); L.alphaLock = !L.alphaLock; label = L.alphaLock ? 'Protect transparent areas' : 'Stop protecting'; toast(L.alphaLock ? 'Now you can only paint where this layer already has paint.' : 'You can paint anywhere on this layer again.'); }
    if (op === 'hide') { L.visible = !L.visible; label = L.visible ? 'Show layer' : 'Hide layer'; this.updAnim(); }
    if (op === 'lock') { L.locked = !L.locked; label = L.locked ? 'Lock layer' : 'Unlock layer'; }
    if (op === 'merge' || op === 'rasterize' || op === 'mergeVisible') {
      if (op === 'mergeVisible') {
        const vis = P.layers.filter(l => l.visible); if (vis.length < 2) return toast('Show at least two layers to merge them.');
        const t = this.newLayerData('Merged'); const c = mk(P.w, P.h); drawLayers(c.getContext('2d'), vis, this.res, 1, P.w, P.h); this.res[t.id] = c;
        const at = P.layers.indexOf(vis[vis.length - 1]);
        const paintBefore = {}; for (const l of vis) if (l.kind === 'paint') paintBefore[l.id] = this.res[l.id];
        P.layers = P.layers.filter(l => !l.visible || l === vis[vis.length - 1]); P.layers.splice(P.layers.indexOf(vis[vis.length - 1]), 1, t);
        this.dirtyLayers.add(t.id); this.activeId = t.id;
        this.undo.push({ kind: 'state', before, after: clone(P.layers), label: 'Merge visible', paint: { before: paintBefore, after: { [t.id]: c } } }); this.redo = [];
        this.updUndo(); this.updAnim(); this.changed(); this.renderPanels(); this.dirty = true; return;
      }
      let target = op === 'merge' ? P.layers[i - 1] : null;
      if (op === 'merge' && (!target || target.kind !== 'paint')) return toast('Merge down needs a drawing layer under this one.');
      if (op === 'merge' && target.locked) return toast('The layer below is locked.');
      const paintBefore = {};
      if (target) { const c = mk(P.w, P.h); c.getContext('2d').drawImage(this.res[target.id], 0, 0); paintBefore[target.id] = c; }
      if (!target) { target = this.newLayerData(L.name + ' (drawn)'); this.res[target.id] = mk(P.w, P.h); P.layers.splice(i, 0, target); }
      const tg = this.res[target.id].getContext('2d'); tg.save(); drawLayer(tg, { ...L, visible: true }, this.res, 1); tg.restore();
      P.layers.splice(P.layers.indexOf(L), 1);
      const after = mk(P.w, P.h); after.getContext('2d').drawImage(this.res[target.id], 0, 0);
      this.dirtyLayers.add(target.id); this.activeId = target.id; this.selection.clear();
      this.undo.push({ kind: 'state', before, after: clone(P.layers), label: op === 'merge' ? 'Merge down' : 'Turn into drawing', paint: { before: paintBefore, after: { [target.id]: after } } }); this.redo = [];
      this.updUndo(); this.updAnim(); this.changed(); this.renderPanels(); this.dirty = true; return;
    }
    if (op === 'fillLayer') { if (L.kind !== 'paint' || L.locked) return toast('Pick an unlocked drawing layer.'); const pg = this.pre.getContext('2d'); pg.globalCompositeOperation = 'copy'; pg.drawImage(this.res[L.id], 0, 0); const c = this.layerCtx(L); c.save(); c.globalCompositeOperation = L.alphaLock ? 'source-atop' : 'source-over'; c.fillStyle = this.color; c.fillRect(0, 0, P.w, P.h); c.restore(); this.pushPaint(L, [0, 0, P.w, P.h], 'Fill layer'); this.dirtyLayers.add(L.id); this.changed(); this.renderPanels(); this.dirty = true; return; }
    this.pushState(before, label); this.changed(); this.renderPanels(); this.dirty = true;
  }
  moveLayer(id, toIndex) {
    const P = this.page, from = P.layers.findIndex(l => l.id === id); if (from < 0) return;
    const before = clone(P.layers), [L] = P.layers.splice(from, 1);
    P.layers.splice(Math.max(0, Math.min(P.layers.length, toIndex)), 0, L);
    this.pushState(before, 'Reorder layers'); this.changed(); this.renderPanels(); this.dirty = true;
  }
  setLayerProp(L, k, v, record = true) {
    const before = clone(this.page.layers); L[k] = v;
    if (record) this.pushState(before, 'Layer ' + k);
    this.changed(); this.dirty = true;
  }
  setColor(c) { this.color = c; setSetting('brushColor', c); this.renderPanels(); this.dirty = true; }
  setBrushProp(k, v, quiet) { const id = this.preset.id; (this.overrides[id] ||= {})[k] = v; setSetting('brushOverrides', this.overrides); this.dirty = true; if (!quiet) this.renderPanels(); }

  // ---------- panels ----------
  renderLayersOnly() { const box = this.panel.querySelector('.sec-layers'); if (!box) return; const fresh = this.layerSection(); box.replaceWith(fresh); }
  renderPanels() {
    if (!this.panel) return;
    this.updDock();
    const keepScroll = this.panel.scrollTop;
    const openState = {}; this.panel.querySelectorAll('details.sec').forEach(d => openState[d.dataset.k] = d.open);
    this.panel.innerHTML = '';
    const sec = (k, title, ...kids) => el('details', { class: 'sec', 'data-k': k, open: openState[k] ?? !['history', 'mix'].includes(k) }, el('summary', {}, title), ...kids);
    this.sec = sec;
    const items = this.selItems;
    if (this.tool === 'move') {
      this.panel.append(sec('move', 'Select & move', ...this.moveControls()));
      if (items.length === 1) this.panel.append(sec('item', items[0].kind === 'text' ? 'Text' : 'Picture', ...this.itemControls(items[0])));
    }
    if (['brush', 'eraser', 'blend', 'fill'].includes(this.tool)) {
      const p = this.preset;
      this.panel.append(sec('brushes', this.tool === 'blend' ? 'Blenders' : this.tool === 'eraser' ? 'Erasers' : 'Brushes', this.brushGrid(), el('p', { class: 'brush-desc' }, el('b', {}, p.name + ': '), p.desc || 'Your own brush.')),
        ...(this.tool !== 'eraser' ? [sec('color', 'Color', this.colorControls())] : []),
        sec('bset', 'Brush settings', ...this.brushControls()));
    } else if (this.tool !== 'eraser') this.panel.append(sec('color', 'Color', this.colorControls()));
    if (this.tool !== 'eraser') this.panel.append(sec('mix', 'Mix two colors', this.mixControls()));
    this.panel.append(this.layerSection());
    this.panel.append(sec('history', `History (${this.undo.length} steps)`, this.historyList()));
    this.panel.append(sec('page', 'Page', ...this.pageControls()));
    this.panel.scrollTop = keepScroll;
  }
  layerSection() {
    const s = (this.sec || ((k, t, ...kids) => el('details', { class: 'sec', open: true }, el('summary', {}, t), ...kids)))('layers', 'Layers', this.layerList());
    s.classList.add('sec-layers'); return s;
  }
  brushGroups() {
    const kind = this.kindForTool, list = this.brushes.filter(p => (p.kind || 'draw') === kind || (kind === 'draw' && p.kind === 'blend'));
    const grp = p => p.id.startsWith('u_') ? 'My brushes' : p.kind === 'blend' && kind === 'draw' ? 'Blenders and smoothing' : kind !== 'draw' ? '' : ['pencil', 'charcoal', 'pastel'].includes(p.tool) ? 'Pencils, charcoal and pastels' : ['pen', 'fineliner', 'nib', 'inkbrush'].includes(p.tool) ? 'Inks' : p.engine === 'paint' ? 'Paints' : 'Watercolor, markers and effects';
    const out = new Map(); for (const p of list) { const k = grp(p); if (!out.has(k)) out.set(k, []); out.get(k).push(p); }
    return out;
  }
  brushGrid() {
    const wrap = el('div', {});
    // groups fold so 75 brushes stay easy to browse; the group with your brush is open
    this.grpOpen ||= {};
    for (const [name, list] of this.brushGroups()) {
      const g = el('div', { class: 'brush-grid' });
      let holder = wrap;
      if (name) {
        const has = list.some(p => p.id === this.curId);
        const d = el('details', { class: 'sub bgrp', open: this.grpOpen[name] ?? has }, el('summary', {}, name, el('span', { class: 'muted small' }, ' ' + list.length)));
        d.addEventListener('toggle', () => { this.grpOpen[name] = d.open; });
        wrap.append(d); holder = d;
      }
      for (const p of list) {
        const c = this.previewCanvas(p);
        g.append(el('button', { class: 'brush' + (p.id === this.curId ? ' on' : ''), title: p.desc || p.name, onclick: () => { this.curId = p.id; if (p.color && this.tool === 'brush' && !this.userColor) this.color = p.color; this.renderPanels(); } }, c, el('span', {}, p.name)));
      }
      holder.append(g);
    }
    wrap.append(el('div', { class: 'row wrap' },
      el('button', { class: 'btn small primary', onclick: () => this.brushMaker(null) }, '+ Make a brush'),
      el('button', { class: 'btn small', onclick: () => this.brushMaker(this.preset) }, this.preset.id.startsWith('u_') ? 'Edit this brush' : 'Copy this brush'),
      el('button', { class: 'btn small', onclick: () => this.importBrush() }, 'Import brush')));
    return wrap;
  }
  previewCanvas(p, w = 120, h = 36) {
    const key = JSON.stringify([p, this.overrides[p.id] || null, w]);
    this.pvCache ||= new Map();
    let c = this.pvCache.get(key);
    if (c) { const cc = mk(w, h); cc.getContext('2d').drawImage(c, 0, 0); return cc; }
    c = mk(w, h); this.previewStroke(c.getContext('2d'), fullBrush({ ...p, ...(this.overrides[p.id] || {}) }), w, h);
    this.pvCache.set(key, c);
    const cc = mk(w, h); cc.getContext('2d').drawImage(c, 0, 0); return cc;
  }
  previewStroke(ctx, p, w = 120, h = 36) {
    ctx.fillStyle = '#f3efe4'; ctx.fillRect(0, 0, w, h);
    const lay = mk(w, h), lg = lay.getContext('2d');
    if (p.kind === 'blend' || p.kind === 'erase') { // show it working on two colors
      lg.fillStyle = '#2f5d8a'; lg.fillRect(w * 0.08, h * 0.25, w * 0.42, h * 0.5); lg.fillStyle = '#e8b23a'; lg.fillRect(w * 0.5, h * 0.25, w * 0.42, h * 0.5);
    }
    const sc = Math.min(1, (h * 0.5) / p.size);
    const b = { ...p, size: p.size * sc };
    const s = new Stroke(b, lg, { color: p.engine === 'erase' ? '#000' : (p.color || '#333'), paper: 'sketch', layerCtx: lg });
    const tmp = (p.engine === 'stamp' || p.engine === 'water' || p.engine === 'marker' || p.engine === 'splat') ? mk(w, h) : null;
    const s2 = tmp ? new Stroke(b, tmp.getContext('2d'), { color: p.color || '#333', paper: 'sketch', layerCtx: lg }) : s;
    for (let i = 0; i <= 36; i++) { const t = i / 36; s2.add({ x: w * 0.08 + t * w * 0.84, y: h / 2 + Math.sin(t * 6) * h * 0.18, p: 0.35 + Math.sin(t * 3.1) * 0.6 }); }
    s2.finish(lg);
    if (tmp) { if (p.engine === 'water') watercolorFinish(tmp, [0, 0, w, h], p.wetEdge); lg.globalAlpha = p.opacity; lg.globalCompositeOperation = p.blend || 'source-over'; lg.drawImage(tmp, 0, 0); lg.globalAlpha = 1; lg.globalCompositeOperation = 'source-over'; }
    ctx.drawImage(lay, 0, 0);
  }
  paramControl(p, def, value, set) {
    let row;
    if (def.type === 'select') row = select(def.label, value ?? Object.keys(def.options)[0], def.options, v => set(def.k, v));
    else if (def.type === 'check') row = check(def.label, !!value, v => set(def.k, v));
    else if (def.type === 'color') row = colorInput(def.label, value || '#ffffff', v => set(def.k, v));
    else {
      const fmt = def.pct ? v => Math.round(v * 100 / (def.pct === 0.5 ? 2 : 1)) + '%' : def.unit ? v => (+v).toFixed(def.step < 1 ? 1 : 0).replace(/\.0$/, '') + ' ' + def.unit : v => v;
      const disp = def.k === 'min' ? v => Math.round(v * 100) + '%' : fmt;
      row = slider(def.label, value ?? 0, def.min, def.max, def.step, v => set(def.k, v), disp);
    }
    row.title = def.help;
    const box = el('div', { class: 'param' }, row);
    if (this.explain) box.append(el('div', { class: 'help' }, def.help));
    return box;
  }
  brushControls() {
    const p = this.preset;
    const out = [check('Explain each setting', this.explain, v => { this.explain = v; setSetting('explainSettings', v); this.renderPanels(); })];
    // each group folds; Basics and Tip start open so the list stays short
    this.subOpen ||= { Basics: true, Tip: true };
    let box = null;
    for (const def of paramsFor(p.engine)) {
      if (!box || box.dataset.g !== def.g) {
        const g = def.g;
        const d = el('details', { class: 'sub', 'data-g': g, open: !!this.subOpen[g] }, el('summary', {}, g));
        d.addEventListener('toggle', () => { this.subOpen[g] = d.open; });
        out.push(d); box = d;
      }
      const b = box;
      if (def.k === 'tip') { b.append(this.shapePicker(p)); continue; }
      b.append(this.paramControl(p, def, p[def.k], (k, v) => this.setBrushProp(k, v, true)));
    }
    if (this.tool === 'fill') out.push(slider('Fill tolerance', this.fillTol ?? 32, 0, 160, 1, v => this.fillTol = v));
    out.push(check('Show the tool on the page', this.showTool !== false, v => { this.showTool = v; this.dirty = true; }));
    out.push(el('div', { class: 'row wrap' },
      el('button', { class: 'btn small', onclick: () => { delete this.overrides[p.id]; setSetting('brushOverrides', this.overrides); this.renderPanels(); } }, 'Reset to how it came'),
      el('button', { class: 'btn small primary', onclick: () => this.brushMaker(p, true) }, 'Save as my own brush')));
    return out;
  }

  // tip shapes as little pictures; hair and chalk tips only work on wet paint brushes
  shapePicker(p) {
    const ids = Object.keys(TIP_SHAPES).filter(k => p.engine === 'paint' ? k !== 'nib' : !['bristle', 'chalk', 'nib'].includes(k));
    const cur = ids.includes(p.tip) ? p.tip : 'round';
    const icon = k => {
      const c = mk(30, 30), g = c.getContext('2d'); g.translate(15, 15); g.fillStyle = g.strokeStyle = '#e9e4d8';
      if (k === 'bristle' || k === 'rake') { const n = k === 'rake' ? 5 : 11; g.lineWidth = k === 'rake' ? 2.2 : 1.1; for (let i = 0; i < n; i++) { const x = -10 + i * (20 / (n - 1)); g.beginPath(); g.moveTo(x, -11); g.lineTo(x + (i % 2 ? 0.8 : -0.6), 11); g.stroke(); } }
      else if (k === 'chalk') { g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill(); g.globalCompositeOperation = 'destination-out'; const r = seededRnd(5); for (let i = 0; i < 26; i++) g.fillRect(-11 + r() * 22, -11 + r() * 22, 2, 2); }
      else if (k === 'sponge') { g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill(); g.globalCompositeOperation = 'destination-out'; const r = seededRnd(9); for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(-9 + r() * 18, -9 + r() * 18, 1 + r() * 2, 0, 7); g.fill(); } }
      else if (k === 'flat') { g.beginPath(); g.roundRect(-4, -11, 8, 22, 2); g.fill(); }
      else if (k === 'nib') { g.beginPath(); g.ellipse(0, 0, 11, 3, -0.7, 0, 7); g.fill(); }
      else { shapePath(g, k, 11); g.fill(); }
      return c;
    };
    const help = p.kind === 'blend' ? 'Square and flat blend clean edges. Round is soft. Sponge and rake add texture.' : 'Pick a shape. Roundness and Tip angle squash and turn it.';
    const box = el('div', { class: 'param' }, el('div', { class: 'lbl' }, 'Tip shape: ' + TIP_SHAPES[cur]),
      el('div', { class: 'shape-grid' }, ids.map(k => el('button', { class: 'shape-btn' + (k === cur ? ' on' : ''), title: TIP_SHAPES[k], 'aria-label': TIP_SHAPES[k], onclick: () => { this.setBrushProp('tip', k); } }, icon(k)))));
    if (this.explain) box.append(el('div', { class: 'help' }, help));
    return box;
  }

  // ---------- brush maker ----------
  async brushMaker(base, saveAs) {
    const editing = base && base.id?.startsWith('u_') && !saveAs;
    const b = fullBrush(base ? { ...base, ...(this.overrides[base.id] || {}) } : { name: 'My brush', engine: 'paint', tip: 'bristle', kind: 'draw', size: 30, load: 0.6, pickup: 0.3, desc: '' });
    if (!editing) { b.id = uid('u_'); b.name = base ? (base.name + (saveAs ? '' : ' copy')) : 'My brush'; }
    const prev = el('canvas', { class: 'bm-preview', width: 560, height: 160 });
    const body = el('div', { class: 'bmaker' });
    const redraw = () => { const ctx = prev.getContext('2d'); this.previewStroke(ctx, { ...b, kind: b.kind }, 560, 160); };
    const build = () => {
      body.innerHTML = '';
      const nameI = el('input', { type: 'text', value: b.name, class: 'full' }); nameI.addEventListener('input', () => b.name = nameI.value);
      const descI = el('input', { type: 'text', value: b.desc || '', class: 'full', placeholder: 'What is it for? (shown when someone picks it)' }); descI.addEventListener('input', () => b.desc = descI.value);
      const side = el('div', { class: 'bm-side' });
      let g0 = '';
      for (const def of paramsFor(b.engine)) {
        if (def.g !== g0) { side.append(el('div', { class: 'grp-title' }, def.g)); g0 = def.g; }
        side.append(this.paramControl(b, def, b[def.k], (k, v) => { b[k] = v; clearTimeout(this.bmT); this.bmT = setTimeout(redraw, 60); }));
      }
      body.append(
        el('div', { class: 'bm-top' },
          el('label', { class: 'row' }, el('span', { class: 'lbl' }, 'Name'), nameI),
          el('label', { class: 'row' }, el('span', { class: 'lbl' }, 'Description'), descI),
          select('Works like', b.engine, ENGINES, v => { b.engine = v; build(); }),
          select('Used as', b.kind, { draw: 'A drawing brush', blend: 'A blender', erase: 'An eraser' }, v => { b.kind = v; redraw(); }),
          select('Tool you see', b.tool, TOOLS, v => b.tool = v),
          colorInput('Default color', b.color || '#333333', v => { b.color = v; redraw(); }),
          el('p', { class: 'muted small' }, 'The preview goes over blue and yellow so you can see how it blends.'),
          prev),
        side);
      redraw();
    };
    build();
    const m = modal(editing ? 'Edit brush' : 'Make a brush', body, {
      wide: true, buttons: [
        editing ? { label: 'Delete brush', onClick: async c => { if (await confirmBox('Delete this brush?', `"${b.name}" will be removed.`, 'Delete')) { this.custom = this.custom.filter(x => x.id !== b.id); await setSetting('customBrushes', this.custom); c(); this.curId = 'pencil-hb'; this.renderPanels(); } } } : null,
        { label: 'Export brush file', onClick: () => { saveFile(new Blob([JSON.stringify({ shesketchesBrush: 1, brush: b }, null, 1)], { type: 'application/json' }), (b.name || 'brush').replace(/[^\w -]/g, '') + '.brush.json'); } },
        { label: 'Cancel', onClick: c => c() },
        { label: 'Save brush', primary: true, onClick: async c => { const i = this.custom.findIndex(x => x.id === b.id); const save = { ...b }; if (i >= 0) this.custom[i] = save; else this.custom.push(save); await setSetting('customBrushes', this.custom); delete this.overrides[b.id]; c(); if (b.kind !== this.kindForTool) this.setTool(b.kind === 'blend' ? 'blend' : b.kind === 'erase' ? 'eraser' : 'brush'); this.curId = b.id; this.pvCache?.clear(); this.renderPanels(); toast('Saved "' + b.name + '" in My brushes.'); } },
      ].filter(Boolean)
    });
  }
  async importBrush() {
    const f = (await pickFiles('.json', false))[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text()); if (!j.brush || !j.brush.engine) throw new Error('This is not a SHESKETCHES brush file.');
      const b = { ...j.brush, id: uid('u_') }; this.custom.push(b); await setSetting('customBrushes', this.custom);
      toast('Added "' + b.name + '".'); this.renderPanels();
    } catch (e) { toast(e.message, 'err'); }
  }

  colorControls() {
    const wrap = el('div', { class: 'color-box' });
    const inp = el('input', { type: 'color', value: this.color, 'aria-label': 'Main color' });
    inp.addEventListener('input', () => { this.color = inp.value; this.userColor = true; hex.value = inp.value; this.chip.style.background = inp.value; this.dirty = true; });
    inp.addEventListener('change', () => this.setColor(inp.value));
    const hex = el('input', { type: 'text', value: this.color, class: 'hex', maxlength: 7, 'aria-label': 'Hex color' });
    hex.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { this.userColor = true; this.setColor(hex.value.toLowerCase()); } });
    const inp2 = el('input', { type: 'color', value: this.color2, 'aria-label': 'Second color', title: 'Second color' });
    inp2.addEventListener('change', () => { this.color2 = inp2.value; setSetting('brushColor2', inp2.value); this.updDock(); });
    const sw = list => el('div', { class: 'swatches' }, list.map(c => el('button', { class: 'sw' + (c === this.color ? ' on' : ''), style: { background: c }, title: c, onclick: () => { this.userColor = true; this.setColor(c); } })));
    const wheel = colorWheel({ value: this.color, size: 220,
      onInput: c => { this.color = c; this.userColor = true; hex.value = c; inp.value = c; this.chip.style.background = c; this.dirty = true; },
      onChange: c => { this.userColor = true; this.setColor(c); } });
    wrap.append(wheel, el('div', { class: 'row' }, inp, hex, el('button', { class: 'btn small', title: 'Swap (X)', onclick: () => this.swapColors() }, '⇄'), inp2),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn small primary', title: 'Click or drag on the page to take a color (I, or hold Alt with any brush)', onclick: () => this.setTool('pick') }, '⌖ Pick from page'),
        'EyeDropper' in window ? el('button', { class: 'btn small', title: 'Take a color from anywhere on your screen, even outside this app', onclick: () => this.pickFromScreen() }, 'Pick from screen') : null,
        el('button', { class: 'btn small', title: 'Copy the hex code of your color', onclick: () => this.copyHex() }, 'Copy hex')),
      el('details', { class: 'sub' }, el('summary', {}, 'Pick color options'),
        el('div', { class: 'param' }, select('Copy from', this.pickFrom, { all: 'Everything you see', layer: 'Only this layer' }, v => { this.pickFrom = v; setSetting('pickFrom', v); }), this.explain ? el('div', { class: 'help' }, 'Only this layer skips the paper and other layers.') : null),
        el('div', { class: 'param' }, select('Area', String(this.pickSize), { 1: '1 pixel', 3: '3 x 3 average', 5: '5 x 5 average', 11: '11 x 11 average' }, v => { this.pickSize = +v; setSetting('pickSize', +v); }), this.explain ? el('div', { class: 'help' }, 'Bigger areas ignore paper grain and streaks.') : null),
        check('Stay on Pick color after picking', this.pickStay, v => { this.pickStay = v; setSetting('pickStay', v); })),
      sw(PALETTE));
    if (this.recent.length) wrap.append(el('div', { class: 'muted small' }, 'Recent'), sw(this.recent));
    wrap.append(el('div', { class: 'row' }, el('span', { class: 'muted small grow' }, 'My palette'), el('button', { class: 'btn small', onclick: () => { if (!this.myPalette.includes(this.color)) { this.myPalette = [...this.myPalette, this.color].slice(-36); setSetting('myPalette', this.myPalette); this.renderPanels(); } } }, '+ Save color')));
    if (this.myPalette.length) wrap.append(sw(this.myPalette));
    return wrap;
  }
  mixControls() {
    const box = el('div', { class: 'mix-box' });
    let t = 0.5;
    const strip = el('div', { class: 'mix-strip' }), res = el('button', { class: 'mix-result', title: 'Use this color' });
    const upd = () => {
      strip.innerHTML = '';
      for (let i = 0; i <= 8; i++) { const c = mixPaint(this.color, this.color2, i / 8); strip.append(el('button', { class: 'sw', style: { background: c }, title: c, onclick: () => this.setColor(c) })); }
      const c = mixPaint(this.color, this.color2, t); res.style.background = c; res.dataset.c = c; res.textContent = c;
    };
    res.onclick = () => this.setColor(res.dataset.c);
    box.append(el('p', { class: 'muted small' }, 'Mixes your two colors like real paint. Click a swatch to use it.'), strip,
      slider('Amount of second color', t, 0, 1, 0.01, v => { t = v; upd(); }, v => Math.round(v * 100) + '%'), res);
    upd();
    return box;
  }
  layerThumb(L) {
    this.thumbCache ||= new Map();
    const key = L.id + '|' + (this.thumbVer?.[L.id] || 0) + '|' + JSON.stringify([L.x, L.y, L.scale, L.rot, L.src, L.text, L.fx, L.filter]);
    const hit = this.thumbCache.get(L.id);
    if (hit && hit.key === key) { const cc = mk(44, 44); cc.getContext('2d').drawImage(hit.c, 0, 0); return cc; }
    const c = mk(44, 44), g = c.getContext('2d'), P = this.page, s = Math.min(44 / P.w, 44 / P.h);
    g.fillStyle = '#e9e5dc'; g.fillRect(0, 0, 44, 44);
    g.save(); g.translate((44 - P.w * s) / 2, (44 - P.h * s) / 2); g.scale(s, s);
    g.fillStyle = '#fff'; g.fillRect(0, 0, P.w, P.h);
    try { drawLayer(g, { ...L, visible: true, opacity: 1, blend: 'source-over' }, this.res, s); } catch (e) { }
    g.restore();
    this.thumbCache.set(L.id, { key, c }); const cc = mk(44, 44); cc.getContext('2d').drawImage(c, 0, 0);
    return cc;
  }
  layerList() {
    const P = this.page, box = el('div', { class: 'layers' });
    const rows = P.layers.slice().reverse();
    let dragId = null;
    for (const L of rows) {
      const kind = L.kind === 'paint' ? 'Drawing' : L.kind === 'text' ? 'Text' : L.media === 'gif' ? 'GIF' : L.media === 'video' ? 'Video' : 'Picture';
      const sel = this.selection.has(L.id);
      const row = el('div', {
        class: 'layer' + (L.id === this.activeId ? ' on' : '') + (sel ? ' sel' : '') + (L.clip ? ' clip' : '') + (L.visible ? '' : ' hidden'), draggable: 'true', title: 'Click to pick. Ctrl or Shift click to pick several. Drag to reorder. Double-click the name to rename.',
        onclick: e => {
          if (e.ctrlKey || e.shiftKey) { this.selection.has(L.id) ? this.selection.delete(L.id) : this.selection.add(L.id); if (!this.selection.has(this.activeId) && this.activeId) this.selection.add(this.activeId); }
          else this.selection = new Set(L.kind !== 'paint' ? [L.id] : []);
          this.activeId = L.id; this.primary = L.id;
          if (L.kind !== 'paint' && !e.ctrlKey && !e.shiftKey && this.tool !== 'move') this.setTool('move');
          this.renderPanels(); this.dirty = true;
        }
      },
        el('button', { class: 'icon-btn tiny eye', title: L.visible ? 'Hide (Ctrl+,)' : 'Show', onclick: e => { e.stopPropagation(); this.setLayerProp(L, 'visible', !L.visible); this.updAnim(); this.renderPanels(); } }, L.visible ? '👁' : '◌'),
        L.clip ? el('span', { class: 'clip-arrow', title: 'Clipped to the layer below' }, '↳') : null,
        this.layerThumb(L),
        el('div', { class: 'lmeta' },
          el('span', { class: 'ln', ondblclick: async e => { e.stopPropagation(); const n = await promptBox('Layer name', L.name); if (n) { this.setLayerProp(L, 'name', n); this.renderPanels(); } } }, L.name),
          el('span', { class: 'lsub' }, kind + (L.opacity < 1 ? ` · ${Math.round(L.opacity * 100)}%` : '') + (L.blend && L.blend !== 'source-over' ? ' · ' + (BLENDS[L.blend] || L.blend) : '') + (L.alphaLock ? ' · protected' : ''))),
        el('button', { class: 'icon-btn tiny' + (L.locked ? ' lit' : ''), title: L.locked ? 'Unlock' : 'Lock (stops drawing, moving and deleting)', onclick: e => { e.stopPropagation(); this.setLayerProp(L, 'locked', !L.locked); this.renderPanels(); } }, L.locked ? '🔒' : '🔓'));
      row.addEventListener('dragstart', e => { dragId = L.id; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('over'); });
      row.addEventListener('dragleave', () => row.classList.remove('over'));
      row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('over'); if (dragId && dragId !== L.id) this.moveLayer(dragId, P.layers.findIndex(l => l.id === L.id) + (P.layers.findIndex(l => l.id === dragId) < P.layers.findIndex(l => l.id === L.id) ? 0 : 0)); });
      box.append(row);
    }
    const A = this.active;
    const b = (label, op, title, cls = '') => el('button', { class: 'btn small ' + cls, title, onclick: () => this.layerOp(op) }, label);
    const bar = el('div', { class: 'layer-bar' },
      b('+ New', 'add', 'New drawing layer (Ctrl+Shift+N)', 'primary'), b('Duplicate', 'dup', 'Copy this layer (Ctrl+J)'),
      b('▲', 'up', 'Move up (Ctrl+])'), b('▼', 'down', 'Move down (Ctrl+[)'),
      b('Merge down', 'merge', 'Combine with the drawing layer below (Ctrl+E)'), b('Merge visible', 'mergeVisible', 'Combine all shown layers into one (Ctrl+Shift+E)'),
      b('Clear', 'clear', 'Erase everything on this drawing layer'), b('Fill', 'fillLayer', 'Fill this layer with your color'),
      b(this.selection.size > 1 ? `Delete ${this.selection.size}` : 'Delete', 'del', 'Delete the picked layers (Delete). Locked layers are kept.', 'danger'));
    const out = el('div', {}, box, bar);
    if (A) {
      out.append(el('div', { class: 'row wrap layer-toggles' },
        el('button', { class: 'btn small' + (A.alphaLock ? ' lit' : ''), title: 'Only paint where this layer already has paint (/)', onclick: () => this.layerOp('alpha') }, (A.alphaLock ? '☑' : '☐') + ' Protect transparent'),
        el('button', { class: 'btn small' + (A.clip ? ' lit' : ''), title: 'Only show this layer where the layer below has pixels (Ctrl+Alt+G)', onclick: () => this.layerOp('clip') }, (A.clip ? '☑' : '☐') + ' Clip to below'),
        A.kind !== 'paint' ? el('button', { class: 'btn small', title: 'Turn this picture or text into a drawing layer you can paint on', onclick: () => this.layerOp('rasterize') }, 'Make paintable') : null),
        slider('Layer opacity', A.opacity ?? 1, 0, 1, 0.01, v => { A.opacity = v; this.changed(); this.dirty = true; }, v => Math.round(v * 100) + '%'),
        select('Layer blend', A.blend || 'source-over', BLENDS, v => this.setLayerProp(A, 'blend', v)));
    }
    out.append(el('details', { class: 'explain' }, el('summary', {}, 'What are layers?'),
      el('p', {}, 'Layers are clear sheets stacked on the page. The top of the list is on top. Put each part on its own layer to change it alone.'),
      el('p', {}, 'Protect transparent: paint only on what is there. Clip: show only inside the layer below. Lock: nothing changes it. Merge: join layers.')));
    return out;
  }
  historyList() {
    const box = el('div', { class: 'history' });
    box.append(el('button', { class: 'btn small' + (this.undo.length === 0 ? ' lit' : ''), onclick: () => this.jumpHistory(0) }, 'Start (when you opened the page)'));
    this.undo.forEach((en, i) => box.append(el('button', { class: 'btn small' + (i === this.undo.length - 1 ? ' lit' : ''), onclick: () => this.jumpHistory(i + 1) }, `${i + 1}. ${en.label || 'Step'}`)));
    this.redo.slice().reverse().forEach((en, i) => box.append(el('button', { class: 'btn small undone', onclick: () => this.jumpHistory(this.undo.length + i + 1) }, `${this.undo.length + i + 1}. ${en.label || 'Step'} (undone)`)));
    box.append(el('p', { class: 'muted small' }, 'Click any step to go back to it. Steps after it stay until you draw something new.'));
    return box;
  }
  moveControls() {
    const n = this.selection.size, items = this.selItems;
    const out = [
      select('Dragging moves', this.moveMode, { items: 'Pictures and text', layer: 'The whole drawing layer' }, v => { this.moveMode = v; }),
      el('p', { class: 'muted small' }, n ? `${n} picked. Drag to move them together. Shift-click to add or remove. Arrow keys nudge.` : 'Click a picture or text to pick it. Shift-click or drag a box to pick several.'),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn small', onclick: () => { this.selection = new Set(this.page.layers.filter(l => l.kind !== 'paint' && l.visible).map(l => l.id)); this.renderPanels(); this.dirty = true; } }, 'Pick all (Ctrl+A)'),
        el('button', { class: 'btn small', onclick: () => this.selectOnly(null) }, 'Pick none (Esc)'),
        n ? el('button', { class: 'btn small', onclick: () => { const before = clone(this.page.layers); const lock = !items.every(l => l.locked); items.forEach(l => l.locked = lock); this.pushState(before, lock ? 'Lock' : 'Unlock'); this.changed(); this.renderPanels(); this.dirty = true; } }, items.every(l => l.locked) ? 'Unlock picked' : 'Lock picked') : null,
        n ? el('button', { class: 'btn small danger', onclick: () => this.deleteSelected() }, `Delete picked (${n})`) : null),
    ];
    if (items.length > 1) {
      const align = (fn, label) => el('button', { class: 'btn small', onclick: () => { const before = clone(this.page.layers); fn(items.filter(l => !l.locked)); this.pushState(before, label); this.changed(); this.dirty = true; } }, label);
      out.push(el('div', { class: 'row wrap' },
        align(ls => { const x = Math.min(...ls.map(l => l.x)); ls.forEach(l => l.x = x); }, 'Line up left'),
        align(ls => { const x = ls.reduce((s, l) => s + l.x, 0) / ls.length; ls.forEach(l => l.x = x); }, 'Line up centers'),
        align(ls => { const y = Math.min(...ls.map(l => l.y)); ls.forEach(l => l.y = y); }, 'Line up tops'),
        align(ls => { ls.sort((a, b) => a.x - b.x); const a = ls[0].x, z = ls[ls.length - 1].x; ls.forEach((l, i) => l.x = a + (z - a) * i / (ls.length - 1)); }, 'Space evenly')));
    }
    return out;
  }
  itemControls(L) {
    const f = L.filter ||= {}, sh = L.shadow ||= { on: false };
    const live = () => { this.changed(); this.dirty = true; };
    const out = [];
    if (L.locked) out.push(el('p', { class: 'muted small' }, '🔒 Locked. Unlock it in Layers to change it.'));
    if (L.kind === 'text') {
      const ta = el('textarea', { rows: 3, class: 'full' }); ta.value = L.text;
      ta.addEventListener('input', () => { L.text = ta.value; live(); });
      out.push(ta,
        select('Font', L.font, Object.fromEntries(this.fonts.map(f => [f, f])), v => { L.font = v; live(); }),
        slider('Size', L.size, 6, 600, 1, v => { L.size = v; live(); }, v => v + ' px'),
        colorInput('Color', L.color, v => { L.color = v; live(); }),
        select('Align', L.align || 'left', { left: 'Left', center: 'Center', right: 'Right' }, v => { L.align = v; live(); }),
        slider('Line height', L.lineH || 1.25, 0.7, 2.5, 0.05, v => { L.lineH = v; live(); }),
        slider('Letter spacing', L.spacing || 0, -10, 60, 0.5, v => { L.spacing = v; live(); }, v => v + ' px'),
        select('Weight', String(L.weight || 400), { 300: 'Light', 400: 'Regular', 700: 'Bold', 900: 'Black' }, v => { L.weight = +v; live(); }),
        check('Italic', !!L.italic, v => { L.italic = v; live(); }),
        colorInput('Outline color', L.stroke || '#ffffff', v => { L.stroke = v; live(); }),
        slider('Outline width', L.strokeW || 0, 0, 40, 0.5, v => { L.strokeW = v; live(); }),
        el('button', { class: 'btn small', onclick: async () => { const fs = await pickFiles('.ttf,.otf,.woff,.woff2', true); if (fs.length) { await importFiles(fs, 'font'); this.fonts = [...SYSTEM_FONTS, ...(await loadAllFonts())]; this.renderPanels(); toast('Font added.'); } } }, 'Add a font file'));
    }
    if (L.kind === 'image' && (L.media === 'gif' || L.media === 'video')) {
      const R = this.res[L.id];
      out.push(el('p', { class: 'muted small' }, `${L.media === 'gif' ? 'Moving picture' : 'Video clip'}: ${R?.frames?.length || 0} frames, ${((R?.total || 0) / 1000).toFixed(1)} s. It plays in the book and in videos and GIFs.`),
        check('Play', L.play !== false, v => { L.play = v; live(); }),
        slider('Speed', L.speed || 1, 0.25, 4, 0.05, v => { L.speed = v; live(); }, v => v + '×'),
        slider('Still frame (for picture exports)', L.still || 0, 0, Math.max(0, (R?.frames?.length || 1) - 1), 1, v => { L.still = v; live(); }));
    }
    out.push(
      slider('Opacity', L.opacity ?? 1, 0, 1, 0.01, v => { L.opacity = v; live(); }, v => Math.round(v * 100) + '%'),
      select('Blend', L.blend || 'source-over', BLENDS, v => { L.blend = v; live(); }),
      slider('Scale', L.scale || 1, 0.02, 4, 0.01, v => { L.scale = v; live(); }, v => Math.round(v * 100) + '%'),
      slider('Rotate', Math.round((L.rot || 0) * 180 / Math.PI), -180, 180, 1, v => { L.rot = v * Math.PI / 180; live(); }, v => v + '°'),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn small', onclick: () => { L.flipX = !L.flipX; live(); } }, 'Flip ↔'),
        el('button', { class: 'btn small', onclick: () => { L.flipY = !L.flipY; live(); } }, 'Flip ↕'),
        el('button', { class: 'btn small', onclick: () => { L.x = this.page.w / 2; L.y = this.page.h / 2; live(); } }, 'Center'),
        el('button', { class: 'btn small', onclick: () => { const i = this.page.layers.indexOf(L); this.activeId = L.id; this.moveLayer(L.id, this.page.layers.length - 1); } }, 'Bring to front'),
        el('button', { class: 'btn small', onclick: () => { this.activeId = L.id; this.moveLayer(L.id, 0); } }, 'Send to back')));
    if (L.kind === 'image') {
      // sticker look: presets plus every setting, each explained
      const fx = { ...FX_DEFAULT, ...(L.fx || {}) };
      const setFx = (k, v) => { L.fx = { ...(L.fx || {}), [k]: v }; live(); };
      const presets = el('div', { class: 'fx-presets' });
      for (const [k, pr] of Object.entries(FX_PRESETS)) presets.append(el('button', { class: 'btn small', title: 'Apply the ' + pr.name + ' look', onclick: () => { const before = clone(this.page.layers); const { name, ...v } = pr; L.fx = k === 'plain' ? {} : { ...v }; this.pushState(before, 'Sticker look: ' + name); live(); this.renderPanels(); } }, pr.name));
      out.push(el('div', { class: 'grp-title' }, 'Sticker look'), el('p', { class: 'muted small' }, 'Pick a look, then change any setting below. The original picture is never changed.'), presets);
      let g0 = '';
      for (const d of FX_PARAMS) {
        if (d.g !== g0) { out.push(el('div', { class: 'grp-title sub' }, d.g)); g0 = d.g; }
        out.push(this.paramControl(null, { ...d, pct: d.pct ? 1 : 0 }, fx[d.k], (k, v) => setFx(k, d.k === 'border' ? v : v)));
      }
      out.push(el('div', { class: 'grp-title' }, 'Adjust'),
        slider('Brightness', f.b ?? 100, 0, 200, 1, v => { f.b = v; live(); }, v => v + '%'),
        slider('Contrast', f.c ?? 100, 0, 200, 1, v => { f.c = v; live(); }, v => v + '%'),
        slider('Saturation', f.s ?? 100, 0, 300, 1, v => { f.s = v; live(); }, v => v + '%'),
        slider('Hue', f.h || 0, -180, 180, 1, v => { f.h = v; live(); }, v => v + '°'),
        slider('Grayscale', f.gray || 0, 0, 100, 1, v => { f.gray = v; live(); }, v => v + '%'),
        slider('Sepia', f.sepia || 0, 0, 100, 1, v => { f.sepia = v; live(); }, v => v + '%'),
        slider('Invert', f.inv || 0, 0, 100, 1, v => { f.inv = v; live(); }, v => v + '%'),
        slider('Blur', f.blur || 0, 0, 40, 0.5, v => { f.blur = v; live(); }, v => v + ' px'));
    }
    out.push(check('Drop shadow', !!sh.on, v => { sh.on = v; live(); this.renderPanels(); }));
    if (sh.on) out.push(
      slider('Shadow blur', sh.blur ?? 10, 0, 80, 1, v => { sh.blur = v; live(); }),
      slider('Shadow X', sh.dx ?? 4, -60, 60, 1, v => { sh.dx = v; live(); }),
      slider('Shadow Y', sh.dy ?? 6, -60, 60, 1, v => { sh.dy = v; live(); }),
      slider('Shadow strength', sh.a ?? 0.3, 0, 1, 0.01, v => { sh.a = v; live(); }, v => Math.round(v * 100) + '%'),
      colorInput('Shadow color', sh.color || '#000000', v => { sh.color = v; live(); }));
    const acts = el('div', { class: 'row wrap' });
    if (L.kind === 'image' && !L.media) acts.append(
      el('button', { class: 'btn small', onclick: () => this.app.openFactory({ blob: L.src, name: L.name }, a => this.replaceImage(L, a)) }, 'Cut out / sticker'),
      el('button', { class: 'btn small', onclick: () => this.app.openDither({ blob: L.src, name: L.name }, a => this.replaceImage(L, a)) }, 'Dither'));
    acts.append(el('button', { class: 'btn small', onclick: () => this.layerOp('rasterize') }, 'Make paintable'),
      el('button', { class: 'btn small danger', onclick: () => this.deleteSelected() }, 'Delete'));
    out.push(acts);
    return out;
  }
  async replaceImage(L, a) {
    const before = clone(this.page.layers);
    L.orig ||= L.src; L.src = a.blob; L.asset = a.id; L.media = null;
    const keepW = L.iw * (L.scale || 1);
    L.iw = a.w; L.ih = a.h; L.scale = keepW / a.w;
    this.res[L.id] = await mediaRes(L);
    this.pushState(before, 'Replace picture'); this.changed(); this.renderPanels(); this.dirty = true;
  }
  setName(v) {
    v = String(v || '').trim().slice(0, 60);
    if ((this.page.title || '') === v) return;
    this.page.title = v; this.nameI.value = v; this.changed(true);
    toast(v ? `Named "${v}".` : 'Name removed.');
  }
  pageControls() {
    const P = this.page, bp = this.book.paper;
    const papers = { book: 'Same as book', ...Object.fromEntries(Object.entries(PAPERS).map(([k, v]) => [k, v.name])) };
    const nm = el('input', { type: 'text', class: 'full', maxlength: 60, value: P.title || '', placeholder: 'Name this art', 'aria-label': 'Page name' });
    nm.addEventListener('change', () => this.setName(nm.value));
    const out = [
      el('label', { class: 'row' }, el('span', { class: 'lbl' }, 'Name'), nm),
      el('div', { class: 'help' }, 'Shown in the book and used as the file name when you export.'),
      select('Paper', P.paper ? P.paper.type : 'book', papers, async v => { P.paper = v === 'book' ? null : { type: v, color: null }; await this.repaper(); this.changed(); }),
      colorInput('Paper tint', (P.paper && P.paper.color) || (PAPERS[(P.paper || bp).type] || PAPERS.sketch).color, async v => { P.paper = { type: (P.paper || bp).type === 'custom' ? 'sketch' : (P.paper || bp).type, color: v }; await this.repaper(); this.changed(); }),
      el('button', { class: 'btn small', onclick: async () => { const fs = await pickFiles('image/*', false); if (!fs[0]) return; const id = await putBlob(fs[0]); P.paper = { type: 'custom', custom: id }; await this.repaper(); this.changed(); } }, 'Use my own paper texture'),
      el('div', { class: 'muted small' }, `${P.w} × ${P.h} px at ${this.book.size.dpi} DPI (${this.book.size.wMM} × ${this.book.size.hMM} mm)`),
    ];
    if (P.history && P.history.length) {
      out.push(el('div', { class: 'muted small' }, 'Restore points (one every 5 minutes, about 2 hours back). Click one to go back to it.'));
      const box = el('div', { class: 'history' });
      P.history.forEach((h, i) => box.append(el('button', { class: 'btn small', onclick: () => this.restoreVersion(i) }, new Date(h.t).toLocaleString())));
      out.push(box);
    }
    return out;
  }
  async repaper() {
    await drawPaper(this.paperCanvas.getContext('2d'), this.page, this.book, this.page.w, this.page.h);
    this.renderPanels(); this.dirty = true;
  }
  async restoreVersion(i) {
    if (!(await confirmBox('Restore this version?', 'The page goes back to how it was then. Your current version is kept in the list too.', 'Restore'))) return;
    const target = this.page.history[i];
    await this.save(true);
    this.page.layers = clone(target.layers); this.page.paper = target.paper;
    this.res = {}; this.dirtyLayers = new Set(); this.undo = []; this.redo = [];
    await this.loadPage(); this.changed(true);
  }

  openLibrary() {
    const body = el('div', {});
    const tabs = el('div', { class: 'tabs' });
    const show = async (kinds) => {
      body.querySelector('.asset-grid')?.remove();
      body.append(await assetGrid(kinds, a => { m.close(); this.addImageAsset(a); }, { empty: 'Nothing here yet. Import your art or make something in the makers.' }));
    };
    for (const [k, v] of Object.entries(KINDS)) if (k !== 'font') tabs.append(el('button', { class: 'btn small', onclick: () => show([k]) }, v));
    tabs.append(el('button', { class: 'btn small primary', onclick: async () => { const fs = await pickFiles(MEDIA_ACCEPT, true); if (!fs.length) return; const added = await importFiles(fs, 'art'); toast(`Imported ${added.length} file(s).`); show(['art', 'media']); } }, 'Import pictures, GIFs or videos'));
    body.append(el('p', { class: 'muted small' }, 'Click anything to add it. Pictures, GIFs and short videos work.'), tabs);
    const m = modal('Add to the page', body, { wide: true });
    show(['art', 'sticker', 'made', 'media']);
  }

  showKeys() {
    modal('Keys and controls', el('div', { class: 'keys' },
      el('p', { class: 'muted' }, 'Left button draws. Double-click opens the quick menu. Scroll zooms. Middle-drag or Space moves the page. Pen tablets give pressure.'),
      el('table', { class: 'keytable' }, KEYS.map(([k, v]) => el('tr', {}, el('td', {}, el('kbd', {}, k)), el('td', {}, v))))), { wide: false });
  }
  showTips() {
    const tip = (t, d) => el('div', { class: 'g-step' }, el('span', { class: 'g-n' }, '•'), el('div', {}, el('h3', {}, t), el('p', {}, d)));
    modal('Drawing on a page', el('div', { class: 'guide' },
      tip('Draw', 'Tools are at the bottom. Brushes and their settings are on the right. Hover anything to see what it does.'),
      tip('Colors', 'Click your color at the bottom (or press C) for the color wheel. Hold Alt and click to copy a color from the page.'),
      tip('Blend', 'Paints mix like real paint: blue + yellow = green. Press S for blenders. Drag sets how far colors smear.'),
      tip('Quick menu', 'Double-click the page (or press Q) for every setting, colors and zoom in one place.'),
      tip('Zoom', 'Scroll to zoom. 1, 2, 3 zoom to 100, 200, 400%. 0 fits the page.'),
      tip('Layers', 'Keep sketch, color and details on separate layers. Lock a layer so nothing changes it.'),
      tip('Name and save', 'Name your art in the box at the top. It saves by itself, and keeps a restore point every 5 minutes.')), { wide: true, buttons: [{ label: 'Got it', primary: true, onClick: c => c() }] });
  }

  // ---------- keys ----------
  bindKeys() {
    this.keyDown = e => {
      if (!this.root || document.querySelector('.modal-back')) return;
      const typing = e.target.closest?.('textarea, select, [contenteditable]') || (e.target.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'button', 'radio'].includes(e.target.type));
      if (e.key === 'Alt') { e.preventDefault(); if (!this.altDown) { this.altDown = true; this.updCursor(); } return; }
      if (typing) return;
      if (e.target.tagName === 'INPUT' && !e.ctrlKey && !e.metaKey && e.key.startsWith('Arrow')) return; // arrows still move sliders
      if (e.target.tagName === 'INPUT') e.target.blur();
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.doUndo(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.doRedo(); }
        else if (k === 's') { e.preventDefault(); this.save(); }
        else if (k === 'n' && e.shiftKey) { e.preventDefault(); this.layerOp('add'); }
        else if (k === 'j') { e.preventDefault(); this.layerOp('dup'); }
        else if (k === 'e' && e.shiftKey) { e.preventDefault(); this.layerOp('mergeVisible'); }
        else if (k === 'e') { e.preventDefault(); this.layerOp('merge'); }
        else if (k === ']') { e.preventDefault(); this.layerOp('up'); }
        else if (k === '[') { e.preventDefault(); this.layerOp('down'); }
        else if (k === 'g' && e.altKey) { e.preventDefault(); this.layerOp('clip'); }
        else if (k === ',') { e.preventDefault(); this.layerOp('hide'); }
        else if (k === 'a') { e.preventDefault(); if (this.tool !== 'move') this.setTool('move'); this.selection = new Set(this.page.layers.filter(l => l.kind !== 'paint' && l.visible).map(l => l.id)); this.renderPanels(); this.dirty = true; }
        return;
      }
      if (k === ' ') { this.space = true; this.updCursor(); e.preventDefault(); return; }
      if (k === 'z' && !e.altKey) { if (!this.zDown) { this.zDown = true; this.updCursor(); } return; }
      if (k === 'c') { const h = this.hover, r = this.canvas.getBoundingClientRect(); return this.colorPop(h ? r.left + h.sx : r.left + this.vw / 2, h ? r.top + h.sy - 200 : r.top + this.vh / 2 - 200); }
      if (['1', '2', '3'].includes(k)) { const h = this.hover; return this.zoomTo({ 1: 1, 2: 2, 3: 4 }[k], h ? h.sx : undefined, h ? h.sy : undefined); }
      if (e.key === '?') return this.showKeys();
      const map = { b: 'brush', e: 'eraser', s: 'blend', g: 'fill', i: 'pick', v: 'move', t: 'text', h: 'hand' };
      if (map[k]) return this.setTool(map[k]);
      if (k === 'p') return this.togglePreview();
      if (k === 'k') return this.toggleTray();
      if (k === 'q') { const h = this.hover; const r = this.canvas.getBoundingClientRect(); return this.quickMenu(h ? r.left + h.sx : r.left + this.vw / 2, h ? r.top + h.sy : r.top + this.vh / 2); }
      if (k === 'x') return this.swapColors();
      if (k === '/') return this.layerOp('alpha');
      if (k === '[' || k === ']') {
        const p = this.preset, up = k === ']';
        if (e.shiftKey || e.key === '{' || e.key === '}') this.setBrushProp('opacity', Math.max(0.02, Math.min(1, p.opacity + (up ? 0.05 : -0.05))), true);
        else this.setBrushProp('size', Math.max(1, Math.min(600, p.size * (up ? 1.15 : 1 / 1.15))), true);
        this.updDock(); clearTimeout(this.rpT); this.rpT = setTimeout(() => this.renderPanels(), 400);
      }
      if (e.key === '{' || e.key === '}') { const p = this.preset; this.setBrushProp('opacity', Math.max(0.02, Math.min(1, p.opacity + (e.key === '}' ? 0.05 : -0.05))), true); this.updDock(); }
      if (k === '0') this.fit();
      if (k === '=' || k === '+') this.zoomBy(1.25);
      if (k === '-') this.zoomBy(0.8);
      if ((k === 'delete' || k === 'backspace') && this.selection.size) { e.preventDefault(); this.deleteSelected(); }
      if (k === 'escape') { if (this.closeQuick()) return; this.selectOnly(null); }
      const items = this.selItems.filter(l => !l.locked);
      if (items.length && k.startsWith('arrow')) { e.preventDefault(); const d = e.shiftKey ? 10 : 1; for (const sel of items) { if (k === 'arrowleft') sel.x -= d; if (k === 'arrowright') sel.x += d; if (k === 'arrowup') sel.y -= d; if (k === 'arrowdown') sel.y += d; } this.changed(); this.dirty = true; }
      if (k === 'pagedown') this.gotoPage(this.idx + 1);
      if (k === 'pageup') this.gotoPage(this.idx - 1);
    };
    this.keyUp = e => {
      if (e.key === 'Alt') { e.preventDefault(); this.altDown = false; this.updCursor(); } // also stops Alt from opening the browser menu
      if (e.key === ' ') { this.space = false; this.updCursor(); }
      if (e.key.toLowerCase() === 'z') { this.zDown = false; this.updCursor(); }
    };
    this.onBlur = () => { this.altDown = false; this.zDown = false; this.space = false; if (this.root) this.updCursor(); };
    document.addEventListener('keydown', this.keyDown); document.addEventListener('keyup', this.keyUp); window.addEventListener('blur', this.onBlur);
  }

  // ---------- save ----------
  updStatus(justSaved) {
    if (!this.status || this.isChanged || (this.saving && !justSaved)) return;
    if (!this.lastSaved) { this.status.textContent = 'Saved'; return; }
    const m = Math.floor((Date.now() - this.lastSaved) / 60000);
    this.status.textContent = m < 1 ? 'Saved just now' : `Saved ${m} min ago`;
    this.status.title = 'Your page saves by itself a few seconds after you stop drawing, and fully every 5 minutes. Ctrl+S saves now.';
  }
  changed(now) {
    this.isChanged = true; this.editedSinceSnap = true; this.status.textContent = 'Not saved yet';
    clearTimeout(this.saveTimer);
    const tick = () => { if (this.stroking || (performance.now() - (this.lastInput || 0) < 1800)) { this.saveTimer = setTimeout(tick, 800); return; } this.save(); };
    this.saveTimer = setTimeout(now ? () => this.save() : tick, now ? 10 : 2500);
  }
  async save(force) {
    if (!this.isChanged && !force) return;
    if (this.saving) { await this.saving; if (!this.isChanged) return; }
    clearTimeout(this.saveTimer);
    this.saving = (async () => {
      try {
        this.isChanged = false; this.status.textContent = 'Saving…';
        const P = this.page;
        const stored = await db.get('pages', P.id);
        // keep the version that was saved before this one, so it can be restored later
        const last = stored && stored.history && stored.history[0];
        if (stored && stored.ver > 1 && (force || !last || Date.now() - last.t > AUTOSAVE_MS)) { pushHistory(stored, 24); P.history = stored.history; } else if (stored) P.history = stored.history;
        for (const id of this.dirtyLayers) {
          const L = P.layers.find(l => l.id === id); if (!L || L.kind !== 'paint' || !this.res || !this.res[id]) continue;
          L.blob = await putBlob(await canvasBlob(this.res[id], 'image/png'));
        }
        this.dirtyLayers.clear();
        P.thumb = await putBlob(await makeThumb(P, this.book, 2048, this.res));
        P.ver = (P.ver || 1) + 1; P.updated = Date.now();
        await db.put('pages', P);
        this.book.updated = Date.now(); await db.put('books', this.book);
        this.lastSaved = Date.now(); this.updStatus(true);
        this.app.onPageSaved(P);
      } catch (e) {
        console.error(e); this.isChanged = true;
        this.status.textContent = 'Save failed';
        toast('Could not save: ' + e.message, 'err');
      }
    })();
    await this.saving; this.saving = null;
  }

  async gotoPage(i) {
    if (this.coverMode) return toast('You are drawing the cover. Go back to the book to draw on pages.');
    if (i < 0 || i >= this.book.pages.length) return;
    await this.save();
    this.idx = i; this.page = await db.get('pages', this.book.pages[i]);
    this.res = {}; this.dirtyLayers = new Set(); this.undo = []; this.redo = [];
    await this.loadPage(); this.updAnim(); this.fit();
  }

  async close() {
    await this.save();
    document.removeEventListener('keydown', this.keyDown); document.removeEventListener('keyup', this.keyUp); window.removeEventListener('blur', this.onBlur);
    clearInterval(this.autoT); clearInterval(this.statusT); document.removeEventListener('visibilitychange', this.onHide); window.removeEventListener('pagehide', this.onHide);
    this.closeQuick(); this.ro.disconnect();
    this.root.remove(); this.root = null;
    this.res = null; this.stroke = null; this.pre = null; this.paperCanvas = null;
    this.app.onEditorClosed(this.idx);
  }
}
