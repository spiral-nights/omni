import gleam/string
import omni/platform/secp256k1

pub fn generate_private_key_test() {
  let priv1 = secp256k1.generate_private_key()
  let priv2 = secp256k1.generate_private_key()

  assert string.length(priv1) == 64
  assert string.length(priv2) == 64
  assert priv1 != priv2
}

pub fn get_public_key_test() {
  let priv = secp256k1.generate_private_key()
  let assert Ok(pubkey) = secp256k1.get_public_key(priv)
  assert string.length(pubkey) == 64

  // Calling twice on the same private key yields the same public key
  let assert Ok(pubkey2) = secp256k1.get_public_key(priv)
  assert pubkey == pubkey2

  // Invalid private key formats return Error(Nil)
  assert secp256k1.get_public_key("invalid_hex") == Error(Nil)
  assert secp256k1.get_public_key("1234") == Error(Nil)
}

pub fn schnorr_sign_and_verify_test() {
  let priv = secp256k1.generate_private_key()
  let assert Ok(pubkey) = secp256k1.get_public_key(priv)

  // 32-byte dummy message hash (64 hex characters)
  let msg_hash =
    "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"

  let assert Ok(sig) = secp256k1.schnorr_sign(msg_hash, priv)
  assert string.length(sig) == 128

  // Verifying against the correct message hash and public key succeeds
  let is_valid = secp256k1.schnorr_verify(sig, msg_hash, pubkey)
  assert is_valid == True

  // Verifying against an altered message hash fails
  let corrupted_hash =
    "0000000000000000000000000000000000000000000000000000000000000000"
  assert secp256k1.schnorr_verify(sig, corrupted_hash, pubkey) == False

  // Verifying with a different public key fails
  let other_priv = secp256k1.generate_private_key()
  let assert Ok(other_pub) = secp256k1.get_public_key(other_priv)
  assert secp256k1.schnorr_verify(sig, msg_hash, other_pub) == False
}

pub fn schnorr_sign_invalid_inputs_test() {
  let priv = secp256k1.generate_private_key()
  assert secp256k1.schnorr_sign("short_hash", priv) == Error(Nil)
  assert secp256k1.schnorr_sign(
      "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
      "bad_key",
    )
    == Error(Nil)
}

pub fn ecdh_shared_secret_test() {
  let alice_priv = secp256k1.generate_private_key()
  let assert Ok(alice_pub) = secp256k1.get_public_key(alice_priv)

  let bob_priv = secp256k1.generate_private_key()
  let assert Ok(bob_pub) = secp256k1.get_public_key(bob_priv)

  let assert Ok(secret_a) = secp256k1.get_shared_secret(alice_priv, bob_pub)
  let assert Ok(secret_b) = secp256k1.get_shared_secret(bob_priv, alice_pub)

  assert secret_a == secret_b
  assert string.length(secret_a) == 64
}
