//// JS-facing facade over `omni/nostr/bech32` and `omni/nostr/nip19`.
////
//// Allows existing TypeScript code to delegate bech32/NIP-19 encoding and
//// decoding directly to the Gleam implementation.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/option.{None, Some}
import gleam/result
import omni/nostr/bech32
import omni/nostr/event_id
import omni/nostr/kind
import omni/nostr/nip19
import omni/nostr/pubkey

@external(javascript, "./bech32.ffi.mjs", "js_object")
fn js_object(entries: List(#(String, Dynamic))) -> Dynamic

@external(javascript, "./bech32.ffi.mjs", "js_null")
fn js_null() -> Dynamic

/// Encode raw hex to bech32 string with the given HRP.
pub fn to_bech32(hrp: String, hex: String) -> String {
  case bech32.to_bech32(hrp, hex) {
    Ok(s) -> s
    Error(_) -> panic as "Failed to convert bits for bech32 encoding"
  }
}

/// Decode bech32 string to `{ hrp: string, hex: string }` plain JS object.
pub fn from_bech32(str: String) -> Dynamic {
  case bech32.from_bech32(str) {
    Ok(#(hrp, hex)) ->
      js_object([
        #("hrp", dynamic.string(hrp)),
        #("hex", dynamic.string(hex)),
      ])
    Error(_) -> panic as "Invalid bech32 string"
  }
}

/// Convert hex to npub1...
pub fn hex_to_npub(hex: String) -> String {
  to_bech32("npub", hex)
}

/// Convert npub1... to hex.
pub fn npub_to_hex(npub_str: String) -> String {
  case bech32.from_bech32(npub_str) {
    Ok(#(_, hex)) -> hex
    Error(_) -> panic as "Invalid npub string"
  }
}

/// Convert hex to nsec1...
pub fn hex_to_nsec(hex: String) -> String {
  to_bech32("nsec", hex)
}

/// Convert nsec1... to hex.
pub fn nsec_to_hex(nsec_str: String) -> String {
  case bech32.from_bech32(nsec_str) {
    Ok(#(_, hex)) -> hex
    Error(_) -> panic as "Invalid nsec string"
  }
}

/// Decode any Nostr entity (npub, nprofile, note, nevent, naddr).
/// Returns a JS object with type, hex, pubkey, identifier, kind, relays, or null.
pub fn decode_nostr_entity(raw: String) -> Dynamic {
  case nip19.decode(raw) {
    Error(_) -> js_null()
    Ok(entity) ->
      case entity {
        nip19.Npub(pk) -> {
          let hex = pubkey.to_hex(pk)
          js_object([
            #("type", dynamic.string("npub")),
            #("hex", dynamic.string(hex)),
          ])
        }
        nip19.Note(eid) -> {
          let hex = event_id.to_hex(eid)
          js_object([
            #("type", dynamic.string("note")),
            #("hex", dynamic.string(hex)),
          ])
        }
        nip19.Nprofile(profile) -> {
          let pk_hex = pubkey.to_hex(profile.pubkey)
          let relays_prop = case profile.relays {
            [] -> []
            rs -> [
              #("relays", dynamic.list(list_to_dyn_strings(rs))),
            ]
          }
          js_object([
            #("type", dynamic.string("nprofile")),
            #("pubkey", dynamic.string(pk_hex)),
            #("hex", dynamic.string(pk_hex)),
            ..relays_prop
          ])
        }
        nip19.Nevent(ev) -> {
          let eid_hex = event_id.to_hex(ev.id)
          let pk_prop = case ev.author {
            Some(pk) -> [
              #("pubkey", dynamic.string(pubkey.to_hex(pk))),
            ]
            None -> []
          }
          let relays_prop = case ev.relays {
            [] -> []
            rs -> [
              #("relays", dynamic.list(list_to_dyn_strings(rs))),
            ]
          }
          js_object([
            #("type", dynamic.string("nevent")),
            #("hex", dynamic.string(eid_hex)),
            #("eventId", dynamic.string(eid_hex)),
            ..list_concat(pk_prop, relays_prop)
          ])
        }
        nip19.Naddr(addr) -> {
          let pk_hex = pubkey.to_hex(addr.pubkey)
          let relays_prop = case addr.relays {
            [] -> []
            rs -> [
              #("relays", dynamic.list(list_to_dyn_strings(rs))),
            ]
          }
          js_object([
            #("type", dynamic.string("naddr")),
            #("kind", dynamic.int(kind.to_int(addr.kind))),
            #("pubkey", dynamic.string(pk_hex)),
            #("identifier", dynamic.string(addr.identifier)),
            ..relays_prop
          ])
        }
        nip19.Nsec(_) -> js_null()
      }
  }
}

/// Encode naddr from `{ identifier: string, pubkey: string, kind: number, relays?: string[] }`.
pub fn encode_naddr(params: Dynamic) -> String {
  let identifier =
    decode.run(params, decode.at(["identifier"], decode.string))
    |> result.unwrap("")
  let pubkey_str =
    decode.run(params, decode.at(["pubkey"], decode.string))
    |> result.unwrap("")
  let kind_int =
    decode.run(params, decode.at(["kind"], decode.int))
    |> result.unwrap(0)
  let relays =
    decode.run(params, decode.at(["relays"], decode.list(decode.string)))
    |> result.unwrap([])

  case pubkey.parse(pubkey_str) {
    Ok(pk) -> {
      let addr =
        nip19.AddressData(
          identifier: identifier,
          pubkey: pk,
          kind: kind.from_int(kind_int),
          relays: relays,
        )
      nip19.encode_naddr(addr)
    }
    Error(_) -> panic as "Invalid pubkey for encode_naddr"
  }
}

fn list_to_dyn_strings(strings: List(String)) -> List(Dynamic) {
  case strings {
    [] -> []
    [first, ..rest] -> [dynamic.string(first), ..list_to_dyn_strings(rest)]
  }
}

fn list_concat(a: List(t), b: List(t)) -> List(t) {
  case a {
    [] -> b
    [first, ..rest] -> [first, ..list_concat(rest, b)]
  }
}
