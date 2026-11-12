//// Blossom Media Protocol contracts and BUD-06 authentication helpers.
////
//// Specifies Blossom BUD auth events (Kind 24242), user server lists (Kind 10063),
//// and install-time asset MIME type detection.

import gleam/bit_array
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{type Event, type UnsignedEvent, UnsignedEvent}
import omni/nostr/event_codec
import omni/nostr/kind.{type Kind}

/// Blossom BUD-06 authorization event kind (24242).
pub const auth_kind_int = 24_242

/// NIP-5A nsite application manifest kind (35129).
pub const nsite_manifest_kind_int = 35_129

/// A blob to upload to one or more Blossom servers.
pub type BlobUpload {
  BlobUpload(
    servers: List(String),
    path: String,
    mime: String,
    sha256: String,
    body: BitArray,
  )
}

/// A blob accepted by a Blossom server.
pub type UploadedBlob {
  UploadedBlob(server: String, path: String, sha256: String, url: String)
}

/// Blossom user server list event kind (10063).
pub const server_list_kind_int = 10_063

/// Typed `Kind` for Blossom BUD-06 authorization events.
pub fn auth_kind() -> Kind {
  kind.from_int(auth_kind_int)
}

/// Typed `Kind` for Blossom user server list events.
pub fn server_list_kind() -> Kind {
  kind.from_int(server_list_kind_int)
}

/// Permitted actions in a BUD-06 authorization header.
pub type AuthAction {
  Upload
  Get
  ListBlobs
  Delete
}

/// Convert an `AuthAction` into its wire string code.
pub fn action_to_string(action: AuthAction) -> String {
  case action {
    Upload -> "upload"
    Get -> "get"
    ListBlobs -> "list"
    Delete -> "delete"
  }
}

/// Parse an `AuthAction` from a string.
pub fn action_from_string(str: String) -> Result(AuthAction, Nil) {
  case string.lowercase(str) {
    "upload" -> Ok(Upload)
    "get" -> Ok(Get)
    "list" -> Ok(ListBlobs)
    "delete" -> Ok(Delete)
    _ -> Error(Nil)
  }
}

/// Strip trailing slashes from a Blossom server URL.
pub fn normalize_server(server: String) -> String {
  server
  |> string.trim
  |> strip_trailing_slashes
}

fn strip_trailing_slashes(url: String) -> String {
  case string.ends_with(url, "/") {
    True -> strip_trailing_slashes(string.drop_end(url, 1))
    False -> url
  }
}

/// Blossom upload endpoint for `server`.
pub fn upload_url(server: String) -> String {
  normalize_server(server) <> "/upload"
}

/// Public blob URL for `sha256` on `server`.
pub fn blob_url(server: String, sha256: String) -> String {
  normalize_server(server) <> "/" <> string.lowercase(sha256)
}

/// Encode a signed BUD-06 event as a Blossom `Authorization` header value.
pub fn encode_auth_header(signed: Event) -> String {
  let encoded =
    event_codec.to_json(signed)
    |> json.to_string
    |> bit_array.from_string
    |> bit_array.base64_encode(True)
  "Nostr " <> encoded
}

/// Construct an unsigned draft for a Blossom BUD-06 authorization event (`kind: 24242`).
pub fn create_auth_event_draft(
  sha256_hash: String,
  file_name: Option(String),
  action: AuthAction,
  expiration_seconds: Int,
  now_seconds: Int,
) -> UnsignedEvent {
  let act_str = action_to_string(action)
  let content = case file_name {
    Some(name) -> act_str <> " " <> name
    None -> act_str <> " " <> sha256_hash
  }

  let tags = [
    ["t", act_str],
    ["x", string.lowercase(sha256_hash)],
    ["expiration", int.to_string(now_seconds + expiration_seconds)],
  ]

  UnsignedEvent(
    pubkey: None,
    created_at: now_seconds,
    kind: auth_kind(),
    tags: tags,
    content: content,
  )
}

/// Construct an unsigned draft for a Blossom user server list (`kind: 10063`).
pub fn create_server_list_draft(
  servers: List(String),
  now_seconds: Int,
) -> UnsignedEvent {
  let tags = list.map(servers, fn(s) { ["server", s] })

  UnsignedEvent(
    pubkey: None,
    created_at: now_seconds,
    kind: server_list_kind(),
    tags: tags,
    content: "",
  )
}

/// Extract Blossom server URLs from a Kind 10063 event.
pub fn parse_server_list(event: Event) -> List(String) {
  let server_tags = event.get_tag_values(event.tags, "server")
  case server_tags {
    [] -> event.get_tag_values(event.tags, "r")
    servers -> servers
  }
}

// -----------------------------------------------------------------------------
// MIME Type Detection
// -----------------------------------------------------------------------------

/// Detected MIME type descriptor.
pub type MimeType {
  MimeType(mime: String, is_text: Bool)
}

/// Detect the MIME type of a file based on its extension.
pub fn detect_mime_type(file_path: String) -> MimeType {
  let lower = string.lowercase(file_path)
  case get_extension(lower) {
    ".html" | ".htm" -> MimeType("text/html", True)
    ".js" | ".mjs" | ".cjs" -> MimeType("application/javascript", True)
    ".css" -> MimeType("text/css", True)
    ".json" -> MimeType("application/json", True)
    ".webmanifest" -> MimeType("application/manifest+json", True)
    ".svg" -> MimeType("image/svg+xml", True)
    ".txt" -> MimeType("text/plain", True)
    ".md" -> MimeType("text/markdown", True)
    ".png" -> MimeType("image/png", False)
    ".jpg" | ".jpeg" -> MimeType("image/jpeg", False)
    ".gif" -> MimeType("image/gif", False)
    ".webp" -> MimeType("image/webp", False)
    ".ico" -> MimeType("image/x-icon", False)
    ".woff" -> MimeType("font/woff", False)
    ".woff2" -> MimeType("font/woff2", False)
    ".ttf" -> MimeType("font/ttf", False)
    ".wasm" -> MimeType("application/wasm", False)
    _ -> MimeType("application/octet-stream", False)
  }
}

fn get_extension(path: String) -> String {
  case string.split(path, ".") {
    [_, ..rest] ->
      case list.last(rest) {
        Ok(ext) -> "." <> ext
        Error(Nil) -> ""
      }
    _ -> ""
  }
}
