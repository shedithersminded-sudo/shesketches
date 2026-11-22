// The 3D book. This is presentation only: it shows page previews made by render.js.
// Real artwork export never reads from here.
import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { coverTile, paperTile, deskTile, edgeTile, paintPaper, PAPERS } from './paper.js';
import { getBlob, putBlob, db } from './db.js';
import { renderPage, paperOf, makeThumb, pageHasMotion, motionRenderer, loadRes } from './render.js';

const SEG_X = 44, SEG_Y = 10;
const PI = Math.PI;
export const DESK_ART = 5; // the drawable desk area, in book heights, centered under the book
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class Book3D {
  constructor(host, { quality = 'balanced', reducedMotion = false } = {}) {
    this.host = host;
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this.renderer = this.makeRenderer();
    host.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.enableDamping = !reducedMotion;
    this.controls.maxPolarAngle = 1.5;
    this.controls.minDistance = 0.25; this.controls.maxDistance = 9;
    this.controls.addEventListener('change', () => { this.dirty = true; this.emit('camera'); });
    this.texCache = new Map(); // key -> texture
    this.pos = 0; this.turn = null; this.anim = null;
    this.listeners = {};
    this.setupScene();
    this.bindPointer();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.running = true;
    const loop = (t) => { if (!this.running) return; this.raf = requestAnimationFrame(loop); this.tick(t); };
    this.raf = requestAnimationFrame(loop);
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...a) { (this.listeners[ev] || []).forEach(f => f(...a)); }

  makeRenderer(canvas, forExport) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: !!forExport, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = forExport || this.quality !== 'performance';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    if (!forExport) r.setPixelRatio(Math.min(devicePixelRatio || 1, { max: 2, balanced: 1.5, performance: 1 }[this.quality] || 1.5));
    return r;
  }

  setupScene() {
    const s = this.scene;
    s.background = new THREE.Color('#141110');
    const pm = new THREE.PMREMGenerator(this.renderer);
    s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.35;
    s.add(new THREE.HemisphereLight('#fff4e6', '#3a2a20', 0.7));
    const key = this.key = new THREE.DirectionalLight('#ffe9cf', 2.4);
    key.position.set(-1.6, 3.2, 1.4);
    key.castShadow = true;
    const ss = { max: 4096, balanced: 2048, performance: 1024 }[this.quality] || 2048;
    key.shadow.mapSize.set(ss, ss);
    key.shadow.camera.left = -2; key.shadow.camera.right = 2; key.shadow.camera.top = 2; key.shadow.camera.bottom = -2;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 8;
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.025; key.shadow.radius = 5;
    s.add(key);
    const fill = this.fill = new THREE.DirectionalLight('#cfe0ff', 0.35); fill.position.set(2, 1.5, -1); s.add(fill);
    this.hemi = s.children.find(o => o.isHemisphereLight);
    // desk
    this.deskMat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0 });
    const desk = this.desk = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), this.deskMat);
    desk.rotation.x = -PI / 2; desk.position.y = -0.0006; desk.receiveShadow = true;
    s.add(desk);
    // what you draw or stick on the desk: a see-through picture lying on the desk around the book
    this.deskArtMat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, depthWrite: false });
    this.deskArt = new THREE.Mesh(new THREE.PlaneGeometry(DESK_ART, DESK_ART), this.deskArtMat);
    this.deskArt.rotation.x = -PI / 2; this.deskArt.position.y = -0.0002; this.deskArt.receiveShadow = true; this.deskArt.visible = false;
    s.add(this.deskArt);
    // holder: the hands that pick the book up; group: the book itself (turned over by applyFlip)
    this.holder = new THREE.Group(); s.add(this.holder);
    this.group = new THREE.Group(); this.holder.add(this.group);
  }

  setDesk(kind, color, opts = {}) {
    if (kind === 'photo' && opts.photo && !opts.img) { getBlob(opts.photo).then(b => b && createImageBitmap(b)).then(img => img && this.setDesk(kind, color, { ...opts, img })).catch(() => { }); return; }
    const src = kind === 'photo' && opts.img ? opts.img : deskTile(kind === 'photo' ? 'plain' : kind, color);
    const t = new THREE.CanvasTexture(src);
    const rep0 = (kind === 'cutmat' ? 6 : kind === 'photo' ? 3 : 9) / (opts.scale || 1);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep0, rep0); t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.deskMat.map?.dispose(); this.deskMat.map = t; this.deskMat.needsUpdate = true;
    this.scene.background = new THREE.Color({ oak: '#3b2c1f', pine: '#4a3a26', concrete: '#3a3937', marble: '#4a4846', cork: '#4a3524', linen: color, felt: color, plain: color }[kind] || '#121010');
    if (['linen', 'felt', 'plain'].includes(kind)) this.scene.background.multiplyScalar(0.45);
    this.scene.fog = new THREE.Fog(this.scene.background, 4, 12);
    this.dirty = true;
  }

  // light: warmth -1 (cool) .. 1 (warm), strength 0..2, angle in degrees around the book, height 0..1
  setLight(L = {}) {
    const warm = L.warmth ?? 0.3, str = L.strength ?? 1, ang = (L.angle ?? -50) * PI / 180, ht = L.height ?? 0.7;
    const c = new THREE.Color().setHSL(warm > 0 ? 0.09 : 0.6, Math.abs(warm) * 0.55, 0.85);
    this.key.color.copy(c); this.key.intensity = 2.4 * str;
    const r = 3.6; this.key.position.set(Math.sin(ang) * r * (1 - ht * 0.5), 1 + ht * 3, Math.cos(ang) * r * (1 - ht * 0.5));
    if (this.hemi) this.hemi.intensity = 0.7 * (L.ambient ?? 1);
    this.scene.environmentIntensity = 0.35 * (L.ambient ?? 1);
    this.dirty = true;
  }

  // ---------- build ----------
  async setBook(book) {
    this.book = book;
    this.clearBook();
    const P = book.size;
    this.H = 1; this.W = P.wMM / P.hMM;
    this.L = Math.floor(book.pages.length / 2);
    // real thicknesses: paper weight in gsm gives sheet thickness, covers are millimeters, all relative to page height
    const mm = 1 / P.hMM;
    this.t = Math.max(0.00025, (book.paperWeight || 150) * 0.00125 * mm);
    const bind = book.binding;
    this.coverT = (bind === 'hard' ? 2.6 : bind === 'soft' ? 0.5 : 1.6) * mm * (book.cover.thickness || 1);
    this.over = (bind === 'hard' ? 3.2 : 0.8) * mm;
    this.spiral = bind === 'spiral' || bind === 'ring';
    this.gap = this.spiral ? 0.028 : 0;
    this.k = this.W * 0.07;
    const paper = paperOf({ paper: null }, book);
    const ptile = paperTile(paper.type === 'custom' ? 'sketch' : paper.type, paper.color);
    this.paperColor = paper.color || (PAPERS[paper.type] || PAPERS.sketch).color;
    this.normalTex = new THREE.CanvasTexture(ptile.normal);
    this.normalTex.wrapS = this.normalTex.wrapT = THREE.RepeatWrapping;
    this.normalTex.repeat.set(P.hMM / 42 * this.W, P.hMM / 42);
    this.normalTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.paperRelief = 0.35 + (ptile.tooth || 0.5) * 0.7;
    // a blank sheet of this paper, shown while a page loads and on top of the page blocks, so paper never looks flat
    const bc = document.createElement('canvas'); bc.width = 1024; bc.height = Math.round(1024 / this.W);
    paintPaper(bc.getContext('2d'), bc.width, bc.height, paper.type === 'custom' ? 'sketch' : paper.type, paper.color, null, 3);
    this.blankTex = new THREE.CanvasTexture(bc); this.blankTex.colorSpace = THREE.SRGBColorSpace; this.blankTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.normalTex.colorSpace = THREE.NoColorSpace;
    // leaf slots: 4 visible leaves
    this.slots = [];
    for (let i = 0; i < 4; i++) this.slots.push(this.makeLeaf());
    // stacks
    const EDGE = { natural: null, gold: '#c9a24a', silver: '#c8c8cc', black: '#1a1716', red: '#8a1d1d', blue: '#23406e' };
    const ec = book.edges === 'custom' ? (book.edgeColor || '#888888') : EDGE[book.edges || 'natural'];
    this.edgeMetal = book.edges === 'gold' || book.edges === 'silver';
    this.edgeTex = new THREE.CanvasTexture(edgeTile(ec || this.paperColor));
    this.edgeTex.wrapS = this.edgeTex.wrapT = THREE.RepeatWrapping; this.edgeTex.colorSpace = THREE.SRGBColorSpace;
    this.surfArt = await this.loadSurfaces(book);
    this.foreTex = new THREE.CanvasTexture(this.foreEdgeCanvas(ec || this.paperColor, this.surfArt.edge));
    this.foreTex.colorSpace = THREE.SRGBColorSpace; this.foreTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.stackR = this.makeStack(1); this.stackL = this.makeStack(-1);
    await this.buildCovers();
    if (this.spiral) this.buildCoils();
    this.setDesk(book.desk?.kind || 'walnut', book.desk?.color, book.desk || {});
    await this.loadDeskArt();
    this.setLight(book.light || {});
    this.fit();
    this.applyState();
    this.applyFlip(this.flipped ? PI : 0);
    await this.refreshTextures();
    this.dirty = true;
  }

  clearBook() {
    if (!this.group) return;
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.group.clear();
    for (const t of this.texCache.values()) t.dispose();
    this.texCache.clear();
  }

  makeLeaf() {
    const nV = (SEG_X + 1) * (SEG_Y + 1);
    const pos = new THREE.BufferAttribute(new Float32Array(nV * 3), 3);
    const uvF = new Float32Array(nV * 2), uvB = new Float32Array(nV * 2), idx = [];
    for (let r = 0; r <= SEG_Y; r++) for (let i = 0; i <= SEG_X; i++) {
      const v = r * (SEG_X + 1) + i;
      uvF[v * 2] = i / SEG_X; uvF[v * 2 + 1] = 1 - r / SEG_Y;
      uvB[v * 2] = 1 - i / SEG_X; uvB[v * 2 + 1] = 1 - r / SEG_Y;
    }
    for (let r = 0; r < SEG_Y; r++) for (let i = 0; i < SEG_X; i++) {
      const a = r * (SEG_X + 1) + i, b = a + SEG_X + 1, c = a + 1, d = b + 1;
      idx.push(a, b, c, c, b, d);
    }
    const gF = new THREE.BufferGeometry(); gF.setAttribute('position', pos); gF.setAttribute('uv', new THREE.BufferAttribute(uvF, 2)); gF.setIndex(idx);
    gF.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nV * 3), 3));
    // the gutter: paper near the spine sits in shadow, and the outer edge catches a little less light
    const col = new Float32Array(nV * 3);
    for (let r = 0; r <= SEG_Y; r++) for (let i = 0; i <= SEG_X; i++) {
      const u = i / SEG_X, k = (1 - 0.34 * Math.exp(-u / 0.05) - 0.12 * Math.exp(-u / 0.16)) * (1 - 0.05 * Math.exp(-(1 - u) / 0.03)), v = (r * (SEG_X + 1) + i) * 3;
      col[v] = col[v + 1] = col[v + 2] = k;
    }
    gF.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const gB = new THREE.BufferGeometry(); gB.setAttribute('position', pos); gB.setAttribute('uv', new THREE.BufferAttribute(uvB, 2)); gB.setIndex(idx);
    gB.setAttribute('normal', gF.attributes.normal); gB.setAttribute('color', gF.attributes.color);
    const mat = side => new THREE.MeshStandardMaterial({ map: this.blankTex, color: '#ffffff', roughness: 0.93, metalness: 0, side, vertexColors: true, normalMap: this.normalTex, normalScale: new THREE.Vector2(this.paperRelief, this.paperRelief) });
    const front = new THREE.Mesh(gF, mat(THREE.FrontSide)), back = new THREE.Mesh(gB, mat(THREE.BackSide));
    for (const m of [front, back]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.group.add(m); }
    return { front, back, geo: gF, leaf: -999 };
  }

  makeStack(side) {
    const g = new THREE.BufferGeometry();
    const n = SEG_X + 1;
    // vertices: top near(z+), top far(z-), bottom near, bottom far for each column
    const pos = new Float32Array((n * 6 + 4) * 3), uv = new Float32Array((n * 6 + 4) * 2);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    const V = (i, k) => i * 6 + k; // k: 0 top near,1 top far (top face), 2 bottom near,3 bottom far, 4 top near,5 top far (sides)
    for (let i = 0; i < SEG_X; i++) {
      idx.push(V(i, 1), V(i, 0), V(i + 1, 1), V(i + 1, 1), V(i, 0), V(i + 1, 0)); // top
    }
    const topCount = idx.length;
    for (let i = 0; i < SEG_X; i++) {
      idx.push(V(i, 2), V(i + 1, 2), V(i, 4), V(i, 4), V(i + 1, 2), V(i + 1, 4)); // near side
      idx.push(V(i, 3), V(i, 5), V(i + 1, 3), V(i + 1, 3), V(i, 5), V(i + 1, 5)); // far side
    }
    const sideCount = idx.length - topCount;
    const F = n * 6; idx.push(F, F + 1, F + 2, F + 2, F + 1, F + 3); // outer edge (fore-edge): its own vertices and picture
    g.setIndex(idx);
    g.addGroup(0, topCount, 0); g.addGroup(topCount, sideCount, 1); g.addGroup(topCount + sideCount, 6, 2);
    const top = new THREE.MeshStandardMaterial({ map: this.blankTex, color: '#f4f2ee', roughness: 0.95, side: THREE.DoubleSide, normalMap: this.normalTex, normalScale: new THREE.Vector2(this.paperRelief, this.paperRelief), polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 6 });
    const edge = new THREE.MeshStandardMaterial({ map: this.edgeTex, color: '#ffffff', roughness: this.edgeMetal ? 0.35 : 0.95, metalness: this.edgeMetal ? 0.8 : 0, side: THREE.DoubleSide });
    const fore = new THREE.MeshStandardMaterial({ map: this.foreTex, color: '#ffffff', roughness: this.edgeMetal ? 0.35 : 0.9, metalness: this.edgeMetal ? 0.8 : 0, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, [top, edge, fore]);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.userData.side = side;
    this.group.add(m);
    return m;
  }

  async buildCovers() {
    const b = this.book, W = this.W + this.over, H = this.H + this.over * 2, T = this.coverT;
    const cv = await this.coverCanvas(b, W / H);
    const tile = coverTile(b.cover.material, b.cover.color);
    const art = new THREE.CanvasTexture(cv); art.colorSpace = THREE.SRGBColorSpace; art.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const clear = !!b.cover.clear;
    const nrm = new THREE.CanvasTexture(tile.normal); nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.repeat.set(3 * W, 3 * H);
    const plain = new THREE.CanvasTexture(tile.canvas); plain.wrapS = plain.wrapT = THREE.RepeatWrapping; plain.colorSpace = THREE.SRGBColorSpace;
    const fx = this.coverFX(b, cv, tile, W, H);
    const outside = new THREE.MeshPhysicalMaterial({ map: art, normalMap: fx.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1, metalness: 1, roughnessMap: fx.rm, metalnessMap: fx.rm, sheen: tile.sheen ? 1 : 0, sheenColor: new THREE.Color(b.cover.color).offsetHSL(0, 0, 0.25), sheenRoughness: 0.5, clearcoat: b.cover.material === 'leather' || b.cover.material === 'croc' ? 0.25 : 0, clearcoatRoughness: 0.5 });
    const edgeM = new THREE.MeshStandardMaterial({ map: plain, normalMap: nrm, roughness: tile.rough, metalness: tile.metal || 0 });
    const endTex = new THREE.CanvasTexture(endpaperCanvas(b.endpaper || '#2a2522', b.endpaperPattern || 'plain', b.endpaper2 || '#c9a46a')); endTex.colorSpace = THREE.SRGBColorSpace;
    const sa = this.surfArt || {};
    const endBase = endTex.image;
    const insideF = new THREE.MeshStandardMaterial({ map: sa.inFront ? this.tex(compose(endBase, sa.inFront, true)) : endTex, roughness: 0.9 });
    const insideB = new THREE.MeshStandardMaterial({ map: sa.inBack ? this.tex(compose(endBase, sa.inBack, false)) : endTex, roughness: 0.9 });
    const inside = insideF;
    // the back cover's outside: the same cloth or leather, plus anything drawn on it
    const backBase = this.materialCanvas(b, W / H, 1600);
    const backOut = new THREE.MeshPhysicalMaterial({ map: this.tex(compose(backBase, sa.back, true)), normalMap: nrm, normalScale: new THREE.Vector2(0.9, 0.9), roughness: tile.rough, metalness: tile.metal || 0, sheen: tile.sheen ? 1 : 0, sheenColor: new THREE.Color(b.cover.color).offsetHSL(0, 0, 0.25), sheenRoughness: 0.5 });
    const geo = new THREE.BoxGeometry(W, T, H, 1, 1, 1); geo.translate(W / 2, T / 2, 0);
    // order: +x, -x, +y, -y, +z, -z
    this.cover = new THREE.Group();
    let faces = [edgeM, edgeM, outside, inside, edgeM, edgeM];
    if (clear) { // a sheet of clear plastic: page 1 shows through it
      const pl = o => new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, depthWrite: false, ...o });
      const top = pl({ map: art }), under = pl({ color: '#e9f1f6', opacity: 0.1 }), rim = pl({ color: '#d4e2ea', opacity: 0.55 });
      faces = [rim, rim, top, under, rim, rim];
    }
    const cm = new THREE.Mesh(geo, faces);
    cm.castShadow = !clear; cm.receiveShadow = true; cm.position.x = this.gap * 0.5;
    this.cover.add(cm); this.coverMesh = cm;
    this.group.add(this.cover);
    // metal corner protectors
    if (b.cover.corners && b.cover.corners !== 'none') {
      const cc = { gold: '#c9a24a', silver: '#cfcfd3', brass: '#a8864a', black: '#222' }[b.cover.corners] || '#c9a24a';
      const cmat = new THREE.MeshStandardMaterial({ color: cc, metalness: b.cover.corners === 'black' ? 0.3 : 0.95, roughness: 0.32, side: THREE.DoubleSide });
      const sz = Math.min(W, H) * 0.12, tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(sz, 0); tri.lineTo(0, sz); tri.lineTo(0, 0);
      const cg = new THREE.ExtrudeGeometry(tri, { depth: T + 0.0016, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0006, bevelSegments: 2 });
      cg.rotateX(PI / 2); // lie flat
      const addCorners = (parent, x0, y0) => {
        for (const zs of [-1, 1]) { // far and near outer corners
          const m = new THREE.Mesh(cg, cmat); m.castShadow = true;
          m.scale.set(-1, 1, -zs); m.position.set(x0 + W, y0 + T + 0.0008, zs * H / 2);
          parent.add(m);
        }
      };
      addCorners(this.cover, this.gap * 0.5, 0);
      this.backCorners = new THREE.Group(); addCorners(this.backCorners, this.gap * 0.5, 0); this.group.add(this.backCorners);
    }
    const backGeo = new THREE.BoxGeometry(W, T, H); backGeo.translate(W / 2 + this.gap * 0.5, T / 2, 0);
    this.back = new THREE.Mesh(backGeo, [edgeM, edgeM, insideB, backOut, edgeM, edgeM]);
    this.back.castShadow = this.back.receiveShadow = true;
    this.group.add(this.back);
    if (!this.spiral) {
      const spineArt = sa.spine ? new THREE.MeshStandardMaterial({ map: this.tex(compose(this.materialCanvas(b, sa.spine.width / sa.spine.height, 512), sa.spine, false)), normalMap: nrm, roughness: tile.rough, metalness: tile.metal || 0 }) : edgeM;
      this.spine = new THREE.Mesh(new THREE.BoxGeometry(T, 1, H), [edgeM, spineArt, edgeM, edgeM, edgeM, edgeM]);
      this.spine.castShadow = true; this.group.add(this.spine);
      if (b.binding === 'hard' && b.headband !== 'none') { // little stitched bands at the top and bottom of the spine
        const hm = new THREE.MeshStandardMaterial({ color: b.headband || '#8a1d1d', roughness: 0.6 });
        this.headbands = [1, -1].map(sg => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 1, 8), hm); m.userData.sg = sg; this.group.add(m); return m; });
      }
    }
    // elastic band
    if (b.cover.band) {
      const bm = new THREE.MeshStandardMaterial({ color: b.cover.bandColor || '#111', roughness: 0.6 });
      this.band = new THREE.Group();
      const bw = 0.014;
      this.bandTop = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.0025, H + 0.004), bm);
      this.bandN = new THREE.Mesh(new THREE.BoxGeometry(bw, 1, 0.0025), bm);
      this.bandF = new THREE.Mesh(new THREE.BoxGeometry(bw, 1, 0.0025), bm);
      for (const m of [this.bandTop, this.bandN, this.bandF]) { m.castShadow = true; this.band.add(m); }
      this.group.add(this.band);
    }
    if (b.cover.ribbon && !this.spiral) {
      // a satin ribbon bookmark: a chain of points that drapes, sways and settles, drawn as a strip with a V-cut tail
      const col = b.cover.ribbonColor || '#8a1010', N = 120; // enough joints to bend tightly over the page and cover edges
      const tex = new THREE.CanvasTexture(ribbonCanvas(col)); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
      const rm = new THREE.MeshPhysicalMaterial({ map: tex, color: '#ffffff', roughness: 0.38, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color(col).offsetHSL(0, 0, 0.35), side: THREE.DoubleSide });
      const len = this.H + 0.26, pos = new Float32Array(N * 3 * 3), uv = new Float32Array(N * 3 * 2), idx = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < 3; c++) { const v = r * 3 + c; uv[v * 2] = c / 2; uv[v * 2 + 1] = r / (N - 1) * len * 30; }
      for (let r = 0; r < N - 1; r++) for (let c = 0; c < 2; c++) { const a = r * 3 + c, b2 = a + 3; idx.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); rg.setIndex(idx);
      this.ribbon = new THREE.Mesh(rg, rm); this.ribbon.castShadow = true; this.ribbon.receiveShadow = true; this.ribbon.frustumCulled = false;
      this.group.add(this.ribbon);
      this.rib = { N, len, w: 0.0115, nodes: Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })), rest: Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, pin: true })), init: false, t: 0 };
    }
  }

  tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); return t; }

  // the cover material (cloth, leather...) as a flat picture with light wear, for the back cover and spine
  materialCanvas(b, aspect, Hc = 1024) {
    Hc = Math.max(64, Math.round(Hc)); const Wc = Math.max(16, Math.round(Hc * aspect)), c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
    const g = c.getContext('2d'), tile = coverTile(b.cover.material, b.cover.color);
    g.fillStyle = g.createPattern(tile.canvas, 'repeat'); g.fillRect(0, 0, Wc, Hc);
    const wear = b.cover.wear ?? 0.3, vg = g.createRadialGradient(Wc / 2, Hc / 2, Math.min(Wc, Hc) * 0.4, Wc / 2, Hc / 2, Math.max(Wc, Hc) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.06 + wear * 0.3})`); g.fillStyle = vg; g.fillRect(0, 0, Wc, Hc);
    return c;
  }

  // the side of the page block: one fine line per sheet, in the paper or edge color, plus any fore-edge painting
  foreEdgeCanvas(color, art) {
    const sheets = Math.max(1, this.L || 1), Hc = Math.min(2048, Math.max(128, sheets * 6)), Wc = 1024;
    const c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, Wc, Hc);
    if (art) { g.drawImage(art, 0, 0, Wc, Hc); }
    let sd = 99; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const step = Hc / sheets, dark = lum(color) < 0.3;
    // each sheet: a dark gap between sheets and a lit paper edge, so the lines read on light and dark paper
    for (let i = 0; i < sheets; i++) {
      const y = i * step; g.fillStyle = `rgba(0,0,0,${(dark ? 0.35 : 0.14) + rnd() * 0.1})`; g.fillRect(0, y, Wc, Math.max(0.7, step * 0.22));
      g.fillStyle = `rgba(255,255,255,${(dark ? 0.12 : 0.06) + rnd() * 0.06})`; g.fillRect(0, y + step * 0.45, Wc, Math.max(0.6, step * 0.2));
    }
    // tiny waviness so the pages do not look perfectly cut
    g.globalAlpha = 0.06; for (let i = 0; i < 60; i++) { g.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; g.fillRect(rnd() * Wc, 0, 1 + rnd() * 3, Hc); }
    g.globalAlpha = 1;
    return c;
  }

  // drawings on every part of the book (see SURFACES in model.js)
  async loadSurfaces(b) {
    const out = {}, surf = b.surf || {};
    await Promise.all(['back', 'inFront', 'inBack', 'spine', 'edge'].map(async k => {
      const id = surf[k]; if (!id) return;
      const p = await db.get('pages', id); if (!p || (p.ver || 1) <= 1) return;
      out[k] = await renderPage(p, b, { scale: Math.min(1, 1600 / Math.max(p.w, p.h)), background: 'transparent' });
    }));
    return out;
  }
  // the base picture for a part, used as the "paper" while you draw on it in the editor
  surfaceBase(key, w, h) {
    const b = this.book, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (key === 'back' || key === 'spine' || key === 'cover') g.drawImage(this.materialCanvas(b, w / h, h), 0, 0, w, h);
    else if (key === 'inFront' || key === 'inBack') g.drawImage(endpaperCanvas(b.endpaper || '#2a2522', b.endpaperPattern || 'plain', b.endpaper2 || '#c9a46a'), 0, 0, w, h);
    else if (key === 'edge') g.drawImage(this.foreEdgeCanvas(this.foreColor(), null), 0, 0, w, h);
    else if (key === 'desk') {
      const d = b.desk || {}, src = d.kind === 'photo' && this.deskMat.map?.image ? this.deskMat.map.image : deskTile(d.kind === 'photo' ? 'plain' : (d.kind || 'walnut'), d.color);
      const rep = (d.kind === 'cutmat' ? 6 : d.kind === 'photo' ? 3 : 9) / (d.scale || 1) * DESK_ART / 14, tw = w / rep;
      for (let y = 0; y < h; y += tw) for (let x = 0; x < w; x += tw) g.drawImage(src, x, y, tw + 1, tw + 1);
    }
    return c;
  }
  foreColor() { const EDGE = { gold: '#c9a24a', silver: '#c8c8cc', black: '#1a1716', red: '#8a1d1d', blue: '#23406e' }, b = this.book; return b.edges === 'custom' ? (b.edgeColor || '#888888') : EDGE[b.edges || 'natural'] || this.paperColor; }

  async loadDeskArt() {
    const id = this.book?.surf?.desk, p = id && await db.get('pages', id);
    if (!p || (p.ver || 1) <= 1) { this.deskArt.visible = false; this.dirty = true; return; }
    const c = await renderPage(p, this.book, { scale: Math.min(1, 3000 / p.w), background: 'transparent' });
    this.deskArtMat.map?.dispose(); this.deskArtMat.map = this.tex(c); this.deskArtMat.needsUpdate = true;
    this.deskArt.visible = true; this.dirty = true;
  }

  // quick live picture of a part while you drag a sticker on it (the full-quality one comes when you let go)
  async previewPart(kind, page, res, idx) {
    const b = this.book;
    if (kind === 'desk') {
      const c = await renderPage(page, b, { scale: 1200 / page.w, background: 'transparent', res });
      this.deskArtMat.map?.dispose(); this.deskArtMat.map = this.tex(c); this.deskArtMat.needsUpdate = true; this.deskArt.visible = true;
    } else if (kind === 'cover') {
      const W = this.W + this.over, H = this.H + this.over * 2, cv = await this.coverCanvas(b, W / H, page, res);
      const m = this.coverMesh.material[2]; m.map.image = cv; m.map.needsUpdate = true;
    } else if (kind === 'back') {
      const art = await renderPage(page, b, { scale: Math.min(1, 900 / page.h), background: 'transparent', res });
      const W = this.W + this.over, H = this.H + this.over * 2, m = this.back.material[3];
      m.map.image = compose(this.materialCanvas(b, W / H, 900), art, true); m.map.needsUpdate = true;
    } else if (kind === 'page') {
      const c = await renderPage(page, b, { scale: Math.min(1, 900 / page.h), res, pageNumber: b.pageNumbers ? idx + 1 : 0 });
      const leaf = Math.floor(idx / 2), side = idx % 2 ? 'back' : 'front', sl = this.slots.find(q => q.leaf === leaf); if (!sl) return;
      const mesh = sl[side]; let t = mesh.userData.dragTex;
      if (!t) { t = mesh.userData.dragTex = this.tex(c); } else { t.image = c; t.needsUpdate = true; }
      mesh.material.map = t; mesh.material.needsUpdate = true;
    }
    this.dirty = true;
  }

  // turn the closed book over to see the back cover, and back again
  setFlip(on) {
    on = !!on; if (on === !!this.flipped && !this.flipAnim) return;
    if (on && this.pos !== 0) this.goTo(0);
    const from = this.flipA || 0;
    this.flipped = on; this.flipAnim = { from, to: on ? PI : 0, t0: performance.now(), dur: this.reducedMotion ? 1 : 900 };
    this.dirty = true;
  }
  applyFlip(a) {
    this.flipA = a;
    const cx = (this.W + this.over) / 2, cy = (this.L * this.t + this.coverT * 2) / 2, lift = Math.sin(a) * 0.35;
    this.group.rotation.z = a;
    this.group.position.set(cx - (cx * Math.cos(a) - cy * Math.sin(a)), cy - (cx * Math.sin(a) + cy * Math.cos(a)) + lift, 0);
    this.dirty = true;
  }

  // Builds the cover's surface maps: cloth/leather relief everywhere, plus embossed or foil title.
  coverFX(b, cv, tile, W, H) {
    const Wc = 1024, Hc = Math.round(Wc * H / W);
    const nrm = document.createElement('canvas'); nrm.width = Wc; nrm.height = Hc;
    const ng = nrm.getContext('2d'); const pat = ng.createPattern(tile.normal, 'repeat');
    const rep = 3 * W; pat.setTransform(new DOMMatrix().scale(Wc / (512 * rep)));
    ng.fillStyle = pat; ng.fillRect(0, 0, Wc, Hc);
    const rm = document.createElement('canvas'); rm.width = Wc; rm.height = Hc;
    const rg = rm.getContext('2d'); const r0 = Math.round(tile.rough * 255), m0 = Math.round((tile.metal || 0) * 255);
    rg.fillStyle = `rgb(0,${r0},${m0})`; rg.fillRect(0, 0, Wc, Hc);
    const style = b.cover.titleStyle || 'printed';
    if (b.cover.label && (style === 'emboss' || style === 'deboss' || style.startsWith('foil'))) {
      const mask = document.createElement('canvas'); mask.width = Wc; mask.height = Hc;
      this.drawTitle(mask.getContext('2d'), b, Wc, Hc, '#fff');
      if (style.startsWith('foil')) { rg.save(); rg.filter = 'blur(0.6px)'; const fm = document.createElement('canvas'); fm.width = Wc; fm.height = Hc; const fg = fm.getContext('2d'); fg.drawImage(mask, 0, 0); fg.globalCompositeOperation = 'source-in'; fg.fillStyle = 'rgb(0,60,250)'; fg.fillRect(0, 0, Wc, Hc); rg.drawImage(fm, 0, 0); rg.restore(); }
      // height from the blurred title, turned into normals and laid over the cloth
      const bl = document.createElement('canvas'); bl.width = Wc; bl.height = Hc; const bg = bl.getContext('2d'); bg.filter = 'blur(2.5px)'; bg.drawImage(mask, 0, 0);
      const d = bg.getImageData(0, 0, Wc, Hc).data, out = ng.getImageData(0, 0, Wc, Hc), o = out.data, sgn = style === 'deboss' || style.startsWith('foil') ? -1 : 1, k = 0.06 * sgn;
      for (let y = 1; y < Hc - 1; y++) for (let x = 1; x < Wc - 1; x++) {
        const i = (y * Wc + x) * 4, dx = (d[i - 4 + 3] - d[i + 4 + 3]) * k, dy = (d[i + Wc * 4 + 3] - d[i - Wc * 4 + 3]) * k;
        if (Math.abs(dx) + Math.abs(dy) < 0.02) continue;
        const len = Math.hypot(dx, dy, 1); o[i] = (dx / len * 0.5 + 0.5) * 255; o[i + 1] = (dy / len * 0.5 + 0.5) * 255; o[i + 2] = 255 / len;
      }
      ng.putImageData(out, 0, 0);
    }
    const tn = new THREE.CanvasTexture(nrm); tn.colorSpace = THREE.NoColorSpace; tn.anisotropy = 8;
    const tr = new THREE.CanvasTexture(rm); tr.colorSpace = THREE.NoColorSpace;
    return { normal: tn, rm: tr };
  }

  drawTitle(g, b, Wc, Hc, colorOverride) {
    if (!b.cover.label) return;
    const fs = Math.round(Hc * 0.055 * (b.cover.titleSize || 1));
    const style = b.cover.titleStyle || 'printed';
    g.save();
    g.font = `${b.cover.titleBold ? '700 ' : ''}${fs}px "${b.cover.labelFont || 'Ink Free'}", "Segoe Print", cursive`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = String(b.cover.label).split('\n');
    const pos = b.cover.titlePos || (b.cover.art ? 'bottom' : 'upper');
    const y0 = { top: 0.12, upper: 0.32, center: 0.5, lower: 0.7, bottom: 0.9 }[pos] * Hc;
    if (style === 'label' && !colorOverride) { // a paper label stuck on the cover
      const wMax = Math.max(...lines.map(l => g.measureText(l).width)) + fs * 1.4, hh = lines.length * fs * 1.2 + fs * 0.9;
      g.save(); g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
      g.fillStyle = b.cover.labelBg || '#efe6d2'; g.fillRect(Wc / 2 - wMax / 2, y0 - hh / 2, wMax, hh); g.restore();
      g.strokeStyle = 'rgba(80,60,40,0.4)'; g.lineWidth = 2; g.strokeRect(Wc / 2 - wMax / 2 + 8, y0 - hh / 2 + 8, wMax - 16, hh - 16);
    }
    const col = colorOverride || (style === 'foil-gold' ? '#d8b25a' : style === 'foil-silver' ? '#d9d9de' : style === 'deboss' || style === 'emboss' ? 'rgba(0,0,0,0.0)' : (style === 'label' ? (b.cover.labelColor && b.cover.labelColor !== '#efe6d2' ? b.cover.labelColor : '#2a211a') : (b.cover.labelColor || '#efe6d2')));
    if (!colorOverride && style === 'printed') { g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 3; g.shadowOffsetY = 2; }
    if (!colorOverride && (style === 'emboss' || style === 'deboss')) { g.globalAlpha = 0.18; g.fillStyle = style === 'emboss' ? '#ffffff' : '#000000'; lines.forEach((ln, i) => g.fillText(ln, Wc / 2, y0 + (i - (lines.length - 1) / 2) * fs * 1.2)); g.restore(); return; }
    g.fillStyle = col;
    lines.forEach((ln, i) => g.fillText(ln, Wc / 2, y0 + (i - (lines.length - 1) / 2) * fs * 1.2));
    g.restore();
  }

  async coverCanvas(b, aspect, pageOverride, resOverride) {
    const Hc = 1600, Wc = Math.round(Hc * aspect), c = document.createElement('canvas');
    c.width = Wc; c.height = Hc;
    const g = c.getContext('2d');
    const tile = coverTile(b.cover.material, b.cover.color), clear = !!b.cover.clear;
    if (clear) { g.fillStyle = 'rgba(235,242,248,0.07)'; g.fillRect(0, 0, Wc, Hc); }
    else { g.fillStyle = g.createPattern(tile.canvas, 'repeat'); g.fillRect(0, 0, Wc, Hc); }
    let coverPage = null;
    if (pageOverride) coverPage = pageOverride; else if (b.coverPage) coverPage = await db.get('pages', b.coverPage);
    if (b.cover.art || (coverPage && coverPage.ver > 1)) {
      const blob = coverPage && coverPage.ver > 1 ? null : await getBlob(b.cover.art);
      const im = coverPage && coverPage.ver > 1 ? await renderPage(coverPage, b, { scale: Math.min(1, (resOverride ? 900 : 1600) / coverPage.h), background: 'transparent', res: resOverride }) : blob ? await createImageBitmap(blob) : null;
      if (im) {
        const inset = b.cover.artFit === 'full' || (coverPage && coverPage.ver > 1) ? 0 : (b.cover.artInset ?? 0.12) * Wc;
        const bw = Wc - inset * 2, bh = Hc - inset * 2;
        const s = b.cover.artFit === 'contain' ? Math.min(bw / im.width, bh / im.height) : Math.max(bw / im.width, bh / im.height);
        const dw = im.width * s, dh = im.height * s;
        g.save(); g.beginPath(); g.rect(inset, inset, bw, bh); g.clip();
        if (inset > 0) { g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 12; }
        g.drawImage(im, inset + (bw - dw) / 2, inset + (bh - dh) / 2, dw, dh);
        g.restore();
        // printed look: let the cloth texture show through a little
        g.globalAlpha = clear ? 0 : 0.18; g.globalCompositeOperation = 'multiply'; g.fillStyle = g.createPattern(tile.canvas, 'repeat'); g.fillRect(0, 0, Wc, Hc);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
    }
    Book3D.prototype.drawTitle.call(null, g, b, Wc, Hc);
    // wear: darker edges, rubbed corners and scuffs
    const wear = b.cover.wear ?? 0.3;
    if (clear) { // plastic: fine scratches that catch the light, no dark edges
      let sd = 777; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      g.strokeStyle = `rgba(255,255,255,${0.05 + wear * 0.12})`;
      for (let i = 0; i < 30 + 120 * wear; i++) { g.lineWidth = 0.5 + rnd(); const x = rnd() * Wc, y = rnd() * Hc, l = 8 + rnd() * 120, a = rnd() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      return c;
    }
    const vg = g.createRadialGradient(Wc / 2, Hc / 2, Math.min(Wc, Hc) * 0.4, Wc / 2, Hc / 2, Math.max(Wc, Hc) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.08 + wear * 0.35})`);
    g.fillStyle = vg; g.fillRect(0, 0, Wc, Hc);
    if (wear > 0.05) {
      let sd = 12345; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      g.save(); g.globalCompositeOperation = 'screen';
      for (const [cx, cy] of [[Wc, 0], [Wc, Hc], [0, 0], [0, Hc]]) { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Wc * 0.12 * wear + 10); gr.addColorStop(0, `rgba(255,240,220,${0.25 * wear})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, Wc, Hc); }
      g.strokeStyle = `rgba(255,245,230,${0.12 * wear})`;
      for (let i = 0; i < 40 * wear; i++) { g.lineWidth = 0.5 + rnd() * 1.5; const x = rnd() * Wc, y = rnd() * Hc, l = 10 + rnd() * 80, a = rnd() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      g.restore();
    }
    return c;
  }

  buildCoils() {
    const m = new THREE.MeshStandardMaterial({ color: '#c9c9cc', metalness: 0.9, roughness: 0.3 });
    const ring = this.book.binding === 'ring';
    const count = ring ? 3 : Math.floor(this.H / 0.034);
    const blockH = this.L * this.t + this.coverT * 2;
    const R = blockH / 2 + 0.018;
    const geo = new THREE.TorusGeometry(R, ring ? 0.006 : 0.0028, 8, 32);
    this.coils = new THREE.InstancedMesh(geo, m, count);
    const d = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const z = ring ? (i - 1) * this.H * 0.32 : -this.H / 2 + 0.02 + i * ((this.H - 0.04) / (count - 1));
      d.position.set(0, blockH / 2, z); d.rotation.set(0, 0, 0); d.updateMatrix();
      this.coils.setMatrixAt(i, d.matrix);
    }
    this.coils.castShadow = true; this.group.add(this.coils);
  }

  // ---------- geometry ----------
  // angle along the page at distance u from the spine
  bendLeaf(geo, theta, rise, dir, twist, pivotY) {
    const p = geo.attributes.position.array, W = this.W, H = this.H, k = this.k;
    const curl = (this.book.flip?.curl ?? 0.6) * 1.3;
    const du = W / SEG_X, sT = Math.sin(theta), cT = Math.cos(theta);
    const A = this.spiral ? 0 : rise / k;
    for (let r = 0; r <= SEG_Y; r++) {
      const z = -H / 2 + r / SEG_Y * H, zn = (z / H) * 2;
      let x = this.spiral ? (cT * this.gap / 2) : 0, y = pivotY + (this.spiral ? sT * this.gap / 2 : 0);
      for (let i = 0; i <= SEG_X; i++) {
        const v = (r * (SEG_X + 1) + i) * 3;
        p[v] = x; p[v + 1] = y; p[v + 2] = z;
        if (i === SEG_X) break;
        const u = (i + 0.5) * du, un = u / W;
        let a = theta + A * Math.exp(-u / k) * cT - dir * curl * sT * Math.pow(un, 1.4) * 0.9 + dir * twist * sT * un * zn * 0.5;
        if (a < 0) a = 0; if (a > PI) a = PI;
        x += Math.cos(a) * du; y += Math.sin(a) * du;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }

  updateStack(m, count) {
    m.visible = count > 0;
    if (!count) return;
    const side = m.userData.side, h = Math.max(0, count * this.t - this.t * 0.6), k = this.k, W = this.W, H = this.H, base = this.coverT;
    const p = m.geometry.attributes.position.array, uv = m.geometry.attributes.uv.array;
    const du = W / SEG_X, A = this.spiral ? 0 : h / k;
    let x = this.spiral ? this.gap / 2 : 0, y = base + (this.spiral ? h : 0);
    for (let i = 0; i <= SEG_X; i++) {
      const set = (kk, X, Y, Z, U, V) => { const o = (i * 6 + kk); p[o * 3] = X * side; p[o * 3 + 1] = Y; p[o * 3 + 2] = Z; uv[o * 2] = U; uv[o * 2 + 1] = V; };
      const u = i / SEG_X, ut = side > 0 ? u : 1 - u;
      set(0, x, y, H / 2, ut, 0); set(1, x, y, -H / 2, ut, 1);
      set(4, x, y, H / 2, u, count / 4); set(5, x, y, -H / 2, u, count / 4);
      set(2, x, base, H / 2, u, 0); set(3, x, base, -H / 2, u, 0);
      if (i === SEG_X) break;
      let a = A * Math.exp(-((i + 0.5) * du) / k); if (a < 0) a = 0;
      x += Math.cos(a) * du; y += Math.sin(a) * du;
    }
    // fore-edge: u runs along the page height (near to far), v through the block (desk to top)
    const e = SEG_X, F = (SEG_X + 1) * 6, fr = count / Math.max(1, this.L);
    const vb = side > 0 ? 0 : 1, vt = side > 0 ? fr : 1 - fr;
    const cp = (dst, srcK, U, V) => { const so = (e * 6 + srcK) * 3, d = F + dst; p[d * 3] = p[so]; p[d * 3 + 1] = p[so + 1]; p[d * 3 + 2] = p[so + 2]; uv[d * 2] = U; uv[d * 2 + 1] = V; };
    cp(0, 2, 0, vb); cp(1, 3, 1, vb); cp(2, 4, 0, vt); cp(3, 5, 1, vt);
    m.geometry.attributes.position.needsUpdate = true; m.geometry.attributes.uv.needsUpdate = true;
    m.geometry.computeVertexNormals();
  }

  thetaOf(k) {
    if (this.turn && this.turn.k === k) return this.turn.theta;
    return k < this.pos - 1 ? PI : 0;
  }

  applyState() {
    if (!this.book) return;
    const L = this.L, t = this.t, T = this.coverT;
    const base = Math.max(0, this.pos - 1);
    const want = [base - 2, base - 1, base, base + 1];
    // reuse slots that already show the right leaf
    const free = this.slots.filter(s => !want.includes(s.leaf));
    for (const j of want) {
      if (this.slots.some(s => s.leaf === j)) continue;
      const s = free.shift(); s.leaf = j; s.texDirty = true;
    }
    for (const s of this.slots) {
      const j = s.leaf, ok = j >= 0 && j < L;
      s.front.visible = s.back.visible = ok;
      if (!ok) continue;
      const th = this.thetaOf(j);
      const hR = (L - 1 - j) * t + t, hL = j * t + t;
      const rise = hR + (hL - hR) * (th / PI);
      const dir = this.turn && this.turn.k === j ? this.turn.dir : 1;
      const twist = this.turn && this.turn.k === j ? (this.turn.twist || 0) : 0;
      this.bendLeaf(s.geo, th, rise, dir, twist, T + (this.spiral ? rise - t : 0));
      // pages meet at the spine; push lower pages back in depth so the top page always wins there
      const turning = this.turn && this.turn.k === j, top = turning || j === base || j === base - 1;
      for (const m of [s.front, s.back]) { m.material.polygonOffset = true; m.material.polygonOffsetFactor = turning ? -4 : top ? -3 : -1; m.material.polygonOffsetUnits = turning ? -8 : top ? -6 : -2; }
    }
    this.updateStack(this.stackR, Math.max(0, L - (base + 2)));
    this.updateStack(this.stackL, Math.max(0, base - 2));
    // cover
    const ct = this.thetaOf(-1), blockH = L * t;
    this.cover.rotation.z = ct;
    this.cover.position.y = T + blockH * (1 - ct / PI);
    if (this.spiral) { this.cover.position.y = T + blockH * (1 - ct / PI); this.cover.position.x = 0; }
    if (this.spine) {
      const vis = ct < PI * 0.25;
      this.spine.visible = vis;
      const hh = blockH + T * 2;
      this.spine.scale.y = hh; this.spine.position.set(-T / 2, hh / 2, 0);
      if (this.headbands) for (const m of this.headbands) { m.visible = vis; m.scale.y = blockH; m.position.set(0.001, T + blockH / 2, m.userData.sg * (this.H / 2 - 0.002)); }
    }
    if (this.band) {
      const vis = this.pos === 0 && !this.turn;
      this.band.visible = vis;
      const hh = blockH + T * 2 + 0.003, bx = (this.W + this.over) * 0.86;
      this.bandTop.position.set(bx, hh, 0);
      this.bandN.scale.y = hh; this.bandN.position.set(bx, hh / 2, (this.H + this.over * 2) / 2 + 0.0013);
      this.bandF.scale.y = hh; this.bandF.position.set(bx, hh / 2, -(this.H + this.over * 2) / 2 - 0.0013);
    }
    if (this.ribbon) this.ribbonRest();
    this.dirty = true;
  }

  // where the ribbon wants to lie for the current page: along the open page from the head of the spine,
  // over the bottom edge and onto the desk
  ribbonRest() {
    const R = this.rib; if (!R) return;
    const L = this.L, t = this.t, T = this.coverT, base = Math.max(0, this.pos - 1), H = this.H;
    const closed = this.pos === 0 || this.pos > L;
    const top = closed ? T + L * t * 0.5 : T + (L - 1 - base) * t + t * 3 + 0.0012;
    // the ribbon's route after the page, as [z, y] points: page edge, cover board, cover edge, desk
    const lie = 0.0015, edge = H / 2 + (this.over || 0) + 0.004;
    // a short flat bit past the page corner first, so the bend clears the paper instead of cutting into it
    // convex corners are padded outward so the straight links between joints pass over the paper and the board
    const pad = 0.003, path = [[H / 2 - 0.004, top], [H / 2 + pad, top + pad * 0.6], [H / 2 + 0.012, T + lie + pad * 0.3], [edge - 0.004, T + lie], [edge + pad, T + lie + pad * 0.6], [edge + 0.014, lie]];
    let pathLen = 0; for (let k = 1; k < path.length; k++) pathLen += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
    R.coverTop = T + lie; R.coverEdge = edge;
    for (let i = 0; i < R.N; i++) {
      const along = i / (R.N - 1) * R.len, r = R.rest[i];
      if (along <= H - 0.004) { r.x = 0.03 + along * 0.025; r.y = top; r.z = -H / 2 + along; r.pin = true; continue; }
      // past the page: down onto the cover board, across its overhang, over its edge and out onto the desk
      // the drape over the page and cover edges is held by them (pinned); only the tail on the desk swings
      let d = along - (H - 0.004); r.pin = d < pathLen; r.x = 0.03 + H * 0.025;
      for (let k = 1; k < path.length; k++) {
        const a = path[k - 1], b = path[k], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d <= seg || k === path.length - 1) { const f = seg ? Math.min(1, d / seg) : 1; r.z = a[0] + (b[0] - a[0]) * f; r.y = a[1] + (b[1] - a[1]) * f; break; }
        d -= seg;
      }
      const onDesk = along - (H - 0.004) - pathLen; if (onDesk > 0) { r.z += onDesk * 0.98; r.x += onDesk * 0.18; }
    }
    R.top = top; R.closed = closed; R.wake = 2.5; R.settle = 0; // keep simulating for a moment
  }
  // a page turn makes the hanging part sway; the part lying flat on the desk only shifts a little
  kickRibbon(dir) { const R = this.rib; if (!R) return; for (let i = 0; i < R.N; i++) if (!R.rest[i].pin) { const n = R.nodes[i], k = n.y < 0.004 ? 0.12 : 1; n.vx += dir * (0.25 + Math.random() * 0.25) * k; n.vy += 0.12 * k; } R.wake = 3; R.settle = 0; }
  ribbonStep(dt) {
    const R = this.rib; if (!R || !this.ribbon) return;
    if (!R.init) { R.nodes.forEach((n, i) => Object.assign(n, R.rest[i], { vx: 0, vy: 0, vz: 0 })); R.init = true; R.wake = 1; }
    if (R.wake <= 0) {
      // keep going until it is back at rest (up to 3 more seconds), so it never freezes mid-swing
      if ((R.settle || 0) > 3) return;
      let far = 0; for (let i = 0; i < R.N; i++) { const n = R.nodes[i], r = R.rest[i]; far = Math.max(far, Math.abs(n.x - r.x) + Math.abs(n.z - r.z)); }
      if (far < 0.004) { R.settle = 99; return; }
      R.settle = (R.settle || 0) + dt;
    }
    R.wake -= dt; R.t += dt;
    const N = R.N, seg = R.len / (N - 1), nodes = R.nodes, H = this.H, W = this.W;
    const n0 = nodes[0]; Object.assign(n0, R.rest[0]);
    // small steps: the stiff springs overshoot and wobble if one step covers a slow frame
    const steps = Math.ceil(dt / 0.006), full = dt; dt = full / steps;
    for (let sI = 0; sI < steps; sI++) {
    for (let i = 1; i < N; i++) {
      const n = nodes[i], r = R.rest[i], k = r.pin ? 90 : 9;
      n.vx += (r.x - n.x) * k * dt; n.vy += (r.y - n.y) * k * dt - (r.pin ? 0 : 2.2 * dt); n.vz += (r.z - n.z) * k * dt;
      const damp = Math.exp(-(r.pin ? 14 : 3.2) * dt); n.vx *= damp; n.vy *= damp; n.vz *= damp;
      n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
    }
    // keep every link the same length (follow the leader), then keep it on top of the pages and the desk
    for (let i = 1; i < N; i++) {
      const a = nodes[i - 1], n = nodes[i], dx = n.x - a.x, dy = n.y - a.y, dz = n.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6;
      n.x = a.x + dx / d * seg; n.y = a.y + dy / d * seg; n.z = a.z + dz / d * seg;
      const inX = n.x > -W - 0.05 && n.x < W + 0.05, onBlock = inX && Math.abs(n.z) < H / 2 + 0.002;
      // the cover board sticks out past the pages: the ribbon rests on it, not inside it
      const floor = onBlock && !R.closed ? R.top : inX && Math.abs(n.z) < R.coverEdge ? R.coverTop : 0.0015;
      if (n.y < floor) { const f = Math.pow(0.9, dt * 60); n.y = floor; n.vy = Math.max(0, n.vy); n.vx *= f; n.vz *= f; }
    }
    }
    this.ribbonMesh(); this.dirty = true;
  }
  ribbonMesh() {
    const R = this.rib, p = this.ribbon.geometry.attributes.position.array, N = R.N, nodes = R.nodes, hw = R.w / 2;
    for (let i = 0; i < N; i++) {
      const a = nodes[Math.max(0, i - 1)], b = nodes[Math.min(N - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // side = tangent x up, so the ribbon lies flat; a soft twist along the free tail
      // width runs along x (across the book), made square to the ribbon; stays steady when it hangs straight down
      let sx = 1 - tx * tx, sy = -tx * ty, sz = -tx * tz; const sl = -(Math.hypot(sx, sy, sz) || 1); sx /= sl; sy /= sl; sz /= sl; // minus: same facing as before
      const free = R.rest[i].pin ? 0 : Math.min(1, (i / (N - 1) * R.len - this.H) * 4), tw = Math.sin(i / (N - 1) * R.len * 3.5 + R.t * 0.8) * 0.12 * free;
      const ux = ty * sz - tz * sy, uy = tz * sx - tx * sz, uz = tx * sy - ty * sx, c = Math.cos(tw), s2 = Math.sin(tw);
      const qx = sx * c + ux * s2, qy = sy * c + uy * s2, qz = sz * c + uz * s2, n = nodes[i], lift = 0.0004;
      const set = (col, x, y, z) => { const o = (i * 3 + col) * 3; p[o] = x; p[o + 1] = y; p[o + 2] = z; };
      const back = i === N - 1 ? R.w * 0.9 : 0; // V-cut tail: the middle of the end sits back
      set(0, n.x - qx * hw, n.y - qy * hw + lift, n.z - qz * hw);
      set(1, n.x - tx * back, n.y - ty * back + lift, n.z - tz * back);
      set(2, n.x + qx * hw, n.y + qy * hw + lift, n.z + qz * hw);
    }
    this.ribbon.geometry.attributes.position.needsUpdate = true;
    this.ribbon.geometry.computeVertexNormals();
    this.ribbon.visible = !(R.closed && this.pos !== 0 && this.pos <= this.L);
  }

  // ---------- textures ----------
  pageIndexFor(leaf, side) { return leaf * 2 + (side === 'back' ? 1 : 0); }

  // one load per page at a time, even if several parts of the book ask for it together
  pageTexture(idx) {
    const id = this.book.pages[idx]; if (!id) return Promise.resolve(null);
    this.texLoading ||= new Map();
    const k = id + ':' + (this.hiRes || 0);
    if (this.texLoading.has(k)) return this.texLoading.get(k);
    const pr = this.pageTextureNow(idx).finally(() => this.texLoading.delete(k));
    this.texLoading.set(k, pr); return pr;
  }
  async pageTextureNow(idx) {
    const id = this.book.pages[idx];
    if (!id) return null;
    const page = await db.get('pages', id);
    if (!page) return null;
    const key = id + ':' + page.ver + ':' + (this.hiRes || 0);
    if (this.texCache.has(key)) { const t = this.texCache.get(key); this.texCache.delete(key); this.texCache.set(key, t); return t; } // most recently used stays longest
    let tex;
    if (this.hiRes) {
      const c = await renderPage(page, this.book, { scale: Math.min(1, this.hiRes / page.h), pageNumber: this.book.pageNumbers ? idx + 1 : 0 });
      tex = new THREE.CanvasTexture(c);
    } else {
      let blob = page.thumb ? await getBlob(page.thumb) : null;
      if (!blob) {
        blob = await makeThumb(page, this.book, { max: 2048, balanced: 1536, performance: 1024 }[this.quality] || 1536);
        // keep it, so a blank page is only drawn once (big new books flip fast)
        try { const fresh = await db.get('pages', id); if (fresh && !fresh.thumb && fresh.ver === page.ver) { fresh.thumb = await putBlob(blob); await db.put('pages', fresh); } } catch (_) { }
      }
      const bm = await createImageBitmap(blob, { imageOrientation: 'flipY' });
      tex = new THREE.Texture(bm); tex.flipY = false; tex.needsUpdate = true;
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    // drop older versions of this page
    for (const [k, t] of this.texCache) if (k.startsWith(id + ':') && k !== key) { t.dispose(); this.texCache.delete(k); }
    this.texCache.set(key, tex);
    while (this.texCache.size > 16) { const k0 = this.texCache.keys().next().value; this.texCache.get(k0).dispose(); this.texCache.delete(k0); }
    return tex;
  }

  async refreshTextures(force) {
    if (!this.book) return;
    const jobs = [];
    for (const s of this.slots) {
      if (s.leaf < 0 || s.leaf >= this.L) continue;
      if (!s.texDirty && !force) continue;
      s.texDirty = false;
      const leaf = s.leaf;
      // show plain paper right away while the real page loads
      if (!force) for (const m of [s.front, s.back]) if (m.userData.leaf !== leaf) { m.material.map = this.blankTex; m.userData.real = false; m.material.needsUpdate = true; m.userData.leaf = leaf; }
      jobs.push(Promise.all([this.pageTexture(leaf * 2), this.pageTexture(leaf * 2 + 1)]).then(([a, b]) => {
        if (s.leaf !== leaf) return;
        for (const [m, t] of [[s.front, a], [s.back, b]]) { m.material.map = t || this.blankTex; m.userData.real = !!t; m.material.color.set('#ffffff'); m.material.needsUpdate = true; }
        this.dirty = true;
      }));
    }
    await Promise.all(jobs);
    // load the next sheets in the background so turning never waits
    const base = Math.max(0, this.pos - 1);
    const q = this.queued || 0, ahead = q > 0 ? [base + 2, base + 3] : q < 0 ? [base - 3, base - 4] : [base + 2, base - 3];
    for (const j of ahead) if (j >= 0 && j < this.L) { this.pageTexture(j * 2); this.pageTexture(j * 2 + 1); }
    await this.checkMotion();
  }

  // pages with GIFs or videos keep re-rendering while they are open
  async checkMotion() {
    const list = [];
    for (const s of this.slots) { if (s.leaf < 0 || s.leaf >= this.L || !s.front.visible) continue; for (const [m, idx] of [[s.front, s.leaf * 2], [s.back, s.leaf * 2 + 1]]) { const id = this.book.pages[idx]; const pg = id && await db.get('pages', id); if (pg && pageHasMotion(pg)) list.push({ m, pg, idx }); } }
    this.motion = list;
  }
  async motionTick(now) {
    if (!this.motion || !this.motion.length || this.motionBusy || this.hiRes) return;
    if (now - (this.lastMotion || 0) < 40) return;
    this.lastMotion = now; this.motionBusy = true;
    try {
      let any = false;
      for (const it of this.motion) {
        // one renderer per page: paper and still layers are drawn once, only moving layers update
        if (!it.mr) it.mr = await motionRenderer(it.pg, this.book, { scale: Math.min(1, 900 / it.pg.h), pageNumber: this.book.pageNumbers ? it.idx + 1 : 0 });
        if (!(await it.mr.draw(now))) continue;
        let t = it.m.userData.motionTex;
        if (!t || t.image !== it.mr.canvas) { t?.dispose(); t = it.m.userData.motionTex = new THREE.CanvasTexture(it.mr.canvas); t.colorSpace = THREE.SRGBColorSpace; }
        else t.needsUpdate = true;
        if (it.m.material.map !== t) { it.m.material.map = t; it.m.material.needsUpdate = true; }
        any = true;
      }
      if (any) this.dirty = true;
    } finally { this.motionBusy = false; }
  }

  invalidatePage(id) {
    for (const [k, t] of this.texCache) if (k.startsWith(id + ':')) { t.dispose(); this.texCache.delete(k); }
    const idx = this.book.pages.indexOf(id), leaf = Math.floor(idx / 2);
    for (const s of this.slots) if (s.leaf === leaf) s.texDirty = true;
    this.refreshTextures();
  }

  // ---------- navigation ----------
  get maxPos() { return this.L + 1; }
  canNext() { return this.pos < this.maxPos && !this.anim && !this.flipped && !this.flipAnim; }
  canPrev() { return this.pos > 0 && !this.anim && !this.flipped && !this.flipAnim; }
  // where the book lands once the turn in progress and the queued turns are done
  get endPos() { const a = this.anim; return (a && !a.cancel ? this.pos + a.dir : this.pos) + (this.queued || 0); }
  next() { this.step(1); }
  prev() { this.step(-1); }
  // clicks during a turn are queued, so three quick clicks always turn three pages
  step(d) {
    if (this.flipped || this.flipAnim) return;
    if (this.anim) { const e = this.endPos + d; if (e >= 0 && e <= this.maxPos) this.queued = (this.queued || 0) + d; return; }
    this.queued = 0;
    if (d > 0 ? this.canNext() : this.canPrev()) d > 0 ? this.startTurn(1, 0, PI) : this.startTurn(-1, PI, 0);
  }
  runQueue() {
    const q = this.queued || 0; if (!q) return;
    const d = Math.sign(q); this.queued -= d;
    if (d > 0 ? this.pos >= this.maxPos : this.pos <= 0) { this.queued = 0; return; }
    const fast = Math.max(0.18, (this.book.flip?.speed ?? 0.9) * (Math.abs(q) > 1 ? 0.35 : 0.6));
    d > 0 ? this.startTurn(1, 0, PI, fast) : this.startTurn(-1, PI, 0, fast);
  }
  goTo(p, animate = false) {
    p = Math.max(0, Math.min(this.maxPos, p)); this.queued = 0;
    if (animate && Math.abs(p - this.pos) === 1) return p > this.pos ? this.next() : this.prev();
    this.turn = null; this.anim = null; this.pos = p;
    this.applyState(); this.refreshTextures(); this.emit('pos', this.pos);
  }
  // spread currently visible: [leftPageIndex|null, rightPageIndex|null]
  spread(p = this.pos) {
    if (p === 0) return [null, null];
    const cur = p - 1, left = cur > 0 ? cur * 2 - 1 : null, right = cur < this.L ? cur * 2 : null;
    return [left, right];
  }

  startTurn(dir, from, to, dur) {
    const k = dir > 0 ? this.pos - 1 : this.pos - 2;
    this.turn = { k, theta: from, dir, twist: this.turn?.twist || 0 };
    const full = this.reducedMotion ? 0 : (dur ?? (this.book.flip?.speed ?? 0.9) * (k === -1 ? 1.25 : 1));
    this.anim = { from, to, t0: performance.now(), dur: full * Math.abs(to - from) / PI * 1000, dir };
    this.kickRibbon(dir);
    this.applyState(); this.refreshTextures();
  }

  finishTurn() {
    const a = this.anim; this.anim = null;
    if (a.to === PI && a.dir > 0) this.pos++;
    else if (a.to === 0 && a.dir < 0) this.pos--;
    this.turn = null;
    this.applyState(); this.refreshTextures();
    this.emit('pos', this.pos);
    this.runQueue();
  }

  // ---------- pointer ----------
  bindPointer() {
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.01), hit = new THREE.Vector3(), inv = new THREE.Matrix4();
    // where the pointer is on the book, in the book's own space (it may be picked up)
    const toBook = (e) => {
      const r = this.canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      this.holder.updateMatrixWorld(); ray.ray.applyMatrix4(inv.copy(this.holder.matrixWorld).invert());
      return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
    };
    const onBook = p => p && Math.abs(p.z) < this.H / 2 + this.over + 0.03 && (this.pos === 0 ? p.x > -0.05 && p.x < this.W + this.over + 0.05 : Math.abs(p.x) < this.W + this.over + 0.05);
    let drag = null, look = null, spin = null;
    this.canvas.addEventListener('pointerdown', e => {
      if (this.free) { look = { x: e.clientX, y: e.clientY }; try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { } return; }
      if (e.button !== 0 || !this.book) return;
      const p = toBook(e);
      // off the book: drag to look around it (or to turn it in your hands when picked up)
      if (!onBook(p)) { spin = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { } this.canvas.style.cursor = 'grabbing'; return; }
      if (this.anim) return;
      drag = { x0: e.clientX, y0: e.clientY, p0: p, started: false, id: e.pointerId };
    });
    this.canvas.addEventListener('pointermove', e => {
      if (look) { this.freeLook(e.clientX - look.x, e.clientY - look.y); look = { x: e.clientX, y: e.clientY }; return; }
      if (spin) {
        if (e.pointerId !== spin.id) return;
        const dx = e.clientX - spin.x, dy = e.clientY - spin.y; spin.x = e.clientX; spin.y = e.clientY;
        if (this.held) { this.holdSpin.y += dx * 0.008; this.holdSpin.x = Math.max(-1.2, Math.min(1.2, this.holdSpin.x + dy * 0.008)); this.dirty = true; }
        else this.orbitBy(-dx * 0.35, dy * 0.3);
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      const p = toBook(e); if (!p) return;
      const moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
      if (!drag.started && moved > 8) {
        const forward = drag.p0.x > 0, dx = p.x - drag.p0.x;
        if ((forward && dx < 0 && this.canNext()) || (!forward && dx > 0 && this.canPrev())) {
          drag.started = true; drag.dir = forward ? 1 : -1;
          try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { }
          const zn = drag.p0.z / (this.H / 2);
          const twist = Math.abs(zn) > 0.55 ? (zn < 0 ? 1 : -1) * Math.min(1, (Math.abs(zn) - 0.55) * 3) : 0;
          this.turn = { k: forward ? this.pos - 1 : this.pos - 2, theta: forward ? 0 : PI, dir: drag.dir, twist };
          this.applyState(); this.refreshTextures();
        } else if (moved > 8) { drag = null; return; }
      }
      if (drag.started) {
        const W = this.W + (this.turn.k === -1 ? this.over : 0);
        this.turn.theta = Math.acos(Math.max(-1, Math.min(1, p.x / W)));
        this.applyState();
      }
    });
    const up = e => {
      if (look) { look = null; return; }
      if (spin) { spin = null; this.canvas.style.cursor = ''; return; }
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (d.started) {
        const th = this.turn.theta, done = d.dir > 0 ? th > PI * 0.45 : th < PI * 0.55;
        const to = d.dir > 0 ? (done ? PI : 0) : (done ? 0 : PI);
        const twist = this.turn.twist;
        const full = this.reducedMotion ? 0 : (this.book.flip?.speed ?? 0.9);
        this.anim = { from: th, to, t0: performance.now(), dur: full * Math.abs(to - th) / PI * 1000, dir: d.dir };
        this.turn.twist = twist;
        if (!(d.dir > 0 ? to === PI : to === 0)) this.anim.cancel = true;
        return;
      }
      // a click
      const p = d.p0, now = performance.now();
      const dbl = this.lastClick && now - this.lastClick.t < 350 && Math.abs(this.lastClick.x - e.clientX) < 10;
      this.lastClick = { t: now, x: e.clientX };
      if (dbl) { const idx = this.pageAt(p); if (idx != null) this.emit('openPage', idx); this.lastClick = null; clearTimeout(this.clickTimer); return; }
      clearTimeout(this.clickTimer);
      this.clickTimer = setTimeout(() => {
        if (this.pos === 0) { this.next(); return; }
        const W = this.W;
        if (p.x > W * 0.62 && p.x < W * 1.1) this.next();
        else if (p.x < -W * 0.62 && p.x > -W * 1.1) this.prev();
      }, 260);
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  // What is under the mouse: a page (with x, y from 0 to 1 on it) or the front cover.
  hitAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const objs = [];
    for (const s of this.slots) if (s.front.visible) objs.push(s.front, s.back);
    if (this.coverMesh) objs.push(this.coverMesh);
    if (this.back) objs.push(this.back);
    objs.push(this.desk);
    const hits = ray.intersectObjects(objs, false);
    for (const h of hits) {
      if (h.object === this.desk) {
        const x = (h.point.x + DESK_ART / 2) / DESK_ART, y = (h.point.z + DESK_ART / 2) / DESK_ART;
        if (x < 0 || y < 0 || x > 1 || y > 1) return null;
        return { kind: 'desk', x, y };
      }
      if (h.object === this.back) {
        if (!this.flipped) continue;
        const loc = this.back.worldToLocal(h.point.clone()), W = this.W + this.over, H = this.H + this.over * 2;
        if (loc.y > this.coverT * 0.5) continue;
        return { kind: 'back', x: Math.max(0, Math.min(1, 1 - (loc.x - this.gap * 0.5) / W)), y: Math.max(0, Math.min(1, (loc.z + H / 2) / H)) };
      }
      if (h.object === this.coverMesh) {
        if (this.thetaOf(-1) > 0.3 || this.flipped) continue; // only the outside of a closed cover
        const loc = this.coverMesh.worldToLocal(h.point.clone()), W = this.W + this.over, H = this.H + this.over * 2;
        if (loc.y < this.coverT * 0.5) continue;
        return { kind: 'cover', x: Math.max(0, Math.min(1, loc.x / W)), y: Math.max(0, Math.min(1, (loc.z + H / 2) / H)) };
      }
      const s = this.slots.find(q => q.front === h.object || q.back === h.object); if (!s || !h.uv) continue;
      // front meshes only answer when seen from the front, back meshes from the back
      const side = h.object === s.front ? 'front' : 'back';
      const idx = s.leaf * 2 + (side === 'back' ? 1 : 0);
      if (idx < 0 || idx >= this.book.pages.length) continue;
      return { kind: 'page', idx, x: h.uv.x, y: 1 - h.uv.y };
    }
    return null;
  }

  pageAt(p) {
    if (this.pos === 0) return null;
    const [l, r] = this.spread();
    if (Math.abs(p.z) > this.H / 2) return null;
    if (p.x > 0 && p.x < this.W) return r;
    if (p.x < 0 && p.x > -this.W) return l;
    return null;
  }

  // ---------- camera ----------
  // camera presets: [azimuth deg, elevation deg, distance x home, target x offset]
  static VIEWS = {
    angled: { name: 'Angled', az: 0, el: 60, d: 1 }, top: { name: 'Top down', az: 0, el: 89, d: 1 }, low: { name: 'Low', az: 0, el: 33, d: 1 },
    front: { name: 'Front', az: 0, el: 18, d: 1.05 }, left: { name: 'Left side', az: -62, el: 38, d: 1 }, right: { name: 'Right side', az: 62, el: 38, d: 1 },
    pageR: { name: 'Right page close', az: 8, el: 70, d: 0.62, tx: 0.5 }, pageL: { name: 'Left page close', az: -8, el: 70, d: 0.62, tx: -0.5 },
    spine: { name: 'Spine', az: -90, el: 14, d: 0.85, tx: 0 }, edge: { name: 'Page edges', az: 90, el: 12, d: 0.85, tx: 0.4 }, cover: { name: 'Cover close', az: 0, el: 55, d: 0.8, tx: 0.5 }, back: { name: 'Underneath', az: 180, el: 25, d: 1 },
  };
  viewTo(name, animate = true) {
    const v = Book3D.VIEWS[name]; if (!v) return;
    this.view = name; this.orbitTo(v.az, v.el, v.d, v.tx || 0, animate);
  }
  // keepTarget: turn around the spot you are looking at now (camera pad, drags), not the middle of the book
  orbitTo(az, el, dmul = 1, tx = 0, animate = true, keepTarget = false) {
    if (this.free) this.setFree(false);
    const closedTall = this.tall() && this.pos === 0;
    const d = ((closedTall ? this.homeDistClosed : this.homeDist) || 3) * dmul, a = az * PI / 180, e = Math.max(1, Math.min(89.5, el)) * PI / 180;
    const tgt = keepTarget ? (this.camAnim ? this.camAnim.t1 : this.controls.target).clone() : new THREE.Vector3(tx * this.W + (closedTall && !tx ? (this.W + this.over) / 2 : 0), 0, 0.02);
    const pos = new THREE.Vector3(tgt.x + Math.sin(a) * Math.cos(e) * d, tgt.y + Math.sin(e) * d, tgt.z + Math.cos(a) * Math.cos(e) * d);
    if (!animate || this.reducedMotion) {
      // jump now: stop any camera slide, and turn damping off for this update so the controls do not drift back
      this.camAnim = null; this.controls.enableDamping = false;
      this.camera.position.copy(pos); this.controls.target.copy(tgt); this.controls.update();
      this.controls.enableDamping = !this.reducedMotion; this.dirty = true; return;
    }
    this.camAnim = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: tgt, s: performance.now(), dur: 650 };
  }
  tall() { return (this.camera.aspect || 1.6) < 0.95; }
  // re-aim when a tall screen goes from a closed book to an open one, or back
  reframe() {
    if (!this.book || !this.tall() || this.free || this.anim || this.camAnim) return;
    const closed = this.pos === 0;
    if (closed !== this.lastClosed) { const first = this.lastClosed === undefined; this.lastClosed = closed; if (!first) this.viewTo(this.view || 'angled'); }
  }
  orbitBy(daz, del) { const a = this.getAngles(); this.orbitTo(a.az + daz, a.el + del, a.d, 0, false, true); }
  getAngles() {
    const o = this.camera.position.clone().sub(this.controls.target), d = o.length();
    return { az: Math.atan2(o.x, o.z) * 180 / PI, el: Math.asin(Math.max(-1, Math.min(1, o.y / d))) * 180 / PI, d: d / (this.homeDist || 3) };
  }
  // free camera: drag to look, WASD to move, Q/E down and up, Shift for faster
  setFree(on) {
    this.free = on; this.controls.enabled = !on; this.keysDown = new Set();
    if (on) { const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir); this.yaw = Math.atan2(-dir.x, -dir.z); this.pitch = Math.asin(dir.y); }
    else { const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir); this.controls.target.copy(this.camera.position.clone().add(dir.multiplyScalar(Math.max(0.5, this.camera.position.y / Math.max(0.2, -dir.y || 0.2))))); this.controls.update(); }
    this.emit('free', on); this.dirty = true;
  }
  freeMove(dt) {
    if (!this.free || !this.keysDown || !this.keysDown.size) return;
    const sp = (this.keysDown.has('shift') ? 2.4 : 0.8) * dt, f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), r = new THREE.Vector3(-f.z, 0, f.x), m = new THREE.Vector3();
    if (this.keysDown.has('w')) m.add(f); if (this.keysDown.has('s')) m.sub(f); if (this.keysDown.has('d')) m.add(r); if (this.keysDown.has('a')) m.sub(r);
    if (this.keysDown.has('e')) m.y += 1; if (this.keysDown.has('q')) m.y -= 1;
    if (m.lengthSq()) { this.camera.position.addScaledVector(m.normalize(), sp); this.camera.position.y = Math.max(0.03, this.camera.position.y); this.dirty = true; }
  }
  freeLook(dx, dy) { this.yaw -= dx * 0.004; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * 0.004)); this.applyFreeLook(); }
  applyFreeLook() { const d = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); this.camera.lookAt(this.camera.position.clone().add(d)); this.dirty = true; }

  // pick the book up: it lifts toward you and leans to face the camera; drag off the book to turn it in your hands
  setHold(on) { this.held = !!on; this.holdSpin = { x: 0, y: 0 }; this.holdMoving = true; this.dirty = true; this.emit('hold', this.held); }
  holdStep(dt) {
    if (!this.held && !this.holdMoving) return;
    const tq = this._hq ||= new THREE.Quaternion(), tp = this._hp ||= new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    tq.identity(); tp.set(0, 0, 0);
    if (this.held) {
      const cam = this.camera.position.clone().sub(this.controls.target); cam.y = Math.max(cam.y, 0.2); cam.normalize();
      const flat = new THREE.Vector3(cam.x, 0, cam.z).normalize(), side = new THREE.Vector3().crossVectors(Y, flat).normalize();
      tq.setFromUnitVectors(Y, cam).slerp(new THREE.Quaternion(), 0.4); // lean about 60% of the way toward you
      tq.premultiply(new THREE.Quaternion().setFromAxisAngle(cam, -this.holdSpin.y)); // spin in your hands
      tq.premultiply(new THREE.Quaternion().setFromAxisAngle(side, -this.holdSpin.x)); // tip toward or away
      // turn around the middle of the book, lifted just enough that the low edge clears the desk (it stays framed)
      const mid = new THREE.Vector3(this.pos === 0 ? (this.W + this.over) / 2 : 0, (this.L * this.t) / 2, 0);
      const tilt = new THREE.Vector3(0, 1, 0).applyQuaternion(tq).angleTo(Y);
      const down = new THREE.Vector3(0, 1, 0).applyQuaternion(tq).setY(0).normalize(); // which way the book leans
      const reach = Math.abs(down.z) * (this.H / 2 + this.over) + Math.abs(down.x) * (this.pos === 0 ? (this.W + this.over) / 2 : this.W);
      tp.copy(mid).sub(mid.clone().applyQuaternion(tq)).add(new THREE.Vector3(0, reach * Math.sin(tilt) + 0.06, 0));
    }
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 9), h = this.holder, y0 = h.position.y;
    h.quaternion.slerp(tq, k); h.position.lerp(tp, k);
    // the camera rises and sinks with the book, so it stays in view
    if (!this.free && !this.camAnim) { const dy = (h.position.y - y0) * 0.7, ty = Math.max(0, this.controls.target.y + dy); this.camera.position.y += ty - this.controls.target.y; this.controls.target.y = ty; }
    // angleTo has ~1e-4 rounding noise near zero, so settle at 1e-3 (0.06 degrees) or it redraws forever
    this.holdMoving = h.quaternion.angleTo(tq) > 1e-3 || h.position.distanceTo(tp) > 1e-4;
    if (this.holdMoving) this.dirty = true;
  }

  // flip-book: flick through pages quickly, like thumbing a real flip book
  flick(dir = 1, perPage = 0.16) {
    if (this.flicking) { this.flicking = false; return; }
    this.flicking = true;
    const step = () => {
      if (!this.flicking) return;
      if (this.anim) return setTimeout(step, 16);
      if (dir > 0 ? !this.canNext() : !this.canPrev()) { this.flicking = false; this.emit('flickEnd'); return; }
      if (dir > 0) this.startTurn(1, 0, PI, perPage); else this.startTurn(-1, PI, 0, perPage);
      setTimeout(step, perPage * 1000 * 0.55);
    };
    step();
  }

  homeDists() {
    const aspect = this.camera.aspect || 1.6, fovV = this.camera.fov * PI / 180;
    const fitW = s => (s / 2) / Math.tan(Math.atan(Math.tan(fovV / 2) * aspect)), distH = (this.H * 1.15 / 2) / Math.tan(fovV / 2);
    this.homeDist = Math.max(fitW(this.W * 2 + 0.2), distH) * 1.08;
    this.homeDistClosed = Math.max(fitW(this.W + this.over + 0.2), distH) * 1.08;
  }
  fit(view = this.view || 'angled') {
    this.view = view;
    const span = this.W * 2 + 0.2;
    const aspect = this.camera.aspect || 1.6;
    const fovV = this.camera.fov * PI / 180;
    const distW = (span / 2) / Math.tan(Math.atan(Math.tan(fovV / 2) * aspect));
    const distH = (this.H * 1.15 / 2) / Math.tan(fovV / 2);
    const d = Math.max(distW, distH) * 1.08;
    const tgt = new THREE.Vector3(0, 0, 0.02);
    this.homeDist = d;
    // on tall screens (phones, tablets held upright) a closed book is framed on its own, centered
    const spanC = this.W + this.over + 0.2, distWC = (spanC / 2) / Math.tan(Math.atan(Math.tan(fovV / 2) * aspect));
    this.homeDistClosed = Math.max(distWC, distH) * 1.08;
    this.controls.target.copy(tgt);
    if (Book3D.VIEWS[view]) this.viewTo(view, false); else { this.camera.position.set(0, d * 0.86, d * 0.5); this.camera.lookAt(tgt); this.controls.update(); }
    this.dirty = true;
  }

  resize() {
    const w = this.host.clientWidth || 800, h = this.host.clientHeight || 500;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    // a new window size keeps your camera where it is; only the first layout frames the book
    if (this.book && !this.free) { if (!this.homeDist) this.fit(this.view); else this.homeDists(); }
    this.dirty = true;
  }

  tick(now) {
    const dt = Math.min(0.05, (now - (this.lastT || now)) / 1000); this.lastT = now;
    if (this.camAnim) {
      const c = this.camAnim, k = Math.min(1, (now - c.s) / c.dur), e = ease(k);
      this.camera.position.lerpVectors(c.p0, c.p1, e); this.controls.target.lerpVectors(c.t0, c.t1, e); this.controls.update();
      if (k >= 1) this.camAnim = null; this.dirty = true; this.emit('camera');
    }
    this.freeMove(dt);
    this.holdStep(dt);
    this.motionTick(now);
    this.reframe();
    this.ribbonStep(dt);
    if (this.flipAnim) {
      const f = this.flipAnim, k = Math.min(1, (now - f.t0) / f.dur);
      this.applyFlip(f.from + (f.to - f.from) * ease(k));
      if (k >= 1) this.flipAnim = null;
    }
    if (this.anim) {
      const a = this.anim, k = a.dur ? Math.min(1, (now - a.t0) / a.dur) : 1;
      this.turn.theta = a.from + (a.to - a.from) * ease(k);
      this.applyState();
      if (k >= 1) {
        if (a.cancel) { this.anim = null; this.turn = null; this.queued = 0; this.applyState(); this.refreshTextures(); }
        else this.finishTurn();
      }
    }
    if (this.controls.enableDamping && !this.free) this.controls.update();
    if (this.dirty || this.anim) { this.renderer.render(this.scene, this.camera); this.dirty = false; }
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, { max: 2, balanced: 1.5, performance: 1 }[q] || 1.5));
    this.renderer.shadowMap.enabled = q !== 'performance';
    const ss = { max: 4096, balanced: 2048, performance: 1024 }[q] || 2048;
    this.key.shadow.mapSize.set(ss, ss); this.key.shadow.map?.dispose(); this.key.shadow.map = null;
    this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
    this.resize();
  }

  // Set an exact state (used by the video exporter, frame by frame).
  setState(pos, turn) { this.pos = pos; this.turn = turn; this.anim = null; this.applyState(); }

  dispose() {
    this.running = false; cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.clearBook();
    this.controls.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

// inside covers: plain, marbled, dots, stripes or grid
// lays a drawing over a base picture; rot180 for faces that are seen turned around (inside front, back)
// grosgrain satin: fine ribs across the ribbon and a soft sheen down the middle
function ribbonCanvas(color) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 2) { g.fillStyle = y % 4 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.14)'; g.fillRect(0, y, 64, 1); }
  const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(0.18, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.82, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function lum(hex) { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; }
function compose(base, art, rot180) {
  if (!art) return base;
  const c = document.createElement('canvas'); c.width = art.width; c.height = art.height; const g = c.getContext('2d');
  g.drawImage(base, 0, 0, c.width, c.height);
  if (rot180) { g.translate(c.width, c.height); g.rotate(PI); }
  g.drawImage(art, 0, 0);
  return c;
}
export function endpaperCanvas(color, pattern, color2) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d');
  const t = paperTile('smooth', color); g.fillStyle = g.createPattern(t.canvas, 'repeat'); g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = color2; g.strokeStyle = color2;
  if (pattern === 'dots') { g.globalAlpha = 0.7; for (let y = 0; y < 1024; y += 64) for (let x = (y / 64 & 1) * 32; x < 1024; x += 64) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); } }
  if (pattern === 'stripes') { g.globalAlpha = 0.55; for (let x = 0; x < 1024; x += 80) g.fillRect(x, 0, 34, 1024); }
  if (pattern === 'grid') { g.globalAlpha = 0.45; g.lineWidth = 3; for (let i = 0; i <= 1024; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); } }
  if (pattern === 'marbled') {
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.globalAlpha = 0.5; g.lineCap = 'round';
    for (let i = 0; i < 70; i++) { g.lineWidth = 3 + rnd() * 26; g.strokeStyle = i % 3 ? color2 : '#ffffff'; g.globalAlpha = 0.2 + rnd() * 0.35; g.beginPath(); let x = rnd() * 1024, y = rnd() * 1024; g.moveTo(x, y); for (let k = 0; k < 6; k++) { const nx = x + (rnd() - 0.3) * 300, ny = y + (rnd() - 0.5) * 160; g.quadraticCurveTo(x + (rnd() - 0.5) * 200, y + (rnd() - 0.5) * 200, nx, ny); x = nx; y = ny; } g.stroke(); }
  }
  if (pattern === 'stars') { g.globalAlpha = 0.7; g.font = '40px serif'; for (let y = 30; y < 1024; y += 90) for (let x = (y / 90 & 1) * 45 + 20; x < 1024; x += 90) g.fillText('✦', x, y); }
  return c;
}
