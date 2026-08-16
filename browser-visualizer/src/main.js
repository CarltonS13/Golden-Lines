import {
    AudioBufferSource,
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    QUALITY_HIGH,
    getFirstEncodableAudioCodec,
    getFirstEncodableVideoCodec,
} from 'mediabunny';

const SPACING = 16;
const BORDER = SPACING * 2;
const FFT_SIZE = 1024;
const MOVIE_FPS = 30;
const FRAME_DURATION = 1 / MOVIE_FPS;

const DEFAULT_SETTINGS = {
    backgroundColor: '#ffffff',
    textColor: '#000000',
    strokeWidth: 3,
    width: 800,
    height: 800,
    preset: 'square',
    fps: 30,
    gridLayoutType: 'linear',
    gridRows: 45,
    gridCols: 1,
    gridAlternating: false,
    gridVolumeSpeed: 0,
    gridUniformRadialSpeed: true,
    gridSpin: true,
    bands: [
        { label: 'Low', color: '#f29e4c', minHz: 20, maxHz: 250, weight: 0.3 },
        { label: 'Mid', color: '#efea5a', minHz: 250, maxHz: 4000, weight: 1.5 },
        { label: 'High', color: '#16db93', minHz: 4000, maxHz: 6000, weight: 3.4 },
    ],
};

const LOCAL_STORAGE_KEY = 'golden_lines_settings';

function loadSettings() {
    try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                ...cloneSettings(DEFAULT_SETTINGS),
                ...parsed,
                bands: (parsed.bands && parsed.bands.length > 0) ? parsed.bands.map(b => ({ ...b })) : cloneSettings(DEFAULT_SETTINGS).bands
            };
        }
    } catch (e) {
        console.error('Error loading settings from local storage:', e);
    }
    return cloneSettings(DEFAULT_SETTINGS);
}

function saveSettings(settings) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Error saving settings to local storage:', e);
    }
}

let currentSettings = loadSettings();

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="shell">
    <section class="panel controls">
      <p class="kicker">Golden Lines</p>
      <h1>Browser visualizer with preview and export</h1>
      <p>
        Load an audio file, inspect the motion in a live canvas preview, then export
        an MP4 directly in the browser with Mediabunny.
      </p>

      <div class="field" title="Select the audio file (.mp3, .wav, etc.) to analyze and visualize">
        <label for="fileInput">Audio file</label>
        <input id="fileInput" type="file" accept="audio/*" />
      </div>

      <div class="settings-grid">
        <section class="settings-block">
          <h2 class="settings-block-header">Canvas <span class="section-toggle-arrow">▼</span></h2>
          <div class="settings-block-content" style="display: block;">
            <div class="field compact" title="Choose the background fill color of the visualizer canvas">
              <label for="backgroundColor">Background color</label>
              <input id="backgroundColor" type="color" value="#ffffff" />
            </div>
            <div class="field compact" title="Choose the color of the text overlay labels (song title, timing metadata)">
              <label for="textColor">Text color</label>
              <input id="textColor" type="color" value="#000000" />
            </div>
            <div class="field compact" title="Choose a pre-defined width and height ratio for the output visualizer">
              <label for="canvasPreset">Dimensions preset</label>
              <select id="canvasPreset">
                <option value="square">Square (800 × 800)</option>
                <option value="hd">Landscape HD (1280 × 720)</option>
                <option value="fullhd">Full HD (1920 × 1080)</option>
                <option value="portrait">Portrait / Stories (1080 × 1920)</option>
                <option value="custom">Custom...</option>
              </select>
            </div>
            <div class="field-row" id="customDimensionsRow" style="display: none;">
              <div class="field compact" title="Custom width of the canvas in pixels">
                <label for="canvasWidth">Width (px)</label>
                <input id="canvasWidth" type="number" min="200" max="3840" step="10" value="${currentSettings.width}" />
              </div>
              <div class="field compact" title="Custom height of the canvas in pixels">
                <label for="canvasHeight">Height (px)</label>
                <input id="canvasHeight" type="number" min="200" max="3840" step="10" value="${currentSettings.height}" />
              </div>
            </div>
            <div class="field compact" title="Target frame rate for preview animation playback and MP4 video generation">
              <label for="canvasFps">Export & Preview FPS</label>
              <select id="canvasFps">
                <option value="30" ${currentSettings.fps === 30 ? 'selected' : ''}>30 FPS</option>
                <option value="60" ${currentSettings.fps === 60 ? 'selected' : ''}>60 FPS</option>
              </select>
            </div>
            <div class="field compact" title="Choose the thickness of the drawn line brush path in pixels">
              <label for="strokeWidth">Stroke thickness</label>
              <input id="strokeWidth" type="range" min="1" max="10" step="1" value="3" />
              <output id="strokeWidthValue">3 px</output>
            </div>
          </div>
        </section>

        <section class="settings-block">
          <h2 class="settings-block-header">Grid Layout <span class="section-toggle-arrow">▼</span></h2>
          <div class="settings-block-content" style="display: block;">
            <div class="field compact" title="Choose the shape style of the drawing path (Linear sweeping lines or Radial circular tracks)">
              <label for="gridLayoutType">Layout Type</label>
              <select id="gridLayoutType">
                <option value="linear" ${currentSettings.gridLayoutType === 'linear' ? 'selected' : ''}>Linear Grid</option>
                <option value="radial" ${currentSettings.gridLayoutType === 'radial' ? 'selected' : ''}>Radial Grid</option>
              </select>
            </div>
            <div class="field-row">
              <div class="field compact" title="Number of rows (Linear sweep rows or Concentric circular rings)">
                <label for="gridRows">Rows</label>
                <input id="gridRows" type="number" min="5" max="100" step="1" value="${currentSettings.gridRows}" />
              </div>
              <div class="field compact" title="Number of columns (Linear grid divisions or Radial angular sectors)">
                <label for="gridCols">Columns</label>
                <input id="gridCols" type="number" min="1" max="100" step="1" value="${currentSettings.gridCols}" />
              </div>
            </div>
            <div class="field compact checkbox-row" title="Reverse the sweep direction of odd rows or circular tracks (draws forward, then backward)">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: normal; text-transform: none; color: var(--text); margin-top: 6px;">
                <input id="gridAlternating" type="checkbox" ${currentSettings.gridAlternating ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px; border-radius: 4px; accent-color: var(--accent);" />
                Alternating directions
              </label>
            </div>
            <div class="field compact" title="Dynamic speed multiplier: lets the drawing pen move faster during loud beats and drag during quiet moments">
              <label for="gridVolumeSpeed">Volume Speed Influence</label>
              <div style="display: flex; align-items: center; gap: 10px;">
                <input id="gridVolumeSpeed" type="range" min="0" max="5" step="0.1" value="${currentSettings.gridVolumeSpeed}" style="flex: 1;" />
                <output id="gridVolumeSpeedValue" style="min-width: 35px; text-align: right; font-size: 12px; color: var(--muted);">${currentSettings.gridVolumeSpeed.toFixed(1)}x</output>
              </div>
            </div>
            <div class="field compact checkbox-row" id="uniformRadialRow" style="display: ${currentSettings.gridLayoutType === 'radial' ? 'block' : 'none'}; margin-bottom: 12px;" title="Scale timeline chunks proportionally to ring radius, keeping linear stylus drawing speed constant across all orbits">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: normal; text-transform: none; color: var(--text);">
                <input id="gridUniformRadialSpeed" type="checkbox" ${currentSettings.gridUniformRadialSpeed ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px; border-radius: 4px; accent-color: var(--accent);" />
                Uniform radial speed
              </label>
            </div>
            <div class="field compact checkbox-row" id="spinPreviewRow" style="display: ${currentSettings.gridLayoutType === 'radial' ? 'block' : 'none'}; margin-bottom: 12px;" title="Rotate the visualizer canvas counter-clockwise during play, keeping the drawing tip locked at 12 o'clock like a turntable stylus">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: normal; text-transform: none; color: var(--text);">
                <input id="gridSpin" type="checkbox" ${currentSettings.gridSpin ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px; border-radius: 4px; accent-color: var(--accent);" />
                Spin Preview (Vinyl effect)
              </label>
            </div>
          </div>
        </section>

        <section class="settings-block">
          <h2 class="settings-block-header">Color bands <span class="section-toggle-arrow">▼</span></h2>
          <div class="settings-block-content" style="display: block;">
            <div class="band-settings">
              <div id="bandList"></div>
              <button id="addBandButton" class="secondary band-add-button" type="button" title="Add a new custom frequency range and color mapping card">Add band</button>
            </div>
          </div>
        </section>
      </div>

      <button id="resetSettingsButton" class="secondary" style="width: 100%; margin-top: 2px; margin-bottom: 18px;" type="button" title="Reset all visual layout parameters and color bands back to their default config">Reset to default settings</button>

      <div class="buttons-grid">
        <button id="previewButton" class="secondary" disabled>Play preview</button>
        <button id="pauseButton" class="secondary" style="display: none;" disabled>Pause</button>
        <button id="exportButton" class="primary" disabled>Export MP4</button>
        <button id="exportSvgButton" class="secondary" disabled>Export SVG</button>
      </div>

      <div class="status" id="status">
        <strong>Ready.</strong> Choose an audio file to begin.
      </div>

      <div class="progress" aria-hidden="true">
        <div id="progressBar"></div>
      </div>
    </section>

    <section class="panel stage">
      <div class="canvas-frame">
        <div class="canvas-shell">
          <canvas id="previewCanvas" width="${currentSettings.width}" height="${currentSettings.height}"></canvas>
        </div>
      </div>
      <div class="meta" id="meta">
        <span class="pill">Preview canvas</span>
        <span class="pill" id="dimensionsPill">${currentSettings.width} × ${currentSettings.height}</span>
        <span class="pill" id="fpsPill">${currentSettings.fps} fps export</span>
      </div>
    </section>
  </div>
`;

const fileInput = document.querySelector('#fileInput');
const backgroundColorInput = document.querySelector('#backgroundColor');
const textColorInput = document.querySelector('#textColor');
const canvasPreset = document.querySelector('#canvasPreset');
const customDimensionsRow = document.querySelector('#customDimensionsRow');
const canvasWidthInput = document.querySelector('#canvasWidth');
const canvasHeightInput = document.querySelector('#canvasHeight');
const canvasFps = document.querySelector('#canvasFps');
const gridLayoutType = document.querySelector('#gridLayoutType');
const gridRowsInput = document.querySelector('#gridRows');
const gridColsInput = document.querySelector('#gridCols');
const gridAlternatingInput = document.querySelector('#gridAlternating');
const gridVolumeSpeedInput = document.querySelector('#gridVolumeSpeed');
const gridVolumeSpeedValue = document.querySelector('#gridVolumeSpeedValue');
const gridUniformRadialSpeedInput = document.querySelector('#gridUniformRadialSpeed');
const uniformRadialRow = document.querySelector('#uniformRadialRow');
const gridSpinInput = document.querySelector('#gridSpin');
const spinPreviewRow = document.querySelector('#spinPreviewRow');
const strokeWidthInput = document.querySelector('#strokeWidth');
const strokeWidthValue = document.querySelector('#strokeWidthValue');
const bandList = document.querySelector('#bandList');
const addBandButton = document.querySelector('#addBandButton');
const resetSettingsButton = document.querySelector('#resetSettingsButton');
const previewButton = document.querySelector('#previewButton');
const pauseButton = document.querySelector('#pauseButton');
const exportButton = document.querySelector('#exportButton');
const exportSvgButton = document.querySelector('#exportSvgButton');
const statusEl = document.querySelector('#status');
const progressBar = document.querySelector('#progressBar');
const metaEl = document.querySelector('#meta');
const previewCanvas = document.querySelector('#previewCanvas');
const previewCtx = previewCanvas.getContext('2d');

let audioContext = null;
let previewAudioSource = null;
let currentAudioBuffer = null;
let currentFileName = '';
let currentTitle = 'Untitled';
let currentAnalysis = null;
let currentFrames = [];
let currentDuration = 0;
let previewSessionId = 0;
let previewRunning = false;
let previewPaused = false;
let previewStartedAt = 0;
let previewRenderer = null;

bindControlEvents();
renderBandControls(currentSettings.bands);
syncControlLabels();

// Clear the canvas to the default background color on initial load
setupCanvas(previewCtx, currentSettings);
clearCanvas(previewCtx, currentSettings);

fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files || [];
    if (!file) {
        return;
    }

    stopPreview();
    setProgress(0);
    setStatus('Loading audio file...', true);
    previewButton.disabled = true;
    exportButton.disabled = true;
    exportSvgButton.disabled = true;

    currentFileName = file.name;
    currentTitle = stripExtension(file.name);
    currentAudioBuffer = await decodeFile(file);
    currentAnalysis = analyzeAudioBuffer(currentAudioBuffer);
    currentDuration = currentAudioBuffer.duration;
    rebuildVisualization();

    metaEl.innerHTML = [
        `<span class="pill">${escapeHtml(currentTitle)}</span>`,
        `<span class="pill">${currentFrames.length} analysis points</span>`,
        `<span class="pill">${formatTime(currentDuration)}</span>`,
    ].join('');

    setStatus(`Loaded <strong>${escapeHtml(currentFileName)}</strong>. Preview and export are ready.`, false);
    previewButton.disabled = false;
    exportButton.disabled = false;
    exportSvgButton.disabled = false;
});

previewButton.addEventListener('click', async () => {
    if (previewRunning) {
        stopPreview();
        setStatus('Preview stopped.', false);
        return;
    }

    if (!currentAudioBuffer) {
        return;
    }

    previewSessionId += 1;
    const sessionId = previewSessionId;
    previewRunning = true;
    previewPaused = false;
    previewButton.textContent = 'Stop preview';
    
    pauseButton.textContent = 'Pause';
    pauseButton.style.display = 'inline-block';
    pauseButton.disabled = false;

    setStatus('Playing preview in the browser canvas.', true);
    setProgress(0);

    await startPreviewPlayback(sessionId);
});

exportButton.addEventListener('click', async () => {
    if (!currentFrames || currentFrames.length === 0) return;

    stopPreview(); // Stop any active preview playback

    previewButton.disabled = true;
    pauseButton.disabled = true;
    exportButton.disabled = true;
    exportSvgButton.disabled = true;

    setStatus('Preparing browser export...', true);
    setProgress(0);

    try {
        await exportMovie();
        setStatus('Export complete. The MP4 download should begin automatically.', false);
    } catch (error) {
        console.error('Export error:', error);
        setStatus(`Export failed: ${escapeHtml(error?.message || String(error))}`, false, true);
    } finally {
        exportButton.disabled = false;
        exportSvgButton.disabled = false;
        previewButton.disabled = false;
    }
});

exportSvgButton.addEventListener('click', () => {
    if (!currentFrames || currentFrames.length === 0) return;

    exportSvgButton.disabled = true;
    setStatus('Generating SVG...', true);

    setTimeout(() => {
        try {
            const width = currentSettings.width || 800;
            const height = currentSettings.height || 800;
            const bgColor = currentSettings.backgroundColor;
            
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
            svg += `<rect width="100%" height="100%" fill="${bgColor}" />\n`;

            let paths = [];
            let currentPath = null;
            const layout = currentSettings.gridLayoutType || 'linear';
            const isSpinning = currentSettings.gridSpin && layout === 'radial';

            if (isSpinning) {
                const lastFrame = currentFrames[currentFrames.length - 1];
                const spinAngle = lastFrame ? -(lastFrame.angle + Math.PI / 2) : 0;
                const spinDegrees = spinAngle * (180 / Math.PI);
                const cx = width / 2;
                const cy = height / 2;
                svg += `<g transform="translate(${cx}, ${cy}) rotate(${spinDegrees.toFixed(3)}) translate(-${cx}, -${cy})">\n`;
            }

            let lastPoint = null;

            for (let point of currentFrames) {
                const isBoundary = lastPoint && lastPoint.cellIndex !== point.cellIndex;

                if (isBoundary) {
                    lastPoint = null;
                }

                if (lastPoint) {
                    const isNewColor = currentPath && currentPath.color !== point.color;

                    if (!currentPath || isNewColor) {
                        if (currentPath) {
                            paths.push(currentPath);
                        }
                        currentPath = {
                            cellIndex: point.cellIndex,
                            color: point.color,
                            d: `M ${lastPoint.x.toFixed(3)} ${lastPoint.y.toFixed(3)} L ${point.x.toFixed(3)} ${point.y.toFixed(3)}`
                        };
                    } else {
                        currentPath.d += ` L ${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
                    }
                } else {
                    if (currentPath) {
                        paths.push(currentPath);
                        currentPath = null;
                    }
                }

                lastPoint = point;
            }
            
            if (currentPath) {
                paths.push(currentPath);
            }

            for (let p of paths) {
                svg += `<path d="${p.d}" fill="none" stroke="${p.color}" stroke-width="${currentSettings.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />\n`;
            }

            if (isSpinning) {
                svg += `</g>\n`;
            }

            const label = currentTitle || 'Untitled';
            svg += `<text x="${width - 32}" y="${height - 16}" font-family="Helvetica, Arial, sans-serif" font-size="11px" fill="${currentSettings.textColor}" text-anchor="end">${escapeHtml(label)}</text>\n`;
            svg += `</svg>`;

            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${label}.svg`;
            a.click();
            URL.revokeObjectURL(url);
            
            setStatus('SVG Export complete. The download should begin automatically.', false);
        } catch (error) {
            console.error('SVG Export error:', error);
            setStatus(`SVG Export failed: ${escapeHtml(error?.message || String(error))}`, false, true);
        } finally {
            exportSvgButton.disabled = false;
        }
    }, 50);
});

async function decodeFile(file) {
    const buffer = await file.arrayBuffer();
    const context = await ensureAudioContext();
    return await context.decodeAudioData(buffer.slice(0));
}

async function ensureAudioContext() {
    if (audioContext && audioContext.state !== 'closed') {
        return audioContext;
    }

    audioContext = new AudioContext();
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    return audioContext;
}

async function startPreviewPlayback(sessionId) {
    const context = await ensureAudioContext();
    if (previewAudioSource) {
        try {
            previewAudioSource.stop();
        } catch {
            // Ignore stop errors when restarting.
        }
        previewAudioSource.disconnect();
        previewAudioSource = null;
    }

    previewRenderer.reset(previewCtx);
    previewAudioSource = context.createBufferSource();
    previewAudioSource.buffer = currentAudioBuffer;
    previewAudioSource.connect(context.destination);
    previewAudioSource.start();
    previewStartedAt = context.currentTime;

    const animate = () => {
        if (sessionId !== previewSessionId) {
            return;
        }

        if (!previewPaused) {
            const elapsed = context.currentTime - previewStartedAt;
            previewRenderer.step(previewCtx, elapsed);
            previewRenderer.drawOverlay(previewCtx, currentTitle);
            setProgress(Math.min(1, elapsed / Math.max(currentDuration, 0.001)));

            if (elapsed >= currentDuration) {
                previewRunning = false;
                previewButton.textContent = 'Play preview';
                pauseButton.style.display = 'none';
                setProgress(1);
                setStatus('Preview complete.', false);
                return;
            }
        }
        requestAnimationFrame(animate);
    };

    previewAudioSource.onended = () => {
        if (sessionId !== previewSessionId) {
            return;
        }
        previewRunning = false;
        previewButton.textContent = 'Play preview';
        pauseButton.style.display = 'none';
    };

    requestAnimationFrame(animate);
}

function stopPreview() {
    previewSessionId += 1;
    previewRunning = false;
    previewPaused = false;
    previewButton.textContent = 'Play preview';
    pauseButton.textContent = 'Pause';
    pauseButton.style.display = 'none';

    if (previewAudioSource) {
        try {
            previewAudioSource.stop();
        } catch {
            // Ignore when the source has already ended.
        }
        previewAudioSource.disconnect();
        previewAudioSource = null;
    }

    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }
}

async function togglePausePreview() {
    if (!audioContext || !previewRunning) {
        return;
    }

    if (audioContext.state === 'running') {
        await audioContext.suspend();
        previewPaused = true;
        pauseButton.textContent = 'Resume';
        setStatus('Preview paused.', false);
    } else if (audioContext.state === 'suspended') {
        await audioContext.resume();
        previewPaused = false;
        pauseButton.textContent = 'Pause';
        setStatus('Playing preview in the browser canvas.', true);
    }
}

async function exportMovie() {
    const width = currentSettings.width || 800;
    const height = currentSettings.height || 800;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportCtx = exportCanvas.getContext('2d');
    const exportRenderer = createRenderer(currentFrames, currentTitle, currentSettings);
    exportRenderer.reset(exportCtx);

    const output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
    });

    const videoCodec = await getFirstEncodableVideoCodec(output.format.getSupportedVideoCodecs(), {
        width: width,
        height: height,
    });
    const audioCodec = await getFirstEncodableAudioCodec(output.format.getSupportedAudioCodecs());

    if (!videoCodec) {
        throw new Error('No encodable video codec is available in this browser.');
    }

    if (!audioCodec) {
        throw new Error('No encodable audio codec is available in this browser.');
    }

    const videoSource = new CanvasSource(exportCanvas, {
        codec: videoCodec,
        bitrate: QUALITY_HIGH,
    });
    const audioSource = new AudioBufferSource({
        codec: audioCodec,
        bitrate: QUALITY_HIGH,
    });

    output.addVideoTrack(videoSource);
    output.addAudioTrack(audioSource);
    output.setMetadataTags({
        title: currentTitle,
        artist: 'Golden Lines',
    });

    await output.start();
    await audioSource.add(currentAudioBuffer);

    const fps = currentSettings.fps || 30;
    const frameDuration = 1 / fps;
    const totalFrames = Math.max(1, Math.ceil(currentDuration * fps));
    for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex += 1) {
        const time = frameIndex * frameDuration;
        exportRenderer.step(exportCtx, time);
        exportRenderer.drawOverlay(exportCtx, currentTitle);
        await videoSource.add(time, frameDuration);
        setProgress(frameIndex / totalFrames);
    }

    await output.finalize();
    downloadBuffer(output.target.buffer, `${currentTitle}.mp4`, output.format.mimeType || 'video/mp4');
    setProgress(1);
}

function analyzeAudioBuffer(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0);
    const totalChunks = Math.floor(channelData.length / FFT_SIZE) + 1;
    const analysis = {
        sampleRate: audioBuffer.sampleRate,
        chunks: [],
    };
    const workingSamples = new Float32Array(FFT_SIZE);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const chunkStart = chunkIndex * FFT_SIZE;
        workingSamples.fill(0);

        const chunkSize = Math.min(channelData.length - chunkStart, FFT_SIZE);
        if (chunkSize > 0) {
            workingSamples.set(channelData.subarray(chunkStart, chunkStart + chunkSize));
        }

        analysis.chunks.push({
            time: chunkStart / audioBuffer.sampleRate,
            amplitude: rms(workingSamples),
            magnitudes: fftMagnitudes(workingSamples),
        });
    }

    return analysis;
}

function buildFramesFromAnalysis(analysis, title, settings) {
    if (!analysis) {
        return [];
    }

    const width = settings.width || 800;
    const height = settings.height || 800;
    const bands = settings.bands.length > 0 ? settings.bands : DEFAULT_SETTINGS.bands;
    const frameCount = Math.max(1, analysis.chunks.length);
    const frames = [];

    const layout = settings.gridLayoutType || 'linear';
    const rows = settings.gridRows || 45;
    const cols = settings.gridCols || 1;
    const totalCells = rows * cols;

    // --- STEP A: Volume-Responsive Progress Curve ---
    const volumeSpeed = settings.gridVolumeSpeed || 0;
    const cumulativeWeights = new Float64Array(frameCount);
    
    if (volumeSpeed > 0) {
        let cumulative = 0;
        for (let i = 0; i < frameCount; i += 1) {
            const chunk = analysis.chunks[i];
            const weight = 1.0 + volumeSpeed * chunk.amplitude;
            cumulative += weight;
            cumulativeWeights[i] = cumulative;
        }
        const totalWeight = cumulativeWeights[frameCount - 1] || 1;
        for (let i = 0; i < frameCount; i += 1) {
            cumulativeWeights[i] /= totalWeight;
        }
    } else {
        for (let i = 0; i < frameCount; i += 1) {
            cumulativeWeights[i] = i / frameCount;
        }
    }

    // --- STEP B: Radial Ring Chunk Allocation (Uniform Speed) ---
    const useUniformRadial = layout === 'radial' && (settings.gridUniformRadialSpeed !== false);
    const cellBoundaries = new Float64Array(totalCells);

    if (useUniformRadial) {
        const maxRadius = Math.min(width, height) / 2 - BORDER;
        const minRadius = maxRadius * 0.15;
        const radiusRange = maxRadius - minRadius;

        let totalCellWeight = 0;
        const cellWeights = new Float64Array(totalCells);

        for (let cIndex = 0; cIndex < totalCells; cIndex += 1) {
            const rIndex = Math.floor(cIndex / cols);
            const radius = (rows > 1) ? (minRadius + rIndex * (radiusRange / (rows - 1))) : maxRadius;
            cellWeights[cIndex] = radius;
            totalCellWeight += radius;
        }

        let cumWeight = 0;
        for (let cIndex = 0; cIndex < totalCells; cIndex += 1) {
            cumWeight += cellWeights[cIndex];
            cellBoundaries[cIndex] = cumWeight / totalCellWeight;
        }
    } else {
        for (let cIndex = 0; cIndex < totalCells; cIndex += 1) {
            cellBoundaries[cIndex] = (cIndex + 1) / totalCells;
        }
    }

    // Binary search helper to locate correct cellIndex
    function findCellIndex(p) {
        if (p <= 0) return 0;
        if (p >= 1) return totalCells - 1;
        
        let low = 0;
        let high = totalCells - 1;
        let ans = 0;
        
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (cellBoundaries[mid] >= p) {
                ans = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
        return ans;
    }

    // --- STEP C: Build Coordinates ---
    for (let chunkIndex = 0; chunkIndex < frameCount; chunkIndex += 1) {
        const chunk = analysis.chunks[chunkIndex];
        const bandScores = bands.map((band) => bandAverage(
            chunk.magnitudes,
            analysis.sampleRate,
            band.minHz,
            band.maxHz,
        ));
        const weightedScores = bandScores.map((score, index) => {
            const weight = bands[index].weight !== undefined ? bands[index].weight : 1.0;
            return score * weight;
        });
        const colorIndex = dominantIndex(weightedScores);

        const progress = cumulativeWeights[chunkIndex];
        const cellIndex = findCellIndex(progress);
        const rowIndex = Math.floor(cellIndex / cols);
        const colIndex = cellIndex % cols;

        const pStart = (cellIndex > 0) ? cellBoundaries[cellIndex - 1] : 0;
        const pEnd = cellBoundaries[cellIndex];
        let cellProgress = (pEnd > pStart) ? ((progress - pStart) / (pEnd - pStart)) : 0;
        if (cellProgress < 0) cellProgress = 0;
        if (cellProgress > 1) cellProgress = 1;
        const alternateDirection = settings.gridAlternating && (rowIndex % 2 === 1);
        const actualCellProgress = alternateDirection ? (1.0 - cellProgress) : cellProgress;

        let x = 0;
        let y = 0;
        let angle = 0;

        if (layout === 'radial') {
            const cx = width / 2;
            const cy = height / 2;
            const maxRadius = Math.min(width, height) / 2 - BORDER;
            const minRadius = maxRadius * 0.15;
            const radiusRange = maxRadius - minRadius;

            // Concentric circle radius/spiral winding and segment arcs
            const radius = (rows > 1) ? (minRadius + rowIndex * (radiusRange / (rows - 1))) : maxRadius;
            const angleSpan = (2 * Math.PI) / cols;
            const angleStart = colIndex * angleSpan;

            angle = angleStart + actualCellProgress * angleSpan - Math.PI / 2;

            const rowHeight = (rows > 1) ? (radiusRange / rows) : maxRadius;
            const ampMod = mapRange(chunk.amplitude, 0, 0.4, -0.5, 0.5) * rowHeight * 0.8;
            const r = radius + ampMod;

            x = cx + r * Math.cos(angle);
            y = cy + r * Math.sin(angle);
        } else {
            const cellWidth = (width - 2 * BORDER) / cols;
            const cellHeight = (height - 2.5 * BORDER) / rows;

            const localX = actualCellProgress * cellWidth;
            const ampMod = mapRange(chunk.amplitude, 0, 0.4, -0.5, 0.5) * cellHeight;

            x = BORDER + colIndex * cellWidth + localX;
            y = BORDER + (rowIndex + 0.5) * cellHeight + ampMod;
        }

        frames.push({
            time: chunk.time,
            color: bands[colorIndex] ? bands[colorIndex].color : bands[0].color,
            x: x,
            y: y,
            cellIndex: cellIndex,
            angle: angle,
            title,
            timestampLabel: formatSeconds(chunk.time),
        });
    }

    return frames;
}

function createRenderer(frames, title, settings) {
    const state = {
        cursor: 0,
        lastPoint: null,
    };
    const fps = settings.fps || 30;
    const frameDuration = 1 / fps;
    const layout = settings.gridLayoutType || 'linear';

    return {
        reset(ctx) {
            state.cursor = 0;
            state.lastPoint = null;
            setupCanvas(ctx, settings);
            clearCanvas(ctx, settings);
        },
        step(ctx, time) {
            const isSpinning = settings.gridSpin && layout === 'radial' && (time < 100000);

            if (isSpinning) {
                clearCanvas(ctx, settings);
                state.lastPoint = null;

                // Find the active frame at the current time to match the spin angle
                let activeFrameIndex = 0;
                for (let i = 0; i < frames.length; i += 1) {
                    if (frames[i].time <= time + frameDuration * 0.5) {
                        activeFrameIndex = i;
                    } else {
                        break;
                    }
                }
                const activeFrame = frames[activeFrameIndex] || frames[0];
                const spinAngle = activeFrame ? -(activeFrame.angle + Math.PI / 2) : 0;

                const width = settings.width || 800;
                const height = settings.height || 800;
                const cx = width / 2;
                const cy = height / 2;

                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(spinAngle);
                ctx.translate(-cx, -cy);

                for (let i = 0; i < frames.length; i += 1) {
                    if (frames[i].time > time + frameDuration * 0.5) {
                        state.cursor = i;
                        break;
                    }
                    drawPoint(ctx, frames[i], state, settings);
                    if (i === frames.length - 1) {
                        state.cursor = frames.length;
                    }
                }

                ctx.restore();
            } else {
                while (state.cursor < frames.length && frames[state.cursor].time <= time + frameDuration * 0.5) {
                    drawPoint(ctx, frames[state.cursor], state, settings);
                    state.cursor += 1;
                }
            }
        },
        drawOverlay(ctx, overlayTitle) {
            drawLabel(ctx, overlayTitle || title, settings);
        },
    };
}

function setupCanvas(ctx, settings) {
    ctx.lineWidth = settings.strokeWidth;
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = settings.backgroundColor;
    ctx.font = '11px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
}

function clearCanvas(ctx, settings) {
    ctx.fillStyle = settings.backgroundColor;
    ctx.fillRect(0, 0, settings.width || 800, settings.height || 800);
}

function drawPoint(ctx, point, state, settings) {
    const isBoundary = state.lastPoint && state.lastPoint.cellIndex !== point.cellIndex;

    if (isBoundary) {
        state.lastPoint = null;
    }

    ctx.strokeStyle = point.color;
    ctx.lineWidth = settings.strokeWidth;
    if (state.lastPoint) {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(state.lastPoint.x, state.lastPoint.y);
        ctx.stroke();
    }

    state.lastPoint = point;
}

function drawLabel(ctx, title, settings) {
    const label = title || 'Untitled';
    const textWidth = ctx.measureText(label).width;
    const width = settings.width || 800;
    const height = settings.height || 800;
    ctx.fillStyle = settings.backgroundColor;
    ctx.fillRect(width - BORDER - textWidth - SPACING, height - BORDER, textWidth + BORDER + SPACING, BORDER);
    ctx.fillStyle = settings.textColor;
    ctx.fillText(label, width - BORDER, height - BORDER / 2);
}

function drawStaticFrame(ctx, renderer, title) {
    renderer.reset(ctx);
    renderer.drawOverlay(ctx, title);
}

function rms(samples) {
    let sum = 0;
    for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index];
        sum += sample * sample;
    }
    return Math.sqrt(sum / Math.max(1, samples.length));
}

// Precomputed structures for FFT optimization (FFT_SIZE = 1024)
const fftRealBuffer = new Float32Array(FFT_SIZE);
const fftImagBuffer = new Float32Array(FFT_SIZE);
const fftReversedIndices = new Int32Array(FFT_SIZE);

// Precompute bit-reversal table once on module load
for (let index = 0, reversed = 0; index < FFT_SIZE; index += 1) {
    fftReversedIndices[index] = reversed;
    let mask = FFT_SIZE >> 1;
    while (mask && (reversed & mask)) {
        reversed &= ~mask;
        mask >>= 1;
    }
    reversed |= mask;
}

// Precompute trigonometric tables for butterfly operations
const fftCosTable = [];
const fftSinTable = [];
for (let halfSize = 1; halfSize < FFT_SIZE; halfSize *= 2) {
    const phaseStep = -Math.PI / halfSize;
    const cosTable = new Float32Array(halfSize);
    const sinTable = new Float32Array(halfSize);
    for (let offset = 0; offset < halfSize; offset += 1) {
        const angle = offset * phaseStep;
        cosTable[offset] = Math.cos(angle);
        sinTable[offset] = Math.sin(angle);
    }
    fftCosTable[halfSize] = cosTable;
    fftSinTable[halfSize] = sinTable;
}

function fftMagnitudes(samples) {
    const size = samples.length;
    const real = fftRealBuffer;
    const imag = fftImagBuffer;

    // Copy and bit-reverse in one step using the precomputed table
    for (let index = 0; index < size; index += 1) {
        const rev = fftReversedIndices[index];
        real[rev] = samples[index];
        imag[rev] = 0;
    }

    for (let halfSize = 1; halfSize < size; halfSize *= 2) {
        const cosTable = fftCosTable[halfSize];
        const sinTable = fftSinTable[halfSize];
        for (let start = 0; start < size; start += halfSize * 2) {
            for (let offset = 0; offset < halfSize; offset += 1) {
                const indexA = start + offset;
                const indexB = indexA + halfSize;
                const cos = cosTable[offset];
                const sin = sinTable[offset];
                const treal = cos * real[indexB] - sin * imag[indexB];
                const timag = sin * real[indexB] + cos * imag[indexB];
                real[indexB] = real[indexA] - treal;
                imag[indexB] = imag[indexA] - timag;
                real[indexA] += treal;
                imag[indexA] += timag;
            }
        }
    }

    const magnitudes = new Float32Array(size / 2);
    for (let index = 0; index < magnitudes.length; index += 1) {
        magnitudes[index] = Math.hypot(real[index], imag[index]);
    }

    return magnitudes;
}

function bandAverage(magnitudes, sampleRate, minHz, maxHz) {
    const size = magnitudes.length * 2;
    const startIndex = Math.max(0, Math.ceil((minHz * size) / sampleRate));
    const endIndex = Math.min(magnitudes.length - 1, Math.floor((maxHz * size) / sampleRate));

    let total = 0;
    let count = 0;

    for (let index = startIndex; index <= endIndex; index += 1) {
        total += magnitudes[index];
        count += 1;
    }

    return count > 0 ? total / count : 0;
}

function dominantIndex(values) {
    let winner = 0;
    for (let index = 1; index < values.length; index += 1) {
        if (values[index] > values[winner]) {
            winner = index;
        }
    }
    return winner;
}



function bandWeight(minHz, maxHz) {
    const centerHz = (minHz + maxHz) / 2;

    const minFreq = 20;
    const maxFreq = 6000;
    const minWeight = 0.2;
    const maxWeight = 4.0;

    const clampedHz = Math.max(minFreq, Math.min(centerHz, maxFreq));

    return mapRange(clampedHz, minFreq, maxFreq, minWeight, maxWeight);
}

function mapRange(value, inMin, inMax, outMin, outMax) {
    const normalized = (value - inMin) / (inMax - inMin || 1);
    return outMin + (outMax - outMin) * normalized;
}

function bindControlEvents() {
    [backgroundColorInput, textColorInput, strokeWidthInput, canvasWidthInput, canvasHeightInput, gridRowsInput, gridColsInput, gridVolumeSpeedInput].forEach((control) => {
        control.addEventListener('input', () => {
            syncControlLabels();
            applySettings();
        });
    });

    [canvasPreset, canvasFps, gridLayoutType, gridAlternatingInput, gridUniformRadialSpeedInput, gridSpinInput].forEach((control) => {
        control.addEventListener('change', () => {
            syncControlLabels();
            applySettings();
        });
    });

    addBandButton.addEventListener('click', () => {
        const bands = readSettingsFromControls().bands;
        bands.push(createBandConfig(bands.length));
        renderBandControls(bands);
        applySettings();
    });

    bandList.addEventListener('input', (event) => {
        // Real-time title and dot color update in the header card
        const input = event.target;
        const item = input.closest('.band-item');
        if (item) {
            if (input.matches('input[data-role="label"]')) {
                const titleLabel = item.querySelector('.band-title-label');
                if (titleLabel) {
                    titleLabel.textContent = input.value.trim() || 'Band';
                }
            } else if (input.matches('input[data-role="color"]')) {
                const colorDot = item.querySelector('.band-color-dot');
                if (colorDot) {
                    colorDot.style.backgroundColor = input.value;
                }
            }
        }
        syncControlLabels();
        applySettings();
    });

    bandList.addEventListener('click', (event) => {
        const removeButton = event.target.closest('[data-action="remove-band"]');
        if (removeButton) {
            const item = removeButton.closest('.band-item');
            if (item && bandList.querySelectorAll('.band-item').length > 1) {
                item.remove();
                syncControlLabels();
                applySettings();
            }
            return;
        }

        // Collapse/expand details panel
        const header = event.target.closest('.band-header');
        if (header) {
            const item = header.closest('.band-item');
            const content = item.querySelector('.band-content');
            const toggleBtn = item.querySelector('.band-toggle-button');
            if (content) {
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    toggleBtn.textContent = '▼';
                } else {
                    content.style.display = 'none';
                    toggleBtn.textContent = '▶';
                }
            }
        }
    });

    // Toggle full settings blocks (Canvas and Color bands)
    document.querySelectorAll('.settings-block-header').forEach((header) => {
        header.addEventListener('click', () => {
            const block = header.closest('.settings-block');
            const content = block.querySelector('.settings-block-content');
            const arrow = header.querySelector('.section-toggle-arrow');
            if (content) {
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    arrow.textContent = '▼';
                } else {
                    content.style.display = 'none';
                    arrow.textContent = '▶';
                }
            }
        });
    });

    resetSettingsButton.addEventListener('click', () => {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        currentSettings = cloneSettings(DEFAULT_SETTINGS);
        
        backgroundColorInput.value = currentSettings.backgroundColor;
        textColorInput.value = currentSettings.textColor;
        canvasPreset.value = currentSettings.preset;
        canvasWidthInput.value = currentSettings.width;
        canvasHeightInput.value = currentSettings.height;
        canvasFps.value = currentSettings.fps;
        gridLayoutType.value = currentSettings.gridLayoutType;
        gridRowsInput.value = currentSettings.gridRows;
        gridColsInput.value = currentSettings.gridCols;
        gridAlternatingInput.checked = currentSettings.gridAlternating;
        gridVolumeSpeedInput.value = currentSettings.gridVolumeSpeed;
        gridUniformRadialSpeedInput.checked = currentSettings.gridUniformRadialSpeed;
        gridSpinInput.checked = currentSettings.gridSpin;
        strokeWidthInput.value = currentSettings.strokeWidth;

        renderBandControls(currentSettings.bands);
        syncControlLabels();
        applySettings();
    });

    pauseButton.addEventListener('click', () => {
        togglePausePreview();
    });
}

function syncControlLabels() {
    strokeWidthValue.textContent = `${strokeWidthInput.value} px`;
    gridVolumeSpeedValue.textContent = `${Number(gridVolumeSpeedInput.value).toFixed(1)}x`;

    if (canvasPreset.value === 'custom') {
        customDimensionsRow.style.display = 'flex';
    } else {
        customDimensionsRow.style.display = 'none';
    }

    if (gridLayoutType.value === 'radial') {
        uniformRadialRow.style.display = 'block';
        spinPreviewRow.style.display = 'block';
    } else {
        uniformRadialRow.style.display = 'none';
        spinPreviewRow.style.display = 'none';
    }

    bandList.querySelectorAll('.band-item').forEach((item) => {
        const minInput = item.querySelector('input[data-role="min"]');
        const maxInput = item.querySelector('input[data-role="max"]');
        if (Number.parseFloat(minInput.value) > Number.parseFloat(maxInput.value)) {
            maxInput.value = minInput.value;
        }

        const weightInput = item.querySelector('input[data-role="weight"]');
        const weightVal = item.querySelector('.weight-value');
        if (weightInput && weightVal) {
            weightVal.textContent = `${Number.parseFloat(weightInput.value).toFixed(1)}x`;
        }
    });
}

function applySettings() {
    currentSettings = readSettingsFromControls();
    saveSettings(currentSettings);

    if (previewCanvas) {
        previewCanvas.width = currentSettings.width;
        previewCanvas.height = currentSettings.height;
    }
    const dimensionsPillElement = document.querySelector('#dimensionsPill');
    if (dimensionsPillElement) {
        dimensionsPillElement.textContent = `${currentSettings.width} × ${currentSettings.height}`;
    }
    const fpsPillElement = document.querySelector('#fpsPill');
    if (fpsPillElement) {
        fpsPillElement.textContent = `${currentSettings.fps} fps export`;
    }

    setupCanvas(previewCtx, currentSettings);
    clearCanvas(previewCtx, currentSettings);

    if (currentAnalysis) {
        rebuildVisualization();
        if (currentAudioBuffer) {
            metaEl.innerHTML = [
                `<span class="pill">${escapeHtml(currentTitle)}</span>`,
                `<span class="pill">${currentFrames.length} analysis points</span>`,
                `<span class="pill">${formatTime(currentDuration)}</span>`,
            ].join('');
        }
        if (previewRunning) {
            stopPreview();
        }
        setStatus('Updated the visual settings.', false);
    }
}

function readSettingsFromControls() {
    const bands = Array.from(bandList.querySelectorAll('.band-item')).map((item) => {
        const labelInput = item.querySelector('input[data-role="label"]');
        const colorInput = item.querySelector('input[data-role="color"]');
        const minInput = item.querySelector('input[data-role="min"]');
        const maxInput = item.querySelector('input[data-role="max"]');
        const weightInput = item.querySelector('input[data-role="weight"]');
        const minHz = Number.parseFloat(minInput.value);
        const maxHz = Number.parseFloat(maxInput.value);
        const weight = Number.parseFloat(weightInput.value);

        return {
            label: labelInput.value.trim() || 'Band',
            color: colorInput.value,
            minHz: Math.min(minHz, maxHz),
            maxHz: Math.max(minHz, maxHz),
            weight: weight,
        };
    });

    const preset = canvasPreset.value;
    let width = 800;
    let height = 800;

    if (preset === 'square') {
        width = 800;
        height = 800;
    } else if (preset === 'hd') {
        width = 1280;
        height = 720;
    } else if (preset === 'fullhd') {
        width = 1920;
        height = 1080;
    } else if (preset === 'portrait') {
        width = 1080;
        height = 1920;
    } else if (preset === 'custom') {
        width = Number.parseInt(canvasWidthInput.value) || 800;
        height = Number.parseInt(canvasHeightInput.value) || 800;
    }

    return {
        backgroundColor: backgroundColorInput.value,
        textColor: textColorInput.value,
        strokeWidth: Number.parseFloat(strokeWidthInput.value),
        width: width,
        height: height,
        preset: preset,
        fps: Number.parseInt(canvasFps.value) || 30,
        gridLayoutType: gridLayoutType.value,
        gridRows: Number.parseInt(gridRowsInput.value) || 25,
        gridCols: Number.parseInt(gridColsInput.value) || 25,
        gridAlternating: gridAlternatingInput.checked,
        gridVolumeSpeed: Number.parseFloat(gridVolumeSpeedInput.value) || 0,
        gridUniformRadialSpeed: gridUniformRadialSpeedInput.checked,
        gridSpin: gridSpinInput.checked,
        bands: bands.length > 0 ? bands : cloneSettings(DEFAULT_SETTINGS).bands,
    };
}

function rebuildVisualization() {
    currentFrames = buildFramesFromAnalysis(currentAnalysis, currentTitle, currentSettings);
    previewRenderer = createRenderer(currentFrames, currentTitle, currentSettings);
    drawStaticFrame(previewCtx, previewRenderer, currentTitle);
}

function renderBandControls(bands) {
    bandList.innerHTML = bands.map((band, index) => {
        const defaultWeight = band.weight !== undefined ? band.weight : Number(bandWeight(band.minHz, band.maxHz).toFixed(1));
        return `
        <div class="band-item" data-index="${index}">
            <div class="band-header">
                <span class="band-color-dot" style="background-color: ${escapeAttribute(band.color)};"></span>
                <span class="band-title-label">${escapeHtml(band.label || `Band ${index + 1}`)}</span>
                <div class="band-header-actions">
                    <button class="band-toggle-button" type="button" aria-label="Toggle details">▼</button>
                    <button class="band-remove-button" type="button" data-action="remove-band" aria-label="Remove band">×</button>
                </div>
            </div>
            
            <div class="band-content" style="display: block;">
                <div class="field compact">
                    <label>Label</label>
                    <input data-role="label" type="text" value="${escapeAttribute(band.label || `Band ${index + 1}`)}" />
                </div>
                
                <div class="field-row">
                    <div class="field compact">
                        <label>Color</label>
                        <input data-role="color" type="color" value="${escapeAttribute(band.color)}" />
                    </div>
                    <div class="field compact">
                        <label>Min Hz</label>
                        <input data-role="min" type="number" min="0" step="1" value="${escapeAttribute(String(band.minHz))}" />
                    </div>
                    <div class="field compact">
                        <label>Max Hz</label>
                        <input data-role="max" type="number" min="0" step="1" value="${escapeAttribute(String(band.maxHz))}" />
                    </div>
                </div>
                
                <div class="field compact">
                    <label>Weight (Gain)</label>
                    <div class="weight-slider-row">
                        <input data-role="weight" type="range" min="0.1" max="5.0" step="0.1" value="${escapeAttribute(String(defaultWeight))}" />
                        <span class="weight-value">${defaultWeight.toFixed(1)}x</span>
                    </div>
                </div>
            </div>
        </div>
    `; }).join('');
}

function createBandConfig(index) {
    const start = index === 0 ? 20 : index * 1000;
    const minHz = start;
    const maxHz = start + 500;
    return {
        label: `Band ${index + 1}`,
        color: DEFAULT_SETTINGS.bands[index]?.color || '#ffffff',
        minHz: minHz,
        maxHz: maxHz,
        weight: Number(bandWeight(minHz, maxHz).toFixed(1)),
    };
}

function cloneSettings(settings) {
    return {
        backgroundColor: settings.backgroundColor,
        textColor: settings.textColor,
        strokeWidth: settings.strokeWidth,
        width: settings.width || 800,
        height: settings.height || 800,
        preset: settings.preset || 'square',
        fps: settings.fps || 30,
        gridLayoutType: settings.gridLayoutType || 'linear',
        gridRows: settings.gridRows || 25,
        gridCols: settings.gridCols || 25,
        gridAlternating: !!settings.gridAlternating,
        gridVolumeSpeed: settings.gridVolumeSpeed || 0,
        gridUniformRadialSpeed: settings.gridUniformRadialSpeed !== undefined ? settings.gridUniformRadialSpeed : true,
        bands: settings.bands.map((band) => ({ ...band })),
    };
}

function escapeAttribute(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function stripExtension(fileName) {
    return fileName.replace(/\.[^.]+$/, '');
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = (seconds % 60).toFixed(2).padStart(5, '0');
    return `${minutes}:${remainder}`;
}

function formatSeconds(seconds) {
    return seconds.toFixed(3);
}

function setStatus(message, busy = false, isError = false) {
    statusEl.innerHTML = `<strong style="color:${isError ? 'var(--danger)' : 'var(--text)'}">${busy ? 'Working.' : 'Ready.'}</strong> ${message}`;
}

function setProgress(value) {
    progressBar.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
}

function downloadBuffer(buffer, fileName, mimeType) {
    const blob = new Blob([buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
