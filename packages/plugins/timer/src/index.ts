/// <reference types="@omni/types" />

/**
 * Native zero-dependency HTML template helper using standard <template>.
 */
function html<T extends HTMLElement = HTMLElement>(
  strings: TemplateStringsArray,
  ...values: any[]
): T {
  const template = document.createElement("template");
  template.innerHTML = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "").trim();
  return template.content.firstElementChild as T;
}

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
  const card = html<HTMLDivElement>`
    <div class="timer-widget-card" style="background: var(--bg-surface, #191816); border: 1px solid var(--border-strong, #383530); border-radius: var(--radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 12px; color: var(--text-primary, #ede8df);">
      <div class="widget-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--text-primary, #ede8df);">Focus Timer (Pomodoro)</h3>
      </div>
      <div class="timer-display-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px 0;">
        <div class="timer-digits" style="font-size: 2.2rem; font-weight: 700; letter-spacing: 0.05em; font-family: var(--font-mono, monospace); color: var(--accent-primary, #d4a373);">${formatTime(remainingSeconds)}</div>
        <div class="timer-status" style="font-size: 0.75rem; color: var(--text-muted, #78716c); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px;">${isRunning ? "Focusing..." : remainingSeconds === 0 ? "Done!" : "Paused"}</div>
      </div>
      <div class="timer-buttons-row" style="display: flex; gap: 8px; justify-content: center;">
        <button class="btn-timer-start" style="display: ${isRunning ? "none" : "inline-block"}; background: var(--accent-primary, #d4a373); color: var(--accent-contrast, #141312); border: none; border-radius: var(--radius-sm, 6px); padding: 7px 16px; font-weight: 600; cursor: pointer;">Start</button>
        <button class="btn-timer-pause" style="display: ${isRunning ? "inline-block" : "none"}; background: var(--bg-subtle, #2a2824); color: var(--text-primary, #ede8df); border: 1px solid var(--border-strong, #383530); border-radius: var(--radius-sm, 6px); padding: 7px 16px; font-weight: 600; cursor: pointer;">Pause</button>
        <button class="btn-timer-reset" style="background: transparent; color: var(--text-secondary, #a8a29e); border: 1px solid var(--border-subtle, #272522); border-radius: var(--radius-sm, 6px); padding: 7px 14px; cursor: pointer;">Reset</button>
      </div>
    </div>
  `;

  const timeText = card.querySelector<HTMLElement>(".timer-digits")!;
  const statusText = card.querySelector<HTMLElement>(".timer-status")!;
  const startBtn = card.querySelector<HTMLButtonElement>(".btn-timer-start")!;
  const pauseBtn = card.querySelector<HTMLButtonElement>(".btn-timer-pause")!;
  const resetBtn = card.querySelector<HTMLButtonElement>(".btn-timer-reset")!;

  startBtn.addEventListener("click", startTimer);
  pauseBtn.addEventListener("click", pauseTimer);
  resetBtn.addEventListener("click", () => resetTimer(totalSeconds));

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
  let savedCfg = { work: 25, shortBreak: 5, longBreak: 15 };
  try {
    const raw = localStorage.getItem("omni_timer_config");
    if (raw) savedCfg = JSON.parse(raw);
  } catch (_) {}

  const container = html<HTMLDivElement>`
    <div class="timer-settings-container" style="display: flex; flex-direction: column; gap: 12px; font-family: inherit; color: var(--text-primary, #ede8df);">
      <h4 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--accent-primary, #d4a373);">Focus Timer Preferences</h4>
      <p style="margin: 0; font-size: 0.78rem; color: var(--text-muted, #78716c);">Customize focus intervals and break timers. Changes persist to local storage.</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
        <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; color: var(--text-secondary, #a8a29e);">
          Focus (min):
          <input id="timer-cfg-work" type="number" value="${savedCfg.work || 25}" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 6px 8px; border-radius: var(--radius-sm, 6px); font-size: 0.82rem;" />
        </label>
        <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; color: var(--text-secondary, #a8a29e);">
          Short Break (min):
          <input id="timer-cfg-short" type="number" value="${savedCfg.shortBreak || 5}" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 6px 8px; border-radius: var(--radius-sm, 6px); font-size: 0.82rem;" />
        </label>
        <label style="display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; color: var(--text-secondary, #a8a29e);">
          Long Break (min):
          <input id="timer-cfg-long" type="number" value="${savedCfg.longBreak || 15}" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 6px 8px; border-radius: var(--radius-sm, 6px); font-size: 0.82rem;" />
        </label>
      </div>
      <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
        <button id="timer-btn-save" class="btn-publish" style="background: var(--accent-primary, #d4a373); color: var(--accent-contrast, #141312); border: none; padding: 6px 14px; border-radius: var(--radius-sm, 6px); font-size: 0.78rem; font-weight: 600; cursor: pointer;">Save Settings</button>
      </div>
    </div>
  `;

  const workInput = container.querySelector<HTMLInputElement>("#timer-cfg-work")!;
  const breakInput = container.querySelector<HTMLInputElement>("#timer-cfg-short")!;
  const longInput = container.querySelector<HTMLInputElement>("#timer-cfg-long")!;
  const btnSave = container.querySelector<HTMLButtonElement>("#timer-btn-save")!;

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

  root.appendChild(container);
}

function isSettingsRoute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const search = window.location.search || "";
    if (new URLSearchParams(search).get("view") === "settings") return true;
    if (window.location.hash.includes("settings")) return true;
    if ((window as any).__OMNI_ROUTE__?.includes("settings")) return true;
    if ((window as any).__OMNI_VIEW__ === "settings") return true;
  } catch (_) {}
  return false;
}

function isCompactRoute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const search = window.location.search || "";
    if (new URLSearchParams(search).get("view") === "compact") return true;
    if (window.location.hash.includes("compact")) return true;
    if ((window as any).__OMNI_ROUTE__?.includes("compact")) return true;
    if ((window as any).__OMNI_VIEW__ === "compact") return true;
  } catch (_) {}
  return false;
}

function mountTimerCompact(root: any) {
  const container = html<HTMLDivElement>`
    <div class="timer-compact-card" style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; width: 100%; gap: 6px; padding: 4px; box-sizing: border-box; text-align: center; color: #ffffff; font-family: inherit;">
      <div class="timer-compact-digits" style="font-size: 1.8rem; font-weight: 700; font-family: var(--font-mono, monospace); line-height: 1; letter-spacing: 0.04em; color: #ffffff; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);">${formatTime(remainingSeconds)}</div>
      <div class="timer-compact-status" style="font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255, 255, 255, 0.9); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);">${isRunning ? "Focusing" : remainingSeconds === 0 ? "Done" : "Ready"}</div>
      <button class="btn-timer-compact-toggle" style="background: rgba(255, 255, 255, 0.22); border: 1px solid rgba(255, 255, 255, 0.5); color: #ffffff; padding: 3px 10px; font-size: 0.72rem; font-weight: 600; cursor: pointer; border-radius: 2px; margin-top: 2px;">${isRunning ? "Pause" : "Start"}</button>
    </div>
  `;

  const digits = container.querySelector<HTMLElement>(".timer-compact-digits")!;
  const status = container.querySelector<HTMLElement>(".timer-compact-status")!;
  const toggleBtn = container.querySelector<HTMLButtonElement>(".btn-timer-compact-toggle")!;

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isRunning) pauseTimer();
    else startTimer();
  });

  function updateCompact() {
    digits.textContent = formatTime(remainingSeconds);
    status.textContent = isRunning ? "Focusing" : remainingSeconds === 0 ? "Done" : "Ready";
    toggleBtn.textContent = isRunning ? "Pause" : "Start";
  }

  listeners.push(updateCompact);
  root.appendChild(container);
}

const mountApp = (root: any) => {
  if (isSettingsRoute()) {
    mountTimerSettings(root);
  } else if (isCompactRoute()) {
    mountTimerCompact(root);
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
