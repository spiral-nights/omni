//// Cross-app intent resolution broker.
////
//// Registers handlers for canonical Nostr intents (`view_note`, `compose_note`,
//// `view_profile`, `search`, etc.), tracks default preferences, and resolves
//// intent dispatch requests.

import gleam/dict.{type Dict}
import gleam/list
import gleam/option.{type Option, None, Some}
import omni/protocol/intent.{
  type Intent, type IntentHandler, type IntentResolution, DisabledCandidate,
  Disambiguate, IntentHandler, NoHandler, Resolved,
}

/// Headless intent broker maintaining registered handlers and defaults.
pub type IntentBroker {
  IntentBroker(
    handlers: Dict(String, List(IntentHandler)),
    disabled_intents: Dict(String, List(String)),
    default_handlers: Dict(String, String),
  )
}

/// Create an empty `IntentBroker`.
pub fn new() -> IntentBroker {
  IntentBroker(
    handlers: dict.new(),
    disabled_intents: dict.new(),
    default_handlers: dict.new(),
  )
}

/// Register an intent handler.
///
/// Automatically canonicalizes the action (e.g., `compose_note` -> `create_note`).
/// If a handler from the same plugin for this action is already registered, it is replaced.
pub fn register_handler(
  broker: IntentBroker,
  handler: IntentHandler,
) -> IntentBroker {
  let act = intent.canonical_action(handler.action)
  let canonical_handler = IntentHandler(..handler, action: act)

  let current_list = case dict.get(broker.handlers, act) {
    Ok(l) -> l
    Error(Nil) -> []
  }

  let filtered =
    list.filter(current_list, fn(h) { h.plugin_id != handler.plugin_id })
  let updated_list = list.append(filtered, [canonical_handler])

  let next_handlers = dict.insert(broker.handlers, act, updated_list)
  IntentBroker(..broker, handlers: next_handlers)
}

/// Unregister a single handler for a plugin and action.
pub fn unregister_handler(
  broker: IntentBroker,
  plugin_id: String,
  action: String,
) -> IntentBroker {
  let act = intent.canonical_action(action)
  case dict.get(broker.handlers, act) {
    Ok(l) -> {
      let filtered = list.filter(l, fn(h) { h.plugin_id != plugin_id })
      let next_handlers = case filtered {
        [] -> dict.delete(broker.handlers, act)
        _ -> dict.insert(broker.handlers, act, filtered)
      }
      IntentBroker(..broker, handlers: next_handlers)
    }
    Error(Nil) -> broker
  }
}

/// Unregister all handlers associated with a plugin (e.g., upon uninstall).
pub fn unregister_plugin(
  broker: IntentBroker,
  plugin_id: String,
) -> IntentBroker {
  let next_handlers =
    dict.map_values(broker.handlers, fn(_act, list) {
      list.filter(list, fn(h) { h.plugin_id != plugin_id })
    })
    |> dict.filter(fn(_act, list) { !list.is_empty(list) })

  let next_disabled = dict.delete(broker.disabled_intents, plugin_id)

  let next_defaults =
    dict.filter(broker.default_handlers, fn(_act, def_id) {
      def_id != plugin_id
    })

  IntentBroker(
    handlers: next_handlers,
    disabled_intents: next_disabled,
    default_handlers: next_defaults,
  )
}

/// Set the default handler plugin for an intent action.
pub fn set_default_handler(
  broker: IntentBroker,
  action: String,
  plugin_id: String,
) -> IntentBroker {
  let act = intent.canonical_action(action)
  let next_defaults = dict.insert(broker.default_handlers, act, plugin_id)
  IntentBroker(..broker, default_handlers: next_defaults)
}

/// Get the default handler plugin ID for an intent action.
pub fn get_default_handler(
  broker: IntentBroker,
  action: String,
) -> Option(String) {
  let act = intent.canonical_action(action)
  dict.get(broker.default_handlers, act)
  |> option.from_result
}

/// Clear the default handler for an intent action.
pub fn clear_default_handler(
  broker: IntentBroker,
  action: String,
) -> IntentBroker {
  let act = intent.canonical_action(action)
  let next_defaults = dict.delete(broker.default_handlers, act)
  IntentBroker(..broker, default_handlers: next_defaults)
}

/// Load default handlers dictionary (e.g. from `WorkspaceState.default_intents`).
pub fn load_defaults(
  broker: IntentBroker,
  defaults: Dict(String, String),
) -> IntentBroker {
  dict.fold(defaults, broker, fn(acc, act, plugin_id) {
    set_default_handler(acc, act, plugin_id)
  })
}

/// Return all currently set default handlers.
pub fn get_all_defaults(broker: IntentBroker) -> Dict(String, String) {
  broker.default_handlers
}

/// Set whether an intent is enabled for a given plugin.
pub fn set_plugin_intent_enabled(
  broker: IntentBroker,
  plugin_id: String,
  action: String,
  enabled: Bool,
) -> IntentBroker {
  let act = intent.canonical_action(action)
  let current_disabled = case dict.get(broker.disabled_intents, plugin_id) {
    Ok(l) -> l
    Error(Nil) -> []
  }

  let next_disabled = case enabled {
    True -> list.filter(current_disabled, fn(a) { a != act })
    False ->
      case list.contains(current_disabled, act) {
        True -> current_disabled
        False -> [act, ..current_disabled]
      }
  }

  let next_dict = case next_disabled {
    [] -> dict.delete(broker.disabled_intents, plugin_id)
    _ -> dict.insert(broker.disabled_intents, plugin_id, next_disabled)
  }

  IntentBroker(..broker, disabled_intents: next_dict)
}

/// Check if a plugin has an intent enabled. Returns True by default.
pub fn is_plugin_intent_enabled(
  broker: IntentBroker,
  plugin_id: String,
  action: String,
) -> Bool {
  let act = intent.canonical_action(action)
  case dict.get(broker.disabled_intents, plugin_id) {
    Ok(disabled_list) -> !list.contains(disabled_list, act)
    Error(Nil) -> True
  }
}

/// Return all registered handlers for an action (both enabled and disabled).
pub fn get_handlers(
  broker: IntentBroker,
  action: String,
) -> List(IntentHandler) {
  let act = intent.canonical_action(action)
  case dict.get(broker.handlers, act) {
    Ok(l) -> l
    Error(Nil) -> []
  }
}

/// Return all action names that have at least one registered handler.
pub fn get_registered_actions(broker: IntentBroker) -> List(String) {
  dict.keys(broker.handlers)
}

/// Resolve an intent request to an outcome:
/// - `Resolved(handler, data)` if an unambiguous or default handler is active
/// - `Disambiguate(action, candidates, data)` if multiple candidates exist without a default
/// - `DisabledCandidate(action, candidate, data)` if exactly 1 handler exists but is disabled
/// - `NoHandler(action)` if no handlers are registered
pub fn resolve(broker: IntentBroker, req: Intent) -> IntentResolution {
  let act = intent.canonical_action(req.action)
  let all_handlers = get_handlers(broker, act)

  case all_handlers {
    [] -> NoHandler(act)

    _ -> {
      let enabled =
        list.filter(all_handlers, fn(h) {
          is_plugin_intent_enabled(broker, h.plugin_id, act)
        })

      case enabled {
        [] -> {
          // Check if exactly one disabled candidate exists to prompt user
          let disabled =
            list.filter(all_handlers, fn(h) {
              !is_plugin_intent_enabled(broker, h.plugin_id, act)
            })

          case disabled {
            [single_disabled] ->
              DisabledCandidate(
                action: act,
                candidate: single_disabled,
                data: req.data,
              )
            _ -> NoHandler(act)
          }
        }

        [single] -> Resolved(handler: single, data: req.data)

        multiple -> {
          // Check if a default handler is set and present among enabled candidates
          case get_default_handler(broker, act) {
            Some(default_id) -> {
              case list.find(multiple, fn(h) { h.plugin_id == default_id }) {
                Ok(default_handler) ->
                  Resolved(handler: default_handler, data: req.data)
                Error(Nil) ->
                  Disambiguate(
                    action: act,
                    candidates: multiple,
                    data: req.data,
                  )
              }
            }
            None ->
              Disambiguate(action: act, candidates: multiple, data: req.data)
          }
        }
      }
    }
  }
}
