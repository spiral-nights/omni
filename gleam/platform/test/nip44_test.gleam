import gleam/javascript/promise.{type Promise}
import gleam/result
import omni/platform/nip44
import omni/platform/secp256k1

pub fn nip04_roundtrip_test() -> Promise(Nil) {
  let alice_priv = secp256k1.generate_private_key()
  let assert Ok(alice_pub) = secp256k1.get_public_key(alice_priv)

  let bob_priv = secp256k1.generate_private_key()
  let assert Ok(bob_pub) = secp256k1.get_public_key(bob_priv)

  let plaintext = "Hello from Gleam NIP-04 test suite!"

  use enc_res <- promise.await(nip44.nip04_encrypt(
    alice_priv,
    bob_pub,
    plaintext,
  ))
  let assert Ok(ciphertext) = enc_res

  use dec_res <- promise.await(nip44.nip04_decrypt(
    bob_priv,
    alice_pub,
    ciphertext,
  ))
  let assert Ok(decrypted) = dec_res

  assert decrypted == plaintext
  promise.resolve(Nil)
}

pub fn nip04_invalid_ciphertext_test() -> Promise(Nil) {
  let bob_priv = secp256k1.generate_private_key()
  let alice_priv = secp256k1.generate_private_key()
  let assert Ok(alice_pub) = secp256k1.get_public_key(alice_priv)

  // Ciphertext without '?iv=' should return Error
  use dec_res <- promise.await(nip44.nip04_decrypt(
    bob_priv,
    alice_pub,
    "invalid_ciphertext_without_iv",
  ))
  assert result.is_error(dec_res) == True

  promise.resolve(Nil)
}
