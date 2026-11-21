// Your library: imported art, stickers you made, textures, fonts. Stored only in this browser.
import { db, uid, putBlob, getBlob } from './db.js';
import { el } from './ui.js';

export const KINDS = { art: 'My art', media: 'GIFs and videos', sticker: 'Stickers', made: 'Made in the makers', texture: 'Textures', font: 'Fonts' };
export const MEDIA_ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime,.gif,.svg,.avif';

async function frameCount(f) {
  try { if (!('ImageDecoder' in window)) return 1; const d = new ImageDecoder({ data: await f.arrayBuffer(), type: f.type }); await d.tracks.ready; const n = d.tracks.selectedTrack?.frameCount || 1; d.close(); return n; } catch (e) { return 1; }
}
async function importVideo(f) {
  const M = await import('../vendor/mediabunny.min.mjs');
  const input = new M.Input({ source: new M.BlobSource(f), formats: M.ALL_FORMATS });
  const tr = await input.getPrimaryVideoTrack(); if (!tr) throw new Error('No video track in ' + f.name);
  const dur = await input.computeDuration();
  const s = Math.min(1, 480 / Math.max(tr.displayWidth, tr.displayHeight));
  const sink = new M.CanvasSink(tr, { width: Math.round(tr.displayWidth * s), height: Math.round(tr.displayHeight * s), fit: 'fill' });
  let poster = null; for await (const w of sink.canvasesAtTimestamps([Math.min(0.5, dur / 2)])) if (w) poster = await new Promise(r => w.canvas.toBlob ? w.canvas.toBlob(r, 'image/webp', 0.8) : w.canvas.convertToBlob({ type: 'image/webp' }).then(r));
  const blobId = await putBlob(f), posterId = poster ? await putBlob(poster) : null;
  const a = { id: uid('a_'), kind: 'media', media: 'video', name: f.name.replace(/\.[^.]+$/, ''), blob: blobId, poster: posterId, w: tr.displayWidth, h: tr.displayHeight, duration: dur, created: Date.now(), type: f.type, size: f.size };
  await db.put('assets', a); return a;
}

export async function importFiles(files, kind = 'art') {
  const out = [];
  for (const f of files) {
    if (kind === 'font' || /\.(ttf|otf|woff2?)$/i.test(f.name)) { out.push(await addFont(f)); continue; }
    if (f.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(f.name)) { try { out.push(await importVideo(f)); } catch (e) { console.warn(e); } continue; }
    if (!f.type.startsWith('image/')) continue;
    const moving = /gif|webp|png|avif/.test(f.type) && (await frameCount(f)) > 1;
    // keep the original file bytes untouched
    const blobId = await putBlob(f);
    let w = 0, h = 0;
    try { const bm = await createImageBitmap(f); w = bm.width; h = bm.height; bm.close(); } catch (e) { continue; }
    const a = { id: uid('a_'), kind: moving ? 'media' : kind, media: moving ? 'gif' : null, name: f.name.replace(/\.[^.]+$/, ''), blob: blobId, w, h, created: Date.now(), type: f.type, size: f.size };
    await db.put('assets', a);
    out.push(a);
  }
  return out;
}

export async function addAsset(blob, kind, name, w, h, extra = {}) {
  const blobId = await putBlob(blob);
  const a = { id: uid('a_'), kind, name, blob: blobId, w, h, created: Date.now(), type: blob.type, size: blob.size, ...extra };
  await db.put('assets', a);
  return a;
}

async function addFont(f) {
  const blobId = await putBlob(f);
  const family = f.name.replace(/\.[^.]+$/, '').replace(/[^\w -]/g, '');
  const a = { id: uid('a_'), kind: 'font', name: family, blob: blobId, created: Date.now(), size: f.size };
  await db.put('assets', a);
  await loadFont(a);
  return a;
}
export async function loadFont(a) {
  try { const b = await getBlob(a.blob); const ff = new FontFace(a.name, await b.arrayBuffer()); await ff.load(); document.fonts.add(ff); } catch (e) { console.warn('font', e); }
}
export async function loadAllFonts() {
  const all = (await db.all('assets')).filter(a => a.kind === 'font');
  for (const a of all) await loadFont(a);
  return all.map(a => a.name);
}

export const SYSTEM_FONTS = ['Ink Free', 'Segoe Print', 'Segoe Script', 'Gabriola', 'Georgia', 'Times New Roman', 'Courier New', 'Consolas', 'Impact', 'Arial', 'Arial Black', 'Trebuchet MS', 'Lucida Handwriting', 'Brush Script MT'];

const urlCache = new Map();
export async function assetURL(a) {
  const id = a.poster || a.blob;
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await getBlob(id); if (!b) return '';
  const u = URL.createObjectURL(b); urlCache.set(id, u); return u;
}

// A grid of assets. onPick(asset) when clicked.
export async function assetGrid(kinds, onPick, { onDelete, empty = 'Nothing here yet.' } = {}) {
  const all = (await db.all('assets')).filter(a => kinds.includes(a.kind)).sort((a, b) => b.created - a.created);
  const grid = el('div', { class: 'asset-grid' });
  if (!all.length) grid.append(el('p', { class: 'muted' }, empty));
  for (const a of all) {
    if (a.kind === 'font') { grid.append(el('div', { class: 'asset font', style: { fontFamily: `"${a.name}"` } }, 'Aa ' + a.name)); continue; }
    const img = el('img', { alt: a.name, loading: 'lazy', draggable: 'false' });
    assetURL(a).then(u => img.src = u);
    const card = el('button', { class: 'asset ' + a.kind + (a.media ? ' has-badge' : ''), 'data-badge': a.media === 'video' ? 'VIDEO' : a.media === 'gif' ? 'GIF' : '', title: a.name + (a.w ? ` (${a.w}×${a.h})` : ''), onclick: () => onPick(a) }, img, el('span', {}, a.name));
    if (onDelete) card.append(el('span', { class: 'asset-del', title: 'Delete', role: 'button', onclick: e => { e.stopPropagation(); onDelete(a, card); } }, '✕'));
    grid.append(card);
  }
  return grid;
}
