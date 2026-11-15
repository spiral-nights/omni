//// Application specification and entrypoint for the Profiles plugin
//// (`plugin_profiles`).

import gleam/dict
import gleam/option.{Some}
import omni/platform/storage.{type Storage}
import omni/plugin_kit/app.{type AppSpec, type RunningApp, AppSpec}
import omni/plugin_kit/local_store
import omni/plugin_kit/route.{type Route}
import omni/plugin_kit/schema.{type Node}
import omni/social/follows
import omni/social/profile
import omni/social/profile_cache
import plugin/profiles/model.{type Model, Model}
import plugin/profiles/msg.{type Msg, IngestEvent, SaveMetadata, SelectView}
import plugin/profiles/update
import plugin/profiles/view

/// Constructs the pure `AppSpec(Model, Msg)` for the Profiles plugin.
pub fn app_spec() -> AppSpec(Model, Msg) {
  AppSpec(
    init: fn(initial_route: Route) { #(model.init(initial_route), []) },
    update: update.update,
    view: view.view,
    on_action: update.action_to_msg,
    on_route_change: Some(fn(next_route: Route) {
      SelectView(model.view_from_route(next_route))
    }),
  )
}

/// Constructs an `AppSpec(Model, Msg)` backed by a persistent `Storage`
/// instance so discovered profiles are loaded from and saved to `local_store`.
pub fn app_spec_with_storage(store: Storage) -> AppSpec(Model, Msg) {
  let cfg = model.profile_store_config()
  let follows_cfg = follows.store_config()

  AppSpec(
    init: fn(initial_route: Route) {
      let base = model.init(initial_route)
      let cached =
        dict.merge(profile_cache.load(store), local_store.load(store, cfg))
      let cached_follows = local_store.load(store, follows_cfg)
      let with_profiles = case dict.size(cached) {
        0 -> base
        _ -> Model(..base, profiles: cached)
      }
      let with_follows = case cached_follows.followed_pubkeys {
        [] -> with_profiles
        _ -> Model(..with_profiles, follows: cached_follows)
      }
      #(with_follows, [])
    },
    update: fn(current_model: Model, message: Msg) {
      let #(next_model, effects) = update.update(current_model, message)
      case message {
        IngestEvent(event) ->
          case profile.from_event(event) {
            Ok(parsed) -> {
              let _ = profile_cache.upsert(store, parsed)
              Nil
            }
            Error(_) -> Nil
          }
        SaveMetadata -> {
          let _ = local_store.save(store, cfg, next_model.profiles)
          case next_model.my_pubkey {
            Some(pk) ->
              case dict.get(next_model.profiles, pk) {
                Ok(prof) -> {
                  let _ = profile_cache.upsert(store, prof)
                  Nil
                }
                Error(_) -> Nil
              }
            _ -> Nil
          }
        }
        _ -> Nil
      }
      case next_model.follows == current_model.follows {
        True -> Nil
        False -> {
          let _ = local_store.save(store, follows_cfg, next_model.follows)
          Nil
        }
      }
      #(next_model, effects)
    },
    view: view.view,
    on_action: update.action_to_msg,
    on_route_change: Some(fn(next_route: Route) {
      SelectView(model.view_from_route(next_route))
    }),
  )
}

/// Starts a running Profiles plugin instance from `initial_search`
/// (e.g. `"?view=profile&id=..."`) and emits declarative Schema UI nodes.
pub fn start_app(
  initial_search: String,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(app_spec(), initial_route, emit_schema)
}

/// Starts a running Profiles plugin instance backed by `store`.
pub fn start_app_with_storage(
  initial_search: String,
  store: Storage,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(Model, Msg) {
  let initial_route = route.parse_search(initial_search)
  app.start(app_spec_with_storage(store), initial_route, emit_schema)
}
