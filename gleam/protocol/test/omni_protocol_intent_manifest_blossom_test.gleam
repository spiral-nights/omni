//// Unit tests for Intents, Nsite Manifest discovery, and Blossom media contracts.

import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleeunit/should
import omni/nostr/event
import omni/nostr/kind
import omni/protocol/blossom.{Upload}
import omni/protocol/intent.{IntentHandler, Resolved}
import omni/protocol/manifest.{AlternateLink, Iframe, ManifestShortcut, Schema}

pub fn blossom_mime_detection_test() {
  blossom.detect_mime_type("index.html")
  |> should.equal(blossom.MimeType("text/html", True))

  blossom.detect_mime_type("app.min.js")
  |> should.equal(blossom.MimeType("application/javascript", True))

  blossom.detect_mime_type("styles.css")
  |> should.equal(blossom.MimeType("text/css", True))

  blossom.detect_mime_type("manifest.webmanifest")
  |> should.equal(blossom.MimeType("application/manifest+json", True))

  blossom.detect_mime_type("logo.svg")
  |> should.equal(blossom.MimeType("image/svg+xml", True))

  blossom.detect_mime_type("avatar.png")
  |> should.equal(blossom.MimeType("image/png", False))

  blossom.detect_mime_type("plugin.wasm")
  |> should.equal(blossom.MimeType("application/wasm", False))

  blossom.detect_mime_type("binary.bin")
  |> should.equal(blossom.MimeType("application/octet-stream", False))
}

pub fn blossom_auth_draft_test() {
  let draft =
    blossom.create_auth_event_draft(
      "abcdef1234567890",
      Some("avatar.png"),
      Upload,
      3600,
      1_700_000_000,
    )

  kind.to_int(draft.kind) |> should.equal(24_242)
  draft.content |> should.equal("upload avatar.png")
  draft.created_at |> should.equal(1_700_000_000)

  let t_tags = event.get_tag_values(draft.tags, "t")
  t_tags |> should.equal(["upload"])

  let x_tags = event.get_tag_values(draft.tags, "x")
  x_tags |> should.equal(["abcdef1234567890"])

  let exp_tags = event.get_tag_values(draft.tags, "expiration")
  exp_tags |> should.equal(["1700003600"])
}

pub fn blossom_server_list_test() {
  let draft =
    blossom.create_server_list_draft(
      ["https://blossom.primal.net", "https://cdn.satellite.earth"],
      1_700_000_000,
    )

  kind.to_int(draft.kind) |> should.equal(10_063)
  let server_tags = event.get_tag_values(draft.tags, "server")
  server_tags
  |> should.equal(["https://blossom.primal.net", "https://cdn.satellite.earth"])
}

pub fn manifest_discovery_test() {
  let tags = [
    ["d", "my-nsite"],
    ["view", "widget", "Widget Card", "?view=widget", "schema"],
    ["view", "settings", "Settings", "?view=settings", "iframe"],
    ["views", "about", "help"],
  ]

  let views = manifest.parse_view_tags(tags, True)
  list.length(views) |> should.equal(4)

  let assert [w, s, ab, h] = views
  w.id |> should.equal("widget")
  w.title |> should.equal("Widget Card")
  w.format |> should.equal(Schema)

  s.id |> should.equal("settings")
  s.format |> should.equal(Iframe)

  ab.id |> should.equal("about")
  ab.title |> should.equal("About")

  h.id |> should.equal("help")
  h.title |> should.equal("Help")

  // Alternate link detection
  let alt_link =
    AlternateLink(
      href: "/?view=widget",
      title: Some("Compact Widget"),
      media_type: Some("application/json"),
    )
  let assert Some(alt_view) = manifest.alternate_link_to_view(alt_link, True)
  alt_view.id |> should.equal("widget")
  alt_view.title |> should.equal("Compact Widget")
  alt_view.format |> should.equal(Schema)

  // Web manifest shortcuts
  let shortcut =
    ManifestShortcut(
      name: "Compose Note",
      url: "/?view=compose",
      short_name: Some("Compose"),
      description: Some("New post"),
    )
  let sc_view = manifest.shortcut_to_view(shortcut)
  sc_view.id |> should.equal("compose")
  sc_view.title |> should.equal("Compose")
}

pub fn intent_and_resolution_codecs_test() {
  // Alias canonicalization
  intent.canonical_action("compose_note") |> should.equal("create_note")
  intent.canonical_action("create_note") |> should.equal("create_note")

  let int =
    intent.new("compose_note")
    |> intent.with_caller("org.omni.plugin.feed")

  int.action |> should.equal("create_note")
  int.caller_plugin_id |> should.equal(Some("org.omni.plugin.feed"))

  let encoded = intent.encode_intent(int)
  let assert Ok(decoded) = intent.decode_intent_json(encoded)
  decoded.action |> should.equal("create_note")

  // Intent Handler
  let handler =
    IntentHandler(
      plugin_id: "org.omni.plugin.feed",
      action: "create_note",
      name: Some("Feed"),
      icon: Some("rss"),
      description: Some("Timeline feed"),
      route: Some("?view=compose"),
      is_rpc: Some(False),
    )

  // Intent Resolution
  let resolution = Resolved(handler: handler, data: None)
  let res_str = json.to_string(intent.intent_resolution_to_json(resolution))
  let assert Ok(decoded_res) =
    json.parse(from: res_str, using: intent.intent_resolution_decoder())

  case decoded_res {
    Resolved(h, _) -> h.plugin_id |> should.equal("org.omni.plugin.feed")
    _ -> should.fail()
  }
}
