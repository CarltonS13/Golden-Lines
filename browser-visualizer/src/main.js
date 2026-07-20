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

const WIDTH = 800;
const HEIGHT = 800;
const SPACING = 16;
const BORDER = SPACING * 2;
const FFT_SIZE = 1024;
const MOVIE_FPS = 30;
const FRAME_DURATION = 1 / MOVIE_FPS;
const COLORS = [
    [242, 158, 76],
    [239, 234, 90],
    [22, 219, 147],
];

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

      <div class="field">
        <label for="fileInput">Audio file</label>
        <input id="fileInput" type="file" accept="audio/*" />
      </div>

      <div class="buttons">
        <button id="previewButton" class="secondary" disabled>Play preview</button>
        <button id="exportButton" class="primary" disabled>Export MP4</button>
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
          <canvas id="previewCanvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
        </div>
      </div>
      <div class="meta" id="meta">
        <span class="pill">Preview canvas</span>
        <span class="pill">${WIDTH} × ${HEIGHT}</span>
        <span class="pill">${MOVIE_FPS} fps export</span>
      </div>
    </section>
  </div>
`;

const fileInput = document.querySelector('#fileInput');
const previewButton = document.querySelector('#previewButton');
const exportButton = document.querySelector('#exportButton');
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
let currentFrames = [];
let currentDuration = 0;
let previewSessionId = 0;
let previewRunning = false;
let previewStartedAt = 0;
let previewRenderer = null;

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

    currentFileName = file.name;
    currentTitle = stripExtension(file.name);
    currentAudioBuffer = await decodeFile(file);
    currentFrames = buildFrames(currentAudioBuffer, currentTitle);
    currentDuration = currentAudioBuffer.duration;
    previewRenderer = createRenderer(currentFrames, currentTitle);
    drawStaticFrame(previewCtx, previewRenderer, currentTitle);

    metaEl.innerHTML = [
        `<span class="pill">${escapeHtml(currentTitle)}</span>`,
        `<span class="pill">${currentFrames.length} analysis points</span>`,
        `<span class="pill">${formatTime(currentDuration)}</span>`,
    ].join('');

    setStatus(`Loaded <strong>${escapeHtml(currentFileName)}</strong>. Preview and export are ready.`, false);
    previewButton.disabled = false;
    exportButton.disabled = false;
});

previewButton.addEventListener('click', async () => {
    if (!currentAudioBuffer || previewRunning) {
        return;
    }

    previewSessionId += 1;
    const sessionId = previewSessionId;
    previewRunning = true;
    setStatus('Playing preview in the browser canvas.', true);
    setProgress(0);

    await startPreviewPlayback(sessionId);
});

exportButton.addEventListener('click', async () => {
    if (!currentAudioBuffer) {
        return;
    }

    exportButton.disabled = true;
    previewButton.disabled = true;
    setStatus('Preparing browser export...', true);
    setProgress(0);

    try {
        await exportMovie();
        setStatus('Export complete. The MP4 download should begin automatically.', false);
    } catch (error) {
        console.error(error);
        setStatus(`Export failed: ${escapeHtml(error?.message || String(error))}`, false, true);
    } finally {
        previewButton.disabled = false;
        exportButton.disabled = false;
    }
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

        const elapsed = context.currentTime - previewStartedAt;
        previewRenderer.step(previewCtx, elapsed);
        previewRenderer.drawOverlay(previewCtx, currentTitle);
        setProgress(Math.min(1, elapsed / Math.max(currentDuration, 0.001)));

        if (elapsed < currentDuration) {
            requestAnimationFrame(animate);
        } else {
            previewRunning = false;
            setProgress(1);
            setStatus('Preview complete.', false);
        }
    };

    previewAudioSource.onended = () => {
        if (sessionId !== previewSessionId) {
            return;
        }
        previewRunning = false;
    };

    requestAnimationFrame(animate);
}

function stopPreview() {
    previewSessionId += 1;
    previewRunning = false;

    if (previewAudioSource) {
        try {
            previewAudioSource.stop();
        } catch {
            // Ignore when the source has already ended.
        }
        previewAudioSource.disconnect();
        previewAudioSource = null;
    }
}

async function exportMovie() {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = WIDTH;
    exportCanvas.height = HEIGHT;
    const exportCtx = exportCanvas.getContext('2d');
    const exportRenderer = createRenderer(currentFrames, currentTitle);
    exportRenderer.reset(exportCtx);

    const output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
    });

    const videoCodec = await getFirstEncodableVideoCodec(output.format.getSupportedVideoCodecs(), {
        width: WIDTH,
        height: HEIGHT,
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

    const totalFrames = Math.max(1, Math.ceil(currentDuration * MOVIE_FPS));

    for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex += 1) {
        const time = frameIndex * FRAME_DURATION;
        exportRenderer.step(exportCtx, time);
        exportRenderer.drawOverlay(exportCtx, currentTitle);
        await videoSource.add(time, FRAME_DURATION);
        setProgress(frameIndex / totalFrames);
    }

    await output.finalize();
    const buffer = output.target.buffer;
    downloadBuffer(buffer, `${currentTitle}.mp4`, output.format.mimeType || 'video/mp4');
    setProgress(1);
}

function buildFrames(audioBuffer, title) {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const totalChunks = Math.floor(channelData.length / FFT_SIZE) + 1;
    const frameCount = Math.max(1, totalChunks);
    const frames = [];
    const screenSize = ((WIDTH - 2 * BORDER) * (HEIGHT - 1.5 * BORDER)) / SPACING;
    const workingSamples = new Float32Array(FFT_SIZE);
    const freqData = new Float32Array(FFT_SIZE / 2);

    for (let chunkIndex = 0; chunkIndex < frameCount; chunkIndex += 1) {
        const chunkStart = chunkIndex * FFT_SIZE;
        workingSamples.fill(0);

        const chunkSize = Math.min(channelData.length - chunkStart, FFT_SIZE);
        if (chunkSize > 0) {
            workingSamples.set(channelData.subarray(chunkStart, chunkStart + chunkSize));
        }

        const time = chunkStart / sampleRate;
        const amplitude = rms(workingSamples);
        const spectrum = fftMagnitudes(workingSamples);
        freqData.set(spectrum);

        const scoreLow = bandAverage(freqData, sampleRate, 20, 250);
        const scoreMid = bandAverage(freqData, sampleRate, 250, 4000);
        const scoreHi = bandAverage(freqData, sampleRate, 4000, 6000);
        const colors = [scoreLow * 0.2, scoreMid * 1.5, scoreHi * 4];
        const colorIndex = dominantIndex(colors);

        let x = Math.floor((chunkIndex / frameCount) * screenSize);
        const ySteps = Math.floor(x / (WIDTH - 2 * BORDER));
        x -= (WIDTH - 2 * BORDER) * ySteps;

        const rand = mapRange(amplitude, 0, 0.4, -0.4, 0.4);
        const point = {
            time,
            color: COLORS[colorIndex],
            x: x + BORDER,
            y: SPACING * (ySteps + rand) + BORDER,
            title,
            timestampLabel: formatSeconds(time),
        };

        frames.push(point);
    }

    return frames;
}

function createRenderer(frames, title) {
    const state = {
        cursor: 0,
        lastPoint: null,
    };

    return {
        reset(ctx) {
            state.cursor = 0;
            state.lastPoint = null;
            setupCanvas(ctx);
            clearCanvas(ctx);
        },
        step(ctx, time) {
            while (state.cursor < frames.length && frames[state.cursor].time <= time + FRAME_DURATION * 0.5) {
                drawPoint(ctx, frames[state.cursor], state);
                state.cursor += 1;
            }
        },
        drawOverlay(ctx, overlayTitle) {
            drawLabel(ctx, overlayTitle || title);
        },
    };
}

function setupCanvas(ctx) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
}

function clearCanvas(ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawPoint(ctx, point, state) {
    const [red, green, blue] = point.color;
    if (state.lastPoint && state.lastPoint.x > point.x) {
        state.lastPoint = null;
    }

    ctx.strokeStyle = `rgb(${red}, ${green}, ${blue})`;
    if (state.lastPoint) {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(state.lastPoint.x, state.lastPoint.y);
        ctx.stroke();
    }

    state.lastPoint = point;
}

function drawLabel(ctx, title) {
    const label = title || 'Untitled';
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(WIDTH - BORDER - textWidth - SPACING, HEIGHT - BORDER, textWidth + BORDER + SPACING, BORDER);
    ctx.fillStyle = '#000000';
    ctx.fillText(label, WIDTH - BORDER, HEIGHT - BORDER / 2);
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

function fftMagnitudes(samples) {
    const size = samples.length;
    const real = new Float32Array(size);
    const imag = new Float32Array(size);
    for (let index = 0; index < size; index += 1) {
        real[index] = samples[index];
        imag[index] = 0;
    }

    for (let index = 0, reversed = 0; index < size; index += 1) {
        if (reversed > index) {
            const tempReal = real[index];
            const tempImag = imag[index];
            real[index] = real[reversed];
            imag[index] = imag[reversed];
            real[reversed] = tempReal;
            imag[reversed] = tempImag;
        }

        let mask = size >> 1;
        while (mask && (reversed & mask)) {
            reversed &= ~mask;
            mask >>= 1;
        }
        reversed |= mask;
    }

    for (let halfSize = 1; halfSize < size; halfSize *= 2) {
        const phaseStep = (-Math.PI / halfSize);
        for (let start = 0; start < size; start += halfSize * 2) {
            for (let offset = 0; offset < halfSize; offset += 1) {
                const indexA = start + offset;
                const indexB = indexA + halfSize;
                const angle = offset * phaseStep;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
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
        const realValue = real[index];
        const imagValue = imag[index];
        magnitudes[index] = Math.hypot(realValue, imagValue);
    }

    return magnitudes;
}

function bandAverage(magnitudes, sampleRate, minHz, maxHz) {
    const size = magnitudes.length * 2;
    let total = 0;
    let count = 0;

    for (let index = 0; index < magnitudes.length; index += 1) {
        const frequency = (index * sampleRate) / size;
        if (frequency >= minHz && frequency < maxHz) {
            total += magnitudes[index];
            count += 1;
        }
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

function mapRange(value, inMin, inMax, outMin, outMax) {
    const normalized = (value - inMin) / (inMax - inMin || 1);
    return outMin + (outMax - outMin) * normalized;
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
