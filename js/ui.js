// Small UI helpers shared by every screen.
import { getSetting, setSetting } from './db.js';

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
export const $ = (s, r = document) => r.querySelector(s);

export function toast(msg, kind = '') {
  const t = el('div', { class: 'toast ' + kind }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, kind === 'err' ? 6000 : 2600);
}

export function modal(title, body, { buttons = [], wide = false, onClose, cls = '' } = {}) {
  const back = el('div', { class: 'modal-back' });
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const box = el('div', { class: 'modal ' + (wide ? 'wide ' : '') + cls, role: 'dialog', 'aria-label': title },
    el('div', { class: 'modal-head' }, el('h2', {}, title), el('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
    el('div', { class: 'modal-body' }, body),
    buttons.length ? el('div', { class: 'modal-foot' }, buttons.map(b => el('button', { class: b.primary ? 'btn primary' : 'btn', onclick: () => b.onClick(close) }, b.label))) : null);
  back.append(box);
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', esc);
  document.body.append(back);
  return { close, box };
}

export function confirmBox(title, text, yes = 'Yes') {
  return new Promise(res => {
    modal(title, el('p', {}, text), { buttons: [{ label: 'Cancel', onClick: c => { c(); res(false); } }, { label: yes, primary: true, onClick: c => { c(); res(true); } }], onClose: () => res(false) });
  });
}
export function promptBox(title, value = '') {
  return new Promise(res => {
    const inp = el('input', { type: 'text', value, class: 'full' });
    let done = false;
    const m = modal(title, inp, { buttons: [{ label: 'Cancel', onClick: c => { c(); } }, { label: 'OK', primary: true, onClick: c => { done = true; c(); res(inp.value); } }], onClose: () => { if (!done) res(null); } });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { done = true; m.close(); res(inp.value); } });
    setTimeout(() => inp.select(), 30);
  });
}

// labelled range input
export function slider(label, value, min, max, step, onInput, fmt) {
  const out = el('span', { class: 'val' }, fmt ? fmt(value) : value);
  const r = el('input', { type: 'range', min, max, step, value, 'aria-label': label });
  r.addEventListener('input', () => { const v = parseFloat(r.value); out.textContent = fmt ? fmt(v) : v; onInput(v); });
  const row = el('label', { class: 'row slider' }, el('span', { class: 'lbl' }, label), r, out);
  row.set = v => { r.value = v; out.textContent = fmt ? fmt(v) : v; };
  return row;
}
export function select(label, value, options, onChange) {
  const s = el('select', { 'aria-label': label }, Object.entries(options).map(([k, v]) => el('option', { value: k, selected: k === value }, typeof v === 'string' ? v : v.name)));
  s.addEventListener('change', () => onChange(s.value));
  return el('label', { class: 'row' }, el('span', { class: 'lbl' }, label), s);
}
export function colorInput(label, value, onInput) {
  const c = el('input', { type: 'color', value, 'aria-label': label });
  c.addEventListener('input', () => onInput(c.value));
  return el('label', { class: 'row' }, el('span', { class: 'lbl' }, label), c);
}
export function check(label, value, onChange) {
  const c = el('input', { type: 'checkbox', checked: value });
  c.addEventListener('change', () => onChange(c.checked));
  return el('label', { class: 'row check' }, c, el('span', {}, label));
}
export function numberInput(label, value, onChange, attrs = {}) {
  const n = el('input', { type: 'number', value, ...attrs });
  n.addEventListener('change', () => onChange(parseFloat(n.value)));
  return el('label', { class: 'row' }, el('span', { class: 'lbl' }, label), n);
}

export function pickFiles(accept = 'image/*', multiple = true) {
  return new Promise(res => {
    const i = el('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    i.addEventListener('change', () => { res([...i.files]); i.remove(); });
    document.body.append(i); i.click();
  });
}

// Save a file to the PC: straight into the chosen export folder if the browser allows it, else a normal download.
export async function saveFile(blob, name) {
  const dir = await getSetting('exportDir', null);
  if (dir && dir.requestPermission) {
    try {
      let perm = await dir.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await dir.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
        return { where: dir.name + '/' + name, folder: true };
      }
    } catch (e) { console.warn('folder save failed, using download', e); }
  }
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return { where: 'Downloads/' + name, folder: false };
}
export async function chooseExportFolder() {
  if (!window.showDirectoryPicker) { toast('This browser does not allow picking a folder. Files go to your Downloads folder. (In Brave, turn on brave://flags/#file-system-access-api.)', 'err'); return null; }
  try { const d = await window.showDirectoryPicker({ mode: 'readwrite', id: 'shesketches-exports' }); await setSetting('exportDir', d); toast('Exports will save to ' + d.name); return d; } catch (e) { return null; }
}

export const fmtBytes = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const safeName = s => String(s || 'untitled').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'untitled';
