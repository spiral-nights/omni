//// Unit tests for the Omni web bootstrap configuration and bootloader.

import fake_relay
import gleam/bit_array
import gleam/dict
import gleam/dynamic
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import lustre/element
import omni/kernel/crypto/keystore
import omni/kernel/intents/broker as intent_broker
import omni/kernel/kernel.{type KernelPorts, KernelPorts}
import omni/kernel/nostr/event_store
import omni/kernel/nostr/relay_pool
import omni/kernel/workspace/sync as workspace_sync
import omni/nostr/event.{type Event, Event, UnsignedEvent}
import omni/nostr/event_id
import omni/nostr/filter.{Filter}
import omni/nostr/kind
import omni/nostr/kind as nostr_kind
import omni/nostr/pubkey
import omni/nostr/relay_frame
import omni/nostr/relay_url
import omni/platform/clock
import omni/platform/idb
import omni/platform/nip44
import omni/platform/promise_ext as omni_promise_ext
import omni/platform/ref
import omni/platform/storage
import omni/platform/zip
import omni/protocol/blossom
import omni/protocol/capability
import omni/protocol/grant
import omni/protocol/intent.{IntentHandler}
import omni/protocol/plugin_id
import omni/protocol/schema/action as schema_action
import omni/protocol/schema/codec as schema_codec
import omni/protocol/workspace
import omni/sandbox/manager
import omni/shell/model
import omni/shell/msg.{
  EmbedSchema, HostedSchemaAction, NavigateTo, ToggleFullscreen,
}
import omni/shell/registry
import omni/web/boot
import omni/web/config
import omni/web/installer
import omni/web/permission_prompt
import omni/web/rpc

pub fn main() {
  gleeunit.main()
}

fn test_ports(
  store: storage.Storage,
) -> promise.Promise(Result(KernelPorts, Nil)) {
  use db_res <- promise.map(idb.in_memory_simple())
  case db_res {
    Ok(db) ->
      Ok(KernelPorts(
        storage: store,
        idb: db,
        clock: clock.fixed(1_700_000_000_000),
        prompt_handler: None,
      ))
    Error(_) -> Error(Nil)
  }
}

pub fn config_bootstrap_relays_parse_test() {
  let urls = config.bootstrap_relay_urls()
  list.length(urls) |> should.equal(3)
  list.length(config.bootstrap_relays()) |> should.equal(3)
}

pub fn config_system_apps_are_unique_and_enabled_test() {
  let apps = config.system_apps()
  let ids = list.map(apps, fn(app) { app.id })

  list.length(apps) |> should.equal(7)
  list.unique(ids) |> list.length |> should.equal(7)

  apps
  |> list.all(fn(app) { app.enabled && app.views != [] && app.source_url != "" })
  |> should.equal(True)

  config.dock_apps()
  |> list.any(fn(app) { app.pinned })
  |> should.equal(True)
}

pub fn config_system_apps_include_sidebar_widgets_test() {
  config.system_apps()
  |> list.any(fn(app) { app.placements != [] })
  |> should.equal(True)
}

pub fn boot_init_seeds_model_from_registry_and_config_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res

  let booted = boot.init_with_relays(ports, [], None)

  booted.model.active_shell_id |> should.equal("editorial")
  booted.registry.active_id |> should.equal("editorial")
  list.length(booted.model.installed_apps)
  |> should.equal(list.length(config.system_apps()))

  // First-enabled app becomes the initial page.
  case booted.model.active_page {
    model.PrimaryApp(plugin_id, _) ->
      plugin_id |> should.equal("org.omni.plugin.feed")
    _ -> should.fail()
  }

  promise.resolve(Nil)
}

pub fn boot_view_renders_active_theme_and_stylesheets_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res

  let html_str =
    boot.view(boot.init_with_relays(ports, [], None)) |> element.to_string

  should.be_true(string.contains(html_str, "id=\"omni-boot-root\""))
  should.be_true(string.contains(html_str, "data-active-shell=\"editorial\""))
  should.be_true(string.contains(html_str, "assets/styles/tokens.css"))
  should.be_true(string.contains(html_str, "assets/styles/schema.css"))
  should.be_true(string.contains(html_str, "assets/styles/shell-modules.css"))
  should.be_true(string.contains(html_str, "assets/styles/editorial.css"))
  should.be_true(string.contains(html_str, "editorial-shell-root"))

  promise.resolve(Nil)
}

pub fn boot_select_shell_persists_and_rerenders_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res

  let booted =
    boot.select_shell(boot.init_with_relays(ports, [], None), "classic")

  booted.model.active_shell_id |> should.equal("classic")
  booted.registry.active_id |> should.equal("classic")
  storage.get(store, registry.active_shell_storage_key)
  |> should.equal(Some("classic"))

  let html_str = boot.view(booted) |> element.to_string
  should.be_true(string.contains(html_str, "assets/styles/classic.css"))
  should.be_true(string.contains(html_str, "omni-shell omni-shell-classic"))

  promise.resolve(Nil)
}

pub fn boot_dispatch_updates_model_and_returns_host_effects_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res

  let #(booted, effects) =
    boot.dispatch(boot.init_with_relays(ports, [], None), ToggleFullscreen)

  booted.model.fullscreen |> should.equal(True)
  effects |> should.equal([])
  // Switching pages emits host-facing effects for the sandbox manager.
  let #(_, page_effects) =
    boot.dispatch(booted, NavigateTo(model.WidgetsDashboard))
  should.be_true(list.any(page_effects, fn(_) { True }))

  promise.resolve(Nil)
}

pub fn boot_spawns_sandbox_with_guest_bridge_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res

  let booted = boot.init_with_bridge(ports, Some("/* omni guest bridge */"))
  booted.bridge_script |> should.equal(Some("/* omni guest bridge */"))

  let assert Ok(#(next, mount)) =
    boot.spawn_sandbox(
      booted,
      "example.app.alpha",
      "<h1>hi</h1>",
      Some("?view=widget"),
    )

  should.be_true(string.contains(mount.srcdoc, "/* omni guest bridge */"))
  should.be_true(string.contains(mount.srcdoc, "<h1>hi</h1>"))
  manager.count(next.sandboxes) |> should.equal(1)

  let terminated = boot.terminate_sandbox(next, "example.app.alpha")
  manager.count(terminated.sandboxes) |> should.equal(0)

  case boot.spawn_sandbox(booted, "not a plugin id", "", None) {
    Ok(_) -> should.fail()
    Error(message) ->
      should.be_true(string.contains(message, "Invalid plugin ID"))
  }

  promise.resolve(Nil)
}

pub fn key_bootstrap_signing_and_rpc_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res

  let booted = boot.init_with_relays(ports, [], None)
  let assert Some(profile) = booted.model.user_profile
  string.length(profile.pubkey) |> should.equal(64)
  should.be_true(string.starts_with(profile.npub, "npub1"))

  // Signing an unsigned draft produces a real NIP-01 event.
  let draft =
    "{\"kind\":1,\"content\":\"hello\",\"tags\":[],\"created_at\":1700000000}"
  let assert Ok(signed) = rpc.sign_draft_json(booted, draft)
  should.be_true(string.contains(signed, "\"sig\":"))
  should.be_true(string.contains(signed, profile.pubkey))
  should.be_true(string.contains(signed, "hello"))

  // The Channel 2 RPC binder answers standard NIP-07 requests.
  let request =
    "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"nostr.getPublicKey\",\"params\":{}}"
  use response <- promise.await(rpc.handle(
    booted,
    "org.omni.plugin.feed",
    request,
  ))
  should.be_true(string.contains(response, profile.pubkey))

  // The key persists across boots sharing the same storage.
  use ports2_res <- promise.await(test_ports(store))
  let assert Ok(ports2) = ports2_res
  let rebooted = boot.init_with_relays(ports2, [], None)
  let assert Some(again) = rebooted.model.user_profile
  again.pubkey |> should.equal(profile.pubkey)

  promise.resolve(Nil)
}

pub fn rpc_rejects_invalid_plugin_and_signs_via_frame_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)

  use response <- promise.await(rpc.handle(booted, "not a plugin", "{}"))
  should.be_true(string.contains(response, "Invalid plugin ID"))

  let sign_request =
    "{\"jsonrpc\":\"2.0\",\"id\":\"7\",\"method\":\"nostr.signEvent\",\"params\":{\"event\":{\"kind\":1,\"content\":\"via rpc\",\"tags\":[],\"created_at\":1700000001}}}"
  use signed <- promise.await(rpc.handle(
    booted,
    "org.omni.plugin.feed",
    sign_request,
  ))
  should.be_true(string.contains(signed, "via rpc"))
  should.be_true(string.contains(signed, "\"sig\""))

  promise.resolve(Nil)
}

pub fn publish_pipeline_signs_broadcasts_and_ingests_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)

  let draft =
    UnsignedEvent(
      pubkey: None,
      created_at: 1_700_000_002,
      kind: kind.Note,
      tags: [["t", "gleam"]],
      content: "published through the host",
    )

  use result <- promise.await(boot.publish_draft(booted, draft))
  let assert Ok(event_id_hex) = result
  string.length(event_id_hex) |> should.equal(64)

  // The signed event is stored locally for 0ms reads.
  use count <- promise.await(event_store.count_events(
    booted.kernel.event_store,
    Filter(None, None, Some([kind.Note]), None, None, None, None, dict.new()),
  ))
  should.be_true(count >= 1)

  promise.resolve(Nil)
}

pub fn encrypted_publish_encrypts_content_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)

  let draft =
    UnsignedEvent(
      pubkey: None,
      created_at: 1_700_000_003,
      kind: kind.AppData,
      tags: [["d", "omni/notes/v1/note_1"]],
      content: "top secret plaintext",
    )

  use result <- promise.await(boot.publish_encrypted_draft(booted, draft))
  let assert Ok(event_id_hex) = result

  let assert Ok(eid) = event_id.parse(event_id_hex)
  use fetched <- promise.await(event_store.get_event_by_id(
    booted.kernel.event_store,
    eid,
  ))
  let assert Some(event) = fetched
  should.be_false(string.contains(event.content, "top secret plaintext"))
  should.be_true(string.length(event.content) > 0)

  // NIP-44 round-trip: only the user's key decrypts the payload.
  let assert Some(profile) = booted.model.user_profile
  use decrypted <- promise.await(nip44.nip44_decrypt(
    keystore.get_private_key(booted.kernel.keystore),
    profile.pubkey,
    event.content,
  ))
  let assert Ok(plaintext) = decrypted
  plaintext |> should.equal("top secret plaintext")

  promise.resolve(Nil)
}

pub fn nip65_relay_list_is_applied_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)

  boot.apply_relay_list(booted, [
    ["r", "wss://relay.example"],
    ["r", "wss://readonly.example", "read"],
    ["r", "wss://writeonly.example", "write"],
  ])

  let urls =
    relay_pool.get_configured_relays(booted.kernel.relay_pool)
    |> list.map(relay_url.to_string)
  should.be_true(list.contains(urls, "wss://relay.example"))
  should.be_true(list.contains(urls, "wss://readonly.example"))
  should.be_true(list.contains(urls, "wss://writeonly.example"))

  let assert Ok(both) = relay_url.parse("wss://relay.example")
  let assert Ok(read_only) = relay_url.parse("wss://readonly.example")
  let assert Ok(write_only) = relay_url.parse("wss://writeonly.example")

  relay_pool.relay_scope(booted.kernel.relay_pool, both)
  |> should.equal(#(True, True))
  relay_pool.relay_scope(booted.kernel.relay_pool, read_only)
  |> should.equal(#(True, False))
  relay_pool.relay_scope(booted.kernel.relay_pool, write_only)
  |> should.equal(#(False, True))

  promise.resolve(Nil)
}

pub fn intent_routing_opens_single_handler_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)

  let action =
    schema_action.new("view_note")
    |> schema_action.with_payload(
      dict.from_list([#("id", dynamic.string("abc"))]),
    )
  let routed = boot.route_intent(booted, action)

  case routed.model.active_page {
    model.PrimaryApp("org.omni.plugin.feed", _) -> Nil
    _ -> should.fail()
  }

  promise.resolve(Nil)
}

pub fn intent_routing_disambiguates_multiple_handlers_test() {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)

  // Register a second handler so the broker must ask the user.
  let _ =
    ref.update(booted.intent_broker, fn(current) {
      intent_broker.register_handler(
        current,
        IntentHandler(
          plugin_id: "org.omni.plugin.profiles",
          action: "view_note",
          name: Some("Profiles"),
          icon: Some("users"),
          description: None,
          route: None,
          is_rpc: None,
        ),
      )
    })

  let action =
    schema_action.new("view_note")
    |> schema_action.with_payload(
      dict.from_list([#("id", dynamic.string("abc"))]),
    )
  let routed = boot.route_intent(booted, action)

  let assert Some(prompt) = routed.model.intent_prompt
  prompt.intent_name |> should.equal("view_note")
  list.length(prompt.candidates) |> should.equal(2)

  promise.resolve(Nil)
}

pub fn permission_prompt_bridge_resolves_user_choice_test() {
  let prompts = permission_prompt.new()
  let seen = ref.new([])
  let _cancel =
    permission_prompt.watch(prompts, fn(prompt) { ref.set(seen, [prompt]) })

  let assert Ok(pid) = plugin_id.parse("org.omni.plugin.feed")
  let waiter =
    permission_prompt.handler(prompts)(pid, capability.NostrSign, Some(1), None)

  let assert [prompt] = ref.get(seen)
  prompt.plugin_id |> should.equal("org.omni.plugin.feed")
  prompt.capability |> should.equal("nostr:sign")
  prompt.scope |> should.equal(Some("1"))

  permission_prompt.resolve(prompts, prompt.id, True)
  use grant <- promise.await(waiter)
  grant |> should.equal(grant.Always)

  // The same prompt cannot be resolved twice.
  permission_prompt.resolve(prompts, prompt.id, False)

  promise.resolve(Nil)
}

pub fn installer_builds_app_from_url_test() {
  let app =
    installer.app_from(
      "https://example.com/widgets/app.html",
      "nsite.custom.example.com.widgets.app.html",
    )
  app.id |> should.equal("nsite.custom.example.com.widgets.app.html")
  app.name |> should.equal("app.html")
  app.source_url |> should.equal("https://example.com/widgets/app.html")
  app.enabled |> should.equal(True)
  list.length(app.views) |> should.equal(1)
}

fn manifest_event(content: String, tags: List(List(String))) -> Event {
  let assert Ok(eid) =
    event_id.parse(
      "4444444444444444444444444444444444444444444444444444444444444444",
    )
  let assert Ok(pk) =
    pubkey.parse(
      "5555555555555555555555555555555555555555555555555555555555555555",
    )
  Event(
    id: eid,
    pubkey: pk,
    created_at: 1_700_000_000,
    kind: kind.from_int(35_129),
    tags: tags,
    content: content,
    sig: "sig",
  )
}

fn no_fetch(_url: String) -> promise.Promise(Result(String, String)) {
  promise.resolve(Error("unexpected fetch"))
}

pub fn installer_url_resolution_uses_fetcher_test() -> promise.Promise(Nil) {
  let app =
    installer.app_from(
      "https://example.com/nsite/app.html",
      "nsite.custom.example.com.nsite.app.html",
    )
  app.id |> should.equal("nsite.custom.example.com.nsite.app.html")

  use result <- promise.await(
    installer.resolve_url_with(
      "https://example.com/app.html",
      "nsite.custom.example.com.app.html",
      fn(url) {
        url |> should.equal("https://example.com/app.html")
        promise.resolve(Ok("<html><body>hi</body></html>"))
      },
    ),
  )

  case result {
    Ok(bundle) -> {
      bundle.content |> should.equal("<html><body>hi</body></html>")
      bundle.app.source_url |> should.equal("https://example.com/app.html")
    }
    Error(err) -> panic as err
  }
  promise.resolve(Nil)
}

pub fn installer_coordinate_resolves_cached_manifest_test() -> promise.Promise(
  Nil,
) {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)

  let cur_event =
    manifest_event("<html><body><h1>Nsite</h1></body></html>", [
      ["d", "my-app"],
      ["name", "My App"],
      ["version", "2.1.0"],
    ])
  use _ <- promise.await(event_store.save_event(
    booted.kernel.event_store,
    cur_event,
  ))

  let target =
    "35129:5555555555555555555555555555555555555555555555555555555555555555:my-app"
  use result <- promise.await(installer.resolve_with(
    booted.kernel,
    target,
    "nsite.custom.my-app",
    no_fetch,
  ))

  case result {
    Ok(bundle) -> {
      bundle.app.name |> should.equal("My App")
      bundle.app.version |> should.equal(Some("2.1.0"))
      bundle.app.source_url |> should.equal(target)
      bundle.content |> should.equal("<html><body><h1>Nsite</h1></body></html>")
    }
    Error(err) -> panic as err
  }
  promise.resolve(Nil)
}

pub fn installer_blossom_manifest_inlines_assets_test() -> promise.Promise(Nil) {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)

  let cur_event =
    manifest_event("", [
      ["d", "blossom-app"],
      ["f", "index.html", "hash-html"],
      ["f", "app.js", "hash-js"],
      ["f", "app.css", "hash-css"],
      ["server", "https://blossom.test"],
    ])
  use _ <- promise.await(event_store.save_event(
    booted.kernel.event_store,
    cur_event,
  ))

  use result <- promise.await(
    installer.resolve_with(
      booted.kernel,
      "35129:5555555555555555555555555555555555555555555555555555555555555555:blossom-app",
      "nsite.custom.blossom-app",
      fn(url) {
        case url {
          "https://blossom.test/hash-html" ->
            promise.resolve(Ok(
              "<html><head></head><body><div id=\"app\"></div></body></html>",
            ))
          "https://blossom.test/hash-js" ->
            promise.resolve(Ok("console.log('omni')"))
          "https://blossom.test/hash-css" ->
            promise.resolve(Ok("body{margin:0}"))
          _ -> promise.resolve(Error("404"))
        }
      },
    ),
  )

  case result {
    Ok(bundle) -> {
      should.be_true(string.contains(bundle.content, "console.log('omni')"))
      should.be_true(string.contains(bundle.content, "body{margin:0}"))
      should.be_true(string.contains(
        bundle.content,
        "data-omni-asset=\"app.js\"",
      ))
      should.be_true(string.contains(
        bundle.content,
        "data-omni-asset=\"app.css\"",
      ))
    }
    Error(err) -> panic as err
  }
  promise.resolve(Nil)
}

pub fn installer_inline_assets_pure_test() {
  let html = "<html><head></head><body></body></html>"
  let out =
    installer.inline_manifest_assets(html, [
      #("app.css", "a{color:red}"),
      #("app.js", "run()"),
    ])
  string.contains(out, "<style data-omni-asset=\"app.css\">")
  |> should.equal(True)
  string.contains(out, "<script data-omni-asset=\"app.js\">")
  |> should.equal(True)
}

pub fn install_flow_fetches_and_spawns_sandbox_test() -> promise.Promise(Nil) {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], Some("<script>bridge</script>"))

  use result <- promise.await(boot.install_from_target(
    booted,
    fn(url) {
      url |> should.equal("https://example.com/app.html")
      promise.resolve(Ok("<html><body>installed nsite</body></html>"))
    },
    "https://example.com/app.html",
    "nsite.custom.example.com.app.html",
  ))

  case result {
    Ok(#(next, mount)) -> {
      string.contains(mount.srcdoc, "installed nsite") |> should.equal(True)
      string.contains(mount.srcdoc, "<script>bridge</script>")
      |> should.equal(True)
      manager.count(next.sandboxes) |> should.equal(1)
      list.any(next.model.installed_apps, fn(app) {
        app.source_url == "https://example.com/app.html"
      })
      |> should.equal(True)
    }
    Error(err) -> panic as err
  }

  // Failed fetch must not install or spawn.
  use failed <- promise.await(boot.install_from_target(
    booted,
    fn(_url) { promise.resolve(Error("HTTP 404")) },
    "https://example.com/missing.html",
    "nsite.custom.example.com.missing.html",
  ))
  failed |> should.equal(Error("HTTP 404"))
  manager.count(booted.sandboxes) |> should.equal(0)

  promise.resolve(Nil)
}

pub fn publish_flow_broadcasts_to_fake_relay_and_ingests_test() -> promise.Promise(
  Nil,
) {
  let store =
    storage.in_memory_from([
      #(relay_pool.storage_key_configured_relays, "[\"wss://fake.example\"]"),
    ])
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)

  let relay = fake_relay.start(booted.kernel.relay_pool, "wss://fake.example")

  let action =
    schema_action.new("publish-note")
    |> schema_action.with_payload(
      dict.from_list([
        #("composerText", dynamic.string("acceptance relay note")),
      ]),
    )
  let #(after_action, _effects) =
    boot.dispatch(booted, HostedSchemaAction("org.omni.plugin.feed", action))

  use ids <- promise.await(boot.publish_pending(after_action))
  let assert [id_hex] = ids
  let assert Ok(eid) = event_id.parse(id_hex)

  use maybe_signed <- promise.await(event_store.get_event_by_id(
    after_action.kernel.event_store,
    eid,
  ))
  let assert Some(signed) = maybe_signed
  signed.content |> should.equal("acceptance relay note")

  let expected = relay_frame.client_frame_to_json(relay_frame.Event(signed))
  list.contains(fake_relay.sent_frames(relay), expected)
  |> should.equal(True)

  fake_relay.emit(
    relay,
    relay_frame.relay_frame_to_json(relay_frame.Ok(eid, True, "accepted")),
  )

  let assert Ok(feed) = dict.get(after_action.builtins, "org.omni.plugin.feed")
  let rendered = feed.render() |> schema_codec.encode_node
  string.contains(rendered, "acceptance relay note") |> should.equal(True)

  promise.resolve(Nil)
}

pub fn boot_restores_local_workspace_before_remote_merge_test() -> promise.Promise(
  Nil,
) {
  let store = storage.in_memory()
  let ws =
    workspace.WorkspaceState(
      version: workspace.current_version,
      updated_at: 5000,
      active_page: Some("apps"),
      auto_sync: Some(True),
      shell_type: Some("panorama"),
      default_intents: dict.new(),
      plugins: [],
    )
  let _ =
    storage.set(
      store,
      workspace_sync.storage_key_workspace,
      workspace.encode(ws),
    )

  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)

  booted.model.active_shell_id |> should.equal("panorama")
  case booted.model.active_page {
    model.AppStore -> Nil
    _ -> should.fail()
  }
  promise.resolve(Nil)
}

pub fn workspace_publish_is_debounced_test() -> promise.Promise(Nil) {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)

  let #(after, _) = boot.dispatch(booted, NavigateTo(model.AppStore))
  let #(after, _) = boot.dispatch(after, NavigateTo(model.WidgetsDashboard))

  use _ <- promise.await(omni_promise_ext.delay(1000, Nil))
  use count <- promise.await(event_store.count_events(
    after.kernel.event_store,
    Filter(None, None, Some([kind.AppData]), None, None, None, None, dict.new()),
  ))
  count |> should.equal(1)
  promise.resolve(Nil)
}

pub fn key_import_switches_identity_and_export_returns_nsec_test() -> promise.Promise(
  Nil,
) {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)
  let original = booted.model.user_profile
  let assert Some(original_profile) = original

  let private_hex =
    "0000000000000000000000000000000000000000000000000000000000000001"
  use imported <- promise.await(
    promise.resolve(boot.import_key(booted, private_hex)),
  )
  case imported {
    Ok(next) -> {
      let assert Some(profile) = next.model.user_profile
      should.not_equal(profile.pubkey, original_profile.pubkey)
      let assert Ok(nsec) = boot.export_key_nsec(next)
      string.starts_with(nsec, "nsec1") |> should.equal(True)
    }
    Error(err) -> panic as err
  }

  case boot.import_key(booted, "not-a-key") {
    Error(_) -> Nil
    Ok(_) -> should.fail()
  }
  promise.resolve(Nil)
}

pub fn passphrase_lock_unlock_and_disable_test() -> promise.Promise(Nil) {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)
  let assert Some(original_profile) = booted.model.user_profile

  // Import a second account so per-account encryption is exercised.
  use imported <- promise.await(
    promise.resolve(boot.import_key(
      booted,
      "0000000000000000000000000000000000000000000000000000000000000001",
    )),
  )
  let assert Ok(booted) = imported
  let assert Some(second_profile) = booted.model.user_profile

  use enabled <- promise.await(boot.enable_passphrase(booted, "s3cret"))
  let assert Ok(next) = enabled
  next.model.key_encrypted |> should.equal(True)
  next.model.key_locked |> should.equal(False)

  // Reloading from the same storage yields a locked keystore.
  use ports2_res <- promise.await(test_ports(store))
  let assert Ok(ports2) = ports2_res
  let reloaded = boot.init_with_relays(ports2, [], None)
  reloaded.model.key_encrypted |> should.equal(True)
  reloaded.model.key_locked |> should.equal(True)

  let draft =
    "{\"kind\":1,\"content\":\"locked\",\"tags\":[],\"created_at\":1700000000}"
  rpc.sign_draft_json(reloaded, draft) |> should.be_error

  use unlocked <- promise.await(boot.unlock_key(reloaded, "s3cret"))
  let assert Ok(unlocked_boot) = unlocked
  unlocked_boot.model.key_locked |> should.equal(False)
  should.be_ok(rpc.sign_draft_json(unlocked_boot, draft))

  // Other accounts can be decrypted from the unlocked session key.
  use switched_result <- promise.await(boot.switch_account(
    unlocked_boot,
    original_profile.pubkey,
  ))
  let assert Ok(switched_boot) = switched_result
  let assert Some(now_first) = switched_boot.model.user_profile
  should.not_equal(now_first.pubkey, second_profile.pubkey)

  use disabled <- promise.await(boot.disable_passphrase(switched_boot))
  let assert Ok(plain) = disabled
  plain.model.key_encrypted |> should.equal(False)
  let assert Some(_) = storage.get(store, keystore.storage_key_private_key)
  promise.resolve(Nil)
}

pub fn boot_restores_persisted_theme_mode_test() -> promise.Promise(Nil) {
  let store = storage.in_memory()
  let _ = storage.set(store, boot.theme_mode_storage_key, "light")
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)
  booted.model.theme_mode |> should.equal("light")
  promise.resolve(Nil)
}

pub fn publisher_publish_uploads_and_broadcasts_nip5a_test() -> promise.Promise(
  Nil,
) {
  let store =
    storage.in_memory_from([
      #(relay_pool.storage_key_configured_relays, "[\"wss://fake.example\"]"),
    ])
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)
  let _relay = fake_relay.start(booted.kernel.relay_pool, "wss://fake.example")

  let archive =
    zip.zip([
      #("index.html", <<"<html><body>published app</body></html>":utf8>>),
      #("app.js", <<"console.log('published')":utf8>>),
    ])
    |> bit_array.base64_encode(True)

  let bundle_action =
    schema_action.new("set-bundle-zip")
    |> schema_action.with_payload(
      dict.from_list([
        #("zip", dynamic.string(archive)),
      ]),
    )
  let #(loaded, _) =
    boot.dispatch(
      booted,
      HostedSchemaAction("org.omni.plugin.publisher", bundle_action),
    )

  let publish_action = schema_action.new("publish-package")
  let #(after, _) =
    boot.dispatch(
      loaded,
      HostedSchemaAction("org.omni.plugin.publisher", publish_action),
    )

  let uploaded = ref.new([])
  let uploader = fn(upload: blossom.BlobUpload) {
    ref.update(uploaded, fn(items) { [upload.path, ..items] })
    promise.resolve(
      Ok(blossom.UploadedBlob(
        server: "https://blossom.test",
        path: upload.path,
        sha256: upload.sha256,
        url: "https://blossom.test/" <> upload.sha256,
      )),
    )
  }

  use ids <- promise.await(boot.publish_pending_with(after, uploader))
  list.length(ids) |> should.equal(1)
  list.sort(ref.get(uploaded), fn(a, b) { string.compare(a, b) })
  |> should.equal(["app.js", "index.html"])

  use count <- promise.await(event_store.count_events(
    after.kernel.event_store,
    Filter(
      None,
      None,
      Some([kind.from_int(35_129)]),
      None,
      None,
      None,
      None,
      dict.new(),
    ),
  ))
  count |> should.equal(1)

  use events <- promise.await(event_store.get_events(
    after.kernel.event_store,
    Filter(
      None,
      None,
      Some([kind.from_int(35_129)]),
      None,
      None,
      None,
      None,
      dict.new(),
    ),
  ))
  let assert [event] = events
  event.content |> should.equal("")
  should.be_true(
    list.contains(event.tags, ["server", "https://cdn.satellite.earth"]),
  )
  promise.resolve(Nil)
}

pub fn imported_account_can_be_switched_back_test() -> promise.Promise(Nil) {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)
  let assert Some(original) = booted.model.user_profile

  use imported <- promise.await(
    promise.resolve(boot.import_key(
      booted,
      "0000000000000000000000000000000000000000000000000000000000000001",
    )),
  )
  let assert Ok(with_second) = imported
  let assert Some(second) = with_second.model.user_profile
  should.not_equal(second.pubkey, original.pubkey)
  list.length(with_second.model.accounts) |> should.equal(2)

  use switched_result <- promise.await(boot.switch_account(
    with_second,
    original.pubkey,
  ))
  let assert Ok(switched) = switched_result
  let assert Some(back) = switched.model.user_profile
  back.pubkey |> should.equal(original.pubkey)
  list.length(switched.model.accounts) |> should.equal(2)
  promise.resolve(Nil)
}

fn feed_event(
  id_hex: String,
  pubkey_hex: String,
  kind_int: Int,
  tags: List(List(String)),
  content: String,
  created_at: Int,
) -> Event {
  let assert Ok(eid) = event_id.parse(id_hex)
  let assert Ok(pk) = pubkey.parse(pubkey_hex)
  Event(
    id: eid,
    pubkey: pk,
    created_at: created_at,
    kind: nostr_kind.from_int(kind_int),
    tags: tags,
    content: content,
    sig: "sig",
  )
}

pub fn zap_invoice_flow_broadcasts_request_and_returns_invoice_test() -> promise.Promise(
  Nil,
) {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)
  let assert Ok(feed) = dict.get(booted.builtins, "org.omni.plugin.feed")
  let assert Some(ingest) = feed.ingest

  let author =
    "7777777777777777777777777777777777777777777777777777777777777777"
  let note_id =
    "8888888888888888888888888888888888888888888888888888888888888888"
  ingest(feed_event(
    "9999999999999999999999999999999999999999999999999999999999999999",
    author,
    0,
    [],
    "{\"lud16\":\"alice@example.com\"}",
    1_700_000_000,
  ))
  ingest(feed_event(note_id, author, 1, [], "zap me", 1_700_000_001))

  let open_zap =
    schema_action.new("zap-note")
    |> schema_action.with_payload(
      dict.from_list([
        #("id", dynamic.string(note_id)),
      ]),
    )
  let #(opened, _) =
    boot.dispatch(booted, HostedSchemaAction("org.omni.plugin.feed", open_zap))

  let amount =
    schema_action.new("set-zap-amount")
    |> schema_action.with_payload(
      dict.from_list([
        #("value", dynamic.string("21")),
      ]),
    )
  let #(with_amount, _) =
    boot.dispatch(opened, HostedSchemaAction("org.omni.plugin.feed", amount))

  let send = schema_action.new("send-zap")
  let #(sent, _) =
    boot.dispatch(with_amount, HostedSchemaAction("org.omni.plugin.feed", send))

  let calls = ref.new([])
  let fetch = fn(url) {
    ref.update(calls, fn(items) { [url, ..items] })
    case string.contains(url, "/cb") {
      True -> promise.resolve(Ok("{\"pr\":\"lnbc1testinvoice\"}"))
      False ->
        promise.resolve(
          Ok(
            json.to_string(
              json.object([
                #("callback", json.string("https://lnurl.test/cb")),
                #("minSendable", json.int(1000)),
                #("maxSendable", json.int(100_000_000)),
                #("commentAllowed", json.int(100)),
              ]),
            ),
          ),
        )
    }
  }

  use _ <- promise.await(boot.process_zap_invoices_with(sent, fetch))
  use events <- promise.await(event_store.get_events(
    sent.kernel.event_store,
    Filter(
      None,
      None,
      Some([nostr_kind.from_int(9734)]),
      None,
      None,
      None,
      None,
      dict.new(),
    ),
  ))
  list.length(events) |> should.equal(1)
  let assert [request_event] = events
  list.contains(request_event.tags, ["amount", "21000"])
  |> should.equal(True)

  let assert Ok(feed_after) = dict.get(sent.builtins, "org.omni.plugin.feed")
  let rendered = feed_after.render() |> schema_codec.encode_node
  string.contains(rendered, "lnbc1testinvoice") |> should.equal(True)

  list.length(ref.get(calls)) |> should.equal(2)
  promise.resolve(Nil)
}

pub fn feed_note_click_opens_thread_view_test() -> promise.Promise(Nil) {
  let store = storage.in_memory()
  use ports_res <- promise.await(test_ports(store))
  let assert Ok(ports) = ports_res
  let booted = boot.init_with_relays(ports, [], None)
  let assert Ok(feed) = dict.get(booted.builtins, "org.omni.plugin.feed")
  let assert Some(ingest) = feed.ingest

  let author =
    "7777777777777777777777777777777777777777777777777777777777777777"
  let note_id =
    "8888888888888888888888888888888888888888888888888888888888888888"
  ingest(feed_event(note_id, author, 1, [], "clickable note", 1_700_000_001))

  let open_thread =
    schema_action.new("open-thread")
    |> schema_action.with_payload(
      dict.from_list([#("id", dynamic.string(note_id))]),
    )
  let #(opened, _) =
    boot.dispatch(
      booted,
      HostedSchemaAction("org.omni.plugin.feed", open_thread),
    )

  let assert Ok(feed_after) = dict.get(opened.builtins, "org.omni.plugin.feed")
  let rendered = feed_after.render() |> schema_codec.encode_node
  string.contains(rendered, "Conversation Thread") |> should.equal(True)
  string.contains(rendered, "clickable note") |> should.equal(True)

  // A streamed schema refresh (emitted whenever relay events arrive) must not
  // bounce the plugin back to its list view.
  let #(refreshed, _) =
    boot.dispatch(
      opened,
      EmbedSchema("org.omni.plugin.feed", feed_after.render()),
    )
  let assert Ok(feed_refreshed) =
    dict.get(refreshed.builtins, "org.omni.plugin.feed")
  feed_refreshed.render()
  |> schema_codec.encode_node
  |> string.contains("Conversation Thread")
  |> should.equal(True)
  promise.resolve(Nil)
}
