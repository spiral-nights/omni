//// NIP-65 relay-list parsing shared by the kernel and host.

import gleam/list
import gleam/string

/// A relay entry from a kind-10002 event with its read/write markers.
pub type RelayHint {
  RelayHint(url: String, read: Bool, write: Bool)
}

/// Parse NIP-65 `r` tags. A bare tag means read+write.
pub fn parse_tags(tags: List(List(String))) -> List(RelayHint) {
  tags
  |> list.filter_map(fn(tag) {
    case tag {
      ["r", url] ->
        case url {
          "" -> Error(Nil)
          _ -> Ok(RelayHint(url: url, read: True, write: True))
        }
      ["r", url, "read"] -> Ok(RelayHint(url: url, read: True, write: False))
      ["r", url, "write"] -> Ok(RelayHint(url: url, read: False, write: True))
      _ -> Error(Nil)
    }
  })
}

/// Read-only relay URLs from NIP-65 tags, deduplicated and order-preserving.
pub fn read_relays(tags: List(List(String))) -> List(String) {
  parse_tags(tags)
  |> list.filter(fn(hint) { hint.read })
  |> list.map(fn(hint) { hint.url })
  |> list.unique
  |> list.filter(fn(url) { string.trim(url) != "" })
}
