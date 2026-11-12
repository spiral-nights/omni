//// NIP-57 zap request helpers for `plugin_feed`.
////
//// Builds the unsigned Kind 9734 zap request that the host signs and publishes.
//// Fetching the LNURL invoice and tracking the resulting Kind 9735 receipt are
//// host responsibilities.

import gleam/bit_array
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import omni/nostr/bech32
import omni/nostr/event.{type UnsignedEvent, UnsignedEvent}
import omni/nostr/kind

/// Default relays advertised in a zap request when the model has none.
pub const default_relay_urls = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
]

/// Validation errors for a user-entered zap amount.
pub type ZapAmountError {
  EmptyAmount
  InvalidAmount
  NonPositiveAmount
}

/// A fully resolved zap request draft with a validated sat amount.
pub type ZapRequestDraft {
  ZapRequestDraft(
    note_id: String,
    recipient_pubkey: String,
    amount_sats: Int,
    comment: String,
    relays: List(String),
    lnurl: Option(String),
  )
}

/// Parse a user-entered sat amount, rejecting empty, non-numeric, and
/// non-positive values.
pub fn parse_amount(raw: String) -> Result(Int, ZapAmountError) {
  let clean = string.trim(raw)
  case clean {
    "" -> Error(EmptyAmount)
    _ ->
      case int.parse(clean) {
        Error(Nil) -> Error(InvalidAmount)
        Ok(sats) if sats > 0 -> Ok(sats)
        Ok(_) -> Error(NonPositiveAmount)
      }
  }
}

/// Convert a validated sat amount to the millisat `amount` tag value.
pub fn sats_to_millisats(sats: Int) -> Int {
  sats * 1000
}

/// Convert a Lightning address (`name@domain`) to a bech32 `lnurl` string.
///
/// This only performs the deterministic encoding; the host still has to fetch
/// the LNURL pay endpoint to obtain the invoice callback.
pub fn lud16_to_lnurl(lud16: String) -> Result(String, Nil) {
  let clean = string.lowercase(string.trim(lud16))
  case string.split(clean, "@") {
    [name, domain] if name != "" && domain != "" -> {
      let url = "https://" <> domain <> "/.well-known/lnurlp/" <> name
      let bytes = bit_array.from_string(url) |> bech32.bit_array_to_bytes
      bech32.encode_bytes("lnurl", bytes, bech32.Bech32)
      |> result.replace_error(Nil)
    }
    _ -> Error(Nil)
  }
}

/// Build the NIP-57 tags for a zap request.
///
/// `["p", recipient]` and `["amount", millisats]` are always present, `["e", id]`
/// is included for a note zap, `["lnurl", ...]` only when known, and `["relays", ...]`
/// lists the relays where the zap receipt should be published.
pub fn request_tags(draft: ZapRequestDraft) -> List(List(String)) {
  let note_tags = case string.trim(draft.note_id) {
    "" -> []
    note_id -> [["e", note_id]]
  }
  let relay_tags = case
    list.filter(draft.relays, fn(r) { string.trim(r) != "" })
  {
    [] -> []
    relays -> [["relays", ..relays]]
  }
  let lnurl_tags = case draft.lnurl {
    Some(lnurl) ->
      case string.trim(lnurl) {
        "" -> []
        clean -> [["lnurl", clean]]
      }
    None -> []
  }

  list.flatten([
    [["p", draft.recipient_pubkey]],
    note_tags,
    relay_tags,
    [["amount", int.to_string(sats_to_millisats(draft.amount_sats))]],
    lnurl_tags,
  ])
}

/// Build the unsigned Kind 9734 zap request for the host to sign and publish.
pub fn request_event(draft: ZapRequestDraft, created_at: Int) -> UnsignedEvent {
  UnsignedEvent(
    pubkey: None,
    created_at: created_at,
    kind: kind.ZapRequest,
    tags: request_tags(draft),
    content: string.trim(draft.comment),
  )
}
