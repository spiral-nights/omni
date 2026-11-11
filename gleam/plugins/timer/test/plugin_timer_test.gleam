//// Unit tests for the Timer plugin (`plugin_timer`, Phase 7.4).

import gleam/dict
import gleam/dynamic
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/plugin_kit/app
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import plugin/timer/main as timer_main
import plugin/timer/model.{
  Completed, Custom, Focus25, Idle, Long15, Model, Paused, Running, Short5,
  elapsed_percent, format_remaining, init, parse_custom_minutes, preset_label,
  preset_seconds, progress_percent, status_label,
}
import plugin/timer/msg.{
  ApplyCustomDuration, Complete, Pause, Reset, Resume, SelectPreset,
  SetCustomMinutes, Start, Tick,
}
import plugin/timer/update
import plugin/timer/view

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn init_and_formatting_test() {
  let m = init()
  m.status |> should.equal(Idle)
  m.preset |> should.equal(Focus25)
  m.remaining_sec |> should.equal(1500)
  m.completed_sessions |> should.equal(0)

  format_remaining(1500) |> should.equal("25:00")
  format_remaining(9) |> should.equal("00:09")
  format_remaining(0) |> should.equal("00:00")
  format_remaining(-5) |> should.equal("00:00")

  status_label(Idle) |> should.equal("Ready")
  status_label(Running) |> should.equal("Focusing")
  status_label(Paused) |> should.equal("Paused")
  status_label(Completed) |> should.equal("Session complete")
}

pub fn presets_test() {
  preset_seconds(Focus25) |> should.equal(1500)
  preset_seconds(Short5) |> should.equal(300)
  preset_seconds(Long15) |> should.equal(900)
  preset_label(Short5) |> should.equal("5 min")

  let #(m1, _) = update.update(init(), SelectPreset(Short5))
  m1.duration_sec |> should.equal(300)
  m1.remaining_sec |> should.equal(300)
  m1.status |> should.equal(Idle)
  m1.custom_minutes |> should.equal("5")
}

pub fn start_pause_resume_reset_test() {
  let #(m1, _) = update.update(init(), Start)
  m1.status |> should.equal(Running)

  let #(m2, _) = update.update(m1, Pause)
  m2.status |> should.equal(Paused)

  let #(m3, _) = update.update(m2, Resume)
  m3.status |> should.equal(Running)

  let #(m4, _) = update.update(m3, Tick)
  m4.remaining_sec |> should.equal(1499)

  let #(m5, _) = update.update(m4, Reset)
  m5.status |> should.equal(Idle)
  m5.remaining_sec |> should.equal(1500)
}

pub fn tick_only_while_running_test() {
  // Tick while idle is ignored.
  let #(m_idle, _) = update.update(init(), Tick)
  m_idle.remaining_sec |> should.equal(1500)

  let #(m_run, _) = update.update(init(), Start)
  let #(m_tick, _) = update.update(m_run, Tick)
  m_tick.remaining_sec |> should.equal(1499)
}

pub fn countdown_completes_test() {
  let #(m_run, _) = update.update(init(), Start)
  let near_done = Model(..m_run, remaining_sec: 1)
  let #(m_done, _) = update.update(near_done, Tick)

  m_done.status |> should.equal(Completed)
  m_done.remaining_sec |> should.equal(0)
  m_done.completed_sessions |> should.equal(1)

  // Completing an already-complete session does not double count.
  let #(m_again, _) = update.update(m_done, Complete)
  m_again.completed_sessions |> should.equal(1)

  // Restarting a completed session resets the clock and runs again.
  let #(m_restart, _) = update.update(m_done, Start)
  m_restart.status |> should.equal(Running)
  m_restart.remaining_sec |> should.equal(1500)
}

pub fn complete_message_test() {
  let #(m1, _) = update.update(init(), Complete)
  m1.status |> should.equal(Completed)
  m1.completed_sessions |> should.equal(1)
}

pub fn custom_duration_test() {
  parse_custom_minutes("45") |> should.equal(45)
  parse_custom_minutes(" 7 ") |> should.equal(7)
  parse_custom_minutes("0") |> should.equal(0)
  parse_custom_minutes("181") |> should.equal(0)
  parse_custom_minutes("abc") |> should.equal(0)

  let #(m1, _) = update.update(init(), SetCustomMinutes("45"))
  let #(m2, _) = update.update(m1, ApplyCustomDuration)
  m2.preset |> should.equal(Custom)
  m2.duration_sec |> should.equal(2700)
  m2.remaining_sec |> should.equal(2700)

  // Invalid custom input leaves the model unchanged.
  let #(m3, _) = update.update(m2, SetCustomMinutes("999"))
  let #(m4, _) = update.update(m3, ApplyCustomDuration)
  m4.duration_sec |> should.equal(2700)
}

pub fn progress_percent_test() {
  let m = init()
  progress_percent(m) |> should.equal(100)
  elapsed_percent(m) |> should.equal(0)

  let halfway = Model(..m, remaining_sec: 750)
  progress_percent(halfway) |> should.equal(50)
  elapsed_percent(halfway) |> should.equal(50)
}

pub fn action_mapping_test() {
  update.action_to_msg(schema_action("start", [])) |> should.equal(Some(Start))
  update.action_to_msg(schema_action("pause-timer", []))
  |> should.equal(Some(Pause))
  update.action_to_msg(schema_action("resume", []))
  |> should.equal(Some(Resume))
  update.action_to_msg(schema_action("reset", [])) |> should.equal(Some(Reset))
  update.action_to_msg(schema_action("tick", [])) |> should.equal(Some(Tick))
  update.action_to_msg(schema_action("complete", []))
  |> should.equal(Some(Complete))

  update.action_to_msg(schema_action("select-preset", [#("preset", "short")]))
  |> should.equal(Some(SelectPreset(Short5)))
  update.action_to_msg(schema_action("select-preset", [#("preset", "long")]))
  |> should.equal(Some(SelectPreset(Long15)))
  update.action_to_msg(schema_action("select-preset", [#("preset", "custom")]))
  |> should.equal(Some(SelectPreset(Custom)))

  update.action_to_msg(schema_action("set-custom-minutes", [#("value", "30")]))
  |> should.equal(Some(SetCustomMinutes("30")))

  update.action_to_msg(schema_action("apply-custom-duration", []))
  |> should.equal(Some(ApplyCustomDuration))

  update.action_to_msg(
    schema_action("input", [#("name", "custom_minutes"), #("value", "12")]),
  )
  |> should.equal(Some(SetCustomMinutes("12")))

  update.action_to_msg(schema_action("unknown", []))
  |> should.equal(None)
}

pub fn preset_id_round_trip_test() {
  update.preset_id(Focus25) |> should.equal("focus")
  update.preset_id(Short5) |> should.equal("short")
  update.preset_id(Long15) |> should.equal("long")
  update.preset_id(Custom) |> should.equal("custom")

  list.each([Focus25, Short5, Long15, Custom], fn(preset) {
    update.preset_from_id(update.preset_id(preset))
    |> should.equal(preset)
  })
}

pub fn view_renders_timer_and_widget_test() {
  let m = init()
  let wire = view.view(m) |> schema.encode_schema_message
  should.be_true(string.contains(wire, "25:00"))
  should.be_true(string.contains(wire, "Focus Timer"))
  should.be_true(string.contains(wire, "timer-progress"))
  should.be_true(string.contains(wire, "Start"))

  let running = Model(..m, status: Running)
  let running_wire = view.view(running) |> schema.encode_schema_message
  should.be_true(string.contains(running_wire, "Pause"))

  let widget_wire = view.view_widget(m) |> schema.encode_schema_message
  should.be_true(string.contains(widget_wire, "timer-widget"))
  should.be_true(string.contains(widget_wire, "25:00"))
}

pub fn running_apps_emit_schema_test() {
  let running = timer_main.start_app("", fn(_node) { Nil })
  let wire = running |> app.current_view |> schema.encode_schema_message
  should.be_true(string.contains(wire, "Focus Timer"))

  let widget = timer_main.start_widget_app("", fn(_node) { Nil })
  let widget_wire = widget |> app.current_view |> schema.encode_schema_message
  should.be_true(string.contains(widget_wire, "timer-widget"))
}

// Test-only helpers -----------------------------------------------------------

fn schema_action(name: String, fields: List(#(String, String))) -> Action {
  let payload =
    fields
    |> list.map(fn(pair) { #(pair.0, dynamic.string(pair.1)) })
    |> dict.from_list
  action.new(name) |> action.with_payload(payload)
}
