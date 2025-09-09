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
const darkModeToggle = document.getElementById("dark-mode-toggle");
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

// Initialize App
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
    requestNotificationPermission();
});

function initializeApp() {
    loadSavedState();
    loadSavedDarkMode();
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

// Apply Saved Dark Mode
function loadSavedDarkMode() {
    const savedDarkMode = localStorage.getItem("darkMode");
    if (savedDarkMode === "enabled") {
        document.body.classList.add("dark-mode");
        darkModeToggle.textContent = "☀️";
    } else {
        darkModeToggle.textContent = "🌙";
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    // Dark mode toggle
    darkModeToggle.addEventListener("click", toggleDarkMode);

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
}

// Tab Switching
function switchTab(tabName) {
    // Check if any timer is running and apply visual feedback
    const isStandardRunning = timer && !isPaused;
    const isCustomRunning = customIsRunning && !customIsPaused;

    // Update button states first
    tabButtons.forEach(button => {
        button.classList.remove('disabled');
        if (isStandardRunning || isCustomRunning) {
            if (button.dataset.tab !== document.querySelector('.tab-button.active').dataset.tab) {
                button.classList.add('disabled');
            }
        }
    });

    // Prevent tab switching if standard timer is running
    if (timer && !isPaused) {
        messageDiv.textContent = "Cannot switch tabs while standard timer is running.";
        setTimeout(() => {
            if (messageDiv.textContent === "Cannot switch tabs while standard timer is running.") {
                messageDiv.textContent = "Timer running...";
            }
        }, 2000);
        return;
    }

    // Prevent tab switching if custom timer is running
    if (customIsRunning && !customIsPaused) {
        customMessageDiv.textContent = "Cannot switch tabs while custom timer is running.";
        setTimeout(() => {
            if (customMessageDiv.textContent === "Cannot switch tabs while custom timer is running.") {
                customMessageDiv.textContent = "Custom timer running...";
            }
        }, 2000);
        return;
    }

    // Clear disabled states when switching is allowed
    tabButtons.forEach(button => {
        button.classList.remove('disabled');
        button.classList.toggle('active', button.dataset.tab === tabName);
    });

    tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
}

function updateTabStates() {
    const isStandardRunning = timer !== null;
    const isCustomRunning = customIsRunning;

    tabButtons.forEach(button => {
        button.classList.remove('disabled');
        if (isStandardRunning || isCustomRunning) {
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

// Dark Mode Toggle
function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    const darkModeEnabled = document.body.classList.contains("dark-mode");
    darkModeToggle.textContent = darkModeEnabled ? "☀️" : "🌙";
    localStorage.setItem("darkMode", darkModeEnabled ? "enabled" : "disabled");
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
}

function exitFullscreen() {
    fullscreenOverlay.classList.add('hidden');
}

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

    switch (e.key.toLowerCase()) {
        case ' ':
            e.preventDefault();
            const activeTab = document.querySelector('.tab-button.active').dataset.tab;
            if (activeTab === 'custom') {
                if (!customIsRunning) {
                    startCustomTimer();
                } else {
                    pauseOrResumeCustomTimer();
                }
            } else {
                if (!timer) {
                    startTimer();
                } else {
                    pauseOrResumeTimer();
                }
            }
            break;
        case 'escape':
            if (!fullscreenOverlay.classList.contains('hidden')) {
                exitFullscreen();
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
    if (isPaused) {
        startTime = performance.now() - elapsedMilliseconds;
        isPaused = false;
    } else {
        startTime = performance.now();
        elapsedMilliseconds = 0;
    }

    startButton.disabled = true;
    pauseButton.disabled = false;
    stopButton.disabled = false;
    messageDiv.textContent = "Timer running...";

    timer = requestAnimationFrame(updateTimer);
    updateTabStates();
    updateCustomTimerControlsState();
}

function updateTimer() {
    if (!isPaused) {
        const currentTime = performance.now();
        elapsedMilliseconds = currentTime - startTime;
        updateTimerDisplay();
        updateFullscreenDisplay();
        saveState();
        timer = requestAnimationFrame(updateTimer);
    }
}

function pauseOrResumeTimer() {
    if (isPaused) {
        isPaused = false;
        pauseButton.textContent = "Pause";
        clearInterval(pauseTimer);

        if (pausedMilliseconds > 0) {
            const deduct = confirm(`You paused for ${Math.floor(pausedMilliseconds / 1000)} seconds. Deduct this time from your work session?`);
            if (deduct) {
                elapsedMilliseconds -= pausedMilliseconds;
                if (elapsedMilliseconds < 0) elapsedMilliseconds = 0;
            }
            pausedMilliseconds = 0;
        }

        startTime = performance.now() - elapsedMilliseconds;
        timer = requestAnimationFrame(updateTimer);
        messageDiv.textContent = "Timer resumed...";
        updateTabStates();
        updateCustomTimerControlsState();
    } else {
        isPaused = true;
        cancelAnimationFrame(timer);
        pauseButton.textContent = "Resume";
        startPauseTimer();
        updateTabStates();
        updateCustomTimerControlsState();
    }
    updateCustomTimerControlsState();
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

    messageDiv.textContent = `You worked for ${workMinutes} minutes. Rest needed: ${restNeeded} seconds.`;
    if (confirm(`Start ${restNeeded} seconds of rest?`)) startRestTimer(restNeeded);
    timer = null;
    resetTimer();
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
    clearInterval(pauseTimer);
    pauseButton.textContent = "Pause";
    startButton.disabled = false;
    pauseButton.disabled = true;
    stopButton.disabled = true;
    updateTimerDisplay();
    saveState(true);
    updateTabStates();
    updateCustomTimerControlsState();
    messageDiv.textContent = "";
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
    const hours = parseInt(customHoursInput.value) || 0;
    const minutes = parseInt(customMinutesInput.value) || 0;
    const seconds = parseInt(customSecondsInput.value) || 0;

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
        customStartTime = performance.now() - customElapsedTime;
        customIsPaused = false;
    } else {
        customStartTime = performance.now();
        customElapsedTime = 0;
    }

    customIsRunning = true;
    customStartButton.disabled = true;
    customPauseButton.disabled = false;
    customMessageDiv.textContent = "Custom timer running...";

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
    updateCustomTimerControlsState();
}

function stopCustomTimer() {
    const elapsedSeconds = Math.floor(customElapsedTime / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);

    showCelebration();
    showNotification("Custom Timer Stopped!", `You worked for ${elapsedMinutes} minutes and ${elapsedSeconds % 60} seconds.`);

    customMessageDiv.textContent = `Timer stopped. You worked for ${elapsedMinutes}:${(elapsedSeconds % 60).toString().padStart(2, '0')}.`;
    resetCustomTimer();
}

function completeCustomTimer() {
    const totalMinutes = Math.floor(customTotalTime / 60000);

    cancelAnimationFrame(customTimer);
    customIsRunning = false;

    // Play alarm sound
    if (alarmSound) {
        alarmSound.play().catch(e => console.log('Could not play alarm sound'));
    }
    showCelebration();
    showNotification("Custom Timer Complete!", `Great job! You completed your ${totalMinutes} minute session.`);

    customMessageDiv.textContent = "Custom timer completed! Great work!";
    resetCustomTimer();
}

function resetCustomTimer() {
    cancelAnimationFrame(customTimer);
    customElapsedTime = 0;
    customIsPaused = false;
    customIsRunning = false;
    customStartButton.disabled = false;
    customPauseButton.disabled = true;
    customPauseButton.textContent = "Pause";
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

function startRestTimer(restSeconds) {
    let remainingTime = restSeconds;
    fsStatus.textContent = 'Rest Time';

    const restInterval = setInterval(() => {
        if (remainingTime <= 0) {
            clearInterval(restInterval);
            // Play appropriate alarm sound for rest timer
            const selectedAlarm = alarmTypeSelect.value === 'high' ? alarmSoundHigh : alarmSound;
            if (selectedAlarm) {
                selectedAlarm.play().catch(e => console.log('Could not play alarm sound'));
            }
            showNotification("Rest Complete!", "Time to get back to work!");
            messageDiv.textContent = "Rest is over! Get back to work.";
            fsStatus.textContent = 'Focus Time';
            timer = null;
        } else {
            messageDiv.textContent = `Resting... ${remainingTime--} seconds remaining.`;
            updateFullscreenRestDisplay(remainingTime + 1);
        }
    }, 1000);
}

function updateFullscreenRestDisplay(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    fsMinutes.textContent = minutes.toString().padStart(2, "0");
    fsSeconds.textContent = remainingSeconds.toString().padStart(2, "0");
}

// Celebration Animation
function showCelebration() {
    celebration.classList.remove('hidden');

    // Auto-hide after 3 seconds
    setTimeout(() => {
        celebration.classList.add('hidden');
    }, 5000);

    // Allow manual close by clicking
    celebration.addEventListener('click', () => {
        celebration.classList.add('hidden');
    }, { once: true });

    // Create additional confetti elements
    createConfetti();
}

function createConfetti() {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8'];
    const confettiContainer = document.querySelector('.confetti');

    // Clear existing confetti
    confettiContainer.innerHTML = '';

    for (let i = 0; i < 50; i++) {
        const confettiPiece = document.createElement('div');
        confettiPiece.style.position = 'absolute';
        confettiPiece.style.width = '10px';
        confettiPiece.style.height = '10px';
        confettiPiece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confettiPiece.style.left = Math.random() * 100 + '%';
        confettiPiece.style.animationDelay = Math.random() * 3 + 's';
        confettiPiece.style.animation = 'confetti-fall 3s linear infinite';
        confettiContainer.appendChild(confettiPiece);
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

// Visibility change handler for better performance
document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        // Page is hidden, could pause non-essential animations
        return;
    } else {
        // Page is visible, resume normal operation
        if (timer || customTimer) {
            // Recalculate timing to account for any drift
            if (timer && startTime) {
                elapsedMilliseconds = performance.now() - startTime;
                updateTimerDisplay();
            }
            if (customTimer && customStartTime) {
                customElapsedTime = performance.now() - customStartTime;
                updateCustomTimerDisplay();
            }
        }
    }
});

// Handle page unload to save state
window.addEventListener('beforeunload', function () {
    saveState();
});