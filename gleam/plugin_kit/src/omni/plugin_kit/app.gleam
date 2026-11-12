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
import omni/plugin_kit/zap.{type ZapInvoice as ZapInvoicePayload}
import omni/protocol/blossom.{type BlobUpload}
import omni/protocol/relay_command.{type RelayCommand}
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{type Node}

/// Request the host to obtain a Lightning invoice for a zap.
///
/// The host signs and broadcasts `event` (Kind 9734), POSTs it to the LNURL
/// pay callback resolved from `lnurl`, and dispatches the invoice string (or
/// an error message) back into the plugin.
pub type ZapInvoice =
  ZapInvoicePayload

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
  /// Request the host to fetch older events with `until` (timestamp).
  FetchUntil(Int)
  /// Request the host to fetch a note and its conversation replies.
  FetchThread(String)
  /// Request a relay-pool mutation (add/remove/scope/reconnect).
  Relay(RelayCommand)
  /// Request the host play the completion chime.
  PlayChime
  /// Request the host upload a blob to Blossom.
  UploadBlob(BlobUpload)
  /// Request a NIP-50 relay search for `query`.
  Search(String)
  /// Request the host open an external URI (e.g. a `lightning:` invoice).
  OpenUrl(String)
  /// Request the host obtain a Lightning invoice for a zap request.
  ZapInvoice(ZapInvoice)
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
    fetches: Ref(List(Int)),
    thread_fetches: Ref(List(String)),
    relay_commands: Ref(List(RelayCommand)),
    chimes: Ref(Int),
    uploads: Ref(List(BlobUpload)),
    searches: Ref(List(String)),
    urls: Ref(List(String)),
    zap_invoices: Ref(List(ZapInvoice)),
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
      fetches: ref.new([]),
      thread_fetches: ref.new([]),
      relay_commands: ref.new([]),
      chimes: ref.new(0),
      uploads: ref.new([]),
      searches: ref.new([]),
      urls: ref.new([]),
      zap_invoices: ref.new([]),
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
    FetchUntil(until) -> ref.update(app.fetches, fn(queue) { [until, ..queue] })
    FetchThread(note_id) ->
      ref.update(app.thread_fetches, fn(queue) { [note_id, ..queue] })
    Relay(command) ->
      ref.update(app.relay_commands, fn(queue) { [command, ..queue] })
    PlayChime -> ref.update(app.chimes, fn(count) { count + 1 })
    UploadBlob(upload) ->
      ref.update(app.uploads, fn(queue) { [upload, ..queue] })
    Search(query) -> ref.update(app.searches, fn(queue) { [query, ..queue] })
    OpenUrl(url) -> ref.update(app.urls, fn(queue) { [url, ..queue] })
    OpenUrl(url) -> ref.update(app.urls, fn(queue) { [url, ..queue] })
    ZapInvoice(invoice) ->
      ref.update(app.zap_invoices, fn(queue) { [invoice, ..queue] })
  }
}

/// Drain the thread ids the app wants fetched with their replies.
pub fn take_thread_fetches(app: RunningApp(model, msg)) -> List(String) {
  let pending = ref.get(app.thread_fetches)
  ref.set(app.thread_fetches, [])
  list.reverse(pending)
}

/// Drain the drafts the app asked the host to sign and broadcast.
pub fn take_publishes(app: RunningApp(model, msg)) -> List(UnsignedEvent) {
  let pending = ref.get(app.publishes)
  ref.set(app.publishes, [])
  list.reverse(pending)
}

/// Drain pending external-URL requests.
pub fn take_urls(app: RunningApp(model, msg)) -> List(String) {
  let pending = ref.get(app.urls)
  ref.set(app.urls, [])
  list.reverse(pending)
}

/// Drain pending relay-search requests.
pub fn take_searches(app: RunningApp(model, msg)) -> List(String) {
  let pending = ref.get(app.searches)
  ref.set(app.searches, [])
  list.reverse(pending)
}

/// Drain pending Blossom uploads.
pub fn take_uploads(app: RunningApp(model, msg)) -> List(BlobUpload) {
  let pending = ref.get(app.uploads)
  ref.set(app.uploads, [])
  list.reverse(pending)
}

/// Drain pending Lightning invoice requests (`ZapInvoice` effects).
pub fn take_zap_invoices(app: RunningApp(model, msg)) -> List(ZapInvoice) {
  let pending = ref.get(app.zap_invoices)
  ref.set(app.zap_invoices, [])
  list.reverse(pending)
}

/// Drain pending completion chimes.
pub fn take_chimes(app: RunningApp(model, msg)) -> Int {
  let pending = ref.get(app.chimes)
  ref.set(app.chimes, 0)
  pending
}

/// Drain relay-pool mutations requested by the app.
pub fn take_relay_commands(app: RunningApp(model, msg)) -> List(RelayCommand) {
  let pending = ref.get(app.relay_commands)
  ref.set(app.relay_commands, [])
  list.reverse(pending)
}

/// Drain older-page fetch requests (`until` timestamps).
pub fn take_fetches(app: RunningApp(model, msg)) -> List(Int) {
  let pending = ref.get(app.fetches)
  ref.set(app.fetches, [])
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
