/**
 * ASCII Art Generator - Core Logic
 * Handles image processing, ASCII conversion, and Bayer dithering
 */

class ASCIIGenerator {
    constructor() {
        this.canvas = document.getElementById('hiddenCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.currentImage = null;
        this.currentSettings = {
            density: 8,
            charSet: '●◉○◌· ',
            brightness: 0,
            contrast: 1.0,
            saturation: 1.0,
            spacing: 0,
            preserveColor: true,
            palette: null,        // array of hex strings, null = no quantisation
            ditherMatrixSize: 4,  // 2, 4, or 8
            ditherSpread: 1.0,    // how aggressively to dither (0 – 2)
            ditherScale: 1,       // pixel upscale factor (1 = native)
            pixelBlockSize: 16,   // grid cell size for pixel overlay
            pixelThreshold: 0.45, // darkness (0-1) above which a block is drawn
            crtCellSize: 6,       // phosphor triad pitch in output pixels
            crtGlow: 0.4,         // bloom strength (0 = none, 1 = full)
            glyphShapes: [],      // array of { img, coverage } objects
            glyphDensity: 30,     // cells across longest axis
            glyphShapeSize: 0.9,  // glyph draw size as fraction of cell
            glyphUseColor: true,  // tint glyphs with original pixel colour
            glyphRangeStart: 1,           // 1-based index of first active shape (auto mode)
            glyphRangeEnd: -1,            // 1-based index of last active shape; -1 = all
            glyphMappingMode: 'auto',     // 'auto' | 'manual'
            glyphManualPositions: [],     // 0-1 brightness positions parallel to sorted shapes
            glyphBackgroundColor: '#ffffff', // background fill for glyph mode output
            glyphRetina: false,              // render at 2x internal resolution for HiDPI
        };

        this.charSets = {
            circles: '●◉○◌· ',
            classic: '@%#*+=-:. ',
            blocks:  '█▓▒░ '
        };

        // Pre-built Bayer matrices (unnormalised integers)
        this._bayerMatrices = {
            2: [[0, 2],
                [3, 1]],
            4: [[ 0,  8,  2, 10],
                [12,  4, 14,  6],
                [ 3, 11,  1,  9],
                [15,  7, 13,  5]],
            8: [[ 0, 32,  8, 40,  2, 34, 10, 42],
                [48, 16, 56, 24, 50, 18, 58, 26],
                [12, 44,  4, 36, 14, 46,  6, 38],
                [60, 28, 52, 20, 62, 30, 54, 22],
                [ 3, 35, 11, 43,  1, 33,  9, 41],
                [51, 19, 59, 27, 49, 17, 57, 25],
                [15, 47,  7, 39, 13, 45,  5, 37],
                [63, 31, 55, 23, 61, 29, 53, 21]]
        };
    }

    // ─── Settings ──────────────────────────────────────────────────────────────

    updateSettings(settings) {
        this.currentSettings = { ...this.currentSettings, ...settings };
    }

    // ─── Image loading ─────────────────────────────────────────────────────────

    loadImage(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('image/')) {
                reject(new Error('Please upload a valid image file'));
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                reject(new Error('Image size must be less than 10MB'));
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => { this.currentImage = img; resolve(img); };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Load an image from a data URL (for bundled/default images).
     * Data URLs are same-origin so the canvas won't be tainted.
     */
    loadImageFromDataURL(dataURL) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => { this.currentImage = img; resolve(img); };
            img.onerror = () => reject(new Error('Failed to load default image'));
            img.src = dataURL;
        });
    }

    // ─── Colour helpers ────────────────────────────────────────────────────────

    rgbToHex(r, g, b) {
        return '#' + [r, g, b]
            .map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
            .join('');
    }

    hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
    }

    nearestPaletteColor(r, g, b, palette) {
        let best = palette[0], bestDist = Infinity;
        for (const hex of palette) {
            const c = this.hexToRgb(hex);
            if (!c) continue;
            const d = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
            if (d < bestDist) { bestDist = d; best = hex; }
        }
        return best;
    }

    // ─── Colour extraction (k-means) ──────────────────────────────────────────

    /**
     * Draw img to the hidden canvas and extract k dominant colours.
     * Stores them in currentSettings.palette and returns the hex array.
     */
    extractColors(img, k = 5) {
        this.canvas.width  = img.width;
        this.canvas.height = img.height;
        this.ctx.clearRect(0, 0, img.width, img.height);
        this.ctx.drawImage(img, 0, 0);
        const imageData = this.ctx.getImageData(0, 0, img.width, img.height);
        const colors    = this._kMeans(imageData, k);
        this.currentSettings.palette = colors;
        return colors;
    }

    _kMeans(imageData, k) {
        const pixels = [];
        const step   = 40; // sample 1-in-40 pixels for speed
        for (let i = 0; i < imageData.data.length; i += 4 * step) {
            if (imageData.data[i + 3] > 128) {
                pixels.push([imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]]);
            }
        }
        if (pixels.length < k) return [];

        const stride = Math.floor(pixels.length / k);
        let centroids = Array.from({ length: k }, (_, i) => [...pixels[i * stride]]);

        for (let iter = 0; iter < 20; iter++) {
            const sums   = Array.from({ length: k }, () => [0, 0, 0]);
            const counts = new Array(k).fill(0);
            for (const [r, g, b] of pixels) {
                let best = 0, bestDist = Infinity;
                for (let j = 0; j < k; j++) {
                    const [cr, cg, cb] = centroids[j];
                    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
                    if (d < bestDist) { bestDist = d; best = j; }
                }
                sums[best][0] += r; sums[best][1] += g; sums[best][2] += b;
                counts[best]++;
            }
            let changed = false;
            for (let j = 0; j < k; j++) {
                if (counts[j] === 0) continue;
                const nr = Math.round(sums[j][0] / counts[j]);
                const ng = Math.round(sums[j][1] / counts[j]);
                const nb = Math.round(sums[j][2] / counts[j]);
                if (nr !== centroids[j][0] || ng !== centroids[j][1] || nb !== centroids[j][2]) {
                    centroids[j] = [nr, ng, nb];
                    changed = true;
                }
            }
            if (!changed) break;
        }

        // Sort dark → light by luminance
        centroids.sort((a, b) =>
            (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]) -
            (0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2]));

        return centroids.map(([r, g, b]) => this.rgbToHex(r, g, b));
    }

    // ─── Pixel helpers ─────────────────────────────────────────────────────────

    getPixelData(imageData, x, y, width) {
        const i = (y * width + x) * 4;
        return { r: imageData.data[i], g: imageData.data[i + 1],
                 b: imageData.data[i + 2], a: imageData.data[i + 3] };
    }

    getBrightness(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

    mapToCharacter(brightness, charSet) {
        const idx = Math.floor((brightness / 255) * (charSet.length - 1));
        return charSet[Math.max(0, Math.min(charSet.length - 1, idx))];
    }

    applyColorAdjustments({ r, g, b }, { brightness, contrast, saturation }) {
        r += brightness; g += brightness; b += brightness;
        r = ((r - 128) * contrast) + 128;
        g = ((g - 128) * contrast) + 128;
        b = ((b - 128) * contrast) + 128;
        const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
        r = gray + (r - gray) * saturation;
        g = gray + (g - gray) * saturation;
        b = gray + (b - gray) * saturation;
        return {
            r: Math.max(0, Math.min(255, Math.round(r))),
            g: Math.max(0, Math.min(255, Math.round(g))),
            b: Math.max(0, Math.min(255, Math.round(b)))
        };
    }

    // ─── ASCII processing ──────────────────────────────────────────────────────

    processImage(img, options = {}) {
        const settings = { ...this.currentSettings, ...options };

        this.canvas.width  = img.width;
        this.canvas.height = img.height;
        this.ctx.clearRect(0, 0, img.width, img.height);
        this.ctx.drawImage(img, 0, 0);
        const imageData = this.ctx.getImageData(0, 0, img.width, img.height);

        const step = Math.max(1, Math.floor(21 - settings.density));
        const asciiData = [];

        for (let y = 0; y < img.height; y += step) {
            const row = [];
            for (let x = 0; x < img.width; x += step) {
                const pixel    = this.getPixelData(imageData, x, y, img.width);
                const adjusted = this.applyColorAdjustments(pixel, settings);
                const brightness = this.getBrightness(adjusted.r, adjusted.g, adjusted.b);
                let char = this.mapToCharacter(brightness, settings.charSet);
                if (settings.spacing > 0 && Math.random() * 100 < settings.spacing) char = ' ';

                let color;
                if (!settings.preserveColor) {
                    color = '#e0dbd3';
                } else if (settings.palette && settings.palette.length > 0) {
                    color = this.nearestPaletteColor(adjusted.r, adjusted.g, adjusted.b, settings.palette);
                } else {
                    color = `rgb(${adjusted.r},${adjusted.g},${adjusted.b})`;
                }
                row.push({ char, color });
            }
            asciiData.push(row);
        }

        return {
            data:   asciiData,
            width:  Math.ceil(img.width  / step),
            height: Math.ceil(img.height / step)
        };
    }

    renderASCII(asciiResult, container) {
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.lineHeight = '1';
        wrap.style.letterSpacing = '0';

        for (const row of asciiResult.data) {
            const line = document.createElement('div');
            line.style.whiteSpace = 'nowrap';
            for (const cell of row) {
                const span = document.createElement('span');
                span.textContent = cell.char;
                span.style.color = cell.color;
                line.appendChild(span);
            }
            wrap.appendChild(line);
        }
        container.appendChild(wrap);
    }

    // ─── Bayer dithering ───────────────────────────────────────────────────────

    /**
     * Render a Bayer-dithered version of img onto outputCanvas using the
     * current palette.  Each source pixel is colour-adjusted, then a
     * position-dependent Bayer threshold is added to each channel before
     * snapping to the nearest palette colour.
     *
     * @param {HTMLImageElement} img
     * @param {HTMLCanvasElement} outputCanvas  – displayed in the stage
     * @param {Object} [opts]  – override any currentSettings keys
     */
    ditherImage(img, outputCanvas, opts = {}) {
        const s = { ...this.currentSettings, ...opts };

        if (!s.palette || s.palette.length === 0) return;

        const matrix    = this._bayerMatrices[s.ditherMatrixSize] || this._bayerMatrices[4];
        const matN      = matrix.length;           // matrix side length
        const matMax    = matN * matN;             // number of distinct thresholds
        const spread    = s.ditherSpread * 128;    // max channel offset (± spread)
        const pixelSize = Math.max(1, Math.round(s.ditherScale));

        // Scale source to a reasonable working resolution
        const maxDim = 900;
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxDim) {
            const sc = maxDim / Math.max(w, h);
            w = Math.floor(w * sc);
            h = Math.floor(h * sc);
        }
        // Divide by pixelSize so each "pixel block" covers pixelSize × pixelSize
        const dw = Math.floor(w / pixelSize);
        const dh = Math.floor(h / pixelSize);

        // Draw source at working resolution on the hidden canvas
        this.canvas.width  = w;
        this.canvas.height = h;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.drawImage(img, 0, 0, w, h);
        const src = this.ctx.getImageData(0, 0, w, h);

        // Parse palette once
        const pal = s.palette.map(hex => this.hexToRgb(hex)).filter(Boolean);

        // Output canvas size = dw * pixelSize  (round-trips to original w)
        outputCanvas.width  = dw * pixelSize;
        outputCanvas.height = dh * pixelSize;
        const outCtx = outputCanvas.getContext('2d');
        // Fill with first palette colour so transparent areas look clean
        const firstHex = s.palette[0];
        outCtx.fillStyle = firstHex;
        outCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

        for (let by = 0; by < dh; by++) {
            for (let bx = 0; bx < dw; bx++) {
                // Sample the centre pixel of each block from the source
                const sx = Math.min(bx * pixelSize + Math.floor(pixelSize / 2), w - 1);
                const sy = Math.min(by * pixelSize + Math.floor(pixelSize / 2), h - 1);
                const si = (sy * w + sx) * 4;

                const raw = {
                    r: src.data[si],
                    g: src.data[si + 1],
                    b: src.data[si + 2]
                };
                const adj = this.applyColorAdjustments(raw, s);

                // Bayer threshold, normalised to [0, 1)
                const t = matrix[by % matN][bx % matN] / matMax;
                // Offset: ranges from -spread/2 to +spread/2  (centred on 0)
                const offset = (t - 0.5) * spread;

                // Add offset to each channel then snap to nearest palette colour
                const dr = Math.max(0, Math.min(255, adj.r + offset));
                const dg = Math.max(0, Math.min(255, adj.g + offset));
                const db = Math.max(0, Math.min(255, adj.b + offset));

                const hex = this.nearestPaletteColor(dr, dg, db, s.palette);
                outCtx.fillStyle = hex;
                outCtx.fillRect(bx * pixelSize, by * pixelSize, pixelSize, pixelSize);
            }
        }
    }

    // ─── Pixel / duotone mode ──────────────────────────────────────────────────

    /**
     * Render a duotone image with pixel-block overlay onto outputCanvas.
     *
     * Palette mapping (sorted dark → light):
     *   palette[0]                       → pixel block colour (darkest)
     *   palette[floor((len-1)/2)]        → duotone shadow colour (mid)
     *   palette[len-1]                   → duotone highlight colour (lightest)
     *
     * Each grid cell of size pixelBlockSize is painted with the block colour
     * wherever the source darkness exceeds pixelThreshold.
     */
    pixelImage(img, outputCanvas, opts = {}) {
        const s = { ...this.currentSettings, ...opts };
        if (!s.palette || s.palette.length < 2) return;

        const blockSize  = Math.max(4, Math.round(s.pixelBlockSize));
        const threshold  = s.pixelThreshold; // 0–1

        const pal        = s.palette;
        const midIdx     = Math.floor((pal.length - 1) / 2);
        const lightColor = this.hexToRgb(pal[pal.length - 1]);  // lightest → highlight
        const darkColor  = this.hexToRgb(pal[midIdx]);           // mid      → shadow
        const blockColor = this.hexToRgb(pal[0]);                // darkest  → blocks

        // Scale source to working resolution
        const maxDim = 900;
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxDim) {
            const sc = maxDim / Math.max(w, h);
            w = Math.floor(w * sc);
            h = Math.floor(h * sc);
        }

        this.canvas.width  = w;
        this.canvas.height = h;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.drawImage(img, 0, 0, w, h);
        const src = this.ctx.getImageData(0, 0, w, h);

        outputCanvas.width  = w;
        outputCanvas.height = h;
        const outCtx  = outputCanvas.getContext('2d');
        const outData = outCtx.createImageData(w, h);

        // Pass 1 — duotone: lerp between darkColor (shadows) and lightColor (highlights)
        for (let i = 0; i < w * h; i++) {
            const si  = i * 4;
            const adj = this.applyColorAdjustments(
                { r: src.data[si], g: src.data[si + 1], b: src.data[si + 2] }, s
            );
            const lum = this.getBrightness(adj.r, adj.g, adj.b) / 255; // 0=dark, 1=light
            outData.data[si]     = Math.round(darkColor.r + (lightColor.r - darkColor.r) * lum);
            outData.data[si + 1] = Math.round(darkColor.g + (lightColor.g - darkColor.g) * lum);
            outData.data[si + 2] = Math.round(darkColor.b + (lightColor.b - darkColor.b) * lum);
            outData.data[si + 3] = 255;
        }
        outCtx.putImageData(outData, 0, 0);

        // Pass 2 — pixel overlay: fill grid cells that are sufficiently dark
        outCtx.fillStyle = `rgb(${blockColor.r},${blockColor.g},${blockColor.b})`;
        const cols = Math.ceil(w / blockSize);
        const rows = Math.ceil(h / blockSize);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const bx = col * blockSize;
                const by = row * blockSize;
                const bw = Math.min(blockSize, w - bx);
                const bh = Math.min(blockSize, h - by);

                // Average source darkness across this cell
                let sumDark = 0, count = 0;
                for (let py = by; py < by + bh; py++) {
                    for (let px = bx; px < bx + bw; px++) {
                        const si  = (py * w + px) * 4;
                        const adj = this.applyColorAdjustments(
                            { r: src.data[si], g: src.data[si + 1], b: src.data[si + 2] }, s
                        );
                        sumDark += 1 - (this.getBrightness(adj.r, adj.g, adj.b) / 255);
                        count++;
                    }
                }
                if (sumDark / count > threshold) {
                    outCtx.fillRect(bx, by, bw, bh);
                }
            }
        }
    }

    // ─── CRT phosphor mode ─────────────────────────────────────────────────────

    /**
     * Render a CRT phosphor-dot simulation onto outputCanvas.
     *
     * Each image pixel maps to a "triad" cell containing three phosphor dots
     * arranged in a delta pattern (R top-left, G top-right, B bottom-centre).
     * Odd rows are offset by half a cell to create the hexagonal phosphor grid.
     * Dots are drawn with ctx.globalCompositeOperation = 'lighter' so RGB channels
     * add additively, matching real CRT phosphor emission.
     */
    crtImage(img, outputCanvas, opts = {}) {
        const s        = { ...this.currentSettings, ...opts };
        const cellSize = Math.max(3, Math.round(s.crtCellSize || 6));
        const dotR     = cellSize * 0.36;
        const glowAmt  = s.crtGlow != null ? s.crtGlow : 0.4;

        // Size the canvas to the image (not the stage) — keeps cell count low
        const maxDim = 600;
        let W = img.naturalWidth  || img.width;
        let H = img.naturalHeight || img.height;
        if (Math.max(W, H) > maxDim) {
            const sc = maxDim / Math.max(W, H);
            W = Math.round(W * sc);
            H = Math.round(H * sc);
        }
        outputCanvas.width  = W;
        outputCanvas.height = H;

        const ctx = outputCanvas.getContext('2d');
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, W, H);

        // Downsample source to the cell grid using the hidden canvas
        const cellsX = Math.ceil(W / cellSize) + 2;
        const cellsY = Math.ceil(H / cellSize) + 2;
        this.canvas.width  = cellsX;
        this.canvas.height = cellsY;
        this.ctx.clearRect(0, 0, cellsX, cellsY);
        this.ctx.drawImage(img, 0, 0, cellsX, cellsY);
        const raw = this.ctx.getImageData(0, 0, cellsX, cellsY);

        // Additive blending: phosphors emit light
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowBlur = dotR * glowAmt * 4;

        for (let cy = 0; cy < cellsY; cy++) {
            // Delta pattern: shift odd rows by half a cell for hexagonal packing
            const rowShift = (cy % 2) * (cellSize * 0.5);

            for (let cx = 0; cx < cellsX; cx++) {
                const si  = (cy * cellsX + cx) * 4;
                const adj = this.applyColorAdjustments(
                    { r: raw.data[si], g: raw.data[si + 1], b: raw.data[si + 2] }, s
                );

                if (adj.r + adj.g + adj.b < 3) continue; // skip near-black cells

                const ox = cx * cellSize + rowShift;
                const oy = cy * cellSize;

                // Delta triad: R top-left, G top-right, B bottom-centre
                const phosphors = [
                    { x: ox + cellSize * 0.25, y: oy + cellSize * 0.28, ri: adj.r, gi: 0,     bi: 0     },
                    { x: ox + cellSize * 0.75, y: oy + cellSize * 0.28, ri: 0,     gi: adj.g,  bi: 0     },
                    { x: ox + cellSize * 0.50, y: oy + cellSize * 0.72, ri: 0,     gi: 0,      bi: adj.b },
                ];

                for (const p of phosphors) {
                    if (p.ri + p.gi + p.bi < 2) continue;
                    const col = `rgb(${p.ri},${p.gi},${p.bi})`;
                    ctx.shadowColor = col;
                    ctx.fillStyle   = col;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowBlur  = 0;
        ctx.shadowColor = 'transparent';
    }

    // ─── Glyph mode ────────────────────────────────────────────────────────────

    /**
     * Compute what fraction of a shape image's area is opaque (0 = empty, 1 = filled).
     * Dense/filled shapes → high coverage → used for dark image areas.
     */
    _computeShapeCoverage(shapeImg) {
        const sz = 32;
        const c  = document.createElement('canvas');
        c.width = c.height = sz;
        const x  = c.getContext('2d');
        x.drawImage(shapeImg, 0, 0, sz, sz);
        const d  = x.getImageData(0, 0, sz, sz).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) {
            if (d[i] > 50) n++;
        }
        return n / (sz * sz);
    }

    /**
     * Render a glyph-halftone image onto outputCanvas.
     *
     * The source image is divided into a grid; each cell's luminance selects a
     * glyph from the uploaded shape library (sorted dense→sparse so dark cells
     * get filled shapes and light cells get sparse ones).  If glyphUseColor is
     * true the glyph is tinted with the original pixel colour via source-in
     * compositing on a per-cell offscreen canvas.
     */
    glyphImage(img, outputCanvas, opts = {}) {
        const s      = { ...this.currentSettings, ...opts };
        const raw    = s.glyphShapes;
        if (!raw || raw.length === 0) return;

        // Sort shapes: highest coverage first (dense = dark, sparse = light)
        const shapes = [...raw].sort((a, b) => b.coverage - a.coverage);

        // Scale for device pixel ratio so canvas pixels map 1:1 to screen pixels.
        // HD toggle guarantees at least 2× (useful for exports and 1× displays).
        const dpr   = Math.min(Math.ceil(window.devicePixelRatio || 1), 2);
        const scale = Math.max(s.glyphRetina ? 2 : 1, dpr);
        const maxDim = 700 * scale;
        let W = img.naturalWidth  || img.width;
        let H = img.naturalHeight || img.height;
        // Fit to maxDim (downscale large images) and upscale small ones by
        // up to `scale` so canvas.width/scale always gives correct CSS size.
        const fit = Math.min(maxDim / Math.max(W, H), scale);
        if (fit !== 1) {
            W = Math.round(W * fit);
            H = Math.round(H * fit);
        }
        outputCanvas.width  = W;
        outputCanvas.height = H;

        const outCtx = outputCanvas.getContext('2d');
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';
        outCtx.fillStyle = s.glyphBackgroundColor || '#ffffff';
        outCtx.fillRect(0, 0, W, H);

        // Draw source at working size for pixel sampling
        this.canvas.width  = W;
        this.canvas.height = H;
        this.ctx.clearRect(0, 0, W, H);
        this.ctx.drawImage(img, 0, 0, W, H);
        const imgData = this.ctx.getImageData(0, 0, W, H);

        const density   = Math.max(5, Math.round(s.glyphDensity   || 30));
        const sizeRatio = Math.max(0.1, s.glyphShapeSize || 0.9);
        const useColor  = s.glyphUseColor !== false;

        const cellSize = Math.max(W, H) / density;
        const drawSize = Math.max(1, Math.ceil(cellSize * sizeRatio));
        const cols = Math.ceil(W / cellSize);
        const rows = Math.ceil(H / cellSize);

        // Pre-allocate one tinting canvas; reused every cell.
        // Moderate 2× supersample softens edges without over-sharpening.
        const tintCanvas = document.createElement('canvas');
        const tintRes = Math.min(256, Math.max(drawSize, drawSize * 2));
        tintCanvas.width = tintCanvas.height = tintRes;
        const tintCtx = tintCanvas.getContext('2d');

        // Pre-render each unique shape at tintRes once.  Drawing from a
        // cached canvas is a 1:1 pixel copy — no scaling, no re-rasterisation.
        const shapeCache = new Map();
        for (const shape of shapes) {
            if (!shapeCache.has(shape.img)) {
                const c = document.createElement('canvas');
                c.width = c.height = tintRes;
                const ctx = c.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(shape.img, 0, 0, tintRes, tintRes);
                shapeCache.set(shape.img, c);
            }
        }

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cx = col * cellSize + cellSize / 2;
                const cy = row * cellSize + cellSize / 2;

                const sx  = Math.min(Math.floor(cx), W - 1);
                const sy  = Math.min(Math.floor(cy), H - 1);
                const idx = (sy * W + sx) * 4;

                const adj = this.applyColorAdjustments(
                    { r: imgData.data[idx], g: imgData.data[idx + 1], b: imgData.data[idx + 2] }, s
                );

                const lum = this.getBrightness(adj.r, adj.g, adj.b) / 255;

                // Select shape based on mapping mode
                let shape;
                if (s.glyphMappingMode === 'manual' &&
                    s.glyphManualPositions && s.glyphManualPositions.length === shapes.length) {
                    // Manual: pick shape whose assigned position is closest to this pixel's lum
                    let bestIdx = 0, bestDist = Infinity;
                    for (let pi = 0; pi < shapes.length; pi++) {
                        const dist = Math.abs(s.glyphManualPositions[pi] - lum);
                        if (dist < bestDist) { bestDist = dist; bestIdx = pi; }
                    }
                    shape = shapes[bestIdx];
                } else {
                    // Auto: slice shapes by range then index by luminance
                    const rStart = Math.max(0, (s.glyphRangeStart || 1) - 1);
                    const rEnd   = (s.glyphRangeEnd == null || s.glyphRangeEnd < 1)
                        ? shapes.length
                        : Math.min(shapes.length, s.glyphRangeEnd);
                    const active = rEnd > rStart ? shapes.slice(rStart, rEnd) : shapes;
                    const si = Math.min(Math.round(lum * (active.length - 1)), active.length - 1);
                    shape = active[si];
                }

                // Tint glyph with pixel colour using an offscreen canvas
                tintCtx.clearRect(0, 0, tintRes, tintRes);
                tintCtx.drawImage(shapeCache.get(shape.img), 0, 0);

                if (useColor) {
                    tintCtx.globalCompositeOperation = 'source-in';
                    const color = (s.palette && s.palette.length > 0)
                        ? this.nearestPaletteColor(adj.r, adj.g, adj.b, s.palette)
                        : `rgb(${adj.r},${adj.g},${adj.b})`;
                    tintCtx.fillStyle = color;
                    tintCtx.fillRect(0, 0, tintRes, tintRes);
                    tintCtx.globalCompositeOperation = 'source-over';
                }

                outCtx.drawImage(tintCanvas, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
            }
        }
    }

    // ─── Export ────────────────────────────────────────────────────────────────

    exportAsImage(container, filename = 'ascii-art.png') {
        const exportCanvas = document.createElement('canvas');
        const exportCtx    = exportCanvas.getContext('2d');
        const asciiWrap    = container.querySelector('div');
        if (!asciiWrap) return;

        const rect = asciiWrap.getBoundingClientRect();
        exportCanvas.width  = rect.width  * 2;
        exportCanvas.height = rect.height * 2;

        exportCtx.fillStyle = '#070707';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        exportCtx.font = '20px "Courier New", monospace';
        exportCtx.textBaseline = 'top';

        asciiWrap.querySelectorAll('div').forEach((line, li) => {
            line.querySelectorAll('span').forEach((span, ci) => {
                exportCtx.fillStyle = span.style.color || '#e0dbd3';
                exportCtx.fillText(span.textContent, ci * 12, li * 20);
            });
        });

        exportCanvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    exportDitherAsImage(ditherCanvas, filename = 'dithered.png') {
        ditherCanvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    exportAsText(asciiResult, filename = 'ascii-art.txt') {
        const text = asciiResult.data
            .map(row => row.map(c => c.char).join(''))
            .join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
        a.click();
        URL.revokeObjectURL(url);
    }
}

const asciiGenerator = new ASCIIGenerator();
