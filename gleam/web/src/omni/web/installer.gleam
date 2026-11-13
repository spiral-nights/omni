//// Nsite bundle installation: resolve URLs, naddr coordinates, and Blossom
//// manifests into a mountable installed-app entry.

import gleam/dict
import gleam/int
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/kernel/kernel.{type OmniKernel}
import omni/kernel/nostr/coordinator
import omni/kernel/plugins/resolver
import omni/nostr/filter
import omni/nostr/kind.{type Kind, from_int}
import omni/nostr/nip89
import omni/nostr/pubkey
import omni/platform/http
import omni/platform/promise_ext
import omni/platform/webcrypto
import omni/protocol/rpc/method.{FetchOptions}
import omni/shell/model.{type InstalledApp, InstalledApp, ViewOption}
import omni/web/nip89 as discovery

/// A fetched bundle ready to be mounted in a sandbox.
pub type InstalledBundle {
  InstalledBundle(app: InstalledApp, content: String)
}

/// Injectable text fetcher (HTTP or Blossom); production uses `http.fetch_text`.
pub type Fetcher =
  fn(String) -> Promise(Result(String, String))

/// Fetch `url` as a self-contained nsite document and describe it.
pub fn resolve_url(
  url: String,
  plugin_id: String,
) -> Promise(Result(InstalledBundle, String)) {
  resolve_url_with(url, plugin_id, http.fetch_text)
}

/// Fetch `url` using an injected fetcher (used by tests).
pub fn resolve_url_with(
  url: String,
  plugin_id: String,
  fetch: Fetcher,
) -> Promise(Result(InstalledBundle, String)) {
  use result <- promise.await(fetch(url))
  promise.resolve(case result {
    Error(err) -> Error(err)
    Ok(content) ->
      Ok(InstalledBundle(
        app: app_from_content(url, plugin_id, content),
        content: content,
      ))
  })
}

/// Resolve any supported install target (`https://...`, `naddr1...`, or
/// `kind:pubkey:d`) into an installable bundle.
pub fn resolve(
  kernel: OmniKernel,
  raw: String,
  plugin_id: String,
) -> Promise(Result(InstalledBundle, String)) {
  resolve_with(kernel, raw, plugin_id, http.fetch_text)
}

/// Resolve an install target using an injected fetcher (used by tests).
pub fn resolve_with(
  kernel: OmniKernel,
  raw: String,
  plugin_id: String,
  fetch: Fetcher,
) -> Promise(Result(InstalledBundle, String)) {
  case resolver.parse_target(raw) {
    Error(err) -> promise.resolve(Error(resolve_error(err)))
    Ok(resolver.UrlTarget(url)) -> resolve_url_with(url, plugin_id, fetch)
    Ok(resolver.NaddrTarget(_naddr, addr)) ->
      resolve_nostr(
        kernel,
        raw,
        plugin_id,
        addr.kind,
        pubkey.to_hex(addr.pubkey),
        addr.identifier,
        fetch,
      )
    Ok(resolver.CoordinateTarget(kind, pubkey_hex, identifier)) ->
      resolve_nostr(
        kernel,
        raw,
        plugin_id,
        from_int(kind),
        pubkey_hex,
        identifier,
        fetch,
      )
    Ok(resolver.EventTarget(event)) ->
      bundle_from_resolved(
        raw,
        plugin_id,
        resolver.resolve_event(event, None),
        resolver.default_blossom_servers,
        fetch,
      )
  }
}

fn resolve_nostr(
  kernel: OmniKernel,
  raw: String,
  plugin_id: String,
  kind: Kind,
  pubkey_hex: String,
  identifier: String,
  fetch: Fetcher,
) -> Promise(Result(InstalledBundle, String)) {
  let event_filter =
    filter.new()
    |> filter.with_kinds([kind])
    |> filter.with_authors([pubkey_hex])
    |> filter.with_tag("d", [identifier])
    |> filter.with_limit(1)

  // Local-first: resolve instantly from the 0ms store, then fall back to the
  // relay pool when the manifest has not been cached yet.
  use cached_events <- promise.await(coordinator.fetch(
    kernel.coordinator,
    "installer_fetch",
    [event_filter],
    Some(FetchOptions(
      timeout_ms: Some(250),
      relays: None,
      local_only: Some(True),
    )),
  ))

  use events <- promise.await(case cached_events {
    [] ->
      coordinator.fetch(
        kernel.coordinator,
        "installer_fetch",
        [event_filter],
        Some(FetchOptions(
          timeout_ms: Some(2000),
          relays: None,
          local_only: None,
        )),
      )
    events -> promise.resolve(events)
  })

  case list.sort(events, fn(a, b) { int.compare(b.created_at, a.created_at) }) {
    [event, ..] ->
      case resolver.verify_event_signature(event) {
        False ->
          promise.resolve(
            Error(
              resolve_error(resolver.InvalidSignature(
                "manifest signature does not verify",
              )),
            ),
          )
        True ->
          bundle_from_resolved(
            raw,
            plugin_id,
            resolver.resolve_event(event, Some(raw)),
            resolver.default_blossom_servers,
            fetch,
          )
      }
    [] -> promise.resolve(Error("Event not found: " <> raw))
  }
}

fn bundle_from_resolved(
  raw: String,
  plugin_id: String,
  resolved: Result(resolver.ResolvedPlugin, resolver.ResolveError),
  servers: List(String),
  fetch: Fetcher,
) -> Promise(Result(InstalledBundle, String)) {
  case resolved {
    Error(err) -> promise.resolve(Error(resolve_error(err)))
    Ok(plugin) -> {
      let app = app_from_resolved(raw, plugin_id, plugin)
      case string.trim(plugin.content) {
        "" ->
          case dict.size(plugin.blossom_hashes) > 0 {
            True -> {
              use result <- promise.await(fetch_manifest(plugin, servers, fetch))
              promise.resolve(case result {
                Ok(content) -> Ok(InstalledBundle(app: app, content: content))
                Error(err) -> Error(err)
              })
            }
            False -> promise.resolve(Error("No executable content in " <> raw))
          }
        content ->
          promise.resolve(Ok(InstalledBundle(app: app, content: content)))
      }
    }
  }
}

fn fetch_manifest(
  plugin: resolver.ResolvedPlugin,
  fallback_servers: List(String),
  fetch: Fetcher,
) -> Promise(Result(String, String)) {
  let servers = case plugin.blossom_servers {
    [] -> fallback_servers
    list -> list
  }

  let fetches =
    plugin.blossom_hashes
    |> dict.to_list
    |> list.map(fn(entry) {
      let #(name, hash) = entry
      use result <- promise.map(fetch_blob(servers, hash, fetch))
      case result {
        Ok(content) -> #(name, content)
        Error(_) -> #(name, "")
      }
    })

  use assets <- promise.map(promise_ext.all(fetches))
  let fetched = list.filter(assets, fn(asset) { asset.1 != "" })
  let by_name = dict.from_list(fetched)

  case dict.get(by_name, "index.html") {
    Ok(html) -> Ok(inline_manifest_assets(html, fetched))
    Error(Nil) ->
      case dict.get(by_name, "index.js") {
        Ok(js) ->
          Ok(
            inline_manifest_assets(
              "<!DOCTYPE html>\n<html><head></head><body><div id=\"app\"></div></body></html>",
              [#("index.js", js)],
            ),
          )
        Error(Nil) -> Error("Blossom manifest has no index.html or index.js")
      }
  }
}

fn fetch_blob(
  servers: List(String),
  hash: String,
  fetch: Fetcher,
) -> Promise(Result(String, String)) {
  case servers {
    [] -> promise.resolve(Error("No Blossom server available for " <> hash))
    [server, ..rest] -> {
      let base = case string.ends_with(server, "/") {
        True -> string.drop_end(server, 1)
        False -> server
      }
      let blob_hash = case string.starts_with(hash, "/") {
        True -> string.drop_start(hash, 1)
        False -> hash
      }
      let url = base <> "/" <> blob_hash
      use result <- promise.await(fetch(url))
      case result {
        Ok(content) -> {
          let actual = webcrypto.sha256_hex(content)
          case string.lowercase(actual) == string.lowercase(blob_hash) {
            True -> promise.resolve(Ok(content))
            False -> fetch_blob(rest, hash, fetch)
          }
        }
        Error(_) -> fetch_blob(rest, hash, fetch)
      }
    }
  }
}

/// Inline fetched Blossom CSS and JS assets into the HTML document. The strict
/// sandbox CSP blocks external script/style origins, so assets must ship inline.
pub fn inline_manifest_assets(
  html: String,
  assets: List(#(String, String)),
) -> String {
  let css =
    list.filter_map(assets, fn(asset) {
      case asset {
        #(name, content) ->
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
      }
    })
    |> string.join("\n")

  let js =
    list.filter_map(assets, fn(asset) {
      case asset {
        #(name, content) ->
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
      }
    })
    |> string.join("\n")

  let with_css = case css {
    "" -> html
    _ -> insert_before(html, "</head>", css)
  }

  case js {
    "" -> with_css
    _ -> insert_before(with_css, "</body>", js)
  }
}

fn insert_before(
  haystack: String,
  needle: String,
  insertion: String,
) -> String {
  case string.contains(haystack, needle) {
    True ->
      case string.split_once(haystack, needle) {
        Ok(#(before, after)) -> before <> insertion <> "\n" <> needle <> after
        Error(Nil) -> haystack <> insertion
      }
    False -> haystack <> insertion
  }
}

fn resolve_error(err: resolver.ResolveError) -> String {
  case err {
    resolver.TargetParseError(reason) -> reason
    resolver.EventNotFound(reason) -> "Event not found: " <> reason
    resolver.InvalidSignature(reason) -> "Invalid signature: " <> reason
    resolver.MissingManifest(reason) -> "Missing manifest: " <> reason
    resolver.NoExecutableContent(reason) -> "No executable content: " <> reason
    resolver.BlossomFetchFailed(hash, reason) ->
      "Blossom fetch failed for " <> hash <> ": " <> reason
    resolver.HttpFetchFailed(url, reason) ->
      "HTTP fetch failed for " <> url <> ": " <> reason
    resolver.StrategyExhausted -> "No resolver strategy succeeded"
  }
}

/// Build the installed-app descriptor for a fetched URL bundle.
pub fn app_from(url: String, plugin_id: String) -> InstalledApp {
  app_from_content(url, plugin_id, "")
}

/// Build the descriptor, preferring an HTML `<title>` and icon link when present.
pub fn app_from_content(
  url: String,
  plugin_id: String,
  content: String,
) -> InstalledApp {
  let fallback_name = case string.split(url, "/") |> list.reverse {
    [last, ..] if last != "" -> last
    _ -> "Custom Nsite"
  }
  let name = case detect_html_title(content) {
    Some(title) -> title
    None -> fallback_name
  }
  let icon = case detect_html_icon(content) {
    Some(icon) -> icon
    None -> "apps"
  }
  InstalledApp(
    id: plugin_id,
    name: name,
    display_name: Some(name),
    description: "Installed from " <> url,
    icon: icon,
    enabled: True,
    pinned: True,
    views: [
      ViewOption(id: "default", title: "Default", path: "/", format: "html"),
    ],
    placements: [],
    handled_intents: [],
    disabled_intents: [],
    relays: None,
    source_url: url,
    version: Some("1.0.0"),
  )
}

/// Build the installed-app descriptor from a resolved NIP-5A plugin, keeping
/// the original install target in `source_url` so the app can be re-resolved.
pub fn app_from_resolved(
  raw: String,
  plugin_id: String,
  plugin: resolver.ResolvedPlugin,
) -> InstalledApp {
  let html_content = plugin.content
  let name = case plugin.name {
    "" ->
      case detect_html_title(html_content) {
        Some(title) -> title
        None -> plugin.id
      }
    value -> value
  }
  let detected_icon = case plugin.icon {
    Some(icon) if icon != "" -> Some(icon)
    _ -> detect_html_icon(html_content)
  }
  InstalledApp(
    id: plugin_id,
    name: name,
    display_name: plugin.display_name,
    description: plugin.description,
    icon: case detected_icon {
      Some(icon) if icon != "" -> icon
      _ -> "apps"
    },
    enabled: True,
    pinned: True,
    views: [
      ViewOption(id: "default", title: "Default", path: "/", format: "html"),
    ],
    placements: [],
    handled_intents: plugin.handled_intents,
    disabled_intents: [],
    relays: None,
    source_url: raw,
    version: Some(plugin.version),
  )
}

/// Extract the `<title>` text from an HTML document, if present.
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

/// Extract a `<link rel="icon">` / `apple-touch-icon` href from an HTML document.
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

/// Discover a NIP-89 handler for `handled_kind` and install its web app.
pub fn resolve_discovered_handler(
  kernel: OmniKernel,
  handled_kind: Int,
  plugin_id: String,
) -> Promise(Result(InstalledBundle, String)) {
  resolve_discovered_handler_with(
    kernel,
    handled_kind,
    plugin_id,
    http.fetch_text,
  )
}

/// Discover and install a NIP-89 handler using an injected fetcher.
pub fn resolve_discovered_handler_with(
  kernel: OmniKernel,
  handled_kind: Int,
  plugin_id: String,
  fetch: Fetcher,
) -> Promise(Result(InstalledBundle, String)) {
  use handlers <- promise.await(discovery.discover_handlers(
    kernel,
    handled_kind,
  ))
  let web_urls =
    handlers
    |> list.filter_map(fn(handler: nip89.HandlerInfo) {
      case handler.web {
        Some(url) -> Ok(url)
        None -> Error(Nil)
      }
    })
    |> list.filter(fn(url) {
      string.starts_with(url, "https://") || string.starts_with(url, "http://")
    })
  case web_urls {
    [] -> promise.resolve(Error("No NIP-89 handler with a web URL found"))
    [url, ..] -> resolve_url_with(url, plugin_id, fetch)
  }
}
