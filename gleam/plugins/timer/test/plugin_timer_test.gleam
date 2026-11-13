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
  disk_color, elapsed_percent, format_remaining, init, parse_custom_minutes,
  preset_label, preset_seconds, progress_percent, status_label,
}
import plugin/timer/msg.{
  AdjustMinutes, ApplyCustomDuration, Complete, Pause, Reset, Resume,
  SelectPreset, SetCustomMinutes, SetMinutes, Start, Tick, ToggleFocus,
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

pub fn focus_mode_and_adjustments_test() {
  let m = init()
  m.focus_mode |> should.equal(False)

  // Starting a session opens the expanded focus view.
  let #(running, _) = update.update(m, Start)
  running.focus_mode |> should.equal(True)

  let #(shrunk, _) = update.update(running, ToggleFocus)
  shrunk.focus_mode |> should.equal(False)

  // Fine adjust moves in whole minutes and clamps to 1..180.
  let m = Model(..m, duration_sec: 1500, remaining_sec: 1500)
  let #(plus, _) = update.update(m, AdjustMinutes(5))
  plus.duration_sec |> should.equal(1800)
  plus.remaining_sec |> should.equal(1800)
  plus.custom_minutes |> should.equal("30")

  let #(low, _) = update.update(m, AdjustMinutes(-100))
  low.duration_sec |> should.equal(60)

  // Quick presets set the clock and highlight via exact duration.
  let #(twenty, _) = update.update(m, SetMinutes(20))
  twenty.duration_sec |> should.equal(1200)
  twenty.preset |> should.equal(Custom)
  twenty.custom_minutes |> should.equal("20")
}

pub fn disk_colour_tracks_remaining_test() {
  let m = init()
  disk_color(m) |> should.equal("#d4a373")

  let #(done, _) = update.update(m, Complete)
  disk_color(done) |> should.equal("#6fbf8b")

  let low = Model(..m, remaining_sec: 60)
  disk_color(low) |> should.equal("#c8553d")
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

  update.action_to_msg(schema_action("toggle-focus", []))
  |> should.equal(Some(ToggleFocus))

  update.action_to_msg(schema_action("set-minutes", [#("minutes", "20")]))
  |> should.equal(Some(SetMinutes(20)))

  update.action_to_msg(schema_action("adjust-minutes", [#("delta", "-5")]))
  |> should.equal(Some(AdjustMinutes(-5)))

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
  should.be_true(string.contains(wire, "conic-gradient"))
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

pub fn completion_emits_chime_effect_test() {
  let m = model.init()
  let m = model.Model(..m, status: model.Running, remaining_sec: 1)
  let #(done, effects) = update.update(m, Tick)
  done.status |> should.equal(model.Completed)
  should.be_true(
    list.any(effects, fn(effect) {
      case effect {
        app.PlayChime -> True
        _ -> False
      }
    }),
  )
}
