//// Unit and integration tests for `plugin_publisher` (Phase 7.8).

import gleam/bit_array
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/nostr/event.{Event}
import omni/nostr/event_id
import omni/nostr/kind
import omni/nostr/nip19
import omni/nostr/pubkey
import omni/platform/ref
import omni/platform/storage
import omni/platform/zip
import omni/plugin_kit/app
import omni/plugin_kit/local_store
import omni/plugin_kit/schema
import omni/protocol/schema/action.{NavigateTarget}
import omni/protocol/schema/node
import plugin/publisher/bundle as publisher_bundle
import plugin/publisher/main
import plugin/publisher/model.{
  type BlossomServer, BlossomServer, ModeBlossom, ModeInlined, Model,
  PublishDraft, PublishedPlugin, TabPublished, TabServers, TabStudio, TabWidget,
}
import plugin/publisher/msg.{
  AddServer, BundleLoaded, ChooseLocalFile, ChooseLocalZip, DeletePublished,
  DismissBanner, FetchUrl, InstallFromUrl, InstallLocal, OpenNaddr,
  PrepareUpdate, PublishPackage, PublishServerList, QueryRelays, RelaysQueried,
  RemoveServer, SelectTab, SetBundleMetadata, SetBundleUrl, SetDraftDescription,
  SetDraftIcon, SetDraftId, SetDraftName, SetDraftServerUrl, SetDraftVersion,
  SetPackagingMode, SingleFileLoaded, ToggleServer, UploadReported, UseTemplate,
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
  assert string.contains(json_studio, "1. Choose Source")
  assert string.contains(json_studio, "2. App Details & Publish")
  let #(m_with_bundle, _) = update.update(m_studio, UseTemplate)
  let json_with_bundle = schema.encode_schema_message(view.view(m_with_bundle))
  assert string.contains(json_with_bundle, "Bundle Hash Inspector")
  assert string.contains(json_with_bundle, "code-block")

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

pub fn upload_report_tracks_per_server_results_test() {
  let m0 = model.init(TabStudio)
  let #(m1, _) =
    update.update(
      m0,
      UploadReported("index.html", [
        #("https://one.example", True),
        #("https://two.example", False),
      ]),
    )
  let assert [report] = m1.upload_reports
  report.path |> should.equal("index.html")
  list.length(report.servers) |> should.equal(2)
  m1.status_message
  |> should.equal(Some("Uploaded index.html to 1/2 server(s)"))

  let html = view.view(m1) |> schema.encode_schema_message
  string.contains(html, "Uploaded to 1/2 server(s)") |> should.equal(True)
}

pub fn packaging_mode_toggle_and_inlined_publish_test() {
  let m0 =
    Model(
      ..model.init(TabStudio),
      user_pubkey: Some(
        "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      ),
      bundle: Some(publisher_bundle.from_html(
        "<html><body>inlined</body></html>",
        "index.html",
      )),
    )
  m0.packaging_mode |> should.equal(ModeBlossom)

  let assert Ok(act) =
    schema.decode_action_message(
      "{\"type\":\"omni:action\",\"action\":\"set-packaging-mode\",\"payload\":{\"checked\":true}}",
    )
  let assert Some(SetPackagingMode(ModeInlined)) = update.action_to_msg(act)
  let #(m1, _) = update.update(m0, SetPackagingMode(ModeInlined))
  m1.packaging_mode |> should.equal(ModeInlined)

  let #(m2, effects) = update.update(m1, PublishPackage)
  m2.error_message |> should.equal(None)
  // Inlined mode skips Blossom uploads and embeds HTML in Kind 35129 content
  let assert [app.Publish(draft)] = effects
  kind.to_int(draft.kind) |> should.equal(35_129)
  draft.content |> should.equal("<html><body>inlined</body></html>")
  list.any(draft.tags, fn(t) {
    case t {
      ["server", _] -> True
      _ -> False
    }
  })
  |> should.equal(False)
}

pub fn install_local_records_plugin_and_opens_naddr_test() {
  let m0 =
    Model(
      ..model.init(TabStudio),
      user_pubkey: Some(
        "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      ),
      bundle: Some(publisher_bundle.from_html(
        "<html><body>local</body></html>",
        "index.html",
      )),
    )
  let assert Ok(act) =
    schema.decode_action_message(
      "{\"type\":\"omni:action\",\"action\":\"install-local\"}",
    )
  let assert Some(InstallLocal) = update.action_to_msg(act)
  let #(m1, effects) = update.update(m0, InstallLocal)
  m1.error_message |> should.equal(None)
  list.length(m1.published) |> should.equal(1)
  let assert [app.OpenUrl(url)] = effects
  string.starts_with(url, "nostr:naddr1") |> should.equal(True)
}

pub fn fetch_url_and_install_url_support_naddr_and_https_test() {
  let assert Ok(pk) =
    pubkey.parse(
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    )
  let naddr =
    nip19.encode_naddr(
      nip19.AddressData(
        identifier: "org.example.remote",
        pubkey: pk,
        kind: kind.from_int(35_129),
        relays: ["wss://relay.example"],
      ),
    )

  let m0 = model.init(TabStudio)
  let #(m1, _) = update.update(m0, SetBundleUrl(naddr))
  let #(m2, fetch_effects) = update.update(m1, FetchUrl)
  m2.error_message |> should.equal(None)
  m2.draft.id |> should.equal("org.example.remote")
  fetch_effects |> should.equal([])

  let #(_, install_effects) = update.update(m2, InstallFromUrl)
  install_effects |> should.equal([app.OpenUrl("nostr:" <> naddr)])

  let #(m3, _) = update.update(m0, SetBundleUrl("https://example.com/app.html"))
  let #(m4, http_effects) = update.update(m3, FetchUrl)
  m4.publishing |> should.equal(True)
  list.any(http_effects, fn(e) {
    case e {
      app.Async(_) -> True
      _ -> False
    }
  })
  |> should.equal(True)

  let #(_, url_install_effects) = update.update(m3, InstallFromUrl)
  url_install_effects
  |> should.equal([app.OpenUrl("https://example.com/app.html")])
}

pub fn single_file_html_and_js_upload_test() {
  let assert Ok(act) =
    schema.decode_action_message(
      "{\"type\":\"omni:action\",\"action\":\"choose-local-file\"}",
    )
  let assert Some(ChooseLocalFile) = update.action_to_msg(act)
  let #(_, picker_effects) =
    update.update(model.init(TabStudio), ChooseLocalFile)
  list.length(picker_effects) |> should.equal(1)

  let js_b64 =
    <<"console.log('omni plugin')":utf8>>
    |> bit_array.base64_encode(True)
  let #(m_js, _) =
    update.update(
      Model(..model.init(TabStudio), bundle_url: "https://example.com/app.js"),
      BundleLoaded(Ok(js_b64)),
    )
  let assert Some(parsed_js) = m_js.bundle
  parsed_js.entry |> should.equal("index.js")
  let assert Ok(js_entry) = publisher_bundle.entry_file(parsed_js)
  js_entry.mime |> should.equal("application/javascript")

  let #(m_html, _) =
    update.update(
      model.init(TabStudio),
      SingleFileLoaded("widget.htm", "<html><body>hi</body></html>"),
    )
  let assert Some(parsed_html) = m_html.bundle
  parsed_html.entry |> should.equal("widget.htm")
  let assert Ok(html_entry) = publisher_bundle.entry_file(parsed_html)
  html_entry.mime |> should.equal("text/html")
}

pub fn published_tab_query_open_naddr_and_prepare_update_test() {
  let m_empty = model.init(TabPublished)
  let #(m_no_relays, _) = update.update(m_empty, QueryRelays)
  assert m_no_relays.error_message != None

  let m_with_relays = Model(..m_empty, relay_urls: ["wss://relay.example"])
  let #(m_querying, query_effects) = update.update(m_with_relays, QueryRelays)
  m_querying.publishing |> should.equal(True)
  list.length(query_effects) |> should.equal(1)

  let assert Ok(pk) =
    pubkey.parse(
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    )
  let assert Ok(eid) =
    event_id.parse(
      "1111111111111111111111111111111111111111111111111111111111111111",
    )
  let ev =
    Event(
      id: eid,
      pubkey: pk,
      created_at: 1_700_000_123,
      kind: kind.from_int(35_129),
      tags: [
        ["d", "org.example.queried"],
        ["name", "Queried App"],
        ["version", "2.0.0"],
        ["description", "From relay"],
        ["icon", "globe"],
        ["x", "deadbeef"],
        ["server", "https://cdn.satellite.earth"],
      ],
      content: "",
      sig: "00",
    )
  let assert Some(pkg) = model.published_from_event(ev, ["wss://relay.example"])
  let #(m_loaded, _) = update.update(m_querying, RelaysQueried(Ok([pkg])))
  m_loaded.publishing |> should.equal(False)
  list.length(m_loaded.published) |> should.equal(1)

  let pub_json = view.view(m_loaded) |> schema.encode_schema_message
  string.contains(pub_json, "Query Relays") |> should.equal(True)
  string.contains(pub_json, "Install / Update") |> should.equal(True)
  string.contains(pub_json, "Update .zip") |> should.equal(True)

  let #(_, open_effects) = update.update(m_loaded, OpenNaddr(pkg.naddr))
  open_effects |> should.equal([app.OpenUrl("nostr:" <> pkg.naddr)])

  let #(m_studio, _) =
    update.update(m_loaded, PrepareUpdate("org.example.queried"))
  m_studio.active_tab |> should.equal(TabStudio)
  m_studio.draft.id |> should.equal("org.example.queried")
  m_studio.draft.name |> should.equal("Queried App")
  m_studio.draft.version |> should.equal("2.0.0")
}

pub fn widget_open_studio_button_emits_navigate_action_test() {
  let widget = view.view(model.init(TabWidget))
  let assert node.Card(children: kids, ..) = widget
  let assert Ok(node.Button(action: act, ..)) =
    list.find(kids, fn(c) {
      case c {
        node.Button(label: "Open Plugin Studio", ..) -> True
        _ -> False
      }
    })
  act.name |> should.equal("navigate")
  let assert Some(NavigateTarget(view: Some("studio"), ..)) = act.navigate
  update.action_to_msg(act) |> should.equal(Some(SelectTab(TabStudio)))
}

pub fn publish_with_invalid_pubkey_returns_error_instead_of_crashing_test() {
  let m0 =
    Model(
      ..model.init(TabStudio),
      user_pubkey: Some("not-a-valid-hex-pubkey"),
      bundle: Some(publisher_bundle.from_html(
        "<html><body>hi</body></html>",
        "index.html",
      )),
    )
  let #(m1, effects) = update.update(m0, PublishPackage)
  m1.error_message |> should.equal(Some("Invalid signing public key."))
  effects |> should.equal([])
}
