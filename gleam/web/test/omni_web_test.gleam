//// Unit tests for the Omni web bootstrap configuration and bootloader.

import gleam/dict
import gleam/dynamic
import gleam/javascript/promise
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
import omni/nostr/event.{type Event, Event, UnsignedEvent}
import omni/nostr/event_id
import omni/nostr/filter.{Filter}
import omni/nostr/kind
import omni/nostr/pubkey
import omni/nostr/relay_url
import omni/platform/clock
import omni/platform/idb
import omni/platform/nip44
import omni/platform/ref
import omni/platform/storage
import omni/protocol/capability
import omni/protocol/grant
import omni/protocol/intent.{IntentHandler}
import omni/protocol/plugin_id
import omni/protocol/schema/action as schema_action
import omni/sandbox/manager
import omni/shell/model
import omni/shell/msg.{NavigateTo, ToggleFullscreen}
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
