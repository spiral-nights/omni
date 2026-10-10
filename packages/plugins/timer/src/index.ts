/// <reference types="@omni/types" />

let totalSeconds = 25 * 60;
let remainingSeconds = totalSeconds;
let isRunning = false;
let intervalId: any = null;

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

function mountTimer(root: any) {
  const isRemote = typeof root.createElement === "function";
  const createElement = (tag: string) => isRemote ? root.createElement(tag) : document.createElement(tag);

  const card = createElement("div");
  card.className = "timer-widget-card";

  const header = createElement("div");
  header.className = "widget-header";
  const title = createElement("h3");
  title.textContent = "Focus Timer (Pomodoro)";
  header.appendChild(title);
  card.appendChild(header);

  // Circular/Typographic Display
  const displayContainer = createElement("div");
  displayContainer.className = "timer-display-container";

  const timeText = createElement("div");
  timeText.className = "timer-digits";

  const statusText = createElement("div");
  statusText.className = "timer-status";

  displayContainer.appendChild(timeText);
  displayContainer.appendChild(statusText);
  card.appendChild(displayContainer);

  // Buttons Row
  const btnRow = createElement("div");
  btnRow.className = "timer-buttons-row";

  const startBtn = createElement("button");
  startBtn.textContent = "Start";
  startBtn.className = "btn-timer-start";
  startBtn.addEventListener("click", startTimer);

  const pauseBtn = createElement("button");
  pauseBtn.textContent = "Pause";
  pauseBtn.className = "btn-timer-pause";
  pauseBtn.addEventListener("click", pauseTimer);

  const resetBtn = createElement("button");
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
}

if (typeof omni !== "undefined" && typeof (omni as any).registerComponent === "function") {
  (omni as any).registerComponent("timer-sidebar-widget", ({ root }: any) => {
    mountTimer(root);
  });
  (omni as any).registerComponent("timer-widget", ({ root }: any) => {
    mountTimer(root);
  });
  (omni as any).registerComponent("org.omni.nsite.timer-main", ({ root }: any) => {
    mountTimer(root);
  });
} else if (typeof document !== "undefined") {
  mountTimer(document.body);
}
