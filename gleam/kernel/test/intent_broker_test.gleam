import gleam/list
import gleam/option.{None, Some}
import gleeunit/should
import omni/kernel/intents/broker
import omni/protocol/intent.{
  type IntentHandler, DisabledCandidate, Disambiguate, IntentHandler, NoHandler,
  Resolved,
}

fn make_handler(plugin_id: String, action: String) -> IntentHandler {
  IntentHandler(
    plugin_id: plugin_id,
    action: action,
    name: Some(plugin_id <> " Handler"),
    icon: None,
    description: None,
    route: None,
    is_rpc: None,
  )
}

pub fn broker_register_and_get_handlers_test() {
  let b =
    broker.new()
    |> broker.register_handler(make_handler("plugin.notes", "view_note"))
    |> broker.register_handler(make_handler("plugin.feed", "view_note"))

  let handlers = broker.get_handlers(b, "view_note")
  list.length(handlers) |> should.equal(2)
}

pub fn broker_alias_normalization_test() {
  // Registering compose_note normalizes to create_note
  let b =
    broker.new()
    |> broker.register_handler(make_handler("plugin.feed", "compose_note"))

  let handlers = broker.get_handlers(b, "create_note")
  list.length(handlers) |> should.equal(1)

  let query_by_alias = broker.get_handlers(b, "compose_note")
  list.length(query_by_alias) |> should.equal(1)
}

pub fn broker_resolve_single_enabled_test() {
  let b =
    broker.new()
    |> broker.register_handler(make_handler("plugin.profile", "view_profile"))

  let req = intent.new("view_profile")
  let assert Resolved(h, _) = broker.resolve(b, req)
  h.plugin_id |> should.equal("plugin.profile")
}

pub fn broker_resolve_disambiguate_multiple_test() {
  let b =
    broker.new()
    |> broker.register_handler(make_handler("plugin.feed", "search"))
    |> broker.register_handler(make_handler("plugin.notes", "search"))

  let req = intent.new("search")
  let assert Disambiguate("search", candidates, _) = broker.resolve(b, req)
  list.length(candidates) |> should.equal(2)
}

pub fn broker_resolve_default_handler_test() {
  let b =
    broker.new()
    |> broker.register_handler(make_handler("plugin.feed", "search"))
    |> broker.register_handler(make_handler("plugin.notes", "search"))
    |> broker.set_default_handler("search", "plugin.notes")

  let req = intent.new("search")
  let assert Resolved(h, _) = broker.resolve(b, req)
  h.plugin_id |> should.equal("plugin.notes")
}

pub fn broker_resolve_disabled_candidate_prompt_test() {
  let b =
    broker.new()
    |> broker.register_handler(make_handler("plugin.timer", "start_timer"))
    |> broker.set_plugin_intent_enabled("plugin.timer", "start_timer", False)

  let req = intent.new("start_timer")
  let assert DisabledCandidate("start_timer", candidate, _) =
    broker.resolve(b, req)
  candidate.plugin_id |> should.equal("plugin.timer")

  // If re-enabled, it resolves cleanly
  let b2 =
    broker.set_plugin_intent_enabled(b, "plugin.timer", "start_timer", True)
  let assert Resolved(h, _) = broker.resolve(b2, req)
  h.plugin_id |> should.equal("plugin.timer")
}

pub fn broker_resolve_no_handler_test() {
  let b = broker.new()
  let req = intent.new("unknown_intent")
  broker.resolve(b, req) |> should.equal(NoHandler("unknown_intent"))
}

pub fn broker_unregister_plugin_test() {
  let b =
    broker.new()
    |> broker.register_handler(make_handler("plugin.feed", "view_note"))
    |> broker.register_handler(make_handler("plugin.notes", "view_note"))
    |> broker.set_default_handler("view_note", "plugin.feed")
    |> broker.unregister_plugin("plugin.feed")

  let handlers = broker.get_handlers(b, "view_note")
  list.length(handlers) |> should.equal(1)
  broker.get_default_handler(b, "view_note") |> should.equal(None)

  let req = intent.new("view_note")
  let assert Resolved(h, _) = broker.resolve(b, req)
  h.plugin_id |> should.equal("plugin.notes")
}
