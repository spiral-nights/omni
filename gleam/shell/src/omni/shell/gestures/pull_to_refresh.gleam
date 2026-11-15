//// Pure pull-to-refresh gesture state machine and visual indicator view.
////
//// Conforms to Warm Paper Dark styling and monochrome SVG iconography.

import gleam/float
import gleam/option.{type Option, None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import omni/shell/model.{
  type Model, type PullState, PullIdle, Pulling, ReadyToRefresh, Refreshing,
}
import omni/shell/msg.{type Msg, StartPullRefresh}
import omni/ui/icons

/// Pull distance threshold in pixels required to trigger a refresh on release.
pub const threshold_px = 50.0

/// Maximum visual pull distance in pixels.
pub const max_distance_px = 90.0

/// Handle a touch start event. Only initiates pulling when at the top of the scroll container (`scroll_top <= 1.0`).
pub fn on_touch_start(
  state: PullState,
  scroll_top: Float,
  client_y: Float,
) -> PullState {
  case state {
    Refreshing -> Refreshing
    _ ->
      case scroll_top <=. 1.0 {
        True -> Pulling(start_y: client_y, current_y: client_y, distance: 0.0)
        False -> PullIdle
      }
  }
}

/// Handle a touch move event, updating the damped pull distance and transitioning between
/// `Pulling` and `ReadyToRefresh` when crossing `threshold_px`.
pub fn on_touch_move(state: PullState, client_y: Float) -> PullState {
  case state {
    PullIdle -> PullIdle
    Refreshing -> Refreshing
    Pulling(start_y, _, _) -> update_pull_distance(start_y, client_y)
    ReadyToRefresh(prev_dist) -> {
      // Reconstruct the effective touch origin so pulling further down or
      // moving back up above the threshold transitions smoothly.
      let synthetic_start_y = client_y -. prev_dist
      let next_start_y = case synthetic_start_y >. 0.0 {
        True -> synthetic_start_y
        False -> 0.0
      }
      update_pull_distance(next_start_y, client_y)
    }
  }
}

fn update_pull_distance(start_y: Float, client_y: Float) -> PullState {
  let raw_delta = client_y -. start_y
  case raw_delta <=. 0.0 {
    True -> PullIdle
    False -> {
      let clamped = float.min(raw_delta, max_distance_px)
      case clamped >=. threshold_px {
        True -> ReadyToRefresh(distance: clamped)
        False ->
          Pulling(start_y: start_y, current_y: client_y, distance: clamped)
      }
    }
  }
}

/// Handle touch end / release. Emits `Some(StartPullRefresh)` and transitions to
/// `Refreshing` when released in `ReadyToRefresh`, otherwise resets to `PullIdle`.
pub fn on_touch_end(state: PullState) -> #(PullState, Option(Msg)) {
  case state {
    ReadyToRefresh(_) -> #(Refreshing, Some(StartPullRefresh))
    Refreshing -> #(Refreshing, None)
    Pulling(_, _, _) | PullIdle -> #(PullIdle, None)
  }
}

/// Render the pull-to-refresh top indicator (`<div id="omni-pull-to-refresh">`).
pub fn render_indicator(model: Model, pull_state: PullState) -> Element(Msg) {
  let effective_state = case model.pull_refreshing {
    True -> Refreshing
    False -> pull_state
  }

  let #(state_class, label, icon_name, distance_str, style_attr) = case
    effective_state
  {
    PullIdle -> #(
      "omni-pull-to-refresh",
      "pull down to refresh",
      "refresh",
      "0",
      "transform: translate(-50%, -100%); opacity: 0;",
    )
    Pulling(_, _, dist) -> {
      let offset = dist -. 28.0
      let opacity = float.min(1.0, dist /. threshold_px)
      #(
        "omni-pull-to-refresh pulling",
        "pull down to refresh",
        "refresh",
        float.to_string(dist),
        "transform: translate(-50%, "
          <> float.to_string(offset)
          <> "px); opacity: "
          <> float.to_string(opacity)
          <> ";",
      )
    }
    ReadyToRefresh(dist) -> {
      let offset = dist -. 28.0
      #(
        "omni-pull-to-refresh ready",
        "release to refresh",
        "arrow-down",
        float.to_string(dist),
        "transform: translate(-50%, "
          <> float.to_string(offset)
          <> "px); opacity: 1;",
      )
    }
    Refreshing -> #(
      "omni-pull-to-refresh is-refreshing",
      "refreshing...",
      "spinner",
      float.to_string(threshold_px),
      "transform: translate(-50%, 64px); opacity: 1;",
    )
  }

  html.div(
    [
      attribute.id("omni-pull-to-refresh"),
      attribute.class(state_class),
      attribute.attribute("data-pull-distance", distance_str),
      attribute.attribute("style", style_attr),
      attribute.attribute("aria-live", case effective_state {
        Refreshing -> "polite"
        _ -> "off"
      }),
    ],
    [
      html.div([attribute.class("omni-pull-indicator-content")], [
        html.span([attribute.class("omni-pull-icon")], [
          icons.render_icon(icon_name, 16),
        ]),
        html.span([attribute.class("omni-pull-label")], [element.text(label)]),
      ]),
    ],
  )
}
