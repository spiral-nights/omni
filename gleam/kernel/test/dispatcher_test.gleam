import gleam/dict
import gleam/dynamic
import gleam/dynamic/decode
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import omni/kernel/acl/capability_store
import omni/kernel/acl/engine
import omni/kernel/crypto/keystore
import omni/kernel/nostr/coordinator
import omni/kernel/nostr/event_store
import omni/kernel/nostr/relay_pool
import omni/kernel/rpc/dispatcher.{type RpcContext, RpcContext}
import omni/kernel/rpc/quota
import omni/kernel/rpc/rate_limit
import omni/nostr/event.{UnsignedEvent}
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/pubkey
import omni/nostr/relay_url
import omni/platform/ref
import omni/platform/storage
import omni/protocol/capability
import omni/protocol/grant
import omni/protocol/plugin_id
import omni/protocol/rpc/envelope.{Error, IntId, Success}
import omni/protocol/rpc/error_code
import omni/protocol/rpc/method.{
  AuthSwitchKey, IntentsDispatch, Nip44, NostrDecrypt, NostrEncrypt, NostrFetch,
  NostrGetPublicKey, NostrGetRelays, NostrPublish, NostrSignEvent, RelaysAdd,
  RelaysList, RelaysRemove, StorageClear, StorageGet, StorageKeys, StorageRemove,
  StorageSet, UnknownMethod,
}

fn setup_test_context() -> Promise(
  #(RpcContext, capability_store.CapabilityStore),
) {
  let assert Ok(pid) = plugin_id.parse("org.omni.test")
  let store = storage.in_memory()
  let ks = keystore.new(store)
  let cap_store = capability_store.new(store)
  let acl = engine.new(cap_store, None)

  use es_res <- promise.await(
    event_store.open_in_memory(event_store.default_options()),
  )
  let assert Ok(es) = es_res
  let pool = relay_pool.new(storage.in_memory(), [])
  let coord = coordinator.new(es, pool, Some(acl))
  let limiter = rate_limit.new(100, 10)
  let q_tracker = quota.new(store, 1000)

  let ctx =
    RpcContext(
      plugin_id: pid,
      acl_engine: acl,
      keystore: ks,
      event_store: es,
      relay_pool: pool,
      coordinator: coord,
      storage: store,
      rate_limiter: limiter,
      quota_tracker: q_tracker,
      relay_scope: None,
      host: dispatcher.default_host_hooks(),
      subscriptions: dispatcher.new_subscription_registry(),
      guest_intents: dispatcher.new_intent_registry(),
    )

  promise.resolve(#(ctx, cap_store))
}

pub fn dispatcher_get_public_key_test() -> Promise(Nil) {
  use #(ctx, _) <- promise.await(setup_test_context())
  use res <- promise.await(dispatcher.dispatch(ctx, IntId(1), NostrGetPublicKey))

  case res {
    Success(id, result) -> {
      id |> should.equal(IntId(1))
      let pk_hex = pubkey.to_hex(keystore.get_public_key(ctx.keystore))
      let assert Ok(got_hex) = decode.run(result, decode.string)
      got_hex |> should.equal(pk_hex)
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success response"
  }
}

pub fn dispatcher_rate_limit_exceeded_test() -> Promise(Nil) {
  use #(ctx, _) <- promise.await(setup_test_context())
  let strict_limiter = rate_limit.new(0, 1)
  let ctx = RpcContext(..ctx, rate_limiter: strict_limiter)

  use res <- promise.await(dispatcher.dispatch(ctx, IntId(2), NostrGetPublicKey))

  case res {
    Error(id, code, _, _) -> {
      id |> should.equal(Some(IntId(2)))
      code |> should.equal(error_code.RateLimitExceeded)
      promise.resolve(Nil)
    }
    _ -> panic as "expected RateLimitExceeded error"
  }
}

pub fn dispatcher_sign_event_permitted_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())

  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.NostrSign,
    grant.Always,
    None,
  )

  let draft =
    UnsignedEvent(
      pubkey: None,
      created_at: 1_700_000_000,
      kind: kind.Note,
      tags: [],
      content: "Hello from Omni Gleam RPC dispatcher!",
    )

  use res <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(3),
    NostrSignEvent(draft),
  ))

  case res {
    Success(id, result) -> {
      id |> should.equal(IntId(3))
      let assert Ok(content) =
        decode.run(result, decode.at(["content"], decode.string))
      content |> should.equal("Hello from Omni Gleam RPC dispatcher!")

      // Verify event was auto-committed to LocalEventStore
      use events <- promise.await(event_store.get_events(
        ctx.event_store,
        filter.Filter(..filter.new(), kinds: Some([kind.Note])),
      ))
      events |> should.not_equal([])
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success response"
  }
}

pub fn dispatcher_sign_event_denied_test() -> Promise(Nil) {
  use #(ctx, _) <- promise.await(setup_test_context())

  let draft =
    UnsignedEvent(
      pubkey: None,
      created_at: 1_700_000_000,
      kind: kind.Note,
      tags: [],
      content: "Unauthorized sign attempt",
    )

  use res <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(4),
    NostrSignEvent(draft),
  ))

  case res {
    Error(id, code, _, _) -> {
      id |> should.equal(Some(IntId(4)))
      code |> should.equal(error_code.PermissionDenied)
      promise.resolve(Nil)
    }
    _ -> panic as "expected PermissionDenied error"
  }
}

pub fn dispatcher_sign_event_reserved_nip78_rejected_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())

  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.NostrSign,
    grant.Always,
    None,
  )

  let nip78_kind = kind.from_int(30_078)
  let reserved_draft =
    UnsignedEvent(
      pubkey: None,
      created_at: 1_700_000_000,
      kind: nip78_kind,
      tags: [["d", "omni/workspace/v1"]],
      content: "malicious sync hijack",
    )

  use res <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(5),
    NostrSignEvent(reserved_draft),
  ))

  case res {
    Error(id, code, _, _) -> {
      id |> should.equal(Some(IntId(5)))
      code |> should.equal(error_code.PermissionDenied)
      promise.resolve(Nil)
    }
    _ -> panic as "expected PermissionDenied on reserved NIP-78"
  }
}

pub fn dispatcher_fetch_events_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())

  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.NostrRead,
    grant.Always,
    None,
  )

  let draft =
    UnsignedEvent(
      pubkey: None,
      created_at: 1_700_000_000,
      kind: kind.Note,
      tags: [],
      content: "Cached note for fetch",
    )
  let assert Ok(signed) = keystore.sign_event(ctx.keystore, draft)
  use _ <- promise.await(event_store.save_event(ctx.event_store, signed))

  let flt = filter.Filter(..filter.new(), kinds: Some([kind.Note]))
  let opts =
    Some(method.FetchOptions(
      timeout_ms: Some(500),
      relays: None,
      local_only: Some(True),
    ))

  use res <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(6),
    NostrFetch([flt], opts),
  ))

  case res {
    Success(id, result) -> {
      id |> should.equal(IntId(6))
      let assert Ok(events) =
        decode.run(result, decode.list(of: decode.dynamic))
      events |> should.not_equal([])
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success for fetch"
  }
}

pub fn dispatcher_publish_event_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())

  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.NostrWrite,
    grant.Always,
    None,
  )

  let draft =
    UnsignedEvent(
      pubkey: None,
      created_at: 1_700_000_000,
      kind: kind.Note,
      tags: [],
      content: "Published note",
    )
  let assert Ok(signed) = keystore.sign_event(ctx.keystore, draft)

  use res <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(7),
    NostrPublish(signed),
  ))

  case res {
    Success(id, result) -> {
      id |> should.equal(IntId(7))
      let assert Ok(success) =
        decode.run(result, decode.at(["success"], decode.bool))
      success |> should.be_true
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success for publish"
  }
}

pub fn dispatcher_storage_lifecycle_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())

  // Without grant -> denied
  use res1 <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(10),
    StorageGet("theme"),
  ))
  case res1 {
    Error(_, code, _, _) -> code |> should.equal(error_code.PermissionDenied)
    _ -> panic as "expected PermissionDenied without grant"
  }

  // Grant StorageKv
  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.StorageKv,
    grant.Always,
    None,
  )

  // Set "theme" = "dark"
  use res_set <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(11),
    StorageSet("theme", "dark"),
  ))
  case res_set {
    Success(id, _) -> id |> should.equal(IntId(11))
    _ -> panic as "expected Success on StorageSet"
  }

  // Get "theme"
  use res_get <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(12),
    StorageGet("theme"),
  ))
  case res_get {
    Success(id, result) -> {
      id |> should.equal(IntId(12))
      let assert Ok(val) = decode.run(result, decode.string)
      val |> should.equal("dark")
    }
    _ -> panic as "expected Success on StorageGet"
  }

  // StorageKeys
  use res_keys <- promise.await(dispatcher.dispatch(ctx, IntId(13), StorageKeys))
  case res_keys {
    Success(id, result) -> {
      id |> should.equal(IntId(13))
      let assert Ok(keys) = decode.run(result, decode.list(of: decode.string))
      keys |> should.equal(["theme"])
    }
    _ -> panic as "expected Success on StorageKeys"
  }

  // StorageRemove
  use res_del <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(14),
    StorageRemove("theme"),
  ))
  case res_del {
    Success(id, _) -> id |> should.equal(IntId(14))
    _ -> panic as "expected Success on StorageRemove"
  }

  // Verify get returns null
  use res_get_after <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(15),
    StorageGet("theme"),
  ))
  case res_get_after {
    Success(_, result) -> {
      dynamic.classify(result) |> should.equal("Nil")
    }
    _ -> panic as "expected Success on StorageGet null"
  }

  // Test StorageClear
  let _ = dispatcher.dispatch(ctx, IntId(16), StorageSet("k1", "v1"))
  let _ = dispatcher.dispatch(ctx, IntId(17), StorageSet("k2", "v2"))
  use res_clear <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(18),
    StorageClear,
  ))
  case res_clear {
    Success(id, _) -> id |> should.equal(IntId(18))
    _ -> panic as "expected Success on StorageClear"
  }

  use res_keys_empty <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(19),
    StorageKeys,
  ))
  case res_keys_empty {
    Success(_, result) -> {
      let assert Ok(empty_keys) =
        decode.run(result, decode.list(of: decode.string))
      empty_keys |> should.equal([])
      promise.resolve(Nil)
    }
    _ -> panic as "expected empty keys"
  }
}

pub fn dispatcher_storage_quota_exceeded_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())

  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.StorageKv,
    grant.Always,
    None,
  )

  let tight_quota = quota.new(ctx.storage, 10)
  let ctx = RpcContext(..ctx, quota_tracker: tight_quota)

  use res <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(20),
    StorageSet("big_data", "1234567890123456789012345"),
  ))

  case res {
    Error(id, code, _, _) -> {
      id |> should.equal(Some(IntId(20)))
      code |> should.equal(error_code.QuotaExceeded)
      promise.resolve(Nil)
    }
    _ -> panic as "expected QuotaExceeded error"
  }
}

pub fn dispatcher_relays_management_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())

  let assert Ok(relay) = relay_url.parse("wss://relay.damus.io")

  // Denied without RelaysManage grant
  use res_denied <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(30),
    RelaysAdd(relay),
  ))
  case res_denied {
    Error(_, code, _, _) -> code |> should.equal(error_code.PermissionDenied)
    _ -> panic as "expected PermissionDenied for RelaysAdd without grant"
  }

  // Grant RelaysManage
  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.RelaysManage,
    grant.Always,
    None,
  )

  // Add relay
  use res_add <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(31),
    RelaysAdd(relay),
  ))
  case res_add {
    Success(id, _) -> id |> should.equal(IntId(31))
    _ -> panic as "expected Success for RelaysAdd"
  }

  // List relays
  use res_list <- promise.await(dispatcher.dispatch(ctx, IntId(32), RelaysList))
  case res_list {
    Success(id, result) -> {
      id |> should.equal(IntId(32))
      let assert Ok(items) = decode.run(result, decode.list(of: decode.dynamic))
      items |> should.not_equal([])
    }
    _ -> panic as "expected Success for RelaysList"
  }

  // Remove relay
  use res_rem <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(33),
    RelaysRemove(relay),
  ))
  case res_rem {
    Success(id, _) -> {
      id |> should.equal(IntId(33))
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success for RelaysRemove"
  }
}

pub fn dispatcher_intents_dispatch_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())

  use res_denied <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(40),
    IntentsDispatch("view_profile", None),
  ))
  case res_denied {
    Error(_, code, _, _) -> code |> should.equal(error_code.PermissionDenied)
    _ -> panic as "expected PermissionDenied for IntentsDispatch"
  }

  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.IntentsDispatch,
    grant.Always,
    None,
  )

  use res_ok <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(41),
    IntentsDispatch("view_profile", None),
  ))
  case res_ok {
    Success(id, result) -> {
      id |> should.equal(IntId(41))
      let assert Ok(action) =
        decode.run(result, decode.at(["action"], decode.string))
      action |> should.equal("view_profile")
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success for IntentsDispatch"
  }
}

pub fn dispatcher_auth_switch_key_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())

  let target_priv =
    "1111111111111111111111111111111111111111111111111111111111111111"

  use res_denied <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(50),
    AuthSwitchKey(target_priv),
  ))
  case res_denied {
    Error(_, code, _, _) -> code |> should.equal(error_code.PermissionDenied)
    _ -> panic as "expected PermissionDenied for AuthSwitchKey"
  }

  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.IdentityManageKeys,
    grant.Always,
    None,
  )

  use res_ok <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(51),
    AuthSwitchKey(target_priv),
  ))
  case res_ok {
    Success(id, result) -> {
      id |> should.equal(IntId(51))
      let expected_pk = keystore.get_public_key(ctx.keystore)
      let assert Ok(pk_str) =
        decode.run(result, decode.at(["pubkey"], decode.string))
      pk_str |> should.equal(pubkey.to_hex(expected_pk))

      event_store.get_user_pubkey(ctx.event_store)
      |> should.equal(Some(expected_pk))
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success for AuthSwitchKey"
  }
}

pub fn dispatcher_unknown_method_test() -> Promise(Nil) {
  use #(ctx, _) <- promise.await(setup_test_context())

  use res <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(60),
    UnknownMethod("custom.unknown", None),
  ))

  case res {
    Error(id, code, _, _) -> {
      id |> should.equal(Some(IntId(60)))
      code |> should.equal(error_code.MethodNotFound)
      promise.resolve(Nil)
    }
    _ -> panic as "expected MethodNotFound"
  }
}

pub fn dispatcher_dispatch_json_wire_test() -> Promise(Nil) {
  use #(ctx, _) <- promise.await(setup_test_context())

  let wire_req =
    "{\"jsonrpc\":\"2.0\",\"id\":99,\"method\":\"nostr.getPublicKey\"}"
  use res <- promise.await(dispatcher.dispatch_json(ctx, wire_req))

  case res {
    Success(id, result) -> {
      id |> should.equal(IntId(99))
      let assert Ok(hex) = decode.run(result, decode.string)
      let expected = pubkey.to_hex(keystore.get_public_key(ctx.keystore))
      hex |> should.equal(expected)
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success on wire JSON request"
  }
}

pub fn dispatcher_get_relays_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())
  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.RelaysManage,
    grant.Always,
    None,
  )
  let assert Ok(url) = relay_url.parse("wss://relay.example.com")
  relay_pool.add_relay(ctx.relay_pool, url)

  use res <- promise.await(dispatcher.dispatch(ctx, IntId(70), NostrGetRelays))
  case res {
    Success(_, result) -> {
      let assert Ok(entry) =
        decode.run(
          result,
          decode.at(["wss://relay.example.com"], decode.dynamic),
        )
      let assert Ok(read) = decode.run(entry, decode.at(["read"], decode.bool))
      let assert Ok(write) =
        decode.run(entry, decode.at(["write"], decode.bool))
      read |> should.equal(True)
      write |> should.equal(True)
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success for NostrGetRelays"
  }
}

pub fn dispatcher_subscribe_streams_eose_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())
  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.NostrRead,
    grant.Always,
    None,
  )
  let notifications = ref.new([])
  let wire =
    "{\"jsonrpc\":\"2.0\",\"id\":71,\"method\":\"nostr.subscribe\",\"params\":{\"subscriptionId\":\"feed\",\"filters\":[{\"kinds\":[1]}]}}"
  use res <- promise.await(
    dispatcher.dispatch_json_streaming(ctx, wire, fn(notification) {
      ref.update(notifications, fn(items) { [notification, ..items] })
    }),
  )
  case res {
    Success(_, _) -> {
      let assert [first, ..] = ref.get(notifications)
      first
      |> should.equal(
        "{\"jsonrpc\":\"2.0\",\"method\":\"nostr.stream.eose\",\"params\":{\"subscriptionId\":\"feed\"}}",
      )
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success for NostrSubscribe"
  }
}

pub fn dispatcher_nip44_roundtrip_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())
  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.NostrEncrypt,
    grant.Always,
    None,
  )
  let me = keystore.get_public_key(ctx.keystore)

  use enc <- promise.await(dispatcher.dispatch(
    ctx,
    IntId(72),
    NostrEncrypt(Nip44, me, "payload"),
  ))
  case enc {
    Success(_, result) -> {
      let assert Ok(ciphertext) = decode.run(result, decode.string)
      use dec <- promise.await(dispatcher.dispatch(
        ctx,
        IntId(73),
        NostrDecrypt(Nip44, me, ciphertext),
      ))
      case dec {
        Success(_, plain) -> {
          let assert Ok(text) = decode.run(plain, decode.string)
          text |> should.equal("payload")
          promise.resolve(Nil)
        }
        _ -> panic as "expected NIP-44 decrypt to succeed"
      }
    }
    _ -> panic as "expected NIP-44 encrypt to succeed"
  }
}

pub fn dispatcher_relay_scope_filters_relay_list_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())
  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.RelaysManage,
    grant.Always,
    None,
  )
  let assert Ok(one) = relay_url.parse("wss://one.example")
  let assert Ok(two) = relay_url.parse("wss://two.example")
  relay_pool.add_relay(ctx.relay_pool, one)
  relay_pool.add_relay(ctx.relay_pool, two)

  let scoped = RpcContext(..ctx, relay_scope: Some(["wss://one.example"]))

  use res <- promise.await(dispatcher.dispatch(scoped, IntId(80), RelaysList))
  case res {
    Success(_, result) -> {
      let assert Ok(items) = decode.run(result, decode.list(decode.dynamic))
      list.length(items) |> should.equal(1)
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success for RelaysList"
  }
}

pub fn dispatcher_local_only_scope_filters_relays_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())
  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.RelaysManage,
    grant.Always,
    None,
  )
  let assert Ok(one) = relay_url.parse("wss://one.example")
  relay_pool.add_relay(ctx.relay_pool, one)

  let scoped = RpcContext(..ctx, relay_scope: Some([]))
  use res <- promise.await(dispatcher.dispatch(scoped, IntId(81), RelaysList))
  case res {
    Success(_, result) -> {
      let assert Ok(items) = decode.run(result, decode.list(decode.dynamic))
      list.length(items) |> should.equal(0)
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success for RelaysList"
  }
}

pub fn dispatcher_intent_handle_and_emit_test() -> Promise(Nil) {
  use #(ctx, cap_store) <- promise.await(setup_test_context())
  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.IntentsHandle,
    grant.Always,
    None,
  )
  capability_store.set_grant(
    cap_store,
    ctx.plugin_id,
    capability.IntentsDispatch,
    grant.Always,
    None,
  )
  let notifications = ref.new([])
  let wire =
    "{\"jsonrpc\":\"2.0\",\"id\":82,\"method\":\"intent.handle\",\"params\":{\"action\":\"view_note\"}}"
  use res <- promise.await(
    dispatcher.dispatch_json_streaming(ctx, wire, fn(notification) {
      ref.update(notifications, fn(items) { [notification, ..items] })
    }),
  )
  case res {
    Success(_, _) -> {
      let payload =
        Some(dict.from_list([#("target", dynamic.string("note1abc"))]))
      dispatcher.invoke_guest_intent(
        ctx.guest_intents,
        "org.omni.test",
        "view_note",
        payload,
      )
      |> should.be_true()
      let assert [first, ..] = ref.get(notifications)
      string.contains(first, "intent.invoke") |> should.be_true()
      string.contains(first, "note1abc") |> should.be_true()

      dispatcher.emit_guest_intents(ctx.guest_intents, "view_note", payload)
      |> should.equal(1)
      list.length(ref.get(notifications)) |> should.equal(2)
      promise.resolve(Nil)
    }
    _ -> panic as "expected Success for intent.handle"
  }
}
