//// Application specification and entrypoint for the Timer plugin (`plugin_timer`).

import gleam/option.{None}
import omni/plugin_kit/app.{type AppSpec, type RunningApp, AppSpec}
import omni/plugin_kit/route.{type Route}
import omni/plugin_kit/schema.{type Node}
import plugin/timer/model.{type Model, init}
import plugin/timer/msg.{type Msg}
import plugin/timer/update
import plugin/timer/view

/// Constructs the pure `AppSpec(Model, Msg)` for the Timer plugin.
pub fn app_spec() -> AppSpec(Model, Msg) {
  AppSpec(
    init: fn(_initial_route: Route) { #(init(), []) },
    update: update.update,
    view: view.view,
    on_action: update.action_to_msg,
    on_route_change: None,
  )
}

/// Starts a running Timer application from `initial_search`.
pub fn start_app(
  initial_search: String,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(app_spec(), initial_route, emit_schema)
}

/// Starts a compact timer widget instance rendering `view.view_widget`.
pub fn start_widget_app(
  initial_search: String,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(widget_spec(), initial_route, emit_schema)
}

fn widget_spec() -> AppSpec(Model, Msg) {
  AppSpec(
    init: fn(_initial_route: Route) { #(init(), []) },
    update: update.update,
    view: view.view_widget,
    on_action: update.action_to_msg,
    on_route_change: None,
  )
}
