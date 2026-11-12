//// Host hand-off payload for a NIP-57 zap invoice request.
////
//// The plugin resolved a Lightning address/`lnurl` and built the unsigned Kind
//// 9734 zap request. It is the host's job to sign and broadcast that request,
//// call the LNURL pay callback with it, and dispatch the resulting invoice
//// (or error) back into the plugin.

import omni/nostr/event.{type UnsignedEvent}

/// A request for the host to obtain a Lightning invoice for a zap.
pub type ZapInvoice {
  ZapInvoice(
    /// Unsigned Kind 9734 zap request to sign and broadcast.
    event: UnsignedEvent,
    /// Bech32 `lnurl` for the recipient's LNURL-pay endpoint.
    lnurl: String,
    /// Amount in millisatoshis (already validated by the plugin).
    amount_msats: Int,
    /// Optional zap comment, trimmed of surrounding whitespace.
    comment: String,
  )
}
