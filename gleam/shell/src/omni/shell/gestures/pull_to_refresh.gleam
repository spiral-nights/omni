//// Pure pull-to-refresh gesture state machine and visual indicator view.
////
//// Conforms to Warm Paper Dark styling and monochrome SVG iconography.

import gleam/float
import gleam/option.{type Option, None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import omni/shell/model.{type Model}
import omni/shell/msg.{type Msg, StartPullRefresh}
import omni/ui/icons

/// Pull-to-refresh state machine states.
pub type PullState {
  PullIdle
  Pulling(start_y: Float, current_y: Float, distance: Float)
  ReadyToRefresh(distance: Float)
  Refreshing
}

/// Pull distance threshold in pixels required to trigger a refresh on release.
pub const threshold_px = 72.0

/// Maximum visual pull distance in pixels.
pub const max_distance_px = 120.0

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
    ReadyToRefresh(_) -> {
      // Re-evaluate against synthetic origin so moving back up can return to Pulling
      update_pull_distance(0.0, client_y)
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

  let #(state_class, label, icon_name, distance_str) = case effective_state {
    PullIdle -> #(
      "omni-pull-to-refresh",
      "pull down to refresh",
      "refresh",
      "0",
    )
    Pulling(_, _, dist) -> #(
      "omni-pull-to-refresh pulling",
      "pull down to refresh",
      "refresh",
      float.to_string(dist),
    )
    ReadyToRefresh(dist) -> #(
      "omni-pull-to-refresh ready",
      "release to refresh",
      "arrow-down",
      float.to_string(dist),
    )
    Refreshing -> #(
      "omni-pull-to-refresh is-refreshing",
      "refreshing...",
      "spinner",
      float.to_string(threshold_px),
    )
  }

  html.div(
    [
      attribute.id("omni-pull-to-refresh"),
      attribute.class(state_class),
      attribute.attribute("data-pull-distance", distance_str),
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
