//// Central JSON-RPC 2.0 dispatcher for sandboxed guest plugins.
////
//// Receives RPC requests emitted by guest plugins over Channel 2, validates
//// capability grants via `AclEngine`, enforces token bucket rate limiting and
//// storage quotas, and routes requests to the appropriate kernel subsystem.

import gleam/dict.{type Dict}
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/javascript/promise.{type Promise}
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/kernel/acl/engine.{type AclEngine} as acl_engine
import omni/kernel/acl/policy
import omni/kernel/crypto/keystore.{type Keystore}
import omni/kernel/nostr/coordinator.{type SubscriptionCoordinator}
import omni/kernel/nostr/event_store.{type LocalEventStore}
import omni/kernel/nostr/relay_pool.{type RelayPool}
import omni/kernel/rpc/quota.{type QuotaTracker}
import omni/kernel/rpc/rate_limit.{type RateLimiter}
import omni/nostr/event
import omni/nostr/event_codec
import omni/nostr/event_id
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/nip19
import omni/nostr/pubkey.{type Pubkey}
import omni/nostr/relay_url.{type RelayUrl}
import omni/platform/clock
import omni/platform/json as platform_json
import omni/platform/log
import omni/platform/nip44
import omni/platform/ref
import omni/platform/secp256k1
import omni/platform/storage.{type Storage}
import omni/protocol/capability
import omni/protocol/intent as protocol_intent
import omni/protocol/plugin_id.{type PluginId}
import omni/protocol/rpc/codec
import omni/protocol/rpc/envelope.{type Id, type Response}
import omni/protocol/rpc/error_code
import omni/protocol/rpc/method.{
  type FetchOptions, type Request, AuthGenerateKey, AuthGetNpub, AuthGetNsec,
  AuthSwitchKey, FetchOptions, IntentEmit, IntentHandle, IntentsDispatch,
  KernelHandleUri, NavigationOpen, Nip04, Nip44, NostrDecrypt, NostrEncrypt,
  NostrFetch, NostrGetPublicKey, NostrGetRelays, NostrPublish, NostrPublishDraft,
  NostrSignEvent, NostrSubscribe, NostrUnsubscribe, ProfileGet, ProfilePublish,
  RelaysAdd, RelaysList, RelaysRemove, Share, StorageClear, StorageGet,
  StorageKeys, StorageRemove, StorageSet, UnknownMethod,
}

/// Callbacks into the host shell used by guest RPC methods that mutate shell
/// state (intents, navigation) or reach browser-only APIs (share, protocol URIs).
pub type HostHooks {
  HostHooks(
    dispatch_intent: Option(fn(String, Option(Dict(String, Dynamic))) -> Nil),
    navigate: Option(fn(String, Option(String)) -> Nil),
    share: Option(fn(Option(String), Option(String), Option(String)) -> Nil),
    handle_uri: Option(fn(String) -> Nil),
  )
}

/// Create `HostHooks` with no host callbacks wired.
pub fn default_host_hooks() -> HostHooks {
  HostHooks(
    dispatch_intent: None,
    navigate: None,
    share: None,
    handle_uri: None,
  )
}

/// A guest plugin that registered an RPC intent handler.
pub type GuestIntentHandler {
  GuestIntentHandler(
    plugin_id: String,
    notify: fn(String, Option(Dict(String, Dynamic))) -> Nil,
  )
}

/// Per-kernel registry of `intent.handle` registrations keyed by action.
pub type GuestIntentRegistry {
  GuestIntentRegistry(handlers: ref.Ref(Dict(String, List(GuestIntentHandler))))
}

/// Create an empty guest intent registry.
pub fn new_intent_registry() -> GuestIntentRegistry {
  GuestIntentRegistry(handlers: ref.new(dict.new()))
}

/// Register (or replace) a plugin's handler for `action`.
pub fn register_guest_intent(
  registry: GuestIntentRegistry,
  plugin_id: String,
  action: String,
  notify: fn(String, Option(Dict(String, Dynamic))) -> Nil,
) -> Nil {
  let key = protocol_intent.canonical_action(action)
  ref.update(registry.handlers, fn(handlers) {
    let current = case dict.get(handlers, key) {
      Ok(items) -> items
      Error(_) -> []
    }
    let filtered =
      list.filter(current, fn(item) { item.plugin_id != plugin_id })
    dict.insert(handlers, key, [
      GuestIntentHandler(plugin_id: plugin_id, notify: notify),
      ..filtered
    ])
  })
}

/// Invoke every registered handler for `action`; returns the invoke count.
pub fn emit_guest_intents(
  registry: GuestIntentRegistry,
  action: String,
  payload: Option(Dict(String, Dynamic)),
) -> Int {
  let key = protocol_intent.canonical_action(action)
  let handlers = case dict.get(ref.get(registry.handlers), key) {
    Ok(items) -> items
    Error(_) -> []
  }
  list.each(handlers, fn(item) { item.notify(key, payload) })
  list.length(handlers)
}

/// Invoke one plugin's handler for `action`; returns True when invoked.
pub fn invoke_guest_intent(
  registry: GuestIntentRegistry,
  plugin_id: String,
  action: String,
  payload: Option(Dict(String, Dynamic)),
) -> Bool {
  let key = protocol_intent.canonical_action(action)
  case dict.get(ref.get(registry.handlers), key) {
    Ok(items) -> {
      let matches = list.filter(items, fn(item) { item.plugin_id == plugin_id })
      list.each(matches, fn(item) { item.notify(key, payload) })
      !list.is_empty(matches)
    }
    Error(_) -> False
  }
}

/// Per-kernel registry of live guest subscriptions keyed by plugin and sub id.
pub type SubscriptionRegistry {
  SubscriptionRegistry(active: ref.Ref(Dict(String, fn() -> Nil)))
}

/// Create an empty guest subscription registry.
pub fn new_subscription_registry() -> SubscriptionRegistry {
  SubscriptionRegistry(active: ref.new(dict.new()))
}

/// Execution context for resolving guest RPC requests from a specific plugin.
pub type RpcContext {
  RpcContext(
    plugin_id: PluginId,
    acl_engine: AclEngine,
    keystore: Keystore,
    event_store: LocalEventStore,
    relay_pool: RelayPool,
    coordinator: SubscriptionCoordinator,
    storage: Storage,
    rate_limiter: RateLimiter,
    quota_tracker: QuotaTracker,
    relay_scope: Option(List(String)),
    host: HostHooks,
    subscriptions: SubscriptionRegistry,
    guest_intents: GuestIntentRegistry,
  )
}

fn json_to_dynamic(j: json.Json) -> Dynamic {
  case json.to_string(j) |> platform_json.parse_dynamic {
    Ok(d) -> d
    Error(_) -> dynamic.nil()
  }
}

fn relay_in_scope(ctx: RpcContext, url: RelayUrl) -> Bool {
  case ctx.relay_scope {
    None -> True
    Some(scoped) -> list.contains(scoped, relay_url.to_string(url))
  }
}

fn scoped_relay_urls(scope: Option(List(String))) -> Option(List(RelayUrl)) {
  case scope {
    Some(urls) ->
      Some(
        list.filter_map(urls, fn(raw) {
          case relay_url.parse(raw) {
            Ok(url) -> Ok(url)
            Error(_) -> Error(Nil)
          }
        }),
      )
    None -> None
  }
}

/// Dispatches an incoming typed `Request` for `id` under `ctx`.
///
/// First checks the per-client token bucket rate limiter. If rate limit is
/// exceeded, immediately resolves with an `envelope.Error` (`RateLimitExceeded`).
/// Otherwise, evaluates ACL permissions and routes to the subsystem handler.
pub fn dispatch(
  ctx: RpcContext,
  id: Id,
  request: Request,
) -> Promise(Response) {
  let client_key = plugin_id.to_string(ctx.plugin_id)
  let now_ms = clock.system().now_ms()
  case rate_limit.check(ctx.rate_limiter, client_key, now_ms) {
    False -> {
      log.warn("rpc", client_key <> " exceeded the request rate limit")
      promise.resolve(envelope.Error(
        id: Some(id),
        code: error_code.RateLimitExceeded,
        message: "Rate limit exceeded",
        data: None,
      ))
    }
    True -> handle_request(ctx, id, request)
  }
}

/// Decodes and dispatches a raw JSON string JSON-RPC 2.0 request frame.
pub fn dispatch_json(ctx: RpcContext, raw_json: String) -> Promise(Response) {
  case codec.decode_request(raw_json) {
    Ok(#(id, req)) -> dispatch(ctx, id, req)
    Error(err) -> {
      log.warn(
        "rpc",
        "rejected a malformed request from "
          <> plugin_id.to_string(ctx.plugin_id)
          <> ": "
          <> err.message,
      )
      promise.resolve(envelope.Error(
        id: err.id,
        code: err.code,
        message: err.message,
        data: None,
      ))
    }
  }
}

/// Decode and dispatch a request frame, emitting streamed JSON-RPC
/// notifications through `notify` for live subscriptions.
pub fn dispatch_json_streaming(
  ctx: RpcContext,
  raw_json: String,
  notify: fn(String) -> Nil,
) -> Promise(Response) {
  case codec.decode_request(raw_json) {
    Ok(#(id, req)) -> dispatch_streaming(ctx, id, req, notify)
    Error(err) ->
      promise.resolve(envelope.Error(
        id: err.id,
        code: err.code,
        message: err.message,
        data: None,
      ))
  }
}

/// Dispatch a typed request, allowing `nostr.subscribe` to stream events.
pub fn dispatch_streaming(
  ctx: RpcContext,
  id: Id,
  request: Request,
  notify: fn(String) -> Nil,
) -> Promise(Response) {
  let client_key = plugin_id.to_string(ctx.plugin_id)
  let now_ms = clock.system().now_ms()
  case rate_limit.check(ctx.rate_limiter, client_key, now_ms) {
    False -> {
      log.warn("rpc", client_key <> " exceeded the request rate limit")
      promise.resolve(envelope.Error(
        id: Some(id),
        code: error_code.RateLimitExceeded,
        message: "Rate limit exceeded",
        data: None,
      ))
    }
    True ->
      case request {
        NostrSubscribe(sub_id, filters) ->
          handle_subscribe(ctx, id, sub_id, filters, notify)
        IntentHandle(action) -> handle_intent_handle(ctx, id, action, notify)
        _ -> handle_request(ctx, id, request)
      }
  }
}

fn subscription_key(ctx: RpcContext, sub_id: String) -> String {
  plugin_id.to_string(ctx.plugin_id) <> "::" <> sub_id
}

fn handle_subscribe(
  ctx: RpcContext,
  id: Id,
  sub_id: String,
  filters: List(filter.Filter),
  notify: fn(String) -> Nil,
) -> Promise(Response) {
  let policy_req =
    policy.Request(capability: capability.NostrRead, kind: None, d_tag: None)
  use allowed <- promise.await(acl_engine.check_permission(
    ctx.acl_engine,
    ctx.plugin_id,
    policy_req,
  ))
  case allowed {
    False ->
      promise.resolve(envelope.Error(
        id: Some(id),
        code: error_code.PermissionDenied,
        message: "Permission denied for nostr:read",
        data: None,
      ))
    True -> {
      close_subscription(ctx, sub_id)
      let namespaced = plugin_id.to_string(ctx.plugin_id) <> ":" <> sub_id
      let on_event = fn(ev) {
        notify(stream_event_json(sub_id, ev))
        Nil
      }
      let on_eose = fn() {
        notify(stream_eose_json(sub_id))
        Nil
      }
      use closer <- promise.await(case ctx.relay_scope {
        Some(urls) ->
          coordinator.subscribe_targeted(
            ctx.coordinator,
            namespaced,
            filters,
            urls,
            on_event,
            Some(on_eose),
          )
        None ->
          coordinator.subscribe(
            ctx.coordinator,
            namespaced,
            filters,
            on_event,
            Some(on_eose),
          )
      })
      ref.update(ctx.subscriptions.active, fn(active) {
        dict.insert(active, subscription_key(ctx, sub_id), closer)
      })
      promise.resolve(envelope.Success(
        id: id,
        result: json_to_dynamic(
          json.object([
            #("subscriptionId", json.string(sub_id)),
            #("success", json.bool(True)),
          ]),
        ),
      ))
    }
  }
}

fn handle_intent_handle(
  ctx: RpcContext,
  id: Id,
  action: String,
  notify: fn(String) -> Nil,
) -> Promise(Response) {
  let policy_req =
    policy.Request(
      capability: capability.IntentsHandle,
      kind: None,
      d_tag: None,
    )
  use allowed <- promise.await(acl_engine.check_permission(
    ctx.acl_engine,
    ctx.plugin_id,
    policy_req,
  ))
  case allowed {
    False ->
      promise.resolve(envelope.Error(
        id: Some(id),
        code: error_code.PermissionDenied,
        message: "Permission denied for intents:handle",
        data: None,
      ))
    True -> {
      register_guest_intent(
        ctx.guest_intents,
        plugin_id.to_string(ctx.plugin_id),
        action,
        fn(action_name, payload) {
          notify(intent_invoke_json(action_name, payload))
          Nil
        },
      )
      promise.resolve(envelope.Success(
        id: id,
        result: json_to_dynamic(
          json.object([
            #("action", json.string(protocol_intent.canonical_action(action))),
            #("registered", json.bool(True)),
          ]),
        ),
      ))
    }
  }
}

fn intent_invoke_json(
  action: String,
  payload: Option(Dict(String, Dynamic)),
) -> String {
  let payload_part = case payload {
    Some(fields) -> ",\"payload\":" <> dynamic_dict_json(fields)
    None -> ""
  }
  "{\"jsonrpc\":\"2.0\",\"method\":\"intent.invoke\",\"params\":{\"action\":"
  <> { json.string(action) |> json.to_string }
  <> payload_part
  <> "}}"
}

fn dynamic_dict_json(fields: Dict(String, Dynamic)) -> String {
  let inner =
    fields
    |> dict.to_list
    |> list.filter_map(fn(pair) {
      case platform_json.stringify(pair.1) {
        Ok(raw) -> Ok("\"" <> pair.0 <> "\":" <> raw)
        Error(_) -> Error(Nil)
      }
    })
    |> string.join(",")
  "{" <> inner <> "}"
}

fn close_subscription(ctx: RpcContext, sub_id: String) -> Nil {
  let key = subscription_key(ctx, sub_id)
  case dict.get(ref.get(ctx.subscriptions.active), key) {
    Ok(closer) -> {
      closer()
      ref.update(ctx.subscriptions.active, fn(active) {
        dict.delete(active, key)
      })
    }
    Error(_) -> Nil
  }
}

fn stream_event_json(sub_id: String, ev: event.Event) -> String {
  json.object([
    #("jsonrpc", json.string("2.0")),
    #("method", json.string("nostr.stream.event")),
    #(
      "params",
      json.object([
        #("subscriptionId", json.string(sub_id)),
        #("event", event_codec.to_json(ev)),
      ]),
    ),
  ])
  |> json.to_string
}

fn stream_eose_json(sub_id: String) -> String {
  json.object([
    #("jsonrpc", json.string("2.0")),
    #("method", json.string("nostr.stream.eose")),
    #("params", json.object([#("subscriptionId", json.string(sub_id))])),
  ])
  |> json.to_string
}

fn handle_request(
  ctx: RpcContext,
  id: Id,
  request: Request,
) -> Promise(Response) {
  case request {
    NostrGetPublicKey -> {
      let pk = keystore.get_public_key(ctx.keystore)
      promise.resolve(envelope.Success(
        id: id,
        result: dynamic.string(pubkey.to_hex(pk)),
      ))
    }

    NostrSignEvent(draft) -> {
      let d_tag =
        list.first(event.get_tag_values(draft.tags, "d"))
        |> option.from_result
      let policy_req =
        policy.Request(
          capability: capability.NostrSign,
          kind: Some(kind.to_int(draft.kind)),
          d_tag: d_tag,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied to sign event",
            data: None,
          ))
        True -> {
          case keystore.sign_event(ctx.keystore, draft) {
            Error(err) ->
              promise.resolve(envelope.Error(
                id: Some(id),
                code: error_code.SignerRejected,
                message: err,
                data: None,
              ))
            Ok(signed) -> {
              use _ <- promise.await(event_store.save_event(
                ctx.event_store,
                signed,
              ))
              promise.resolve(envelope.Success(
                id: id,
                result: json_to_dynamic(event_codec.to_json(signed)),
              ))
            }
          }
        }
      }
    }

    NostrFetch(filters, options) -> {
      let policy_req =
        policy.Request(
          capability: capability.NostrRead,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for nostr:read",
            data: None,
          ))
        True -> {
          let sub_id = plugin_id.to_string(ctx.plugin_id) <> ":fetch"
          let scoped_options = case ctx.relay_scope {
            Some([]) ->
              Some(FetchOptions(
                timeout_ms: None,
                relays: None,
                local_only: Some(True),
              ))
            Some(urls) ->
              Some(FetchOptions(
                timeout_ms: None,
                relays: Some(list.filter_map(urls, relay_url.parse)),
                local_only: None,
              ))
            None -> options
          }
          use events <- promise.await(coordinator.fetch(
            ctx.coordinator,
            sub_id,
            filters,
            scoped_options,
          ))
          promise.resolve(envelope.Success(
            id: id,
            result: json.array(events, of: event_codec.to_json)
              |> json_to_dynamic,
          ))
        }
      }
    }

    NostrPublish(ev) -> publish_signed_event(ctx, id, ev)

    NostrPublishDraft(draft) -> {
      case keystore.sign_event(ctx.keystore, draft) {
        Error(err) ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.SignerRejected,
            message: err,
            data: None,
          ))
        Ok(signed) -> publish_signed_event(ctx, id, signed)
      }
    }

    IntentHandle(_action) -> {
      promise.resolve(envelope.Error(
        id: Some(id),
        code: error_code.InvalidRequest,
        message: "intent.handle requires a streaming dispatcher",
        data: None,
      ))
    }

    NostrSubscribe(_sub_id, _filters) -> {
      promise.resolve(envelope.Error(
        id: Some(id),
        code: error_code.InvalidRequest,
        message: "nostr.subscribe requires a streaming dispatcher",
        data: None,
      ))
    }

    NostrUnsubscribe(sub_id) -> {
      close_subscription(ctx, sub_id)
      promise.resolve(envelope.Success(id: id, result: dynamic.bool(True)))
    }

    NostrGetRelays -> {
      let policy_req =
        policy.Request(
          capability: capability.RelaysManage,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for relays:manage",
            data: None,
          ))
        True -> {
          let fields =
            relay_pool.get_configured_relays(ctx.relay_pool)
            |> list.filter(fn(url) { relay_in_scope(ctx, url) })
            |> list.map(fn(url) {
              let #(read, write) = relay_pool.relay_scope(ctx.relay_pool, url)
              #(
                relay_url.to_string(url),
                json.object([
                  #("read", json.bool(read)),
                  #("write", json.bool(write)),
                ]),
              )
            })
          promise.resolve(envelope.Success(
            id: id,
            result: json_to_dynamic(json.object(fields)),
          ))
        }
      }
    }

    ProfileGet(profile_pubkey) -> {
      let query =
        filter.new()
        |> filter.with_kinds([kind.Metadata])
        |> filter.with_authors([pubkey.to_hex(profile_pubkey)])
        |> filter.with_limit(1)
      use events <- promise.await(event_store.get_events(ctx.event_store, query))
      let result = case events {
        [ev, ..] -> {
          let content = string.trim(ev.content)
          case content {
            "" -> "{}"
            _ -> content
          }
        }
        [] -> "{}"
      }
      promise.resolve(
        envelope.Success(
          id: id,
          result: case platform_json.parse_dynamic(result) {
            Ok(parsed) -> parsed
            Error(_) -> dynamic.nil()
          },
        ),
      )
    }

    ProfilePublish(metadata) -> {
      let content = case platform_json.stringify(metadata) {
        Ok(encoded) -> encoded
        Error(_) -> "{}"
      }
      let draft =
        event.UnsignedEvent(
          pubkey: Some(keystore.get_public_key(ctx.keystore)),
          created_at: clock.system().now_ms() / 1000,
          kind: kind.Metadata,
          tags: [],
          content: content,
        )
      case keystore.sign_event(ctx.keystore, draft) {
        Error(err) ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.SignerRejected,
            message: err,
            data: None,
          ))
        Ok(signed) -> publish_signed_event(ctx, id, signed)
      }
    }

    AuthGetNpub -> {
      promise.resolve(envelope.Success(
        id: id,
        result: dynamic.string(keystore.get_npub(ctx.keystore)),
      ))
    }

    AuthGetNsec -> {
      case keystore.get_nsec(ctx.keystore) {
        Ok(nsec) ->
          promise.resolve(envelope.Success(id: id, result: dynamic.string(nsec)))
        Error(err) ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: err,
            data: None,
          ))
      }
    }

    AuthGenerateKey -> {
      let private_hex = secp256k1.generate_private_key()
      case secp256k1.get_public_key(private_hex) {
        Ok(public_hex) -> {
          let result =
            json.object([
              #("privkey", json.string(private_hex)),
              #("pubkey", json.string(public_hex)),
              #("npub", case pubkey.parse(public_hex) {
                Ok(pk) -> json.string(nip19.encode_npub(pk))
                Error(_) -> json.null()
              }),
              #("nsec", case nip19.encode_nsec(private_hex) {
                Ok(nsec) -> json.string(nsec)
                Error(_) -> json.null()
              }),
            ])
          promise.resolve(envelope.Success(
            id: id,
            result: json_to_dynamic(result),
          ))
        }
        Error(_) ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.InternalError,
            message: "Failed to derive generated key",
            data: None,
          ))
      }
    }

    KernelHandleUri(uri) -> {
      case ctx.host.handle_uri {
        Some(handler) -> {
          handler(uri)
          promise.resolve(envelope.Success(
            id: id,
            result: json_to_dynamic(
              json.object([
                #("success", json.bool(True)),
                #("uri", json.string(uri)),
              ]),
            ),
          ))
        }
        None ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.MethodNotFound,
            message: "kernel.handleUri is unavailable in this host",
            data: None,
          ))
      }
    }

    NostrEncrypt(scheme, recipient_pubkey, plaintext) -> {
      let policy_req =
        policy.Request(
          capability: capability.NostrEncrypt,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for nostr:encrypt",
            data: None,
          ))
        True -> {
          let priv = keystore.get_private_key(ctx.keystore)
          let recipient_hex = pubkey.to_hex(recipient_pubkey)
          use res <- promise.await(case scheme {
            Nip04 -> nip44.nip04_encrypt(priv, recipient_hex, plaintext)
            Nip44 -> nip44.nip44_encrypt(priv, recipient_hex, plaintext)
          })
          case res {
            Ok(ciphertext) ->
              promise.resolve(envelope.Success(
                id: id,
                result: dynamic.string(ciphertext),
              ))
            Error(err) ->
              promise.resolve(envelope.Error(
                id: Some(id),
                code: error_code.InternalError,
                message: err,
                data: None,
              ))
          }
        }
      }
    }

    NostrDecrypt(scheme, sender_pubkey, ciphertext) -> {
      let policy_req =
        policy.Request(
          capability: capability.NostrEncrypt,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for nostr:encrypt",
            data: None,
          ))
        True -> {
          let priv = keystore.get_private_key(ctx.keystore)
          let sender_hex = pubkey.to_hex(sender_pubkey)
          use res <- promise.await(case scheme {
            Nip04 -> nip44.nip04_decrypt(priv, sender_hex, ciphertext)
            Nip44 -> nip44.nip44_decrypt(priv, sender_hex, ciphertext)
          })
          case res {
            Ok(plaintext) ->
              promise.resolve(envelope.Success(
                id: id,
                result: dynamic.string(plaintext),
              ))
            Error(err) ->
              promise.resolve(envelope.Error(
                id: Some(id),
                code: error_code.InternalError,
                message: err,
                data: None,
              ))
          }
        }
      }
    }

    StorageGet(key) -> {
      let policy_req =
        policy.Request(
          capability: capability.StorageKv,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for storage:kv",
            data: None,
          ))
        True -> {
          let s_key = quota.scoped_key(ctx.plugin_id, key)
          case storage.get(ctx.storage, s_key) {
            Some(val) ->
              promise.resolve(envelope.Success(
                id: id,
                result: dynamic.string(val),
              ))
            None ->
              promise.resolve(envelope.Success(id: id, result: dynamic.nil()))
          }
        }
      }
    }

    StorageSet(key, value) -> {
      let policy_req =
        policy.Request(
          capability: capability.StorageKv,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for storage:kv",
            data: None,
          ))
        True -> {
          let s_key = quota.scoped_key(ctx.plugin_id, key)
          let old_bytes = case storage.get(ctx.storage, s_key) {
            Some(old) -> string.byte_size(old)
            None -> 0
          }
          let added_bytes = string.byte_size(value) - old_bytes
          case
            quota.check_quota(ctx.quota_tracker, ctx.plugin_id, added_bytes)
          {
            False ->
              promise.resolve(envelope.Error(
                id: Some(id),
                code: error_code.QuotaExceeded,
                message: "Storage quota exceeded",
                data: None,
              ))
            True -> {
              case storage.set(ctx.storage, s_key, value) {
                Ok(Nil) ->
                  promise.resolve(envelope.Success(
                    id: id,
                    result: dynamic.bool(True),
                  ))
                Error(storage.QuotaExceeded) ->
                  promise.resolve(envelope.Error(
                    id: Some(id),
                    code: error_code.QuotaExceeded,
                    message: "Storage quota exceeded",
                    data: None,
                  ))
                Error(_) ->
                  promise.resolve(envelope.Error(
                    id: Some(id),
                    code: error_code.InternalError,
                    message: "Storage operation failed",
                    data: None,
                  ))
              }
            }
          }
        }
      }
    }

    StorageRemove(key) -> {
      let policy_req =
        policy.Request(
          capability: capability.StorageKv,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for storage:kv",
            data: None,
          ))
        True -> {
          let s_key = quota.scoped_key(ctx.plugin_id, key)
          storage.remove(ctx.storage, s_key)
          promise.resolve(envelope.Success(id: id, result: dynamic.bool(True)))
        }
      }
    }

    StorageKeys -> {
      let policy_req =
        policy.Request(
          capability: capability.StorageKv,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for storage:kv",
            data: None,
          ))
        True -> {
          let prefix = quota.plugin_prefix(ctx.plugin_id)
          let prefix_len = string.length(prefix)
          let keys =
            list.filter_map(storage.keys(ctx.storage), fn(k) {
              case string.starts_with(k, prefix) {
                True -> Ok(string.drop_start(k, prefix_len))
                False -> Error(Nil)
              }
            })
          promise.resolve(envelope.Success(
            id: id,
            result: json.array(keys, of: json.string) |> json_to_dynamic,
          ))
        }
      }
    }

    StorageClear -> {
      let policy_req =
        policy.Request(
          capability: capability.StorageKv,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for storage:kv",
            data: None,
          ))
        True -> {
          let prefix = quota.plugin_prefix(ctx.plugin_id)
          let keys =
            list.filter(storage.keys(ctx.storage), fn(k) {
              string.starts_with(k, prefix)
            })
          list.each(keys, fn(k) { storage.remove(ctx.storage, k) })
          promise.resolve(envelope.Success(id: id, result: dynamic.bool(True)))
        }
      }
    }

    RelaysList -> {
      let policy_req =
        policy.Request(
          capability: capability.RelaysManage,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for relays:manage",
            data: None,
          ))
        True -> {
          let statuses =
            relay_pool.get_statuses(ctx.relay_pool)
            |> list.filter(fn(pair) { relay_in_scope(ctx, pair.0) })
          let json_items =
            list.map(statuses, fn(pair) {
              let status_str = case pair.1 {
                relay_pool.Connected -> "connected"
                relay_pool.Connecting -> "connecting"
                relay_pool.Disconnected(_) -> "disconnected"
              }
              json.object([
                #("url", json.string(relay_url.to_string(pair.0))),
                #("status", json.string(status_str)),
              ])
            })
          promise.resolve(envelope.Success(
            id: id,
            result: json.array(json_items, of: fn(x) { x }) |> json_to_dynamic,
          ))
        }
      }
    }

    RelaysAdd(url) -> {
      let policy_req =
        policy.Request(
          capability: capability.RelaysManage,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for relays:manage",
            data: None,
          ))
        True -> {
          relay_pool.add_relay(ctx.relay_pool, url)
          let res_json =
            json.object([
              #("success", json.bool(True)),
              #("url", json.string(relay_url.to_string(url))),
            ])
          promise.resolve(envelope.Success(
            id: id,
            result: json_to_dynamic(res_json),
          ))
        }
      }
    }

    RelaysRemove(url) -> {
      let policy_req =
        policy.Request(
          capability: capability.RelaysManage,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for relays:manage",
            data: None,
          ))
        True -> {
          relay_pool.remove_relay(ctx.relay_pool, url)
          let res_json =
            json.object([
              #("success", json.bool(True)),
              #("url", json.string(relay_url.to_string(url))),
            ])
          promise.resolve(envelope.Success(
            id: id,
            result: json_to_dynamic(res_json),
          ))
        }
      }
    }

    IntentEmit(action, payload) -> {
      let policy_req =
        policy.Request(
          capability: capability.IntentsDispatch,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for intents:dispatch",
            data: None,
          ))
        True -> {
          let count =
            emit_guest_intents(
              ctx.guest_intents,
              action,
              to_payload_dict(payload),
            )
          promise.resolve(envelope.Success(
            id: id,
            result: json_to_dynamic(
              json.object([
                #("success", json.bool(True)),
                #("action", json.string(action)),
                #("handlers", json.int(count)),
              ]),
            ),
          ))
        }
      }
    }

    IntentsDispatch(action, payload) -> {
      let policy_req =
        policy.Request(
          capability: capability.IntentsDispatch,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for intents:dispatch",
            data: None,
          ))
        True -> {
          let payload_dict = to_payload_dict(payload)
          case ctx.host.dispatch_intent {
            Some(handler) -> handler(action, payload_dict)
            None -> Nil
          }
          let res_json =
            json.object([
              #("success", json.bool(True)),
              #("action", json.string(action)),
            ])
          promise.resolve(envelope.Success(
            id: id,
            result: json_to_dynamic(res_json),
          ))
        }
      }
    }

    AuthSwitchKey(raw) -> {
      let policy_req =
        policy.Request(
          capability: capability.IdentityManageKeys,
          kind: None,
          d_tag: None,
        )
      use allowed <- promise.await(acl_engine.check_permission(
        ctx.acl_engine,
        ctx.plugin_id,
        policy_req,
      ))
      case allowed {
        False ->
          promise.resolve(envelope.Error(
            id: Some(id),
            code: error_code.PermissionDenied,
            message: "Permission denied for identity:manage_keys",
            data: None,
          ))
        True -> {
          use result <- promise.await(switch_identity(ctx, raw))
          case result {
            Ok(pk) -> {
              event_store.set_user_pubkey(ctx.event_store, pk)
              let res_json =
                json.object([
                  #("success", json.bool(True)),
                  #("pubkey", json.string(pubkey.to_hex(pk))),
                  #("npub", json.string(nip19.encode_npub(pk))),
                ])
              promise.resolve(envelope.Success(
                id: id,
                result: json_to_dynamic(res_json),
              ))
            }
            Error(err) ->
              promise.resolve(envelope.Error(
                id: Some(id),
                code: error_code.InvalidParams,
                message: err,
                data: None,
              ))
          }
        }
      }
    }

    NavigationOpen(view, page) -> {
      case ctx.host.navigate {
        Some(handler) -> handler(view, page)
        None -> Nil
      }
      let fields = [#("success", json.bool(True)), #("view", json.string(view))]
      let fields = case page {
        Some(p) -> [#("page", json.string(p)), ..fields]
        None -> fields
      }
      promise.resolve(envelope.Success(
        id: id,
        result: json.object(fields) |> json_to_dynamic,
      ))
    }

    Share(title, text, url) -> {
      case ctx.host.share {
        Some(handler) -> handler(title, text, url)
        None -> Nil
      }
      let res_json =
        json.object([
          #("success", json.bool(True)),
          #("handled", json.bool(True)),
        ])
      promise.resolve(envelope.Success(
        id: id,
        result: json_to_dynamic(res_json),
      ))
    }

    UnknownMethod(name, _params) -> {
      promise.resolve(envelope.Error(
        id: Some(id),
        code: error_code.MethodNotFound,
        message: "Method not found: " <> name,
        data: None,
      ))
    }
  }
}

fn to_payload_dict(payload: Option(Dynamic)) -> Option(Dict(String, Dynamic)) {
  case payload {
    Some(value) ->
      case decode.run(value, decode.dict(decode.string, decode.dynamic)) {
        Ok(fields) -> Some(fields)
        Error(_) -> None
      }
    None -> None
  }
}

fn publish_signed_event(
  ctx: RpcContext,
  id: Id,
  ev: event.Event,
) -> Promise(Response) {
  let d_tag =
    list.first(event.get_tag_values(ev.tags, "d"))
    |> option.from_result
  let policy_req =
    policy.Request(
      capability: capability.NostrWrite,
      kind: Some(kind.to_int(ev.kind)),
      d_tag: d_tag,
    )
  use allowed <- promise.await(acl_engine.check_permission(
    ctx.acl_engine,
    ctx.plugin_id,
    policy_req,
  ))
  case allowed {
    False ->
      promise.resolve(envelope.Error(
        id: Some(id),
        code: error_code.PermissionDenied,
        message: "Permission denied to publish event",
        data: None,
      ))
    True -> {
      use _ <- promise.await(event_store.save_event(ctx.event_store, ev))
      use publish_res <- promise.await(case ctx.relay_scope {
        Some([]) -> promise.resolve([])
        Some(urls) ->
          relay_pool.publish_targeted(
            ctx.relay_pool,
            ev,
            list.filter_map(urls, relay_url.parse),
          )
        None -> relay_pool.publish(ctx.relay_pool, ev)
      })
      let accepted =
        list.filter_map(publish_res, fn(r) {
          case r.1 {
            True -> Ok(relay_url.to_string(r.0))
            False -> Error(Nil)
          }
        })
      let result_json =
        json.object([
          #("id", json.string(event_id.to_hex(ev.id))),
          #("pubkey", json.string(pubkey.to_hex(ev.pubkey))),
          #("sig", json.string(ev.sig)),
          #("relays", json.array(accepted, of: json.string)),
          #("success", json.bool(True)),
        ])
      promise.resolve(envelope.Success(
        id: id,
        result: json_to_dynamic(result_json),
      ))
    }
  }
}

fn switch_identity(
  ctx: RpcContext,
  raw: String,
) -> Promise(Result(Pubkey, String)) {
  case nip19.decode_nsec(raw) {
    Ok(private_hex) ->
      promise.resolve(case keystore.switch_key(ctx.keystore, private_hex) {
        Ok(pk) -> Ok(pk)
        Error(err) -> Error(err)
      })
    Error(_) -> {
      use result <- promise.await(keystore.switch_account(ctx.keystore, raw))
      case result {
        Ok(pk) -> promise.resolve(Ok(pk))
        Error(account_err) ->
          promise.resolve(case keystore.switch_key(ctx.keystore, raw) {
            Ok(pk) -> Ok(pk)
            Error(_) -> Error(account_err)
          })
      }
    }
  }
}
