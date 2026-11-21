// File writers that browsers do not have built in: zip, TIFF, BMP, PDF, plus DPI tags for PNG/JPG.

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(d, start = 0, end = d.length) { let c = 0xffffffff; for (let i = start; i < end; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// ---------- zip (store only; images are already compressed) ----------
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

export async function readZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a zip file.');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const out = [], dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true);
    let data = u8.subarray(lo + 30 + lnl + lxl, lo + 30 + lnl + lxl + csize);
    if (method === 8) data = await inflateRaw(data);
    out.push({ name, data });
    p += 46 + nl + xl + cl;
  }
  return out;
}

async function streamBytes(u8, stream) {
  const s = new Blob([u8]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const inflateRaw = u8 => streamBytes(u8, new DecompressionStream('deflate-raw'));
export const deflate = u8 => streamBytes(u8, new CompressionStream('deflate')); // zlib format, what PDF FlateDecode wants

// ---------- PNG: add pHYs (DPI) and sRGB chunks ----------
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}
export async function pngWithDpi(blob, dpi) {
  const u8 = new Uint8Array(await blob.arrayBuffer());
  // keep everything, insert right after IHDR (8 sig + 25 IHDR); skip if already present
  const ppm = Math.round(dpi / 0.0254);
  const phys = new Uint8Array(9); const dv = new DataView(phys.buffer);
  dv.setUint32(0, ppm); dv.setUint32(4, ppm); phys[8] = 1;
  const parts = [u8.subarray(0, 33), chunk('pHYs', phys)];
  const hasSrgb = findChunk(u8, 'sRGB');
  if (!hasSrgb) parts.push(chunk('sRGB', new Uint8Array([0])));
  parts.push(u8.subarray(33));
  return new Blob(parts, { type: 'image/png' });
}
function findChunk(u8, type) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 8;
  while (p + 8 < u8.length) {
    const len = dv.getUint32(p), t = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
    if (t === type) return p;
    if (t === 'IDAT') return 0;
    p += 12 + len;
  }
  return 0;
}
export function pngInfo(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const w = dv.getUint32(16), h = dv.getUint32(20), bitDepth = u8[24], colorType = u8[25];
  let dpi = 0; const p = findChunk(u8, 'pHYs');
  if (p) { const ppm = dv.getUint32(p + 8); if (u8[p + 16] === 1) dpi = Math.round(ppm * 0.0254); }
  return { w, h, bitDepth, alpha: colorType === 6 || colorType === 4, dpi };
}

// ---------- JPEG: set JFIF density ----------
export async function jpgWithDpi(blob, dpi) {
  const u8 = new Uint8Array(await blob.arrayBuffer());
  if (u8[2] === 0xff && u8[3] === 0xe0 && u8[6] === 0x4a && u8[7] === 0x46) { // JFIF APP0
    u8[13] = 1; u8[14] = dpi >> 8; u8[15] = dpi & 255; u8[16] = dpi >> 8; u8[17] = dpi & 255;
    return new Blob([u8], { type: 'image/jpeg' });
  }
  const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 1, dpi >> 8, dpi & 255, dpi >> 8, dpi & 255, 0, 0]);
  return new Blob([u8.subarray(0, 2), app0, u8.subarray(2)], { type: 'image/jpeg' });
}

// ---------- TIFF (baseline, uncompressed, 8-bit RGB or RGBA, with DPI) ----------
export function encodeTIFF(imgData, dpi, alpha) {
  const { width: w, height: h, data } = imgData;
  const spp = alpha ? 4 : 3;
  const pix = new Uint8Array(w * h * spp);
  for (let i = 0, j = 0; i < data.length; i += 4) {
    pix[j++] = data[i]; pix[j++] = data[i + 1]; pix[j++] = data[i + 2];
    if (alpha) pix[j++] = data[i + 3];
  }
  const entries = [];
  const E = (tag, type, count, value) => entries.push({ tag, type, count, value });
  const nTags = alpha ? 13 : 12;
  const ifdOff = 8, ifdSize = 2 + nTags * 12 + 4;
  const bpsOff = ifdOff + ifdSize, resOff = bpsOff + spp * 2, dataOff = resOff + 16;
  E(256, 4, 1, w); E(257, 4, 1, h); E(258, 3, spp, bpsOff); E(259, 3, 1, 1); E(262, 3, 1, 2);
  E(273, 4, 1, dataOff); E(277, 3, 1, spp); E(278, 4, 1, h); E(279, 4, 1, pix.length);
  E(282, 5, 1, resOff); E(283, 5, 1, resOff + 8); E(296, 3, 1, 2);
  if (alpha) E(338, 3, 1, 2); // unassociated alpha
  entries.sort((a, b) => a.tag - b.tag);
  const buf = new ArrayBuffer(dataOff + pix.length), dv = new DataView(buf);
  dv.setUint16(0, 0x4949); dv.setUint16(2, 42, true); dv.setUint32(4, ifdOff, true);
  dv.setUint16(ifdOff, entries.length, true);
  entries.forEach((e, i) => {
    const o = ifdOff + 2 + i * 12;
    dv.setUint16(o, e.tag, true); dv.setUint16(o + 2, e.type, true); dv.setUint32(o + 4, e.count, true);
    if (e.type === 3 && e.count === 1) dv.setUint16(o + 8, e.value, true); else dv.setUint32(o + 8, e.value, true);
  });
  dv.setUint32(ifdOff + 2 + entries.length * 12, 0, true);
  for (let i = 0; i < spp; i++) dv.setUint16(bpsOff + i * 2, 8, true);
  dv.setUint32(resOff, dpi, true); dv.setUint32(resOff + 4, 1, true); dv.setUint32(resOff + 8, dpi, true); dv.setUint32(resOff + 12, 1, true);
  new Uint8Array(buf, dataOff).set(pix);
  return new Blob([buf], { type: 'image/tiff' });
}
export function tiffInfo(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint16(0) !== 0x4949 || dv.getUint16(2, true) !== 42) return null;
  const ifd = dv.getUint32(4, true), n = dv.getUint16(ifd, true), r = {};
  for (let i = 0; i < n; i++) { const o = ifd + 2 + i * 12, tag = dv.getUint16(o, true), type = dv.getUint16(o + 2, true); r[tag] = type === 3 ? dv.getUint16(o + 8, true) : dv.getUint32(o + 8, true); }
  let dpi = 0; if (r[282]) dpi = Math.round(dv.getUint32(r[282], true) / dv.getUint32(r[282] + 4, true));
  return { w: r[256], h: r[257], spp: r[277], alpha: r[277] === 4, dpi, compression: r[259] };
}

// ---------- BMP (32-bit BGRA with alpha, or 24-bit) ----------
export function encodeBMP(imgData, dpi, alpha) {
  const { width: w, height: h, data } = imgData;
  const bpp = alpha ? 4 : 3, row = alpha ? w * 4 : (w * 3 + 3) & ~3;
  const head = alpha ? 14 + 108 : 54, size = head + row * h;
  const buf = new ArrayBuffer(size), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint16(0, 0x424d); dv.setUint32(2, size, true); dv.setUint32(10, head, true);
  dv.setUint32(14, alpha ? 108 : 40, true); dv.setInt32(18, w, true); dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true); dv.setUint16(28, bpp * 8, true); dv.setUint32(30, alpha ? 3 : 0, true);
  dv.setUint32(34, row * h, true);
  const ppm = Math.round(dpi / 0.0254); dv.setUint32(38, ppm, true); dv.setUint32(42, ppm, true);
  if (alpha) { dv.setUint32(54, 0x00ff0000, true); dv.setUint32(58, 0x0000ff00, true); dv.setUint32(62, 0x000000ff, true); dv.setUint32(66, 0xff000000, true); dv.setUint32(70, 0x73524742, true); }
  for (let y = 0; y < h; y++) {
    let o = head + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      u8[o++] = data[i + 2]; u8[o++] = data[i + 1]; u8[o++] = data[i];
      if (alpha) u8[o++] = data[i + 3];
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}
export function bmpInfo(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint16(0) !== 0x424d) return null;
  return { w: dv.getInt32(18, true), h: Math.abs(dv.getInt32(22, true)), alpha: dv.getUint16(28, true) === 32, dpi: Math.round(dv.getUint32(38, true) * 0.0254) };
}

// ---------- PDF (one image per page; lossless Flate or JPEG) ----------
// pages: [{ wPt, hPt, img: {kind:'flate'|'jpeg', w, h, bytes, smask?}, marks: {trim:[x,y,w,h], bleedPt} }]
export async function buildPDF(pages, title = 'SHESKETCHES') {
  const enc = new TextEncoder();
  const objs = []; // index = obj number - 1
  const add = parts => { objs.push(parts); return objs.length; };
  const catalogN = add(null), pagesN = add(null);
  const kids = [];
  for (const pg of pages) {
    const im = pg.img;
    let smaskN = 0;
    if (im.smask) smaskN = add([enc.encode(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${im.smask.length} >>\nstream\n`), im.smask, enc.encode('\nendstream')]);
    const filter = im.kind === 'jpeg' ? '/DCTDecode' : '/FlateDecode';
    const imgN = add([enc.encode(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter}${smaskN ? ` /SMask ${smaskN} 0 R` : ''} /Length ${im.bytes.length} >>\nstream\n`), im.bytes, enc.encode('\nendstream')]);
    const [ix, iy, iw, ih] = pg.place;
    let cs = `q ${iw.toFixed(3)} 0 0 ${ih.toFixed(3)} ${ix.toFixed(3)} ${iy.toFixed(3)} cm /Im0 Do Q\n`;
    if (pg.marks && pg.marks.draw) cs += cropMarks(pg.marks);
    const csb = enc.encode(cs);
    const csN = add([enc.encode(`<< /Length ${csb.length} >>\nstream\n`), csb, enc.encode('\nendstream')]);
    const trim = pg.marks ? pg.marks.trim : null;
    const boxes = trim ? ` /TrimBox [${trim.map(v => v.toFixed(3)).join(' ')}] /BleedBox [${pg.marks.bleed.map(v => v.toFixed(3)).join(' ')}]` : '';
    const pageN = add([enc.encode(`<< /Type /Page /Parent ${pagesN} 0 R /MediaBox [0 0 ${pg.wPt.toFixed(3)} ${pg.hPt.toFixed(3)}]${boxes} /Resources << /XObject << /Im0 ${imgN} 0 R >> >> /Contents ${csN} 0 R >>`)]);
    kids.push(pageN);
  }
  objs[catalogN - 1] = [enc.encode(`<< /Type /Catalog /Pages ${pagesN} 0 R >>`)];
  objs[pagesN - 1] = [enc.encode(`<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`)];
  const infoN = add([enc.encode(`<< /Title (${title.replace(/[()\\]/g, '')}) /Producer (SHESKETCHES) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}) >>`)]);
  const out = [enc.encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  let off = out[0].length; const xref = [];
  objs.forEach((parts, i) => {
    xref.push(off);
    const head = enc.encode(`${i + 1} 0 obj\n`), tail = enc.encode('\nendobj\n');
    out.push(head, ...parts, tail);
    off += head.length + tail.length + parts.reduce((s, p) => s + p.length, 0);
  });
  let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  xref.forEach(o => x += String(o).padStart(10, '0') + ' 00000 n \n');
  x += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogN} 0 R /Info ${infoN} 0 R >>\nstartxref\n${off}\n%%EOF\n`;
  out.push(enc.encode(x));
  return new Blob(out, { type: 'application/pdf' });
}
function cropMarks(m) {
  const [x, y, w, h] = m.trim, b = m.bleedPt, L = 14, g = b + 3;
  let s = '0 0 0 RG 0.3 w\n';
  const ln = (x1, y1, x2, y2) => s += `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
  for (const cx of [x, x + w]) for (const cy of [y, y + h]) {
    const dx = cx === x ? -1 : 1, dy = cy === y ? -1 : 1;
    ln(cx + dx * g, cy, cx + dx * (g + L), cy);
    ln(cx, cy + dy * g, cx, cy + dy * (g + L));
  }
  return s;
}
export function pdfInfo(u8) {
  const txt = new TextDecoder('latin1').decode(u8);
  const pages = (txt.match(/\/Type \/Page\b(?!s)/g) || []).length;
  return { ok: txt.startsWith('%PDF-') && txt.trimEnd().endsWith('%%EOF'), pages };
}

// ---------- GIF frame counter ----------
export function gifInfo(u8) {
  if (String.fromCharCode(u8[0], u8[1], u8[2]) !== 'GIF') return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const w = dv.getUint16(6, true), h = dv.getUint16(8, true);
  let p = 13; const flags = u8[10];
  if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
  let frames = 0, loop = false, transparent = false;
  const skipSub = () => { while (u8[p]) p += u8[p] + 1; p++; };
  while (p < u8.length) {
    const b = u8[p++];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = u8[p++];
      if (label === 0xf9 && (u8[p + 1] & 1)) transparent = true;
      if (label === 0xff && String.fromCharCode(...u8.subarray(p + 1, p + 12)) === 'NETSCAPE2.0') loop = true;
      skipSub();
    } else if (b === 0x2c) {
      frames++;
      const lf = u8[p + 8]; p += 9;
      if (lf & 0x80) p += 3 * (1 << ((lf & 7) + 1));
      p++; skipSub();
    } else break;
  }
  return { w, h, frames, loop, transparent };
}
