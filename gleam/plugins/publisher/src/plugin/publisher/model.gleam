//// Domain model and NIP-5A nsite tag helpers for `plugin_publisher`.

import gleam/list
import gleam/option.{type Option, None}
import gleam/string
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
