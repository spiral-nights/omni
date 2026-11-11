//// Application specification and entrypoint for the Checklist plugin.

import gleam/option.{Some}
import omni/platform/storage.{type Storage}
import omni/plugin_kit/app.{type AppSpec, type RunningApp, AppSpec}
import omni/plugin_kit/local_store
import omni/plugin_kit/route.{type Route}
import omni/plugin_kit/schema.{type Node}
import plugin/checklist/model.{type Model, Model}
import plugin/checklist/msg.{type Msg, SetViewMode}
import plugin/checklist/update
import plugin/checklist/view

/// Constructs the pure `AppSpec(Model, Msg)` for the Checklist plugin.
pub fn app_spec() -> AppSpec(Model, Msg) {
  AppSpec(
    init: fn(initial_route: Route) { #(model.init(initial_route), []) },
    update: update.update,
    view: view.view,
    on_action: update.action_to_msg,
    on_route_change: Some(fn(next_route: Route) {
      SetViewMode(model.view_mode_from_route(next_route))
    }),
  )
}

/// Constructs an `AppSpec(Model, Msg)` backed by a persistent `Storage` instance
/// so task and settings changes are automatically loaded from and saved to `local_store`.
pub fn app_spec_with_storage(store: Storage) -> AppSpec(Model, Msg) {
  let tasks_cfg = model.tasks_store_config()
  let settings_cfg = model.settings_store_config()
  let next_seq_fn = fn(items) {
    case items {
      [] -> 1
      _ -> 100
    }
  }

  AppSpec(
    init: fn(initial_route: Route) {
      let base = model.init(initial_route)
      let loaded_tasks = local_store.load(store, tasks_cfg)
      let loaded_settings = local_store.load(store, settings_cfg)
      #(
        Model(
          ..base,
          tasks: loaded_tasks,
          settings: loaded_settings,
          next_id: next_seq_fn(loaded_tasks),
        ),
        [],
      )
    },
    update: fn(current_model: Model, message: Msg) {
      let #(next_model, effects) = update.update(current_model, message)
      let _ = local_store.save(store, tasks_cfg, next_model.tasks)
      let _ = local_store.save(store, settings_cfg, next_model.settings)
      #(next_model, effects)
    },
    view: view.view,
    on_action: update.action_to_msg,
    on_route_change: Some(fn(next_route: Route) {
      SetViewMode(model.view_mode_from_route(next_route))
    }),
  )
}

/// Starts a running Checklist plugin instance from `initial_search` (e.g. `"?view=compact"`)
/// and emits declarative Schema UI nodes via `emit_schema`.
pub fn start_app(
  initial_search: String,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(app_spec(), initial_route, emit_schema)
}

/// Starts a running Checklist plugin instance backed by `store`.
pub fn start_app_with_storage(
  initial_search: String,
  store: Storage,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(app_spec_with_storage(store), initial_route, emit_schema)
}
