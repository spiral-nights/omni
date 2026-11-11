//// Opaque 32-byte Nostr event ID.
////
//// Always represented internally as a canonical 64-character lowercase hex string.

import gleam/bit_array
import gleam/string

/// An opaque 32-byte Nostr event ID.
pub opaque type EventId {
  EventId(hex: String)
}

/// Parse and validate a 64-character hexadecimal event ID.
///
/// Leading and trailing whitespace is stripped, and uppercase hex digits
/// are normalized to lowercase.
pub fn parse(raw: String) -> Result(EventId, Nil) {
  let hex = string.lowercase(string.trim(raw))
  case string.length(hex) == 64 {
    True ->
      case bit_array.base16_decode(hex) {
        Ok(_) -> Ok(EventId(hex))
        Error(Nil) -> Error(Nil)
      }
    False -> Error(Nil)
  }
}

/// Return the canonical 64-character lowercase hexadecimal representation.
pub fn to_hex(id: EventId) -> String {
  let EventId(hex) = id
  hex
}

/// Return the canonical 64-character lowercase hexadecimal representation.
pub fn to_string(id: EventId) -> String {
  to_hex(id)
}

/// Construct an `EventId` from raw 32-byte bits.
pub fn from_bytes(bytes: BitArray) -> Result(EventId, Nil) {
  case bit_array.byte_size(bytes) == 32 {
    True -> Ok(EventId(string.lowercase(bit_array.base16_encode(bytes))))
    False -> Error(Nil)
  }
}

/// Extract the raw 32 bytes of the event ID.
pub fn to_bytes(id: EventId) -> BitArray {
  let EventId(hex) = id
  let assert Ok(bytes) = bit_array.base16_decode(hex)
  bytes
}
