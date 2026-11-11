//// Protocol URI interception, parsing, and intent routing.
////
//// Intercepts standard protocol links (`nostr:`, `lightning:`, `cashu:`, `https:`)
//// triggered from within guest sandboxes (via click interception or `window.open` shims)
//// and routes them to canonical shell intents or the "Open With..." chooser.

import gleam/dict
import gleam/dynamic
import gleam/option.{type Option, Some}
import gleam/string
import omni/protocol/intent.{type Intent, Intent}

/// Parsed protocol URI originating from guest sandboxes.
pub type ProtocolUri {
  Nostr(String)
  Lightning(String)
  Cashu(String)
  Web(String)
}

/// The resolution outcome when routing a protocol URI.
pub type ProtocolResolution {
  DispatchIntent(Intent)
  OpenChooser(protocol_uri: ProtocolUri, candidates: List(String))
  ExternalLink(url: String)
}

/// Parse and validate a protocol URI string.
///
/// Recognizes `nostr:`, `lightning:`, `cashu:`, `http:`, and `https:` schemes,
/// as well as standard bech32 Nostr prefixes (`npub1`, `note1`, etc.).
pub fn parse_protocol_uri(raw: String) -> Result(ProtocolUri, Nil) {
  let trimmed = string.trim(raw)
  case trimmed == "" {
    True -> Error(Nil)
    False -> {
      case string.split_once(trimmed, ":") {
        Ok(#(scheme, rest)) -> {
          let s = string.lowercase(scheme)
          let payload = case string.starts_with(rest, "//") {
            True -> string.drop_start(rest, 2)
            False -> rest
          }
          case s {
            "nostr" | "web+nostr" ->
              case payload == "" {
                True -> Error(Nil)
                False -> Ok(Nostr(payload))
              }
            "lightning" | "web+lightning" ->
              case payload == "" {
                True -> Error(Nil)
                False -> Ok(Lightning(payload))
              }
            "cashu" | "web+cashu" ->
              case payload == "" {
                True -> Error(Nil)
                False -> Ok(Cashu(payload))
              }
            "http" | "https" -> Ok(Web(trimmed))
            _ -> Error(Nil)
          }
        }
        Error(Nil) -> {
          // Match standard prefixes without explicit scheme
          let is_nostr_prefix =
            string.starts_with(trimmed, "npub1")
            || string.starts_with(trimmed, "nprofile1")
            || string.starts_with(trimmed, "note1")
            || string.starts_with(trimmed, "nevent1")
            || string.starts_with(trimmed, "naddr1")

          case is_nostr_prefix {
            True -> Ok(Nostr(trimmed))
            False ->
              case string.starts_with(trimmed, "lnbc") {
                True -> Ok(Lightning(trimmed))
                False ->
                  case string.starts_with(trimmed, "cashuA") {
                    True -> Ok(Cashu(trimmed))
                    False -> Error(Nil)
                  }
              }
          }
        }
      }
    }
  }
}

/// Convert a `ProtocolUri` back into its canonical URI string.
pub fn to_uri_string(uri: ProtocolUri) -> String {
  case uri {
    Nostr(target) -> "nostr:" <> target
    Lightning(invoice) -> "lightning:" <> invoice
    Cashu(token) -> "cashu:" <> token
    Web(url) -> url
  }
}

/// Get the underlying payload of the protocol URI.
pub fn payload(uri: ProtocolUri) -> String {
  case uri {
    Nostr(p) | Lightning(p) | Cashu(p) | Web(p) -> p
  }
}

/// Route a `ProtocolUri` to its canonical shell `Intent`.
pub fn route_to_intent(
  uri: ProtocolUri,
  caller_plugin_id: Option(String),
) -> Intent {
  case uri {
    Nostr(target) -> {
      let is_profile =
        string.starts_with(target, "npub1")
        || string.starts_with(target, "nprofile1")
      let is_note =
        string.starts_with(target, "note1")
        || string.starts_with(target, "nevent1")
      let is_app = string.starts_with(target, "naddr1")

      let action = case is_profile {
        True -> "view_profile"
        False ->
          case is_note {
            True -> "view_note"
            False ->
              case is_app {
                True -> "view_app"
                False -> "handle_nostr_uri"
              }
          }
      }
      let data =
        dict.from_list([
          #("target", dynamic.string(target)),
          #("uri", dynamic.string("nostr:" <> target)),
        ])
      Intent(
        action: action,
        data: Some(data),
        caller_plugin_id: caller_plugin_id,
      )
    }

    Lightning(invoice) -> {
      let data =
        dict.from_list([
          #("invoice", dynamic.string(invoice)),
          #("uri", dynamic.string("lightning:" <> invoice)),
        ])
      Intent(
        action: "pay_invoice",
        data: Some(data),
        caller_plugin_id: caller_plugin_id,
      )
    }

    Cashu(token) -> {
      let data =
        dict.from_list([
          #("token", dynamic.string(token)),
          #("uri", dynamic.string("cashu:" <> token)),
        ])
      Intent(
        action: "receive_cashu",
        data: Some(data),
        caller_plugin_id: caller_plugin_id,
      )
    }

    Web(url) -> {
      let data = dict.from_list([#("url", dynamic.string(url))])
      Intent(
        action: "open_url",
        data: Some(data),
        caller_plugin_id: caller_plugin_id,
      )
    }
  }
}

/// Resolve a protocol URI against installed candidate plugins.
///
/// If multiple candidates are installed that can handle this URI,
/// returns `OpenChooser` to prompt the user.
/// If exactly one candidate is present or none, dispatches the intent directly.
/// If it is a web URL, returns `ExternalLink`.
pub fn resolve_uri(
  uri: ProtocolUri,
  caller_plugin_id: Option(String),
  installed_candidates: List(String),
) -> ProtocolResolution {
  case uri {
    Web(url) -> ExternalLink(url)
    _ -> {
      case installed_candidates {
        [_, _, ..] ->
          OpenChooser(protocol_uri: uri, candidates: installed_candidates)
        _ -> DispatchIntent(route_to_intent(uri, caller_plugin_id))
      }
    }
  }
}
