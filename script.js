// Global Variables for Standard Timer
let startTime = null;
let elapsedMilliseconds = 0;
let timer = null;
let pauseTimer = null;
let pausedMilliseconds = 0;
let isPaused = false;
let completedSessions = 0;
let sessionData = JSON.parse(localStorage.getItem("sessionData")) || [];

// Global Variables for Custom Timer
let customStartTime = null;
let customTotalTime = 0;
let customElapsedTime = 0;
let customTimer = null;
let customIsPaused = false;
let customIsRunning = false;

// DOM Elements - Standard Timer
const startButton = document.getElementById("start");
const pauseButton = document.getElementById("pause");
const stopButton = document.getElementById("stop");
const minutesSpan = document.getElementById("minutes");
const secondsSpan = document.getElementById("seconds");
const millisecondsSpan = document.getElementById("milliseconds");
const messageDiv = document.getElementById("message");

// DOM Elements - Custom Timer
const customHoursInput = document.getElementById("custom-hours");
const customMinutesInput = document.getElementById("custom-minutes");
const customSecondsInput = document.getElementById("custom-seconds");
const customStartButton = document.getElementById("custom-start");
const customPauseButton = document.getElementById("custom-pause");
const customResetButton = document.getElementById("custom-reset");
const customTimerMinutes = document.getElementById("custom-timer-minutes");
const customTimerSeconds = document.getElementById("custom-timer-seconds");
const customMessageDiv = document.getElementById("custom-message");
const presetButtons = document.querySelectorAll(".preset-btn");

// DOM Elements - Common
const alarmSound = document.getElementById("alarm-sound");
const fullscreenToggle = document.getElementById("fullscreen-toggle");
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");

// DOM Elements - Fullscreen & Celebration
const fullscreenOverlay = document.getElementById("fullscreen-overlay");
const exitFullscreenButton = document.getElementById("exit-fullscreen");
const fsMinutes = document.getElementById("fs-minutes");
const fsSeconds = document.getElementById("fs-seconds");
const fsStatus = document.getElementById("fs-status");
const celebration = document.getElementById("celebration");

// DOM Elements - Alarm
const alarmSoundHigh = document.getElementById("alarm-sound-high");
const alarmTypeSelect = document.getElementById("alarm-type");
const alarmVolumeSlider = document.getElementById("alarm-volume");

// DOM Elements - Custom Alarm
const customAlarmTypeSelect = document.getElementById("custom-alarm-type");
const customAlarmVolumeSlider = document.getElementById("custom-alarm-volume");

// Initialize App
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
    requestNotificationPermission();
    setupAndroidAudioUnlock();
    setupTouchFriendlySliders();
});

// ── Android Audio Context Unlock ──────────────────────────
// Android Chrome requires a user gesture to unlock AudioContext/media playback.
// We pre-unlock on the first touch anywhere on the page.
function setupAndroidAudioUnlock() {
    let unlocked = false;
    function unlockAudio() {
        if (unlocked) return;
        unlocked = true;
        // Create a silent AudioContext to unlock audio on Android
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();
                const buf = ctx.createBuffer(1, 1, 22050);
                const src = ctx.createBufferSource();
                src.buffer = buf;
                src.connect(ctx.destination);
                src.start(0);
                setTimeout(() => ctx.close(), 500);
            }
        } catch(e) {}
        // Also attempt to load and briefly play/pause HTML audio elements
        [alarmSoundHigh, alarmSound].forEach(el => {
            if (!el) return;
            el.volume = 0;
            el.play().then(() => { el.pause(); el.currentTime = 0; el.volume = 0.5; }).catch(() => {});
        });
        document.removeEventListener('touchstart', unlockAudio, true);
        document.removeEventListener('touchend', unlockAudio, true);
        document.removeEventListener('click', unlockAudio, true);
    }
    document.addEventListener('touchstart', unlockAudio, { passive: true, capture: true });
    document.addEventListener('touchend',   unlockAudio, { passive: true, capture: true });
    document.addEventListener('click',      unlockAudio, { capture: true });
}

// ── Touch-friendly range sliders ─────────────────────────
// Make volume sliders respond naturally to touch drag on Android
function setupTouchFriendlySliders() {
    [alarmVolumeSlider, customAlarmVolumeSlider].forEach(slider => {
        if (!slider) return;
        slider.addEventListener('touchstart', () => {}, { passive: true });
        slider.addEventListener('touchmove', (e) => {
            // Allow the default slider drag; just prevent page scroll
            e.stopPropagation();
        }, { passive: true });
    });
}

function initializeApp() {
    loadSavedState();
    loadSavedVolume();
    setupEventListeners();
    updateCustomTimerDisplay();
    updateCustomTimerControlsState();
}

// Request notification permission
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// Show browser notification
function showNotification(title, message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body: message,
            icon: 'favicon.png',
            badge: 'favicon.png'
        });

        setTimeout(() => notification.close(), 5000);
    }
}

// Load Saved State
function loadSavedState() {
    // Always start fresh - don't load previous state
    elapsedMilliseconds = 0;
    updateTimerDisplay();
    // Clear any saved state
    localStorage.removeItem("pomodoroState");
}

function loadSavedVolume() {
    const savedVolume = localStorage.getItem("alarmVolume");
    const volume = savedVolume !== null ? parseFloat(savedVolume) : 0.5;
    alarmVolumeSlider.value = volume;
    applyVolume(volume);

    const savedCustomVolume = localStorage.getItem("customAlarmVolume");
    const customVolume = savedCustomVolume !== null ? parseFloat(savedCustomVolume) : 0.5;
    if (customAlarmVolumeSlider) {
        customAlarmVolumeSlider.value = customVolume;
        applyCustomVolume(customVolume);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    // Fullscreen toggle
    fullscreenToggle.addEventListener("click", toggleFullscreen);
    exitFullscreenButton.addEventListener("click", exitFullscreen);

    // Standard timer controls
    startButton.addEventListener("click", startTimer);
    pauseButton.addEventListener("click", pauseOrResumeTimer);
    stopButton.addEventListener("click", stopTimer);

    // Custom timer controls
    customStartButton.addEventListener("click", startCustomTimer);
    customPauseButton.addEventListener("click", pauseOrResumeCustomTimer);
    customResetButton.addEventListener("click", resetCustomTimer);

    // Preset buttons
    presetButtons.forEach(button => {
        button.addEventListener('click', () => setPresetTime(parseInt(button.dataset.time)));
    });

    // Input changes
    [customHoursInput, customMinutesInput, customSecondsInput].forEach(input => {
        input.addEventListener('change', updateCustomTimerFromInputs);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Volume slider
    alarmVolumeSlider.addEventListener('input', () => {
        const volume = parseFloat(alarmVolumeSlider.value);
        applyVolume(volume);
        localStorage.setItem("alarmVolume", volume);
    });

    // Custom volume slider
    if (customAlarmVolumeSlider) {
        customAlarmVolumeSlider.addEventListener('input', () => {
            const volume = parseFloat(customAlarmVolumeSlider.value);
            applyCustomVolume(volume);
            localStorage.setItem("customAlarmVolume", volume);
        });
    }
}

// Tab Switching
function switchTab(tabName) {
    // Block only when actively running (not paused)
    const isStandardActivelyRunning = timer !== null && !isPaused;
    const isCustomActivelyRunning = customIsRunning && !customIsPaused;

    if (isStandardActivelyRunning) {
        messageDiv.textContent = "Pause the timer before switching tabs.";
        setTimeout(() => {
            if (messageDiv.textContent === "Pause the timer before switching tabs.") {
                messageDiv.textContent = "Timer running...";
            }
        }, 2000);
        return;
    }

    if (isCustomActivelyRunning) {
        customMessageDiv.textContent = "Pause the timer before switching tabs.";
        setTimeout(() => {
            if (customMessageDiv.textContent === "Pause the timer before switching tabs.") {
                customMessageDiv.textContent = "Custom timer running...";
            }
        }, 2000);
        return;
    }

    tabButtons.forEach(button => {
        button.classList.remove('disabled');
        button.classList.toggle('active', button.dataset.tab === tabName);
    });

    tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
}

function updateTabStates() {
    const isStandardActivelyRunning = timer !== null && !isPaused;
    const isCustomActivelyRunning = customIsRunning && !customIsPaused;

    tabButtons.forEach(button => {
        button.classList.remove('disabled');
        if (isStandardActivelyRunning || isCustomActivelyRunning) {
            if (button.dataset.tab !== document.querySelector('.tab-button.active').dataset.tab) {
                button.classList.add('disabled');
            }
        }
    });
}

function updateCustomTimerControlsState() {
    const isAnyTimerRunning = (timer !== null) || (customIsRunning);

    // Disable/enable input fields
    [customHoursInput, customMinutesInput, customSecondsInput].forEach(input => {
        if (isAnyTimerRunning) {
            input.classList.add('disabled');
            input.disabled = true;
        } else {
            input.classList.remove('disabled');
            input.disabled = false;
        }
    });

    // Disable/enable preset buttons
    presetButtons.forEach(button => {
        if (isAnyTimerRunning) {
            button.classList.add('disabled');
            button.disabled = true;
        } else {
            button.classList.remove('disabled');
            button.disabled = false;
        }
    });
}

// Apply volume to both alarm sounds
function applyVolume(volume) {
    if (alarmSound) alarmSound.volume = volume;
    if (alarmSoundHigh) alarmSoundHigh.volume = volume;
    // Update slider track fill
    alarmVolumeSlider.style.setProperty('--volume-pct', (volume * 100) + '%');
    // Update icon based on level
    const label = document.querySelector('label[for="alarm-volume"]');
    if (label) {
        if (volume === 0) label.textContent = '🔇';
        else if (volume < 0.4) label.textContent = '🔈';
        else if (volume < 0.75) label.textContent = '🔉';
        else label.textContent = '🔊';
    }
}

function applyCustomVolume(volume) {
    if (customAlarmVolumeSlider) {
        customAlarmVolumeSlider.style.setProperty('--volume-pct', (volume * 100) + '%');
    }
    const label = document.querySelector('label[for="custom-alarm-volume"]');
    if (label) {
        if (volume === 0) label.textContent = '🔇';
        else if (volume < 0.4) label.textContent = '🔈';
        else if (volume < 0.75) label.textContent = '🔉';
        else label.textContent = '🔊';
    }
}

// Fullscreen Mode
function toggleFullscreen() {
    fullscreenOverlay.classList.remove('hidden');
    updateFullscreenDisplay();

    // Update fullscreen display based on active tab
    const activeTab = document.querySelector('.tab-button.active').dataset.tab;
    if (activeTab === 'custom') {
        fsStatus.textContent = 'Custom Timer';
    } else {
        fsStatus.textContent = 'Focus Time';
    }

    // Try native fullscreen API on Android (works in Chrome Android)
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
    }
}

function exitFullscreen() {
    fullscreenOverlay.classList.add('hidden');
    // Exit native fullscreen if active
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

// Close fullscreen overlay if native fullscreen is exited (e.g. back button on Android)
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        fullscreenOverlay.classList.add('hidden');
    }
});
document.addEventListener('webkitfullscreenchange', () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        fullscreenOverlay.classList.add('hidden');
    }
});

function updateFullscreenDisplay() {
    const activeTab = document.querySelector('.tab-button.active').dataset.tab;

    if (activeTab === 'custom') {
        const totalSeconds = Math.max(0, Math.floor((customTotalTime - customElapsedTime) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        fsMinutes.textContent = minutes.toString().padStart(2, "0");
        fsSeconds.textContent = seconds.toString().padStart(2, "0");
    } else {
        const totalSeconds = Math.floor(elapsedMilliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        fsMinutes.textContent = minutes.toString().padStart(2, "0");
        fsSeconds.textContent = seconds.toString().padStart(2, "0");
    }
}

// Keyboard Shortcuts
function handleKeyboardShortcuts(e) {
    if (e.target.tagName === 'INPUT') return;

    // Allow Escape to skip rest modal
    if (e.key === 'Escape') {
        if (!restOverlay.classList.contains('hidden')) {
            endRestTimer(false);
            return;
        }
        if (!fullscreenOverlay.classList.contains('hidden')) {
            exitFullscreen();
            return;
        }
    }

    switch (e.key.toLowerCase()) {
        case ' ':
            e.preventDefault();
            // Space skips rest modal if open
            if (!restOverlay.classList.contains('hidden')) {
                endRestTimer(false);
                return;
            }
            const activeTab = document.querySelector('.tab-button.active').dataset.tab;
            if (activeTab === 'custom') {
                if (!customIsRunning) {
                    startCustomTimer();
                } else {
                    pauseOrResumeCustomTimer();
                }
            } else {
                if (!timer && !isPaused) {
                    startTimer();
                } else {
                    pauseOrResumeTimer();
                }
            }
            break;
        case 'f':
            if (!fullscreenOverlay.classList.contains('hidden')) {
                exitFullscreen();
            } else {
                toggleFullscreen();
            }
            break;
    }
}

// Standard Timer Functions
function startTimer() {
    // Always a fresh start — resume is handled by pauseOrResumeTimer
    startTime = performance.now();
    elapsedMilliseconds = 0;
    isPaused = false;

    startButton.disabled = true;
    pauseButton.disabled = false;
    stopButton.disabled = false;
    messageDiv.textContent = "Timer running...";

    timer = requestAnimationFrame(updateTimer);
    updateTabStates();
    updateCustomTimerControlsState();
}

function updateTimer() {
    if (isPaused) return;
    const currentTime = performance.now();
    elapsedMilliseconds = currentTime - startTime;
    updateTimerDisplay();
    updateFullscreenDisplay();
    timer = requestAnimationFrame(updateTimer);
}

function pauseOrResumeTimer() {
    if (isPaused) {
        isPaused = false;
        pauseButton.textContent = "Pause";
        clearInterval(pauseTimer);
        pausedMilliseconds = 0;
        startTime = performance.now() - elapsedMilliseconds;
        timer = requestAnimationFrame(updateTimer);
        messageDiv.textContent = "Timer resumed...";
        updateTabStates();
        updateCustomTimerControlsState();
    } else {
        isPaused = true;
        cancelAnimationFrame(timer);
        timer = null;
        pauseButton.textContent = "Resume";
        startPauseTimer();
        updateTabStates();
        updateCustomTimerControlsState();
    }
}

function stopTimer() {
    cancelAnimationFrame(timer);
    clearInterval(pauseTimer);
    const workSeconds = Math.floor(elapsedMilliseconds / 1000);
    const workMinutes = Math.floor(workSeconds / 60);
    const restNeeded = calculateRestTime(workSeconds);

    completedSessions++;
    sessionData.push({ session: completedSessions, duration: workSeconds });
    localStorage.setItem("sessionData", JSON.stringify(sessionData));

    showCelebration();
    showNotification("Pomodoro Complete!", `Great job! You worked for ${workMinutes} minutes.`);

    // Play appropriate alarm sound for standard timer
    const selectedAlarm = alarmTypeSelect.value === 'high' ? alarmSoundHigh : alarmSound;
    if (selectedAlarm) {
        selectedAlarm.play().catch(e => console.log('Could not play alarm sound'));
    }

    timer = null;
    resetTimer();

    if (restNeeded > 0) {
        showRestPrompt(restNeeded, workMinutes);
    } else {
        messageDiv.textContent = `You worked for ${workMinutes} minutes. Keep it up!`;
    }
}

function showRestPrompt(restSeconds, workMinutes) {
    // Skip the old inline prompt entirely — go straight to the modal
    showRestModal(restSeconds, workMinutes);
}

function startPauseTimer() {
    pauseTimer = setInterval(() => {
        pausedMilliseconds += 1000;
        messageDiv.textContent = `Paused for ${Math.floor(pausedMilliseconds / 1000)} seconds.`;
    }, 1000);
}

function resetTimer() {
    elapsedMilliseconds = 0;
    pausedMilliseconds = 0;
    isPaused = false;
    cancelAnimationFrame(timer);
    timer = null;
    clearInterval(pauseTimer);
    pauseButton.textContent = "Pause";
    startButton.disabled = false;
    pauseButton.disabled = true;
    stopButton.disabled = true;
    updateTimerDisplay();
    saveState(true);
    updateTabStates();
    updateCustomTimerControlsState();
    // Don't clear messageDiv here — the caller sets it right after
}

function updateTimerDisplay() {
    const totalSeconds = Math.floor(elapsedMilliseconds / 1000);
    const milliseconds = Math.floor(elapsedMilliseconds % 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    minutesSpan.textContent = minutes.toString().padStart(2, "0");
    secondsSpan.textContent = seconds.toString().padStart(2, "0");
    millisecondsSpan.textContent = milliseconds.toString().padStart(3, "0");
}

// Custom Timer Functions
function setPresetTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    customHoursInput.value = hours;
    customMinutesInput.value = minutes;
    customSecondsInput.value = remainingSeconds;

    updateCustomTimerFromInputs();
}

function updateCustomTimerFromInputs() {
    let hours   = Math.max(0, Math.min(23, parseInt(customHoursInput.value)   || 0));
    let minutes = Math.max(0, Math.min(59, parseInt(customMinutesInput.value) || 0));
    let seconds = Math.max(0, Math.min(59, parseInt(customSecondsInput.value) || 0));

    // Write clamped values back so the field reflects reality
    customHoursInput.value   = hours;
    customMinutesInput.value = minutes;
    customSecondsInput.value = seconds;

    customTotalTime = (hours * 3600 + minutes * 60 + seconds) * 1000;
    customElapsedTime = 0;
    updateCustomTimerDisplay();
}

function startCustomTimer() {
    if (customTotalTime === 0) {
        customMessageDiv.textContent = "Please set a timer duration first.";
        return;
    }

    if (customIsPaused) {
        // Resume from where we left off
        customStartTime = performance.now() - customElapsedTime;
        customIsPaused = false;
    } else {
        // Fresh start — reset elapsed so full duration runs
        customElapsedTime = 0;
        customStartTime = performance.now();
    }

    customIsRunning = true;
    customStartButton.disabled = true;
    customPauseButton.disabled = false;
    customMessageDiv.textContent = "Custom timer running...";

    cancelAnimationFrame(customTimer); // cancel any stale rAF before starting
    customTimer = requestAnimationFrame(updateCustomTimer);
    updateTabStates();
    updateCustomTimerControlsState();
}

function updateCustomTimer() {
    if (!customIsPaused && customIsRunning) {
        const currentTime = performance.now();
        customElapsedTime = currentTime - customStartTime;

        if (customElapsedTime >= customTotalTime) {
            // Timer completed
            customElapsedTime = customTotalTime;
            completeCustomTimer();
            return;
        }

        updateCustomTimerDisplay();
        updateFullscreenDisplay();
        customTimer = requestAnimationFrame(updateCustomTimer);
    }
}

function pauseOrResumeCustomTimer() {
    if (customIsPaused) {
        customIsPaused = false;
        customPauseButton.textContent = "Pause";
        customStartTime = performance.now() - customElapsedTime;
        customTimer = requestAnimationFrame(updateCustomTimer);
        customMessageDiv.textContent = "Custom timer resumed...";
        updateTabStates();
        updateCustomTimerControlsState();
    } else {
        customIsPaused = true;
        cancelAnimationFrame(customTimer);
        customPauseButton.textContent = "Resume";
        customMessageDiv.textContent = "Custom timer paused...";
        updateTabStates();
        updateCustomTimerControlsState();
    }
}

function completeCustomTimer() {
    const totalMinutes = Math.floor(customTotalTime / 60000);

    cancelAnimationFrame(customTimer);
    customTimer = null;
    customIsRunning = false;

    // Play alarm sound using custom tab's alarm settings
    const customVolume = customAlarmVolumeSlider ? parseFloat(customAlarmVolumeSlider.value) : 0.5;
    const useHighAlarm = customAlarmTypeSelect && customAlarmTypeSelect.value === 'high';
    const selectedAlarm = useHighAlarm ? alarmSoundHigh : alarmSound;
    if (selectedAlarm) {
        selectedAlarm.volume = customVolume;
        selectedAlarm.play().catch(e => console.log('Could not play alarm sound'));
    }
    showCelebration();
    showNotification("Custom Timer Complete!", `Great job! You completed your ${totalMinutes} minute session.`);

    customMessageDiv.textContent = "Custom timer completed! Great work!";
    resetCustomTimer();
}

function resetCustomTimer() {
    cancelAnimationFrame(customTimer);
    customTimer = null;
    customElapsedTime = 0;
    customIsPaused = false;
    customIsRunning = false;
    customStartButton.disabled = false;
    customPauseButton.disabled = true;
    customPauseButton.textContent = "Pause";
    // Restore total time display so it shows the set duration, not 00:00
    updateCustomTimerDisplay();

    if (!customMessageDiv.textContent.includes("completed") && !customMessageDiv.textContent.includes("stopped")) {
        customMessageDiv.textContent = "";
    }
    updateTabStates();
    updateCustomTimerControlsState();
}

function updateCustomTimerDisplay() {
    const remainingTime = Math.max(0, customTotalTime - customElapsedTime);
    const totalSeconds = Math.floor(remainingTime / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    customTimerMinutes.textContent = minutes.toString().padStart(2, "0");
    customTimerSeconds.textContent = seconds.toString().padStart(2, "0");
}

// Rest Timer Functions
function calculateRestTime(workSeconds) {
    if (workSeconds < 300) return 0;
    return Math.floor(workSeconds * 0.2);
}

// ── Rest Timer Modal ──────────────────────────────────────
const restOverlay    = document.getElementById('rest-overlay');
const restRingFill   = document.getElementById('rest-ring-fill');
const restMinutesEl  = document.getElementById('rest-minutes');
const restSecondsEl  = document.getElementById('rest-seconds');
const restSkipBtn    = document.getElementById('rest-skip-btn');
const restSubtitle   = document.getElementById('rest-subtitle');
const REST_CIRCUMFERENCE = 553.0; // 2 * π * 88

let restRaf = null;
let restStartTime = null;
let restTotalMs = 0;

function showRestModal(restSeconds, workMinutes) {
    restTotalMs = restSeconds * 1000;
    const restMins = Math.floor(restSeconds / 60);
    const restSecs = restSeconds % 60;
    const label = restMins > 0
        ? `${restMins}m ${restSecs > 0 ? restSecs + 's' : ''}`.trim()
        : `${restSecs}s`;

    if (restSubtitle) restSubtitle.textContent = `${workMinutes} min session · ${label} break`;
    messageDiv.textContent = '';

    // Reset ring to full
    if (restRingFill) {
        restRingFill.style.transition = 'none';
        restRingFill.style.strokeDashoffset = '0';
    }

    restOverlay.classList.remove('hidden');
    restStartTime = performance.now();
    restRaf = requestAnimationFrame(tickRestTimer);
}

function tickRestTimer(now) {
    const elapsed = now - restStartTime;
    const remaining = Math.max(0, restTotalMs - elapsed);
    const progress = remaining / restTotalMs; // 1 = full ring, 0 = empty

    // Update ring
    if (restRingFill) {
        restRingFill.style.transition = 'none';
        restRingFill.style.strokeDashoffset = REST_CIRCUMFERENCE * (1 - progress);
    }

    // Update countdown
    const totalSecs = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    if (restMinutesEl) restMinutesEl.textContent = m.toString().padStart(2, '0');
    if (restSecondsEl) restSecondsEl.textContent = s.toString().padStart(2, '0');

    if (remaining <= 0) {
        endRestTimer(true);
        return;
    }

    restRaf = requestAnimationFrame(tickRestTimer);
}

function endRestTimer(completed) {
    cancelAnimationFrame(restRaf);
    restRaf = null;
    restOverlay.classList.add('hidden');

    if (completed) {
        const selectedAlarm = alarmTypeSelect.value === 'high' ? alarmSoundHigh : alarmSound;
        if (selectedAlarm) selectedAlarm.play().catch(() => {});
        showNotification("Break Over!", "Time to get back to focus.");
        messageDiv.textContent = "Break complete — let's get back to it! 💪";
    } else {
        messageDiv.textContent = "Break skipped — back to work!";
    }
    fsStatus.textContent = 'Focus Time';
}

if (restSkipBtn) {
    restSkipBtn.addEventListener('click', () => endRestTimer(false));
}

function startRestTimer(restSeconds) {
    // Legacy entry point — now delegates to modal
    showRestModal(restSeconds, 0);
}

// Celebration Animation
function showCelebration() {
    celebration.classList.remove('hidden');

    // Create shockwave rings
    const confettiContainer = document.querySelector('.confetti');
    confettiContainer.innerHTML = '';

    for (let i = 0; i < 3; i++) {
        const ring = document.createElement('div');
        ring.className = 'shockwave';
        ring.style.animationDelay = (i * 0.2) + 's';
        confettiContainer.appendChild(ring);
    }

    // Create confetti particles
    createConfetti();

    // Auto-hide after 5 seconds
    setTimeout(() => {
        celebration.classList.add('hidden');
    }, 5000);

    // Allow manual close by clicking
    celebration.addEventListener('click', () => {
        celebration.classList.add('hidden');
    }, { once: true });
}

function createConfetti() {
    const colors = ['#f0a04b', '#c77dff', '#ff6b6b', '#4ecdc4', '#ffd700', '#ff9ff3', '#54a0ff'];
    const shapes = ['circle', 'square', 'triangle'];
    const confettiContainer = document.querySelector('.confetti');

    for (let i = 0; i < 80; i++) {
        const piece = document.createElement('div');
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = Math.random() * 10 + 5;
        const startX = Math.random() * 100;
        const duration = Math.random() * 2.5 + 2;
        const delay = Math.random() * 1.5;
        const shape = shapes[Math.floor(Math.random() * shapes.length)];

        piece.style.cssText = `
            position: absolute;
            top: -20px;
            left: ${startX}%;
            width: ${size}px;
            height: ${size}px;
            background: ${shape === 'triangle' ? 'transparent' : color};
            border-radius: ${shape === 'circle' ? '50%' : shape === 'square' ? '2px' : '0'};
            border-left: ${shape === 'triangle' ? size/2 + 'px solid transparent' : 'none'};
            border-right: ${shape === 'triangle' ? size/2 + 'px solid transparent' : 'none'};
            border-bottom: ${shape === 'triangle' ? size + 'px solid ' + color : 'none'};
            animation: confetti-spiral ${duration}s ease-in ${delay}s forwards;
            opacity: 1;
        `;
        confettiContainer.appendChild(piece);
    }
}

// Save State
function saveState(reset = false) {
    if (reset) {
        localStorage.removeItem("pomodoroState");
    } else {
        localStorage.setItem("pomodoroState", JSON.stringify({
            totalMilliseconds: elapsedMilliseconds
        }));
    }
}

// Visibility change handler — critical for Android (screen off, app switch)
document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        // Page is hidden — record the wall-clock time so we can catch up
        if (timer && startTime) {
            // Store the timestamp so we can calculate drift when we return
            window._hiddenAtStd = Date.now();
            window._elapsedAtHide = elapsedMilliseconds;
        }
        if (customTimer && customStartTime) {
            window._hiddenAtCustom = Date.now();
            window._customElapsedAtHide = customElapsedTime;
        }
    } else {
        // Page is visible — recalculate to account for time that passed while hidden
        if (timer && startTime && window._hiddenAtStd != null) {
            const hiddenMs = Date.now() - window._hiddenAtStd;
            elapsedMilliseconds = window._elapsedAtHide + hiddenMs;
            startTime = performance.now() - elapsedMilliseconds;
            window._hiddenAtStd = null;
            updateTimerDisplay();
        }
        if (customIsRunning && !customIsPaused && window._hiddenAtCustom != null) {
            const hiddenMs = Date.now() - window._hiddenAtCustom;
            customElapsedTime = window._customElapsedAtHide + hiddenMs;
            customStartTime = performance.now() - customElapsedTime;
            window._hiddenAtCustom = null;
            // Check if custom timer completed while hidden
            if (customElapsedTime >= customTotalTime) {
                customElapsedTime = customTotalTime;
                completeCustomTimer();
            } else {
                updateCustomTimerDisplay();
            }
        }
    }
});

// Handle page unload to save state
window.addEventListener('beforeunload', function () {
    saveState();
});
// ═══════════════════════════════════════════════════════
// ── FEATURE MODULE: Visual Enhancements ─────────────────
// ═══════════════════════════════════════════════════════

// ── 1. CIRCULAR PROGRESS RING (Custom Timer only) ────────
const customRingFill = document.getElementById('custom-ring-fill');
const RING_CIRCUMFERENCE = 753.98; // 2 * π * 120

// Custom timer ring: drains as time is consumed
function updateCustomRing() {
    if (!customRingFill || customTotalTime === 0) return;
    const remaining = Math.max(0, customTotalTime - customElapsedTime);
    const progress = remaining / customTotalTime; // 1 = full, 0 = empty
    const offset = RING_CIRCUMFERENCE * (1 - progress);
    customRingFill.style.strokeDashoffset = offset;

    // Color shift: green → amber → red as it drains
    let r, g, b;
    if (progress > 0.5) {
        // green → amber
        const t = 1 - (progress - 0.5) * 2;
        r = Math.round(100 + 140 * t);
        g = Math.round(200 - 40 * t);
        b = Math.round(80 - 40 * t);
    } else {
        // amber → red
        const t = 1 - progress * 2;
        r = 240;
        g = Math.round(160 - 130 * t);
        b = Math.round(40 - 30 * t);
    }
    customRingFill.style.stroke = `rgb(${r},${g},${b})`;
    customRingFill.style.filter = `drop-shadow(0 0 8px rgba(${r},${g},${b},0.45))`;
}

// ── 2. HEARTBEAT PULSE ───────────────────────────────────
const timerDisplay = document.querySelector('.timer');
const customTimerDisplay = document.querySelector('.custom-timer');
let lastHeartbeatSecond = -1;
let lastCustomHeartbeatSecond = -1;

function triggerHeartbeat(el) {
    if (!el) return;
    el.classList.remove('pulse');
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add('pulse');
}

// ── 3. DYNAMIC BACKGROUND GRADIENT ───────────────────────
// Smoothly interpolates body background between:
//   cool deep blue-black (start) → warm amber-black (working hard)
const BG_START = { r: 8, g: 10, b: 18 };   // cool dark blue
const BG_MID   = { r: 10, g: 9, b: 10 };   // neutral dark
const BG_END   = { r: 20, g: 10, b: 4 };   // warm ember (the --bg-pure value)

function lerpColor(a, b, t) {
    return {
        r: Math.round(a.r + (b.r - a.r) * t),
        g: Math.round(a.g + (b.g - a.g) * t),
        b: Math.round(a.b + (b.b - a.b) * t),
    };
}

function updateDynamicBackground(progressRatio) {
    // 0 = just started (cool blue tinge), 1 = deep into session (warm amber)
    const t = Math.min(Math.max(progressRatio, 0), 1);
    const col = t < 0.5 ? lerpColor(BG_START, BG_MID, t * 2) : lerpColor(BG_MID, BG_END, (t - 0.5) * 2);
    document.body.style.backgroundColor = `rgb(${col.r},${col.g},${col.b})`;
}

function resetDynamicBackground() {
    document.body.style.backgroundColor = '';
}

// ── 4. SCREEN EDGE GLOW ──────────────────────────────────
// Intensity increases as custom timer drains OR std timer grows
function updateEdgeGlow(progressRatio) {
    // progressRatio: 0 = beginning, 1 = end/urgency
    const intensity = Math.min(progressRatio, 1);

    // Color: teal at start → amber mid → red at end
    let r, g, b;
    if (intensity < 0.5) {
        const t = intensity * 2;
        r = Math.round(50 + 190 * t);
        g = Math.round(200 - 60 * t);
        b = Math.round(180 - 100 * t);
    } else {
        const t = (intensity - 0.5) * 2;
        r = 240;
        g = Math.round(140 - 110 * t);
        b = Math.round(80 - 60 * t);
    }

    const alpha = 0.12 + intensity * 0.38;
    const spread = 20 + intensity * 60;
    const glow = `rgba(${r},${g},${b},${alpha})`;

    document.body.style.boxShadow = `inset 0 0 ${spread}px ${Math.round(spread * 0.4)}px ${glow}`;
}

function resetEdgeGlow() {
    document.body.style.boxShadow = '';
}


// ─────────────────────────────────────────────────────────
// HOOK INTO EXISTING TIMER FUNCTIONS
// ─────────────────────────────────────────────────────────

const STD_RING_MAX_MS = 3600000; // 1 hour reference for background/glow

// Intercept standard timer update
const _origUpdateTimerDisplay = updateTimerDisplay;
window.updateTimerDisplay = function() {
    _origUpdateTimerDisplay();

    // Heartbeat: trigger on each new second
    const currentSecond = Math.floor(elapsedMilliseconds / 1000);
    if (currentSecond !== lastHeartbeatSecond && timer) {
        lastHeartbeatSecond = currentSecond;
        triggerHeartbeat(timerDisplay);
    }

    // Background & Edge Glow (for standard count-up, we use 60-min as reference)
    if (timer && !isPaused) {
        const progress = Math.min(elapsedMilliseconds / STD_RING_MAX_MS, 1);
        updateDynamicBackground(progress * 0.6);
        updateEdgeGlow(progress);
    }
};

// Intercept custom timer update
const _origUpdateCustomTimerDisplay = updateCustomTimerDisplay;
window.updateCustomTimerDisplay = function() {
    _origUpdateCustomTimerDisplay();

    if (customTotalTime > 0) {
        const remaining = Math.max(0, customTotalTime - customElapsedTime);
        const elapsed = customTotalTime - remaining;
        const progress = elapsed / customTotalTime; // 0→1 as time is consumed

        // Heartbeat on each new second
        const currentSecond = Math.floor(elapsed / 1000);
        if (currentSecond !== lastCustomHeartbeatSecond && customIsRunning && !customIsPaused) {
            lastCustomHeartbeatSecond = currentSecond;
            triggerHeartbeat(customTimerDisplay);
        }

        updateCustomRing();

        if (customIsRunning && !customIsPaused) {
            updateDynamicBackground(progress);
            updateEdgeGlow(progress);
        }
    }
};

// Hook into pause/resume — reset glow/background while paused
const _origPauseOrResumeTimer = pauseOrResumeTimer;
window.pauseOrResumeTimer = function() {
    _origPauseOrResumeTimer();
    if (isPaused) {
        resetEdgeGlow();
        resetDynamicBackground();
    }
};

const _origPauseOrResumeCustomTimer = pauseOrResumeCustomTimer;
window.pauseOrResumeCustomTimer = function() {
    _origPauseOrResumeCustomTimer();
    if (customIsPaused) {
        resetEdgeGlow();
        resetDynamicBackground();
    }
};

// Reset visuals on stop/reset
const _origResetTimer = resetTimer;
window.resetTimer = function() {
    _origResetTimer();
    resetEdgeGlow();
    resetDynamicBackground();
    lastHeartbeatSecond = -1;
};

const _origResetCustomTimer = resetCustomTimer;
window.resetCustomTimer = function() {
    _origResetCustomTimer();
    resetEdgeGlow();
    resetDynamicBackground();
    if (customRingFill) {
        customRingFill.style.transition = 'none';
        customRingFill.style.strokeDashoffset = RING_CIRCUMFERENCE;
        // Re-enable transition after a frame so future updates animate
        requestAnimationFrame(() => {
            customRingFill.style.transition = '';
        });
    }
    lastCustomHeartbeatSecond = -1;
};
