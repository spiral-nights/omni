//// Guest-side bridge for Omni sandboxes.
////
//// Ports the legacy `packages/core/src/sandbox/omni-runtime.js` shims one by one
//// into typed Gleam modules with a thin FFI install layer. The guest keeps using
//// only standard web APIs (`window.nostr`, `window.WebSocket`, `localStorage`,
//// `navigator.share`, protocol links); this package only makes those APIs route
//// through the host kernel.

/// Bridge protocol version advertised to the host.
pub const bridge_version = "1.0.0"

/// Message type for guest-to-host bridge notifications.
pub const bridge_message_type = "omni:bridge"
