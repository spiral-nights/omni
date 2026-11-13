//// JSON-RPC 2.0 request decoding and message serialization.
////
//// Decodes incoming Channel 2 JSON-RPC request frames into typed `#(Id, Request)`
//// pairs with structured error reporting, and encodes responses and notifications.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import omni/nostr/event_codec
import omni/nostr/filter_codec
import omni/nostr/pubkey
import omni/nostr/relay_url
import omni/platform/json as platform_json
import omni/protocol/rpc/envelope.{
  type Id, type Notification, type Response, IntId, StringId,
}
import omni/protocol/rpc/error_code.{type ErrorCode}
import omni/protocol/rpc/method.{
  type Request, AuthGenerateKey, AuthGetNpub, AuthGetNsec, AuthSwitchKey,
  IntentsDispatch, KernelHandleUri, NavigationOpen, Nip04, Nip44, NostrDecrypt,
  NostrEncrypt, NostrFetch, NostrGetPublicKey, NostrGetRelays, NostrPublish,
  NostrPublishDraft, NostrSignEvent, NostrSubscribe, NostrUnsubscribe,
  ProfileGet, ProfilePublish, RelaysAdd, RelaysList, RelaysRemove, Share,
  StorageClear, StorageGet, StorageKeys, StorageRemove, StorageSet,
  UnknownMethod,
}

/// Structured error when decoding an incoming JSON-RPC request.
pub type DecodeRpcError {
  DecodeRpcError(id: Option(Id), code: ErrorCode, message: String)
}

fn id_to_json_string(id: Id) -> String {
  case id {
    IntId(i) -> int.to_string(i)
    StringId(s) -> json.string(s) |> json.to_string
  }
}

fn serialize_dynamic(dyn: Dynamic) -> String {
  case platform_json.stringify(dyn) {
    Ok(s) -> s
    _ -> "null"
  }
}

/// Serialize a `Request` with its `Id` to a JSON-RPC 2.0 JSON string.
pub fn encode_request(id: Id, request: Request) -> String {
  let id_str = id_to_json_string(id)
  let method_str = json.string(method.method_name(request)) |> json.to_string

  let params_json_opt: Option(String) = case request {
    NostrGetPublicKey
    | StorageKeys
    | StorageClear
    | RelaysList
    | NostrGetRelays
    | AuthGetNpub
    | AuthGetNsec
    | AuthGenerateKey -> None
    NostrSignEvent(draft) ->
      Some(
        json.object([#("event", event_codec.unsigned_to_json(draft))])
        |> json.to_string,
      )
    NostrFetch(filters, options) -> {
      let filter_json =
        json.array(filters, of: fn(f) { filter_codec.to_json(f) })
      let base_fields = [#("filters", filter_json)]
      let fields = case options {
        Some(opts) ->
          list.append(base_fields, method.fetch_options_fields(opts))
        None -> base_fields
      }
      Some(json.object(fields) |> json.to_string)
    }
    NostrPublish(ev) ->
      Some(
        json.object([#("event", event_codec.to_json(ev))])
        |> json.to_string,
      )
    NostrPublishDraft(draft) ->
      Some(
        json.object([#("draft", event_codec.unsigned_to_json(draft))])
        |> json.to_string,
      )
    NostrSubscribe(sub_id, filters) ->
      Some(
        json.object([
          #("subscriptionId", json.string(sub_id)),
          #("filters", json.array(filters, of: filter_codec.to_json)),
        ])
        |> json.to_string,
      )
    NostrUnsubscribe(sub_id) ->
      Some(
        json.object([#("subscriptionId", json.string(sub_id))])
        |> json.to_string,
      )
    ProfileGet(profile_pubkey) ->
      Some(
        json.object([#("pubkey", json.string(pubkey.to_hex(profile_pubkey)))])
        |> json.to_string,
      )
    ProfilePublish(metadata) -> Some(serialize_dynamic(metadata))
    KernelHandleUri(uri) ->
      Some(json.object([#("uri", json.string(uri))]) |> json.to_string)
    NostrEncrypt(scheme, pk, plaintext) -> {
      let _ = scheme
      Some(
        json.object([
          #("pubkey", json.string(pubkey.to_hex(pk))),
          #("plaintext", json.string(plaintext)),
        ])
        |> json.to_string,
      )
    }
    NostrDecrypt(scheme, pk, ciphertext) -> {
      let _ = scheme
      Some(
        json.object([
          #("pubkey", json.string(pubkey.to_hex(pk))),
          #("ciphertext", json.string(ciphertext)),
        ])
        |> json.to_string,
      )
    }
    StorageGet(key) ->
      Some(json.object([#("key", json.string(key))]) |> json.to_string)
    StorageSet(key, value) ->
      Some(
        json.object([#("key", json.string(key)), #("value", json.string(value))])
        |> json.to_string,
      )
    StorageRemove(key) ->
      Some(json.object([#("key", json.string(key))]) |> json.to_string)
    RelaysAdd(url) ->
      Some(
        json.object([#("url", json.string(relay_url.to_string(url)))])
        |> json.to_string,
      )
    RelaysRemove(url) ->
      Some(
        json.object([#("url", json.string(relay_url.to_string(url)))])
        |> json.to_string,
      )
    IntentsDispatch(action, payload) -> {
      let payload_part = case payload {
        Some(p) -> ",\"payload\":" <> serialize_dynamic(p)
        None -> ""
      }
      Some(
        "{\"action\":"
        <> { json.string(action) |> json.to_string }
        <> payload_part
        <> "}",
      )
    }
    NavigationOpen(view, page) -> {
      let page_part = case page {
        Some(p) -> ",\"page\":" <> { json.string(p) |> json.to_string }
        None -> ""
      }
      Some(
        "{\"view\":"
        <> { json.string(view) |> json.to_string }
        <> page_part
        <> "}",
      )
    }
    Share(title, text, url) -> {
      let fields = []
      let fields = case title {
        Some(t) -> [#("title", json.string(t)), ..fields]
        None -> fields
      }
      let fields = case text {
        Some(tx) -> [#("text", json.string(tx)), ..fields]
        None -> fields
      }
      let fields = case url {
        Some(u) -> [#("url", json.string(u)), ..fields]
        None -> fields
      }
      Some(json.object(fields) |> json.to_string)
    }
    AuthSwitchKey(key) ->
      Some(json.object([#("key", json.string(key))]) |> json.to_string)
    UnknownMethod(_, params) ->
      case params {
        Some(p) -> Some(serialize_dynamic(p))
        None -> None
      }
  }

  let params_field = case params_json_opt {
    Some(p_str) -> ",\"params\":" <> p_str
    None -> ""
  }

  "{\"jsonrpc\":\"2.0\",\"id\":"
  <> id_str
  <> ",\"method\":"
  <> method_str
  <> params_field
  <> "}"
}

/// Encode a `Response` to a JSON-RPC 2.0 JSON string.
pub fn encode_response(response: Response) -> String {
  envelope.encode_response(response)
}

/// Encode a `Notification` to a JSON-RPC 2.0 JSON string.
pub fn encode_notification(notification: Notification) -> String {
  envelope.encode_notification(notification)
}

fn request_envelope_decoder() -> decode.Decoder(#(Id, String, Option(Dynamic))) {
  use jsonrpc <- decode.field("jsonrpc", decode.string)
  use id <- decode.field("id", envelope.id_decoder())
  use method_name <- decode.field("method", decode.string)
  use params <- decode.optional_field(
    "params",
    None,
    decode.optional(decode.dynamic),
  )
  case jsonrpc == "2.0" {
    True -> decode.success(#(id, method_name, params))
    False ->
      decode.failure(#(envelope.IntId(0), "", None), "jsonrpc must equal '2.0'")
  }
}

/// Decode a JSON-RPC 2.0 request string into a typed `#(Id, Request)`.
///
/// Returns `Error(DecodeRpcError)` on parse failures, missing required fields,
/// or invalid method parameters.
pub fn decode_request(
  json_string: String,
) -> Result(#(Id, Request), DecodeRpcError) {
  case platform_json.parse_dynamic(json_string) {
    Error(_) ->
      Error(DecodeRpcError(
        id: None,
        code: error_code.ParseError,
        message: "Parse error",
      ))
    Ok(raw_dyn) -> {
      case decode.run(raw_dyn, decode.at(["jsonrpc"], decode.string)) {
        Ok("2.0") -> {
          let extracted_id = case
            decode.run(raw_dyn, {
              use id <- decode.field("id", envelope.id_decoder())
              decode.success(id)
            })
          {
            Ok(i) -> Some(i)
            Error(_) -> None
          }

          case decode.run(raw_dyn, request_envelope_decoder()) {
            Error(_) ->
              Error(DecodeRpcError(
                id: extracted_id,
                code: error_code.InvalidRequest,
                message: "Invalid Request: missing or invalid 'jsonrpc', 'id', or 'method'",
              ))
            Ok(#(id, method_name, params)) -> {
              case decode_method_params(method_name, params) {
                Ok(req) -> Ok(#(id, req))
                Error(msg) ->
                  Error(DecodeRpcError(
                    id: Some(id),
                    code: error_code.InvalidParams,
                    message: msg,
                  ))
              }
            }
          }
        }
        _ ->
          Error(DecodeRpcError(
            id: None,
            code: error_code.InvalidRequest,
            message: "Invalid Request: missing or invalid 'jsonrpc' version",
          ))
      }
    }
  }
}

fn decode_method_params(
  method_name: String,
  params: Option(Dynamic),
) -> Result(Request, String) {
  case method_name {
    "nostr.getPublicKey" -> Ok(NostrGetPublicKey)

    "nostr.signEvent" -> {
      use dyn <- require_params(params, "nostr.signEvent requires draft event")
      let dec_in_obj = {
        use ev <- decode.field("event", event_codec.unsigned_decoder())
        decode.success(ev)
      }
      case decode.run(dyn, dec_in_obj) {
        Ok(draft) -> Ok(NostrSignEvent(draft))
        Error(_) ->
          case decode.run(dyn, event_codec.unsigned_decoder()) {
            Ok(draft) -> Ok(NostrSignEvent(draft))
            Error(_) -> Error("Invalid draft event for nostr.signEvent")
          }
      }
    }

    "nostr.fetch" -> {
      use dyn <- require_params(params, "nostr.fetch requires filters")
      let dec_filters = {
        use fs <- decode.field("filters", decode.list(filter_codec.decoder()))
        decode.success(fs)
      }
      let dec_filter = {
        use f <- decode.field("filter", filter_codec.decoder())
        decode.success([f])
      }
      let #(filters, options) = case decode.run(dyn, dec_filters) {
        Ok(fs) -> {
          let opts = case decode.run(dyn, method.fetch_options_decoder()) {
            Ok(o) -> Some(o)
            Error(_) -> None
          }
          #(fs, opts)
        }
        Error(_) ->
          case decode.run(dyn, dec_filter) {
            Ok(fs) -> {
              let opts = case decode.run(dyn, method.fetch_options_decoder()) {
                Ok(o) -> Some(o)
                Error(_) -> None
              }
              #(fs, opts)
            }
            Error(_) ->
              case decode.run(dyn, decode.list(filter_codec.decoder())) {
                Ok(fs) -> #(fs, None)
                Error(_) -> #([], None)
              }
          }
      }

      case filters {
        [] -> Error("Missing or empty filters for nostr.fetch")
        fs -> Ok(NostrFetch(fs, options))
      }
    }

    "nostr.publish" -> {
      use dyn <- require_params(params, "nostr.publish requires event")
      let dec_in_obj = {
        use ev <- decode.field("event", event_codec.decoder())
        decode.success(ev)
      }
      let dec_draft_in_obj = {
        use ev <- decode.field("draft", event_codec.unsigned_decoder())
        decode.success(ev)
      }
      case decode.run(dyn, dec_in_obj) {
        Ok(ev) -> Ok(NostrPublish(ev))
        Error(_) ->
          case decode.run(dyn, event_codec.decoder()) {
            Ok(ev) -> Ok(NostrPublish(ev))
            Error(_) ->
              case decode.run(dyn, dec_draft_in_obj) {
                Ok(draft) -> Ok(NostrPublishDraft(draft))
                Error(_) ->
                  case decode.run(dyn, event_codec.unsigned_decoder()) {
                    Ok(draft) -> Ok(NostrPublishDraft(draft))
                    Error(_) -> Error("Invalid event for nostr.publish")
                  }
              }
          }
      }
    }

    "nostr.subscribe" -> {
      use dyn <- require_params(params, "Missing nostr.subscribe parameters")
      let dec = {
        use sub_id <- decode.field("subscriptionId", decode.string)
        use fs <- decode.field("filters", decode.list(filter_codec.decoder()))
        decode.success(#(sub_id, fs))
      }
      case decode.run(dyn, dec) {
        Ok(#(sub_id, fs)) ->
          case sub_id != "" && !list.is_empty(fs) {
            True -> Ok(NostrSubscribe(sub_id, fs))
            False ->
              Error("Missing subscriptionId or filters for nostr.subscribe")
          }
        _ -> Error("Missing subscriptionId or filters for nostr.subscribe")
      }
    }

    "nostr.unsubscribe" -> {
      use dyn <- require_params(params, "Missing nostr.unsubscribe parameters")
      let dec = {
        use sub_id <- decode.field("subscriptionId", decode.string)
        decode.success(sub_id)
      }
      case decode.run(dyn, dec) {
        Ok(sub_id) ->
          case sub_id != "" {
            True -> Ok(NostrUnsubscribe(sub_id))
            False -> Error("Missing subscriptionId for nostr.unsubscribe")
          }
        _ -> Error("Missing subscriptionId for nostr.unsubscribe")
      }
    }

    "nostr.getRelays" -> Ok(NostrGetRelays)

    "profile.get" -> {
      use dyn <- require_params(params, "Missing profile.get parameters")
      let dec = {
        use pk <- decode.field("pubkey", method.pubkey_tolerant_decoder())
        decode.success(ProfileGet(pk))
      }
      decode.run(dyn, dec)
      |> result_to_param_error("Missing or invalid pubkey for profile.get")
    }

    "profile.publish" -> {
      use dyn <- require_params(params, "Missing profile.publish parameters")
      let dec = {
        use meta <- decode.field("metadata", decode.dynamic)
        decode.success(meta)
      }
      case decode.run(dyn, dec) {
        Ok(meta) -> Ok(ProfilePublish(meta))
        Error(_) -> Ok(ProfilePublish(dyn))
      }
    }

    "nostr.nip04.encrypt" | "nostr.nip04Encrypt" -> {
      use dyn <- require_params(params, "Missing encryption parameters")
      decode_encrypt(dyn, Nip04)
    }

    "nostr.nip44.encrypt" | "nostr.nip44Encrypt" -> {
      use dyn <- require_params(params, "Missing encryption parameters")
      decode_encrypt(dyn, Nip44)
    }

    "nostr.encrypt" -> {
      use dyn <- require_params(params, "Missing encryption parameters")
      decode_encrypt(dyn, Nip04)
    }

    "nostr.nip04.decrypt" | "nostr.nip04Decrypt" -> {
      use dyn <- require_params(params, "Missing decryption parameters")
      decode_decrypt(dyn, Nip04)
    }

    "nostr.nip44.decrypt" | "nostr.nip44Decrypt" -> {
      use dyn <- require_params(params, "Missing decryption parameters")
      decode_decrypt(dyn, Nip44)
    }

    "nostr.decrypt" -> {
      use dyn <- require_params(params, "Missing decryption parameters")
      decode_decrypt(dyn, Nip04)
    }

    "storage.get" -> {
      use dyn <- require_params(params, "Missing storage.get parameters")
      let dec = {
        use k <- decode.field("key", decode.string)
        decode.success(StorageGet(k))
      }
      decode.run(dyn, dec)
      |> result_to_param_error("Missing key parameter for storage.get")
    }

    "storage.set" -> {
      use dyn <- require_params(params, "Missing storage.set parameters")
      let dec = {
        use k <- decode.field("key", decode.string)
        use v <- decode.field("value", decode.string)
        decode.success(StorageSet(k, v))
      }
      decode.run(dyn, dec)
      |> result_to_param_error("Missing key or value for storage.set")
    }

    "storage.delete" | "storage.remove" -> {
      use dyn <- require_params(params, "Missing storage.delete parameters")
      let dec = {
        use k <- decode.field("key", decode.string)
        decode.success(StorageRemove(k))
      }
      decode.run(dyn, dec)
      |> result_to_param_error("Missing key parameter for storage.delete")
    }

    "storage.keys" -> Ok(StorageKeys)
    "storage.clear" -> Ok(StorageClear)
    "relays.list" -> Ok(RelaysList)

    "relays.add" -> {
      use dyn <- require_params(params, "Missing relays.add parameters")
      let dec = {
        use u <- decode.field("url", method.relay_url_decoder())
        decode.success(RelaysAdd(u))
      }
      decode.run(dyn, dec)
      |> result_to_param_error("Missing or invalid url for relays.add")
    }

    "relays.remove" -> {
      use dyn <- require_params(params, "Missing relays.remove parameters")
      let dec = {
        use u <- decode.field("url", method.relay_url_decoder())
        decode.success(RelaysRemove(u))
      }
      decode.run(dyn, dec)
      |> result_to_param_error("Missing or invalid url for relays.remove")
    }

    "intent.dispatch" | "intents.dispatch" -> {
      use dyn <- require_params(params, "Missing intent.dispatch parameters")
      let dec = {
        use action <- decode.field("action", decode.string)
        use payload <- decode.optional_field(
          "payload",
          None,
          decode.optional(decode.dynamic),
        )
        use data <- decode.optional_field(
          "data",
          None,
          decode.optional(decode.dynamic),
        )
        let effective_payload = case payload {
          Some(_) -> payload
          None -> data
        }
        decode.success(IntentsDispatch(action, effective_payload))
      }
      decode.run(dyn, dec)
      |> result_to_param_error("Missing action parameter for intent.dispatch")
    }

    "navigation.open" | "navigation.navigate" | "ui.openView" -> {
      use dyn <- require_params(params, "Missing navigation.open parameters")
      let dec = {
        use view <- decode.field("view", decode.string)
        use page <- decode.optional_field(
          "page",
          None,
          decode.optional(decode.string),
        )
        decode.success(NavigationOpen(view, page))
      }
      decode.run(dyn, dec)
      |> result_to_param_error("Missing view parameter for navigation.open")
    }

    "kernel.handleShare" | "share" | "kernel.share" -> {
      case params {
        Some(dyn) -> {
          let dec = {
            use title <- decode.optional_field(
              "title",
              None,
              decode.optional(decode.string),
            )
            use text <- decode.optional_field(
              "text",
              None,
              decode.optional(decode.string),
            )
            use url <- decode.optional_field(
              "url",
              None,
              decode.optional(decode.string),
            )
            decode.success(Share(title, text, url))
          }
          case decode.run(dyn, dec) {
            Ok(s) -> Ok(s)
            Error(_) -> Ok(Share(None, None, None))
          }
        }
        None -> Ok(Share(None, None, None))
      }
    }

    "auth.switchKey" -> {
      use dyn <- require_params(params, "Missing auth.switchKey parameters")
      let dec = {
        use raw <- decode.field("key", decode.string)
        decode.success(AuthSwitchKey(raw))
      }
      let dec_pubkey = {
        use raw <- decode.field("pubkey", decode.string)
        decode.success(AuthSwitchKey(raw))
      }
      case decode.run(dyn, dec) {
        Ok(req) -> Ok(req)
        Error(_) ->
          case decode.run(dyn, dec_pubkey) {
            Ok(req) -> Ok(req)
            Error(_) -> Error("Missing key/pubkey for auth.switchKey")
          }
      }
    }

    "auth.getNpub" -> Ok(AuthGetNpub)
    "auth.getNsec" -> Ok(AuthGetNsec)
    "auth.generateKey" -> Ok(AuthGenerateKey)

    "kernel.handleUri" -> {
      use dyn <- require_params(params, "Missing kernel.handleUri parameters")
      let dec = {
        use uri <- decode.field("uri", decode.string)
        decode.success(KernelHandleUri(uri))
      }
      decode.run(dyn, dec)
      |> result_to_param_error("Missing uri for kernel.handleUri")
    }

    other -> Ok(UnknownMethod(other, params))
  }
}

fn decode_encrypt(
  dyn: Dynamic,
  scheme: method.EncryptionScheme,
) -> Result(Request, String) {
  let dec = {
    use pk <- decode.field("pubkey", method.pubkey_tolerant_decoder())
    use pt <- decode.field("plaintext", decode.string)
    decode.success(NostrEncrypt(scheme, pk, pt))
  }
  decode.run(dyn, dec)
  |> result_to_param_error("Missing pubkey or plaintext for encrypt")
}

fn decode_decrypt(
  dyn: Dynamic,
  scheme: method.EncryptionScheme,
) -> Result(Request, String) {
  let dec = {
    use pk <- decode.field("pubkey", method.pubkey_tolerant_decoder())
    use ct <- decode.field("ciphertext", decode.string)
    decode.success(NostrDecrypt(scheme, pk, ct))
  }
  decode.run(dyn, dec)
  |> result_to_param_error("Missing pubkey or ciphertext for decrypt")
}

fn require_params(
  params: Option(Dynamic),
  err_msg: String,
  next: fn(Dynamic) -> Result(Request, String),
) -> Result(Request, String) {
  case params {
    Some(dyn) -> next(dyn)
    None -> Error(err_msg)
  }
}

fn result_to_param_error(
  res: Result(Request, List(decode.DecodeError)),
  msg: String,
) -> Result(Request, String) {
  case res {
    Ok(v) -> Ok(v)
    Error(_) -> Error(msg)
  }
}
