//// Application specification and entrypoint for `plugin_publisher`.

import gleam/option.{type Option, None, Some}
import omni/plugin_kit/app.{type AppSpec, type Effect, type RunningApp, AppSpec}
import omni/plugin_kit/route.{type Route}
import omni/protocol/schema/node.{type Node}
import plugin/publisher/model.{type Model, type StudioTab, Model, TabStudio}
import plugin/publisher/msg.{type Msg, SelectTab}
import plugin/publisher/update
import plugin/publisher/view

/// Builds the pure Elm-style `AppSpec` for `plugin_publisher`.
pub fn app_spec() -> AppSpec(Model, Msg) {
  AppSpec(
    init: init_from_route,
    update: update.update,
    view: view.view,
    on_action: update.action_to_msg,
    on_route_change: Some(fn(r: Route) { SelectTab(resolve_route_tab(r)) }),
  )
}

/// Starts a running `plugin_publisher` application instance from a URL search string.
pub fn start_app(
  initial_search: String,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(app_spec(), initial_route, emit_schema)
}

/// Starts the publisher with the signed-in public key available for naddr generation.
pub fn start_app_with_pubkey(
  initial_search: String,
  pubkey_hex: String,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(app_spec_with_pubkey(Some(pubkey_hex)), initial_route, emit_schema)
}

fn app_spec_with_pubkey(pubkey_hex: Option(String)) -> AppSpec(Model, Msg) {
  AppSpec(
    init: fn(initial_route: Route) {
      #(
        Model(
          ..model.init(resolve_route_tab(initial_route)),
          user_pubkey: pubkey_hex,
        ),
        [],
      )
    },
    update: update.update,
    view: view.view,
    on_action: update.action_to_msg,
    on_route_change: Some(fn(r: Route) { SelectTab(resolve_route_tab(r)) }),
  )
}

fn init_from_route(initial_route: Route) -> #(Model, List(Effect(Msg))) {
  let initial_tab = resolve_route_tab(initial_route)
  #(model.init(initial_tab), [])
}

fn resolve_route_tab(r: Route) -> StudioTab {
  case route.get_param(r, "tab") {
    Some(tab_param) -> update.parse_tab(tab_param)
    None ->
      case r.view {
        "main" | "" -> TabStudio
        other -> update.parse_tab(other)
      }
  }
}
