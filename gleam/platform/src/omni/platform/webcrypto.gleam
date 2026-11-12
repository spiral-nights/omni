//// Cryptographic operations backed by browser / node WebCrypto and `@noble/hashes`.
////
//// Provides synchronous SHA-256 calculation over `BitArray` or `String`,
//// cryptographically secure random bytes generation, and typed wrappers.

/// An opaque wrapper around cryptographically secure random bytes.
pub opaque type RandomBytes {
  RandomBytes(bytes: BitArray)
}

/// Wraps an existing `BitArray` into the opaque `RandomBytes` container.
pub fn from_bit_array(bytes: BitArray) -> RandomBytes {
  RandomBytes(bytes)
}

/// Extracts the underlying `BitArray` from a `RandomBytes` value.
pub fn to_bit_array(random: RandomBytes) -> BitArray {
  random.bytes
}

/// Generates `count` cryptographically secure pseudorandom bytes.
@external(javascript, "./webcrypto.ffi.mjs", "random_bytes")
pub fn random_bytes(count: Int) -> BitArray

/// Generates `count` cryptographically secure pseudorandom bytes wrapped in `RandomBytes`.
pub fn random_bytes_opaque(count: Int) -> RandomBytes {
  RandomBytes(random_bytes(count))
}

/// Computes the 32-byte SHA-256 digest of binary `data`.
@external(javascript, "./webcrypto.ffi.mjs", "sha256")
pub fn sha256(data: BitArray) -> BitArray

/// Computes the 64-character lowercase hex-encoded SHA-256 digest of UTF-8 `data`.
@external(javascript, "./webcrypto.ffi.mjs", "sha256_hex")
pub fn sha256_hex(data: String) -> String

/// Computes the 64-character lowercase hex-encoded SHA-256 digest of binary `data`.
@external(javascript, "./webcrypto.ffi.mjs", "sha256_hex_bits")
pub fn sha256_hex_bits(data: BitArray) -> String
