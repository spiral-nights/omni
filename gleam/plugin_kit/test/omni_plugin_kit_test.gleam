import gleam/dynamic/decode
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/nostr/event.{UnsignedEvent}
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/pubkey
import omni/platform/ref
import omni/platform/storage
import omni/plugin_kit/app.{
  type AppSpec, type Effect, AppSpec, Async, Batch, Dispatch, NoneEffect,
  ZapInvoice,
}
import omni/plugin_kit/local_store.{StoreConfig}
import omni/plugin_kit/nostr.{DocSpec, DraftEvent, FetchOptions}
import omni/plugin_kit/route.{type Route}
import omni/plugin_kit/schema
import omni/plugin_kit/zap
import omni/protocol/schema/action
import omni/protocol/schema/codec
import omni/protocol/schema/node

pub fn main() -> Nil {
  gleeunit.main()
}

const alice_hex =
  "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"

// -----------------------------------------------------------------------------
// 1. Route tests
// -----------------------------------------------------------------------------

pub fn route_parse_search_defaults_to_main_test() {
  let r1 = route.parse_search("")
  r1.view |> should.equal("main")
  r1.hash |> should.equal(None)
  route.to_search(r1) |> should.equal("")

  let r2 = route.parse_search("?view=")
  r2.view |> should.equal("main")
}

pub fn route_parse_search_with_params_and_hash_test() {
  let r =
    route.parse_search("?view=widget&id=123&title=hello%20world#section-2")
  r.view |> should.equal("widget")
  route.get_param(r, "id") |> should.equal(Some("123"))
  route.get_param(r, "title") |> should.equal(Some("hello world"))
  route.get_param(r, "missing") |> should.equal(None)
  r.hash |> should.equal(Some("section-2"))

  let serialized = route.to_search(r)
  serialized
  |> should.equal("?view=widget&id=123&title=hello%20world#section-2")
}

pub fn route_parse_url_and_builders_test() {
  let r =
    route.parse_url(
      "https://plugin.local/index.html?view=settings&tab=relays#advanced",
    )
  r.view |> should.equal("settings")
  route.get_param(r, "tab") |> should.equal(Some("relays"))
  r.hash |> should.equal(Some("advanced"))

  let updated =
    r
    |> route.with_view("dashboard")
    |> route.with_param("tab", "overview")
    |> route.with_param("filter", "active")

  updated.view |> should.equal("dashboard")
  route.get_param(updated, "tab") |> should.equal(Some("overview"))
  route.get_param(updated, "filter") |> should.equal(Some("active"))
  route.to_search(updated)
  |> should.equal("?view=dashboard&filter=active&tab=overview#advanced")
}

// -----------------------------------------------------------------------------
// 2. Local Store tests
// -----------------------------------------------------------------------------

type CounterPrefs {
  CounterPrefs(count: Int, label: String)
}

fn prefs_config(version: Int) -> local_store.StoreConfig(CounterPrefs) {
  let decoder = {
    use count <- decode.field("count", decode.int)
    use label <- decode.field("label", decode.string)
    decode.success(CounterPrefs(count: count, label: label))
  }
  StoreConfig(
    key: "plugin:prefs",
    version: version,
    encode: fn(p: CounterPrefs) {
      json.object([
        #("count", json.int(p.count)),
        #("label", json.string(p.label)),
      ])
    },
    decoder: decoder,
    default: fn() { CounterPrefs(count: 0, label: "default") },
  )
}

pub fn local_store_save_load_update_clear_test() {
  let mem = storage.in_memory()
  let cfg = prefs_config(1)

  // Missing key returns default
  local_store.load(mem, cfg)
  |> should.equal(CounterPrefs(count: 0, label: "default"))

  // Save and load
  local_store.save(mem, cfg, CounterPrefs(count: 10, label: "ten"))
  |> should.equal(Ok(Nil))

  local_store.load(mem, cfg)
  |> should.equal(CounterPrefs(count: 10, label: "ten"))

  // Update
  let next =
    local_store.update(mem, cfg, fn(p) { CounterPrefs(..p, count: p.count + 5) })
  next |> should.equal(CounterPrefs(count: 15, label: "ten"))
  local_store.load(mem, cfg)
  |> should.equal(CounterPrefs(count: 15, label: "ten"))

  // Version mismatch falls back to default
  let cfg_v2 = prefs_config(2)
  local_store.load(mem, cfg_v2)
  |> should.equal(CounterPrefs(count: 0, label: "default"))

  // Raw unversioned JSON fallback works
  let _ =
    storage.set(mem, "plugin:prefs", "{\"count\":42,\"label\":\"legacy\"}")
  local_store.load(mem, cfg)
  |> should.equal(CounterPrefs(count: 42, label: "legacy"))

  // Corrupt JSON falls back to default
  let _ = storage.set(mem, "plugin:prefs", "{broken-json")
  local_store.load(mem, cfg)
  |> should.equal(CounterPrefs(count: 0, label: "default"))

  // Clear removes entry
  let _ = local_store.save(mem, cfg, CounterPrefs(count: 9, label: "nine"))
  local_store.clear(mem, cfg)
  storage.has_key(mem, "plugin:prefs") |> should.be_false()
}

// -----------------------------------------------------------------------------
// 3. Schema helpers tests
// -----------------------------------------------------------------------------

pub fn schema_encode_and_decode_action_test() {
  let tree =
    schema.box()
    |> schema.gap("md")
    |> schema.child(schema.text("Counter: 1"))
    |> schema.child(schema.button("Increment", schema.new_action("inc")))

  let wire = schema.encode_schema_message(tree)
  string.contains(wire, "\"type\":\"omni:schema\"") |> should.be_true()

  let assert Ok(decoded_msg) = codec.decode_schema_message(wire)
  decoded_msg.type_name |> should.equal("omni:schema")
  decoded_msg.schema |> should.equal(tree)

  // Decode Channel 1 action envelope
  let action_wire =
    "{\"type\":\"omni:action\",\"action\":\"set_title\",\"payload\":{\"title\":\"Hello\",\"step\":3,\"active\":true}}"
  let assert Ok(act) = schema.decode_action_message(action_wire)
  act.name |> should.equal("set_title")
  schema.payload_string(act, "title") |> should.equal(Some("Hello"))
  schema.payload_int(act, "step") |> should.equal(Some(3))
  schema.payload_bool(act, "active") |> should.equal(Some(True))

  // Decode direct Action JSON
  let direct_wire = "{\"name\":\"reset\"}"
  let assert Ok(direct_act) = schema.decode_action_message(direct_wire)
  direct_act.name |> should.equal("reset")
}

// -----------------------------------------------------------------------------
// 4. Nostr mock_client tests
// -----------------------------------------------------------------------------

pub fn nostr_mock_client_publish_fetch_and_subscribe_test() {
  let assert Ok(alice_pk) = pubkey.parse(alice_hex)
  let client = nostr.mock_client(alice_pk, [])

  let received_events = ref.new([])
  let eose_called = ref.new(False)

  let notes_filter =
    filter.new()
    |> filter.with_kinds([kind.Note])

  let sub =
    client.subscribe(
      [notes_filter],
      fn(ev) {
        ref.update(received_events, fn(evs) { list.append(evs, [ev.content]) })
      },
      fn() { ref.set(eose_called, True) },
    )

  ref.get(eose_called) |> should.be_true()

  use pub_res <- promise.await(
    client.publish(DraftEvent(
      kind: kind.Note,
      content: "First note from plugin",
      tags: [["t", "gleam"]],
      created_at: Some(1_700_000_100),
    )),
  )
  let assert Ok(published_ev) = pub_res
  published_ev.content |> should.equal("First note from plugin")

  // Subscriber received live event
  ref.get(received_events) |> should.equal(["First note from plugin"])

  // Unsubscribe stops future deliveries
  sub.unsubscribe()
  use _ <- promise.await(
    client.publish(DraftEvent(
      kind: kind.Note,
      content: "Second note after unsub",
      tags: [],
      created_at: Some(1_700_000_200),
    )),
  )
  ref.get(received_events) |> should.equal(["First note from plugin"])

  // Fetch returns both notes sorted newest-first
  use fetch_res <- promise.await(client.fetch(
    [notes_filter],
    FetchOptions(timeout_ms: None, relay_urls: None),
  ))
  let assert Ok(fetched) = fetch_res
  list.map(fetched, fn(e) { e.content })
  |> should.equal(["Second note after unsub", "First note from plugin"])

  promise.resolve(Nil)
}

pub fn nostr_subscribe_once_and_encrypted_doc_test() {
  let assert Ok(alice_pk) = pubkey.parse(alice_hex)
  let client = nostr.mock_client(alice_pk, [])

  use _ <- promise.await(
    client.publish(DraftEvent(
      kind: kind.Note,
      content: "Seed note",
      tags: [],
      created_at: Some(1_700_000_050),
    )),
  )

  let once_items = ref.new([])
  let once_completed = ref.new(False)

  let _handle =
    nostr.subscribe_once(
      client,
      [filter.new() |> filter.with_kinds([kind.Note])],
      fn(ev) {
        ref.update(once_items, fn(items) { list.append(items, [ev.content]) })
      },
      fn() { ref.set(once_completed, True) },
    )

  ref.get(once_completed) |> should.be_true()
  ref.get(once_items) |> should.equal(["Seed note"])

  // Subsequent publish should NOT trigger subscribe_once callback
  use _ <- promise.await(
    client.publish(DraftEvent(
      kind: kind.Note,
      content: "Later note",
      tags: [],
      created_at: Some(1_700_000_060),
    )),
  )
  ref.get(once_items) |> should.equal(["Seed note"])

  // Test reactive encrypted doc
  let doc_spec =
    DocSpec(
      kind: kind.AppData,
      d_tag: "notes/vault",
      encrypted: True,
      default: ["initial"],
      encode: fn(items) { json.array(items, of: json.string) },
      decoder: decode.list(decode.string),
    )

  let doc = nostr.open_doc(client, doc_spec)
  doc.read() |> should.equal(["initial"])

  use write_res <- promise.await(doc.write(["secret-1", "secret-2"]))
  let assert Ok(doc_event) = write_res
  // Content on wire is encrypted (starts with nip44:), not plaintext
  string.starts_with(doc_event.content, "nip44:") |> should.be_true()
  doc.read() |> should.equal(["secret-1", "secret-2"])

  promise.resolve(Nil)
}

// -----------------------------------------------------------------------------
// 5. Elm-style App Harness tests
// -----------------------------------------------------------------------------

type TestModel {
  TestModel(count: Int, view_name: String, async_loaded: Bool)
}

type TestMsg {
  Increment
  AddAmount(Int)
  MarkAsyncLoaded
  RouteChanged(Route)
}

fn test_app_spec() -> AppSpec(TestModel, TestMsg) {
  AppSpec(
    init: fn(initial_route: Route) {
      let start_count = case route.get_param(initial_route, "start") {
        Some(raw) ->
          case int.parse(raw) {
            Ok(n) -> n
            Error(Nil) -> 0
          }
        None -> 0
      }
      #(
        TestModel(
          count: start_count,
          view_name: initial_route.view,
          async_loaded: False,
        ),
        [
          Async(fn(dispatch) { dispatch(MarkAsyncLoaded) }),
        ],
      )
    },
    update: fn(model: TestModel, msg: TestMsg) -> #(
      TestModel,
      List(Effect(TestMsg)),
    ) {
      case msg {
        Increment ->
          case model.count == 5 {
            True -> #(TestModel(..model, count: model.count + 1), [
              Batch([Dispatch(AddAmount(10)), NoneEffect]),
            ])
            False -> #(TestModel(..model, count: model.count + 1), [])
          }
        AddAmount(n) -> #(TestModel(..model, count: model.count + n), [])
        MarkAsyncLoaded -> #(TestModel(..model, async_loaded: True), [])
        RouteChanged(r) -> #(TestModel(..model, view_name: r.view), [])
      }
    },
    view: fn(model: TestModel) -> node.Node {
      schema.box()
      |> schema.child(schema.text(
        model.view_name <> ":" <> int.to_string(model.count),
      ))
      |> schema.child(schema.button("Inc", action.new("inc")))
    },
    on_action: fn(act: action.Action) {
      case act.name {
        "inc" -> Some(Increment)
        "add" ->
          case schema.payload_int(act, "amount") {
            Some(n) -> Some(AddAmount(n))
            None -> None
          }
        _ -> None
      }
    },
    on_route_change: Some(RouteChanged),
  )
}

pub fn app_harness_full_lifecycle_test() {
  let emitted_nodes = ref.new([])
  let initial_route = route.parse_search("?view=main&start=4")

  let running =
    app.start(test_app_spec(), initial_route, fn(n) {
      ref.update(emitted_nodes, fn(prev) { list.append(prev, [n]) })
    })

  // Init ran + Async effect immediately dispatched MarkAsyncLoaded
  let m0 = app.current_model(running)
  m0.count |> should.equal(4)
  m0.view_name |> should.equal("main")
  m0.async_loaded |> should.be_true()

  // Handle "inc" action -> count becomes 5
  app.handle_action(running, action.new("inc")) |> should.be_true()
  app.current_model(running).count |> should.equal(5)

  // Handle "inc" again -> count becomes 6, which triggers Batch([Dispatch(AddAmount(10))]) -> 16
  app.handle_action(running, action.new("inc")) |> should.be_true()
  app.current_model(running).count |> should.equal(16)

  // Handle unknown action returns False
  app.handle_action(running, action.new("unknown")) |> should.be_false()

  // Handle JSON action envelope with payload
  let res =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"add\",\"payload\":{\"amount\":4}}",
    )
  res |> should.equal(Ok(True))
  app.current_model(running).count |> should.equal(20)

  // Navigate route updates view_name and re-renders
  app.navigate(running, route.parse_search("?view=settings"))
  app.current_model(running).view_name |> should.equal("settings")
  app.current_route(running).view |> should.equal("settings")

  let latest_wire =
    app.current_view(running)
    |> schema.encode_schema_message
  string.contains(latest_wire, "settings:20") |> should.be_true()

  // Emitted schema history has every render step
  let hist = app.emitted_schema_history(running)
  { list.length(hist) >= 6 } |> should.be_true()
}

// -----------------------------------------------------------------------------
// Zap invoice effects
// -----------------------------------------------------------------------------

fn zap_invoice_app_spec() -> AppSpec(Nil, Nil) {
  AppSpec(
    init: fn(_route: Route) {
      let event =
        UnsignedEvent(
          pubkey: None,
          created_at: 1_700_000_123,
          kind: kind.ZapRequest,
          tags: [["p", alice_hex], ["amount", "21000"]],
          content: "nice post",
        )
      #(Nil, [
        ZapInvoice(zap.ZapInvoice(
          event: event,
          lnurl: "lnurl1example",
          amount_msats: 21_000,
          comment: "nice post",
        )),
      ])
    },
    update: fn(_model: Nil, _msg: Nil) { #(Nil, []) },
    view: fn(_model: Nil) { schema.text("zap") },
    on_action: fn(_act: action.Action) { None },
    on_route_change: None,
  )
}

pub fn app_zap_invoice_effect_is_queued_and_drained_test() {
  let running = app.start(zap_invoice_app_spec(), route.main(), fn(_) { Nil })

  let invoices = app.take_zap_invoices(running)
  list.length(invoices) |> should.equal(1)
  let assert Ok(invoice) = list.first(invoices)
  invoice.lnurl |> should.equal("lnurl1example")
  invoice.amount_msats |> should.equal(21_000)
  invoice.comment |> should.equal("nice post")
  invoice.event.kind |> should.equal(kind.ZapRequest)
  invoice.event.created_at |> should.equal(1_700_000_123)
  invoice.event.content |> should.equal("nice post")

  // Zap invoice requests do not also queue a plain publish.
  app.take_publishes(running) |> should.equal([])
  app.take_encrypted_publishes(running) |> should.equal([])
  // Draining is idempotent.
  app.take_zap_invoices(running) |> should.equal([])
}
