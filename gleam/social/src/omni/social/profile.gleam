//// Nostr Kind 0 profile metadata representation, JSON codec, and display helpers.

import gleam/dynamic/decode.{type Decoder}
import gleam/int
import gleam/json.{type Json}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/kind
import omni/nostr/nip19
import omni/nostr/pubkey

/// A Nostr user profile decoded from Kind 0 metadata.
pub type Profile {
  Profile(
    pubkey: String,
    name: Option(String),
    display_name: Option(String),
    about: Option(String),
    picture: Option(String),
    banner: Option(String),
    nip05: Option(String),
    lud16: Option(String),
    website: Option(String),
    created_at: Int,
  )
}

/// Create an empty `Profile` for the given `pubkey` with all metadata fields unset.
pub fn empty(pubkey: String) -> Profile {
  Profile(
    pubkey: pubkey,
    name: None,
    display_name: None,
    about: None,
    picture: None,
    banner: None,
    nip05: None,
    lud16: None,
    website: None,
    created_at: 0,
  )
}

/// Decode a `Profile` from a Kind 0 metadata `Event`.
///
/// Handles missing or null fields gracefully, and supports both `"display_name"`
/// and `"displayName"` keys in the metadata JSON.
pub fn from_event(ev: Event) -> Result(Profile, String) {
  case ev.kind {
    kind.Metadata -> {
      let pk_hex = pubkey.to_hex(ev.pubkey)
      let trimmed = string.trim(ev.content)
      case trimmed {
        "" | "{}" -> Ok(Profile(..empty(pk_hex), created_at: ev.created_at))
        _ ->
          case
            json.parse(
              from: trimmed,
              using: metadata_decoder(pk_hex, ev.created_at),
            )
          {
            Ok(profile) -> Ok(profile)
            Error(_) -> Error("Failed to decode Kind 0 profile metadata JSON")
          }
      }
    }
    other ->
      Error(
        "Expected Kind 0 Metadata event, got kind "
        <> int.to_string(kind.to_int(other)),
      )
  }
}

/// Dynamic decoder for a `Profile` record (used when persisting to local cache).
pub fn decoder() -> Decoder(Profile) {
  use pk <- decode.optional_field("pubkey", "", decode.string)
  use created_at <- decode.optional_field("created_at", 0, decode.int)
  metadata_decoder(pk, created_at)
}

fn metadata_decoder(
  default_pubkey: String,
  default_created_at: Int,
) -> Decoder(Profile) {
  let opt_str = decode.optional(decode.string)
  use name <- decode.optional_field("name", None, opt_str)
  use display_name <- decode.optional_field("display_name", None, opt_str)
  use display_name_camel <- decode.optional_field("displayName", None, opt_str)
  use about <- decode.optional_field("about", None, opt_str)
  use picture <- decode.optional_field("picture", None, opt_str)
  use banner <- decode.optional_field("banner", None, opt_str)
  use nip05 <- decode.optional_field("nip05", None, opt_str)
  use lud16 <- decode.optional_field("lud16", None, opt_str)
  use website <- decode.optional_field("website", None, opt_str)

  let resolved_display_name = case normalize_opt_string(display_name) {
    Some(d) -> Some(d)
    None -> normalize_opt_string(display_name_camel)
  }

  decode.success(Profile(
    pubkey: default_pubkey,
    name: normalize_opt_string(name),
    display_name: resolved_display_name,
    about: normalize_opt_string(about),
    picture: normalize_opt_string(picture),
    banner: normalize_opt_string(banner),
    nip05: normalize_opt_string(nip05),
    lud16: normalize_opt_string(lud16),
    website: normalize_opt_string(website),
    created_at: default_created_at,
  ))
}

fn normalize_opt_string(opt: Option(String)) -> Option(String) {
  case opt {
    Some(s) -> {
      let trimmed = string.trim(s)
      case trimmed {
        "" -> None
        _ -> Some(trimmed)
      }
    }
    None -> None
  }
}

/// Encode a `Profile` into a `Json` value suitable for persistence or wire transfer.
pub fn to_json(profile: Profile) -> Json {
  let fields = [
    #("pubkey", json.string(profile.pubkey)),
    #("created_at", json.int(profile.created_at)),
  ]
  let meta_fields = metadata_fields(profile)
  json.object(list.append(fields, meta_fields))
}

fn metadata_fields(profile: Profile) -> List(#(String, Json)) {
  list.filter_map(
    [
      #("name", profile.name),
      #("display_name", profile.display_name),
      #("about", profile.about),
      #("picture", profile.picture),
      #("banner", profile.banner),
      #("nip05", profile.nip05),
      #("lud16", profile.lud16),
      #("website", profile.website),
    ],
    fn(pair) {
      let #(key, maybe_val) = pair
      case maybe_val {
        Some(v) -> Ok(#(key, json.string(v)))
        None -> Error(Nil)
      }
    },
  )
}

/// Encode a `Profile` into a Kind 0 metadata JSON string.
pub fn to_metadata_json(profile: Profile) -> String {
  json.object(metadata_fields(profile))
  |> json.to_string
}

/// Convert a hex pubkey (or `npub1...` string) into a truncated `npub1xxxx...yyyy` representation.
pub fn truncate_npub(pubkey_or_npub: String) -> String {
  let trimmed = string.trim(pubkey_or_npub)
  let npub_str = case string.starts_with(trimmed, "npub1") {
    True -> trimmed
    False ->
      case pubkey.parse(trimmed) {
        Ok(pk) -> nip19.encode_npub(pk)
        Error(Nil) ->
          case trimmed {
            "" -> "npub1..."
            _ -> "npub1" <> trimmed
          }
      }
  }

  let len = string.length(npub_str)
  case len > 16 {
    True -> {
      let prefix = string.slice(npub_str, at_index: 0, length: 9)
      let suffix = string.slice(npub_str, at_index: len - 4, length: 4)
      prefix <> "..." <> suffix
    }
    False -> npub_str
  }
}

/// Resolve the best human-readable display name for a user:
/// prefers non-empty `display_name`, then `name`, then `truncate_npub(pubkey)`.
pub fn best_display_name(profile: Option(Profile), pubkey: String) -> String {
  case profile {
    Some(p) ->
      case non_empty(p.display_name) {
        Some(dn) -> dn
        None ->
          case non_empty(p.name) {
            Some(n) -> n
            None -> truncate_npub(pubkey)
          }
      }
    None -> truncate_npub(pubkey)
  }
}

fn non_empty(opt: Option(String)) -> Option(String) {
  case opt {
    Some(s) -> {
      let trimmed = string.trim(s)
      case trimmed {
        "" -> None
        _ -> Some(trimmed)
      }
    }
    None -> None
  }
}
