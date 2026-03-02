/**
 * UI Controls and Event Handlers
 * Manages user interactions, mode switching, and rendering dispatch.
 */

class UIController {
    constructor(generator) {
        this.generator = generator;
        this.currentAsciiResult = null;
        this.debounceTimer = null;
        this.mode = 'ascii';   // 'ascii' | 'dither' | 'pixel' | 'crt' | 'glyph'
        this.palette = [];
        this._originalPalette = [];   // colours as first extracted — used by reset
        this.glyphShapes = [];         // { img, coverage, name } objects
        this.glyphMappingMode = 'auto';   // 'auto' | 'manual'
        this.glyphManualPositions = [];   // 0-1 positions parallel to sorted shapes
        this._dragTimer = null;

        // Multi-image gallery state
        this.images = [];           // [{ id, img, palette, originalPalette, thumbDataUrl }]
        this.activeImageIndex = -1;
        this._nextImageId = 1;

        // Colour mode: 'image' (per-image palette), 'off' (no colour), 'global' (single colour)
        this.colorMode = 'image';
        this.globalColor = '#e0dbd3';

        // Pan state for click-and-drag artboard repositioning
        this.pan = { active: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 };

        // Remember each mode's size slider position independently
        this._asciiSizeValue  = 3;  // slider default for ASCII  (→ 10px font)
        this._ditherSizeValue = 1;  // slider default for dither (→ 1× pixel block)
        // (pixel mode uses its own dedicated block/threshold sliders, no shared size slider)

        this.elements = {
            imageInput:       document.getElementById('imageInput'),
            uploadArea:       document.getElementById('uploadArea'),
            galleryStrip:     document.getElementById('galleryStrip'),
            galleryThumbs:    document.getElementById('galleryThumbs'),
            galleryAddBtn:    document.getElementById('galleryAddBtn'),
            galleryInput:     document.getElementById('galleryInput'),
            useDefaultBtn:    document.getElementById('useDefaultBtn'),
            exportAllBtn:     document.getElementById('exportAllBtn'),
            colorModeToggle:  document.getElementById('colorModeToggle'),
            paletteHint:      document.getElementById('paletteHint'),
            globalColorRow:   document.getElementById('globalColorRow'),
            globalColorPicker: document.getElementById('globalColorPicker'),
            globalColorHex:   document.getElementById('globalColorHex'),
            controlsSection:  document.getElementById('controlsSection'),

            // Sliders
            densitySlider:    document.getElementById('densitySlider'),
            densityValue:     document.getElementById('densityValue'),
            brightnessSlider: document.getElementById('brightnessSlider'),
            brightnessValue:  document.getElementById('brightnessValue'),
            contrastSlider:   document.getElementById('contrastSlider'),
            contrastValue:    document.getElementById('contrastValue'),
            saturationSlider: document.getElementById('saturationSlider'),
            saturationValue:  document.getElementById('saturationValue'),
            spacingSlider:    document.getElementById('spacingSlider'),
            spacingValue:     document.getElementById('spacingValue'),

            // Dither controls
            ditherMatrixSelect:  document.getElementById('ditherMatrixSelect'),
            ditherSpreadSlider:  document.getElementById('ditherSpreadSlider'),
            ditherSpreadValue:   document.getElementById('ditherSpreadValue'),
            ditherBaseColor:     document.getElementById('ditherBaseColor'),

            // Pixel controls
            pixelBlockSlider:    document.getElementById('pixelBlockSlider'),
            pixelBlockValue:     document.getElementById('pixelBlockValue'),
            pixelThresholdSlider: document.getElementById('pixelThresholdSlider'),
            pixelThresholdValue: document.getElementById('pixelThresholdValue'),

            // CRT controls
            crtCellSlider: document.getElementById('crtCellSlider'),
            crtCellValue:  document.getElementById('crtCellValue'),
            crtGlowSlider: document.getElementById('crtGlowSlider'),
            crtGlowValue:  document.getElementById('crtGlowValue'),

            // Glyph controls
            glyphInput:         document.getElementById('glyphInput'),
            glyphDropZone:      document.getElementById('glyphDropZone'),
            glyphGrid:          document.getElementById('glyphGrid'),
            glyphClearBtn:      document.getElementById('glyphClearBtn'),
            glyphDensitySlider: document.getElementById('glyphDensitySlider'),
            glyphDensityValue:  document.getElementById('glyphDensityValue'),
            glyphSizeSlider:    document.getElementById('glyphSizeSlider'),
            glyphSizeValue:     document.getElementById('glyphSizeValue'),
            glyphColorCheckbox: document.getElementById('glyphColorCheckbox'),

            // Glyph mapping controls
            glyphMappingSection:   document.getElementById('glyphMappingSection'),
            glyphMappingToggle:    document.getElementById('glyphMappingToggle'),
            glyphRangeControls:    document.getElementById('glyphRangeControls'),
            glyphRangeStartSlider: document.getElementById('glyphRangeStartSlider'),
            glyphRangeStartValue:  document.getElementById('glyphRangeStartValue'),
            glyphRangeEndSlider:   document.getElementById('glyphRangeEndSlider'),
            glyphRangeEndValue:    document.getElementById('glyphRangeEndValue'),
            glyphMapStrip:         document.getElementById('glyphMapStrip'),
            glyphMapHint:          document.getElementById('glyphMapHint'),

            // Shared size control (Letter Size in ASCII, Pixel Size in dither; hidden in pixel)
            sizeSlider:       document.getElementById('sizeSlider'),
            sizeValue:        document.getElementById('sizeValue'),
            sizeLabel:        document.getElementById('sizeLabel'),
            sizeControlGroup: document.getElementById('sizeControlGroup'),

            // Character set
            charSetSelect: document.getElementById('charSetSelect'),
            customCharSet: document.getElementById('customCharSet'),

            // Checkbox
            colorCheckbox: document.getElementById('colorCheckbox'),

            // Buttons
            downloadPngBtn: document.getElementById('downloadPngBtn'),
            downloadTxtBtn: document.getElementById('downloadTxtBtn'),

            // Output panels
            asciiOutput:  document.getElementById('asciiOutput'),
            ditherOutput: document.getElementById('ditherOutput'),

            // Loading
            loadingIndicator: document.getElementById('loadingIndicator'),

            // Settings panel
            settingsToggle: document.getElementById('settingsToggle'),
            settingsPanel:  document.getElementById('settingsPanel'),
            settingsInner:  document.querySelector('.settings-inner'),

            // Mode toggle
            modeToggle: document.getElementById('modeToggle'),

            // Stage (for panning)
            stage: document.querySelector('.stage'),
        };

        this.initEventListeners();
        this._loadDefaultGlyphs();
        this.elements.stage.classList.add('mode-ascii');

        // Set default image preview from embedded data
        const preview = document.getElementById('defaultPreviewImg');
        if (preview) preview.src = DEFAULT_IMAGE_DATA;
    }

    // ─── Event wiring ──────────────────────────────────────────────────────────

    initEventListeners() {
        // File upload
        this.elements.imageInput.addEventListener('change', e => this.handleImageUpload(e));

        // Default image button
        this.elements.useDefaultBtn.addEventListener('click', () => this.addDefaultImageToGallery());

        // Gallery add button & input
        this.elements.galleryAddBtn.addEventListener('click', () => {
            if (this.images.length < 10) this.elements.galleryInput.click();
        });
        this.elements.galleryInput.addEventListener('change', e => this.handleGalleryUpload(e));

        // Export All
        this.elements.exportAllBtn.addEventListener('click', () => this.handleExportAll());

        // Colour mode toggle
        this.elements.colorModeToggle.addEventListener('click', e => {
            const btn = e.target.closest('.color-mode-btn');
            if (!btn) return;
            this.setColorMode(btn.dataset.colorMode);
        });

        // Global colour picker
        this.elements.globalColorPicker.addEventListener('input', e => {
            this.globalColor = e.target.value;
            this.elements.globalColorHex.textContent = e.target.value;
            if (this.colorMode === 'global') {
                this._applyColorMode();
                this.buildBarPips([this.globalColor]);
                if (this.generator.currentImage) this.processAndRender();
            }
        });

        // Drag and drop
        this.elements.uploadArea.addEventListener('dragover',  e => this.handleDragOver(e));
        this.elements.uploadArea.addEventListener('dragleave', e => this.handleDragLeave(e));
        this.elements.uploadArea.addEventListener('drop',      e => this.handleDrop(e));

        // Mode toggle
        this.elements.modeToggle.addEventListener('click', e => {
            const btn = e.target.closest('.mode-btn');
            if (btn) this.setMode(btn.dataset.mode);
        });

        // Shared sliders
        this.elements.brightnessSlider.addEventListener('input', e => {
            this.elements.brightnessValue.textContent = e.target.value;
            this.debouncedUpdate({ brightness: parseInt(e.target.value) });
        });
        this.elements.contrastSlider.addEventListener('input', e => {
            this.elements.contrastValue.textContent = parseFloat(e.target.value).toFixed(1);
            this.debouncedUpdate({ contrast: parseFloat(e.target.value) });
        });
        this.elements.saturationSlider.addEventListener('input', e => {
            this.elements.saturationValue.textContent = parseFloat(e.target.value).toFixed(1);
            this.debouncedUpdate({ saturation: parseFloat(e.target.value) });
        });

        // ASCII-only sliders
        this.elements.densitySlider.addEventListener('input', e => {
            this.elements.densityValue.textContent = e.target.value;
            this.debouncedUpdate({ density: parseInt(e.target.value) });
        });
        this.elements.spacingSlider.addEventListener('input', e => {
            this.elements.spacingValue.textContent = e.target.value + '%';
            this.debouncedUpdate({ spacing: parseInt(e.target.value) });
        });
        this.elements.charSetSelect.addEventListener('change', e => this.handleCharSetChange(e));
        this.elements.customCharSet.addEventListener('input', e => {
            this.debouncedUpdate({ charSet: e.target.value });
        });
        this.elements.colorCheckbox.addEventListener('change', e => {
            this.updateSettings({ preserveColor: e.target.checked });
        });

        // Dither-only controls
        this.elements.ditherMatrixSelect.addEventListener('change', e => {
            this.updateSettings({ ditherMatrixSize: parseInt(e.target.value) });
        });
        this.elements.ditherSpreadSlider.addEventListener('input', e => {
            this.elements.ditherSpreadValue.textContent = parseFloat(e.target.value).toFixed(1);
            this.debouncedUpdate({ ditherSpread: parseFloat(e.target.value) });
        });
        this.elements.ditherBaseColor.addEventListener('input', e => {
            if (this.colorMode === 'global' && this.mode === 'dither') {
                this._applyColorMode();
                if (this.generator.currentImage) this.processAndRender();
            }
        });

        // Pixel-only controls
        this.elements.pixelBlockSlider.addEventListener('input', e => {
            const v = parseInt(e.target.value);
            this.elements.pixelBlockValue.textContent = v + 'px';
            this.debouncedUpdate({ pixelBlockSize: v });
        });
        this.elements.pixelThresholdSlider.addEventListener('input', e => {
            const v = parseInt(e.target.value);
            this.elements.pixelThresholdValue.textContent = v + '%';
            this.debouncedUpdate({ pixelThreshold: v / 100 });
        });

        // CRT-only controls
        this.elements.crtCellSlider.addEventListener('input', e => {
            const v = parseInt(e.target.value);
            this.elements.crtCellValue.textContent = v + 'px';
            this.debouncedUpdate({ crtCellSize: v });
        });
        this.elements.crtGlowSlider.addEventListener('input', e => {
            const v = parseInt(e.target.value);
            this.elements.crtGlowValue.textContent = v + '%';
            this.debouncedUpdate({ crtGlow: v / 100 });
        });

        // Glyph controls
        this.elements.glyphDropZone.addEventListener('click', () => this.elements.glyphInput.click());
        this.elements.glyphInput.addEventListener('change', e => this._handleGlyphFiles(e.target.files));
        this.elements.glyphDropZone.addEventListener('dragover', e => {
            e.preventDefault();
            this.elements.glyphDropZone.classList.add('drag-over');
        });
        this.elements.glyphDropZone.addEventListener('dragleave', () => {
            this.elements.glyphDropZone.classList.remove('drag-over');
        });
        this.elements.glyphDropZone.addEventListener('drop', e => {
            e.preventDefault();
            this.elements.glyphDropZone.classList.remove('drag-over');
            this._handleGlyphFiles(e.dataTransfer.files);
        });
        this.elements.glyphClearBtn.addEventListener('click', () => {
            this.glyphShapes = [];
            this.generator.updateSettings({ glyphShapes: [] });
            this._renderGlyphGrid();
            if (this.mode === 'glyph' && this.generator.currentImage) this.processAndRender();
        });
        this.elements.glyphDensitySlider.addEventListener('input', e => {
            const v = parseInt(e.target.value);
            this.elements.glyphDensityValue.textContent = v;
            this.debouncedUpdate({ glyphDensity: v });
        });
        this.elements.glyphSizeSlider.addEventListener('input', e => {
            const v = parseInt(e.target.value);
            this.elements.glyphSizeValue.textContent = (v / 10).toFixed(1) + '×';
            this.debouncedUpdate({ glyphShapeSize: v / 10 });
        });
        this.elements.glyphColorCheckbox.addEventListener('change', e => {
            this.updateSettings({ glyphUseColor: e.target.checked });
        });
        document.getElementById('glyphBgColor').addEventListener('input', e => {
            this.debouncedUpdate({ glyphBackgroundColor: e.target.value });
        });

        // Glyph mapping mode toggle
        this.elements.glyphMappingToggle.addEventListener('click', () => {
            this.glyphMappingMode = this.glyphMappingMode === 'auto' ? 'manual' : 'auto';
            // Reset manual positions so they initialise fresh on strip render
            if (this.glyphMappingMode === 'manual') this.glyphManualPositions = [];
            this.generator.updateSettings({
                glyphMappingMode: this.glyphMappingMode,
                glyphManualPositions: [...this.glyphManualPositions]
            });
            this._updateGlyphMappingStrip();
            if (this.mode === 'glyph' && this.generator.currentImage) this.renderGlyph();
        });

        // Glyph range sliders (auto mode)
        this.elements.glyphRangeStartSlider.addEventListener('input', e => {
            let v = parseInt(e.target.value);
            const end = parseInt(this.elements.glyphRangeEndSlider.value);
            v = Math.min(v, end); // start can't exceed end
            e.target.value = v;
            this.elements.glyphRangeStartValue.textContent = v;
            this._updateGlyphMappingStrip();
            this.debouncedUpdate({ glyphRangeStart: v });
        });

        this.elements.glyphRangeEndSlider.addEventListener('input', e => {
            let v = parseInt(e.target.value);
            const start = parseInt(this.elements.glyphRangeStartSlider.value);
            v = Math.max(v, start); // end can't go below start
            e.target.value = v;
            this.elements.glyphRangeEndValue.textContent = v;
            this._updateGlyphMappingStrip();
            this.debouncedUpdate({ glyphRangeEnd: v });
        });

        // Shared size slider — behaviour depends on current mode
        this.elements.sizeSlider.addEventListener('input', e => {
            this._applySizeSlider(parseInt(e.target.value));
        });

        // Palette reset
        document.getElementById('paletteResetBtn').addEventListener('click', () => {
            if (!this._originalPalette.length) return;
            this.palette = [...this._originalPalette];
            // Sync reset palette back to gallery entry
            if (this.activeImageIndex >= 0 && this.activeImageIndex < this.images.length) {
                this.images[this.activeImageIndex].palette = [...this.palette];
            }
            this.renderPalette(this.palette);
            this.updateSettings({ palette: [...this.palette] });
        });

        // Downloads
        this.elements.downloadPngBtn.addEventListener('click', () => this.handleDownloadPNG());
        this.elements.downloadTxtBtn.addEventListener('click', () => this.handleDownloadTXT());

        // Settings panel toggle + scroll fade
        this.elements.settingsToggle.addEventListener('click', () => this.toggleSettingsPanel());
        this.elements.settingsInner.addEventListener('scroll', () => this.updatePanelOverflow());

        // Close settings when clicking the stage (only if not panning)
        this.elements.stage.addEventListener('click', e => {
            if (this._panDragged) return;   // suppress click after a drag
            if (this.elements.settingsPanel.classList.contains('open') &&
                !e.target.closest('.settings-panel') &&
                !e.target.closest('#settingsToggle')) {
                this.closeSettingsPanel();
            }
        });

        // Pan: click-and-drag to reposition the artboard
        this.elements.stage.addEventListener('mousedown', e => this._onPanStart(e));
        this.elements.stage.addEventListener('mousemove', e => this._onPanMove(e));
        document.addEventListener('mouseup', e => this._onPanEnd(e));

        this.setControlsEnabled(false);
    }

    // ─── Size slider helpers ───────────────────────────────────────────────────

    /** Maps slider value 1-8 to a CSS font-size in px: 6, 8, 10, 12, 14, 16, 18, 20 */
    _sliderToFontSize(v) { return (v + 2) * 2; }

    /** Apply the size slider for the current mode, update the UI label, store the value */
    _applySizeSlider(v) {
        if (this.mode === 'ascii') {
            this._asciiSizeValue = v;
            const px = this._sliderToFontSize(v);
            this.elements.sizeValue.textContent = px + 'px';
            // Apply font size directly to output — no re-render needed
            this.elements.asciiOutput.style.fontSize = px + 'px';
        } else {
            this._ditherSizeValue = v;
            this.elements.sizeValue.textContent = v + '×';
            this.debouncedUpdate({ ditherScale: v });
        }
    }

    // ─── Mode switching ────────────────────────────────────────────────────────

    setMode(mode) {
        if (mode === this.mode) return;
        this._resetPan();
        // Save current size slider position before switching away
        if (this.mode === 'ascii')  this._asciiSizeValue  = parseInt(this.elements.sizeSlider.value);
        if (this.mode === 'dither') this._ditherSizeValue = parseInt(this.elements.sizeSlider.value);
        this.mode = mode;

        // Update toggle button states
        this.elements.modeToggle.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Toggle stage cursor for ASCII mode (no panning)
        this.elements.stage.classList.toggle('mode-ascii', mode === 'ascii');

        // Show / hide outputs (dither canvas is reused for pixel and crt)
        this.elements.asciiOutput.classList.toggle('hidden', mode !== 'ascii');
        this.elements.ditherOutput.classList.toggle('hidden', mode === 'ascii');

        // Show / hide mode-specific settings
        document.querySelectorAll('.ascii-only').forEach(el => {
            el.classList.toggle('hidden', mode !== 'ascii');
        });
        document.querySelectorAll('.dither-only').forEach(el => {
            el.classList.toggle('hidden', mode !== 'dither');
        });
        document.querySelectorAll('.pixel-only').forEach(el => {
            el.classList.toggle('hidden', mode !== 'pixel');
        });
        document.querySelectorAll('.crt-only').forEach(el => {
            el.classList.toggle('hidden', mode !== 'crt');
        });
        document.querySelectorAll('.glyph-only').forEach(el => {
            el.classList.toggle('hidden', mode !== 'glyph');
        });

        // Shared size control: only visible in ascii and dither
        if (this.elements.sizeControlGroup) {
            this.elements.sizeControlGroup.classList.toggle('hidden',
                mode === 'pixel' || mode === 'crt' || mode === 'glyph');
        }

        // TXT only makes sense for ASCII
        this.elements.downloadTxtBtn.disabled = (mode !== 'ascii') || !this.generator.currentImage;

        // Restore size slider to this mode's last value and update label/display
        if (mode !== 'pixel' && mode !== 'crt' && mode !== 'glyph') {
            const restoredVal = mode === 'ascii' ? this._asciiSizeValue : this._ditherSizeValue;
            this.elements.sizeSlider.value = restoredVal;
            this.elements.sizeLabel.textContent = mode === 'ascii' ? 'Letter Size' : 'Pixel Size';
            if (mode === 'ascii') {
                const px = this._sliderToFontSize(restoredVal);
                this.elements.sizeValue.textContent = px + 'px';
                this.elements.asciiOutput.style.fontSize = px + 'px';
            } else {
                this.elements.sizeValue.textContent = restoredVal + '×';
                this.generator.updateSettings({ ditherScale: restoredVal });
            }
        }

        // Re-apply colour mode (palette size may differ by render mode)
        if (this.colorMode !== 'image') this._applyColorMode();

        if (this.generator.currentImage) this.processAndRender();
        requestAnimationFrame(() => this.updatePanelOverflow());
    }

    // ─── Settings panel ────────────────────────────────────────────────────────

    toggleSettingsPanel() {
        this.elements.settingsPanel.classList.contains('open')
            ? this.closeSettingsPanel()
            : this.openSettingsPanel();
    }

    openSettingsPanel() {
        this.elements.settingsPanel.classList.add('open');
        this.elements.settingsPanel.setAttribute('aria-hidden', 'false');
        this.elements.settingsToggle.classList.add('active');
        this.elements.settingsToggle.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => this.updatePanelOverflow());
    }

    closeSettingsPanel() {
        this.elements.settingsPanel.classList.remove('open');
        this.elements.settingsPanel.setAttribute('aria-hidden', 'true');
        this.elements.settingsToggle.classList.remove('active');
        this.elements.settingsToggle.setAttribute('aria-expanded', 'false');
    }

    updatePanelOverflow() {
        const inner = this.elements.settingsInner;
        if (!inner) return;
        const canScroll = inner.scrollHeight > inner.clientHeight;
        const atTop    = inner.scrollTop < 2;
        const atBottom = inner.scrollHeight - inner.scrollTop - inner.clientHeight < 2;
        this.elements.settingsPanel.classList.toggle('has-overflow-top', canScroll && !atTop);
        this.elements.settingsPanel.classList.toggle('has-overflow', canScroll && !atBottom);
    }

    // ─── Panning ─────────────────────────────────────────────────────────────

    _onPanStart(e) {
        // Only pan with left mouse button, and only when an image is loaded
        if (e.button !== 0 || !this.generator.currentImage) return;
        // No panning in ASCII mode
        if (this.mode === 'ascii') return;
        // Don't pan when clicking on interactive elements (buttons, thumbnails, etc.)
        if (e.target.closest('.gallery-strip, .upload-area, button, a, input, select')) return;

        this.pan.active = true;
        this._panDragged = false;
        this.pan.startX = e.clientX;
        this.pan.startY = e.clientY;

        // For ASCII mode, record current scroll position
        if (this.mode === 'ascii') {
            this.pan.scrollLeftStart = this.elements.asciiOutput.scrollLeft;
            this.pan.scrollTopStart  = this.elements.asciiOutput.scrollTop;
        }

        this.elements.stage.classList.add('panning');
    }

    _onPanMove(e) {
        if (!this.pan.active) return;

        const dx = e.clientX - this.pan.startX;
        const dy = e.clientY - this.pan.startY;

        // Mark as a real drag after a small threshold (avoids suppressing plain clicks)
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._panDragged = true;

        if (this.mode === 'ascii') {
            // Drag-to-scroll (inverted: drag right → scroll left)
            this.elements.asciiOutput.scrollLeft = this.pan.scrollLeftStart - dx;
            this.elements.asciiOutput.scrollTop  = this.pan.scrollTopStart  - dy;
        } else {
            // Canvas modes: offset the transform
            const newX = this.pan.offsetX + dx;
            const newY = this.pan.offsetY + dy;
            this.elements.ditherOutput.style.transform =
                `translate(calc(-50% + ${newX}px), calc(-50% + ${newY}px))`;
        }
    }

    _onPanEnd(e) {
        if (!this.pan.active) return;
        this.pan.active = false;
        this.elements.stage.classList.remove('panning');

        if (this.mode !== 'ascii') {
            // Persist the final offset so the next drag starts from here
            this.pan.offsetX += e.clientX - this.pan.startX;
            this.pan.offsetY += e.clientY - this.pan.startY;
        }
    }

    _resetPan() {
        this.pan.offsetX = 0;
        this.pan.offsetY = 0;
        this.elements.ditherOutput.style.transform = 'translate(-50%, -50%)';
        this.elements.asciiOutput.scrollLeft = 0;
        this.elements.asciiOutput.scrollTop  = 0;
    }

    // ─── Image loading ─────────────────────────────────────────────────────────

    async handleImageUpload(e) {
        const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
        for (const file of files) {
            if (this.images.length >= 10) break;
            await this.addImageToGallery(file);
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        this.elements.uploadArea.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.elements.uploadArea.classList.remove('drag-over');
    }

    async handleDrop(e) {
        e.preventDefault();
        this.elements.uploadArea.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        for (const file of files) {
            if (this.images.length >= 10) break;
            await this.addImageToGallery(file);
        }
    }

    async handleGalleryUpload(e) {
        const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
        for (const file of files) {
            if (this.images.length >= 10) break;
            await this.addImageToGallery(file);
        }
        e.target.value = '';
    }

    async addImageToGallery(file) {
        try {
            this.showLoading(true);

            const img = await this.generator.loadImage(file);
            const thumbDataUrl = this._createThumbnail(img);
            const colors = this.generator.extractColors(img);

            const entry = {
                id: this._nextImageId++,
                img,
                palette: [...colors],
                originalPalette: [...colors],
                thumbDataUrl
            };
            this.images.push(entry);
            const newIndex = this.images.length - 1;

            // First image: transition from upload state
            if (this.images.length === 1) {
                this.elements.uploadArea.classList.add('hidden');
                this.elements.galleryStrip.classList.remove('hidden');
                this.elements.stage.classList.add('has-image');
                this.setControlsEnabled(true);
            }

            // Disable add button at 10 images
            this.elements.galleryAddBtn.disabled = this.images.length >= 10;

            // Enable export-all at 2+ images
            this.elements.exportAllBtn.disabled = this.images.length < 2;

            this._renderGalleryThumbs();
            await this._switchToImage(newIndex);

        } catch (err) {
            this.showError(err.message);
        } finally {
            this.showLoading(false);
        }
    }

    async addDefaultImageToGallery() {
        try {
            this.showLoading(true);

            const img = await this.generator.loadImageFromDataURL(DEFAULT_IMAGE_DATA);
            const thumbDataUrl = this._createThumbnail(img);
            const colors = this.generator.extractColors(img);

            const entry = {
                id: this._nextImageId++,
                img,
                palette: [...colors],
                originalPalette: [...colors],
                thumbDataUrl
            };
            this.images.push(entry);
            const newIndex = this.images.length - 1;

            if (this.images.length === 1) {
                this.elements.uploadArea.classList.add('hidden');
                this.elements.galleryStrip.classList.remove('hidden');
                this.elements.stage.classList.add('has-image');
                this.setControlsEnabled(true);
            }

            this.elements.galleryAddBtn.disabled = this.images.length >= 10;
            this.elements.exportAllBtn.disabled = this.images.length < 2;

            this._renderGalleryThumbs();
            await this._switchToImage(newIndex);

        } catch (err) {
            this.showError(err.message);
        } finally {
            this.showLoading(false);
        }
    }

    // ─── Colour mode ────────────────────────────────────────────────────────

    setColorMode(mode) {
        if (mode === this.colorMode) return;
        this.colorMode = mode;

        // Update toggle UI
        this.elements.colorModeToggle.querySelectorAll('.color-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.colorMode === mode);
        });

        // Show/hide palette swatches vs global colour picker
        const swatches = document.getElementById('paletteSwatches');
        const resetBtn = document.getElementById('paletteResetBtn');

        if (mode === 'image') {
            swatches.classList.remove('hidden');
            this.elements.globalColorRow.classList.add('hidden');
            resetBtn.classList.remove('hidden');
            resetBtn.disabled = !this._originalPalette.length;
            this.elements.paletteHint.textContent = 'extracted from image · click to edit';
            // Re-render swatches for current image
            if (this.palette.length) this.buildSettingsSwatches(this.palette);
        } else if (mode === 'off') {
            swatches.classList.add('hidden');
            this.elements.globalColorRow.classList.add('hidden');
            resetBtn.classList.add('hidden');
            this.elements.paletteHint.textContent = 'colour disabled · monochrome output';
        } else if (mode === 'global') {
            swatches.classList.add('hidden');
            this.elements.globalColorRow.classList.remove('hidden');
            resetBtn.classList.add('hidden');
            this.elements.paletteHint.textContent = 'one colour for all images';
        }

        this._applyColorMode();

        // Update bar palette pips
        if (mode === 'image') {
            this.buildBarPips(this.palette);
        } else if (mode === 'global') {
            this.buildBarPips([this.globalColor]);
        } else {
            const barPalette = document.getElementById('barPalette');
            if (barPalette) barPalette.innerHTML = '';
        }

        if (this.generator.currentImage) this.processAndRender();
    }

    /**
     * Push the correct palette/settings to the generator based on colorMode.
     */
    _applyColorMode() {
        const colorCheckbox = this.elements.colorCheckbox;
        const glyphColorCheckbox = this.elements.glyphColorCheckbox;

        if (this.colorMode === 'image') {
            // Restore per-image palette and re-enable checkboxes
            colorCheckbox.disabled = false;
            glyphColorCheckbox.disabled = false;
            this.generator.updateSettings({
                palette: this.palette.length ? [...this.palette] : null,
                preserveColor: colorCheckbox.checked,
                glyphUseColor: glyphColorCheckbox.checked
            });
        } else if (this.colorMode === 'off') {
            // Monochrome / no colour tinting — override and disable checkboxes
            const grayscale = ['#000000', '#404040', '#808080', '#b0b0b0', '#ffffff'];
            colorCheckbox.disabled = true;
            glyphColorCheckbox.disabled = true;
            this.generator.updateSettings({
                palette: grayscale,    // dither/pixel need a palette
                preserveColor: false,  // ASCII → monochrome beige
                glyphUseColor: false   // glyph → black shapes
            });
        } else if (this.colorMode === 'global') {
            colorCheckbox.disabled = true;
            glyphColorCheckbox.disabled = true;

            // Dither needs two colours (base + chosen); everything else uses one flat colour
            const palette = this.mode === 'dither'
                ? [this.elements.ditherBaseColor.value, this.globalColor]
                : [this.globalColor];

            this.generator.updateSettings({
                palette,
                preserveColor: true,
                glyphUseColor: true
            });
        }
    }

    // ─── Gallery management ───────────────────────────────────────────────────

    async _switchToImage(index) {
        // Save current palette edits back to departing image (only in image mode)
        if (this.colorMode === 'image' &&
            this.activeImageIndex >= 0 && this.activeImageIndex < this.images.length) {
            this.images[this.activeImageIndex].palette = [...this.palette];
        }

        this.activeImageIndex = index;
        const entry = this.images[index];

        // Set generator's current image
        this.generator.currentImage = entry.img;

        // Load palette based on colour mode
        if (this.colorMode === 'image') {
            this.palette = [...entry.palette];
            this._originalPalette = [...entry.originalPalette];
            this.generator.updateSettings({ palette: [...this.palette] });
            document.getElementById('paletteResetBtn').disabled = false;
            this.renderPalette(this.palette);
        } else {
            // Off or Global — keep the per-image palette in memory but apply mode settings
            this.palette = [...entry.palette];
            this._originalPalette = [...entry.originalPalette];
            this._applyColorMode();
        }

        // Update active class on thumbnails
        const thumbs = this.elements.galleryThumbs.querySelectorAll('.gallery-thumb');
        thumbs.forEach((t, i) => t.classList.toggle('active', i === index));

        // Reset pan and render
        this._resetPan();
        await this.processAndRender();
    }

    _removeImage(index) {
        this.images.splice(index, 1);

        if (this.images.length === 0) {
            // Last image removed: full reset to upload state
            this.activeImageIndex = -1;
            this.generator.currentImage = null;
            this.elements.uploadArea.classList.remove('hidden');
            this.elements.galleryStrip.classList.add('hidden');
            this.elements.stage.classList.remove('has-image');
            this.elements.galleryThumbs.innerHTML = '';

            // Reset palette UI
            this.palette = [];
            this._originalPalette = [];
            this.generator.updateSettings({ palette: null });
            const barPalette = document.getElementById('barPalette');
            if (barPalette) barPalette.innerHTML = '';
            const swatches = document.getElementById('paletteSwatches');
            if (swatches) swatches.innerHTML = '<div class="palette-empty">upload an image to extract colours</div>';
            document.getElementById('paletteResetBtn').disabled = true;

            // Clear outputs
            this.elements.asciiOutput.innerHTML = '';
            this.elements.ditherOutput.classList.add('hidden');
            const ctx = this.elements.ditherOutput.getContext('2d');
            ctx.clearRect(0, 0, this.elements.ditherOutput.width, this.elements.ditherOutput.height);
            this.currentAsciiResult = null;
            this._resetPan();

            this.setControlsEnabled(false);
            this.elements.exportAllBtn.disabled = true;
            this.elements.galleryAddBtn.disabled = false;
            return;
        }

        // Compute new active index
        let newIndex = index;
        if (newIndex >= this.images.length) newIndex = this.images.length - 1;

        this.elements.galleryAddBtn.disabled = this.images.length >= 10;
        this.elements.exportAllBtn.disabled = this.images.length < 2;

        this._renderGalleryThumbs();
        this._switchToImage(newIndex);
    }

    _renderGalleryThumbs() {
        const container = this.elements.galleryThumbs;
        container.innerHTML = '';

        this.images.forEach((entry, i) => {
            const thumb = document.createElement('div');
            thumb.className = 'gallery-thumb' + (i === this.activeImageIndex ? ' active' : '');

            const img = document.createElement('img');
            img.src = entry.thumbDataUrl;
            img.alt = `Image ${entry.id}`;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'gallery-remove';
            removeBtn.textContent = '×';
            removeBtn.title = 'Remove';
            removeBtn.addEventListener('click', e => {
                e.stopPropagation();
                this._removeImage(i);
            });

            thumb.addEventListener('click', () => {
                if (i !== this.activeImageIndex) this._switchToImage(i);
            });

            thumb.appendChild(img);
            thumb.appendChild(removeBtn);
            container.appendChild(thumb);
        });
    }

    _createThumbnail(img, size = 100) {
        const c = document.createElement('canvas');
        const aspect = img.width / img.height;
        if (aspect >= 1) {
            c.width = size;
            c.height = Math.round(size / aspect);
        } else {
            c.height = size;
            c.width = Math.round(size * aspect);
        }
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.7);
    }

    _canvasToBlob(canvas) {
        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }

    _captureAsciiAsBlob(container) {
        return new Promise(resolve => {
            const exportCanvas = document.createElement('canvas');
            const exportCtx    = exportCanvas.getContext('2d');
            const asciiWrap    = container.querySelector('div');
            if (!asciiWrap) { resolve(null); return; }

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

            exportCanvas.toBlob(blob => resolve(blob), 'image/png');
        });
    }

    _createProgressOverlay(total) {
        const el = document.createElement('div');
        el.className = 'export-progress';

        const label = document.createElement('div');
        label.className = 'export-progress-label';
        label.textContent = `Exporting 0 / ${total}`;

        const bar = document.createElement('div');
        bar.className = 'export-progress-bar';

        const fill = document.createElement('div');
        fill.className = 'export-progress-fill';
        fill.style.width = '0%';

        bar.appendChild(fill);
        el.appendChild(label);
        el.appendChild(bar);
        document.body.appendChild(el);

        return {
            el,
            update(n) {
                label.textContent = `Exporting ${n} / ${total}`;
                fill.style.width = `${(n / total) * 100}%`;
            }
        };
    }

    async handleExportAll() {
        if (this.images.length < 2 || typeof JSZip === 'undefined') {
            this.showError('Need 2+ images and JSZip loaded');
            return;
        }

        const savedIndex = this.activeImageIndex;
        const zip = new JSZip();
        const progress = this._createProgressOverlay(this.images.length);

        try {
            for (let i = 0; i < this.images.length; i++) {
                const entry = this.images[i];

                // Set up generator for this image
                this.generator.currentImage = entry.img;

                // Apply palette based on colour mode
                if (this.colorMode === 'image') {
                    this.generator.updateSettings({ palette: [...entry.palette], preserveColor: true, glyphUseColor: true });
                } else {
                    this._applyColorMode();
                }

                let blob;

                if (this.mode === 'ascii') {
                    // Render ASCII for this image
                    const result = this.generator.processImage(entry.img);
                    this.generator.renderASCII(result, this.elements.asciiOutput);
                    blob = await this._captureAsciiAsBlob(this.elements.asciiOutput);
                } else if (this.mode === 'dither') {
                    this.generator.ditherImage(entry.img, this.elements.ditherOutput);
                    blob = await this._canvasToBlob(this.elements.ditherOutput);
                } else if (this.mode === 'pixel') {
                    this.generator.pixelImage(entry.img, this.elements.ditherOutput);
                    blob = await this._canvasToBlob(this.elements.ditherOutput);
                } else if (this.mode === 'crt') {
                    this.generator.crtImage(entry.img, this.elements.ditherOutput);
                    blob = await this._canvasToBlob(this.elements.ditherOutput);
                } else if (this.mode === 'glyph') {
                    this.generator.glyphImage(entry.img, this.elements.ditherOutput);
                    blob = await this._canvasToBlob(this.elements.ditherOutput);
                }

                if (blob) {
                    zip.file(`image-${i + 1}-${this.mode}.png`, blob);
                }

                progress.update(i + 1);
                // Yield to UI for repaint
                await new Promise(r => setTimeout(r, 0));
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `ascii-generator-${this.mode}-export.zip`
            });
            a.click();
            URL.revokeObjectURL(url);

        } catch (err) {
            this.showError('ZIP export failed: ' + err.message);
        } finally {
            progress.el.remove();
            // Restore the original active image
            await this._switchToImage(savedIndex);
        }
    }

    // ─── Rendering dispatch ────────────────────────────────────────────────────

    async processAndRender() {
        if (this.mode === 'dither') return this.renderDither();
        if (this.mode === 'pixel')  return this.renderPixel();
        if (this.mode === 'crt')    return this.renderCRT();
        if (this.mode === 'glyph')  return this.renderGlyph();
        return this.renderASCII();
    }

    renderASCII() {
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                this.currentAsciiResult = this.generator.processImage(this.generator.currentImage);
                this.generator.renderASCII(this.currentAsciiResult, this.elements.asciiOutput);
                resolve();
            });
        });
    }

    renderDither() {
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                this.generator.ditherImage(
                    this.generator.currentImage,
                    this.elements.ditherOutput
                );
                resolve();
            });
        });
    }

    renderPixel() {
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                this.generator.pixelImage(
                    this.generator.currentImage,
                    this.elements.ditherOutput
                );
                resolve();
            });
        });
    }

    renderCRT() {
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                this.generator.crtImage(
                    this.generator.currentImage,
                    this.elements.ditherOutput
                );
                resolve();
            });
        });
    }

    renderGlyph() {
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                this.generator.glyphImage(
                    this.generator.currentImage,
                    this.elements.ditherOutput
                );
                resolve();
            });
        });
    }

    // ─── Settings update ───────────────────────────────────────────────────────

    debouncedUpdate(settings) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.updateSettings(settings), 300);
    }

    async updateSettings(settings) {
        if (!this.generator.currentImage) return;
        try {
            this.showLoading(true);
            this.generator.updateSettings(settings);
            await this.processAndRender();
        } catch (err) {
            this.showError(err.message);
        } finally {
            this.showLoading(false);
        }
    }

    handleCharSetChange(e) {
        const value = e.target.value;
        if (value === 'custom') {
            this.elements.customCharSet.classList.remove('hidden');
            this.elements.customCharSet.focus();
            if (this.elements.customCharSet.value) {
                this.updateSettings({ charSet: this.elements.customCharSet.value });
            }
        } else {
            this.elements.customCharSet.classList.add('hidden');
            this.updateSettings({ charSet: this.generator.charSets[value] });
        }
    }

    // ─── Palette UI ────────────────────────────────────────────────────────────

    renderPalette(colors) {
        this.buildSettingsSwatches(colors);
        this.buildBarPips(colors);
    }

    buildSettingsSwatches(colors) {
        const container = document.getElementById('paletteSwatches');
        if (!container) return;
        container.innerHTML = '';

        colors.forEach((hex, index) => {
            const label = document.createElement('label');
            label.className = 'swatch';
            label.title = 'Click to edit colour';

            const input = document.createElement('input');
            input.type  = 'color';
            input.value = hex;

            const circle = document.createElement('span');
            circle.className = 'swatch-circle';
            circle.style.background = hex;
            circle.appendChild(input);

            const hexLabel = document.createElement('span');
            hexLabel.className   = 'swatch-hex';
            hexLabel.textContent = hex;

            label.appendChild(circle);
            label.appendChild(hexLabel);
            container.appendChild(label);

            input.addEventListener('input', e => {
                const newHex = e.target.value;
                this.palette[index] = newHex;
                circle.style.background = newHex;
                hexLabel.textContent = newHex;

                const pip = document.querySelector(`.bar-pip[data-index="${index}"]`);
                if (pip) pip.style.background = newHex;

                // Sync palette back to gallery entry
                if (this.activeImageIndex >= 0 && this.activeImageIndex < this.images.length) {
                    this.images[this.activeImageIndex].palette = [...this.palette];
                }

                this.debouncedUpdate({ palette: [...this.palette] });
            });
        });
    }

    buildBarPips(colors) {
        const container = document.getElementById('barPalette');
        if (!container) return;
        container.innerHTML = '';

        colors.forEach((hex, index) => {
            const pip = document.createElement('div');
            pip.className = 'bar-pip';
            pip.dataset.index = index;
            pip.style.background = hex;
            pip.style.animationDelay = `${index * 55}ms`;
            pip.title = hex;
            pip.addEventListener('click', () => this.openSettingsPanel());
            container.appendChild(pip);
        });
    }

    // ─── Downloads ─────────────────────────────────────────────────────────────

    handleDownloadPNG() {
        if (this.mode === 'dither' || this.mode === 'pixel' || this.mode === 'crt' || this.mode === 'glyph') {
            if (!this.elements.ditherOutput.width) {
                this.showError('Generate an image first');
                return;
            }
            this.generator.exportDitherAsImage(this.elements.ditherOutput);
        } else {
            if (!this.currentAsciiResult) {
                this.showError('Generate ASCII art first');
                return;
            }
            try {
                this.generator.exportAsImage(this.elements.asciiOutput);
            } catch (err) {
                this.showError('PNG export failed: ' + err.message);
            }
        }
    }

    handleDownloadTXT() {
        if (!this.currentAsciiResult) {
            this.showError('Generate ASCII art first');
            return;
        }
        try {
            this.generator.exportAsText(this.currentAsciiResult);
        } catch (err) {
            this.showError('TXT export failed: ' + err.message);
        }
    }

    // ─── Loading / error ───────────────────────────────────────────────────────

    showLoading(show) {
        this.elements.loadingIndicator.classList.toggle('hidden', !show);
    }

    showError(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 56px; right: 16px;
            background: #1a0a0a; border: 1px solid #3a1a1a;
            color: #e08080; padding: 10px 16px;
            font-family: 'DM Mono', monospace; font-size: 0.65rem;
            letter-spacing: 0.08em; z-index: 1000;
            animation: toast-in 0.3s ease forwards;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'toast-out 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ─── Glyph shape management ────────────────────────────────────────────────

    async _handleGlyphFiles(files) {
        if (!files || files.length === 0) return;
        const loaded = await Promise.all(
            Array.from(files)
                .filter(f => f.type === 'image/png' || f.name.toLowerCase().endsWith('.png'))
                .map(f => this._loadGlyphShape(f))
        );
        this.glyphShapes.push(...loaded.filter(Boolean));
        this.generator.updateSettings({ glyphShapes: this.glyphShapes });
        this._renderGlyphGrid();
        if (this.mode === 'glyph' && this.generator.currentImage) this.processAndRender();
    }

    _loadGlyphShape(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                    const coverage = this.generator._computeShapeCoverage(img);
                    resolve({ img, coverage, name: file.name });
                };
                img.onerror = () => resolve(null);
                img.src = e.target.result;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    }

    _renderGlyphGrid() {
        const grid = this.elements.glyphGrid;
        const clearBtn = this.elements.glyphClearBtn;
        if (!grid) return;
        grid.innerHTML = '';

        if (this.glyphShapes.length === 0) {
            grid.innerHTML = '<div class="glyph-empty">no shapes loaded · sorted by density automatically</div>';
            clearBtn.disabled = true;
            return;
        }

        clearBtn.disabled = false;
        // Show sorted order (dense → sparse) so user knows mapping
        const sorted = [...this.glyphShapes].sort((a, b) => b.coverage - a.coverage);
        sorted.forEach((shape, i) => {
            const thumb = document.createElement('div');
            thumb.className = 'glyph-thumb';
            thumb.title = `${shape.name} · coverage ${(shape.coverage * 100).toFixed(0)}%`;

            const img = document.createElement('img');
            img.src = shape.img.src;
            img.alt = shape.name;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'glyph-remove';
            removeBtn.textContent = '×';
            removeBtn.title = 'Remove';
            removeBtn.addEventListener('click', e => {
                e.stopPropagation();
                // Remove by src match
                this.glyphShapes = this.glyphShapes.filter(s => s.img.src !== shape.img.src);
                this.generator.updateSettings({ glyphShapes: this.glyphShapes });
                this._renderGlyphGrid();
                if (this.mode === 'glyph' && this.generator.currentImage) this.processAndRender();
            });

            thumb.appendChild(img);
            thumb.appendChild(removeBtn);
            grid.appendChild(thumb);
        });

        this._updateGlyphMappingStrip();
    }

    async _loadDefaultGlyphs() {
        // Inline base64 data URIs — works with file:// protocol, no fetch needed
        const defaults = [
            { name: 'sparkle-1', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAABiUlEQVR4nO3aTWrCQBiH8f8Ece2qUHRhb+ARUkjW9ib1BuINehRdK+gRcgQXfnTpAQpTEtpFGz9aXopv6vPbOWQxPMw4E1QCAAAAAAAAcCuCvMq28cvnRdflXJNrT6DpCGhEQCMCGhHQiIBGBDQioBEBjQhoREAjAhoR0IiA/zJgvhnUxtJ9Xw75DCjVA7bikxxyGjAZHxkcyiF/AfPXZ8V4ZLvGVNluJGeCu+++GJaSOieeOCjER817hZxIfK28cC5eqVM942glXncFpvv+x+EwrLbobwStpTiR2oXmd0VzA2bffj1rGuOvfX62cEMR0IiAjT5E8uqVbVBdnI/e/c4JK0kzvYWpVvfrv5rixVnIi2wzksL4wjWmdKhO30XvRQ74CVjiIm1UvWGUd7tT4sTTW4i/Ffgp2y1rF+vy4jzvPsgZr6fwrD50bmVej8+ArTCtD7ZdbV3fW7jEHyxvg88t3CAENCKgEQGNCGhEQCMCGhHQiIBGBDQioBEBjQgIAAAAAAAAAPqZdwpCULwVJEX2AAAAAElFTkSuQmCC' },
            { name: 'sparkle-2', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAC4UlEQVR4Ae2bUWoaURSG/ztGKPQlT4WSFHQFTXcwAYW+ma4gzQqSHbTuoF1BkxU0vhUUtCtodqDQ1PTRl4DQOLf3GPJQRzvWo95D839P5s4E5GPuvef+ZwQIIYQQQshjxMEqtR/+j787eya/awKiggKVUKASClRCgUooUAkFKqFAJRSohAKVUKASClRiU2Da382NHc0ZM4BNgeVyJTc2ekKBS5NlldxYeZLCIEbXwCSdM3gAg9gUmCSN/KBrwCD2BNavD+B9JTfuUUHtewpjGHwC3eniS8kxjGGrz/D6poK7rP/Xe3aSKr48H8AItp7ASfau8J47/wmGsCOw/vM0rHNvi2/0KWrDMxjBxhS+n7rfwqdli+URnD9Ee/8KkYn/BIq8ie9ieXm4v9d9nv5vZOIKlJJF5M0rW4qQsmaSdWNLjCdwuua51eQ9IBJl6kdcE7e/Bk7XO9lJw2awThzOUUqa2y5xtiewdpPCZcfL7bQKRCTKH9F+tpUNZjMCJbuT+EkSFIeX8MmRaqqugsMg7NSXYZXcCr8zwNPbAS6rI6yZYoGzb0k9NgreCmOkr4QClVCgks1tIrehryHRfOJSoNTY/ibiBiGdaIUPV/hV6mF3PIqziawLOXUAZ6F43mymJ2WMzy7QedHDFohTSE8m79cv0vWw407+30J6ltp1OH45yf+07cowLX0Tnf0PiEDcOOshiVl1fZRiGf5NzFgrfh64qkSRV0oOY8f7NgLVaSfO/UsmOAq9kVcWeiM26sDpFAzr2NL4ppXGkq2uXG3YLYy5pExp753ACLZOIlKGFCGZnyFsCZRp6fzFwuvy9BnqCQv2zsLeny++GIJSY9j8tWZ92M+VNVK2tPeqMIbV9wNb+UHfgkGMvt6G/MnCJT0YxKbAUoifZpG+hkFsChyP87mdNIUMwp/8K2Gkr4QClVCgEgpUQoFKKFAJBSqhQCUUqIQClVCgEgokhBBCCCFkBX4D70HUL9Dv+jYAAAAASUVORK5CYII=' },
            { name: 'sparkle-3', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAD/0lEQVR4Ae2cT07bQBTGv7GpuugmXdJQKZyg9AQkapC6A24AJwBOQHOCwglKT9Cwq0QkzAngBgTxr7tmUXUBtqfz7LYC7AQ74/G8lvlJgLANgY958/ze9zDgcDgcTxcBrnQv5b3PB02WP6sHhxZOQE2cgJo4ATVxAmrCU8D3163MsXbOMQbwFDBEK3Psmd8AQ3gKKG9zxLpZAEN4Cij8PLGcgMURi5lDUrTAEKYCyrzVtgiG8BOwe91W7/MSRgPd8zaYwU9AGa2MP+m1wQx+Anre8oSzG2AGLwEpfKVsTbiCXRgzW4Fy+/Fr/ALX1AefJiWVb2F8WuziuIPB6wAM4LMCQ/mx+MV8ViEPAZcu1lT4rhT/AtnmshfaD2EK3UgePpI8sggM8eLmLfrzI1jE/gqM4u3S4hFSdWx+PrceynYFXPq2oYRYw7TEchPdq01YxF4IL10sqAbBMfQZQcgODuZOYAE7KzDpOHtfUA0N9Yc4zO1i10D9Ak6bNCbTUHupFRHrFZDCNoyPKxYvhZIKiUivUSP1CZgkDBVq+a2qaiARaV+tMbGYTyIrpw38oNsNWW+2FNiD7/XwdXYIg5gVkLorQn4yErJFoJttyJ7K0HswhBkBk64ydVZUycUC0ceM2DKxGqsVkJ1wDxGBeuthMBugIvQFTD0MZfjEtMexNL8zUGgL2Ufs7+uKWVxAGq1IpgOUwS3wBrHX+r3S/g3RxqOaEUJVMfIInvoYixFCJXBQLNyzAj6cDHXc58GkrJvO0sQJqIkTUJNySWQmVKWSbKTDPzS/koxg/A9JJICIztJkghPc+qPpk0hZyJsQUH6Gv2yt4iiPEi3eVR8DXXev4htpMnp85jfSUa9KS9RMKZd6vGRTlnDaTFK9cH+/M0yS2JXettVmgozXTZrwZrMwdUF80VFl02fUjVB7HNmehicY6jOVuheqVhYlpg+mZpS0sAZzO6iBel25pN2uzCRzIV27Q1e/rWnGVEr3O9/rmO5AZ1/WBmmWJk+4mptwS+IRdko5+kUp1JL9qgrkqg3xCHu1cLJPqc1eG7llayqBsD+d9e58B8KbbvaZnLeD5joswmA6K/wAIYYoS7rvVbCC9bAvYDA/goymWEWyZ2vfuwufGenu1WHxJoSyKQevVsEARg3VqHg4ksfLBD4CJjUrdU0eQ13DIHT/wKylX2QVRtYTx134Pcyme/kd4yoUyrwHzXkwgqOptDv+lNwHMxgKGAdjT0nZBzNYPo9qTBiPMGi+BDO4+sJB9pCwVu9OgulTO+RZzsEjMISngB6yq81zK7AMWbHiyOr/xI2Dp4C+nxUrnBmCITyzMOGeYPk0cAJq4gTUxAmoiRPQ4XA4HFPzC4KBR0mSMob2AAAAAElFTkSuQmCC' },
            { name: 'sparkle-4', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAE4klEQVR4Ae2cTVIbRxTH/z0aIBW8GC8TO67hBDEnkChEVXYmJzA+ga0TBE4AnCD4BOBdyibFcALnBsgJtrOLqmK5ynhm2v16kMsgaZiPnu4nW78Fi25NCf3rdb+Pfj0CHOmcBfAX/7syFnsriH7ogxkeOLKwEGJG4CmgbAVjY34cgiE8BRRJOD4mQjCEqQWKcMLofTCEp4AQ7bGhyaI6h6mAcpK1tcEQfgL+8jZUf4MJMwE6eo4V/ARMks7UOV9ughn8BJTiQc5kB8zguAd2cuba2DwLwAheAm6cb2Hy/jciwPulDhjBS8Dc5XtJisdghAAXyPvG6Vmhz966uI2jlQEYwMcCk/S3wp99t/gETOBhgWR9iTyBlGHBJwbKClc4WCEPC4zxsIR4RMDFCt1bYJm97yoD+N4q/nBbZHVvgWX2vqsENZ41hlsLXH+zCSEPUYt0Dcc/RXCEOwEpoxguvSy5940j0Mfyxaorh+JuCQ8Xd2uLR0iEKjtxtpTdCLjx72P1w7dgilQ+QfeNE69sfwlvnN9XKdtLmGeg9tM1vLj7Fyxi1wJ1sdSr6TSmoooQ4vCyIGsNexZYPtuoBjmVlrdmKz60I6At8UZYFLF5AW2LN8KSiM3ugeQwXIhHUHiTpCf6f2iQ5gTUoYpwI94IEpE8foMhjvklTBnGOwpsJZuanUbgQGUsPdMZi1kBu287Khb73anV5UH7ohA9PP/xCIYwI6B2FKoyYjK7aBKyxpa3Y8LB1BNQL9fv1CFPSsuV1XFjMbxt+HhaR8hqAs68cF9AyxqIqlpkcQFJtP/VmaygY0V+HQJmEEcQ6TOVTx8UfiJ3lpp5sn6U9qVos21txVGeWkRazFYryrNM8bnjyVcxE3WGCvyM1Au/McFuggRVVR55qqKMPmRLefPWAMvDvkD3tcScyjBtsJwd5gLWZC5gTXzdqDNcUEm3DPRVAt3MTU3euk957kQyLr1y8ko7E6kcSez3aSI/jNEpWtKB9B58k2EMcIpYxYZRXhhTBmqAzMRk16tsBiWaF+/j+yQqWrWplspllrmtttA228pLcZRQ6T5uxXtVSl31igm6MSjeUkI671GpQC3hRhgsZymLlOIhZgE25azrrP+9Cc/fZV1Qlekjk81IZuPAP+8d4eOHVZUvPgU3hFqu1IRkuJOruWPN7rmqFYpduEftb3IHx3f30ADNngvrI0Xv0NmS1sVS+WuT/TLzg/XaX2ODeWuHAebNRQZoWkTL4mVfaZuswfIETRQmhFz9uhssCf0DVVhhHNmzLR7hrkt//Z89CM/MzUtKzV7ceQQHuKtIJ/G2KuD2UZfsmkMPjnAnYKQqIDKpbzUi6bm8dOj2TITy0jp5My3d5/eMdVpVwf2hUqu1DZ2vVnnWa8AZlcO9gFnMto/SpDs2471pMLkvfEGVkuJWSI7D9w/AAB4CRtoJlLHCiIP1EXwO1jMrLAaDvW8EHwG1Feqz2Jt4xsX6CGbvjYlvXsZCOg1brsNLwEQdaOc7k0GZ7lEb8BIwcyZRzidOwQyG3VliukjMli/BT0BfTBeJ+pWZwePNRdfpvqaXcF8vuA5wfOc2mMG1wTIaHxLWi6VFYPoaZPlqwiA7B0LwFNDDuLXR9QKGcH0VfH98bC5gcXx9f+0qYslZ1TmP2enSXx72wZBPpjHRIPbAL2QAAAAASUVORK5CYII=' },
            { name: 'sparkle-5', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAD1klEQVR4Ae2dX04TQRzHv7Pljwk+9MkEkKScwHICSliMb+AN4ATICZATCCdAT2B9M9KEegLKCWhEim/2QRJQuuP82hCpiNDOzHe3ZT4vhLBtdz/Mb367M/ObKrCJTzR8U5lWIBGBSekoDwYrpM8BW+DoaAEMmo+GVKDOcS5sTBdBgisQpAtLUAAJtsB5MND6GUhwBSrFaYEKKyDBE7j0tWhaRgEc8oiPSyDAE5hgFVSiEgjwBEbRMrisgwBH4OKXFWL4XkEJY45ANUJpDTfJbcIz/gXGpyVzX1FCKpjP9dwK/QtUehdpoqI38IhfgfHpZgp9XzcaRcSNV/CEv2GfF6cFXCZHyAZNjERz+DhZh2P8tEAZTmrpfWQHcz7Jvo9hLj8Cf4zvph66f6PNAIOcl2PcC4wbptPWtGfR3jDn9bzhNKm47QM78rx12M6I1DY+TW3AAW4ESt/SDo+strx/ocp4fLGG8mwTFtgLlGwrCSNrfd59UKgjFy3YZGe7PnDp27q5VTkYSHmCJBa51ZL71T7prwV2Hs8203tE84C0Rh2toTJZ7e1lvTCM4m6gqiYud0ySKd/r6DuPaEuDmctIJLvSpgtTR1qk0mXosXfYe1K7/bArJJPKfKpMCcqslkzMdOYWHo6022iHtxKJn80vNahcExNndcngirLUYoghT2sOH0GgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJUGgJd0rE85GZUVCHshJVeW8+WtxYFdeuaUJjTKUOoS+rKM1WkP+vNlZmXAXUmUJvWqkLj8wmU0g2TE/q6jMVG87qLfVWVLz1i7bGvLVWWht/U9a19HoBymfUrnsrcS3QaEGnWzcV9yfl9kQH782ech7QZ9nTKhq0+KebqMPwhrpVNdIC/Lhvy7m2qveBwpzvhM/rcu/3NaJLB5vQ0Up1Qb3gDLZdW/GST2L+2LDrEt0KK/9dvBB3HifzaIbE7aVqZdwiJ9HucuLNXPXXkeWkIQhlUnO39YXnXrhA2RlkfpINDs49cJC+2TN/VUmSLZ8yBP8b1QYn0grpO2mdgMJ3b3pWXiCMJyVOCkr7RudOO/3rsPZKjNu7KczAGEGBipTC/AIaUC1lU5fKDVvnqFt1mr6wu9gZmTPfd8VzCF9762hG/0BBIgCkyqojL0FAV4IC6wwJoWvQN4ClBNWZgLoECTI2yBHNVCQeQ0OZIFmSpBCi/SP4u9kzrkwNW61F0wvcAWen3MuTMrxSXCzsBC+zSFwnd8QWCe9ELSj+QAAAABJRU5ErkJggg==' },
            { name: 'square',    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAACKElEQVR4Ae3dPU5CQRSG4TNXYiwssDExaiI70B1ogomd7kBZgbgCdQW6A3UH0JlAAjuQHWCBaElJDDDen8KEcLln8oVCz/cUNncseB2ZoTk4CVX98PLfbX5vSaMy0iyNJMTp4FAsGG2UtUvDAorYCFjyF9qlYQF9dCk2nGsXOu1COfs8kMmsL1aUooq87rwXLdPvwOnsViyZ+CfNMl3A069r8XIlpvhjqQ7rRauK/4WTk9e7NzFrdiLt/W7e0+U7MN15luMlos6ynbh4B6YHRvIeEG9jyjh5lrXofv5gyQJe9Mvp5TG7/5wz3DKuK272IrLek9Z2z5n4aLZCoZ9EaA4DghgQxIAgBgQxIIgBQQwIYkAQA4IYEMSAIAYEMSCIAUEMCGJAEAOCGBDEgCAGBDEgiAFBDAhiQBADghgQxIAgBgQxIIgBQQwIYkAQA4IYEMSAIAYEMSCIAUEMCGJAEAOCGBDEgCAGBDEgiAFBDAhiQBADghgQxIAgBgQxIIgBQQwI+h39lI33PMyGLHJyUT7XjX80ZeIaUh6P8mdnTad34p2ViZUKcbiSqy2enZWnOqjHSx7EPH8j7b3HRU84P7CI80fS2uvlPS4+RNJfjv8CJsWve0m8hH4IbXXYMXW4JPMCW7u1omX6a0zyBmpJMmxRQR8wPX3SI9yA+HUqRiAnQi/STbEgnVCpExawFF8eTVjvaVeGBRyPVd9w8Oe1tlcUsFuxETDAD7GPc2oPq5uTAAAAAElFTkSuQmCC' },
        ];

        const shapes = await Promise.all(defaults.map(({ name, src }) =>
            new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    const coverage = this.generator._computeShapeCoverage(img);
                    resolve({ img, coverage, name });
                };
                img.onerror = () => resolve(null);
                img.src = src;
            })
        ));

        const valid = shapes.filter(Boolean);
        if (valid.length === 0) return;

        this.glyphShapes.push(...valid);
        this.generator.updateSettings({ glyphShapes: this.glyphShapes });
        this._renderGlyphGrid();
        // If the user is already on glyph mode with an image, render now
        if (this.mode === 'glyph' && this.generator.currentImage) this.renderGlyph();
    }

    _updateGlyphMappingStrip() {
        const el = this.elements;
        if (!el.glyphMappingSection) return;

        const n = this.glyphShapes.length;
        if (n === 0) {
            el.glyphMappingSection.classList.add('hidden');
            return;
        }
        el.glyphMappingSection.classList.remove('hidden');

        const sorted = [...this.glyphShapes].sort((a, b) => b.coverage - a.coverage);

        // Keep range slider bounds in sync with shape count
        el.glyphRangeStartSlider.max = n;
        el.glyphRangeEndSlider.max = n;
        if (parseInt(el.glyphRangeStartSlider.value) > n) el.glyphRangeStartSlider.value = 1;
        if (parseInt(el.glyphRangeEndSlider.value) < 1 || parseInt(el.glyphRangeEndSlider.value) > n) {
            el.glyphRangeEndSlider.value = n;
        }
        el.glyphRangeStartValue.textContent = el.glyphRangeStartSlider.value;
        el.glyphRangeEndValue.textContent   = el.glyphRangeEndSlider.value;

        // Show range controls only in auto mode; toggle button text reflects next action
        el.glyphRangeControls.classList.toggle('hidden', this.glyphMappingMode === 'manual');
        el.glyphMappingToggle.textContent = this.glyphMappingMode === 'auto' ? 'manual' : 'auto';

        // Rebuild strip
        el.glyphMapStrip.innerHTML = '';

        if (this.glyphMappingMode === 'auto') {
            const rangeStart = parseInt(el.glyphRangeStartSlider.value) - 1; // 0-based
            const rangeEnd   = parseInt(el.glyphRangeEndSlider.value) - 1;

            sorted.forEach((shape, i) => {
                const pos   = n === 1 ? 0.5 : i / (n - 1);
                const thumb = document.createElement('div');
                thumb.className = 'glyph-map-thumb' + (i < rangeStart || i > rangeEnd ? ' inactive' : '');
                thumb.style.left = `${pos * 100}%`;
                const img = document.createElement('img');
                img.src = shape.img.src;
                img.alt = '';
                thumb.appendChild(img);
                el.glyphMapStrip.appendChild(thumb);
            });

            const count = parseInt(el.glyphRangeEndSlider.value) - parseInt(el.glyphRangeStartSlider.value) + 1;
            el.glyphMapHint.textContent =
                `${count} shape${count !== 1 ? 's' : ''} active · ${parseInt(el.glyphRangeStartSlider.value)}–${parseInt(el.glyphRangeEndSlider.value)} of ${n}`;

        } else {
            // Manual: initialise positions uniformly if not already set for this shape count
            if (this.glyphManualPositions.length !== n) {
                this.glyphManualPositions = sorted.map((_, i) => n === 1 ? 0.5 : i / (n - 1));
                this.generator.updateSettings({ glyphManualPositions: [...this.glyphManualPositions] });
            }

            sorted.forEach((shape, i) => {
                const thumb = document.createElement('div');
                thumb.className = 'glyph-map-thumb draggable';
                thumb.style.left = `${this.glyphManualPositions[i] * 100}%`;
                const img = document.createElement('img');
                img.src = shape.img.src;
                img.alt = '';
                thumb.appendChild(img);
                this._setupThumbDrag(thumb, i);
                el.glyphMapStrip.appendChild(thumb);
            });

            el.glyphMapHint.textContent = 'drag thumbnails to override brightness mapping';
        }
    }

    _setupThumbDrag(thumb, index) {
        thumb.addEventListener('mousedown', e => {
            e.preventDefault();
            const strip = this.elements.glyphMapStrip;
            thumb.classList.add('is-dragging');

            const onMove = e => {
                const rect = strip.getBoundingClientRect();
                const pos  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                this.glyphManualPositions[index] = pos;
                thumb.style.left = `${pos * 100}%`;

                clearTimeout(this._dragTimer);
                this._dragTimer = setTimeout(() => {
                    this.generator.updateSettings({ glyphManualPositions: [...this.glyphManualPositions] });
                    if (this.mode === 'glyph' && this.generator.currentImage) this.renderGlyph();
                }, 150);
            };

            const onUp = () => {
                thumb.classList.remove('is-dragging');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    setControlsEnabled(enabled) {
        const shared = [
            this.elements.densitySlider,
            this.elements.brightnessSlider,
            this.elements.contrastSlider,
            this.elements.saturationSlider,
            this.elements.spacingSlider,
            this.elements.charSetSelect,
            this.elements.colorCheckbox,
            this.elements.downloadPngBtn,
            this.elements.ditherMatrixSelect,
            this.elements.ditherSpreadSlider,
            this.elements.ditherBaseColor,
            this.elements.pixelBlockSlider,
            this.elements.pixelThresholdSlider,
            this.elements.crtCellSlider,
            this.elements.crtGlowSlider,
            this.elements.glyphDensitySlider,
            this.elements.glyphSizeSlider,
            this.elements.glyphRangeStartSlider,
            this.elements.glyphRangeEndSlider,
            this.elements.sizeSlider,
        ];
        shared.forEach(el => { el.disabled = !enabled; });

        // TXT is only available in ASCII mode
        this.elements.downloadTxtBtn.disabled = !enabled || this.mode !== 'ascii';

        // Export All needs 2+ images
        this.elements.exportAllBtn.disabled = !enabled || this.images.length < 2;

        // Re-apply colour mode to enforce checkbox disabled state
        if (enabled && this.colorMode !== 'image') {
            this.elements.colorCheckbox.disabled = true;
            this.elements.glyphColorCheckbox.disabled = true;
        }

        if (this.elements.controlsSection) {
            this.elements.controlsSection.style.opacity = enabled ? '1' : '0.55';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new UIController(asciiGenerator);
});
