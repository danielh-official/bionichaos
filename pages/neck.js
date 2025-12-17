// Data for angles and weights (JSON-like structure)
const angleData = [
    { angle: 0, weight: "4-5" },
    { angle: 15, weight: 12 },
    { angle: 30, weight: 20 },
    { angle: 45, weight: 25 },
    { angle: 60, weight: 27 }
];

// Canvas setup
const canvas = document.getElementById('neckCanvas');
const ctx = canvas.getContext('2d');
let currentAngle = 0;

// Controls
const angleSlider = document.getElementById('angleSlider');
const currentAngleSpan = document.getElementById('currentAngle');
const currentWeightSpan = document.getElementById('currentWeight');
const resetButton = document.getElementById('resetButton');
const playDemoButton = document.getElementById('playDemoButton');
const sonificationToggle = document.getElementById('sonificationToggle');

// Sonification
let audioContext;
let oscillator;
let gainNode;
let isSonificationOn = false;

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        oscillator = audioContext.createOscillator();
        gainNode = audioContext.createGain();

        oscillator.type = 'sine'; // Sine wave for a smooth tone
        oscillator.frequency.value = 0; // Start silent
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        gainNode.gain.value = 0; // Start silent

        oscillator.start();
    }
}

function updateSonification(angle) {
    if (!isSonificationOn || !audioContext) {
        if (gainNode) gainNode.gain.value = 0; // Ensure silent if off
        return;
    }

    // Map angle to frequency (e.g., 0-60 degrees -> 100-800 Hz)
    const minFreq = 100;
    const maxFreq = 800;
    const freq = minFreq + (angle / 60) * (maxFreq - minFreq);
    oscillator.frequency.value = freq;

    // Map angle to volume (e.g., 0-60 degrees -> 0.0-0.5 volume)
    const minGain = 0;
    const maxGain = 0.5;
    const gain = minGain + (angle / 60) * (maxGain - minGain);
    gainNode.gain.value = gain;
}

sonificationToggle.addEventListener('change', () => {
    isSonificationOn = sonificationToggle.checked;
    if (isSonificationOn) {
        initAudio();
        updateSonification(currentAngle);
    } else {
        if (gainNode) gainNode.gain.value = 0; // Turn off sound immediately
    }
});

// Resize Canvas dynamically and support high-DPI devices
function resizeCanvas() {
    // Set canvas CSS size to 90% of parent container or a max width
    const container = document.getElementById('simulation-container');
    const containerWidth = container.clientWidth - 40; // Account for padding
    const cssWidth = Math.min(containerWidth, 600); // Max width for clarity (CSS pixels)
    const cssHeight = Math.max(220, Math.round(window.innerHeight * var_canvas_height_ratio)); // Ensure a minimum height

    // Apply CSS size
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';

    // Scale internal pixel buffer for devicePixelRatio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);

    // Scale drawing operations so code can keep using CSS pixel coordinates
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Redraw
    drawPerson(currentAngle);
}

// Variable for canvas height ratio, accessed by JS
let var_canvas_height_ratio = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--canvas-height-ratio'));

window.addEventListener('resize', resizeCanvas);
// Initial call to set canvas size
setTimeout(resizeCanvas, 0); // Delay slightly to ensure computed styles are ready

// Drawing Functions
function drawPerson(angle) {
    // Use CSS coordinates (after ctx.setTransform) for layout so that
    // drawing works consistently across DPR values.
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;

    // Get current time for animation effects
    const now = performance.now();

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const personWidth = cssWidth * 0.4; // Relative width of person
    const personHeight = cssHeight * 0.8; // Relative height
    const xOffset = (cssWidth - personWidth) / 2;
    const yOffset = cssHeight - personHeight;

    // Calculate stress level (0-1) based on angle
    const stressLevel = angle / 60;

    // NEW: Slouch factor for posture change
    const slouchAngle = (stressLevel * 15) * (Math.PI / 180); // Max 15-degree slouch

    // Draw Body with dynamic posture
    drawBody(xOffset, yOffset, personWidth, personHeight, stressLevel, slouchAngle);

    // Head and Neck base
    const headCenterX = xOffset + personWidth / 2;
    const headCenterY = yOffset + personHeight * 0.3;
    const neckBaseX = headCenterX;
    const neckBaseY = yOffset + personHeight * 0.3; // Base of the neck

    // Calculate hand position for arm
    const phoneLocalX = Math.cos((90 + angle) * Math.PI / 180) * personWidth * 0.5 - 18;
    const phoneLocalY = - (personWidth * 0.15 * 0.3) + Math.sin((90 + angle) * Math.PI / 180) * personWidth * 0.5 + 8;
    const handLocalX = phoneLocalX + 18; // center of phone
    const handLocalY = phoneLocalY + 56; // bottom of phone
    const handWorldX = neckBaseX + handLocalX * Math.cos(angle * Math.PI / 180) - handLocalY * Math.sin(angle * Math.PI / 180);
    const handWorldY = neckBaseY + handLocalX * Math.sin(angle * Math.PI / 180) + handLocalY * Math.cos(angle * Math.PI / 180);

    // Draw arm
    ctx.strokeStyle = '#FFD0A8'; // skin color
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(neckBaseX, neckBaseY + 10); // start from below neck
    ctx.lineTo(handWorldX, handWorldY);
    ctx.stroke();

    // Draw hand
    ctx.fillStyle = '#FFD0A8';
    ctx.beginPath();
    ctx.arc(handWorldX, handWorldY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Save context state before rotation
    ctx.save();

    // Translate to the rotation point (neck base)
    ctx.translate(neckBaseX, neckBaseY);

    // Rotate by the specified angle (convert degrees to radians, 0 degrees is upright)
    // The angle in the simulation is the tilt *down* from vertical, so we apply negative angle
    ctx.rotate(angle * Math.PI / 180);

    // Draw head and related elements
    const headRadius = personWidth * 0.15;
    drawHead(headRadius, angle, stressLevel, personWidth, now);

    // Restore context to original state (undo rotation)
    ctx.restore();

    // Draw spine as a single line with color/thickness based on stress
    const spineStartY = neckBaseY;
    const spineEndY = neckBaseY + personHeight * 0.6;
    ctx.save();
    ctx.translate(neckBaseX, 0);
    ctx.rotate(slouchAngle * 0.5); // Apply half of the slouch to the spine's curve

    const spineGrad = ctx.createLinearGradient(0, spineStartY, 0, spineEndY);
    spineGrad.addColorStop(0, `rgb(${Math.floor(120 + 135 * stressLevel)}, ${Math.floor(120 * (1 - stressLevel))}, 40)`);
    spineGrad.addColorStop(1, `rgb(${Math.floor(120 + 135 * stressLevel)}, ${Math.floor(120 * (1 - stressLevel))}, 40)`);

    ctx.strokeStyle = spineGrad;
    ctx.lineWidth = 8 + stressLevel * 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, spineStartY);
    ctx.lineTo(0, spineEndY);
    ctx.stroke();

    ctx.restore();

    // Draw visual legend in top-right corner
    drawLegend(angle, stressLevel, cssWidth, cssHeight);
}

function drawLegend(angle, stressLevel, cssWidth = canvas.width, cssHeight = canvas.height) {
    const legendX = cssWidth - 150;
    const legendY = 20;

    // Legend background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(legendX - 10, legendY - 10, 140, 100);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX - 10, legendY - 10, 140, 100);

    // Legend title
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Stress Level', legendX, legendY + 10);

    // Stress bar
    const barWidth = 100;
    const barHeight = 10;

    // Background bar with gradient
    ctx.fillStyle = '#f3f3f3';
    roundRect(ctx, legendX, legendY + 20, barWidth, barHeight, 4);
    ctx.fill();

    // Stress gradient bar
    const g = ctx.createLinearGradient(legendX, 0, legendX + barWidth, 0);
    g.addColorStop(0, '#2ecc71');
    g.addColorStop(1, '#e74c3c');
    const stressBarWidth = barWidth * stressLevel;
    ctx.fillStyle = g;
    roundRect(ctx, legendX, legendY + 20, stressBarWidth, barHeight, 4);
    ctx.fill();

    // Stress level text
    ctx.fillStyle = '#333';
    ctx.font = '10px Arial';
    ctx.fillText(`${Math.round(stressLevel * 100)}%`, legendX, legendY + 45);

    // Color coding explanation
    ctx.fillText('Green: Low stress', legendX, legendY + 60);
    ctx.fillText('Red: High stress', legendX, legendY + 75);
}

// Helper Functions for Modular Drawing
function drawBody(xOffset, yOffset, personWidth, personHeight, stressLevel, slouchAngle) {
    ctx.save();

    // Body with slouching effect
    const bodyX = xOffset + personWidth * 0.2;
    const bodyY = yOffset + personHeight * 0.3;
    const bodyWidth = personWidth * 0.6;
    const bodyHeight = personHeight * 0.7;

    // Shoulders tilt forward with stress
    ctx.translate(bodyX + bodyWidth / 2, bodyY);
    ctx.rotate(slouchAngle * 0.3);
    ctx.translate(-bodyWidth / 2, 0);

    // Shirt - light blue with slight gradient
    const shirtGrad = ctx.createLinearGradient(0, 0, 0, bodyHeight * 0.6);
    shirtGrad.addColorStop(0, '#B8D8E6');
    shirtGrad.addColorStop(1, '#ADD8E6');
    ctx.fillStyle = shirtGrad;
    ctx.fillRect(0, 0, bodyWidth, bodyHeight * 0.6);

    ctx.restore();

    // Pants - static, unaffected by slouch
    ctx.fillStyle = '#808080';
    ctx.fillRect(xOffset + personWidth * 0.25, yOffset + personHeight * 0.65, personWidth * 0.5, personHeight * 0.35);
}

// Helper function to draw the head with all details
function drawHead(headRadius, angle, stressLevel, personWidth, now) {
    // Draw head with shading
    const headGrad = ctx.createRadialGradient(-headRadius * 0.3, -headRadius * 1.1, headRadius * 0.2, 0, -headRadius, headRadius * 1.2);
    headGrad.addColorStop(0, '#FFEFD6');
    headGrad.addColorStop(0.6, '#FFD0A8');
    headGrad.addColorStop(1, '#E0A982');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    // more natural oval head
    ctx.ellipse(0, -headRadius, headRadius * 1.05, headRadius * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // soft rim shadow for depth
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.ellipse(0, -headRadius + headRadius * 0.15, headRadius * 1.02, headRadius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw neck top (relative to rotated context) with stress coloring
    const neckStressColor = `rgb(${Math.floor(255 * stressLevel)}, ${Math.floor(200 * (1 - stressLevel))}, 0)`;
    ctx.fillStyle = neckStressColor;
    ctx.fillRect(-headRadius * 0.38, 0, headRadius * 0.76, headRadius * 0.55);

    // Draw hair (simple shaded cap)
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.ellipse(0, -headRadius - headRadius * 0.05, headRadius * 1.12, headRadius * 0.65, 0, Math.PI, 2 * Math.PI);
    ctx.fill();
    // hair highlight
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.ellipse(-headRadius * 0.25, -headRadius - headRadius * 0.2, headRadius * 0.45, headRadius * 0.18, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Prepare phone position (so facial features can aim at it)
    const phoneW = 36;
    const phoneH = 56;
    const phoneX = Math.cos((90 + angle) * Math.PI / 180) * personWidth * 0.5 - 18;
    const phoneY = -headRadius * 0.3 + Math.sin((90 + angle) * Math.PI / 180) * personWidth * 0.5 + 8;

    // Draw eye (relative to rotated context), aim pupil toward phone (eye on left side)
    ctx.fillStyle = 'black';
    const eyeX = -headRadius * 0.4; // Move eye to left side
    const eyeY = -headRadius * 0.3;
    const pupilRadius = headRadius * 0.08;
    // Compute vector from eye to phone and limit pupil offset so it stays inside the iris
    const dx = phoneX - eyeX;
    const dy = phoneY - eyeY;
    const dist = Math.hypot(dx, dy) || 1;
    const maxOffset = headRadius * 0.08; // how far pupil can move from eye center
    const offsetScale = Math.min(maxOffset, dist * 0.12) / dist;
    const pupilX = eyeX + dx * offsetScale;
    const pupilY = eyeY + dy * offsetScale;
    ctx.beginPath();
    ctx.arc(pupilX, pupilY, pupilRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw smartphone (rotated 45 degrees)
    ctx.save();
    ctx.translate(phoneX + phoneW / 2, phoneY + phoneH / 2);
    ctx.rotate(-Math.PI / 4); // -45 degrees
    ctx.translate(-phoneW / 2, -phoneH / 2);

    // phone shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundRect(ctx, 4, 6, phoneW, phoneH, 6);
    ctx.fill();

    // phone body
    const phoneGrad = ctx.createLinearGradient(0, 0, phoneW, phoneH);
    phoneGrad.addColorStop(0, '#3b3b3b');
    phoneGrad.addColorStop(1, '#1f1f1f');
    ctx.fillStyle = phoneGrad;
    roundRect(ctx, 0, 0, phoneW, phoneH, 6);
    ctx.fill();

    // screen
    ctx.fillStyle = '#A8D9FF';
    roundRect(ctx, 4, 8, phoneW - 8, phoneH - 16, 4);
    ctx.fill();

    ctx.restore();

    // Draw weight icon (kettlebell-like) (relative to rotated head, but positioned as if resting on neck)
    const weightValue = getWeightForAngle(angle);
    const weightText = typeof weightValue === 'number' ? `${weightValue} kg` : weightValue;

    // Dynamic weight icon size and color based on load
    let baseWeightIconSize = 40;
    let weightIconSize = baseWeightIconSize + (stressLevel * 20); // Grows with stress

    // Color changes from gray to red as stress increases
    const weightR = Math.floor(51 + (stressLevel * 204)); // 51 to 255
    const weightG = Math.floor(51 * (1 - stressLevel)); // 51 to 0
    const weightB = Math.floor(51 * (1 - stressLevel)); // 51 to 0
    ctx.fillStyle = `rgb(${weightR}, ${weightG}, ${weightB})`;

    // Draw kettlebell-ish weight with shadow and highlight
    ctx.save();
    ctx.translate(0, -headRadius - weightIconSize / 2 - 10);
    // main body
    ctx.fillStyle = `rgb(${weightR}, ${weightG}, ${weightB})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, weightIconSize / 2, weightIconSize / 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // handle
    ctx.lineWidth = Math.max(3, weightIconSize * 0.1);
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.arc(0, -weightIconSize * 0.45, weightIconSize * 0.42, Math.PI * 0.15, Math.PI * 0.85, false);
    ctx.stroke();
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(-weightIconSize * 0.18, -weightIconSize * 0.06, weightIconSize * 0.18, weightIconSize * 0.28, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw weight text on top of icon
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(weightText, 0, -headRadius - weightIconSize / 2 - 10);
}

function drawMuscles(xOffset, yOffset, personWidth, personHeight, stressLevel, slouchAngle) {
    // Draw trapezius muscles that stretch and change color with stress
    const shoulderY = yOffset + personHeight * 0.32;
    const neckX = xOffset + personWidth / 2;

    // Left trapezius
    const leftShoulderX = xOffset + personWidth * 0.15;
    const rightShoulderX = xOffset + personWidth * 0.85;

    // Muscle stress color (blue relaxed -> red stressed)
    const muscleR = Math.floor(100 + (155 * stressLevel));
    const muscleG = Math.floor(150 * (1 - stressLevel));
    const muscleB = Math.floor(200 * (1 - stressLevel));
    const muscleAlpha = 0.4 + (stressLevel * 0.4);

    ctx.fillStyle = `rgba(${muscleR}, ${muscleG}, ${muscleB}, ${muscleAlpha})`;

    // Left trapezius muscle
    ctx.beginPath();
    ctx.moveTo(neckX, shoulderY);
    ctx.quadraticCurveTo(leftShoulderX + personWidth * 0.1, shoulderY + personHeight * 0.05,
        leftShoulderX, shoulderY + personHeight * 0.1);
    ctx.lineTo(leftShoulderX + personWidth * 0.05, shoulderY + personHeight * 0.2);
    ctx.quadraticCurveTo(neckX - personWidth * 0.05, shoulderY + personHeight * 0.15, neckX, shoulderY);
    ctx.fill();

    // Right trapezius muscle
    ctx.beginPath();
    ctx.moveTo(neckX, shoulderY);
    ctx.quadraticCurveTo(rightShoulderX - personWidth * 0.1, shoulderY + personHeight * 0.05,
        rightShoulderX, shoulderY + personHeight * 0.1);
    ctx.lineTo(rightShoulderX - personWidth * 0.05, shoulderY + personHeight * 0.2);
    ctx.quadraticCurveTo(neckX + personWidth * 0.05, shoulderY + personHeight * 0.15, neckX, shoulderY);
    ctx.fill();
}

// Helper: draw rounded rectangle path (does not fill/stroke by itself)
function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

// Helper to get weight from data
function getWeightForAngle(angle) {
    // Find the closest predefined angle less than or equal to the current angle
    let closestData = angleData[0];
    for (let i = 0; i < angleData.length; i++) {
        if (angle >= angleData[i].angle) {
            closestData = angleData[i];
        } else {
            break;
        }
    }
    return closestData.weight;
}

// Update display based on slider
function updateSimulation(angle) {
    currentAngle = angle;
    angleSlider.value = angle;
    currentAngleSpan.textContent = angle;
    currentWeightSpan.textContent = getWeightForAngle(angle);
    drawPerson(angle);
    updateSonification(angle);
}

// Smooth transition function for manual changes
let transitionFrame;
let targetAngle = 0;
let isTransitioning = false;

function smoothTransition() {
    const speed = 1.5; // Degrees per frame for manual transitions
    const tolerance = 0.1;

    if (Math.abs(currentAngle - targetAngle) > tolerance && !demoRunning) {
        if (currentAngle < targetAngle) {
            currentAngle = Math.min(currentAngle + speed, targetAngle);
        } else {
            currentAngle = Math.max(currentAngle - speed, targetAngle);
        }
        updateSimulation(Math.round(currentAngle * 10) / 10); // Round to 1 decimal
        transitionFrame = requestAnimationFrame(smoothTransition);
    } else {
        isTransitioning = false;
        if (!demoRunning) {
            currentAngle = targetAngle;
            updateSimulation(currentAngle);
        }
    }
}

// Event Listeners
angleSlider.addEventListener('input', (event) => {
    if (!demoRunning) {
        targetAngle = parseInt(event.target.value);
        if (!isTransitioning) {
            isTransitioning = true;
            transitionFrame = requestAnimationFrame(smoothTransition);
        }
    }
});

// For immediate response during dragging (optional - can be removed if too sensitive)
angleSlider.addEventListener('change', (event) => {
    if (!demoRunning) {
        targetAngle = parseInt(event.target.value);
        currentAngle = targetAngle;
        updateSimulation(currentAngle);
        if (transitionFrame) {
            cancelAnimationFrame(transitionFrame);
            isTransitioning = false;
        }
    }
});

resetButton.addEventListener('click', () => {
    if (!demoRunning) {
        targetAngle = 0;
        if (!isTransitioning) {
            isTransitioning = true;
            transitionFrame = requestAnimationFrame(smoothTransition);
        }
    } else {
        // If demo is running, stop it and reset
        demoRunning = false;
        playDemoButton.textContent = 'Play Demo';
        if (demoAnimationFrame) {
            cancelAnimationFrame(demoAnimationFrame);
        }
        updateSimulation(0);
    }
});

let demoInterval;
let demoAngleIndex = 0;
let demoDirection = 1; // 1 for increasing, -1 for decreasing
let demoRunning = false;
let demoTargetAngle = 0;
let demoCurrentAngle = 0;
let demoAnimationFrame;

function smoothDemo() {
    const speed = 0.5; // Degrees per frame
    const tolerance = 0.1;

    // Smooth transition to target angle
    if (Math.abs(demoCurrentAngle - demoTargetAngle) > tolerance) {
        if (demoCurrentAngle < demoTargetAngle) {
            demoCurrentAngle = Math.min(demoCurrentAngle + speed, demoTargetAngle);
        } else {
            demoCurrentAngle = Math.max(demoCurrentAngle - speed, demoTargetAngle);
        }
        updateSimulation(Math.round(demoCurrentAngle));
        demoAnimationFrame = requestAnimationFrame(smoothDemo);
    } else {
        // Reached target, wait before next transition
        setTimeout(() => {
            if (demoRunning) {
                setNextDemoTarget();
                demoAnimationFrame = requestAnimationFrame(smoothDemo);
            }
        }, 800); // Pause at each target for 800ms
    }
}

function setNextDemoTarget() {
    if (demoDirection === 1) {
        demoAngleIndex++;
        if (demoAngleIndex >= angleData.length) {
            demoAngleIndex = angleData.length - 1;
            demoDirection = -1; // Start decreasing
        }
    } else {
        demoAngleIndex--;
        if (demoAngleIndex < 0) {
            demoAngleIndex = 0;
            demoDirection = 1; // Start increasing again
        }
    }
    demoTargetAngle = angleData[demoAngleIndex].angle;
}

playDemoButton.addEventListener('click', () => {
    if (demoRunning) {
        demoRunning = false;
        playDemoButton.textContent = 'Play Demo';
        if (demoAnimationFrame) {
            cancelAnimationFrame(demoAnimationFrame);
        }
        return;
    }

    playDemoButton.textContent = 'Stop Demo';
    demoRunning = true;
    demoAngleIndex = 0;
    demoDirection = 1;
    demoCurrentAngle = currentAngle; // Start from current position
    demoTargetAngle = angleData[0].angle;

    demoAnimationFrame = requestAnimationFrame(smoothDemo);
});

// Initial draw
updateSimulation(0);