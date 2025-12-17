document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements & State ---
    const displayCanvas = document.getElementById('displayCanvas');
    const timeDomainCanvas = document.getElementById('timeDomainCanvas');
    const frequencyCanvas = document.getElementById('frequencyDomainCanvas');
    const alphaSlider = document.getElementById('alphaSlider');
    const alphaValueSpan = document.getElementById('alphaValue');
    const fpsValueSpan = document.getElementById('fpsValue');

    const lowCutoffInput = document.getElementById('lowCutoff');
    const highCutoffInput = document.getElementById('highCutoff');
    const sonifyToggle = document.getElementById('sonifyToggle');
    const highlightSkinToggle = document.getElementById('highlightSkinToggle');
    const enableHighPassToggle = document.getElementById('enableHighPassToggle');
    const enableLowPassToggle = document.getElementById('enableLowPassToggle');
    const demoButton = document.getElementById('demoButton');
    const roiModeRadios = document.querySelectorAll('input[name="roiMode"]');
    const videoCanvasLabel = document.getElementById('videoCanvasLabel');
    const showAxesToggle = document.getElementById('showAxesToggle');
    const showRawSignalToggle = document.getElementById('showRawSignalToggle');

    let roiMode = 'auto', showAxes = true, showRawSignal = false;
    let alpha = parseInt(alphaSlider.value, 10);
    let lowCutoff = parseFloat(lowCutoffInput.value);
    let highCutoff = parseFloat(highCutoffInput.value);
    const bufferSize = 256;
    let signalBuffer = new Array(bufferSize).fill(0);
    let rawDetrendedBuffer = new Array(bufferSize).fill(0);
    let filteredBuffer = new Array(bufferSize).fill(0);
    let isDemoRunning = false, demoInterval = null;

    // Timing & Resampling
    const FIXED_TIMESTEP_MS = 1000 / 30; // 30Hz
    let virtualTime = 0;
    let lastRawTime = 0;
    let lastRawValue = 0;
    let lastAmplifiedValue = 0;

    let isInitialized = false, roi = { x: 0, y: 0, width: 0, height: 0 };
    let isDrawing = false, startCoords = { x: 0, y: 0 }, currentDraw = null;
    let smoothedBpm = 0, signalMetrics = { quality: 'Poor', color: '#f44336' };
    let dynamicSafeZone = { x: 0, y: 0, width: 0, height: 0 };
    let boundaryPoints = {};

    let framesThisSecond = 0;
    let lastFpsUpdate = 0;

    let smoothedQualityRatio = 0;
    const QUALITY_SMOOTHING_FACTOR = 0.1;
    const MIN_SIGNAL_POWER = 0.05;

    const displayCtx = displayCanvas.getContext('2d');
    const timeCtx = timeDomainCanvas.getContext('2d');
    const freqCtx = frequencyCanvas.getContext('2d');
    const hiddenVideo = document.createElement('video'); hiddenVideo.autoplay = true; hiddenVideo.playsinline = true;
    const webglCanvas = document.createElement('canvas'); let gl;
    const hiddenCanvas = document.createElement('canvas'); let hiddenCtx;

    let audioContext, oscillator, gainNode;
    let shaderProgram, positionBuffer, textureCoordBuffer, videoTexture, maskTexture;

    let selfieSegmentation, faceMesh;
    let latestSegmentationMask = null;
    let latestFaceLandmarks = null;

    const FOREHEAD_BOUNDARY_LANDMARKS = {
        top: 10, leftTemple: 234, rightTemple: 454, leftEyebrow: 107, rightEyebrow: 336
    };

    // --- FILTER CLASS ---
    class ButterworthBandpassFilter {
        constructor(lowCut, highCut, sampleRate) {
            this.hp_x1 = 0; this.hp_x2 = 0; this.hp_y1 = 0; this.hp_y2 = 0;
            this.lp_x1 = 0; this.lp_x2 = 0; this.lp_y1 = 0; this.lp_y2 = 0;
            this.useHP = true;
            this.useLP = false;
            this.updateCoefficients(lowCut, highCut, sampleRate);
        }

        updateCoefficients(lowCut, highCut, fs) {
            fs = Math.max(1, fs);
            // High Pass
            const omegaHP = Math.tan(Math.PI * lowCut / fs);
            const normHP = 1 / (1 + Math.sqrt(2) * omegaHP + omegaHP * omegaHP);
            this.hp_b0 = 1 * normHP; this.hp_b1 = -2 * this.hp_b0; this.hp_b2 = this.hp_b0;
            this.hp_a1 = 2 * (omegaHP * omegaHP - 1) * normHP; this.hp_a2 = (1 - Math.sqrt(2) * omegaHP + omegaHP * omegaHP) * normHP;
            // Low Pass
            const omegaLP = Math.tan(Math.PI * highCut / fs);
            const normLP = 1 / (1 + Math.sqrt(2) * omegaLP + omegaLP * omegaLP);
            this.lp_b0 = omegaLP * omegaLP * normLP; this.lp_b1 = 2 * this.lp_b0; this.lp_b2 = this.lp_b0;
            this.lp_a1 = 2 * (omegaLP * omegaLP - 1) * normLP; this.lp_a2 = (1 - Math.sqrt(2) * omegaLP + omegaLP * omegaLP) * normLP;
        }

        process(sample) {
            let signal = sample;
            if (this.useHP) {
                const hp_out = this.hp_b0 * signal + this.hp_b1 * this.hp_x1 + this.hp_b2 * this.hp_x2 - this.hp_a1 * this.hp_y1 - this.hp_a2 * this.hp_y2;
                this.hp_x2 = this.hp_x1; this.hp_x1 = signal; this.hp_y2 = this.hp_y1; this.hp_y1 = hp_out;
                signal = hp_out;
            } else {
                this.hp_x1 = 0; this.hp_x2 = 0; this.hp_y1 = 0; this.hp_y2 = 0;
            }
            if (this.useLP) {
                const lp_out = this.lp_b0 * signal + this.lp_b1 * this.lp_x1 + this.lp_b2 * this.lp_x2 - this.lp_a1 * this.lp_y1 - this.lp_a2 * this.lp_y2;
                this.lp_x2 = this.lp_x1; this.lp_x1 = signal; this.lp_y2 = this.lp_y1; this.lp_y1 = lp_out;
                signal = lp_out;
            } else {
                this.lp_x1 = 0; this.lp_x2 = 0; this.lp_y1 = 0; this.lp_y2 = 0;
            }
            return signal;
        }
    }

    // Fixed 30 Hz for Resampling
    let bandpassFilter = new ButterworthBandpassFilter(lowCutoff, highCutoff, 30);
    bandpassFilter.useHP = enableHighPassToggle.checked;
    bandpassFilter.useLP = enableLowPassToggle.checked;

    function fft(data) { const n = data.length; if (n === 0) return []; const output = []; for (let i = 0; i < n; i++) { let rev = 0; for (let j = 0; j < Math.log2(n); j++) { if ((i >> j) & 1) { rev |= 1 << (Math.log2(n) - 1 - j); } } output[rev] = { re: data[i].re, im: data[i].im }; } for (let size = 2; size <= n; size *= 2) { const halfSize = size / 2; for (let i = 0; i < n; i += size) { for (let j = 0; j < halfSize; j++) { const k = i + j; const l = k + halfSize; const angle = -2 * Math.PI * j / size; const w_re = Math.cos(angle); const w_im = Math.sin(angle); const even = output[k]; const odd = output[l]; const t_re = odd.re * w_re - odd.im * w_im; const t_im = odd.re * w_im + odd.im * w_re; output[k] = { re: even.re + t_re, im: even.im + t_im }; output[l] = { re: even.re - t_re, im: even.im - t_re }; } } } return output.map(c => ({ re: c.re, im: c.im, mag: Math.sqrt(c.re * c.re + c.im * c.im) })); }
    function prepareDataForFFT(data) { return data.map(val => ({ re: val, im: 0 })); }

    async function init() {
        setupEventListeners(); updateLabelText(); initMediaPipe();
        if (!initWebGL()) { alert("WebGL is not supported."); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
            hiddenVideo.srcObject = stream;
            hiddenVideo.onloadedmetadata = () => {
                displayCanvas.width = hiddenVideo.videoWidth; displayCanvas.height = hiddenVideo.videoHeight;
                webglCanvas.width = hiddenVideo.videoWidth; webglCanvas.height = hiddenVideo.videoHeight;
                setupRoiListeners(); initTextures();
                virtualTime = performance.now();
                requestAnimationFrame(mainLoop);
            };
        } catch (err) { alert("Camera access denied or error: " + err); }
    }
    function initMediaPipe() {
        selfieSegmentation = new SelfieSegmentation({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}` });
        selfieSegmentation.setOptions({ modelSelection: 1 });
        selfieSegmentation.onResults(results => latestSegmentationMask = results.segmentationMask);
        faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
        faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        faceMesh.onResults(results => {
            latestFaceLandmarks = (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) ? results.multiFaceLandmarks[0] : null;
        });
    }
    function updateLabelText() { videoCanvasLabel.textContent = (roiMode === 'manual') ? 'Amplified Video Feed (Draw ROI Here)' : 'Live Video Feed (Dynamic Safe Zone)'; }

    function setupEventListeners() {
        alphaSlider.addEventListener('input', (e) => { alpha = parseInt(e.target.value, 10); alphaValueSpan.textContent = alpha; });

        const resetFilterAndBuffers = () => {
            lowCutoff = parseFloat(lowCutoffInput.value);
            highCutoff = parseFloat(highCutoffInput.value);
            bandpassFilter.updateCoefficients(lowCutoff, highCutoff, 30);
            signalBuffer.fill(0);
            rawDetrendedBuffer.fill(0);
            filteredBuffer.fill(0);
            isInitialized = false;
            smoothedQualityRatio = 0;
        };

        lowCutoffInput.addEventListener('change', resetFilterAndBuffers);
        highCutoffInput.addEventListener('change', resetFilterAndBuffers);

        sonifyToggle.addEventListener('change', toggleSonification);
        demoButton.addEventListener('click', toggleDemo);
        showRawSignalToggle.addEventListener('change', (e) => showRawSignal = e.target.checked);
        showAxesToggle.addEventListener('change', (e) => showAxes = e.target.checked);

        enableHighPassToggle.addEventListener('change', (e) => {
            bandpassFilter.useHP = e.target.checked;
            resetFilterAndBuffers();
        });
        enableLowPassToggle.addEventListener('change', (e) => {
            bandpassFilter.useLP = e.target.checked;
            resetFilterAndBuffers();
        });

        roiModeRadios.forEach(radio => radio.addEventListener('change', (e) => {
            roiMode = e.target.value;
            updateLabelText();
            signalBuffer.fill(0);
            isInitialized = false;
            smoothedQualityRatio = 0;
        }));
    }

    async function mainLoop(now) {
        framesThisSecond++;
        if (now - lastFpsUpdate >= 1000) {
            fpsValueSpan.textContent = framesThisSecond;
            framesThisSecond = 0;
            lastFpsUpdate = now;
        }

        let rawValue = -1;

        if (isDemoRunning) {
            const heartRateHz = 1.2;
            const t = now / 1000;
            rawValue = Math.sin(t * 2 * Math.PI * heartRateHz) * 0.05 + (Math.random() - 0.5) * 0.01;
        }
        else if (hiddenVideo.readyState >= 3) {
            if (roiMode === 'manual') { rawValue = getManualRoiSignal(); }
            else if (roiMode === 'auto' && latestFaceLandmarks) { rawValue = getAutomatedFaceSignal(); }
        }

        // --- RESAMPLING LOOP (Strict 30Hz) ---
        if (lastRawTime === 0) {
            if (rawValue !== -1) {
                lastRawTime = now;
                lastRawValue = rawValue;
                virtualTime = now;
            }
        } else if (rawValue !== -1) {
            while (virtualTime < now) {
                let t = 0;
                if ((now - lastRawTime) > 0) {
                    t = (virtualTime - lastRawTime) / (now - lastRawTime);
                }
                const interpolatedSignal = lastRawValue + t * (rawValue - lastRawValue);

                if (!isInitialized) { signalBuffer.fill(interpolatedSignal); isInitialized = true; }
                processSignal(interpolatedSignal);

                virtualTime += FIXED_TIMESTEP_MS;
            }

            if ((now - virtualTime) > 500) {
                virtualTime = now;
            }

            lastRawTime = now;
            lastRawValue = rawValue;
        }

        if (hiddenVideo.readyState >= 3 && !hiddenVideo.paused) {
            await selfieSegmentation.send({ image: hiddenVideo });
            await faceMesh.send({ image: hiddenVideo });
        }

        renderWebGL(lastAmplifiedValue, hiddenVideo);
        displayCtx.drawImage(webglCanvas, 0, 0, displayCanvas.width, displayCanvas.height);
        drawOverlays(displayCtx);

        if (isInitialized) {
            // Draw with strictly 30 FPS math
            drawTimeDomainGraph(30);
            drawFrequencyGraph(30);
        }

        requestAnimationFrame(mainLoop);
    }

    function getManualRoiSignal() {
        dynamicSafeZone = { x: 0, y: 0, width: 0, height: 0 }; boundaryPoints = {};
        if (roi.width <= 0 || roi.height <= 0) return -1;
        hiddenCanvas.width = Math.max(1, Math.round(roi.width));
        hiddenCanvas.height = Math.max(1, Math.round(roi.height));
        if (!hiddenCtx) { hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true }); }
        hiddenCtx.drawImage(hiddenVideo, roi.x, roi.y, roi.width, roi.height, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
        const frameData = hiddenCtx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height);
        let sumGreen = 0;
        for (let i = 0; i < frameData.data.length; i += 4) { sumGreen += frameData.data[i + 1]; }
        return sumGreen / (frameData.data.length / 4);
    }

    function getAutomatedFaceSignal() {
        if (!latestFaceLandmarks) {
            dynamicSafeZone = { x: 0, y: 0, width: 0, height: 0 }; boundaryPoints = {};
            return -1;
        }

        const w = hiddenVideo.videoWidth; const h = hiddenVideo.videoHeight;
        const landmarks = FOREHEAD_BOUNDARY_LANDMARKS;
        const points = { top: latestFaceLandmarks[landmarks.top], leftTemple: latestFaceLandmarks[landmarks.leftTemple], rightTemple: latestFaceLandmarks[landmarks.rightTemple], leftEyebrow: latestFaceLandmarks[landmarks.leftEyebrow], rightEyebrow: latestFaceLandmarks[landmarks.rightEyebrow] };
        if (Object.values(points).some(p => !p)) {
            dynamicSafeZone = { x: 0, y: 0, width: 0, height: 0 }; boundaryPoints = {}; return -1;
        }

        boundaryPoints = {
            top: { x: points.top.x * w, y: points.top.y * h },
            leftTemple: { x: points.leftTemple.x * w, y: points.leftTemple.y * h },
            rightTemple: { x: points.rightTemple.x * w, y: points.rightTemple.y * h },
            leftEyebrow: { x: points.leftEyebrow.x * w, y: points.leftEyebrow.y * h },
            rightEyebrow: { x: points.rightEyebrow.x * w, y: points.rightEyebrow.y * h }
        };

        const foreheadBox = {
            x: boundaryPoints.leftTemple.x,
            y: boundaryPoints.top.y,
            width: boundaryPoints.rightTemple.x - boundaryPoints.leftTemple.x,
            height: (boundaryPoints.leftEyebrow.y - boundaryPoints.top.y) * 0.6
        };

        if (foreheadBox.width <= 0 || foreheadBox.height <= 0) {
            dynamicSafeZone = { x: 0, y: 0, width: 0, height: 0 };
            return -1;
        }

        const horizontalInsetRatio = 0.2;
        const verticalInsetRatioTop = 0.15;
        const verticalInsetRatioBottom = 0.1;

        const horizontalInset = foreheadBox.width * horizontalInsetRatio;
        const verticalInsetTop = foreheadBox.height * verticalInsetRatioTop;
        const verticalInsetBottom = foreheadBox.height * verticalInsetRatioBottom;

        dynamicSafeZone = {
            x: foreheadBox.x + horizontalInset,
            y: foreheadBox.y + verticalInsetTop,
            width: foreheadBox.width - (2 * horizontalInset),
            height: foreheadBox.height - (verticalInsetTop + verticalInsetBottom)
        };

        if (dynamicSafeZone.width <= 0 || dynamicSafeZone.height <= 0) return -1;
        hiddenCanvas.width = Math.max(1, Math.round(dynamicSafeZone.width));
        hiddenCanvas.height = Math.max(1, Math.round(dynamicSafeZone.height));
        if (!hiddenCtx) { hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true }); }
        hiddenCtx.drawImage(hiddenVideo, dynamicSafeZone.x, dynamicSafeZone.y, dynamicSafeZone.width, dynamicSafeZone.height, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
        const frameData = hiddenCtx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height);
        let sumGreen = 0;
        for (let i = 0; i < frameData.data.length; i += 4) { sumGreen += frameData.data[i + 1]; }
        return sumGreen / (frameData.data.length / 4);
    }

    function drawOverlays(ctx) {
        if (roiMode === 'manual') {
            if (isDrawing && currentDraw) { ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.strokeRect(startCoords.x, startCoords.y, currentDraw.width, currentDraw.height); ctx.setLineDash([]); }
            if (roi.width > 0 && roi.height > 0) { ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'; ctx.lineWidth = 2; ctx.strokeRect(roi.x, roi.y, roi.width, roi.height); }
        } else if (roiMode === 'auto') {
            if (boundaryPoints.top) {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
                Object.values(boundaryPoints).forEach(point => { ctx.beginPath(); ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI); ctx.fill(); });
            }
            if (dynamicSafeZone.width > 0) {
                ctx.strokeStyle = 'rgba(0, 170, 255, 0.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
                ctx.strokeRect(dynamicSafeZone.x, dynamicSafeZone.y, dynamicSafeZone.width, dynamicSafeZone.height);
                ctx.setLineDash([]);
            }
        }

        if (smoothedBpm > 1) {
            let textX = 10, textY = 10;
            if (roiMode === 'manual' && roi.width > 0) { textX = roi.x; textY = roi.y; }
            else if (roiMode === 'auto' && dynamicSafeZone.width > 0) { textX = dynamicSafeZone.x; textY = dynamicSafeZone.y - 65 < 10 ? 10 : dynamicSafeZone.y - 65; }
            const bpmText = `${Math.round(smoothedBpm)} BPM`; const fontSize = 20;
            ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
            const textMetrics = ctx.measureText(bpmText); const padding = 8;
            const rectHeight = (fontSize + padding) * 2;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(textX + padding, textY + padding, textMetrics.width + (padding * 2), rectHeight);
            ctx.fillStyle = '#00aaff'; ctx.textBaseline = 'top';
            ctx.fillText(bpmText, textX + padding * 2, textY + padding * 1.5);
            const qualityText = `Quality: ${signalMetrics.quality}`; ctx.font = `${fontSize * 0.7}px -apple-system, sans-serif`;
            ctx.fillStyle = signalMetrics.color;
            ctx.fillText(qualityText, textX + padding * 2, textY + padding * 2 + fontSize);
        }
    }

    function processSignal(currentSignal) {
        signalBuffer.shift(); signalBuffer.push(currentSignal);
        const mean = signalBuffer.reduce((a, b) => a + b, 0) / signalBuffer.length;
        const detrendedSignal = currentSignal - mean;
        rawDetrendedBuffer.shift(); rawDetrendedBuffer.push(detrendedSignal);
        const filteredSignal = bandpassFilter.process(detrendedSignal);
        filteredBuffer.shift(); filteredBuffer.push(filteredSignal);
        lastAmplifiedValue = filteredSignal * alpha;
        if (sonifyToggle.checked) { updateSonification(filteredSignal); }
        return lastAmplifiedValue;
    }

    function drawTimeDomainGraph(effectiveFs) {
        if (typeof showAxes === 'undefined') showAxes = true;

        timeCtx.clearRect(0, 0, timeDomainCanvas.width, timeDomainCanvas.height); const w = timeDomainCanvas.width; const h = timeDomainCanvas.height; const axisHeight = showAxes ? 20 : 0; const graphHeight = h - axisHeight; const allValues = showRawSignal ? filteredBuffer.concat(rawDetrendedBuffer) : filteredBuffer; const maxVal = Math.max(...allValues.map(Math.abs)) * 1.2 || 0.1; const drawWave = (buffer, color) => { timeCtx.strokeStyle = color; timeCtx.lineWidth = 2; timeCtx.beginPath(); for (let i = 0; i < bufferSize; i++) { const val = buffer[i] || 0; const x = (i / (bufferSize - 1)) * w; const y = graphHeight / 2 - (val / maxVal) * (graphHeight / 2); if (i === 0) timeCtx.moveTo(x, y); else timeCtx.lineTo(x, y); } timeCtx.stroke(); }; if (showRawSignal) drawWave(rawDetrendedBuffer, getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim()); drawWave(filteredBuffer, getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim()); if (showAxes) { const totalDuration = bufferSize / effectiveFs; timeCtx.strokeStyle = '#444'; timeCtx.lineWidth = 1; timeCtx.beginPath(); timeCtx.moveTo(0, graphHeight); timeCtx.lineTo(w, graphHeight); timeCtx.stroke(); const numTicks = 5; timeCtx.fillStyle = '#aaa'; timeCtx.font = '10px sans-serif'; timeCtx.textAlign = 'center'; for (let i = 0; i <= numTicks; i++) { const time = -(totalDuration * (1 - i / numTicks)); let xPos = (i / numTicks) * w; if (i === numTicks) xPos -= 10; if (i === 0) xPos += 15; timeCtx.fillText(time.toFixed(1) + 's', xPos, h - 5); } }
    }

    function drawFrequencyGraph(effectiveFs) {
        if (typeof showAxes === 'undefined') showAxes = true;

        const w = frequencyCanvas.width; const h = frequencyCanvas.height; const axisHeight = showAxes ? 20 : 0; const graphHeight = h - axisHeight; freqCtx.clearRect(0, 0, w, h);
        const performFFTAndDraw = (buffer) => { const windowed = new Array(bufferSize); for (let i = 0; i < bufferSize; i++) { const hann = 0.5 * (1 - Math.cos(2 * Math.PI * i / (bufferSize - 1))); windowed[i] = buffer[i] * hann; } const fftOutput = fft(prepareDataForFFT(windowed)); const numBins = fftOutput.length / 2; const mags = fftOutput.slice(1, numBins).map(bin => bin.mag); return { mags, fftOutput }; };
        const rawResult = showRawSignal ? performFFTAndDraw(rawDetrendedBuffer) : { mags: [], fftOutput: null };
        const filteredResult = performFFTAndDraw(filteredBuffer);
        const allMags = rawResult.mags.concat(filteredResult.mags);
        const maxMag = Math.max(...allMags.filter(v => isFinite(v))) || 1;
        const drawSpectrum = (mags, color) => { freqCtx.fillStyle = color; for (let i = 0; i < mags.length; i++) { const percent = mags[i] / maxMag; const barHeight = percent * graphHeight; const x = (i / mags.length) * w; const barWidth = (w / mags.length) * 0.9; freqCtx.fillRect(x, graphHeight - barHeight, barWidth, barHeight); } };
        if (showRawSignal) drawSpectrum(rawResult.mags, getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim());
        drawSpectrum(filteredResult.mags, getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim());

        const { fftOutput } = filteredResult;
        const freqResolution = effectiveFs / bufferSize;
        const numBins = fftOutput.length / 2;
        const lowBin = Math.max(1, Math.floor(lowCutoff / freqResolution));
        const highBin = Math.min(numBins - 1, Math.ceil(highCutoff / freqResolution));
        let peakMag = -Infinity; let peakIndex = -1;
        for (let i = lowBin; i <= highBin; i++) { if (fftOutput[i].mag > peakMag) { peakMag = fftOutput[i].mag; peakIndex = i; } }

        const signalPower = Math.sqrt(filteredBuffer.reduce((sum, val) => sum + val * val, 0) / bufferSize);

        if (peakIndex > 0 && signalPower > MIN_SIGNAL_POWER) {
            let noiseSum = 0, noiseCount = 0;
            for (let i = lowBin; i <= highBin; i++) { if (i !== peakIndex) { noiseSum += fftOutput[i].mag; noiseCount++; } }

            const avgNoise = noiseCount > 0 ? noiseSum / noiseCount : 1e-6;
            const instantaneousQualityRatio = peakMag / avgNoise;

            smoothedQualityRatio = (1.0 - QUALITY_SMOOTHING_FACTOR) * smoothedQualityRatio + QUALITY_SMOOTHING_FACTOR * instantaneousQualityRatio;

            if (smoothedQualityRatio > 8) { signalMetrics = { quality: 'Excellent', color: '#4caf50' }; }
            else if (smoothedQualityRatio > 4) { signalMetrics = { quality: 'Good', color: '#4caf50' }; }
            else { signalMetrics = { quality: 'Fair', color: '#ffeb3b' }; }

            const peakFreq = peakIndex * freqResolution;
            const currentBpm = peakFreq * 60;
            smoothedBpm = (smoothedBpm === 0 || Math.abs(smoothedBpm - currentBpm) > 30)
                ? currentBpm
                : 0.9 * smoothedBpm + 0.1 * currentBpm;
        } else {
            signalMetrics = { quality: 'Poor', color: '#f44336' };
            smoothedBpm *= 0.95;
            smoothedQualityRatio *= 0.95;
        }

        if (showAxes) { freqCtx.strokeStyle = '#444'; freqCtx.lineWidth = 1; freqCtx.beginPath(); freqCtx.moveTo(0, graphHeight); freqCtx.lineTo(w, graphHeight); freqCtx.stroke(); const nyquist = effectiveFs / 2; const numTicks = 5; freqCtx.fillStyle = '#aaa'; freqCtx.font = '10px sans-serif'; freqCtx.textAlign = 'center'; for (let i = 0; i <= numTicks; i++) { const freq = (i / numTicks) * nyquist; let xPos = (i / numTicks) * w; if (i === numTicks) xPos -= 15; if (i === 0) xPos += 10; freqCtx.fillText(freq.toFixed(1) + ' Hz', xPos, h - 5); } }
    }

    function setupRoiListeners() { const getCanvasCoords = (e) => { const rect = displayCanvas.getBoundingClientRect(); return { x: (e.clientX - rect.left) * (displayCanvas.width / rect.width), y: (e.clientY - rect.top) * (displayCanvas.height / rect.height) }; }; displayCanvas.addEventListener('mousedown', (e) => { if (roiMode !== 'manual') return; isDrawing = true; startCoords = getCanvasCoords(e); currentDraw = { width: 0, height: 0 }; }); displayCanvas.addEventListener('mousemove', (e) => { if (!isDrawing) return; const currentCoords = getCanvasCoords(e); currentDraw.width = currentCoords.x - startCoords.x; currentDraw.height = currentCoords.y - startCoords.y; }); displayCanvas.addEventListener('mouseup', (e) => { if (!isDrawing) return; isDrawing = false; roi.x = Math.min(startCoords.x, startCoords.x + currentDraw.width); roi.y = Math.min(startCoords.y, startCoords.y + currentDraw.height); roi.width = Math.abs(currentDraw.width); roi.height = Math.abs(currentDraw.height); if (roi.width < 20 || roi.height < 20) { roi = { x: displayCanvas.width * 0.35, y: displayCanvas.height * 0.1, width: displayCanvas.width * 0.3, height: displayCanvas.height * 0.2 }; } if (!isDemoRunning) { signalBuffer.fill(0); isInitialized = false; smoothedQualityRatio = 0; } currentDraw = null; }); }

    function toggleSonification() {
        if (sonifyToggle.checked) {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                oscillator = audioContext.createOscillator();
                gainNode = audioContext.createGain();
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.start();
            }
            if (gainNode) gainNode.gain.setTargetAtTime(0.3, audioContext.currentTime, 0.1);
        } else {
            if (gainNode) {
                gainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.1);
            }
        }
    }

    function updateSonification(signal) { if (audioContext && oscillator && gainNode && sonifyToggle.checked) { const baseFreq = 200; const newFreq = baseFreq + (signal * alpha * 2); oscillator.frequency.setTargetAtTime(Math.max(50, Math.min(800, newFreq)), audioContext.currentTime, 0.02); } }

    function toggleDemo() { isDemoRunning = !isDemoRunning; if (isDemoRunning) { demoButton.textContent = "Stop Demo"; hiddenVideo.pause(); signalBuffer.fill(0); filteredBuffer.fill(0); isInitialized = true; runDemoAnimation(); } else { demoButton.textContent = "Play Demo"; clearInterval(demoInterval); hiddenVideo.play(); alphaSlider.value = alpha; alphaValueSpan.textContent = Math.round(alpha); signalBuffer.fill(0); isInitialized = false; smoothedBpm = 0; smoothedQualityRatio = 0; } }

    function processDemoFrame(now) { const heartRateHz = 1.2; const t = now / 1000; const syntheticSignal = Math.sin(t * 2 * Math.PI * heartRateHz) * 0.05 + (Math.random() - 0.5) * 0.01; processSignal(syntheticSignal); return lastAmplifiedValue; }

    function runDemoAnimation() { let t = 0; demoInterval = setInterval(() => { t += 0.1; const newAlpha = 150 + Math.sin(t * 0.5) * 100; alphaSlider.value = newAlpha; alpha = newAlpha; alphaValueSpan.textContent = Math.round(newAlpha); }, 200); }

    function initWebGL() { gl = webglCanvas.getContext('webgl', { preserveDrawingBuffer: true }); if (!gl) { return false; } const vsSource = `attribute vec4 a_pos; attribute vec2 a_tex; varying vec2 v_tex; void main() { gl_Position = a_pos; v_tex = a_tex; }`; const fsSource = `precision mediump float; uniform sampler2D u_videoTexture; uniform sampler2D u_maskTexture; uniform float u_ampVal; uniform vec4 u_roi; uniform bool u_highlightSkin; varying vec2 v_tex; void main() { vec4 videoColor = texture2D(u_videoTexture, v_tex); float maskVal = texture2D(u_maskTexture, v_tex).r; vec3 finalColor = videoColor.rgb; if (u_highlightSkin && maskVal > 0.5) { vec3 highlightColor = vec3(0.0, 0.8, 0.2); finalColor = mix(finalColor, highlightColor, 0.3); } bool in_roi = v_tex.x > u_roi.x && v_tex.x < u_roi.z && v_tex.y > u_roi.y && v_tex.y < u_roi.w; if (in_roi) { finalColor.g += u_ampVal; } gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0); }`; shaderProgram = createShaderProgram(gl, vsSource, fsSource); if (!shaderProgram) return false; positionBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]), gl.STATIC_DRAW); textureCoordBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0]), gl.STATIC_DRAW); return true; }

    function createShaderProgram(gl, vs, fs) { const vShader = loadShader(gl, gl.VERTEX_SHADER, vs); const fShader = loadShader(gl, gl.FRAGMENT_SHADER, fs); const prog = gl.createProgram(); gl.attachShader(prog, vShader); gl.attachShader(prog, fShader); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null; return prog; }

    function loadShader(gl, type, source) { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; } return shader; }

    function createAndSetupTexture(gl) { const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return texture; }

    function initTextures() { videoTexture = createAndSetupTexture(gl); maskTexture = createAndSetupTexture(gl); gl.bindTexture(gl.TEXTURE_2D, maskTexture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255])); }

    function renderWebGL(ampValue, source) {
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(shaderProgram);
        gl.uniform1f(gl.getUniformLocation(shaderProgram, "u_ampVal"), ampValue / 255.0);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, "u_highlightSkin"), highlightSkinToggle.checked);
        let normalizedRoi = { x_start: 0, y_start: 0, x_end: 0, y_end: 0 };
        let currentRoi = (roiMode === 'manual') ? roi : dynamicSafeZone;
        if (currentRoi && currentRoi.width > 0) {
            normalizedRoi = {
                x_start: currentRoi.x / gl.canvas.width,
                y_start: currentRoi.y / gl.canvas.height,
                x_end: (currentRoi.x + currentRoi.width) / gl.canvas.width,
                y_end: (currentRoi.y + currentRoi.height) / gl.canvas.height
            };
        }
        gl.uniform4f(gl.getUniformLocation(shaderProgram, "u_roi"), normalizedRoi.x_start, normalizedRoi.y_start, normalizedRoi.x_end, normalizedRoi.y_end);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, videoTexture);
        if (source && source.readyState >= 3) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        }
        gl.uniform1i(gl.getUniformLocation(shaderProgram, "u_videoTexture"), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, maskTexture);
        if (latestSegmentationMask) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, latestSegmentationMask);
        }
        gl.uniform1i(gl.getUniformLocation(shaderProgram, "u_maskTexture"), 1);
        gl.enableVertexAttribArray(gl.getAttribLocation(shaderProgram, "a_pos"));
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(gl.getAttribLocation(shaderProgram, "a_pos"), 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(gl.getAttribLocation(shaderProgram, "a_tex"));
        gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
        gl.vertexAttribPointer(gl.getAttribLocation(shaderProgram, "a_tex"), 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    init();
});