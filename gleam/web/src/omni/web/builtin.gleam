//// Host-rendered built-in plugin views.
////
//// First-party plugins are Gleam packages. Until their bundles are resolved
//// into sandboxes, the host starts them in-process, persists their state in
//// partitioned local storage, feeds them relay events, and hands their Schema
//// trees to the shell for rendering. Plugin IDs live only in `config`/`builtin`,
//// never in the shell or UI.

import gleam/option.{type Option, None, Some}
import omni/nostr/event.{type Event, type UnsignedEvent}
import omni/platform/storage
import omni/plugin_kit/app.{type RunningApp}
import omni/plugin_kit/route
import omni/plugin_kit/zap
import omni/protocol/blossom.{type BlobUpload}
import omni/protocol/relay_command.{type RelayCommand}
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{type Node}
import plugin/checklist/main as checklist
import plugin/checklist/msg as checklist_msg
import plugin/feed/main as feed
import plugin/feed/msg as feed_msg
import plugin/notes/main as notes
import plugin/notes/msg as notes_msg
import plugin/profiles/main as profiles
import plugin/profiles/msg as profiles_msg
import plugin/publisher/main as publisher
import plugin/relays/main as relays
import plugin/relays/model.{StateConnected, StateDisconnected}
import plugin/relays/msg as relays_msg
import plugin/timer/main as timer

/// A built-in plugin running in-process in the host.
pub type BuiltinApp {
  BuiltinApp(
    render: fn() -> Node,
    navigate: fn(String) -> Nil,
    handle_action: fn(Action) -> Bool,
    ingest: Option(fn(Event) -> Nil),
    relay_status: Option(fn(String, Bool) -> Nil),
    take_publishes: fn() -> List(UnsignedEvent),
    take_encrypted_publishes: fn() -> List(UnsignedEvent),
    take_fetches: fn() -> List(Int),
    take_relay_commands: fn() -> List(RelayCommand),
    take_chimes: fn() -> Int,
    take_uploads: fn() -> List(BlobUpload),
    take_zap_invoices: fn() -> List(zap.ZapInvoice),
    take_searches: fn() -> List(String),
    take_urls: fn() -> List(String),
    zap_invoice_result: Option(fn(Result(String, String)) -> Nil),
    ingest_doc: Option(fn(String) -> Nil),
  )
}

/// The first-party applications bundled with the host, backed by the local
/// storage port so their state survives reloads.
pub fn apps(pubkey_hex: String) -> List(#(String, BuiltinApp)) {
  let store = storage.local_or_in_memory()

  [
    #("org.omni.plugin.feed", feed_app(store)),
    #("org.omni.plugin.checklist", checklist_app(store)),
    #(
      "org.omni.plugin.timer",
      host(fn(emit) { timer.start_app("", emit) }, None, None),
    ),
    #("org.omni.plugin.notes", notes_app(store)),
    #("org.omni.plugin.relays", relays_app()),
    #("org.omni.plugin.profiles", profiles_app(store)),
    #("org.omni.plugin.publisher", publisher_app(pubkey_hex)),
  ]
}

fn feed_app(store: storage.Storage) -> BuiltinApp {
  let running = feed.start_app_with_storage("", store, fn(_) { Nil })
  BuiltinApp(
    render: fn() { app.current_view(running) },
    navigate: fn(raw) { app.navigate(running, route.parse_search(raw)) },
    handle_action: fn(action) { app.handle_action(running, action) },
    ingest: Some(fn(event) {
      app.dispatch(running, feed_msg.IngestEvent(event))
    }),
    relay_status: None,
    take_publishes: fn() { app.take_publishes(running) },
    take_encrypted_publishes: fn() { app.take_encrypted_publishes(running) },
    take_fetches: fn() { app.take_fetches(running) },
    take_relay_commands: fn() { app.take_relay_commands(running) },
    take_chimes: fn() { app.take_chimes(running) },
    take_uploads: fn() { app.take_uploads(running) },
    take_zap_invoices: fn() { app.take_zap_invoices(running) },
    take_searches: fn() { app.take_searches(running) },
    take_urls: fn() { app.take_urls(running) },
    zap_invoice_result: Some(fn(result) {
      app.dispatch(running, feed_msg.ZapInvoiceResult(result))
    }),
    ingest_doc: None,
  )
}

fn profiles_app(store: storage.Storage) -> BuiltinApp {
  let running = profiles.start_app_with_storage("", store, fn(_) { Nil })
  BuiltinApp(
    render: fn() { app.current_view(running) },
    navigate: fn(raw) { app.navigate(running, route.parse_search(raw)) },
    handle_action: fn(action) { app.handle_action(running, action) },
    ingest: Some(fn(event) {
      app.dispatch(running, profiles_msg.IngestEvent(event))
    }),
    relay_status: None,
    take_publishes: fn() { app.take_publishes(running) },
    take_encrypted_publishes: fn() { app.take_encrypted_publishes(running) },
    take_fetches: fn() { app.take_fetches(running) },
    take_relay_commands: fn() { app.take_relay_commands(running) },
    take_chimes: fn() { app.take_chimes(running) },
    take_uploads: fn() { app.take_uploads(running) },
    take_zap_invoices: fn() { app.take_zap_invoices(running) },
    take_searches: fn() { app.take_searches(running) },
    take_urls: fn() { app.take_urls(running) },
    zap_invoice_result: None,
    ingest_doc: None,
  )
}

fn relays_app() -> BuiltinApp {
  let running = relays.start_app("", fn(_) { Nil })
  BuiltinApp(
    render: fn() { app.current_view(running) },
    navigate: fn(raw) { app.navigate(running, route.parse_search(raw)) },
    handle_action: fn(action) { app.handle_action(running, action) },
    ingest: None,
    relay_status: Some(fn(url, connected) {
      let state = case connected {
        True -> StateConnected
        False -> StateDisconnected
      }
      app.dispatch(running, relays_msg.UpdateRelayState(url, state, None))
    }),
    take_publishes: fn() { app.take_publishes(running) },
    take_encrypted_publishes: fn() { app.take_encrypted_publishes(running) },
    take_fetches: fn() { app.take_fetches(running) },
    take_relay_commands: fn() { app.take_relay_commands(running) },
    take_chimes: fn() { app.take_chimes(running) },
    take_uploads: fn() { app.take_uploads(running) },
    take_zap_invoices: fn() { app.take_zap_invoices(running) },
    take_searches: fn() { app.take_searches(running) },
    take_urls: fn() { app.take_urls(running) },
    zap_invoice_result: None,
    ingest_doc: None,
  )
}

fn host(
  start: fn(fn(Node) -> Nil) -> RunningApp(a, b),
  ingest: Option(fn(Event) -> Nil),
  relay_status: Option(fn(String, Bool) -> Nil),
) -> BuiltinApp {
  let running = start(fn(_node) { Nil })

  BuiltinApp(
    render: fn() { app.current_view(running) },
    navigate: fn(raw) { app.navigate(running, route.parse_search(raw)) },
    handle_action: fn(action) { app.handle_action(running, action) },
    ingest: ingest,
    relay_status: relay_status,
    take_publishes: fn() { app.take_publishes(running) },
    take_encrypted_publishes: fn() { app.take_encrypted_publishes(running) },
    take_fetches: fn() { app.take_fetches(running) },
    take_relay_commands: fn() { app.take_relay_commands(running) },
    take_chimes: fn() { app.take_chimes(running) },
    take_uploads: fn() { app.take_uploads(running) },
    take_zap_invoices: fn() { app.take_zap_invoices(running) },
    take_searches: fn() { app.take_searches(running) },
    take_urls: fn() { app.take_urls(running) },
    zap_invoice_result: None,
    ingest_doc: None,
  )
}

fn publisher_app(pubkey_hex: String) -> BuiltinApp {
  let running = publisher.start_app_with_pubkey("", pubkey_hex, fn(_) { Nil })
  BuiltinApp(
    render: fn() { app.current_view(running) },
    navigate: fn(raw) { app.navigate(running, route.parse_search(raw)) },
    handle_action: fn(action) { app.handle_action(running, action) },
    ingest: None,
    relay_status: None,
    take_publishes: fn() { app.take_publishes(running) },
    take_encrypted_publishes: fn() { app.take_encrypted_publishes(running) },
    take_fetches: fn() { app.take_fetches(running) },
    take_relay_commands: fn() { app.take_relay_commands(running) },
    take_chimes: fn() { app.take_chimes(running) },
    take_uploads: fn() { app.take_uploads(running) },
    take_zap_invoices: fn() { app.take_zap_invoices(running) },
    take_searches: fn() { app.take_searches(running) },
    take_urls: fn() { app.take_urls(running) },
    zap_invoice_result: None,
    ingest_doc: None,
  )
}

fn checklist_app(store: storage.Storage) -> BuiltinApp {
  let running = checklist.start_app_with_storage("", store, fn(_) { Nil })
  BuiltinApp(
    render: fn() { app.current_view(running) },
    navigate: fn(raw) { app.navigate(running, route.parse_search(raw)) },
    handle_action: fn(action) { app.handle_action(running, action) },
    ingest: None,
    relay_status: None,
    take_publishes: fn() { app.take_publishes(running) },
    take_encrypted_publishes: fn() { app.take_encrypted_publishes(running) },
    take_fetches: fn() { app.take_fetches(running) },
    take_relay_commands: fn() { app.take_relay_commands(running) },
    take_chimes: fn() { app.take_chimes(running) },
    take_uploads: fn() { app.take_uploads(running) },
    take_zap_invoices: fn() { app.take_zap_invoices(running) },
    take_searches: fn() { app.take_searches(running) },
    take_urls: fn() { app.take_urls(running) },
    zap_invoice_result: None,
    ingest_doc: Some(fn(raw) {
      app.dispatch(running, checklist_msg.IngestRemoteDoc(raw))
    }),
  )
}

fn notes_app(store: storage.Storage) -> BuiltinApp {
  let running = notes.start_app_with_storage("", store, fn(_) { Nil })
  BuiltinApp(
    render: fn() { app.current_view(running) },
    navigate: fn(raw) { app.navigate(running, route.parse_search(raw)) },
    handle_action: fn(action) { app.handle_action(running, action) },
    ingest: None,
    relay_status: None,
    take_publishes: fn() { app.take_publishes(running) },
    take_encrypted_publishes: fn() { app.take_encrypted_publishes(running) },
    take_fetches: fn() { app.take_fetches(running) },
    take_relay_commands: fn() { app.take_relay_commands(running) },
    take_chimes: fn() { app.take_chimes(running) },
    take_uploads: fn() { app.take_uploads(running) },
    take_zap_invoices: fn() { app.take_zap_invoices(running) },
    take_searches: fn() { app.take_searches(running) },
    take_urls: fn() { app.take_urls(running) },
    zap_invoice_result: None,
    ingest_doc: Some(fn(raw) {
      app.dispatch(running, notes_msg.IngestRemoteDoc(raw))
    }),
  )
}
