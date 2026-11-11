import gleam/option.{Some}
import gleam/string
import omni/kernel/crypto/keystore.{
  get_npub, get_nsec, get_private_key, get_public_key, on_key_change, sign_event,
  switch_key,
}
import omni/nostr/event.{UnsignedEvent}
import omni/nostr/event_id
import omni/nostr/kind
import omni/nostr/nip19
import omni/nostr/pubkey
import omni/platform/ref
import omni/platform/secp256k1
import omni/platform/storage

pub fn keystore_new_and_persistence_test() {
  let store = storage.in_memory()
  let ks1 = keystore.new(store)

  let priv1 = get_private_key(ks1)
  assert string.length(priv1) == 64

  let pk1 = get_public_key(ks1)
  assert string.length(pubkey.to_hex(pk1)) == 64

  let npub = get_npub(ks1)
  assert string.starts_with(npub, "npub1")

  let assert Ok(nsec) = get_nsec(ks1)
  assert string.starts_with(nsec, "nsec1")

  // Reloading from storage gives exact same keypair
  let ks2 = keystore.new(store)
  assert get_private_key(ks2) == priv1
  assert get_public_key(ks2) == pk1
}

pub fn keystore_sign_event_test() {
  let store = storage.in_memory()
  let ks = keystore.new(store)
  let pk = get_public_key(ks)

  let draft =
    UnsignedEvent(
      pubkey: Some(pk),
      created_at: 1_700_000_000,
      kind: kind.Note,
      tags: [["t", "nostr"], ["t", "gleam"]],
      content: "Hello from pure Gleam Keystore!",
    )

  let assert Ok(signed) = sign_event(ks, draft)

  // Pubkey matches keystore
  assert signed.pubkey == pk
  assert signed.created_at == 1_700_000_000
  assert signed.kind == kind.Note
  assert signed.content == "Hello from pure Gleam Keystore!"

  // Verify Schnorr signature
  let id_hex = event_id.to_hex(signed.id)
  let pk_hex = pubkey.to_hex(signed.pubkey)
  let is_valid = secp256k1.schnorr_verify(signed.sig, id_hex, pk_hex)
  assert is_valid == True
}

pub fn keystore_switch_key_hex_and_nsec_test() {
  let store = storage.in_memory()
  let ks = keystore.new(store)
  let original_pk = get_public_key(ks)

  let listener_calls = ref.new([])
  let closer =
    on_key_change(ks, fn(pk) {
      ref.update(listener_calls, fn(calls) { [pk, ..calls] })
    })

  // 1. Switch with hex
  let new_priv_hex = secp256k1.generate_private_key()
  let assert Ok(new_pub_hex) = secp256k1.get_public_key(new_priv_hex)
  let assert Ok(expected_pk) = pubkey.parse(new_pub_hex)

  let assert Ok(switched_pk) = switch_key(ks, new_priv_hex)
  assert switched_pk == expected_pk
  assert get_public_key(ks) == expected_pk
  assert switched_pk != original_pk
  assert ref.get(listener_calls) == [expected_pk]

  // Storage was updated
  assert storage.get(store, keystore.storage_key_private_key)
    == Some(new_priv_hex)

  // 2. Switch with nsec1...
  let third_priv_hex = secp256k1.generate_private_key()
  let assert Ok(third_nsec) = nip19.encode_nsec(third_priv_hex)
  let assert Ok(third_pub_hex) = secp256k1.get_public_key(third_priv_hex)
  let assert Ok(third_expected_pk) = pubkey.parse(third_pub_hex)

  let assert Ok(switched_nsec_pk) = switch_key(ks, third_nsec)
  assert switched_nsec_pk == third_expected_pk
  assert get_public_key(ks) == third_expected_pk
  assert ref.get(listener_calls) == [third_expected_pk, expected_pk]

  // Unregister listener
  closer()
  let fourth_priv = secp256k1.generate_private_key()
  let _ = switch_key(ks, fourth_priv)
  // Listener should not have received 4th key change
  assert ref.get(listener_calls) == [third_expected_pk, expected_pk]
}

pub fn keystore_switch_invalid_key_test() {
  let store = storage.in_memory()
  let ks = keystore.new(store)
  let pk_before = get_public_key(ks)

  assert switch_key(ks, "invalid_hex")
    == Error("Expected 64-character hex private key or nsec1...")
  assert switch_key(ks, "nsec1invalid") == Error("Invalid nsec bech32 string")

  // Current key remains unchanged
  assert get_public_key(ks) == pk_before
}
