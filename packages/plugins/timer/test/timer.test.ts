// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getTimerSchema,
  handleTimerAction,
  timerState,
  formatTime,
  getTimerDiskColor
} from "../src/index.js";

describe("@omni/plugin-timer — Child-Friendly Circular Visual Timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    timerState.totalSeconds = 15 * 60;
    timerState.remainingSeconds = 15 * 60;
    timerState.isRunning = false;
    timerState.isFinished = false;
    timerState.isFocusMode = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Time Formatting & Dynamic Color Transitions", () => {
    it("formats seconds into mm:ss accurately", () => {
      expect(formatTime(900)).toBe("15:00");
      expect(formatTime(65)).toBe("1:05");
      expect(formatTime(7)).toBe("0:07");
      expect(formatTime(0)).toBe("0:00");
    });

    it("changes disk color dynamically as time gets closer to 0", () => {
      const total = 1000;
      // 100% time left -> Serene cobalt blue (#388bfd)
      expect(getTimerDiskColor(1000, total, false)).toBe("#388bfd");

      // 50% time left -> Warm amber/gold (#f59e0b)
      expect(getTimerDiskColor(500, total, false)).toBe("#f59e0b");

      // 20% time left -> Warning orange (#ea580c)
      expect(getTimerDiskColor(200, total, false)).toBe("#ea580c");

      // 1% time left -> Critical red/crimson
      const criticalColor = getTimerDiskColor(10, total, false);
      expect(criticalColor.startsWith("#d") || criticalColor.startsWith("#e")).toBe(true);

      // Finished (0s) -> Celebratory emerald green (#288755)
      expect(getTimerDiskColor(0, total, true)).toBe("#288755");
    });
  });

  describe("Schema Generation & Shrunk vs Focus Modes", () => {
    it("generates standard shrunk view with size 260 and all controls", () => {
      timerState.isFocusMode = false;
      const schema: any = getTimerSchema(timerState);

      expect(schema.type).toBe("card");
      expect(schema.title).toBe("Visual Timer");
      expect(schema.subtitle).toBe("Ready to start");
      expect(schema.icon).toBe("timer");
      expect(schema.headerAction).toBeDefined();

      // Verify the visual disk progress element
      const diskBox = schema.children[0];
      expect(diskBox.type).toBe("box");
      const diskPrimitive = diskBox.children[0];
      expect(diskPrimitive.type).toBe("progress");
      expect(diskPrimitive.variant).toBe("disk");
      expect(diskPrimitive.size).toBe(260);
      expect(diskPrimitive.color).toBe("#388bfd");
      expect(diskPrimitive.label).toBe("15:00");
      expect(diskPrimitive.action).toEqual({ name: "expand-timer" });

      // Verify controls exist (Start/Pause/Reset, Adjustments, Presets)
      expect(schema.children.length).toBe(4);
      // Ensure custom typing input and toggle-numbers buttons are removed
      const serialized = JSON.stringify(schema);
      expect(serialized.includes('"type":"input"')).toBe(false);
      expect(serialized.includes("toggle-numbers")).toBe(false);
    });

    it("generates expanded focus view when isFocusMode is true", () => {
      timerState.isFocusMode = true;
      const schema: any = getTimerSchema(timerState);

      expect(schema.type).toBe("card");
      // Header controls and extra cards are hidden in focus mode
      expect(schema.title).toBeUndefined();
      expect(schema.children.length).toBe(2);

      // Giant countdown disk with size 420
      const diskBox = schema.children[0];
      const diskPrimitive = diskBox.children[0];
      expect(diskPrimitive.size).toBe(420);
      expect(diskPrimitive.label).toBe("15:00");
      expect(diskPrimitive.action).toEqual({ name: "shrink-timer" });

      // Indicator to show controls
      const indicatorBox = schema.children[1];
      expect(indicatorBox.action).toEqual({ name: "shrink-timer" });
    });
  });

  describe("Timer Controls & Focus Expansion State Machine", () => {
    it("automatically expands to focus mode when timer starts", () => {
      expect(timerState.isFocusMode).toBe(false);
      handleTimerAction({ name: "start-timer" });
      expect(timerState.isRunning).toBe(true);
      expect(timerState.isFocusMode).toBe(true);

      // Advance 10 seconds
      vi.advanceTimersByTime(10000);
      expect(timerState.remainingSeconds).toBe(890);
    });

    it("shrinks back to normal UI when toggle-focus or shrink-timer is triggered", () => {
      handleTimerAction({ name: "start-timer" });
      expect(timerState.isFocusMode).toBe(true);

      // Touching the timer disk triggers toggle-focus
      handleTimerAction({ name: "toggle-focus" });
      expect(timerState.isFocusMode).toBe(false);

      // Timer remains running while shrunk so user can adjust or pause
      expect(timerState.isRunning).toBe(true);

      // Touching again re-expands
      handleTimerAction({ name: "toggle-focus" });
      expect(timerState.isFocusMode).toBe(true);
    });

    it("pauses and resets the timer, restoring shrunk state on reset", () => {
      handleTimerAction({ name: "start-timer" });
      expect(timerState.isFocusMode).toBe(true);

      handleTimerAction({ name: "pause-timer" });
      expect(timerState.isRunning).toBe(false);

      handleTimerAction({ name: "reset-timer" });
      expect(timerState.remainingSeconds).toBe(900);
      expect(timerState.isRunning).toBe(false);
      expect(timerState.isFocusMode).toBe(false);
    });

    it("granularly adjusts time via +1m, +5m, -1m, -5m", () => {
      handleTimerAction({ name: "adjust-minutes", payload: { delta: 1 } });
      expect(timerState.totalSeconds).toBe(16 * 60);
      expect(timerState.remainingSeconds).toBe(16 * 60);

      handleTimerAction({ name: "adjust-minutes", payload: { delta: 5 } });
      expect(timerState.totalSeconds).toBe(21 * 60);
      expect(timerState.remainingSeconds).toBe(21 * 60);

      handleTimerAction({ name: "adjust-minutes", payload: { delta: -1 } });
      expect(timerState.totalSeconds).toBe(20 * 60);
      expect(timerState.remainingSeconds).toBe(20 * 60);

      handleTimerAction({ name: "adjust-minutes", payload: { delta: -5 } });
      expect(timerState.totalSeconds).toBe(15 * 60);
      expect(timerState.remainingSeconds).toBe(15 * 60);
    });

    it("sets duration from quick preset buttons", () => {
      handleTimerAction({ name: "set-preset", payload: { minutes: 30 } });
      expect(timerState.totalSeconds).toBe(30 * 60);
      expect(timerState.remainingSeconds).toBe(30 * 60);

      handleTimerAction({ name: "set-preset", payload: { minutes: 5 } });
      expect(timerState.totalSeconds).toBe(5 * 60);
      expect(timerState.remainingSeconds).toBe(5 * 60);
    });
  });
});
