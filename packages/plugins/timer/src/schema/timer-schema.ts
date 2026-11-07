import { OmniComponentNode } from "@omni/types";
import { TimerState } from "../types.js";

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/**
 * Calculates a smooth dynamic color gradient based on remaining time ratio:
 * - 100% - 50%: Calming cobalt/ocean blue (#388bfd) -> warm amber/gold (#f59e0b)
 * - 50% - 20%: Warm amber/gold (#f59e0b) -> vibrant warning orange (#ea580c)
 * - 20% - 0%: Vibrant orange (#ea580c) -> critical alert crimson (#dc2626)
 * - Completed (0s): Celebratory emerald green (#288755)
 */
export function getTimerDiskColor(remainingSeconds: number, totalSeconds: number, isFinished: boolean): string {
  if (isFinished || remainingSeconds <= 0) {
    return "#288755"; // Celebratory emerald green
  }
  const ratio = Math.max(0, Math.min(1, remainingSeconds / Math.max(1, totalSeconds)));

  let r: number, g: number, b: number;
  if (ratio >= 0.5) {
    // 0.5 .. 1.0 (interpolate from gold to blue)
    const t = (ratio - 0.5) / 0.5; // 0 at 0.5, 1 at 1.0
    r = Math.round(245 + t * (56 - 245));
    g = Math.round(158 + t * (139 - 158));
    b = Math.round(11 + t * (253 - 11));
  } else if (ratio >= 0.2) {
    // 0.2 .. 0.5 (interpolate from orange to gold)
    const t = (ratio - 0.2) / 0.3; // 0 at 0.2, 1 at 0.5
    r = Math.round(234 + t * (245 - 234));
    g = Math.round(88 + t * (158 - 88));
    b = Math.round(12 + t * (11 - 12));
  } else {
    // 0.0 .. 0.2 (interpolate from crimson to orange)
    const t = ratio / 0.2; // 0 at 0.0, 1 at 0.2
    r = Math.round(220 + t * (234 - 220));
    g = Math.round(38 + t * (88 - 38));
    b = Math.round(38 + t * (12 - 38));
  }

  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getTimerSchema(state: TimerState): OmniComponentNode {
  const isFinished = state.isFinished;
  const isRunning = state.isRunning;
  const isFocus = state.isFocusMode;
  const remaining = state.remainingSeconds;
  const total = Math.max(1, state.totalSeconds);
  const diskColor = getTimerDiskColor(remaining, total, isFinished);

  const PRESETS = [5, 10, 15, 20, 30, 45, 60];

  // =========================================================================
  // 1. Full-Screen Focus Countdown Mode (Expanded Disk, Controls Hidden)
  // =========================================================================
  if (isFocus) {
    return {
      type: "card",
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "82vh",
        width: "100%",
        margin: "0 auto",
        textAlign: "center",
        transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        padding: "24px 16px",
        background: "transparent",
        border: "none",
        boxShadow: "none"
      },
      children: [
        // Giant Countdown Disk (Touching it shrinks the timer back to controls)
        {
          type: "box",
          direction: "column",
          align: "center",
          justify: "center",
          style: {
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer"
          },
          action: { name: "toggle-focus" },
          children: [
            {
              type: "progress",
              variant: "disk",
              value: remaining,
              max: total,
              size: 420,
              color: diskColor,
              label: formatTime(remaining),
              showTicks: true,
              action: { name: "toggle-focus" }
            }
          ]
        },

        // Subtle Indicator below the disk
        {
          type: "box",
          direction: "row",
          align: "center",
          justify: "center",
          style: {
            marginTop: "20px",
            cursor: "pointer"
          },
          action: { name: "toggle-focus" },
          children: [
            isFinished
              ? {
                  type: "badge",
                  label: "Time is up! Tap to show controls",
                  tone: "success",
                  variant: "solid"
                }
              : {
                  type: "text",
                  content: "Touch timer to show controls",
                  variant: "caption",
                  tone: "muted",
                  action: { name: "toggle-focus" },
                  style: {
                    cursor: "pointer",
                    opacity: "0.6"
                  }
                }
          ]
        }
      ]
    };
  }

  // =========================================================================
  // 2. Standard Shrunk Mode (Complete Controls & Settings)
  // =========================================================================
  let statusText = isFinished
    ? "Time is up!"
    : isRunning
    ? `Running (${formatTime(remaining)} left)`
    : remaining === total
    ? "Ready to start"
    : `Paused (${formatTime(remaining)})`;

  return {
    type: "card",
    title: "Visual Timer",
    subtitle: statusText,
    icon: "timer",
    style: {
      maxWidth: "520px",
      margin: "0 auto",
      transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)"
    },
    headerAction: {
      type: "icon-button",
      icon: "move",
      tooltip: "Expand timer",
      action: { name: "toggle-focus" }
    },
    children: [
      // 1. Circular Visual Disk (Clickable to expand)
      {
        type: "box",
        direction: "column",
        align: "center",
        justify: "center",
        style: {
          padding: "16px 0",
          width: "100%",
          cursor: "pointer"
        },
        action: { name: "toggle-focus" },
        children: [
          {
            type: "progress",
            variant: "disk",
            value: remaining,
            max: total,
            size: 260,
            color: diskColor,
            label: formatTime(remaining),
            showTicks: true,
            action: { name: "toggle-focus" }
          }
        ]
      },

      // 2. Main Play / Pause / Reset Actions
      {
        type: "box",
        direction: "row",
        align: "center",
        justify: "center",
        gap: "md",
        style: {
          margin: "12px 0 16px 0",
          width: "100%"
        },
        children: [
          {
            type: "button",
            label: isRunning ? "Pause" : isFinished ? "Start Again" : "Start",
            variant: "primary",
            icon: isRunning ? "close" : "bolt",
            action: { name: isRunning ? "pause-timer" : "start-timer" }
          },
          {
            type: "button",
            label: "Reset",
            variant: "secondary",
            icon: "refresh",
            action: { name: "reset-timer" }
          }
        ]
      },

      // 3. Granular Minute Adjustments (-5m, -1m, +1m, +5m)
      {
        type: "box",
        direction: "column",
        align: "center",
        gap: "xs",
        style: {
          margin: "8px 0 16px 0",
          width: "100%"
        },
        children: [
          {
            type: "text",
            content: "Fine Adjustments",
            variant: "caption",
            tone: "secondary"
          },
          {
            type: "box",
            direction: "row",
            align: "center",
            justify: "center",
            gap: "sm",
            wrap: true,
            children: [
              {
                type: "button",
                label: "-5m",
                variant: "secondary",
                action: { name: "adjust-minutes", payload: { delta: -5 } }
              },
              {
                type: "button",
                label: "-1m",
                variant: "secondary",
                action: { name: "adjust-minutes", payload: { delta: -1 } }
              },
              {
                type: "button",
                label: "+1m",
                variant: "secondary",
                action: { name: "adjust-minutes", payload: { delta: 1 } }
              },
              {
                type: "button",
                label: "+5m",
                variant: "secondary",
                action: { name: "adjust-minutes", payload: { delta: 5 } }
              }
            ]
          }
        ]
      },

      // 4. Quick Presets
      {
        type: "box",
        direction: "column",
        align: "center",
        gap: "xs",
        style: {
          margin: "4px 0 12px 0",
          width: "100%"
        },
        children: [
          {
            type: "text",
            content: "Presets",
            variant: "caption",
            tone: "secondary"
          },
          {
            type: "box",
            direction: "row",
            align: "center",
            justify: "center",
            gap: "xs",
            wrap: true,
            children: PRESETS.map((m) => ({
              type: "button" as const,
              label: `${m}m`,
              variant: total === m * 60 && !isFinished ? ("primary" as const) : ("ghost" as const),
              action: { name: "set-preset", payload: { minutes: m } }
            }))
          }
        ]
      }
    ]
  };
}
