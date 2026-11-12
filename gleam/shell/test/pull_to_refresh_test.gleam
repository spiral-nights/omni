//// Unit tests for the pure pull-to-refresh gesture state machine.

import gleam/option.{None, Some}
import gleeunit/should
import omni/shell/gestures/pull_to_refresh.{
  PullIdle, Pulling, ReadyToRefresh, Refreshing, max_distance_px, on_touch_end,
  on_touch_move, on_touch_start, threshold_px,
}
import omni/shell/msg.{StartPullRefresh}

pub fn touch_start_requires_top_of_scroll_test() {
  on_touch_start(PullIdle, 0.0, 100.0)
  |> should.equal(Pulling(100.0, 100.0, 0.0))
  on_touch_start(PullIdle, 1.0, 100.0)
  |> should.equal(Pulling(100.0, 100.0, 0.0))
  on_touch_start(PullIdle, 1.1, 100.0) |> should.equal(PullIdle)
}

pub fn touch_start_is_ignored_while_refreshing_test() {
  on_touch_start(Refreshing, 0.0, 100.0) |> should.equal(Refreshing)
}

pub fn touch_move_below_threshold_stays_pulling_test() {
  let state = on_touch_start(PullIdle, 0.0, 100.0)
  on_touch_move(state, 100.0 +. threshold_px -. 1.0)
  |> should.equal(Pulling(
    100.0,
    100.0 +. threshold_px -. 1.0,
    threshold_px -. 1.0,
  ))
}

pub fn touch_move_crossing_threshold_becomes_ready_test() {
  let state = on_touch_start(PullIdle, 0.0, 100.0)
  let below = on_touch_move(state, 100.0 +. threshold_px -. 1.0)
  on_touch_move(below, 100.0 +. threshold_px)
  |> should.equal(ReadyToRefresh(threshold_px))
}

pub fn touch_move_clamps_to_max_distance_test() {
  let state = on_touch_start(PullIdle, 0.0, 100.0)
  on_touch_move(state, 100.0 +. max_distance_px +. 50.0)
  |> should.equal(ReadyToRefresh(max_distance_px))
}

pub fn touch_move_upwards_resets_to_idle_test() {
  let state = on_touch_start(PullIdle, 0.0, 100.0)
  on_touch_move(state, 90.0) |> should.equal(PullIdle)
}

pub fn release_at_threshold_emits_start_pull_refresh_test() {
  let state = on_touch_start(PullIdle, 0.0, 100.0)
  let ready = on_touch_move(state, 100.0 +. threshold_px)
  on_touch_end(ready) |> should.equal(#(Refreshing, Some(StartPullRefresh)))
}

pub fn release_below_threshold_does_not_refresh_test() {
  let state = on_touch_start(PullIdle, 0.0, 100.0)
  let pulling = on_touch_move(state, 100.0 +. threshold_px -. 1.0)
  on_touch_end(pulling) |> should.equal(#(PullIdle, None))
}
