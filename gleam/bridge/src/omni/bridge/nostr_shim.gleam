//// Standard NIP-07 and extended `window.nostr` shim for guest sandboxes.
////
//// The guest keeps calling the standard API; every call is forwarded to the
//// host kernel over the JSON-RPC channel. Streaming subscriptions register a
//// callback that the host notification router invokes.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

/// RPC method names used by the shim.
pub const rpc_get_public_key = "nostr.getPublicKey"

pub const rpc_sign_event = "nostr.signEvent"

pub const rpc_get_relays = "nostr.getRelays"

pub const rpc_fetch = "nostr.fetch"

pub const rpc_subscribe = "nostr.subscribe"

pub const rpc_unsubscribe = "nostr.unsubscribe"

pub const rpc_publish = "nostr.publish"

/// Host notification methods for streaming subscriptions.
pub const notify_stream_event = "nostr.stream.event"

pub const notify_stream_eose = "nostr.stream.eose"

/// Generate a subscription ID from a caller-provided seed.
pub fn subscription_id(seed: String) -> String {
  "sub_" <> int.to_string(hash(seed))
}

fn hash(value: String) -> Int {
  value
  |> string.to_utf_codepoints
  |> list.fold(0, fn(acc, codepoint) {
    let code = string.utf_codepoint_to_int(codepoint)
    int.bitwise_and(int.bitwise_shift_left(acc, 5) - acc + code, 0x7fffffff)
  })
  |> int.absolute_value
}

/// Shape an unsigned publish draft into the signed-event envelope the kernel
/// expects, defaulting `pubkey` and `created_at` and preserving `id`/`sig`.
pub fn publish_event_json(
  draft: Dynamic,
  my_pubkey: String,
  now_sec: Int,
) -> Result(String, String) {
  case decode.run(draft, draft_decoder()) {
    Ok(draft_fields) -> Ok(build_event_json(draft_fields, my_pubkey, now_sec))
    Error(_) -> Error("Invalid draft event to publish")
  }
}

type DraftFields {
  DraftFields(
    kind: Int,
    content: String,
    tags: List(List(String)),
    created_at: Option(Int),
    pubkey: Option(String),
    id: Option(String),
    sig: Option(String),
  )
}

fn draft_decoder() -> decode.Decoder(DraftFields) {
  use kind <- decode.field("kind", decode.int)
  use content <- decode.optional_field("content", "", decode.string)
  use tags <- decode.optional_field(
    "tags",
    [],
    decode.list(decode.list(of: decode.string)),
  )
  use created_at <- decode.optional_field(
    "created_at",
    None,
    decode.optional(decode.int),
  )
  use pubkey <- decode.optional_field(
    "pubkey",
    None,
    decode.optional(decode.string),
  )
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use sig <- decode.optional_field("sig", None, decode.optional(decode.string))
  decode.success(DraftFields(
    kind: kind,
    content: content,
    tags: tags,
    created_at: created_at,
    pubkey: pubkey,
    id: id,
    sig: sig,
  ))
}

fn build_event_json(
  draft: DraftFields,
  my_pubkey: String,
  now_sec: Int,
) -> String {
  let fields = [
    #("kind", json.int(draft.kind)),
    #("content", json.string(draft.content)),
    #(
      "tags",
      json.array(draft.tags, of: fn(tag) { json.array(tag, of: json.string) }),
    ),
    #(
      "created_at",
      json.int(case draft.created_at {
        Some(value) -> value
        None -> now_sec
      }),
    ),
    #(
      "pubkey",
      json.string(case draft.pubkey {
        Some(value) if value != "" -> value
        _ -> my_pubkey
      }),
    ),
  ]

  let optional =
    [optional_json_field("id", draft.id), optional_json_field("sig", draft.sig)]
    |> list.filter_map(fn(item) {
      case item {
        Some(field) -> Ok(field)
        None -> Error(Nil)
      }
    })

  json.object(list.append(fields, optional)) |> json.to_string
}

fn optional_json_field(
  key: String,
  value: Option(String),
) -> Option(#(String, json.Json)) {
  case value {
    Some(raw) -> Some(#(key, json.string(raw)))
    None -> None
  }
}

/// Install the `window.nostr` shim, forwarding RPC calls through `call_rpc`.
@external(javascript, "./nostr_shim.ffi.mjs", "install")
pub fn install(call_rpc: fn(String, String) -> Dynamic) -> Nil

/// Route a host `nostr.stream.event` / `nostr.stream.eose` notification to the
/// callbacks registered by `window.nostr.subscribe`.
@external(javascript, "./nostr_shim.ffi.mjs", "route_notification")
pub fn route_notification(raw_notification: String) -> Nil
