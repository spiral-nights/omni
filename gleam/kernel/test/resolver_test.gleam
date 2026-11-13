import gleam/dict
import gleam/list
import gleam/option.{None}
import gleam/string
import gleeunit/should
import omni/kernel/crypto/keystore
import omni/kernel/plugins/resolver.{
  CoordinateTarget, EventTarget, StrategyExhausted, UrlTarget,
}
import omni/nostr/event.{type Event, Event}
import omni/nostr/event_id.{type EventId}
import omni/nostr/kind
import omni/nostr/pubkey.{type Pubkey}
import omni/platform/storage

fn make_pubkey(suffix: String) -> Pubkey {
  let padded = string.pad_start(suffix, to: 64, with: "0")
  let assert Ok(pk) = pubkey.parse(padded)
  pk
}

fn make_event_id(suffix: String) -> EventId {
  let padded = string.pad_start(suffix, to: 64, with: "0")
  let assert Ok(id) = event_id.parse(padded)
  id
}

fn make_nsite_event(
  identifier: String,
  name: String,
  tags_extra: List(List(String)),
  content: String,
) -> Event {
  let base_tags = [
    ["d", identifier],
    ["name", name],
    ["version", "1.2.0"],
    ["description", "A pure Nostr site plugin"],
    ["icon", "icon-bolt"],
  ]
  let tags = list.append(base_tags, tags_extra)
  Event(
    id: make_event_id("1"),
    pubkey: make_pubkey("a"),
    created_at: 1_700_000,
    kind: kind.from_int(resolver.nsite_manifest_kind_int),
    tags: tags,
    content: content,
    sig: string.pad_start("sig", to: 128, with: "0"),
  )
}

pub fn resolver_parse_target_test() {
  resolver.parse_target("https://example.com/manifest.json")
  |> should.equal(Ok(UrlTarget("https://example.com/manifest.json")))

  let assert Ok(CoordinateTarget(35_129, pk, "feed")) =
    resolver.parse_target("35129:abcdef:feed")
  pk |> should.equal("abcdef")

  let assert Ok(CoordinateTarget(35_129, pk2, "timer")) =
    resolver.parse_target("123456:timer")
  pk2 |> should.equal("123456")

  resolver.parse_target("not-a-valid-target") |> should.be_error
}

pub fn resolver_resolve_event_inline_html_test() {
  let ev =
    make_nsite_event(
      "org.omni.plugin.test",
      "Test Plugin",
      [
        ["view", "widget", "Widget View", "?view=widget", "schema"],
        ["intent", "view_note"],
      ],
      "<!DOCTYPE html><html><body><h1>Hello Omni</h1></body></html>",
    )

  let assert Ok(plugin) = resolver.resolve_event(ev, None)
  plugin.id |> should.equal("org.omni.plugin.test")
  plugin.name |> should.equal("Test Plugin")
  plugin.version |> should.equal("1.2.0")
  plugin.entry |> should.equal("index.html")
  string.contains(plugin.content, "Hello Omni") |> should.be_true
  plugin.handled_intents |> should.equal(["view_note"])
  list.length(plugin.views) |> should.equal(1)
}

pub fn resolver_resolve_event_blossom_manifest_test() {
  let ev =
    make_nsite_event(
      "org.omni.plugin.blossom",
      "Blossom App",
      [
        ["f", "index.html", "hash_html_123", "text/html"],
        ["f", "style.css", "hash_css_456", "text/css"],
        ["server", "https://blossom.primal.net"],
      ],
      "",
    )

  let assert Ok(plugin) = resolver.resolve_event(ev, None)
  plugin.id |> should.equal("org.omni.plugin.blossom")
  plugin.entry |> should.equal("index.html")
  dict.get(plugin.blossom_hashes, "index.html")
  |> should.equal(Ok("hash_html_123"))
  dict.get(plugin.blossom_hashes, "style.css")
  |> should.equal(Ok("hash_css_456"))
  plugin.blossom_servers |> should.equal(["https://blossom.primal.net"])
}

pub fn resolver_chain_resolution_test() {
  let ev = make_nsite_event("chain.app", "Chain App", [], "<div>App</div>")

  let strategies = [resolver.event_strategy]

  let assert Ok(resolved) = resolver.resolve_chain(EventTarget(ev), strategies)
  resolved.id |> should.equal("chain.app")

  // URL target through event_strategy fails with StrategyExhausted
  resolver.resolve_chain(UrlTarget("https://example.com"), strategies)
  |> should.equal(Error(StrategyExhausted))
}

pub fn resolver_url_strategy_test() {
  let fetcher = fn(url: String) {
    case url == "https://cdn.example.com/index.html" {
      True -> Ok("<html><body>Remote</body></html>")
      False -> Error(resolver.HttpFetchFailed(url, "404 Not Found"))
    }
  }

  let strategy = resolver.url_strategy(fetcher)

  let assert Ok(plugin) =
    strategy(UrlTarget("https://cdn.example.com/index.html"))
  plugin.id |> should.equal("https://cdn.example.com/index.html")
  plugin.name |> should.equal("index.html")
  string.contains(plugin.content, "Remote") |> should.be_true

  strategy(UrlTarget("https://cdn.example.com/missing.html"))
  |> should.be_error
}

pub fn verify_event_signature_accepts_real_and_rejects_tampered_test() {
  let ks = keystore.new(storage.in_memory())
  let draft =
    event.UnsignedEvent(
      pubkey: None,
      created_at: 1_700_000_000,
      kind: kind.from_int(35_129),
      tags: [["d", "app"]],
      content: "<html></html>",
    )
  let assert Ok(signed) = keystore.sign_event(ks, draft)
  resolver.verify_event_signature(signed) |> should.be_true()

  let tampered = Event(..signed, content: "<html>evil</html>")
  resolver.verify_event_signature(tampered) |> should.be_false()
}
