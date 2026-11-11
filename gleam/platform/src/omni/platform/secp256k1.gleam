//// Cryptographic key operations over secp256k1 (BIP-340 Schnorr signatures).
////
//// Wraps `@noble/curves/secp256k1` to provide key generation, Schnorr public key
//// derivation, signature creation, verification, and ECDH shared secret computation.

/// Generates a cryptographically secure 32-byte private key as 64 lowercase hex characters.
@external(javascript, "./secp256k1.ffi.mjs", "generate_private_key")
pub fn generate_private_key() -> String

/// Derives the 32-byte BIP-340 x-only public key (64 hex characters) from a 32-byte private key hex.
/// Returns `Error(Nil)` if `private_key_hex` is invalid or out of curve range.
@external(javascript, "./secp256k1.ffi.mjs", "get_public_key")
pub fn get_public_key(private_key_hex: String) -> Result(String, Nil)

/// Produces a 64-byte BIP-340 Schnorr signature (128 hex characters) for a 32-byte message hash hex.
/// Returns `Error(Nil)` if inputs are invalid.
@external(javascript, "./secp256k1.ffi.mjs", "schnorr_sign")
pub fn schnorr_sign(
  message_hash_hex: String,
  private_key_hex: String,
) -> Result(String, Nil)

/// Verifies a 64-byte BIP-340 Schnorr signature against a 32-byte message hash and 32-byte public key.
/// Returns `True` if valid, `False` otherwise.
@external(javascript, "./secp256k1.ffi.mjs", "schnorr_verify")
pub fn schnorr_verify(
  signature_hex: String,
  message_hash_hex: String,
  public_key_hex: String,
) -> Bool

/// Computes the ECDH shared secret between a private key and a public key (64 or 66 hex characters).
@external(javascript, "./secp256k1.ffi.mjs", "get_shared_secret")
pub fn get_shared_secret(
  private_key_hex: String,
  public_key_hex: String,
) -> Result(String, Nil)
