# ASCIIGEN

A browser-based image-to-ASCII art generator with multiple render modes and real-time colour extraction.

**Live demo:** [asciigen-nu.vercel.app](https://asciigen-nu.vercel.app/)

## Modes

- **ASCII** — character-based halftone using circles, classic, or block charsets
- **Dither** — ordered dithering with configurable Bayer matrices (2x2, 4x4, 8x8)
- **Pixel** — colour-quantised pixel art with adjustable block size
- **CRT** — retro scanline effect simulating a cathode ray tube display
- **Glyph** — halftone using uploaded PNG shapes sorted by density

## Features

- Upload up to 10 images with a multi-image gallery
- Automatic colour palette extraction (k-means clustering)
- Per-image palette editing with live preview
- Colour modes: image palette, monochrome, or global single colour
- Brightness, contrast, and saturation adjustments
- Export as PNG, TXT, or batch ZIP
- Bundled sample image to try without uploading
- Fully client-side — no server, no data leaves your browser

## Tech

Pure static site — no build step, no dependencies beyond two CDN libraries:

- [DM Mono](https://fonts.google.com/specimen/DM+Mono) + [Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans) via Google Fonts
- [JSZip](https://stuk.github.io/jszip/) for batch export
