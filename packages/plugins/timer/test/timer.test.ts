// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getTimerSchema,
  handleTimerAction,
  timerState,
  formatTime
} from "../src/index.js";

describe("@omni/plugin-timer — Circular Visual Timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    timerState.totalSeconds = 15 * 60;
    timerState.remainingSeconds = 15 * 60;
    timerState.isRunning = false;
    timerState.isFinished = false;
    timerState.showNumbers = true;
    timerState.customMinutesInput = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Time Formatting", () => {
    it("formats seconds into mm:ss accurately", () => {
      expect(formatTime(900)).toBe("15:00");
      expect(formatTime(65)).toBe("1:05");
      expect(formatTime(7)).toBe("0:07");
      expect(formatTime(0)).toBe("0:00");
    });
  });

  describe("Schema Generation", () => {
    it("generates a card containing a circular visual disk progress primitive", () => {
      const schema: any = getTimerSchema(timerState);

      expect(schema.type).toBe("card");
      expect(schema.title).toBe("Visual Timer");
      expect(schema.subtitle).toBe("Ready to start");
      expect(schema.icon).toBe("timer");

      // Verify the visual disk progress element
      const diskBox = schema.children[0];
      expect(diskBox.type).toBe("box");
      const diskPrimitive = diskBox.children[0];
      expect(diskPrimitive.type).toBe("progress");
      expect(diskPrimitive.variant).toBe("disk");
      expect(diskPrimitive.value).toBe(900);
      expect(diskPrimitive.max).toBe(900);
      expect(diskPrimitive.size).toBe(260);
      expect(diskPrimitive.color).toBe("#c85d3e"); // Warm terracotta
      expect(diskPrimitive.label).toBe("15:00");
      expect(diskPrimitive.showTicks).toBe(true);
    });

    it("hides numerical label from the disk when showNumbers is false", () => {
      timerState.showNumbers = false;
      const schema: any = getTimerSchema(timerState);
      const diskPrimitive = schema.children[0].children[0];
      expect(diskPrimitive.label).toBeUndefined();
    });

    it("switches disk color to green when time is completed", () => {
      timerState.isFinished = true;
      timerState.remainingSeconds = 0;
      const schema: any = getTimerSchema(timerState);
      const diskPrimitive = schema.children[0].children[0];
      expect(diskPrimitive.color).toBe("#288755");
      expect(schema.subtitle).toBe("Time is up!");
    });
  });

  describe("Timer Controls & State Machine", () => {
    it("starts, ticks, pauses, and resets the timer", () => {
      // Start
      handleTimerAction({ name: "start-timer" });
      expect(timerState.isRunning).toBe(true);

      // Advance 5 seconds
      vi.advanceTimersByTime(5000);
      expect(timerState.remainingSeconds).toBe(895);

      // Pause
      handleTimerAction({ name: "pause-timer" });
      expect(timerState.isRunning).toBe(false);

      vi.advanceTimersByTime(5000);
      expect(timerState.remainingSeconds).toBe(895); // Unchanged

      // Reset
      handleTimerAction({ name: "reset-timer" });
      expect(timerState.remainingSeconds).toBe(900);
      expect(timerState.isRunning).toBe(false);
    });

    it("granularly adjusts time via +1m, +5m, -1m, -5m", () => {
      // Add 1 minute
      handleTimerAction({ name: "adjust-minutes", payload: { delta: 1 } });
      expect(timerState.totalSeconds).toBe(16 * 60);
      expect(timerState.remainingSeconds).toBe(16 * 60);

      // Add 5 minutes
      handleTimerAction({ name: "adjust-minutes", payload: { delta: 5 } });
      expect(timerState.totalSeconds).toBe(21 * 60);
      expect(timerState.remainingSeconds).toBe(21 * 60);

      // Subtract 1 minute
      handleTimerAction({ name: "adjust-minutes", payload: { delta: -1 } });
      expect(timerState.totalSeconds).toBe(20 * 60);
      expect(timerState.remainingSeconds).toBe(20 * 60);

      // Subtract 5 minutes
      handleTimerAction({ name: "adjust-minutes", payload: { delta: -5 } });
      expect(timerState.totalSeconds).toBe(15 * 60);
      expect(timerState.remainingSeconds).toBe(15 * 60);
    });

    it("sets exact minute duration via typing input", () => {
      handleTimerAction({ name: "set-custom-minutes" }, { customMinutes: "7" });
      expect(timerState.totalSeconds).toBe(7 * 60);
      expect(timerState.remainingSeconds).toBe(7 * 60);

      handleTimerAction({ name: "set-custom-minutes" }, { customMinutes: "24" });
      expect(timerState.totalSeconds).toBe(24 * 60);
      expect(timerState.remainingSeconds).toBe(24 * 60);
    });

    it("sets duration from quick preset buttons", () => {
      handleTimerAction({ name: "set-preset", payload: { minutes: 30 } });
      expect(timerState.totalSeconds).toBe(30 * 60);
      expect(timerState.remainingSeconds).toBe(30 * 60);

      handleTimerAction({ name: "set-preset", payload: { minutes: 5 } });
      expect(timerState.totalSeconds).toBe(5 * 60);
      expect(timerState.remainingSeconds).toBe(5 * 60);
    });

    it("toggles number visibility", () => {
      expect(timerState.showNumbers).toBe(true);
      handleTimerAction({ name: "toggle-numbers" });
      expect(timerState.showNumbers).toBe(false);
      handleTimerAction({ name: "toggle-numbers" });
      expect(timerState.showNumbers).toBe(true);
    });
  });
});
