//// Domain model and NIP-5A nsite tag helpers for `plugin_publisher`.

import gleam/dynamic/decode.{type Decoder}
import gleam/json.{type Json}
import gleam/list
import gleam/option.{type Option, None}
import gleam/string
import omni/plugin_kit/local_store.{type StoreConfig, StoreConfig}
import plugin/publisher/bundle.{type Bundle, type BundleFile}

/// Active tab or viewport mode in Plugin Studio.
pub type StudioTab {
  TabStudio
  TabPublished
  TabServers
  TabWidget
}

/// Metadata record for a published NIP-5A nsite package.
pub type PublishedPlugin {
  PublishedPlugin(
    id: String,
    name: String,
    version: String,
    description: String,
    icon: String,
    blossom_sha256: String,
    blossom_url: String,
    naddr: String,
    published_at: Int,
  )
}

/// Configured Blossom media server endpoint (BUD-01 / Kind 10063).
pub type BlossomServer {
  BlossomServer(url: String, enabled: Bool, status: String)
}

/// Editable draft state in Plugin Studio.
pub type PublishDraft {
  PublishDraft(
    id: String,
    name: String,
    version: String,
    description: String,
    icon: String,
    entry_html: String,
    bundle_sha256: String,
    bundle_size_bytes: Int,
  )
}

/// Complete state model for `plugin_publisher`.
pub type Model {
  Model(
    active_tab: StudioTab,
    draft: PublishDraft,
    published: List(PublishedPlugin),
    servers: List(BlossomServer),
    draft_server_url: String,
    status_message: Option(String),
    error_message: Option(String),
    publishing: Bool,
    bundle: Option(Bundle),
    bundle_url: String,
    user_pubkey: Option(String),
  )
}

/// Default Blossom server endpoints.
pub fn default_blossom_servers() -> List(BlossomServer) {
  [
    BlossomServer(
      url: "https://cdn.satellite.earth",
      enabled: True,
      status: "Ready",
    ),
    BlossomServer(
      url: "https://blossom.primal.net",
      enabled: True,
      status: "Ready",
    ),
    BlossomServer(url: "https://nostr.download", enabled: True, status: "Ready"),
  ]
}

/// Default initial `PublishDraft` for the studio form.
pub fn default_draft() -> PublishDraft {
  PublishDraft(
    id: "example.nsite.app",
    name: "Example Nsite App",
    version: "1.0.0",
    description: "Standalone Nostr web application packaged as a NIP-5A nsite.",
    icon: "globe",
    entry_html: "index.html",
    bundle_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    bundle_size_bytes: 2048,
  )
}

/// Initializes a new `Model` for the given `StudioTab`.
pub fn init(initial_tab: StudioTab) -> Model {
  Model(
    active_tab: initial_tab,
    draft: default_draft(),
    published: [],
    servers: default_blossom_servers(),
    draft_server_url: "",
    status_message: None,
    error_message: None,
    publishing: False,
    bundle: None,
    bundle_url: "",
    user_pubkey: None,
  )
}

/// Builds NIP-5A (`kind: 35129`) event tags for a bundle and server list.
pub fn build_nip5a_tags(
  draft: PublishDraft,
  files: List(BundleFile),
  servers: List(String),
) -> List(List(String)) {
  let clean_id = string.trim(draft.id)
  let clean_name = string.trim(draft.name)
  let clean_ver = case string.trim(draft.version) {
    "" -> "1.0.0"
    v -> v
  }
  let clean_desc = string.trim(draft.description)
  let clean_icon = case string.trim(draft.icon) {
    "" -> "globe"
    ic -> ic
  }
  let clean_hash = string.lowercase(string.trim(draft.bundle_sha256))

  let base_tags = [
    ["d", clean_id],
    ["name", clean_name],
    ["version", clean_ver],
    ["description", clean_desc],
    ["icon", clean_icon],
    ["view", "main", clean_name, ""],
    ["view", "widget", clean_name <> " Widget", "?view=widget"],
    ["view", "settings", clean_name <> " Settings", "?view=settings"],
    ["x", clean_hash],
  ]

  let file_tags =
    list.map(files, fn(file) { ["f", file.path, file.sha256, file.mime] })

  let server_tags = list.map(servers, fn(server) { ["server", server] })

  list.flatten([base_tags, file_tags, server_tags])
}

// -----------------------------------------------------------------------------
// Local persistence
// -----------------------------------------------------------------------------

fn encode_published(p: PublishedPlugin) -> Json {
  json.object([
    #("id", json.string(p.id)),
    #("name", json.string(p.name)),
    #("version", json.string(p.version)),
    #("description", json.string(p.description)),
    #("icon", json.string(p.icon)),
    #("blossom_sha256", json.string(p.blossom_sha256)),
    #("blossom_url", json.string(p.blossom_url)),
    #("naddr", json.string(p.naddr)),
    #("published_at", json.int(p.published_at)),
  ])
}

fn published_decoder() -> Decoder(PublishedPlugin) {
  use id <- decode.field("id", decode.string)
  use name <- decode.field("name", decode.string)
  use version <- decode.optional_field("version", "1.0.0", decode.string)
  use description <- decode.optional_field("description", "", decode.string)
  use icon <- decode.optional_field("icon", "apps", decode.string)
  use sha <- decode.optional_field("blossom_sha256", "", decode.string)
  use url <- decode.optional_field("blossom_url", "", decode.string)
  use naddr <- decode.optional_field("naddr", "", decode.string)
  use published_at <- decode.optional_field("published_at", 0, decode.int)
  decode.success(PublishedPlugin(
    id: id,
    name: name,
    version: version,
    description: description,
    icon: icon,
    blossom_sha256: sha,
    blossom_url: url,
    naddr: naddr,
    published_at: published_at,
  ))
}

fn encode_server(server: BlossomServer) -> Json {
  json.object([
    #("url", json.string(server.url)),
    #("enabled", json.bool(server.enabled)),
    #("status", json.string(server.status)),
  ])
}

fn server_decoder() -> Decoder(BlossomServer) {
  use url <- decode.field("url", decode.string)
  use enabled <- decode.optional_field("enabled", True, decode.bool)
  use status <- decode.optional_field("status", "Ready", decode.string)
  decode.success(BlossomServer(url: url, enabled: enabled, status: status))
}

/// Persisted list of published plugins.
pub fn published_store_config() -> StoreConfig(List(PublishedPlugin)) {
  StoreConfig(
    key: "omni:publisher:published",
    version: 1,
    encode: fn(items) { json.array(items, of: encode_published) },
    decoder: decode.list(published_decoder()),
    default: fn() { [] },
  )
}

/// Persisted Blossom server list.
pub fn servers_store_config() -> StoreConfig(List(BlossomServer)) {
  StoreConfig(
    key: "omni:publisher:servers",
    version: 1,
    encode: fn(items) { json.array(items, of: encode_server) },
    decoder: decode.list(server_decoder()),
    default: default_blossom_servers,
  )
}
