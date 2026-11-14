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
  type Msg, AdjustMinutes, ApplyCustomDuration, Complete, Pause, Reset, Resume,
  SelectPreset, SetCustomMinutes, SetFocus, SetMinutes, Start, Tick, ToggleFocus,
}

/// Apply a `Msg` to `model`, returning the updated `Model` and effects.
pub fn update(model: Model, msg: Msg) -> #(Model, List(Effect(Msg))) {
  case msg {
    Start ->
      case model.status {
        Completed -> #(
          Model(..reset_timer(model), status: Running, focus_mode: True),
          [],
        )
        _ -> #(Model(..model, status: Running, focus_mode: True), [])
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
        minutes -> #(set_minutes(model, minutes), [])
      }
    }

    SetMinutes(minutes) -> #(set_minutes(model, clamp_minutes(minutes)), [])

    ToggleFocus -> #(Model(..model, focus_mode: !model.focus_mode), [])

    SetFocus(focused) -> #(Model(..model, focus_mode: focused), [])

    AdjustMinutes(delta) -> #(adjust_minutes(model, delta), [])
  }
}

fn adjust_minutes(model: Model, delta: Int) -> Model {
  let new_minutes = clamp_minutes(model.duration_sec / 60 + delta)
  let new_duration_sec = new_minutes * 60
  let delta_sec = new_duration_sec - model.duration_sec
  case model.status {
    Running | Paused ->
      Model(
        ..model,
        preset: Custom,
        duration_sec: new_duration_sec,
        remaining_sec: clamp_remaining(
          model.remaining_sec + delta_sec,
          new_duration_sec,
        ),
        custom_minutes: int.to_string(new_minutes),
      )
    Idle | Completed -> set_minutes(model, new_minutes)
  }
}

fn clamp_remaining(remaining: Int, duration: Int) -> Int {
  case remaining {
    r if r < 0 -> 0
    r if r > duration -> duration
    r -> r
  }
}

fn set_minutes(model: Model, minutes: Int) -> Model {
  Model(
    ..model,
    preset: Custom,
    status: Idle,
    duration_sec: minutes * 60,
    remaining_sec: minutes * 60,
    custom_minutes: int.to_string(minutes),
  )
}

fn clamp_minutes(minutes: Int) -> Int {
  case minutes {
    m if m < 1 -> 1
    m if m > 180 -> 180
    m -> m
  }
}

fn reset_timer(model: Model) -> Model {
  Model(
    ..model,
    status: Idle,
    remaining_sec: model.duration_sec,
    focus_mode: False,
  )
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
        None ->
          case payload_int(act, "minutes") {
            Some(5) -> Some(SelectPreset(Short5))
            Some(15) -> Some(SelectPreset(Long15))
            Some(25) -> Some(SelectPreset(Focus25))
            Some(minutes) -> Some(SetMinutes(minutes))
            None -> None
          }
      }
    "set-custom-minutes" | "set_custom_minutes" | "set-custom" ->
      case payload_value(act, "minutes") {
        Some(raw) -> Some(SetCustomMinutes(raw))
        None -> None
      }
    "apply-custom-duration" | "apply_custom_duration" ->
      Some(ApplyCustomDuration)
    "set-minutes" | "set_minutes" ->
      case payload_int(act, "minutes") {
        Some(minutes) -> Some(SetMinutes(minutes))
        None -> None
      }
    "toggle-focus" | "toggle_focus" | "focus-mode" | "focus_mode" ->
      Some(ToggleFocus)
    "expand-timer" | "expand_timer" -> Some(SetFocus(True))
    "shrink-timer" | "shrink_timer" -> Some(SetFocus(False))
    "adjust-minutes" | "adjust_minutes" ->
      case payload_int(act, "delta") {
        Some(delta) -> Some(AdjustMinutes(delta))
        None -> None
      }
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

fn payload_int(act: Action, key: String) -> Option(Int) {
  case schema.payload_int(act, key) {
    Some(value) -> Some(value)
    None ->
      case schema.payload_string(act, key) {
        Some(raw) ->
          case int.parse(raw) {
            Ok(value) -> Some(value)
            Error(_) -> None
          }
        None -> None
      }
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
