//// Domain model and NIP-65 relay list helpers for `plugin_relays`.

import gleam/list
import gleam/option.{type Option, None}
import gleam/string
import omni/nostr/relay_url

/// Connection lifecycle state for a Nostr relay.
pub type RelayConnectionState {
  StateConnected
  StateConnecting
  StateDisconnected
  StateError(String)
}

/// Configured Nostr relay entry with NIP-65 read/write permissions and metrics.
pub type RelayEntry {
  RelayEntry(
    url: String,
    read: Bool,
    write: Bool,
    state: RelayConnectionState,
    latency_ms: Option(Int),
    events_received: Int,
    events_sent: Int,
  )
}

/// Active viewport rendering mode for the relays plugin.
pub type ViewMode {
  ViewMain
  ViewWidget
  ViewCompact
}

/// Complete state model for `plugin_relays`.
pub type Model {
  Model(
    relays: List(RelayEntry),
    draft_url: String,
    error_banner: Option(String),
    view_mode: ViewMode,
    syncing_nip65: Bool,
  )
}

/// Default bootstrap relay URLs.
pub fn default_bootstrap_urls() -> List(String) {
  [
    "wss://relay.damus.io",
    "wss://relay.ditto.pub",
    "wss://relay.nostr.band",
  ]
}

/// Constructs a default connected `RelayEntry` for `url`.
pub fn default_relay_entry(url: String) -> RelayEntry {
  RelayEntry(
    url: url,
    read: True,
    write: True,
    state: StateConnected,
    latency_ms: None,
    events_received: 0,
    events_sent: 0,
  )
}

/// Initializes the default `Model` for the given `ViewMode` with the 3 bootstrap relays.
pub fn init(view_mode: ViewMode) -> Model {
  let initial_relays = list.map(default_bootstrap_urls(), default_relay_entry)
  Model(
    relays: initial_relays,
    draft_url: "",
    error_banner: None,
    view_mode: view_mode,
    syncing_nip65: False,
  )
}

/// Counts the number of relays currently in `StateConnected`.
pub fn connected_count(model: Model) -> Int {
  list.count(model.relays, fn(entry) {
    case entry.state {
      StateConnected -> True
      _ -> False
    }
  })
}

/// Computes the sum of `events_received` across all configured relays.
pub fn total_events_received(model: Model) -> Int {
  list.fold(model.relays, 0, fn(acc, entry) { acc + entry.events_received })
}

/// Serializes a list of `RelayEntry` items into NIP-65 (`kind: 10002`) `"r"` tags.
///
/// - `read: True, write: True` -> `["r", url]`
/// - `read: True, write: False` -> `["r", url, "read"]`
/// - `read: False, write: True` -> `["r", url, "write"]`
/// - `read: False, write: False` -> omitted
pub fn to_nip65_tags(relays: List(RelayEntry)) -> List(List(String)) {
  list.filter_map(relays, fn(r) {
    case r.read, r.write {
      True, True -> Ok(["r", r.url])
      True, False -> Ok(["r", r.url, "read"])
      False, True -> Ok(["r", r.url, "write"])
      False, False -> Error(Nil)
    }
  })
}

/// Parses NIP-65 (`kind: 10002`) tags into a deduplicated list of `RelayEntry` records.
pub fn from_nip65_tags(tags: List(List(String))) -> List(RelayEntry) {
  list.fold(tags, [], fn(acc: List(RelayEntry), tag) {
    case tag {
      ["r", raw_url, ..rest] ->
        case relay_url.parse(raw_url) {
          Error(Nil) -> acc
          Ok(parsed) -> {
            let norm_url = relay_url.to_string(parsed)
            let already_exists =
              list.any(acc, fn(e: RelayEntry) { e.url == norm_url })
            case already_exists {
              True -> acc
              False -> {
                let #(read_flag, write_flag) = case rest {
                  [marker, ..] ->
                    case string.lowercase(string.trim(marker)) {
                      "read" -> #(True, False)
                      "write" -> #(False, True)
                      _ -> #(True, True)
                    }
                  [] -> #(True, True)
                }
                let entry =
                  RelayEntry(
                    url: norm_url,
                    read: read_flag,
                    write: write_flag,
                    state: StateConnected,
                    latency_ms: None,
                    events_received: 0,
                    events_sent: 0,
                  )
                list.append(acc, [entry])
              }
            }
          }
        }
      _ -> acc
    }
  })
}
