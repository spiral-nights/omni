import { OmniComponentNode, OmniAction } from "@omni/types";
import { TimerState } from "./types.js";
import { getTimerSchema } from "./schema/timer-schema.js";
import { playTimerCompletionChime } from "./audio/chime.js";

export { getTimerSchema, formatTime, getTimerDiskColor } from "./schema/timer-schema.js";
export { playTimerCompletionChime } from "./audio/chime.js";
export * from "./types.js";

export let timerState: TimerState = {
  totalSeconds: 15 * 60, // Default 15 minutes
  remainingSeconds: 15 * 60,
  isRunning: false,
  isFinished: false,
  isFocusMode: false
};

let tickerInterval: any = null;

function startTicker(onUpdate?: () => void): void {
  if (tickerInterval) clearInterval(tickerInterval);

  tickerInterval = setInterval(() => {
    if (!timerState.isRunning) {
      clearInterval(tickerInterval);
      tickerInterval = null;
      return;
    }

    if (timerState.remainingSeconds > 0) {
      timerState.remainingSeconds -= 1;
      if (timerState.remainingSeconds === 0) {
        timerState.isRunning = false;
        timerState.isFinished = true;
        clearInterval(tickerInterval);
        tickerInterval = null;
        playTimerCompletionChime();
      }
      onUpdate?.();
      dispatchTimerSchema();
    }
  }, 1000);
}

function stopTicker(): void {
  if (tickerInterval) {
    clearInterval(tickerInterval);
    tickerInterval = null;
  }
}

export function handleTimerAction(
  action: OmniAction,
  payload?: Record<string, unknown>,
  onUpdate?: () => void
): OmniComponentNode {
  const mergedPayload = { ...(action.payload || {}), ...(payload || {}) };

  switch (action.name) {
    case "start-timer": {
      if (timerState.isFinished) {
        timerState.remainingSeconds = timerState.totalSeconds;
        timerState.isFinished = false;
      }
      timerState.isRunning = true;
      timerState.isFocusMode = true; // Automatically expand timer to full screen
      startTicker(onUpdate);
      break;
    }

    case "pause-timer": {
      timerState.isRunning = false;
      stopTicker();
      break;
    }

    case "reset-timer": {
      timerState.isRunning = false;
      timerState.isFinished = false;
      timerState.remainingSeconds = timerState.totalSeconds;
      timerState.isFocusMode = false;
      stopTicker();
      break;
    }

    case "toggle-focus": {
      timerState.isFocusMode = !timerState.isFocusMode;
      break;
    }

    case "shrink-timer": {
      timerState.isFocusMode = false;
      break;
    }

    case "expand-timer": {
      timerState.isFocusMode = true;
      break;
    }

    case "adjust-minutes": {
      const delta = Number(mergedPayload.delta) || 0;
      if (delta !== 0) {
        const deltaSec = delta * 60;
        const newTotal = Math.max(60, timerState.totalSeconds + deltaSec);
        timerState.totalSeconds = newTotal;
        timerState.remainingSeconds = Math.max(0, Math.min(newTotal, timerState.remainingSeconds + deltaSec));
        timerState.isFinished = false;
      }
      break;
    }

    case "set-preset": {
      const minutes = Number(mergedPayload.minutes) || 0;
      if (minutes > 0) {
        const newSec = minutes * 60;
        timerState.totalSeconds = newSec;
        timerState.remainingSeconds = newSec;
        timerState.isRunning = false;
        timerState.isFinished = false;
        stopTicker();
      }
      break;
    }
  }

  onUpdate?.();
  dispatchTimerSchema();
  return getTimerSchema(timerState);
}

export function dispatchTimerSchema(): void {
  const schema = getTimerSchema(timerState);
  const rootObj: any =
    (typeof window !== "undefined" ? window : null) ||
    (typeof self !== "undefined" ? self : null) ||
    (typeof globalThis !== "undefined" ? globalThis : null);

  if (!rootObj) return;

  if (rootObj.parent && rootObj.parent !== rootObj) {
    rootObj.parent.postMessage({ type: "omni:schema", componentId: "main", schema }, "*");
  } else if (typeof rootObj.postMessage === "function") {
    rootObj.postMessage({ type: "omni:schema", componentId: "main", schema }, "*");
  }
}

// Listen for action messages from host SchemaRenderer
if (typeof self !== "undefined") {
  self.addEventListener("message", (e: any) => {
    const data = e.data;
    if (data && (data.type === "action" || data.type === "omni:action") && data.action) {
      handleTimerAction(data.action, data.payload);
    }
  });
}

// Initial dispatch
dispatchTimerSchema();
