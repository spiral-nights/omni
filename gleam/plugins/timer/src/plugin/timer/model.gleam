//// Pure state model and progress helpers for the Timer plugin (`plugin_timer`).

import gleam/int
import gleam/result
import gleam/string

/// Countdown run state.
pub type TimerStatus {
  Idle
  Running
  Paused
  Completed
}

/// Focus preset selection.
pub type TimerPreset {
  Focus25
  Short5
  Long15
  Custom
}

/// Complete immutable state for `plugin_timer`.
pub type Model {
  Model(
    status: TimerStatus,
    preset: TimerPreset,
    duration_sec: Int,
    remaining_sec: Int,
    custom_minutes: String,
    completed_sessions: Int,
  )
}

/// Default focus duration in seconds (25 minutes).
pub const default_focus_seconds = 1500

/// Initialize an idle 25-minute timer.
pub fn init() -> Model {
  Model(
    status: Idle,
    preset: Focus25,
    duration_sec: default_focus_seconds,
    remaining_sec: default_focus_seconds,
    custom_minutes: "25",
    completed_sessions: 0,
  )
}

/// Seconds for a built-in preset (defaults to 25 minutes for `Custom`).
pub fn preset_seconds(preset: TimerPreset) -> Int {
  case preset {
    Focus25 -> 1500
    Short5 -> 300
    Long15 -> 900
    Custom -> 1500
  }
}

/// Human-readable preset label.
pub fn preset_label(preset: TimerPreset) -> String {
  case preset {
    Focus25 -> "25 min"
    Short5 -> "5 min"
    Long15 -> "15 min"
    Custom -> "Custom"
  }
}

/// Percent of the current duration remaining (0-100).
pub fn progress_percent(model: Model) -> Int {
  case model.duration_sec {
    duration if duration <= 0 -> 0
    duration -> model.remaining_sec * 100 / duration
  }
}

/// Elapsed percent of the current duration (0-100), used for the progress disk.
pub fn elapsed_percent(model: Model) -> Int {
  100 - progress_percent(model)
}

/// Status label for display.
pub fn status_label(status: TimerStatus) -> String {
  case status {
    Idle -> "Ready"
    Running -> "Focusing"
    Paused -> "Paused"
    Completed -> "Session complete"
  }
}

/// Format seconds as `MM:SS`.
pub fn format_remaining(seconds: Int) -> String {
  let safe = case seconds < 0 {
    True -> 0
    False -> seconds
  }
  let minutes = safe / 60
  let secs = int.modulo(safe, 60) |> result.unwrap(0)
  pad2(minutes) <> ":" <> pad2(secs)
}

fn pad2(value: Int) -> String {
  case value < 10 {
    True -> "0" <> int.to_string(value)
    False -> int.to_string(value)
  }
}

/// Parse a custom duration in minutes (clamped to 1-180). Returns `0` when invalid.
pub fn parse_custom_minutes(raw: String) -> Int {
  case int.parse(string.trim(raw)) {
    Ok(minutes) if minutes >= 1 && minutes <= 180 -> minutes
    _ -> 0
  }
}
