//// Pure Elm-style state transitions and action mapping for `plugin_timer`.

import gleam/int
import gleam/option.{type Option, None, Some}
import omni/plugin_kit/app.{type Effect, PlayChime}
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import plugin/timer/model.{
  type Model, type TimerPreset, Completed, Custom, Focus25, Idle, Long15, Model,
  Paused, Running, Short5,
}
import plugin/timer/msg.{
  type Msg, ApplyCustomDuration, Complete, Pause, Reset, Resume, SelectPreset,
  SetCustomMinutes, Start, Tick,
}

/// Apply a `Msg` to `model`, returning the updated `Model` and effects.
pub fn update(model: Model, msg: Msg) -> #(Model, List(Effect(Msg))) {
  case msg {
    Start ->
      case model.status {
        Completed -> #(Model(..reset_timer(model), status: Running), [])
        _ -> #(Model(..model, status: Running), [])
      }

    Pause ->
      case model.status {
        Running -> #(Model(..model, status: Paused), [])
        _ -> #(model, [])
      }

    Resume ->
      case model.status {
        Paused -> #(Model(..model, status: Running), [])
        _ -> #(model, [])
      }

    Reset -> #(reset_timer(model), [])

    Tick ->
      case model.status {
        Running ->
          case model.remaining_sec <= 1 {
            True -> #(
              Model(
                ..model,
                status: Completed,
                remaining_sec: 0,
                completed_sessions: model.completed_sessions + 1,
              ),
              [PlayChime],
            )
            False -> #(
              Model(..model, remaining_sec: model.remaining_sec - 1),
              [],
            )
          }
        _ -> #(model, [])
      }

    Complete ->
      case model.status {
        Completed -> #(model, [])
        _ -> #(
          Model(
            ..model,
            status: Completed,
            remaining_sec: 0,
            completed_sessions: model.completed_sessions + 1,
          ),
          [PlayChime],
        )
      }

    SelectPreset(preset) -> #(apply_preset(model, preset), [])

    SetCustomMinutes(raw) -> #(Model(..model, custom_minutes: raw), [])

    ApplyCustomDuration -> {
      case model.parse_custom_minutes(model.custom_minutes) {
        0 -> #(model, [])
        minutes -> #(
          Model(
            ..model,
            preset: Custom,
            status: Idle,
            duration_sec: minutes * 60,
            remaining_sec: minutes * 60,
          ),
          [],
        )
      }
    }
  }
}

fn reset_timer(model: Model) -> Model {
  Model(..model, status: Idle, remaining_sec: model.duration_sec)
}

fn apply_preset(model: Model, preset: TimerPreset) -> Model {
  let seconds = model.preset_seconds(preset)
  Model(
    ..model,
    preset: preset,
    status: Idle,
    duration_sec: seconds,
    remaining_sec: seconds,
    custom_minutes: case preset {
      Custom -> model.custom_minutes
      _ -> int.to_string(seconds / 60)
    },
  )
}

/// Decode an incoming Schema `Action` into a timer `Msg`.
pub fn action_to_msg(act: Action) -> Option(Msg) {
  case act.name {
    "start" | "start-timer" | "start_timer" -> Some(Start)
    "pause" | "pause-timer" | "pause_timer" -> Some(Pause)
    "resume" | "resume-timer" | "resume_timer" -> Some(Resume)
    "reset" | "reset-timer" | "reset_timer" -> Some(Reset)
    "tick" | "timer-tick" | "timer_tick" -> Some(Tick)
    "complete" | "complete-timer" | "complete_timer" -> Some(Complete)
    "select-preset" | "select_preset" | "set-preset" | "set_preset" ->
      case schema.payload_string(act, "preset") {
        Some(raw) -> Some(SelectPreset(preset_from_id(raw)))
        None -> None
      }
    "set-custom-minutes" | "set_custom_minutes" | "set-custom" ->
      case payload_value(act, "minutes") {
        Some(raw) -> Some(SetCustomMinutes(raw))
        None -> None
      }
    "apply-custom-duration" | "apply_custom_duration" ->
      Some(ApplyCustomDuration)
    "input" | "change" ->
      case schema.payload_string(act, "name") {
        Some("custom_minutes") | Some("minutes") ->
          case payload_value(act, "minutes") {
            Some(raw) -> Some(SetCustomMinutes(raw))
            None -> None
          }
        _ -> None
      }
    _ -> None
  }
}

fn payload_value(act: Action, fallback_key: String) -> Option(String) {
  case schema.payload_string(act, "value") {
    Some(value) -> Some(value)
    None -> schema.payload_string(act, fallback_key)
  }
}

/// Map a preset string ID to a `TimerPreset`.
pub fn preset_from_id(raw: String) -> TimerPreset {
  case raw {
    "5" | "short" | "short5" | "short-5" -> Short5
    "15" | "long" | "long15" | "long-15" -> Long15
    "custom" -> Custom
    _ -> Focus25
  }
}

/// Map a `TimerPreset` to its string ID used in action payloads and Schema tabs.
pub fn preset_id(preset: TimerPreset) -> String {
  case preset {
    Focus25 -> "focus"
    Short5 -> "short"
    Long15 -> "long"
    Custom -> "custom"
  }
}
