//// Application specification and entrypoint for `plugin_relays`.

import gleam/option.{Some}
import omni/plugin_kit/app.{type AppSpec, type Effect, type RunningApp, AppSpec}
import omni/plugin_kit/route.{type Route}
import omni/protocol/schema/node.{type Node}
import plugin/relays/model.{type Model}
import plugin/relays/msg.{type Msg, SetViewMode}
import plugin/relays/update
import plugin/relays/view

/// Builds the pure Elm-style `AppSpec` for `plugin_relays`.
pub fn app_spec() -> AppSpec(Model, Msg) {
  AppSpec(
    init: init_from_route,
    update: update.update,
    view: view.view,
    on_action: update.action_to_msg,
    on_route_change: Some(fn(r: Route) {
      SetViewMode(update.parse_view_mode(r.view))
    }),
  )
}

/// Starts a running `plugin_relays` application instance from a URL search string.
pub fn start_app(
  initial_search: String,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(app_spec(), initial_route, emit_schema)
}

fn init_from_route(initial_route: Route) -> #(Model, List(Effect(Msg))) {
  let mode = update.parse_view_mode(initial_route.view)
  #(model.init(mode), [])
}
