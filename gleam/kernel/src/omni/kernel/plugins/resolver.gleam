//// Chain of resolver strategies for NIP-5A nsite plugins, Blossom manifests, and `naddr1...`.
////
//// Resolves addressable Nostr coordinates (`naddr1...`, `35129:pubkey:d`),
//// Blossom-backed bundles, and HTTP/HTTPS URLs into executable plugin entries.

import gleam/dict.{type Dict}
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/event_id
import omni/nostr/kind.{type Kind}
import omni/nostr/nip19.{type AddressData, Naddr}
import omni/nostr/pubkey.{type Pubkey}
import omni/protocol/manifest.{type PluginViewDeclaration}

/// Standard NIP-5A nsite application manifest kind (35129).
pub const nsite_manifest_kind_int = 35_129

/// Default public Blossom CDN fallback servers.
pub const default_blossom_servers = [
  "https://cdn.satellite.earth",
  "https://blossom.primal.net",
  "https://nostr.download",
]

/// Resolved plugin ready for installation or execution.
pub type ResolvedPlugin {
  ResolvedPlugin(
    id: String,
    name: String,
    display_name: Option(String),
    version: String,
    description: String,
    icon: Option(String),
    entry: String,
    content: String,
    source_url: Option(String),
    naddr: Option(String),
    author_pubkey: Option(String),
    author_npub: Option(String),
    relays: List(String),
    views: List(PluginViewDeclaration),
    handled_intents: List(String),
    blossom_hashes: Dict(String, String),
    blossom_servers: List(String),
  )
}

/// Target to resolve.
pub type ResolveTarget {
  NaddrTarget(naddr: String, address: AddressData)
  CoordinateTarget(kind: Int, pubkey: String, identifier: String)
  UrlTarget(url: String)
  EventTarget(event: Event)
}

/// Error encountered during resolution.
pub type ResolveError {
  TargetParseError(String)
  EventNotFound(String)
  InvalidSignature(String)
  MissingManifest(String)
  NoExecutableContent(String)
  BlossomFetchFailed(hash: String, reason: String)
  HttpFetchFailed(url: String, reason: String)
  StrategyExhausted
}

/// Strategy for resolving a target.
pub type ResolverStrategy =
  fn(ResolveTarget) -> Result(ResolvedPlugin, ResolveError)

/// Parse a raw string target into a structured `ResolveTarget`.
pub fn parse_target(raw: String) -> Result(ResolveTarget, ResolveError) {
  let clean = string.trim(raw)
  case string.starts_with(clean, "naddr1") {
    True ->
      case nip19.decode(clean) {
        Ok(Naddr(addr)) -> Ok(NaddrTarget(naddr: clean, address: addr))
        _ -> Error(TargetParseError("Invalid naddr1 Bech32 address"))
      }

    False ->
      case
        string.starts_with(clean, "https://")
        || string.starts_with(clean, "http://")
      {
        True -> Ok(UrlTarget(clean))
        False ->
          case string.split(clean, ":") {
            [kind_str, pk, id] -> {
              case int.parse(kind_str) {
                Ok(k) ->
                  Ok(CoordinateTarget(kind: k, pubkey: pk, identifier: id))
                Error(_) ->
                  Error(TargetParseError("Invalid kind integer in coordinate"))
              }
            }
            [pk, id] ->
              Ok(CoordinateTarget(
                kind: nsite_manifest_kind_int,
                pubkey: pk,
                identifier: id,
              ))
            _ ->
              Error(TargetParseError(
                "Expected naddr1..., http(s)://..., or kind:pubkey:d",
              ))
          }
      }
  }
}

/// Try resolving `target` through a chain of strategies in order.
pub fn resolve_chain(
  target: ResolveTarget,
  strategies: List(ResolverStrategy),
) -> Result(ResolvedPlugin, ResolveError) {
  case strategies {
    [] -> Error(StrategyExhausted)
    [strategy, ..rest] ->
      case strategy(target) {
        Ok(plugin) -> Ok(plugin)
        Error(_) -> resolve_chain(target, rest)
      }
  }
}

/// Extract Blossom file mappings (`["f", name, hash, ...]`) from event tags.
pub fn extract_blossom_hashes(
  tags: List(List(String)),
) -> Dict(String, String) {
  list.fold(tags, dict.new(), fn(acc, tag) {
    case tag {
      ["f", name, hash, ..] -> dict.insert(acc, name, hash)
      _ -> acc
    }
  })
}

/// Extract Blossom server URLs from event tags (`["server", url]`).
pub fn extract_blossom_servers(tags: List(List(String))) -> List(String) {
  list.filter_map(tags, fn(tag) {
    case tag {
      ["server", s, ..] if s != "" -> Ok(s)
      _ -> Error(Nil)
    }
  })
}

/// Extract handled intent actions from event tags (`["intent", action]`).
pub fn extract_handled_intents(tags: List(List(String))) -> List(String) {
  list.filter_map(tags, fn(tag) {
    case tag {
      ["intent", action, ..] if action != "" -> Ok(action)
      ["intents", ..actions] ->
        Ok(string.join(list.filter(actions, fn(a) { a != "" }), ","))
      _ -> Error(Nil)
    }
  })
}

/// Pure resolution of a Nostr Event (Kind 35129 or compatible) into `ResolvedPlugin`.
pub fn resolve_event(
  event: Event,
  naddr_hint: Option(String),
) -> Result(ResolvedPlugin, ResolveError) {
  let tags = event.tags
  let d_tag = case event.get_tag_values(tags, "d") {
    [val, ..] if val != "" -> val
    _ -> event_id.to_hex(event.id)
  }

  let name = case event.get_tag_values(tags, "name") {
    [n, ..] if n != "" -> n
    _ ->
      case event.get_tag_values(tags, "title") {
        [t, ..] if t != "" -> t
        _ -> d_tag
      }
  }

  let version = case event.get_tag_values(tags, "version") {
    [v, ..] if v != "" -> v
    _ -> "1.0.0"
  }

  let description = case event.get_tag_values(tags, "description") {
    [d, ..] -> d
    _ ->
      case event.get_tag_values(tags, "about") {
        [a, ..] -> a
        _ -> ""
      }
  }

  let icon = case event.get_tag_values(tags, "icon") {
    [ic, ..] if ic != "" -> Some(ic)
    _ ->
      case event.get_tag_values(tags, "picture") {
        [pic, ..] if pic != "" -> Some(pic)
        _ -> None
      }
  }

  let blossom_hashes = extract_blossom_hashes(tags)
  let blossom_servers = extract_blossom_servers(tags)
  let handled_intents = extract_handled_intents(tags)
  let views = manifest.parse_view_tags(tags, False)

  let author_hex = pubkey.to_hex(event.pubkey)
  let author_npub = nip19.encode_npub(event.pubkey)

  let naddr = case naddr_hint {
    Some(hint) -> hint
    None -> {
      let addr_data =
        nip19.AddressData(
          identifier: d_tag,
          pubkey: event.pubkey,
          kind: event.kind,
          relays: [],
        )
      nip19.encode(Naddr(addr_data))
    }
  }

  // Determine entry and content
  let content = event.content
  let trimmed = string.trim(content)

  let #(entry, script_content) = case
    string.starts_with(trimmed, "<!doctype")
    || string.starts_with(trimmed, "<!DOCTYPE")
    || string.starts_with(trimmed, "<html")
    || string.starts_with(trimmed, "<head")
    || string.starts_with(trimmed, "<body")
    || string.starts_with(trimmed, "<div")
    || string.starts_with(trimmed, "<")
  {
    True -> #("index.html", content)
    False ->
      case dict.size(blossom_hashes) > 0 {
        True ->
          // Blossom manifest referencing external blobs
          case dict.get(blossom_hashes, "index.html") {
            Ok(_) -> #("index.html", "")
            Error(Nil) ->
              case dict.get(blossom_hashes, "index.js") {
                Ok(_) -> #("index.js", "")
                Error(Nil) -> #("index.html", "")
              }
          }
        False ->
          case trimmed != "" {
            True -> #("index.html", content)
            False -> #("index.html", "")
          }
      }
  }

  Ok(ResolvedPlugin(
    id: d_tag,
    name: name,
    display_name: Some(name),
    version: version,
    description: description,
    icon: icon,
    entry: entry,
    content: script_content,
    source_url: None,
    naddr: Some(naddr),
    author_pubkey: Some(author_hex),
    author_npub: Some(author_npub),
    relays: [],
    views: views,
    handled_intents: handled_intents,
    blossom_hashes: blossom_hashes,
    blossom_servers: blossom_servers,
  ))
}

/// Strategy for direct `EventTarget`.
pub fn event_strategy(
  target: ResolveTarget,
) -> Result(ResolvedPlugin, ResolveError) {
  case target {
    EventTarget(ev) -> resolve_event(ev, None)
    _ -> Error(StrategyExhausted)
  }
}

/// Helper strategy builder for `NaddrTarget` using an event fetcher function.
pub fn naddr_strategy(
  fetch_event: fn(Kind, Pubkey, String, List(String)) ->
    Result(Event, ResolveError),
) -> ResolverStrategy {
  fn(target: ResolveTarget) {
    case target {
      NaddrTarget(naddr, addr) ->
        case fetch_event(addr.kind, addr.pubkey, addr.identifier, addr.relays) {
          Ok(event) -> resolve_event(event, Some(naddr))
          Error(err) -> Error(err)
        }
      _ -> Error(StrategyExhausted)
    }
  }
}

/// Helper strategy builder for `UrlTarget` using an HTTP fetcher function.
pub fn url_strategy(
  fetch_url: fn(String) -> Result(String, ResolveError),
) -> ResolverStrategy {
  fn(target: ResolveTarget) {
    case target {
      UrlTarget(url) ->
        case fetch_url(url) {
          Ok(content) -> {
            let id = url
            let name = case string.split(url, "/") |> list.reverse {
              [last, ..] if last != "" -> last
              _ -> "Plugin"
            }
            Ok(
              ResolvedPlugin(
                id: id,
                name: name,
                display_name: Some(name),
                version: "1.0.0",
                description: "",
                icon: None,
                entry: "index.html",
                content: content,
                source_url: Some(url),
                naddr: None,
                author_pubkey: None,
                author_npub: None,
                relays: [],
                views: [],
                handled_intents: [],
                blossom_hashes: dict.new(),
                blossom_servers: [],
              ),
            )
          }
          Error(err) -> Error(err)
        }
      _ -> Error(StrategyExhausted)
    }
  }
}
