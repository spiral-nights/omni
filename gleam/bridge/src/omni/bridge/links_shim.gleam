//// Protocol link and intent shim for guest sandboxes.
////
//// Classifies `nostr:`, `lightning:`, `cashu:` and external URLs and builds the
//// standard intent message the host broker consumes.

import gleam/json
import gleam/string

/// Classification of an intercepted link.
pub type LinkKind {
  NostrLink
  LightningLink
  CashuLink
  WebLink
  ExternalLink
}

/// Intent action the host should dispatch for this link kind.
pub fn intent_for(kind: LinkKind) -> String {
  case kind {
    NostrLink -> "open_nostr_uri"
    LightningLink -> "pay_lightning_invoice"
    CashuLink -> "open_cashu_token"
    WebLink -> "open_web_url"
    ExternalLink -> "open_external_url"
  }
}

/// Classify a raw URL by scheme.
pub fn classify(url: String) -> LinkKind {
  case string.lowercase(string.trim(url)) {
    "nostr:" <> _ -> NostrLink
    "lightning:" <> _ -> LightningLink
    "cashu:" <> _ -> CashuLink
    "http://" <> _ | "https://" <> _ -> WebLink
    _ -> ExternalLink
  }
}

/// Build the JSON message the host intent broker receives for an intercepted link.
pub fn link_message(url: String) -> String {
  let kind = classify(url)
  json.object([
    #("type", json.string("omni:open-intent")),
    #("action", json.string(intent_for(kind))),
    #("url", json.string(string.trim(url))),
  ])
  |> json.to_string
}

/// Intercept clicks on protocol links and `window.open`, forwarding them to `post`.
@external(javascript, "./links_shim.ffi.mjs", "install")
pub fn install(post: fn(String) -> Nil) -> Nil
