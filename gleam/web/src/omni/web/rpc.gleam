//// Host-side JSON-RPC binder for guest plugins (Channel 2).
////
//// Resolves a plugin-scoped `RpcContext` and answers raw JSON-RPC frames with
//// the kernel dispatcher. Capability grants for bundled first-party apps are
//// installed by `boot`; third-party apps still go through prompts.

import gleam/javascript/promise.{type Promise}
import gleam/json
import gleam/option.{None}
import omni/kernel/crypto/keystore
import omni/kernel/kernel
import omni/kernel/rpc/dispatcher
import omni/nostr/event_codec
import omni/nostr/pubkey
import omni/protocol/plugin_id
import omni/protocol/rpc/codec
import omni/protocol/rpc/envelope
import omni/protocol/rpc/error_code
import omni/web/boot.{type Booted}

/// Answer a raw JSON-RPC request from `plugin_id_str`, returning the encoded
/// JSON-RPC response frame.
pub fn handle(
  booted: Booted,
  plugin_id_str: String,
  request_json: String,
) -> Promise(String) {
  handle_streaming(
    booted,
    plugin_id_str,
    request_json,
    dispatcher.default_host_hooks(),
    fn(_notification) { Nil },
  )
}

/// Answer a raw JSON-RPC request with host callbacks wired (intents,
/// navigation, share, protocol URIs).
pub fn handle_with_hooks(
  booted: Booted,
  plugin_id_str: String,
  request_json: String,
  host: dispatcher.HostHooks,
) -> Promise(String) {
  handle_streaming(booted, plugin_id_str, request_json, host, fn(_notification) {
    Nil
  })
}

/// Answer a raw JSON-RPC request, routing live subscription notifications to
/// `notify` (each argument is a ready-to-send JSON-RPC notification string).
pub fn handle_streaming(
  booted: Booted,
  plugin_id_str: String,
  request_json: String,
  host: dispatcher.HostHooks,
  notify: fn(String) -> Nil,
) -> Promise(String) {
  case plugin_id.parse(plugin_id_str) {
    Error(Nil) ->
      promise.resolve(
        codec.encode_response(envelope.Error(
          id: None,
          code: error_code.InvalidRequest,
          message: "Invalid plugin ID: " <> plugin_id_str,
          data: None,
        )),
      )
    Ok(pid) -> {
      let ctx = kernel.get_rpc_context_with(booted.kernel, pid, host)
      dispatcher.dispatch_json_streaming(ctx, request_json, notify)
      |> promise.map(codec.encode_response)
    }
  }
}

/// Current user public key as lowercase hex.
pub fn public_key_hex(booted: Booted) -> String {
  pubkey.to_hex(keystore.get_public_key(booted.kernel.keystore))
}

/// Current user `npub1...`.
pub fn npub(booted: Booted) -> String {
  keystore.get_npub(booted.kernel.keystore)
}

/// Sign an unsigned-event JSON draft and return the signed event JSON.
pub fn sign_draft_json(
  booted: Booted,
  draft_json: String,
) -> Result(String, String) {
  case json.parse(from: draft_json, using: event_codec.unsigned_decoder()) {
    Error(_) -> Error("Invalid event draft")
    Ok(draft) ->
      case keystore.sign_event(booted.kernel.keystore, draft) {
        Ok(event) -> Ok(event_codec.encode(event))
        Error(err) -> Error(err)
      }
  }
}
