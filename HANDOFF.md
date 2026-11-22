# SHESKETCHES handoff

The one status doc for this project. Read this first. Older handoff notes were folded into this file.

## What it is
A realistic virtual sketchbook and art studio. Built from the user's master prompt
("MASTER PROJECT: THE ULTIMATE HYPERREALISTIC VIRTUAL SKETCHBOOK & DIGITAL ART STUDIO").
Check every change against it: realism, a real working editor, separate artwork and book exports,
checked exports, local-first, honest limits.

## Where it lives
- Code: C:\CODE\shesketches
- Repo: https://github.com/shedithersminded-sudo/shesketches (branch `main`, public)
- Live app: https://shedithersminded-sudo.github.io/shesketches/ (GitHub Pages from `main` /)
- Local: `start.bat`, or launch config `shesketches` (python devserver.py, port 8800)
- Self-test: http://localhost:8801/tests.html via launch config `shesketches-test` (separate port = separate data, so the user's books on 8800 are never touched). 47 checks, last run 47 passed. On localhost only, `window.__app` is the app object for testing

## How we work here
- After every change: run tests.html, then commit and push. Pages updates in about a minute.
- Commit as shedithersminded-sudo with the GitHub noreply email.
- GitHub web steps go in Brave (Claude in Chrome). The built-in browser pane is not signed in to GitHub.
- The user often draws live in their own tab. Test on port 8801 (`shesketches-test`), which has its own empty storage.
  The user can see the browser pane and may click into the test tab; tell them it is test data.
- Tell the user to press Ctrl+R in their tab to load a new version. The current page saves first.
- Screenshots the user sends are bug reports or style inspo. Fix what they show.
- Copy in the app: plain short sentences, no em dashes, every setting gets a one-line help.
- Never fake a feature. Put real limits in the list below.
- Every new brush must pass tests.html (it runs every preset).
- Each visitor's books live only in their own browser (IndexedDB). Never commit personal art,
  user photos or `.shesketch` files. Everything shipped is made in code.
- The live site has its own shelf, separate from localhost. Move books with Export > Project file.

## Files
No build step. Vanilla JS ES modules. `three` is mapped with an import map in `index.html` and `tests.html`.

| File | What it does |
|---|---|
| `js/main.js` | Shelf, new book (16 types), book view (camera pad, free cam, flick, keys), Customize (Cover, Paper & inside, Book & turning, Desk & light, each with "Show me"), cover drawing, sticker tray, Record, Settings, guide |
| `js/book3d.js` | three.js book: bending pages, page stacks, bindings, cover, band, ribbon, desk, lights, turning, `hitAt` raycast for sticker drops |
| `js/editor.js` | Page editor: bottom dock, brush panel from PARAMS, brush maker, layers, history, select and move, quick menu, preview mode, cover mode |
| `js/brushes.js` | 75 PRESETS and PARAMS. 13 TIP_SHAPES (round, square, flat, bristle, fan, rake, chalk, sponge, triangle, diamond, star, heart, nib) for dry, wet, blend and erase. Drag param. Smooth blurred thick-paint relief. `mixPaint()` |
| `js/colorwheel.js` | Hue ring + strength/lightness square, lighter/darker, matching and softer color ideas, hex/HSV math |
| `js/render.js` | Artwork renderer, clipping, GIF / animated WEBP / video media |
| `js/stickerfx.js` | Sticker looks at draw time: border, finishes, textures, puffy, wrinkles, wear, peel, tint, 11 presets |
| `js/stickers.js` | Sticker factory (background removal, wand, outlines, gloss) and the makers screen |
| `js/makers.js` | 15 makers that build cut-outs in code, plus the starter set |
| `js/paper.js` | Procedural papers, cover materials, desks, page edges |
| `js/papermaker.js` | Make your own paper, saved in settings |
| `js/model.js` | Book and page data |
| `js/db.js` | IndexedDB storage, blobs, cleanup, `.shesketch` project files |
| `js/library.js` | Imported art (original bytes kept), stickers, made pieces, fonts |
| `js/dither.js` | SHEDITHERS link, runs `vendor/shd-engine.js` in a worker (copy `shedithers/js/engine.js` again for new effects) |
| `js/exporter.js` | Export center, queue, checks, reports, history |
| `js/encoders.js` | Zip, TIFF, BMP, PDF writers, DPI tags, file inspectors |
| `js/selftest.js` | The tests.html self-test |
| `js/ui.js` | Shared UI helpers |

## What works now
- **Shelf and books:** 16 book types, 2 to 600 pages, sizes in mm, 150 to 400 DPI, paper gsm sets thickness.
- **3D book:** realistic page bend and corner twist, textured paper on every sheet (stripe bug fixed),
  hard / soft / spiral / ring, many cover materials, metal corners, wear, foil / emboss / label titles,
  gilded edges, endpapers, band, ribbon, 6 desks, light direction and warmth.
  Camera pad with 12 views, free camera (C, then WASD/QE), flick (F), keys list (K).
  Camera dial is a map seen from above (front at the bottom, the dot is where you stand); it, the zoom slider and arrow keys on the dial orbit around where you are looking (`orbitTo(..., keepTarget)`). Drag the desk (off the book) to look around. Resizing the window no longer resets the camera.
  Page turns clicked during a turn are queued (`step`, `queued`, `endPos`), so 3 clicks = 3 pages. Click the page label or press G to go to a page number.
  Pick up (H): `holder` group above `group`; the book leans toward the camera and the camera rises with it; drag the desk to turn it in your hands. Pointer math uses the holder's local space.
  Clear plastic front cover (Customize > Cover, `cover.clear`): page 1 shows through; cover art and title print on the plastic.
  Pages darken toward the spine (vertex colors on leaves). Sheet lines on the page block show on dark paper too.
- **Customize:** four tabs, each with "Show me". Draw your own cover in the full editor.
- **Saving and names:** saves a few seconds after you stop drawing, fully every 5 minutes, and when you switch tabs or close. A restore point every 5 minutes, 24 kept (about 2 hours), in Page > Restore points. Status shows "Saved X min ago".
  Name a page in the box at the top of the editor (or Page > Name). Names show on the book's Draw buttons and in export file names.
- **Every part of the book:** "✎ Draw on…" (and Customize > Cover) opens the front cover, back cover, inside covers, spine, page edges (fore-edge) or desk in the full editor. Parts are pages in `book.surf` (front stays `book.coverPage`), sizes from `surfaceSize()` in model.js. The editor's paper for a part is the real material (`Book3D.surfaceBase`). "⟲ Turn over" (O) flips the closed book to show the back.
- **Desk:** 12 surfaces incl. marble, cork, linen, slate, pine, colored felt, or your own photo; pattern size; draw and stick on it (a 5x5 book-height area under the book, `DESK_ART`).
- **Stickers on the book:** drag stickers onto pages, covers, back cover or desk. Press and drag a placed sticker right on the 3D book to move it; double-click it to open it in the editor. In the editor, double-click any sticker or text with any tool to pick it up, triple-click to open its look.
- **Sticker looks:** 32 presets; border styles (two-tone, rainbow, fade, cut line, stitched, glitter, chrome, hand drawn), outer and inner lines, glow, 15 finishes plus a second finish, shine angle, 25 textures, see-through. Factory: 7 outline shapes x 5 color styles, lines on the outline, and a baked-in look.
- **Starter pieces:** a second set (`STARTERS_2`, ~90) is added once for everyone (`seeded2`): "Cute sticker" maker (27 shapes, patterns, faces, words) and "Scrapbook piece" maker (wax seals, key charm, cut-out and arched words, rhinestones, labels, receipts, clips, spiral, retro window, label tape, keycaps, old folded paper and more), made from the user's Pinterest inspo without copying brands.
- **Phones and iPad:** pinch zoom, two-finger pan, two-finger tap undo, three-finger tap redo, palm rejection once a pen is used (Fingers setting). Side panel slides in (☰ Brushes), toolbar wraps on two rows under 900 px, bigger touch targets, closed book centered on tall screens. Own GIF reader for Safari (`decodeGifJS`). Lower undo memory on phones and tablets.
- **Speed:** GIFs redraw only when their frame changes. The editor keeps the finished page as two screen-sized pictures and redraws only what changes (the layer being painted, moving GIFs); hovering costs about 0.2 ms.
  Paint/erase brushes draw into an in-memory copy of the layer (`this.work`) and copy the changed rectangle onto the layer once per pointer move. Wet paint touches are at least 7% of the brush apart (mixing is per distance, so the look is the same), the mixing grid shrinks for small brushes, color math does not allocate, page reads use a per-row tile cache, the blur is two-pass. Result: paint and blenders about 4 to 5 ms per pointer move (was 8 to 12).
  While painting, the editor keeps the active layer as a screen-sized picture (`drawLive`) and redraws only the area the brush touched since the last frame (`Stroke.viewBox`). Smooth shrinking of a full page costs about 8 ms per canvas, so this took a frame during a stroke from about 14 ms to about 6 ms, same pixels (within 3/255).
  Canvases that are read back pixel by pixel use `willReadFrequently` (makers, paper tiles, brush work canvases, previews). Closed brush groups build only when opened. Book page textures load once even if asked for twice; blank pages keep their first preview.
- **Gotcha:** `globalCompositeOperation = 'copy'` with `drawImage` wipes the WHOLE canvas, not just the drawn rectangle. Use `clearRect` + normal draw to replace a rectangle (undo had this bug and could erase the rest of a layer; fixed).
- **Brushes:** Stabilizer (pulled string) in Basics, shown as a dashed line while drawing. Ribbon bookmark is a simulated satin strip (120 joints, small physics steps) that lies on the page, bends over the page edge, rests on the cover board overhang, then drops to the desk. Only the desk tail is loose; it settles within about 3 s of a turn.
- **Copy style:** help lines are one short sentence. Brush descriptions say what it is and what it is best for. Brush groups and setting groups fold.
- **Editor:** 75 brushes in every section. Tip shapes for brushes, blenders and erasers. Drag setting (how far colors smear) in brush settings and the dock.
  Double-click the page = quick menu (right button does nothing). Color wheel in the panel (right under Brushes) and as a popup (C or click the color chip). Big handles, new vs old color, color name, Color / Strength / Lightness sliders, arrow keys work, screen reader labels.
  Pick color with a loupe (I, or hold Alt), from everything or one layer, 1 to 11 px average, plus pick from screen and copy hex.
  Zoom: scroll, 1/2/3 = 100/200/400% at cursor, 0 fit, hold Z + click or drag, zoom row in the quick menu. Paints mix like real paint (blue + yellow = green). Blend tool with 6 blenders
  plus smoothing. Brush maker with "My brushes" and .brush.json sharing. Layers with thumbnails, drag order,
  clip, protect transparent, lock, merge, fill. Undo, redo, history jump. Multi-select move, lock, delete.
  Quick menu (double-click or Q). Alt+scroll size, Alt+Shift+scroll strength. Text, images, filters.
- **Stickers:** tray in the book view (T) and editor (K). Drag onto the 3D cover or a page, then
  "Edit it" or "Undo". Sticker look settings and presets in the Picture panel.
- **Media:** GIFs, animated WEBP/PNG and short videos on pages. They play in the book and in videos.
- **Paper maker** on the shelf.
- **Exports (all checked after making, with a report):** PNG, TIFF, JPG, WEBP, BMP, print PDF with bleed
  and crop marks, flip-through MP4/WebM up to 4K with page-turn sounds, GIFs, sticker sheets, project files,
  live Record.
- **Speed:** paint reads the page once per stroke in tiles. Undo stores only "before" pixels with a memory cap.
  Book frame about 1.7 ms. A 200-page book opens in under 1 s.

## Honest limits
- GIFs pause while a stroke is in progress and move again when you lift the pen.
- A single stroke does not mix with itself when it loops back over its own paint.
- In the 3D book, foil titles look more brown than shiny gold.
- Videos on pages: 12 fps, up to 15 s, max 720 px, no sound. GIF decoding needs Chrome, Edge or Brave.
- Colors are sRGB 8-bit. No CMYK or ICC. The PDF says to convert at the print shop.
- No SVG or MOV export. TIFF is uncompressed.
- Background removal is color based. Busy photos need the wand and brushes.
- Editing is one page at a time (spreads show in the book only).
- Clipped layers ignore their own blend mode.
- Brave blocks "choose export folder" unless `brave://flags/#file-system-access-api` is on. Files go to Downloads.
- Clearing site data deletes books. Project files are the backup.

## Next ideas (from the master prompt)
1. Selection tools on drawing layers (lasso, rectangle, magic wand) with cut, copy, paste.
2. Two-page spread editing and page templates (collage layouts, comic panels).
3. Animation editor with frames, onion skin and timing.
4. Collage tools: masks, torn-edge clip for any image, tape across pages.
5. Reference boards and batch export of many books.
6. Text on a path, letter spacing, bundled hand fonts.
7. Comic tools (panels, balloons, screentones via the dither engine), merch mockups.
8. Optional AI helper, off by default (needs an API key).
9. Desktop app wrapper for direct file saving.
