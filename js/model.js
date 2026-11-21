// Book and page data. Pure data, no drawing.
import { db, uid } from './db.js';

export const SIZES = {
  a6: { name: 'A6 pocket', w: 105, h: 148 },
  a5: { name: 'A5', w: 148, h: 210 },
  b5: { name: 'B5', w: 176, h: 250 },
  a4: { name: 'A4', w: 210, h: 297 },
  sq: { name: 'Square 20 cm', w: 200, h: 200 },
  sq14: { name: 'Square 14 cm', w: 140, h: 140 },
  letter: { name: 'US Letter', w: 216, h: 279 },
  land: { name: 'Landscape A5', w: 210, h: 148 },
};

export const BINDINGS = { hard: 'Hardcover', soft: 'Softcover', spiral: 'Spiral', ring: 'Ring binder' };

// Ready-made kinds of books. Everything can still be changed after.
export const BOOK_TYPES = {
  classic:   { name: 'Classic sketchbook', desc: 'A5 hardcover, 96 pages of heavy sketch paper, elastic band and ribbon.', size: 'a5', binding: 'hard', pages: 96, paper: 'sketch', material: 'linen', coverColor: '#5a1414', paperWeight: 150 },
  chunky:    { name: 'Chunky journal', desc: 'A thick brick of 400 thin cream pages in leather with brass corners.', size: 'custom', wMM: 130, hMM: 190, binding: 'hard', pages: 400, paper: 'cream', material: 'leather', coverColor: '#3b2a1e', paperWeight: 100, corners: 'brass', wear: 0.5, edges: 'natural' },
  brick:     { name: 'Giant brick', desc: '600 pages. As thick as books get.', size: 'a5', binding: 'hard', pages: 600, paper: 'smooth', material: 'cloth', coverColor: '#24343f', paperWeight: 90, edges: 'gold' },
  pocket:    { name: 'Pocket sketchbook', desc: 'Small A6 softcover that fits in a pocket.', size: 'a6', binding: 'soft', pages: 64, paper: 'sketch', material: 'cloth', coverColor: '#1d1d1f', paperWeight: 120 },
  mini:      { name: 'Mini square', desc: 'A tiny 14 cm square hardcover.', size: 'sq14', binding: 'hard', pages: 40, paper: 'white', material: 'suede', coverColor: '#c86aa0', paperWeight: 160 },
  studio:    { name: 'Large studio book', desc: 'Big A4 pages of textured art paper.', size: 'a4', binding: 'hard', pages: 48, paper: 'textured', material: 'canvas', coverColor: '#2c3e50', paperWeight: 220 },
  watercolor:{ name: 'Watercolor journal', desc: 'Square book of thick cold press watercolor paper.', size: 'sq', binding: 'hard', pages: 40, paper: 'coldpress', material: 'linen', coverColor: '#6b4a3a', paperWeight: 300 },
  spiral:    { name: 'Spiral sketchpad', desc: 'A4 pad with a wire spiral and a kraft cover.', size: 'a4', binding: 'spiral', pages: 60, paper: 'sketch', material: 'kraft', coverColor: '#b8946a', paperWeight: 160 },
  ring:      { name: 'Ring binder', desc: 'A5 binder with three metal rings.', size: 'a5', binding: 'ring', pages: 80, paper: 'smooth', material: 'denim', coverColor: '#2f4a6e', paperWeight: 120 },
  landscape: { name: 'Landscape book', desc: 'Wide pages for scenes and panoramas.', size: 'land', binding: 'hard', pages: 60, paper: 'sketch', material: 'linen', coverColor: '#2f5d3a', paperWeight: 150 },
  flip:      { name: 'Flip book', desc: 'Small, thin pages for drawing frame by frame, then flicking through them.', size: 'custom', wMM: 100, hMM: 70, binding: 'soft', pages: 120, paper: 'white', material: 'board', coverColor: '#e0533d', paperWeight: 90, flip: true },
  black:     { name: 'Black paper book', desc: 'Black pages for gel pens, pastels and metallic ink.', size: 'a5', binding: 'hard', pages: 64, paper: 'black', material: 'leather', coverColor: '#141414', paperWeight: 160, edges: 'black' },
  kraftj:    { name: 'Kraft journal', desc: 'Brown kraft pages in a kraft cover.', size: 'custom', wMM: 120, hMM: 180, binding: 'soft', pages: 80, paper: 'kraft', material: 'kraft', coverColor: '#a07c52', paperWeight: 130 },
  traveler:  { name: 'Traveler journal', desc: 'Long, slim leather journal with aged pages.', size: 'custom', wMM: 110, hMM: 210, binding: 'soft', pages: 96, paper: 'vintage', material: 'leather', coverColor: '#6b3e1f', paperWeight: 110, wear: 0.65 },
  dotted:    { name: 'Dot grid notebook', desc: 'A5 notebook with dot grid pages.', size: 'a5', binding: 'soft', pages: 120, paper: 'dotgrid', material: 'board', coverColor: '#2a2a2c', paperWeight: 100 },
  toned:     { name: 'Toned sketchbook', desc: 'Gray toned paper for drawing lights and darks.', size: 'a5', binding: 'hard', pages: 64, paper: 'toned', material: 'cloth', coverColor: '#3a3a3c', paperWeight: 150 },
};

export function pagePx(book) {
  const { wMM, hMM, dpi } = book.size;
  return { w: Math.round(wMM / 25.4 * dpi), h: Math.round(hMM / 25.4 * dpi) };
}

// Every part of the book you can draw on. The front cover keeps using book.coverPage; the rest live in book.surf.
export const SURFACES = {
  cover: { name: 'Front cover', help: 'The outside of the front cover.' },
  back: { name: 'Back cover', help: 'The outside of the back. The book flips over so you can see it.' },
  inFront: { name: 'Inside front cover', help: 'The inside of the front cover, seen when you open the book.' },
  inBack: { name: 'Inside back cover', help: 'The inside of the back cover, seen on the last spread.' },
  spine: { name: 'Spine', help: 'The narrow side where the book is bound.' },
  edge: { name: 'Page edges', help: 'The side of the pages, like a fore-edge painting.' },
  desk: { name: 'Desk', help: 'The desk around the book. Draw on it or cover it in stickers.' },
};
// thickness of the page block and the covers, in mm
export function blockMM(book) {
  const sheets = Math.floor(book.pages.length / 2), cov = (book.binding === 'hard' ? 2.6 : book.binding === 'soft' ? 0.5 : 1.6) * (book.cover?.thickness || 1);
  return { pages: Math.max(0.5, sheets * (book.paperWeight || 150) * 0.00125), cover: cov };
}
export function surfaceSize(book, key) {
  const { w, h } = pagePx(book), t = blockMM(book), hMM = book.size.hMM;
  // spine and page edges are long thin strips: as long as the page is tall, as high as the book is thick
  if (key === 'spine') return { w: h, h: Math.max(48, Math.round(h * (t.pages + t.cover * 2) / hMM)) };
  if (key === 'edge') return { w: h, h: Math.max(40, Math.round(h * t.pages / hMM)) };
  if (key === 'desk') return { w: 2400, h: 2400 };
  return { w, h };
}

export function newBookData(opts = {}) {
  const size = opts.size === 'custom' ? { w: opts.wMM || 148, h: opts.hMM || 210 } : SIZES[opts.size || 'a5'];
  return {
    id: uid('k_'),
    title: opts.title || 'New sketchbook',
    created: Date.now(), updated: Date.now(), opened: Date.now(),
    size: { preset: opts.size || 'a5', wMM: size.w, hMM: size.h, dpi: opts.dpi || 300 },
    binding: opts.binding || 'hard',
    cover: {
      material: opts.material || 'linen', color: opts.coverColor || '#5a1414', art: null, artFit: 'cover', artInset: 0.12,
      label: opts.title || '', labelColor: '#efe6d2', labelFont: 'Ink Free', thickness: 1, band: true, bandColor: '#121212',
      ribbon: true, ribbonColor: '#8a1010', corners: opts.corners || 'none', wear: opts.wear ?? 0.25,
      titleStyle: 'printed', titlePos: null, titleSize: 1,
    },
    endpaper: '#2a2522', endpaperPattern: 'plain', endpaper2: '#c9a46a',
    edges: opts.edges || 'natural', headband: '#8a1d1d',
    paperWeight: opts.paperWeight || 150, type: opts.type || null,
    light: { warmth: 0.3, strength: 1, angle: -50, height: 0.7, ambient: 1 },
    paper: { type: opts.paper || 'sketch', color: null, custom: null },
    pageNumbers: false, margins: 0,
    flip: { speed: opts.flip ? 0.45 : 0.9, curl: 0.6, flick: 0.16 },
    desk: { kind: 'walnut', color: '#2a2420' },
    pages: [],
    fav: false,
  };
}

export function newPageData(book, idx) {
  const { w, h } = pagePx(book);
  return {
    id: uid('p_'), bookId: book.id, w, h,
    paper: null, // null = use the book paper
    layers: [{ id: uid('l_'), name: 'Sketch', kind: 'paint', visible: true, opacity: 1, blend: 'source-over', locked: false, blob: null }],
    thumb: null, ver: 1, updated: Date.now(), history: [], seed: (idx || 0) + 1,
    section: '',
  };
}

export async function createBook(opts) {
  const book = newBookData(opts);
  const count = Math.max(2, (opts.pages || 24) + ((opts.pages || 24) % 2));
  const pages = [];
  for (let i = 0; i < count; i++) pages.push(newPageData(book, i));
  book.pages = pages.map(p => p.id);
  await db.putMany('pages', pages);
  await db.put('books', book);
  return book;
}

export async function addPages(book, at, n = 2) {
  const pages = [];
  for (let i = 0; i < n; i++) pages.push(newPageData(book, book.pages.length + i));
  book.pages.splice(at, 0, ...pages.map(p => p.id));
  book.updated = Date.now();
  await db.putMany('pages', pages);
  await db.put('books', book);
  return pages;
}

export async function removePages(book, ids) {
  book.pages = book.pages.filter(id => !ids.includes(id));
  for (const id of ids) await db.del('pages', id);
  book.updated = Date.now();
  await db.put('books', book);
}

export async function deleteBook(book) {
  for (const id of book.pages) await db.del('pages', id);
  await db.del('books', book.id);
}

// Keep the last N versions of a page so mistakes can be undone after closing the editor.
export function pushHistory(page, max = 12) {
  const snap = { t: Date.now(), layers: JSON.parse(JSON.stringify(page.layers)), paper: page.paper, thumb: page.thumb };
  page.history = [snap, ...(page.history || [])].slice(0, max);
}
