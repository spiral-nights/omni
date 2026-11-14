//// Chain of resolver strategies for NIP-5A nsite plugins, Blossom manifests, and `naddr1...`.
////
//// Resolves addressable Nostr coordinates (`naddr1...`, `35129:pubkey:d`),
//// Blossom-backed bundles, and HTTP/HTTPS URLs into executable plugin entries.

import gleam/bit_array
import gleam/dict.{type Dict}
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/event_id
import omni/nostr/kind.{type Kind}
import omni/nostr/nip19.{type AddressData, Naddr}
import omni/nostr/pubkey.{type Pubkey}
import omni/platform/secp256k1
import omni/platform/webcrypto
import omni/platform/zip
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
  ZipUrlTarget(url: String)
  ZipBytesTarget(bytes: BitArray)
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
        True ->
          case is_zip_url(clean) {
            True -> Ok(ZipUrlTarget(clean))
            False -> Ok(UrlTarget(clean))
          }
        False ->
          case string.starts_with(clean, "data:application/zip;base64,") {
            True -> {
              let b64 =
                string.drop_start(
                  clean,
                  string.length("data:application/zip;base64,"),
                )
              case bit_array.base64_decode(b64) {
                Ok(bytes) -> Ok(ZipBytesTarget(bytes))
                Error(_) ->
                  Error(TargetParseError("Invalid base64 zip data URI"))
              }
            }
            False ->
              case string.split(clean, ":") {
                [kind_str, pk, id] -> {
                  case int.parse(kind_str) {
                    Ok(k) ->
                      Ok(CoordinateTarget(kind: k, pubkey: pk, identifier: id))
                    Error(_) ->
                      Error(TargetParseError(
                        "Invalid kind integer in coordinate",
                      ))
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

/// Verify a signed event: its ID must hash to the canonical NIP-01 serialization
/// and its Schnorr signature must validate against the author pubkey.
pub fn verify_event_signature(event: Event) -> Bool {
  let hash = webcrypto.sha256_hex(event.serialize_event_for_id(event))
  let id_matches = string.lowercase(event_id.to_hex(event.id)) == hash
  id_matches
  && secp256k1.schnorr_verify(event.sig, hash, pubkey.to_hex(event.pubkey))
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

/// Check if a URL or path points to a .zip archive.
pub fn is_zip_url(url: String) -> Bool {
  let lower = string.lowercase(string.trim(url))
  string.ends_with(lower, ".zip")
}

/// Filter out OS metadata and directories from zip entries.
fn is_bundle_file(path: String) -> Bool {
  !string.ends_with(path, "/")
  && !string.starts_with(path, "__MACOSX/")
  && !string.contains(path, "/__MACOSX/")
  && path != ".DS_Store"
  && !string.ends_with(path, "/.DS_Store")
}

/// Strip common single-directory prefix if all entries are nested.
fn strip_shared_prefix(
  entries: List(#(String, BitArray)),
) -> List(#(String, BitArray)) {
  let paths = list.map(entries, fn(e) { e.0 })
  case paths {
    [] -> entries
    [first, ..] ->
      case string.split_once(first, "/") {
        Ok(#(prefix, _)) -> {
          let prefix_with_slash = prefix <> "/"
          let all_share =
            list.all(paths, fn(p) { string.starts_with(p, prefix_with_slash) })
          case all_share {
            True -> {
              let stripped =
                list.map(entries, fn(e) {
                  #(
                    string.drop_start(e.0, string.length(prefix_with_slash)),
                    e.1,
                  )
                })
              strip_shared_prefix(stripped)
            }
            False -> entries
          }
        }
        Error(Nil) -> entries
      }
  }
}

/// Pick primary entry file in candidate priority order.
fn pick_entry_file(paths: List(String)) -> Result(String, ResolveError) {
  let candidates = [
    "index.html",
    "dist/index.html",
    "public/index.html",
    "index.htm",
    "index.js",
    "dist/index.js",
    "main.js",
  ]
  case list.find(candidates, fn(c) { list.contains(paths, c) }) {
    Ok(found) -> Ok(found)
    Error(Nil) ->
      case
        list.find(paths, fn(p) {
          string.ends_with(p, ".html") || string.ends_with(p, ".htm")
        })
      {
        Ok(html) -> Ok(html)
        Error(Nil) ->
          case
            list.find(paths, fn(p) {
              string.ends_with(p, ".js") || string.ends_with(p, ".mjs")
            })
          {
            Ok(js) -> Ok(js)
            Error(Nil) ->
              Error(NoExecutableContent(
                "Zip archive has no index.html or index.js",
              ))
          }
      }
  }
}

/// Extract `<title>` text from an HTML document.
pub fn detect_html_title(html: String) -> Option(String) {
  case string.split_once(html, "<title>") {
    Ok(#(_, after)) ->
      case string.split_once(after, "</title>") {
        Ok(#(title, _)) -> {
          let clean = string.trim(title)
          case clean {
            "" -> None
            value -> Some(value)
          }
        }
        Error(Nil) -> None
      }
    Error(Nil) -> {
      case string.split_once(html, "<TITLE>") {
        Ok(#(_, after)) ->
          case string.split_once(after, "</TITLE>") {
            Ok(#(title, _)) -> {
              let clean = string.trim(title)
              case clean {
                "" -> None
                value -> Some(value)
              }
            }
            Error(Nil) -> None
          }
        Error(Nil) -> None
      }
    }
  }
}

/// Extract `<link rel="icon">` from an HTML document.
pub fn detect_html_icon(html: String) -> Option(String) {
  html
  |> find_link_tags
  |> list.find_map(fn(tag) {
    let rel = attribute_value(tag, "rel")
    let href = attribute_value(tag, "href")
    case rel, href {
      Some(rel_value), Some(href_value) ->
        case string.contains(string.lowercase(rel_value), "icon") {
          True ->
            case string.trim(href_value) {
              "" -> Error(Nil)
              value -> Ok(value)
            }
          False -> Error(Nil)
        }
      _, _ -> Error(Nil)
    }
  })
  |> option.from_result
}

fn find_link_tags(html: String) -> List(String) {
  html
  |> string.split("<link")
  |> list.drop(1)
  |> list.filter_map(fn(chunk) {
    case string.split_once(chunk, ">") {
      Ok(#(tag, _)) -> Ok(tag)
      Error(Nil) -> Error(Nil)
    }
  })
}

fn attribute_value(tag: String, name: String) -> Option(String) {
  case string.split_once(tag, name <> "=\"") {
    Ok(#(_, after)) ->
      case string.split_once(after, "\"") {
        Ok(#(value, _)) -> Some(value)
        Error(Nil) -> None
      }
    Error(Nil) ->
      case string.split_once(tag, name <> "='") {
        Ok(#(_, after)) ->
          case string.split_once(after, "'") {
            Ok(#(value, _)) -> Some(value)
            Error(Nil) -> None
          }
        Error(Nil) -> None
      }
  }
}

/// Inline CSS and JS companion assets into HTML.
pub fn inline_assets(html: String, assets: List(#(String, String))) -> String {
  let css =
    list.filter_map(assets, fn(asset) {
      let #(name, content) = asset
      case string.ends_with(name, ".css") {
        True ->
          Ok(
            "<style data-omni-asset=\""
            <> name
            <> "\">\n"
            <> content
            <> "\n</style>",
          )
        False -> Error(Nil)
      }
    })
    |> string.join("\n")

  let js =
    list.filter_map(assets, fn(asset) {
      let #(name, content) = asset
      case string.ends_with(name, ".js") {
        True ->
          Ok(
            "<script data-omni-asset=\""
            <> name
            <> "\">\n"
            <> content
            <> "\n</script>",
          )
        False -> Error(Nil)
      }
    })
    |> string.join("\n")

  let with_css = case css {
    "" -> html
    _ ->
      case string.contains(html, "</head>") {
        True -> string.replace(html, "</head>", css <> "\n</head>")
        False -> css <> "\n" <> html
      }
  }

  case js {
    "" -> with_css
    _ ->
      case string.contains(with_css, "</body>") {
        True -> string.replace(with_css, "</body>", js <> "\n</body>")
        False -> with_css <> "\n" <> js
      }
  }
}

/// Extract a zip archive into a self-contained `ResolvedPlugin`.
pub fn extract_zip_bundle(
  bytes: BitArray,
  fallback_id: String,
) -> Result(ResolvedPlugin, ResolveError) {
  case zip.unzip(bytes) {
    Error(err) -> Error(NoExecutableContent("ZIP extraction failed: " <> err))
    Ok(entries) -> {
      let valid_entries =
        entries
        |> list.filter(fn(e) { is_bundle_file(e.0) })
        |> strip_shared_prefix

      case valid_entries {
        [] -> Error(NoExecutableContent("ZIP archive contains no files"))
        _ -> {
          let file_map = dict.from_list(valid_entries)
          let paths = dict.keys(file_map)

          use entry_path <- result.try(pick_entry_file(paths))
          case dict.get(file_map, entry_path) {
            Error(_) -> Error(NoExecutableContent("Entry file not found"))
            Ok(entry_bytes) -> {
              let base_html = case
                string.ends_with(entry_path, ".js")
                || string.ends_with(entry_path, ".mjs")
              {
                True -> {
                  let js_text = case bit_array.to_string(entry_bytes) {
                    Ok(s) -> s
                    Error(_) -> ""
                  }
                  "<!DOCTYPE html>\n<html><head></head><body><div id=\"app\"></div><script type=\"module\">\n"
                  <> js_text
                  <> "\n</script></body></html>"
                }
                False ->
                  case bit_array.to_string(entry_bytes) {
                    Ok(s) -> s
                    Error(_) -> ""
                  }
              }

              let manifest_candidates = [
                "manifest.webmanifest",
                "manifest.json",
                "omni.manifest.json",
                "package.json",
              ]
              let manifest_json =
                list.find_map(manifest_candidates, fn(m) {
                  case dict.get(file_map, m) {
                    Ok(b) ->
                      case bit_array.to_string(b) {
                        Ok(s) -> Ok(s)
                        Error(_) -> Error(Nil)
                      }
                    Error(_) -> Error(Nil)
                  }
                })

              let decoded_manifest = case manifest_json {
                Ok(json_str) ->
                  case manifest.decode_web_manifest(json_str) {
                    Ok(m) -> Some(m)
                    Error(_) -> None
                  }
                Error(_) -> None
              }

              let name = case decoded_manifest {
                Some(m) ->
                  case m.name {
                    Some(n) if n != "" -> n
                    _ ->
                      case m.short_name {
                        Some(sn) if sn != "" -> sn
                        _ ->
                          detect_html_title(base_html)
                          |> option.unwrap(fallback_id)
                      }
                  }
                None ->
                  detect_html_title(base_html) |> option.unwrap(fallback_id)
              }

              let description = case decoded_manifest {
                Some(m) -> option.unwrap(m.description, "")
                None -> ""
              }

              let icon = detect_html_icon(base_html)

              let companion_assets =
                valid_entries
                |> list.filter_map(fn(e) {
                  let #(path, contents) = e
                  case
                    path != entry_path
                    && {
                      string.ends_with(path, ".css")
                      || string.ends_with(path, ".js")
                    }
                  {
                    True ->
                      case bit_array.to_string(contents) {
                        Ok(str) -> Ok(#(path, str))
                        Error(_) -> Error(Nil)
                      }
                    False -> Error(Nil)
                  }
                })

              let bundled_html = inline_assets(base_html, companion_assets)

              let views = case decoded_manifest {
                Some(m) if m.shortcuts != [] ->
                  list.map(m.shortcuts, manifest.shortcut_to_view)
                _ -> [
                  manifest.PluginViewDeclaration(
                    "default",
                    "Default",
                    "/",
                    manifest.Auto,
                  ),
                ]
              }

              Ok(
                ResolvedPlugin(
                  id: fallback_id,
                  name: name,
                  display_name: Some(name),
                  version: "1.0.0",
                  description: description,
                  icon: icon,
                  entry: entry_path,
                  content: bundled_html,
                  source_url: None,
                  naddr: None,
                  author_pubkey: None,
                  author_npub: None,
                  relays: [],
                  views: views,
                  handled_intents: [],
                  blossom_hashes: dict.new(),
                  blossom_servers: [],
                ),
              )
            }
          }
        }
      }
    }
  }
}

/// Strategy for resolving zip targets using a byte fetcher.
pub fn zip_strategy(
  fetch_bytes: fn(String) -> Result(BitArray, ResolveError),
) -> ResolverStrategy {
  fn(target: ResolveTarget) {
    case target {
      ZipUrlTarget(url) ->
        case fetch_bytes(url) {
          Ok(bytes) -> extract_zip_bundle(bytes, url)
          Error(err) -> Error(err)
        }
      ZipBytesTarget(bytes) -> extract_zip_bundle(bytes, "zip-plugin")
      UrlTarget(url) ->
        case is_zip_url(url) {
          True ->
            case fetch_bytes(url) {
              Ok(bytes) -> extract_zip_bundle(bytes, url)
              Error(err) -> Error(err)
            }
          False -> Error(StrategyExhausted)
        }
      _ -> Error(StrategyExhausted)
    }
  }
}
