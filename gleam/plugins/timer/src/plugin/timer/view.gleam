//// Declarative Schema UI rendering for the Timer plugin (`plugin_timer`).

import gleam/dict
import gleam/dynamic
import gleam/int
import gleam/option.{None, Some}
import omni/protocol/schema/action
import omni/protocol/schema/builder as schema
import omni/protocol/schema/node.{
  type Node, Button, Input, InputText, JustifyBetween, JustifyCenter, empty_base,
}
import omni/protocol/schema/style.{SizeMd, SizeSm, StyleRaw}
import plugin/timer/model.{
  type Model, Completed, Idle, Paused, Running, elapsed_percent,
  format_remaining, status_label,
}
import plugin/timer/update.{preset_id}

/// Render the full timer view: progress disk, remaining time, presets, controls.
pub fn view(model: Model) -> Node {
  schema.box()
  |> schema.column
  |> schema.gap("md")
  |> schema.with_style(StyleRaw(
    "padding: 20px; max-width: 520px; margin: 0 auto; text-align: center;",
  ))
  |> schema.children([
    schema.text("Focus Timer"),
    schema.text(status_label(model.status)),
    render_progress(model),
    schema.text(format_remaining(model.remaining_sec))
      |> schema.with_style(StyleRaw("font-size: 3rem; font-weight: 700;")),
    render_presets(model),
    render_custom_input(model),
    render_controls(model),
    schema.text(
      int.to_string(model.completed_sessions) <> " sessions completed",
    ),
  ])
}

/// Render the compact widget view.
pub fn view_widget(model: Model) -> Node {
  schema.box()
  |> schema.column
  |> schema.gap("xs")
  |> schema.with_id("timer-widget")
  |> schema.children([
    schema.box()
      |> schema.row
      |> schema.justify(JustifyBetween)
      |> schema.children([
        schema.text(format_remaining(model.remaining_sec)),
        schema.text(status_label(model.status)),
      ]),
    render_progress(model),
    render_widget_controls(model),
  ])
}

fn render_progress(model: Model) -> Node {
  schema.progress(int.to_float(elapsed_percent(model)))
  |> schema.with_id("timer-progress")
  |> schema.with_style(StyleRaw("height: 6px; margin: 10px 0;"))
}

fn render_presets(model: Model) -> Node {
  schema.box()
  |> schema.row
  |> schema.justify(JustifyCenter)
  |> schema.gap("xs")
  |> schema.children([
    preset_button(model, "focus", "25 min"),
    preset_button(model, "short", "5 min"),
    preset_button(model, "long", "15 min"),
    preset_button(model, "custom", "Custom"),
  ])
}

fn preset_button(model: Model, id: String, label: String) -> Node {
  let act =
    action.new("select-preset")
    |> action.with_payload(dict.from_list([#("preset", dynamic.string(id))]))

  Button(
    base: empty_base(),
    label: label,
    action: act,
    variant: case preset_id(model.preset) == id {
      True -> None
      False -> None
    },
    size: Some(SizeSm),
    icon: None,
    icon_position: None,
    disabled: None,
    loading: None,
  )
}

fn render_custom_input(model: Model) -> Node {
  let minutes_input =
    Input(
      base: empty_base(),
      name: "custom_minutes",
      placeholder: Some("Minutes (1-180)"),
      value: Some(model.custom_minutes),
      input_type: Some(InputText),
      accept: None,
      clearable: None,
      prefix_icon: None,
      action_on_enter: Some(action.new("apply-custom-duration")),
      action_on_change: None,
    )

  let apply_btn =
    Button(
      base: empty_base(),
      label: "Set",
      action: action.new("apply-custom-duration"),
      variant: None,
      size: Some(SizeSm),
      icon: None,
      icon_position: None,
      disabled: None,
      loading: None,
    )

  schema.box()
  |> schema.row
  |> schema.justify(JustifyCenter)
  |> schema.gap("xs")
  |> schema.children([minutes_input, apply_btn])
}

fn render_controls(model: Model) -> Node {
  schema.box()
  |> schema.row
  |> schema.justify(JustifyCenter)
  |> schema.gap("sm")
  |> schema.children([
    primary_control(model),
    reset_button(),
  ])
}

fn primary_control(model: Model) -> Node {
  let #(label, action_name) = case model.status {
    Idle -> #("Start", "start")
    Running -> #("Pause", "pause")
    Paused -> #("Resume", "resume")
    Completed -> #("Restart", "start")
  }

  Button(
    base: empty_base(),
    label: label,
    action: action.new(action_name),
    variant: None,
    size: Some(SizeMd),
    icon: Some(case model.status {
      Running -> "clock"
      _ -> "timer"
    }),
    icon_position: None,
    disabled: None,
    loading: None,
  )
}

fn reset_button() -> Node {
  Button(
    base: empty_base(),
    label: "Reset",
    action: action.new("reset"),
    variant: None,
    size: Some(SizeMd),
    icon: Some("refresh"),
    icon_position: None,
    disabled: None,
    loading: None,
  )
}

fn render_widget_controls(model: Model) -> Node {
  let #(label, action_name) = case model.status {
    Idle -> #("Start", "start")
    Running -> #("Pause", "pause")
    Paused -> #("Resume", "resume")
    Completed -> #("Restart", "start")
  }

  Button(
    base: empty_base(),
    label: label,
    action: action.new(action_name),
    variant: None,
    size: Some(SizeSm),
    icon: None,
    icon_position: None,
    disabled: None,
    loading: None,
  )
}
