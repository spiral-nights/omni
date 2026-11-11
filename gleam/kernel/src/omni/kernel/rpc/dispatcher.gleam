//// Central JSON-RPC 2.0 dispatcher for sandboxed guest plugins.
////
//// Receives RPC requests emitted by guest plugins over Channel 2, validates
//// capability grants via `AclEngine`, enforces token bucket rate limiting and
//// storage quotas, and routes requests to the appropriate kernel subsystem.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/json
import gleam/list
import gleam/option.{None, Some}
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
import omni/nostr/kind
import omni/nostr/nip19
import omni/nostr/pubkey
import omni/nostr/relay_url
import omni/platform/clock
import omni/platform/json as platform_json
import omni/platform/nip44
import omni/platform/storage.{type Storage}
import omni/protocol/capability
import omni/protocol/plugin_id.{type PluginId}
import omni/protocol/rpc/codec
import omni/protocol/rpc/envelope.{type Id, type Response}
import omni/protocol/rpc/error_code
import omni/protocol/rpc/method.{
  type Request, AuthSwitchKey, IntentsDispatch, NavigationOpen, NostrDecrypt,
  NostrEncrypt, NostrFetch, NostrGetPublicKey, NostrPublish, NostrSignEvent,
  RelaysAdd, RelaysList, RelaysRemove, Share, StorageClear, StorageGet,
  StorageKeys, StorageRemove, StorageSet, UnknownMethod,
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
  )
}

fn json_to_dynamic(j: json.Json) -> Dynamic {
  case json.to_string(j) |> platform_json.parse_dynamic {
    Ok(d) -> d
    Error(_) -> dynamic.nil()
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
    False ->
      promise.resolve(envelope.Error(
        id: Some(id),
        code: error_code.RateLimitExceeded,
        message: "Rate limit exceeded",
        data: None,
      ))
    True -> handle_request(ctx, id, request)
  }
}

/// Decodes and dispatches a raw JSON string JSON-RPC 2.0 request frame.
pub fn dispatch_json(ctx: RpcContext, raw_json: String) -> Promise(Response) {
  case codec.decode_request(raw_json) {
    Ok(#(id, req)) -> dispatch(ctx, id, req)
    Error(err) ->
      promise.resolve(envelope.Error(
        id: err.id,
        code: err.code,
        message: err.message,
        data: None,
      ))
  }
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
          use events <- promise.await(coordinator.fetch(
            ctx.coordinator,
            sub_id,
            filters,
            options,
          ))
          promise.resolve(envelope.Success(
            id: id,
            result: json.array(events, of: event_codec.to_json)
              |> json_to_dynamic,
          ))
        }
      }
    }

    NostrPublish(ev) -> {
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
          use publish_res <- promise.await(relay_pool.publish(
            ctx.relay_pool,
            ev,
          ))
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

    NostrEncrypt(recipient_pubkey, plaintext) -> {
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
          use res <- promise.await(nip44.nip04_encrypt(
            priv,
            recipient_hex,
            plaintext,
          ))
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

    NostrDecrypt(sender_pubkey, ciphertext) -> {
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
          use res <- promise.await(nip44.nip04_decrypt(
            priv,
            sender_hex,
            ciphertext,
          ))
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
          let statuses = relay_pool.get_statuses(ctx.relay_pool)
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

    IntentsDispatch(action, _payload) -> {
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

    AuthSwitchKey(pk) -> {
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
      }
    }

    NavigationOpen(view, page) -> {
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

    Share(_title, _text, _url) -> {
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
