# SHESKETCHES handoff

The one status doc for this project. Read this first.

## What it is
A realistic virtual sketchbook plus art studio, built from the user's master prompt
("MASTER PROJECT: THE ULTIMATE HYPERREALISTIC VIRTUAL SKETCHBOOK & DIGITAL ART STUDIO").
Every change should be checked against that prompt: realism, a real working editor,
separate artwork and presentation export pipelines, checked exports, local-first, honest limits.

It will be posted on the user's GitHub for other people to use.
Each person's books and art live only in their own browser (IndexedDB) on their own PC. Nothing is uploaded.
Never commit personal art or other people's photos into the repo. Everything shipped is made in code.

## Run it
- Double-click `start.bat` (needs Python), or in Claude Code: launch config `shesketches` (port 8800).
- Self-test: open `http://localhost:8800/tests.html`. It makes a temporary book, draws with every brush,
  runs every export, opens and checks every file, then deletes the book. See the last run count in the chat log; it now also checks all 36 brushes, paint mixing, clipping, custom papers and GIF frames.
- No build step. Vanilla JS ES modules. `three` is mapped with an import map in `index.html` and `tests.html`.

## Files
| File | What it does |
|---|---|
| `js/main.js` | Shelf, new book (16 book types), book view (camera pad, free cam, flick, keys panel), Customize (Cover, Paper & inside, Book & turning, Desk & light, each with "Show me"), cover drawing, Pages, Record, Settings, guide |
| `js/papermaker.js` | Make your own paper (color, tooth, fibers, speckles, creases, aging, printed lines). Saved in settings as numbers, registered into PAPERS at start |
| `js/book3d.js` | three.js book: bending pages (arc-length curl + corner twist), page stacks, hard/soft/spiral/ring, cover, band, ribbon, desk, lighting, drag and click turning |
| `js/render.js` | The artwork renderer. drawLayers handles clipping. mediaRes decodes GIF/animated WEBP (ImageDecoder) and video (mediabunny, 12 fps, 15 s max). renderPage uses the still frame unless opts.time is given |
| `js/editor.js` | Page editor: bottom tool dock, brush panel driven by PARAMS (every setting has a help line), brush maker, layers panel (thumbnails, drag reorder, clip, protect transparent, lock, merge, multi-pick delete), history jump list, select & move with marquee and multi-select, preview mode, keys panel, cover mode |
| `js/brushes.js` | PRESETS (36) and PARAMS. Engines: stamp (dry media + grain), paint (wet paint on a 48x48 RYB mixing grid that picks up the pre-stroke layer and everything below, bristle/flat/chalk/nib tips, water, lift, soften, thick paint relief), water (glaze + wet edges), marker, splat, erase. mixPaint() for the palette |
| `js/paper.js` | Procedural paper (12 types), cover materials, desk surfaces, page-edge stripes |
| `js/makers.js` | 15 makers that build cut-outs in code, plus the starter set made on first run |
| `js/stickers.js` | Sticker factory (auto background removal incl. fake checkerboards, wand, brushes, specks, holes, die-cut / torn / wavy outline, gloss, print look) and the makers screen |
| `js/dither.js` | SHEDITHERS link. Runs `vendor/shd-engine.js` (a copy of `shedithers/js/engine.js`) in a worker. Copy that file again to get new effects |
| `js/exporter.js` | Export center, queue, verification, reports, history |
| `js/encoders.js` | Zip, TIFF, BMP, PDF writers; PNG/JPG DPI tags; file inspectors used by the checks |
| `js/db.js` | IndexedDB storage, blobs, garbage collection, `.shesketch` project files |
| `js/library.js` | Library: imported art (original bytes kept), stickers, made pieces, fonts |

## Done (phase 1)
- Shelf with covers, favorites, rename, delete, recent pages, library counts, recent exports, storage use.
- New book: size presets or custom mm, 150 to 400 DPI, 2 to 600 pages, binding, paper, cover material and color.
- 3D book: realistic page bend while turning, corner drag twist, soft shadows, page stacks that grow and shrink,
  gutter curve, hardcover / softcover / spiral / ring binding, linen / leather / cloth / kraft / velvet / board covers,
  cover art from library, cover text, elastic band, ribbon, 6 desks, 3 camera views, orbit/zoom, keyboard, reduced motion.
- Customize panel changes cover, paper, binding, page numbers, turn speed, bend, desk live.
- Editor: 22 brushes (pencils, charcoal, oil pastel, crayon, ink pen, fineliner, gel pen, sumi brush, dry brush,
  impasto, oil, watercolor, gouache, marker, highlighter, airbrush, splatter, 2 erasers, smudge), fill, pick color,
  pen pressure, smoothing, per-brush settings, realistic tool shown under the cursor, layers (add, copy, order,
  merge, clear, lock, hide, opacity, 13 blend modes), images with filters and shadows, text with system and uploaded
  fonts, move / scale / rotate handles, undo/redo, autosave, 12 older versions per page.
- Library import keeps original files untouched. Sticker factory and makers as above. Dither on any image.
- Exports, all checked after they are made, with a report and a history:
  - Artwork: PNG (with DPI tag), TIFF (uncompressed, DPI), JPG (DPI), WEBP, BMP (32-bit alpha); original size, DPI,
    long side or percent; paper / color / transparent background; sharpen; spreads; page numbers; zip for many pages.
  - Print PDF: 150/300/600 DPI, lossless or JPG, bleed, crop marks, TrimBox/BleedBox, spreads.
  - Flip-through video: MP4 or WebM, 720p to 4K, square, vertical; 24/30/60 fps; bitrate; timing; 6 camera moves;
    page detail; synthesized page-turn sounds. Rendered frame by frame, so it is smooth on any PC.
  - GIF: flip-through, page building itself layer by layer, or each layer as a frame; colors, fps, loop, transparency.
  - Sticker sheet PNG at set DPI, or each sticker as its own PNG.
  - Project file `.shesketch` (all layers editable) and import.
  - Record: captures the live book view while flipping by hand (WebM).
- Export queue with progress, time left and cancel. You can keep working while it runs.
- Welcome guide on first visit, `?` button reopens it. 5 interface looks. 3 performance levels (preview only).
- PWA manifest + service worker (installable when served over https, e.g. GitHub Pages).

## Phase 2 (done)
- Paint engine rebuilt: oils, acrylic, gouache, pastels, ink brush and knives pick up and mix the paint under them in RYB (yellow over blue = green, checked by the self-test). Mixing rates are per brush width, so spacing does not change the look.
- Blend tool with finger smudge, soft blender, bristle blender, water brush (melts watercolor pencil, lifts), blending stump, knife blend.
- Brush maker: any engine, tip, tool look and setting, saved as "My brushes", export/import as .brush.json.
- Layers: thumbnails, drag to reorder, clip to below, protect transparent, lock, merge down/visible, fill, make paintable, pick several and delete. History list jumps to any step.
- Bottom tool dock with labels and animated buttons, tool hints, Preview (P), keys panel (?), first-open tips.
- Book: page z-fighting/stripes fixed (stack sits below the lowest sheet, all sheets have negative polygon offset, near plane 0.05), blank paper texture on loading sheets and stack tops, paper relief scaled by tooth, thickness from paper gsm, metal corners, foil/emboss/deboss/label titles, wear, page edge colors (gilded), endpaper patterns, headbands, 8 new cover materials, light warmth/strength/direction/height.
- Camera pad (dial + 12 views + zoom), smooth camera moves, free camera (WASD/QE), number keys for views, flip-book flick (F), export camera "My current view", flip book quick style.
- Media: GIFs, animated WEBP/PNG and short videos as page layers, playing in the editor, the book and exported videos.
- Paper maker + 8 more papers (dot grid, ruled, graph, toned gray/tan, mixed media, crumpled).

## Measured
- Rendering the book: about 1.7 ms per frame. A 200-page book opens in under 1 s; jumping to any page is instant
  (only the 4 visible sheets load textures).
- 1080p 30 fps MP4 with sound, 200 frames: verified frame count, length, size and audio.

## Honest limits right now
- Colors are sRGB 8-bit. No CMYK conversion or ICC profiles in the browser; the PDF says to convert at the print shop.
- No SVG or MOV export. TIFF is uncompressed.
- Background removal is color based (plain and checkerboard backgrounds). Busy photo backgrounds need the wand
  and brushes. No AI segmentation yet.
- Editing is one page at a time (two-page spread view is in the book, not the editor).
- Paint mixing samples the layer as it was when the stroke started, so a single stroke does not mix with itself when it loops back.
- Clipped layers draw with source-atop, so their own blend mode is ignored inside a clip group.
- Videos on pages are decoded at 12 fps, up to 15 s, max 720 px, and play without sound. GIF decoding needs ImageDecoder (Chrome, Edge, Brave).
- Brave blocks the "choose export folder" feature unless `brave://flags/#file-system-access-api` is on; files go to Downloads.
- Data lives in the browser. Clearing site data deletes it. Project files are the backup.
- Synthetic test pens report no samples; real pens and mice work (fallback added).

## Next phases (from the master prompt)
1. Selection tools for drawing layers (lasso, rectangle, magic wand) with move, cut, copy and paste. (Moving a whole drawing layer works now.)
2. Two-page spread editing and page templates (lined, grid, dot, collage layouts, comic panels).
3. Animation editor: frame timeline, onion skin, per-frame timing, export to GIF/MP4.
4. Collage and scrapbook tools: masks, torn-edge clip for any image, tape that sticks across pages.
5. Reference boards and batch export of many books.
6. Typography upgrades: text on a path, letter spacing, Google-free bundled hand fonts.
7. Comic and manga tools (panels, balloons, screentones via the dither engine), merch mockups.
8. Optional AI helper (only if the user wants it; needs an API key, so it stays off by default).
9. Desktop installer wrapper (Tauri or Electron) for a true app with direct file saving.

## GitHub
- Not a git repo yet. When the user asks: `git init`, commit, create the repo, push. GitHub Pages serves it as is.
- Keep `.shesketch` files and any personal art out of the repo (`.gitignore` covers `.shesketch`).
