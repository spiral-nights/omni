//// Unit and integration tests for `plugin_publisher` (Phase 7.8).

import gleam/bit_array
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/nostr/kind
import omni/nostr/nip19
import omni/platform/ref
import omni/platform/storage
import omni/platform/zip
import omni/plugin_kit/app
import omni/plugin_kit/local_store
import omni/plugin_kit/schema
import omni/protocol/schema/node
import plugin/publisher/bundle as publisher_bundle
import plugin/publisher/main
import plugin/publisher/model.{
  type BlossomServer, BlossomServer, Model, PublishDraft, PublishedPlugin,
  TabPublished, TabServers, TabStudio, TabWidget,
}
import plugin/publisher/msg.{
  AddServer, ChooseLocalZip, DeletePublished, DismissBanner, PublishPackage,
  PublishServerList, RemoveServer, SelectTab, SetBundleMetadata,
  SetDraftDescription, SetDraftIcon, SetDraftId, SetDraftName, SetDraftServerUrl,
  SetDraftVersion, ToggleServer, UseTemplate,
}
import plugin/publisher/update
import plugin/publisher/view

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn studio_draft_validation_and_publish_test() {
  let m0 = model.init(TabStudio)
  assert list.length(m0.published) == 0

  // Empty ID rejected
  let #(m1, _) = update.update(m0, SetDraftId("   "))
  let #(m2, _) = update.update(m1, PublishPackage)
  assert m2.error_message != None
  assert list.length(m2.published) == 0

  // Dismiss banner clears error
  let #(m3, _) = update.update(m2, DismissBanner)
  assert m3.error_message == None

  // Populate valid draft and publish
  let #(m4, _) = update.update(m3, SetDraftId("org.example.notes"))
  let #(m5, _) = update.update(m4, SetDraftName("Example Notes"))
  let #(m6, _) = update.update(m5, SetDraftVersion("2.1.0"))
  let #(m7, _) =
    update.update(m6, SetDraftDescription("Encrypted notes nsite."))
  let #(m8, _) = update.update(m7, SetDraftIcon("file"))
  let #(m9, _) =
    update.update(
      m8,
      SetBundleMetadata(
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        size_bytes: 4096,
      ),
    )

  let m9b =
    model.Model(
      ..m9,
      bundle: Some(publisher_bundle.from_html(
        "<html><body>notes</body></html>",
        "index.html",
      )),
      user_pubkey: Some(
        "5555555555555555555555555555555555555555555555555555555555555555",
      ),
    )
  let #(m10, effects) = update.update(m9b, PublishPackage)
  assert m10.error_message == None
  assert m10.status_message != None
  assert list.length(m10.published) == 1

  let assert [pkg] = m10.published
  assert pkg.id == "org.example.notes"
  assert pkg.name == "Example Notes"
  assert pkg.version == "2.1.0"
  assert string.starts_with(pkg.naddr, "naddr1")
  // One publish effect is queued; Blossom uploads are separate effects.
  assert list.any(effects, fn(effect) {
    case effect {
      app.Publish(event) -> event.kind == kind.from_int(35_129)
      _ -> False
    }
  })
}

pub fn nip5a_tag_generation_test() {
  let draft =
    PublishDraft(
      id: "example.nsite.timer",
      name: "Focus Timer",
      version: "1.2.0",
      description: "Pomodoro focus timer",
      icon: "clock",
      entry_html: "index.html",
      bundle_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      bundle_size_bytes: 1024,
    )

  let files = [
    publisher_bundle.BundleFile(
      path: "index.html",
      mime: "text/html",
      sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      size: 1024,
      bytes: <<"<html></html>":utf8>>,
    ),
  ]
  let tags =
    model.build_nip5a_tags(draft, files, ["https://cdn.satellite.earth"])

  assert list.contains(tags, ["d", "example.nsite.timer"])
  assert list.contains(tags, ["name", "Focus Timer"])
  assert list.contains(tags, ["version", "1.2.0"])
  assert list.contains(tags, ["description", "Pomodoro focus timer"])
  assert list.contains(tags, ["icon", "clock"])
  assert list.contains(tags, [
    "f",
    "index.html",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "text/html",
  ])
  assert list.contains(tags, [
    "x",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  ])
  assert list.contains(tags, ["server", "https://cdn.satellite.earth"])
}

pub fn blossom_server_management_test() {
  let m0 = model.init(TabServers)
  assert list.length(m0.servers) == 3

  // Reject invalid server URL scheme
  let #(m1, _) = update.update(m0, SetDraftServerUrl("ftp://invalid.server"))
  let #(m2, _) = update.update(m1, AddServer)
  assert m2.error_message != None
  assert list.length(m2.servers) == 3

  // Add valid server URL (strips trailing slash)
  let #(m3, _) =
    update.update(m2, SetDraftServerUrl("https://blossom.example.org/"))
  let #(m4, _) = update.update(m3, AddServer)
  assert m4.error_message == None
  assert m4.draft_server_url == ""
  assert list.length(m4.servers) == 4
  assert list.any(m4.servers, fn(s: BlossomServer) {
    s.url == "https://blossom.example.org" && s.enabled
  })

  // Toggle server enabled flag
  let #(m5, _) = update.update(m4, ToggleServer("https://blossom.example.org"))
  let assert Ok(toggled) =
    list.find(m5.servers, fn(s: BlossomServer) {
      s.url == "https://blossom.example.org"
    })
  assert toggled.enabled == False

  // Remove server
  let #(m6, _) = update.update(m5, RemoveServer("https://blossom.example.org"))
  assert list.length(m6.servers) == 3
}

pub fn tab_navigation_and_views_test() {
  let m_studio = model.init(TabStudio)
  let json_studio = schema.encode_schema_message(view.view(m_studio))
  assert string.contains(json_studio, "Plugin Studio Form")
  assert string.contains(json_studio, "Bundle Hash Inspector")
  assert string.contains(json_studio, "code-block")

  let #(m_pub, _) = update.update(m_studio, SelectTab(TabPublished))
  let json_pub = schema.encode_schema_message(view.view(m_pub))
  assert string.contains(json_pub, "No published plugins yet")

  let #(m_srv, _) = update.update(m_pub, SelectTab(TabServers))
  let json_srv = schema.encode_schema_message(view.view(m_srv))
  assert string.contains(json_srv, "Blossom Server Endpoints")

  let #(m_widget, _) = update.update(m_srv, SelectTab(TabWidget))
  let node_widget = view.view(m_widget)
  assert node.node_type_name(node_widget) == "card"
  let json_widget = schema.encode_schema_message(node_widget)
  assert string.contains(json_widget, "Open Plugin Studio")
}

pub fn start_app_action_round_trip_test() {
  let emitted_ref = ref.new([])
  let running =
    main.start_app_with_pubkey(
      "?view=main",
      "5555555555555555555555555555555555555555555555555555555555555555",
      fn(n) { ref.update(emitted_ref, fn(prev) { list.append(prev, [n]) }) },
    )

  assert list.length(ref.get(emitted_ref)) == 1
  assert app.current_model(running).active_tab == TabStudio

  // Update draft ID via action
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"set-draft-id\",\"payload\":{\"value\":\"org.example.custom\"}}",
    )
  assert app.current_model(running).draft.id == "org.example.custom"

  let archive =
    zip.zip([#("index.html", <<"<html><body>hi</body></html>":utf8>>)])
    |> bit_array.base64_encode(True)
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"set-bundle-zip\",\"payload\":{\"zip\":\""
        <> archive
        <> "\"}}",
    )

  // Publish package via action
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"publish-package\"}",
    )
  assert list.length(app.current_model(running).published) == 1

  // Switch tab to published via action
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"select-tab\",\"payload\":{\"tab\":\"published\"}}",
    )
  assert app.current_model(running).active_tab == TabPublished
}

pub fn bundle_zip_round_trip_strips_prefix_test() {
  let archive =
    zip.zip([
      #("dist/index.html", <<"<html><body>hi</body></html>":utf8>>),
      #("dist/app.js", <<"console.log('hi')":utf8>>),
    ])
  let assert Ok(parsed) = publisher_bundle.from_zip_bytes(archive)
  parsed.entry |> should.equal("index.html")
  assert list.length(parsed.files) == 2
  assert list.any(parsed.files, fn(file) {
    file.path == "index.html" && file.mime == "text/html"
  })
  assert list.any(parsed.files, fn(file) {
    file.path == "app.js" && file.sha256 != ""
  })
}

pub fn publish_without_bundle_is_rejected_test() {
  let m = model.init(TabStudio)
  let #(next, effects) = update.update(m, PublishPackage)
  assert next.error_message != None
  effects |> should.equal([])
}

pub fn choose_local_zip_emits_picker_effect_test() {
  let m = model.init(TabStudio)
  let assert Ok(action) =
    schema.decode_action_message(
      "{\"type\":\"omni:action\",\"action\":\"choose-local-zip\"}",
    )
  let assert Some(ChooseLocalZip) = update.action_to_msg(action)
  let #(next, effects) = update.update(m, ChooseLocalZip)
  assert next.publishing
  assert list.length(effects) == 1
  assert list.any(effects, fn(effect) {
    case effect {
      app.Async(_) -> True
      _ -> False
    }
  })
}

pub fn local_zip_action_populates_bundle_test() {
  let emitted_ref = ref.new([])
  let running =
    main.start_app("?view=main", fn(n) {
      ref.update(emitted_ref, fn(prev) { list.append(prev, [n]) })
    })

  let archive =
    zip.zip([#("index.html", <<"<html><body>local</body></html>":utf8>>)])
    |> bit_array.base64_encode(True)
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"set-bundle-zip\",\"payload\":{\"zip\":\""
        <> archive
        <> "\"}}",
    )

  let model = app.current_model(running)
  let assert Some(parsed) = model.bundle
  parsed.entry |> should.equal("index.html")
  assert model.status_message == Some("Bundle loaded.")
  let assert Ok(entry) = publisher_bundle.entry_file(parsed)
  entry.path |> should.equal("index.html")
  assert model.draft.bundle_size_bytes == entry.size
  assert model.draft.bundle_sha256 == entry.sha256
  assert string.contains(
    schema.encode_schema_message(view.view(model)),
    "Choose .zip",
  )
}

pub fn studio_state_round_trips_through_the_store_test() {
  let published =
    PublishedPlugin(
      id: "com.example.app",
      name: "Example App",
      version: "1.2.0",
      description: "A test plugin",
      icon: "apps",
      blossom_sha256: "abc123",
      blossom_url: "https://blossom.example/abc123",
      naddr: "naddr1example",
      published_at: 1_700_000_000,
    )
  let store = storage.in_memory()
  let cfg = model.published_store_config()
  let _ = local_store.save(store, cfg, [published])

  let loaded = local_store.load(store, cfg)
  let assert [restored] = loaded
  restored.id |> should.equal("com.example.app")
  restored.version |> should.equal("1.2.0")
  restored.blossom_sha256 |> should.equal("abc123")
  restored.published_at |> should.equal(1_700_000_000)
}

pub fn default_servers_round_trip_test() {
  let store = storage.in_memory()
  let cfg = model.servers_store_config()
  let servers = local_store.load(store, cfg)
  list.length(servers) |> should.equal(3)

  let _ =
    local_store.save(store, cfg, [
      BlossomServer(url: "https://s.example", enabled: False, status: "Error"),
    ])
  let assert [only] = local_store.load(store, cfg)
  only.url |> should.equal("https://s.example")
  only.enabled |> should.equal(False)
}

pub fn template_bundle_and_inventory_render_test() {
  let m0 = model.init(TabStudio)
  let #(m1, effects) = update.update(m0, UseTemplate)
  assert list.length(effects) == 0
  assert m1.bundle != None
  assert m1.draft.entry_html == "index.html"
  assert m1.draft.bundle_size_bytes > 0

  let html = view.view(m1) |> schema.encode_schema_message
  assert string.contains(html, "Bundle File Inventory")
  assert string.contains(html, "index.html")
  assert string.contains(html, "Start from Template")
}

pub fn delete_published_queues_kind5_test() {
  let m0 =
    Model(
      ..model.init(TabPublished),
      user_pubkey: Some(
        "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      ),
      published: [
        PublishedPlugin(
          id: "org.example.app",
          name: "Example",
          version: "1.0.0",
          description: "",
          icon: "globe",
          blossom_sha256: "abc",
          blossom_url: "https://blossom.example/abc",
          naddr: "naddr1example",
          published_at: 1_700_000_000,
        ),
      ],
    )
  let #(m1, effects) = update.update(m0, DeletePublished("org.example.app"))
  assert list.length(m1.published) == 0

  let assert [app.Publish(draft)] = effects
  kind.to_int(draft.kind) |> should.equal(5)
  list.any(draft.tags, fn(tag) {
    case tag {
      ["a", value] ->
        value
        == "35129:79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798:org.example.app"
      _ -> False
    }
  })
  |> should.be_true()
}

pub fn publish_server_list_queues_kind10063_test() {
  let m0 =
    Model(
      ..model.init(TabServers),
      user_pubkey: Some(
        "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      ),
    )
  let #(_, effects) = update.update(m0, PublishServerList)
  let assert [app.Publish(draft)] = effects
  kind.to_int(draft.kind) |> should.equal(10_063)
  list.length(draft.tags) |> should.equal(3)
}

pub fn publish_embeds_relay_hints_in_naddr_test() {
  let html = "<html><body>hi</body></html>"
  let m0 =
    Model(
      ..model.init(TabStudio),
      user_pubkey: Some(
        "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      ),
      relay_urls: [
        "wss://one.example",
        "wss://two.example",
        "wss://three.example",
        "wss://four.example",
      ],
      bundle: Some(publisher_bundle.from_html(html, "index.html")),
      draft: PublishDraft(
        ..model.default_draft(),
        id: "org.example.hints",
        name: "Hints App",
      ),
    )
  let #(m1, _) = update.update(m0, PublishPackage)
  let assert [pkg] = m1.published
  case nip19.decode(pkg.naddr) {
    Ok(nip19.Naddr(address)) ->
      address.relays
      |> should.equal([
        "wss://one.example",
        "wss://two.example",
        "wss://three.example",
      ])
    _ -> panic as "expected naddr"
  }
}
