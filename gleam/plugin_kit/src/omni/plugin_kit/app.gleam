//// Pure Elm-style application harness for Schema UI and Lustre plugins.
////
//// Manages the `init -> view -> emit_schema -> handle_action -> update -> view`
//// lifecycle with synchronous and asynchronous `Effect` execution.

import gleam/list
import gleam/option.{type Option, None, Some}
import omni/nostr/event.{type UnsignedEvent}
import omni/platform/ref.{type Ref}
import omni/plugin_kit/route.{type Route}
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{type Node}

/// Declarative effect returned by `init` and `update`.
pub type Effect(msg) {
  NoneEffect
  Dispatch(msg)
  Batch(List(Effect(msg)))
  Async(fn(fn(msg) -> Nil) -> Nil)
  /// Request the host to sign and broadcast this draft event.
  Publish(UnsignedEvent)
  /// Request the host to NIP-44 encrypt `content` to the user, sign, and broadcast.
  PublishEncrypted(UnsignedEvent)
}

/// Elm-style plugin application specification.
pub type AppSpec(model, msg) {
  AppSpec(
    init: fn(Route) -> #(model, List(Effect(msg))),
    update: fn(model, msg) -> #(model, List(Effect(msg))),
    view: fn(model) -> Node,
    on_action: fn(Action) -> Option(msg),
    on_route_change: Option(fn(Route) -> msg),
  )
}

/// A live running plugin application instance.
pub type RunningApp(model, msg) {
  RunningApp(
    spec: AppSpec(model, msg),
    model_ref: Ref(model),
    view_ref: Ref(Node),
    route_ref: Ref(Route),
    history_ref: Ref(List(String)),
    emit_schema: fn(Node) -> Nil,
    publishes: Ref(List(UnsignedEvent)),
    encrypted_publishes: Ref(List(UnsignedEvent)),
  )
}

/// Starts a new `RunningApp` with `initial_route` and `emit_schema` callback.
///
/// Immediately runs `spec.init(initial_route)`, renders the initial `Node`,
/// records the serialized `omni:schema` JSON in history, calls `emit_schema`,
/// and executes initial effects.
pub fn start(
  spec: AppSpec(model, msg),
  initial_route: Route,
  emit_schema: fn(Node) -> Nil,
) -> RunningApp(model, msg) {
  let #(initial_model, initial_effects) = spec.init(initial_route)
  let initial_node = spec.view(initial_model)
  let initial_json = schema.encode_schema_message(initial_node)

  let app =
    RunningApp(
      spec: spec,
      model_ref: ref.new(initial_model),
      view_ref: ref.new(initial_node),
      route_ref: ref.new(initial_route),
      history_ref: ref.new([initial_json]),
      emit_schema: emit_schema,
      publishes: ref.new([]),
      encrypted_publishes: ref.new([]),
    )

  emit_schema(initial_node)
  run_effects(app, initial_effects)
  app
}

/// Dispatches `msg` into `app`, updating the model, re-rendering and emitting
/// the updated schema `Node`, and executing any resulting effects.
pub fn dispatch(app: RunningApp(model, msg), msg: msg) -> Nil {
  let current = ref.get(app.model_ref)
  let #(next_model, effects) = app.spec.update(current, msg)
  ref.set(app.model_ref, next_model)

  let next_node = app.spec.view(next_model)
  ref.set(app.view_ref, next_node)

  let encoded = schema.encode_schema_message(next_node)
  ref.update(app.history_ref, fn(hist) { list.append(hist, [encoded]) })
  app.emit_schema(next_node)

  run_effects(app, effects)
}

/// Maps a schema `Action` via `spec.on_action` and dispatches the resulting `msg` if `Some`.
/// Returns `True` if the action mapped to a message, or `False` if ignored.
pub fn handle_action(app: RunningApp(model, msg), act: Action) -> Bool {
  case app.spec.on_action(act) {
    Some(msg) -> {
      dispatch(app, msg)
      True
    }
    None -> False
  }
}

/// Decodes a raw Channel 1 `omni:action` JSON string and routes it to `handle_action`.
pub fn handle_action_json(
  app: RunningApp(model, msg),
  raw_json: String,
) -> Result(Bool, String) {
  case schema.decode_action_message(raw_json) {
    Ok(act) -> Ok(handle_action(app, act))
    Error(err) -> Error(err)
  }
}

/// Updates the active `Route` and dispatches `on_route_change(route)` if configured.
pub fn navigate(app: RunningApp(model, msg), next_route: Route) -> Nil {
  ref.set(app.route_ref, next_route)
  case app.spec.on_route_change {
    Some(to_msg) -> dispatch(app, to_msg(next_route))
    None -> Nil
  }
}

/// Returns the current application model state.
pub fn current_model(app: RunningApp(model, msg)) -> model {
  ref.get(app.model_ref)
}

/// Returns the most recently rendered schema `Node`.
pub fn current_view(app: RunningApp(model, msg)) -> Node {
  ref.get(app.view_ref)
}

/// Returns the current active `Route`.
pub fn current_route(app: RunningApp(model, msg)) -> Route {
  ref.get(app.route_ref)
}

/// Returns the chronological history of emitted `omni:schema` JSON payloads.
pub fn emitted_schema_history(app: RunningApp(model, msg)) -> List(String) {
  ref.get(app.history_ref)
}

fn run_effects(app: RunningApp(model, msg), effects: List(Effect(msg))) -> Nil {
  list.each(effects, fn(eff) { run_effect(app, eff) })
}

fn run_effect(app: RunningApp(model, msg), effect: Effect(msg)) -> Nil {
  case effect {
    NoneEffect -> Nil
    Dispatch(m) -> dispatch(app, m)
    Batch(items) -> run_effects(app, items)
    Async(task) -> task(fn(m) { dispatch(app, m) })
    Publish(draft) -> ref.update(app.publishes, fn(queue) { [draft, ..queue] })
    PublishEncrypted(draft) ->
      ref.update(app.encrypted_publishes, fn(queue) { [draft, ..queue] })
  }
}

/// Drain the drafts the app asked the host to sign and broadcast.
pub fn take_publishes(app: RunningApp(model, msg)) -> List(UnsignedEvent) {
  let pending = ref.get(app.publishes)
  ref.set(app.publishes, [])
  list.reverse(pending)
}

/// Drain the drafts whose content must be NIP-44 encrypted to the user first.
pub fn take_encrypted_publishes(
  app: RunningApp(model, msg),
) -> List(UnsignedEvent) {
  let pending = ref.get(app.encrypted_publishes)
  ref.set(app.encrypted_publishes, [])
  list.reverse(pending)
}
