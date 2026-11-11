//// Opaque 32-byte Nostr public key.
////
//// Always represented internally as a canonical 64-character lowercase hex string.

import gleam/bit_array
import gleam/string

/// An opaque 32-byte Nostr public key.
pub opaque type Pubkey {
  Pubkey(hex: String)
}

/// Parse and validate a 64-character hexadecimal public key.
///
/// Leading and trailing whitespace is stripped, and uppercase hex digits
/// are normalized to lowercase.
pub fn parse(raw: String) -> Result(Pubkey, Nil) {
  let hex = string.lowercase(string.trim(raw))
  case string.length(hex) == 64 {
    True ->
      case bit_array.base16_decode(hex) {
        Ok(_) -> Ok(Pubkey(hex))
        Error(Nil) -> Error(Nil)
      }
    False -> Error(Nil)
  }
}

/// Return the canonical 64-character lowercase hexadecimal representation.
pub fn to_hex(pubkey: Pubkey) -> String {
  let Pubkey(hex) = pubkey
  hex
}

/// Return the canonical 64-character lowercase hexadecimal representation.
pub fn to_string(pubkey: Pubkey) -> String {
  to_hex(pubkey)
}

/// Construct a `Pubkey` from raw 32-byte bits.
pub fn from_bytes(bytes: BitArray) -> Result(Pubkey, Nil) {
  case bit_array.byte_size(bytes) == 32 {
    True -> Ok(Pubkey(string.lowercase(bit_array.base16_encode(bytes))))
    False -> Error(Nil)
  }
}

/// Extract the raw 32 bytes of the public key.
pub fn to_bytes(pubkey: Pubkey) -> BitArray {
  let Pubkey(hex) = pubkey
  let assert Ok(bytes) = bit_array.base16_decode(hex)
  bytes
}
