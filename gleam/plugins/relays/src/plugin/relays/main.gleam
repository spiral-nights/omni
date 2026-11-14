//// Application specification and entrypoint for `plugin_relays`.

import gleam/list
import gleam/option.{Some}
import omni/platform/storage.{type Storage}
import omni/plugin_kit/app.{type AppSpec, type Effect, type RunningApp, AppSpec}
import omni/plugin_kit/local_store
import omni/plugin_kit/route.{type Route}
import omni/protocol/schema/node.{type Node}
import plugin/relays/model.{type Model, Model}
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

/// Builds an `AppSpec` backed by `Storage` so configured relays are loaded from
/// and saved to `local_store` under `omni_configured_relays`.
pub fn app_spec_with_storage(store: Storage) -> AppSpec(Model, Msg) {
  let cfg = model.relays_store_config()

  AppSpec(
    init: fn(initial_route: Route) {
      let mode = update.parse_view_mode(initial_route.view)
      let base = model.init(mode)
      let loaded_urls = local_store.load(store, cfg)
      let relays = list.map(loaded_urls, model.default_relay_entry)
      #(Model(..base, relays: relays), [])
    },
    update: fn(current_model: Model, message: Msg) {
      let #(next_model, effects) = update.update(current_model, message)
      let prev_urls = list.map(current_model.relays, fn(r) { r.url })
      let next_urls = list.map(next_model.relays, fn(r) { r.url })
      case next_urls != prev_urls {
        True -> {
          let _ = local_store.save(store, cfg, next_urls)
          Nil
        }
        False -> Nil
      }
      #(next_model, effects)
    },
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

/// Starts a running `plugin_relays` application instance backed by `store`.
pub fn start_app_with_storage(
  initial_search: String,
  store: Storage,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(app_spec_with_storage(store), initial_route, emit_schema)
}

fn init_from_route(initial_route: Route) -> #(Model, List(Effect(Msg))) {
  let mode = update.parse_view_mode(initial_route.view)
  #(model.init(mode), [])
}
