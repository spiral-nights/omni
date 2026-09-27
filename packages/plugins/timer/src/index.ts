/// <reference types="@omni/types" />

let totalSeconds = 25 * 60;
let remainingSeconds = totalSeconds;
let isRunning = false;
let intervalId: any = null;

// Callbacks to re-render mounted views on ticks
const listeners: Array<() => void> = [];
function notify() {
  for (const fn of listeners) fn();
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  intervalId = setInterval(() => {
    if (remainingSeconds > 0) {
      remainingSeconds--;
      notify();
    } else {
      pauseTimer();
      notify();
    }
  }, 1000);
  notify();
}

function pauseTimer() {
  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  notify();
}

function resetTimer(seconds: number = 25 * 60) {
  pauseTimer();
  totalSeconds = seconds;
  remainingSeconds = seconds;
  notify();
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

if (typeof omni !== "undefined") {
  // 1. Register Dock Icon (Reactive countdown label)
  omni.registerComponent("timer-dock-icon", ({ root }) => {
    const btn = root.createElement("button");
    btn.className = "dock-icon-btn";
    btn.title = "Focus Timer";

    const svg = root.createElement("svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    const circle = root.createElement("circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "14");
    circle.setAttribute("r", "7.5");

    const line1 = root.createElement("line");
    line1.setAttribute("x1", "12");
    line1.setAttribute("y1", "10");
    line1.setAttribute("x2", "12");
    line1.setAttribute("y2", "14");

    const line2 = root.createElement("line");
    line2.setAttribute("x1", "12");
    line2.setAttribute("y1", "14");
    line2.setAttribute("x2", "15");
    line2.setAttribute("y2", "14");

    const topPusher = root.createElement("line");
    topPusher.setAttribute("x1", "10");
    topPusher.setAttribute("y1", "2.5");
    topPusher.setAttribute("x2", "14");
    topPusher.setAttribute("y2", "2.5");

    const stem = root.createElement("line");
    stem.setAttribute("x1", "12");
    stem.setAttribute("y1", "2.5");
    stem.setAttribute("x2", "12");
    stem.setAttribute("y2", "6.5");

    svg.appendChild(circle);
    svg.appendChild(line1);
    svg.appendChild(line2);
    svg.appendChild(topPusher);
    svg.appendChild(stem);
    btn.appendChild(svg);

    const label = root.createElement("span");
    label.className = "dock-badge";

    function updateDock() {
      const mins = Math.ceil(remainingSeconds / 60);
      label.textContent = `${mins}m`;
    }

    listeners.push(updateDock);
    updateDock();
    btn.appendChild(label);

    btn.addEventListener("click", () => {
      omni.ui.toggleSlot("sidebar");
    });

    root.appendChild(btn);
  });

  // 2. Register Sidebar Timer Widget
  omni.registerComponent("timer-sidebar-widget", ({ root }) => {
    const card = root.createElement("div");
    card.className = "timer-widget-card";

    const header = root.createElement("div");
    header.className = "widget-header";
    const title = root.createElement("h3");
    title.textContent = "Focus Timer (Pomodoro)";
    header.appendChild(title);
    card.appendChild(header);

    // Circular/Typographic Display
    const displayContainer = root.createElement("div");
    displayContainer.className = "timer-display-container";

    const timeText = root.createElement("div");
    timeText.className = "timer-digits";

    const statusText = root.createElement("div");
    statusText.className = "timer-status";

    displayContainer.appendChild(timeText);
    displayContainer.appendChild(statusText);
    card.appendChild(displayContainer);

    // Buttons Row
    const btnRow = root.createElement("div");
    btnRow.className = "timer-buttons-row";

    const startBtn = root.createElement("button");
    startBtn.textContent = "Start";
    startBtn.className = "btn-timer-start";
    startBtn.addEventListener("click", startTimer);

    const pauseBtn = root.createElement("button");
    pauseBtn.textContent = "Pause";
    pauseBtn.className = "btn-timer-pause";
    pauseBtn.addEventListener("click", pauseTimer);

    const resetBtn = root.createElement("button");
    resetBtn.textContent = "Reset";
    resetBtn.className = "btn-timer-reset";
    resetBtn.addEventListener("click", () => resetTimer(25 * 60));

    btnRow.appendChild(startBtn);
    btnRow.appendChild(pauseBtn);
    btnRow.appendChild(resetBtn);
    card.appendChild(btnRow);

    function updateWidget() {
      timeText.textContent = formatTime(remainingSeconds);
      statusText.textContent = isRunning ? "Focusing..." : remainingSeconds === 0 ? "Done!" : "Paused";
      startBtn.style.display = isRunning ? "none" : "inline-block";
      pauseBtn.style.display = isRunning ? "inline-block" : "none";
    }

    listeners.push(updateWidget);
    updateWidget();

    root.appendChild(card);
  });
}
