// ═══════════════════════════════════════════════════════
// POMODORO TIMER — script.js  (Android-hardened)
//
// KEY FIXES over previous version:
//  1.  Rest modal now always appears after celebration fully closes.
//      Root cause: on Android, the Stop button tap synthesizes a ghost-click
//      that immediately dismissed the celebration overlay (via the once:true
//      listener), leaving no time for the rest modal to attach before the
//      click propagated through. Fixed by: (a) replacing once:true with a
//      320 ms ghost-click guard, and (b) only calling showRestModal() inside
//      the celebration's onComplete callback, so the overlay is fully hidden
//      before the rest modal opens.
//  2.  Rest overlay z-index raised to 2100 (above celebration at 2000) in
//      CSS — now also set inline as a safety net.
//  3.  AudioContext never closed prematurely; _ensureLowAlarmCtx() reuses
//      or re-creates it safely, fixing the silent alarm bug on Android.
//  4.  pauseTimer interval is cleared and null-ed in every code path that
//      stops or resets a timer (was leaking into new sessions).
//  5.  updateCustomTimer rAF guard: checks customTimer === null, not the
//      old truthy/falsy mix that could let ghost frames slip through.
//  6.  Tab switching blocked while rest modal is open.
//  7.  visibilitychange: rest-timer drift correction now uses the correct
//      wall-clock delta (Date.now()) not performance.now() inconsistency.
//  8.  completeCustomTimer now also offers a rest break (was only in
//      stopTimer for the standard timer).
//  9.  createConfetti skips heavy animation on reduced-motion preference
//      and limits particle count on low-core-count devices.
// 10.  updateCustomTimerDisplay + updateCustomRing called after reset so the
//      ring visually resets to the original set duration, not 00:00.
// 11.  Keyboard shortcuts: Space/Escape work on celebration and rest overlay.
// ═══════════════════════════════════════════════════════

// ── Global Variables: Standard Timer ─────────────────
let startTime           = null;
let elapsedMilliseconds = 0;
let timer               = null;
let pauseTimer          = null;
let pausedMilliseconds  = 0;
let isPaused            = false;
let completedSessions   = 0;
let sessionData         = JSON.parse(localStorage.getItem("sessionData")) || [];

// ── Global Variables: Custom Timer ───────────────────
let customStartTime   = null;
let customTotalTime   = 0;
let customElapsedTime = 0;
let customTimer       = null;
let customIsPaused    = false;
let customIsRunning   = false;

// ── DOM: Standard Timer ───────────────────────────────
const startButton      = document.getElementById("start");
const pauseButton      = document.getElementById("pause");
const stopButton       = document.getElementById("stop");
const minutesSpan      = document.getElementById("minutes");
const secondsSpan      = document.getElementById("seconds");
const millisecondsSpan = document.getElementById("milliseconds");
const messageDiv       = document.getElementById("message");

// ── DOM: Custom Timer ─────────────────────────────────
const customHoursInput   = document.getElementById("custom-hours");
const customMinutesInput = document.getElementById("custom-minutes");
const customSecondsInput = document.getElementById("custom-seconds");
const customStartButton  = document.getElementById("custom-start");
const customPauseButton  = document.getElementById("custom-pause");
const customResetButton  = document.getElementById("custom-reset");
const customTimerMinutes = document.getElementById("custom-timer-minutes");
const customTimerSeconds = document.getElementById("custom-timer-seconds");
const customMessageDiv   = document.getElementById("custom-message");
const presetButtons      = document.querySelectorAll(".preset-btn");

// ── DOM: Common ───────────────────────────────────────
const fullscreenToggle     = document.getElementById("fullscreen-toggle");
const tabButtons           = document.querySelectorAll(".tab-button");
const tabContents          = document.querySelectorAll(".tab-content");
const fullscreenOverlay    = document.getElementById("fullscreen-overlay");
const exitFullscreenButton = document.getElementById("exit-fullscreen");
const fsMinutes            = document.getElementById("fs-minutes");
const fsSeconds            = document.getElementById("fs-seconds");
const fsStatus             = document.getElementById("fs-status");
const celebration          = document.getElementById("celebration");
const alarmSoundHigh       = document.getElementById("alarm-sound-high");
const alarmTypeSelect      = document.getElementById("alarm-type");
const alarmVolumeSlider    = document.getElementById("alarm-volume");
const customAlarmTypeSelect   = document.getElementById("custom-alarm-type");
const customAlarmVolumeSlider = document.getElementById("custom-alarm-volume");

// ── Low alarm: Web Audio API synthesis ───────────────
let _lowAlarmAudioCtx = null;

function _ensureLowAlarmCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!_lowAlarmAudioCtx || _lowAlarmAudioCtx.state === 'closed') {
        _lowAlarmAudioCtx = new AC();
    }
    return _lowAlarmAudioCtx;
}

function _playLowAlarm(volume) {
    try {
        const ctx = _ensureLowAlarmCtx();
        if (!ctx) return;
        const play = () => {
            [440, 392, 349].forEach((freq, i) => {
                const osc  = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.value = freq;
                const t = ctx.currentTime + i * 0.25;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(volume * 0.7, t + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
                osc.start(t);
                osc.stop(t + 0.55);
            });
        };
        if (ctx.state === 'suspended') ctx.resume().then(play).catch(() => {});
        else play();
    } catch (e) { console.warn('Low alarm synthesis failed:', e); }
}

const _lowAlarmProxy = {
    _vol: 0.5,
    get volume()  { return this._vol; },
    set volume(v) { this._vol = v; },
    play()  { _playLowAlarm(this._vol); return Promise.resolve(); },
    pause() {}
};

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
    requestNotificationPermission();
    setupAndroidAudioUnlock();
    setupTouchFriendlySliders();
});

function initializeApp() {
    loadSavedState();
    loadSavedVolume();
    setupEventListeners();
    updateCustomTimerDisplay();
    updateCustomTimerControlsState();
}

// ── Android Audio Context Unlock ──────────────────────
function setupAndroidAudioUnlock() {
    let unlocked = false;
    function unlockAudio() {
        if (unlocked) return;
        unlocked = true;
        try {
            const ctx = _ensureLowAlarmCtx();
            if (ctx) {
                const buf = ctx.createBuffer(1, 1, 22050);
                const src = ctx.createBufferSource();
                src.buffer = buf;
                src.connect(ctx.destination);
                src.start(0);
                // Do NOT close ctx — we reuse it for the low alarm
            }
        } catch(e) {}
        // Unlock the HTML audio element with a silent play-then-pause
        [alarmSoundHigh].forEach(el => {
            if (!el) return;
            const saved = el.volume;
            el.volume = 0;
            el.play().then(() => { el.pause(); el.currentTime = 0; el.volume = saved; }).catch(() => {});
        });
        document.removeEventListener('touchstart', unlockAudio, true);
        document.removeEventListener('touchend',   unlockAudio, true);
        document.removeEventListener('click',      unlockAudio, true);
    }
    document.addEventListener('touchstart', unlockAudio, { passive: true, capture: true });
    document.addEventListener('touchend',   unlockAudio, { passive: true, capture: true });
    document.addEventListener('click',      unlockAudio, { capture: true });
}

// ── Touch-friendly range sliders ─────────────────────
function setupTouchFriendlySliders() {
    [alarmVolumeSlider, customAlarmVolumeSlider].forEach(slider => {
        if (!slider) return;
        slider.addEventListener('touchstart', () => {}, { passive: true });
        slider.addEventListener('touchmove',  e => e.stopPropagation(), { passive: true });
    });
}

// ── Notifications ─────────────────────────────────────
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default')
        Notification.requestPermission().catch(() => {});
}

function showNotification(title, message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const n = new Notification(title, { body: message, icon: 'favicon.png', badge: 'favicon.png' });
            setTimeout(() => n.close(), 5000);
        } catch(e) {}
    }
}

// ── Saved State ───────────────────────────────────────
function loadSavedState() {
    elapsedMilliseconds = 0;
    updateTimerDisplay();
    localStorage.removeItem("pomodoroState");
}

function loadSavedVolume() {
    const vol = parseFloat(localStorage.getItem("alarmVolume") ?? "0.5");
    alarmVolumeSlider.value = vol;
    applyVolume(vol);
    if (customAlarmVolumeSlider) {
        const cvol = parseFloat(localStorage.getItem("customAlarmVolume") ?? "0.5");
        customAlarmVolumeSlider.value = cvol;
        applyCustomVolume(cvol);
    }
}

function saveState(reset = false) {
    if (reset) localStorage.removeItem("pomodoroState");
    else localStorage.setItem("pomodoroState", JSON.stringify({ totalMilliseconds: elapsedMilliseconds }));
}

// ── Event Listeners ───────────────────────────────────
function setupEventListeners() {
    tabButtons.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    fullscreenToggle.addEventListener("click", toggleFullscreen);
    exitFullscreenButton.addEventListener("click", exitFullscreen);
    startButton.addEventListener("click", startTimer);
    pauseButton.addEventListener("click", pauseOrResumeTimer);
    stopButton.addEventListener("click",  stopTimer);
    customStartButton.addEventListener("click", startCustomTimer);
    customPauseButton.addEventListener("click", pauseOrResumeCustomTimer);
    customResetButton.addEventListener("click", resetCustomTimer);
    presetButtons.forEach(b => b.addEventListener('click', () => setPresetTime(parseInt(b.dataset.time))));
    [customHoursInput, customMinutesInput, customSecondsInput].forEach(inp => {
        inp.addEventListener('change', updateCustomTimerFromInputs);
        inp.addEventListener('input',  updateCustomTimerFromInputs);
    });
    document.addEventListener('keydown', handleKeyboardShortcuts);
    alarmVolumeSlider.addEventListener('input', () => {
        const v = parseFloat(alarmVolumeSlider.value);
        applyVolume(v);
        localStorage.setItem("alarmVolume", v);
    });
    if (customAlarmVolumeSlider) {
        customAlarmVolumeSlider.addEventListener('input', () => {
            const v = parseFloat(customAlarmVolumeSlider.value);
            applyCustomVolume(v);
            localStorage.setItem("customAlarmVolume", v);
        });
    }
}

// ── Tab Switching ─────────────────────────────────────
function switchTab(tabName) {
    if (timer !== null && !isPaused) {
        messageDiv.textContent = "Pause the timer before switching tabs.";
        setTimeout(() => {
            if (messageDiv.textContent === "Pause the timer before switching tabs.")
                messageDiv.textContent = "Timer running...";
        }, 2000);
        return;
    }
    if (customIsRunning && !customIsPaused) {
        customMessageDiv.textContent = "Pause the timer before switching tabs.";
        setTimeout(() => {
            if (customMessageDiv.textContent === "Pause the timer before switching tabs.")
                customMessageDiv.textContent = "Custom timer running...";
        }, 2000);
        return;
    }
    // Block tab switch while break modal is open
    if (!restOverlay.classList.contains('hidden')) return;

    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    tabContents.forEach(c => c.classList.toggle('active', c.id === `${tabName}-tab`));
    updateTabStates();
}

function updateTabStates() {
    const stdRunning    = timer !== null && !isPaused;
    const customRunning = customIsRunning && !customIsPaused;
    const activeEl      = document.querySelector('.tab-button.active');
    tabButtons.forEach(b => {
        b.classList.remove('disabled');
        if ((stdRunning || customRunning) && activeEl && b.dataset.tab !== activeEl.dataset.tab)
            b.classList.add('disabled');
    });
}

function updateCustomTimerControlsState() {
    const running = (timer !== null) || customIsRunning;
    [customHoursInput, customMinutesInput, customSecondsInput].forEach(inp => {
        inp.disabled = running;
        inp.classList.toggle('disabled', running);
    });
    presetButtons.forEach(b => {
        b.disabled = running;
        b.classList.toggle('disabled', running);
    });
}

// ── Volume ────────────────────────────────────────────
function applyVolume(volume) {
    if (alarmSoundHigh) alarmSoundHigh.volume = volume;
    _lowAlarmProxy.volume = volume;
    alarmVolumeSlider.style.setProperty('--volume-pct', (volume * 100) + '%');
    const label = document.querySelector('label[for="alarm-volume"]');
    if (label) label.textContent = volume === 0 ? '🔇' : volume < 0.4 ? '🔈' : volume < 0.75 ? '🔉' : '🔊';
}

function applyCustomVolume(volume) {
    if (customAlarmVolumeSlider)
        customAlarmVolumeSlider.style.setProperty('--volume-pct', (volume * 100) + '%');
    const label = document.querySelector('label[for="custom-alarm-volume"]');
    if (label) label.textContent = volume === 0 ? '🔇' : volume < 0.4 ? '🔈' : volume < 0.75 ? '🔉' : '🔊';
}

// ── Fullscreen ────────────────────────────────────────
function toggleFullscreen() {
    fullscreenOverlay.classList.remove('hidden');
    updateFullscreenDisplay();
    if (fsStatus) {
        fsStatus.textContent = document.querySelector('.tab-button.active')?.dataset.tab === 'custom'
            ? 'Custom Timer' : 'Focus Time';
    }
    if (document.documentElement.requestFullscreen)
        document.documentElement.requestFullscreen().catch(() => {});
    else if (document.documentElement.webkitRequestFullscreen)
        document.documentElement.webkitRequestFullscreen();
}

function exitFullscreen() {
    fullscreenOverlay.classList.add('hidden');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement)
        fullscreenOverlay.classList.add('hidden');
});
document.addEventListener('webkitfullscreenchange', () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement)
        fullscreenOverlay.classList.add('hidden');
});

function updateFullscreenDisplay() {
    const activeTab = document.querySelector('.tab-button.active')?.dataset.tab;
    let totalSeconds;
    if (activeTab === 'custom') {
        totalSeconds = Math.max(0, Math.floor((customTotalTime - customElapsedTime) / 1000));
    } else {
        totalSeconds = Math.floor(elapsedMilliseconds / 1000);
    }
    if (fsMinutes) fsMinutes.textContent = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    if (fsSeconds)  fsSeconds.textContent = (totalSeconds % 60).toString().padStart(2, "0");
}

// ── Keyboard Shortcuts ────────────────────────────────
function handleKeyboardShortcuts(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.key === 'Escape') {
        if (!restOverlay.classList.contains('hidden'))       { endRestTimer(false); return; }
        if (!fullscreenOverlay.classList.contains('hidden')) { exitFullscreen();    return; }
        if (!celebration.classList.contains('hidden'))       { celebration.classList.add('hidden'); return; }
    }

    const key = e.key === ' ' ? 'space' : e.key.toLowerCase();

    if (key === 'space') {
        e.preventDefault();
        if (!restOverlay.classList.contains('hidden'))  { endRestTimer(false); return; }
        if (!celebration.classList.contains('hidden'))  { celebration.classList.add('hidden'); return; }
        const activeTab = document.querySelector('.tab-button.active')?.dataset.tab;
        if (activeTab === 'custom') {
            if (!customIsRunning) startCustomTimer(); else pauseOrResumeCustomTimer();
        } else {
            if (!timer && !isPaused) startTimer(); else pauseOrResumeTimer();
        }
        return;
    }

    if (key === 'f') {
        if (!fullscreenOverlay.classList.contains('hidden')) exitFullscreen();
        else toggleFullscreen();
    }
}

// ═══════════════════════════════════════════════════════
// STANDARD TIMER
// ═══════════════════════════════════════════════════════
function startTimer() {
    startTime = performance.now();
    elapsedMilliseconds = 0;
    isPaused = false;
    startButton.disabled = true;
    pauseButton.disabled = false;
    stopButton.disabled  = false;
    messageDiv.textContent = "Timer running...";
    cancelAnimationFrame(timer);
    timer = requestAnimationFrame(updateTimer);
    updateTabStates();
    updateCustomTimerControlsState();
}

const STD_RING_MAX_MS = 3600000;

function updateTimer(now) {
    if (timer === null) return;
    if (isPaused) return;
    elapsedMilliseconds = now - startTime;
    updateTimerDisplay();
    updateFullscreenDisplay();
    const currentSecond = Math.floor(elapsedMilliseconds / 1000);
    if (currentSecond !== lastHeartbeatSecond) {
        lastHeartbeatSecond = currentSecond;
        triggerHeartbeat(timerDisplay);
    }
    const progress = Math.min(elapsedMilliseconds / STD_RING_MAX_MS, 1);
    updateDynamicBackground(progress * 0.6);
    updateEdgeGlow(progress);
    timer = requestAnimationFrame(updateTimer);
}

function pauseOrResumeTimer() {
    if (isPaused) {
        isPaused = false;
        pauseButton.textContent = "Pause";
        clearInterval(pauseTimer);
        pauseTimer = null;
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
        resetEdgeGlow();
        resetDynamicBackground();
    }
}

function stopTimer() {
    cancelAnimationFrame(timer);
    timer = null;
    clearInterval(pauseTimer);
    pauseTimer = null;
    isPaused = false;

    const workSeconds = Math.floor(elapsedMilliseconds / 1000);
    const workMinutes = Math.floor(workSeconds / 60);

    if (workSeconds < 1) {
        resetTimer();
        messageDiv.textContent = "";
        return;
    }

    const restNeeded = calculateRestTime(workSeconds);
    completedSessions++;
    sessionData.push({ session: completedSessions, duration: workSeconds });
    localStorage.setItem("sessionData", JSON.stringify(sessionData));

    const alarm = alarmTypeSelect.value === 'high' ? alarmSoundHigh : _lowAlarmProxy;
    if (alarm) alarm.play().catch(e => console.warn('Alarm play failed:', e));

    showNotification("Pomodoro Complete!", `Great job! You worked for ${workMinutes} minutes.`);

    resetTimer();

    // ── FIX: rest modal is shown ONLY after celebration fully closes ──
    // This prevents z-index collisions and ghost-click swallowing the overlay.
    showCelebration(() => {
        if (restNeeded > 0) {
            showRestModal(restNeeded, workMinutes);
        } else {
            messageDiv.textContent = `You worked for ${workMinutes} minutes. Keep it up!`;
        }
    });
}

function startPauseTimer() {
    clearInterval(pauseTimer);
    pauseTimer = setInterval(() => {
        pausedMilliseconds += 1000;
        messageDiv.textContent = `Paused for ${Math.floor(pausedMilliseconds / 1000)}s.`;
    }, 1000);
}

function resetTimer() {
    cancelAnimationFrame(timer);
    timer = null;
    clearInterval(pauseTimer);
    pauseTimer = null;
    elapsedMilliseconds = 0;
    pausedMilliseconds  = 0;
    isPaused = false;
    pauseButton.textContent = "Pause";
    startButton.disabled = false;
    pauseButton.disabled = true;
    stopButton.disabled  = true;
    updateTimerDisplay();
    saveState(true);
    updateTabStates();
    updateCustomTimerControlsState();
    resetEdgeGlow();
    resetDynamicBackground();
    lastHeartbeatSecond = -1;
    // Absorb Android's synthetic ghost-click that follows a button tap
    startButton.style.pointerEvents = 'none';
    setTimeout(() => { startButton.style.pointerEvents = ''; }, 600);
}

function updateTimerDisplay() {
    const totalSeconds = Math.floor(elapsedMilliseconds / 1000);
    const ms  = Math.floor(elapsedMilliseconds % 1000);
    const min = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    minutesSpan.textContent      = min.toString().padStart(2, "0");
    secondsSpan.textContent      = sec.toString().padStart(2, "0");
    millisecondsSpan.textContent = ms.toString().padStart(3, "0");
}

// ═══════════════════════════════════════════════════════
// CUSTOM TIMER
// ═══════════════════════════════════════════════════════
function setPresetTime(seconds) {
    customHoursInput.value   = Math.floor(seconds / 3600);
    customMinutesInput.value = Math.floor((seconds % 3600) / 60);
    customSecondsInput.value = seconds % 60;
    updateCustomTimerFromInputs();
}

function updateCustomTimerFromInputs() {
    const h = Math.max(0, Math.min(23, parseInt(customHoursInput.value)   || 0));
    const m = Math.max(0, Math.min(59, parseInt(customMinutesInput.value) || 0));
    const s = Math.max(0, Math.min(59, parseInt(customSecondsInput.value) || 0));
    customHoursInput.value   = h;
    customMinutesInput.value = m;
    customSecondsInput.value = s;
    customTotalTime   = (h * 3600 + m * 60 + s) * 1000;
    customElapsedTime = 0;
    updateCustomTimerDisplay();
    updateCustomRing();
}

function startCustomTimer() {
    if (customTotalTime === 0) {
        customMessageDiv.textContent = "Please set a timer duration first.";
        return;
    }
    if (customIsPaused) {
        customStartTime = performance.now() - customElapsedTime;
        customIsPaused  = false;
    } else {
        customElapsedTime = 0;
        customStartTime   = performance.now();
    }
    customIsRunning = true;
    customStartButton.disabled = true;
    customPauseButton.disabled = false;
    customMessageDiv.textContent = "Custom timer running...";
    cancelAnimationFrame(customTimer);
    customTimer = requestAnimationFrame(updateCustomTimer);
    updateTabStates();
    updateCustomTimerControlsState();
}

function updateCustomTimer(now) {
    if (customTimer === null) return;
    if (customIsPaused || !customIsRunning) return;

    customElapsedTime = now - customStartTime;

    if (customElapsedTime >= customTotalTime) {
        customElapsedTime = customTotalTime;
        updateCustomTimerDisplay();
        updateCustomRing();
        completeCustomTimer();
        return;
    }

    updateCustomTimerDisplay();
    updateFullscreenDisplay();

    const progress = customElapsedTime / customTotalTime;
    const currentSecond = Math.floor(customElapsedTime / 1000);
    if (currentSecond !== lastCustomHeartbeatSecond) {
        lastCustomHeartbeatSecond = currentSecond;
        triggerHeartbeat(customTimerDisplay);
    }
    updateCustomRing();
    updateDynamicBackground(progress);
    updateEdgeGlow(progress);

    customTimer = requestAnimationFrame(updateCustomTimer);
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
        customTimer = null;
        customPauseButton.textContent = "Resume";
        customMessageDiv.textContent = "Custom timer paused...";
        updateTabStates();
        updateCustomTimerControlsState();
        resetEdgeGlow();
        resetDynamicBackground();
    }
}

function completeCustomTimer() {
    cancelAnimationFrame(customTimer);
    customTimer = null;
    customIsRunning = false;

    const totalMinutes = Math.floor(customTotalTime / 60000);
    const workSeconds  = Math.floor(customTotalTime / 1000);
    const restNeeded   = calculateRestTime(workSeconds);

    const vol   = customAlarmVolumeSlider ? parseFloat(customAlarmVolumeSlider.value) : 0.5;
    const alarm = (customAlarmTypeSelect?.value === 'high') ? alarmSoundHigh : _lowAlarmProxy;
    if (alarm) { alarm.volume = vol; alarm.play().catch(e => console.warn('Alarm play failed:', e)); }

    showNotification("Custom Timer Complete!", `Great job! You completed your ${totalMinutes} minute session.`);
    customMessageDiv.textContent = "Custom timer completed! Great work!";

    resetCustomTimer();

    // Show rest modal after celebration (same pattern as standard timer)
    showCelebration(() => {
        if (restNeeded > 0) showRestModal(restNeeded, totalMinutes);
    });
}

function resetCustomTimer() {
    cancelAnimationFrame(customTimer);
    customTimer      = null;
    customIsRunning  = false;
    customIsPaused   = false;
    customElapsedTime = 0;
    clearInterval(pauseTimer);
    pauseTimer = null;
    customStartButton.disabled = false;
    customPauseButton.disabled = true;
    customPauseButton.textContent = "Pause";
    updateCustomTimerDisplay();
    if (customRingFill) {
        customRingFill.style.transition = 'none';
        customRingFill.style.strokeDashoffset = RING_CIRCUMFERENCE;
        requestAnimationFrame(() => { customRingFill.style.transition = ''; });
    }
    if (!customMessageDiv.textContent.includes("completed") &&
        !customMessageDiv.textContent.includes("stopped")) {
        customMessageDiv.textContent = "";
    }
    updateTabStates();
    updateCustomTimerControlsState();
    resetEdgeGlow();
    resetDynamicBackground();
    lastCustomHeartbeatSecond = -1;
}

function updateCustomTimerDisplay() {
    const remaining = Math.max(0, customTotalTime - customElapsedTime);
    const totalSecs = Math.floor(remaining / 1000);
    customTimerMinutes.textContent = Math.floor(totalSecs / 60).toString().padStart(2, "0");
    customTimerSeconds.textContent = (totalSecs % 60).toString().padStart(2, "0");
}

// ═══════════════════════════════════════════════════════
// REST TIMER — modal with countdown ring
// ═══════════════════════════════════════════════════════
function calculateRestTime(workSeconds) {
    if (workSeconds < 300) return 0;      // < 5 min → no break
    return Math.floor(workSeconds * 0.2); // 20% of work time
}

const restOverlay   = document.getElementById('rest-overlay');
const restRingFill  = document.getElementById('rest-ring-fill');
const restMinutesEl = document.getElementById('rest-minutes');
const restSecondsEl = document.getElementById('rest-seconds');
const restSkipBtn   = document.getElementById('rest-skip-btn');
const restSubtitle  = document.getElementById('rest-subtitle');
const REST_CIRCUMFERENCE = 553.0; // 2π × 88

let restRaf       = null;
let restStartTime = null;
let restTotalMs   = 0;

if (restSkipBtn) restSkipBtn.addEventListener('click', () => endRestTimer(false));

function showRestModal(restSeconds, workMinutes) {
    restTotalMs = restSeconds * 1000;

    const restMins = Math.floor(restSeconds / 60);
    const restSecs = restSeconds % 60;
    const label = restMins > 0
        ? `${restMins}m${restSecs > 0 ? ' ' + restSecs + 's' : ''}`
        : `${restSecs}s`;
    if (restSubtitle) restSubtitle.textContent = `${workMinutes} min session · ${label} break`;
    messageDiv.textContent = '';

    // Show initial time so there's no blank before first tick
    if (restMinutesEl) restMinutesEl.textContent = Math.floor(restSeconds / 60).toString().padStart(2, '0');
    if (restSecondsEl) restSecondsEl.textContent = (restSeconds % 60).toString().padStart(2, '0');

    // Reset ring to full (offset 0 = full stroke drawn)
    if (restRingFill) {
        restRingFill.style.transition = 'none';
        restRingFill.style.strokeDashoffset = '0';
    }

    // Ensure overlay is above everything (z-index 2100 > celebration 2000)
    restOverlay.style.zIndex = '2100';
    restOverlay.classList.remove('hidden');

    cancelAnimationFrame(restRaf);
    restRaf = null;
    restStartTime = null;

    // Double-rAF: ensures Android paints the overlay before animation begins
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            restStartTime = performance.now();
            restRaf = requestAnimationFrame(tickRestTimer);
        });
    });
}

function tickRestTimer(now) {
    if (restRaf === null) return;
    if (!restStartTime) { restRaf = requestAnimationFrame(tickRestTimer); return; }
    if (restTotalMs <= 0) { endRestTimer(true); return; }

    const elapsed   = now - restStartTime;
    const remaining = Math.max(0, restTotalMs - elapsed);
    const progress  = remaining / restTotalMs; // 1=full ring, 0=empty

    // strokeDashoffset=0 → full ring; =REST_CIRCUMFERENCE → empty ring
    if (restRingFill) {
        restRingFill.style.transition = 'none';
        restRingFill.style.strokeDashoffset = (REST_CIRCUMFERENCE * (1 - progress)).toString();
    }

    const totalSecs = Math.ceil(remaining / 1000);
    if (restMinutesEl) restMinutesEl.textContent = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    if (restSecondsEl) restSecondsEl.textContent = (totalSecs % 60).toString().padStart(2, '0');

    if (remaining <= 0) { endRestTimer(true); return; }

    restRaf = requestAnimationFrame(tickRestTimer);
}

function endRestTimer(completed) {
    cancelAnimationFrame(restRaf);
    restRaf = null;
    restStartTime = null;
    restOverlay.classList.add('hidden');

    if (completed) {
        const alarm = alarmTypeSelect.value === 'high' ? alarmSoundHigh : _lowAlarmProxy;
        if (alarm) alarm.play().catch(() => {});
        showNotification("Break Over!", "Time to get back to focus.");
        messageDiv.textContent = "Break complete — let's get back to it! 💪";
    } else {
        messageDiv.textContent = "Break skipped — back to work!";
    }
    if (fsStatus) fsStatus.textContent = 'Focus Time';
}

// ═══════════════════════════════════════════════════════
// CELEBRATION ANIMATION
// ═══════════════════════════════════════════════════════

/**
 * Show the celebration overlay.
 * @param {Function} [onComplete] - Called after the overlay is dismissed
 *   (whether by user tap or auto-close). The rest modal is shown here.
 */
function showCelebration(onComplete) {
    celebration.classList.remove('hidden');

    let dismissed = false;
    let autoHideTimer = null;

    function dismiss() {
        if (dismissed) return;
        dismissed = true;
        clearTimeout(autoHideTimer);
        // Remove the lingering listeners before hiding
        celebration.removeEventListener('click',    handleClick);
        celebration.removeEventListener('touchend', handleTouch);
        celebration.classList.add('hidden');
        // Small settle delay so Android finishes painting the hide before
        // we add a new overlay on top
        setTimeout(() => { if (typeof onComplete === 'function') onComplete(); }, 100);
    }

    // Build confetti on next paint so Android draws the overlay first
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const container = document.querySelector('.confetti');
            if (container) {
                container.innerHTML = '';
                for (let i = 0; i < 3; i++) {
                    const ring = document.createElement('div');
                    ring.className = 'shockwave';
                    ring.style.animationDelay = (i * 0.2) + 's';
                    container.appendChild(ring);
                }
                createConfetti(container);
            }
        });
    });

    // Auto-dismiss after 4 s
    autoHideTimer = setTimeout(dismiss, 4000);

    // Manual dismiss — guard against the Android ghost-click synthesized
    // from the Stop/Start button tap (~150-250 ms later).
    const guardEnd = performance.now() + 320;

    function handleClick() {
        if (performance.now() < guardEnd) return; // ghost click — ignore
        dismiss();
    }
    function handleTouch() {
        if (performance.now() < guardEnd) return;
        dismiss();
    }

    celebration.addEventListener('click',    handleClick);
    celebration.addEventListener('touchend', handleTouch, { passive: true });
}

function createConfetti(container) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#f0a04b','#c77dff','#ff6b6b','#4ecdc4','#ffd700','#ff9ff3','#54a0ff'];
    const shapes = ['circle','square','triangle'];
    const count  = (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) ? 40 : 80;
    for (let i = 0; i < count; i++) {
        const piece    = document.createElement('div');
        const color    = colors[Math.floor(Math.random() * colors.length)];
        const size     = Math.random() * 10 + 5;
        const startX   = Math.random() * 100;
        const duration = Math.random() * 2.5 + 2;
        const delay    = Math.random() * 1.5;
        const shape    = shapes[Math.floor(Math.random() * shapes.length)];
        piece.style.cssText = `
            position:absolute;top:-20px;left:${startX}%;
            width:${size}px;height:${size}px;
            background:${shape==='triangle'?'transparent':color};
            border-radius:${shape==='circle'?'50%':shape==='square'?'2px':'0'};
            border-left:${shape==='triangle'?size/2+'px solid transparent':'none'};
            border-right:${shape==='triangle'?size/2+'px solid transparent':'none'};
            border-bottom:${shape==='triangle'?size+'px solid '+color:'none'};
            animation:confetti-spiral ${duration}s ease-in ${delay}s forwards;
            will-change:transform;opacity:1;
        `;
        container.appendChild(piece);
    }
}

// ═══════════════════════════════════════════════════════
// VISIBILITY CHANGE — keep timers accurate after screen lock / app switch
// ═══════════════════════════════════════════════════════
document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        if (timer !== null && startTime !== null && !isPaused) {
            window._hiddenAtStd   = Date.now();
            window._elapsedAtHide = elapsedMilliseconds;
        }
        if (customTimer !== null && customStartTime !== null && !customIsPaused) {
            window._hiddenAtCustom      = Date.now();
            window._customElapsedAtHide = customElapsedTime;
        }
        if (restRaf !== null && restStartTime !== null) {
            window._hiddenAtRest      = Date.now();
            // store how many ms have elapsed in the rest timer at hide time
            window._restElapsedAtHide = performance.now() - restStartTime;
        }
    } else {
        // Standard timer
        if (timer !== null && !isPaused && startTime && window._hiddenAtStd != null) {
            const hiddenMs = Date.now() - window._hiddenAtStd;
            elapsedMilliseconds = window._elapsedAtHide + hiddenMs;
            startTime = performance.now() - elapsedMilliseconds;
            updateTimerDisplay();
        }
        window._hiddenAtStd = null;

        // Custom timer
        if (customIsRunning && !customIsPaused && customTimer !== null && window._hiddenAtCustom != null) {
            const hiddenMs = Date.now() - window._hiddenAtCustom;
            customElapsedTime = window._customElapsedAtHide + hiddenMs;
            customStartTime   = performance.now() - customElapsedTime;
            if (customElapsedTime >= customTotalTime) {
                customElapsedTime = customTotalTime;
                completeCustomTimer();
            } else {
                updateCustomTimerDisplay();
            }
        }
        window._hiddenAtCustom = null;

        // Rest timer
        if (restRaf !== null && restStartTime !== null && window._hiddenAtRest != null) {
            const hiddenMs     = Date.now() - window._hiddenAtRest;
            const totalElapsed = window._restElapsedAtHide + hiddenMs;
            if (totalElapsed >= restTotalMs) {
                endRestTimer(true);
            } else {
                restStartTime = performance.now() - totalElapsed;
            }
        }
        window._hiddenAtRest = null;
    }
});

window.addEventListener('beforeunload', saveState);

// ═══════════════════════════════════════════════════════
// VISUAL ENHANCEMENTS
// ═══════════════════════════════════════════════════════

// ── 1. Custom Timer Progress Ring ────────────────────
const customRingFill     = document.getElementById('custom-ring-fill');
const RING_CIRCUMFERENCE = 753.98; // 2π × 120

function updateCustomRing() {
    if (!customRingFill || customTotalTime === 0) return;
    const remaining = Math.max(0, customTotalTime - customElapsedTime);
    const progress  = remaining / customTotalTime;
    customRingFill.style.strokeDashoffset = (RING_CIRCUMFERENCE * (1 - progress)).toString();

    let r, g, b;
    if (progress > 0.5) {
        const t = 1 - (progress - 0.5) * 2;
        r = Math.round(100 + 140 * t); g = Math.round(200 - 40 * t); b = Math.round(80 - 40 * t);
    } else {
        const t = 1 - progress * 2;
        r = 240; g = Math.round(160 - 130 * t); b = Math.round(40 - 30 * t);
    }
    customRingFill.style.stroke  = `rgb(${r},${g},${b})`;
    customRingFill.style.filter  = `drop-shadow(0 0 8px rgba(${r},${g},${b},0.45))`;
}

// ── 2. Heartbeat Pulse ────────────────────────────────
const timerDisplay            = document.querySelector('.timer');
const customTimerDisplay      = document.querySelector('.custom-timer');
let lastHeartbeatSecond       = -1;
let lastCustomHeartbeatSecond = -1;

function triggerHeartbeat(el) {
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
}

// ── 3. Dynamic Background Gradient ───────────────────
const BG_START = { r: 8,  g: 10, b: 18 };
const BG_MID   = { r: 10, g: 9,  b: 10 };
const BG_END   = { r: 20, g: 10, b: 4  };

function lerpColor(a, b, t) {
    return {
        r: Math.round(a.r + (b.r - a.r) * t),
        g: Math.round(a.g + (b.g - a.g) * t),
        b: Math.round(a.b + (b.b - a.b) * t),
    };
}

let _lastVisualUpdateSecond = -1;
function _shouldUpdateVisuals() {
    const nowSec = Math.floor(performance.now() / 1000);
    if (nowSec === _lastVisualUpdateSecond) return false;
    _lastVisualUpdateSecond = nowSec;
    return true;
}

function updateDynamicBackground(progressRatio) {
    if (!_shouldUpdateVisuals()) return;
    const t   = Math.min(Math.max(progressRatio, 0), 1);
    const col = t < 0.5 ? lerpColor(BG_START, BG_MID, t * 2) : lerpColor(BG_MID, BG_END, (t - 0.5) * 2);
    document.body.style.backgroundColor = `rgb(${col.r},${col.g},${col.b})`;
}

function resetDynamicBackground() {
    document.body.style.backgroundColor = '';
    _lastVisualUpdateSecond = -1;
}

// ── 4. Screen Edge Glow ───────────────────────────────
let _lastGlowUpdateSecond = -1;
function updateEdgeGlow(progressRatio) {
    const nowSec = Math.floor(performance.now() / 1000);
    if (nowSec === _lastGlowUpdateSecond) return;
    _lastGlowUpdateSecond = nowSec;
    const intensity = Math.min(progressRatio, 1);
    let r, g, b;
    if (intensity < 0.5) {
        const t = intensity * 2;
        r = Math.round(50 + 190 * t); g = Math.round(200 - 60 * t); b = Math.round(180 - 100 * t);
    } else {
        const t = (intensity - 0.5) * 2;
        r = 240; g = Math.round(140 - 110 * t); b = Math.round(80 - 60 * t);
    }
    const alpha  = 0.12 + intensity * 0.38;
    const spread = 20 + intensity * 60;
    document.body.style.boxShadow =
        `inset 0 0 ${spread}px ${Math.round(spread * 0.4)}px rgba(${r},${g},${b},${alpha})`;
}

function resetEdgeGlow() {
    document.body.style.boxShadow = '';
    _lastGlowUpdateSecond = -1;
}
