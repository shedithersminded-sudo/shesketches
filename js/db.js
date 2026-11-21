// SHESKETCHES storage. Everything lives in this browser's IndexedDB on this PC.
// Nothing is uploaded anywhere, so every person who opens the app gets their own studio.
const DB_NAME = 'shesketches';
const DB_VER = 1;
const STORES = ['books', 'pages', 'assets', 'blobs', 'exports', 'settings'];
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'blobs' ? 'id' : 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const st = t.objectStore(store);
    let out;
    Promise.resolve(fn(st)).then(v => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Storage was blocked. Free some disk space and try again.'));
  }));
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const db = {
  get: (store, id) => tx(store, 'readonly', st => req(st.get(id))),
  all: (store) => tx(store, 'readonly', st => req(st.getAll())),
  put: (store, obj) => tx(store, 'readwrite', st => req(st.put(obj))),
  del: (store, id) => tx(store, 'readwrite', st => req(st.delete(id))),
  putMany: (store, list) => tx(store, 'readwrite', st => { list.forEach(o => st.put(o)); }),
};

// ---- blobs: immutable, referenced by id. Old versions stay until garbage collected.
export async function putBlob(blob, id = uid('b_')) {
  await db.put('blobs', { id, blob, size: blob.size, t: Date.now() });
  return id;
}
export async function getBlob(id) {
  if (!id) return null;
  const r = await db.get('blobs', id);
  return r ? r.blob : null;
}

// ---- settings
export async function getSetting(key, def) {
  const r = await db.get('settings', key);
  return r ? r.value : def;
}
export const setSetting = (key, value) => db.put('settings', { id: key, value });

// Ask the browser to keep our data even when disk space is low.
export async function persist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { }
  return false;
}
export async function usage() {
  try { const e = await navigator.storage.estimate(); return e; } catch (e) { return null; }
}

// Remove blobs nothing points to any more (old versions beyond history, deleted pages).
export async function collectGarbage() {
  const [pages, assets, books, blobs] = await Promise.all([db.all('pages'), db.all('assets'), db.all('books'), db.all('blobs')]);
  const keep = new Set();
  const walk = v => { if (!v) return; if (typeof v === 'string') { if (v.startsWith('b_')) keep.add(v); return; } if (typeof v === 'object') for (const k in v) walk(v[k]); };
  pages.forEach(walk); assets.forEach(walk); books.forEach(walk);
  const dead = blobs.filter(b => !keep.has(b.id) && Date.now() - b.t > 60000);
  for (const b of dead) await db.del('blobs', b.id);
  return { removed: dead.length, freed: dead.reduce((s, b) => s + (b.size || 0), 0) };
}

// ---- project file (.shesketch): a plain zip with book.json plus every blob it uses.
import { makeZip, readZip } from './encoders.js';

export async function packBook(bookId) {
  const book = await db.get('books', bookId);
  const pages = (await Promise.all(book.pages.map(id => db.get('pages', id)))).filter(Boolean);
  const assetIds = new Set();
  const blobIds = new Set();
  const walk = v => { if (!v) return; if (typeof v === 'string') { if (v.startsWith('b_')) blobIds.add(v); if (v.startsWith('a_')) assetIds.add(v); return; } if (typeof v === 'object') for (const k in v) walk(v[k]); };
  walk(book); pages.forEach(p => walk({ ...p, history: null }));
  const assets = (await Promise.all([...assetIds].map(id => db.get('assets', id)))).filter(Boolean);
  assets.forEach(walk);
  const files = [{ name: 'book.json', data: new TextEncoder().encode(JSON.stringify({ app: 'SHESKETCHES', v: 1, book, pages: pages.map(p => ({ ...p, history: [] })), assets })) }];
  for (const id of blobIds) {
    const b = await getBlob(id);
    if (b) files.push({ name: 'blobs/' + id, data: new Uint8Array(await b.arrayBuffer()) });
  }
  return { blob: makeZip(files), book, pages: pages.length, blobs: blobIds.size };
}

export async function unpackBook(file) {
  const files = await readZip(new Uint8Array(await file.arrayBuffer()));
  const meta = files.find(f => f.name === 'book.json');
  if (!meta) throw new Error('This file is not a SHESKETCHES project.');
  const data = JSON.parse(new TextDecoder().decode(meta.data));
  if (data.app !== 'SHESKETCHES') throw new Error('This file is not a SHESKETCHES project.');
  // new ids so an imported copy never overwrites a book that is already here
  const map = {};
  const re = id => map[id] || (map[id] = id.slice(0, 2) + uid());
  const bookOld = data.book.id;
  for (const f of files) if (f.name.startsWith('blobs/')) {
    const id = f.name.slice(6);
    await putBlob(new Blob([f.data]), re(id));
  }
  const swap = v => { if (typeof v === 'string' && (v.startsWith('b_') || v.startsWith('a_') || v.startsWith('p_'))) return re(v); if (Array.isArray(v)) return v.map(swap); if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = swap(v[k]); return o; } return v; };
  const assets = data.assets.map(swap);
  const pages = data.pages.map(swap);
  const book = swap(data.book);
  book.id = uid('k_'); map[bookOld] = book.id;
  book.title = book.title + ' (imported)';
  pages.forEach(p => p.bookId = book.id);
  await db.putMany('assets', assets);
  await db.putMany('pages', pages);
  await db.put('books', book);
  return book;
}
