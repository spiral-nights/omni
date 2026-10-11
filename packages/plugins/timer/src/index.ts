/// <reference types="@omni/types" />

let totalSeconds = 25 * 60;
let remainingSeconds = totalSeconds;
let isRunning = false;
let intervalId: any = null;

const listeners: Array<() => void> = [];
function notify() {
  for (const fn of listeners) fn();
}

// Load saved config if available
try {
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem("omni_timer_config");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.work) {
        totalSeconds = parsed.work * 60;
        remainingSeconds = totalSeconds;
      }
    }
  }
} catch (_) {}

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

function resetTimer(seconds: number = totalSeconds) {
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
  resetBtn.addEventListener("click", () => resetTimer(totalSeconds));

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

function mountTimerSettings(root: any) {
  const isRemote = typeof root.createElement === "function";
  const createElement = (tag: string) => isRemote ? root.createElement(tag) : document.createElement(tag);

  const container = createElement("div");
  container.className = "timer-settings-container";
  container.style.cssText = "display: flex; flex-direction: column; gap: 12px; font-family: var(--omni-font-sans, system-ui); color: var(--omni-text-primary, #ede8df);";

  const title = createElement("h4");
  title.textContent = "Focus Timer Preferences";
  title.style.cssText = "margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--omni-accent-primary, #d4a373);";
  container.appendChild(title);

  const desc = createElement("p");
  desc.textContent = "Customize focus intervals and break timers. Changes persist to local storage.";
  desc.style.cssText = "margin: 0; font-size: 0.78rem; color: var(--omni-text-muted, #9e988f);";
  container.appendChild(desc);

  // Load existing config
  let savedCfg = { work: 25, shortBreak: 5, longBreak: 15 };
  try {
    const raw = localStorage.getItem("omni_timer_config");
    if (raw) savedCfg = JSON.parse(raw);
  } catch (_) {}

  const formGrid = createElement("div");
  formGrid.style.cssText = "display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;";

  // Work Duration
  const workGroup = createElement("label");
  workGroup.style.cssText = "display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; color: var(--omni-text-secondary, #9e988f);";
  workGroup.textContent = "Focus (min):";
  const workInput = createElement("input");
  workInput.type = "number";
  workInput.value = String(savedCfg.work || 25);
  workInput.style.cssText = "background: var(--omni-bg-subtle, #2a2723); border: 1px solid var(--omni-border-strong, #3d3933); color: var(--omni-text-primary, #ede8df); padding: 6px 8px; border-radius: 4px; font-size: 0.82rem;";
  workGroup.appendChild(workInput);
  formGrid.appendChild(workGroup);

  // Short Break
  const breakGroup = createElement("label");
  breakGroup.style.cssText = "display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; color: var(--omni-text-secondary, #9e988f);";
  breakGroup.textContent = "Short Break (min):";
  const breakInput = createElement("input");
  breakInput.type = "number";
  breakInput.value = String(savedCfg.shortBreak || 5);
  breakInput.style.cssText = "background: var(--omni-bg-subtle, #2a2723); border: 1px solid var(--omni-border-strong, #3d3933); color: var(--omni-text-primary, #ede8df); padding: 6px 8px; border-radius: 4px; font-size: 0.82rem;";
  breakGroup.appendChild(breakInput);
  formGrid.appendChild(breakGroup);

  // Long Break
  const longGroup = createElement("label");
  longGroup.style.cssText = "display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; color: var(--omni-text-secondary, #9e988f);";
  longGroup.textContent = "Long Break (min):";
  const longInput = createElement("input");
  longInput.type = "number";
  longInput.value = String(savedCfg.longBreak || 15);
  longInput.style.cssText = "background: var(--omni-bg-subtle, #2a2723); border: 1px solid var(--omni-border-strong, #3d3933); color: var(--omni-text-primary, #ede8df); padding: 6px 8px; border-radius: 4px; font-size: 0.82rem;";
  longGroup.appendChild(longInput);
  formGrid.appendChild(longGroup);

  container.appendChild(formGrid);

  // Save button
  const btnRow = createElement("div");
  btnRow.style.cssText = "display: flex; justify-content: flex-end; margin-top: 4px;";
  const btnSave = createElement("button");
  btnSave.textContent = "Save Settings";
  btnSave.className = "btn-publish";
  btnSave.style.cssText = "background: var(--omni-accent-primary, #d4a373); color: #141312; border: none; padding: 6px 14px; border-radius: 4px; font-size: 0.78rem; font-weight: 600; cursor: pointer;";

  btnSave.addEventListener("click", () => {
    const work = parseInt(workInput.value || "25", 10);
    const shortBreak = parseInt(breakInput.value || "5", 10);
    const longBreak = parseInt(longInput.value || "15", 10);
    const cfg = { work, shortBreak, longBreak };

    try {
      localStorage.setItem("omni_timer_config", JSON.stringify(cfg));
    } catch (_) {}

    resetTimer(work * 60);

    btnSave.textContent = "Saved!";
    setTimeout(() => {
      btnSave.textContent = "Save Settings";
    }, 1500);
  });

  btnRow.appendChild(btnSave);
  container.appendChild(btnRow);

  root.appendChild(container);
}

function isSettingsRoute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const search = window.location.search || "";
    if (new URLSearchParams(search).get("view") === "settings") return true;
    if (window.location.hash.includes("settings")) return true;
    if ((window as any).__OMNI_ROUTE__?.includes("settings")) return true;
  } catch (_) {}
  return false;
}

const mountApp = (root: any) => {
  if (isSettingsRoute()) {
    mountTimerSettings(root);
  } else {
    mountTimer(root);
  }
};

function init() {
  if (typeof document !== "undefined") {
    mountApp(document.body);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
