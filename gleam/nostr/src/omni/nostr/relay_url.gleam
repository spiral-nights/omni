//// Validated, normalized WebSocket relay URL representation for Nostr.
////
//// Normalization ensures:
//// - Only `ws://` or `wss://` schemes are accepted.
//// - Scheme is lowercase.
//// - Host and port are normalized to lowercase.
//// - Trailing slashes are stripped (e.g. `wss://relay.damus.io/` -> `wss://relay.damus.io`).

import gleam/string

/// An opaque, validated Nostr relay URL.
pub opaque type RelayUrl {
  RelayUrl(url: String)
}

/// Recursively strip trailing slashes from a path string.
fn strip_trailing_slashes(s: String) -> String {
  case string.ends_with(s, "/") {
    True -> strip_trailing_slashes(string.drop_end(s, 1))
    False -> s
  }
}

/// Parse and normalize a Nostr relay URL string.
///
/// Accepts only `ws://` and `wss://` schemes. Normalizes the host to lowercase
/// and strips trailing slashes.
pub fn parse(raw: String) -> Result(RelayUrl, Nil) {
  let trimmed = string.trim(raw)

  case
    string.starts_with(string.lowercase(trimmed), "wss://"),
    string.starts_with(string.lowercase(trimmed), "ws://")
  {
    True, _ -> normalize_with_scheme("wss://", string.drop_start(trimmed, 6))
    _, True -> normalize_with_scheme("ws://", string.drop_start(trimmed, 5))
    _, _ -> Error(Nil)
  }
}

/// Alias for `parse`.
pub const from_string = parse

fn normalize_with_scheme(
  scheme: String,
  rest: String,
) -> Result(RelayUrl, Nil) {
  // Reject URLs with whitespace
  case
    string.contains(rest, " ")
    || string.contains(rest, "\t")
    || string.contains(rest, "\n")
    || string.contains(rest, "\r")
  {
    True -> Error(Nil)
    False -> {
      let #(authority, path_query) = case string.split_once(rest, "/") {
        Ok(#(auth, pq)) -> #(auth, "/" <> pq)
        Error(Nil) ->
          case string.split_once(rest, "?") {
            Ok(#(auth, q)) -> #(auth, "?" <> q)
            Error(Nil) ->
              case string.split_once(rest, "#") {
                Ok(#(auth, frag)) -> #(auth, "#" <> frag)
                Error(Nil) -> #(rest, "")
              }
          }
      }

      let host = string.lowercase(string.trim(authority))
      case string.length(host) {
        0 -> Error(Nil)
        _ -> {
          let norm_path_query = case string.split_once(path_query, "?") {
            Ok(#(p, q)) -> strip_trailing_slashes(p) <> "?" <> q
            Error(Nil) ->
              case string.split_once(path_query, "#") {
                Ok(#(p, frag)) -> strip_trailing_slashes(p) <> "#" <> frag
                Error(Nil) -> strip_trailing_slashes(path_query)
              }
          }

          let normalized = scheme <> host <> norm_path_query
          Ok(RelayUrl(normalized))
        }
      }
    }
  }
}

/// Return the canonical normalized string representation of the relay URL.
pub fn to_string(url: RelayUrl) -> String {
  let RelayUrl(raw) = url
  raw
}
