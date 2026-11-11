//// Nostr Encrypted Direct Message primitives (NIP-04 and NIP-44).
////
//// Provides asynchronous encryption and decryption of payload messages
//// using secp256k1 ECDH shared secrets and WebCrypto AES-CBC / ChaCha20-Poly1305.

import gleam/javascript/promise.{type Promise}

/// Encrypts `plaintext` for `recipient_pubkey_hex` using NIP-04 (AES-256-CBC).
/// Returns a promise resolving with the formatted ciphertext `"<base64>?iv=<base64>"`
/// or an error message on failure.
@external(javascript, "./nip44.ffi.mjs", "nip04_encrypt")
pub fn nip04_encrypt(
  private_key_hex: String,
  recipient_pubkey_hex: String,
  plaintext: String,
) -> Promise(Result(String, String))

/// Decrypts a NIP-04 ciphertext from `sender_pubkey_hex` using `private_key_hex`.
/// Expects ciphertext in the form `"<base64>?iv=<base64>"`.
@external(javascript, "./nip44.ffi.mjs", "nip04_decrypt")
pub fn nip04_decrypt(
  private_key_hex: String,
  sender_pubkey_hex: String,
  ciphertext: String,
) -> Promise(Result(String, String))

/// Encrypts `plaintext` using NIP-44.
@external(javascript, "./nip44.ffi.mjs", "nip44_encrypt")
pub fn nip44_encrypt(
  private_key_hex: String,
  recipient_pubkey_hex: String,
  plaintext: String,
) -> Promise(Result(String, String))

/// Decrypts `ciphertext` using NIP-44.
@external(javascript, "./nip44.ffi.mjs", "nip44_decrypt")
pub fn nip44_decrypt(
  private_key_hex: String,
  sender_pubkey_hex: String,
  ciphertext: String,
) -> Promise(Result(String, String))
