//// Declarative Schema UI rendering for the Timer plugin (`plugin_timer`).

import gleam/dict
import gleam/dynamic
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import omni/protocol/schema/action
import omni/protocol/schema/builder as schema
import omni/protocol/schema/node.{
  type Node, AlignCenter, Button, ButtonPrimary, Input, InputText,
  JustifyBetween, JustifyCenter, empty_base,
}
import omni/protocol/schema/style.{SizeMd, SizeSm, StyleRaw}
import plugin/timer/model.{
  type Model, Completed, Idle, Paused, Running, disk_background, elapsed_percent,
  format_remaining, status_label,
}

/// Render the full timer view: progress disk, remaining time, presets, controls.
pub fn view(model: Model) -> Node {
  case model.focus_mode {
    True -> render_focus(model)
    False -> render_standard(model)
  }
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

fn render_standard(model: Model) -> Node {
  schema.box()
  |> schema.column
  |> schema.gap("md")
  |> schema.with_style(StyleRaw(
    "padding: 20px; max-width: 520px; margin: 0 auto; text-align: center;",
  ))
  |> schema.children([
    schema.box()
      |> schema.row
      |> schema.justify(JustifyBetween)
      |> schema.children([
        schema.text("Focus Timer"),
        schema.icon_button("external", action.new("toggle-focus")),
      ]),
    render_disk(model, 260),
    schema.text(status_label(model.status)),
    render_fine_adjust(),
    render_presets(model),
    render_custom_input(model),
    render_controls(model),
    schema.text(
      int.to_string(model.completed_sessions) <> " sessions completed",
    ),
  ])
}

fn render_focus(model: Model) -> Node {
  schema.box()
  |> schema.column
  |> schema.gap("md")
  |> schema.with_id("timer-focus")
  |> schema.with_style(StyleRaw(
    "padding: 32px; min-height: 420px; align-items: center; justify-content: center;",
  ))
  |> schema.children([
    render_disk(model, 420) |> schema.action(action.new("toggle-focus")),
    schema.text(status_label(model.status)),
    case model.status {
      Completed -> schema.badge("Time is up")
      _ -> schema.text("Tap the dial to shrink")
    },
  ])
}

fn render_disk(model: Model, size: Int) -> Node {
  let size_str = int.to_string(size)
  let inner = int.to_string(size - 56)
  schema.box()
  |> schema.with_style(StyleRaw(
    "width: "
    <> size_str
    <> "px; height: "
    <> size_str
    <> "px; padding: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: "
    <> disk_background(model)
    <> ";",
  ))
  |> schema.child(
    schema.box()
    |> schema.column
    |> schema.align(AlignCenter)
    |> schema.justify(JustifyCenter)
    |> schema.with_style(StyleRaw(
      "width: "
      <> inner
      <> "px; height: "
      <> inner
      <> "px; border-radius: 50%; background: var(--color-canvas, #141312);",
    ))
    |> schema.children([
      schema.text(format_remaining(model.remaining_sec))
        |> schema.with_style(StyleRaw("font-size: 2.5rem; font-weight: 700;")),
      schema.text(status_label(model.status)),
    ]),
  )
}

fn render_progress(model: Model) -> Node {
  schema.progress(int.to_float(elapsed_percent(model)))
  |> schema.with_id("timer-progress")
  |> schema.with_style(StyleRaw("height: 6px; margin: 10px 0;"))
}

fn render_fine_adjust() -> Node {
  schema.box()
  |> schema.row
  |> schema.justify(JustifyCenter)
  |> schema.gap("xs")
  |> schema.children([
    adjust_button(-5, "-5m"),
    adjust_button(-1, "-1m"),
    adjust_button(1, "+1m"),
    adjust_button(5, "+5m"),
  ])
}

fn adjust_button(delta: Int, label: String) -> Node {
  let act =
    action.new("adjust-minutes")
    |> action.with_payload(dict.from_list([#("delta", dynamic.int(delta))]))
  Button(
    base: empty_base(),
    label: label,
    action: act,
    variant: None,
    size: Some(SizeSm),
    icon: None,
    icon_position: None,
    disabled: None,
    loading: None,
  )
}

fn render_presets(model: Model) -> Node {
  schema.box()
  |> schema.row
  |> schema.justify(JustifyCenter)
  |> schema.wrap(True)
  |> schema.gap("xs")
  |> schema.children(
    list.map([5, 10, 15, 20, 25, 30, 45, 60], fn(minutes) {
      minutes_button(model, minutes)
    }),
  )
}

fn minutes_button(model: Model, minutes: Int) -> Node {
  let act =
    action.new("set-minutes")
    |> action.with_payload(dict.from_list([#("minutes", dynamic.int(minutes))]))
  Button(
    base: empty_base(),
    label: int.to_string(minutes) <> " min",
    action: act,
    variant: case model.duration_sec == minutes * 60 {
      True -> Some(ButtonPrimary)
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
      action_on_change: Some(action.new("set-custom-minutes")),
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
