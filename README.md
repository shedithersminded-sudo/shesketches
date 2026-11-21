# SHESKETCHES

A realistic virtual sketchbook and art studio that runs in your browser.

- Pick from 16 kinds of books (classic, chunky journal, pocket, watercolor, spiral, flip book, black paper and more), then change the size, pages, paper thickness, cover, corners, title, page edges, desk and light. Flip through it in 3D, flick it like a flip book, or fly around it with a free camera.
- Draw on any page or the cover with 36 brushes: pencils, colored and watercolor pencils, charcoal, pastels, inks, oils, acrylic, gouache, watercolor, markers and more. Paints mix like real paint, and blenders smudge, soften and melt colors. Every setting explains itself, and you can make your own brushes. Pen pressure works.
- Full layers (lock, clip, protect transparent, merge, drag to reorder), undo, redo and a history you can jump through.
- Drag your stickers straight onto the cover or any page, then give each one its own look: die-cut border, gloss, holographic, glitter, gold foil, puffy, paper or fabric texture, wrinkles, wear or a peeling corner.
- Put GIFs and short videos on pages. They play in the book and in exported videos.
- Make your own paper: tooth, fibers, speckles, creases, aged edges, ruled, grid or dot lines.
- Import your own art, cut things out with the sticker factory, and build torn paper, cardboard frames, lace, doilies, lockets, tape, stamps and tickets in the makers. Everything comes out with no background.
- Export clean artwork (PNG, TIFF, JPG, WEBP, BMP, print PDF), flip-through videos up to 4K, and GIFs. Every export is checked and you get a report.

## Your work stays yours
Everything you make is saved in your own browser on your own computer. Nothing is uploaded, and nobody else can see it. Use Export > Project file to back up a book or move it to another computer.

## Run it
- Online: open the GitHub Pages link for this repo.
- On your PC: download the code, then double-click `start.bat` (needs Python 3), or run `python devserver.py` and open http://localhost:8800.

Works best in Chrome or Edge. In Brave, saving straight to a folder needs `brave://flags/#file-system-access-api`; otherwise files go to Downloads.

## Check it works
Open `tests.html`. It makes a temporary book, runs every export, checks every file and deletes the book.
