import { OmniComponentNode } from "@omni/types";
import { TimerState } from "../types.js";

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function getTimerSchema(state: TimerState): OmniComponentNode {
  const isFinished = state.isFinished;
  const isRunning = state.isRunning;
  const remaining = state.remainingSeconds;
  const total = Math.max(1, state.totalSeconds);

  // Status message / title
  let statusText = isFinished
    ? "Time is up!"
    : isRunning
    ? `Running (${formatTime(remaining)} left)`
    : remaining === total
    ? "Ready to start"
    : `Paused (${formatTime(remaining)})`;

  const PRESETS = [5, 10, 15, 20, 30, 45, 60];

  return {
    type: "card",
    title: "Visual Timer",
    subtitle: statusText,
    icon: "timer",
    children: [
      // 1. Circular Visual Disk (Disappearing colored pie slice)
      {
        type: "box",
        direction: "column",
        align: "center",
        justify: "center",
        style: {
          padding: "16px 0",
          width: "100%"
        },
        children: [
          {
            type: "progress",
            variant: "disk",
            value: remaining,
            max: total,
            size: 260,
            color: isFinished ? "#288755" : "#c85d3e", // Calm green on complete, warm terracotta while running
            label: state.showNumbers ? formatTime(remaining) : undefined,
            showTicks: true
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

      // 4. Manual Typing Setter (Set exact minutes)
      {
        type: "box",
        direction: "row",
        align: "center",
        justify: "center",
        gap: "sm",
        style: {
          margin: "4px 0 18px 0",
          maxWidth: "340px"
        },
        children: [
          {
            type: "input",
            name: "customMinutes",
            placeholder: "Minutes (e.g. 7, 24)",
            value: state.customMinutesInput || "",
            inputType: "number"
          },
          {
            type: "button",
            label: "Set",
            variant: "secondary",
            action: { name: "set-custom-minutes" }
          }
        ]
      },

      // 5. Quick Presets
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
      },

      // 6. Child / Visual Preferences (Toggle numbers display)
      {
        type: "box",
        direction: "row",
        align: "center",
        justify: "center",
        gap: "sm",
        style: {
          marginTop: "12px",
          borderTop: "1px solid var(--omni-border-subtle, #262421)",
          paddingTop: "12px",
          width: "100%"
        },
        children: [
          {
            type: "button",
            label: state.showNumbers ? "Hide Numbers (Pure Visual)" : "Show Numbers (Digits)",
            variant: "ghost",
            action: { name: "toggle-numbers" }
          }
        ]
      }
    ]
  };
}
