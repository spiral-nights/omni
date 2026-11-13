//// Application specification and entrypoint for the Notes plugin (`plugin_notes`).

import gleam/option.{None, Some}
import gleam/string
import omni/platform/storage.{type Storage}
import omni/plugin_kit/app.{type AppSpec, type RunningApp, AppSpec, Dispatch}
import omni/plugin_kit/local_store.{type StoreConfig, StoreConfig}
import omni/plugin_kit/route.{type Route}
import omni/plugin_kit/schema.{type Node}
import plugin/notes/model.{type Model, encode_notebook, init, notebook_decoder}
import plugin/notes/msg.{type Msg, SelectFolder, ShowSettings}
import plugin/notes/update
import plugin/notes/view

/// Versioned `local_store.StoreConfig` for persisting the whole notebook.
pub fn notebook_store_config() -> StoreConfig(Model) {
  StoreConfig(
    key: "omni:notes:notebook",
    version: 1,
    encode: encode_notebook,
    decoder: notebook_decoder(),
    default: init,
  )
}

/// Constructs the pure `AppSpec(Model, Msg)` for the Notes plugin.
pub fn app_spec() -> AppSpec(Model, Msg) {
  AppSpec(
    init: fn(initial_route: Route) {
      #(init(), [Dispatch(ShowSettings(route_shows_settings(initial_route)))])
    },
    update: update.update,
    view: view.view,
    on_action: update.action_to_msg,
    on_route_change: Some(fn(next_route: Route) {
      ShowSettings(route_shows_settings(next_route))
    }),
  )
}

/// Constructs an `AppSpec(Model, Msg)` backed by persistent storage.
pub fn app_spec_with_storage(store: Storage) -> AppSpec(Model, Msg) {
  let cfg = notebook_store_config()

  AppSpec(
    init: fn(initial_route: Route) {
      #(local_store.load(store, cfg), [
        Dispatch(ShowSettings(route_shows_settings(initial_route))),
      ])
    },
    update: fn(current_model: Model, message: Msg) {
      let #(next_model, effects) = update.update(current_model, message)
      let _ = local_store.save(store, cfg, next_model)
      #(next_model, effects)
    },
    view: view.view,
    on_action: update.action_to_msg,
    on_route_change: Some(fn(next_route: Route) {
      ShowSettings(route_shows_settings(next_route))
    }),
  )
}

fn route_shows_settings(r: Route) -> Bool {
  string.lowercase(string.trim(r.view)) == "settings"
}

/// Starts a running Notes application from `initial_search`
/// (e.g. `"?view=settings"`).
pub fn start_app(
  initial_search: String,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(app_spec(), initial_route, emit_schema)
}

/// Starts a running Notes application backed by `store`.
pub fn start_app_with_storage(
  initial_search: String,
  store: Storage,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(app_spec_with_storage(store), initial_route, emit_schema)
}

/// Starts a compact widget instance rendering `view.view_widget`.
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
