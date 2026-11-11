//// Key custody manager and cryptographic signer for Nostr.
////
//// Manages the active user's secp256k1 private key, generates public keys and
//// BIP-340 Schnorr signatures, and persists credentials in `Storage`.

import gleam/list
import gleam/option.{None, Some}
import gleam/string
import omni/nostr/event.{type Event, type UnsignedEvent, Event}
import omni/nostr/event_id
import omni/nostr/nip19
import omni/nostr/pubkey.{type Pubkey}
import omni/platform/ref.{type Ref}
import omni/platform/secp256k1
import omni/platform/storage.{type Storage}
import omni/platform/webcrypto

/// Storage key under which the user's private key hex is persisted.
pub const storage_key_private_key = "omni_privkey"

/// Key custody manager storing the active secret key and notifying subscribers.
pub type Keystore {
  Keystore(
    storage: Storage,
    private_key: Ref(String),
    listeners: Ref(List(fn(Pubkey) -> Nil)),
  )
}

fn normalize_key_input(input: String) -> Result(String, String) {
  let trimmed = string.trim(input)
  case string.starts_with(trimmed, "nsec1") {
    True ->
      case nip19.decode_nsec(trimmed) {
        Ok(hex) -> Ok(hex)
        Error(_) -> Error("Invalid nsec bech32 string")
      }
    False -> {
      let lower = string.lowercase(trimmed)
      case string.length(lower) == 64 {
        True -> Ok(lower)
        False -> Error("Expected 64-character hex private key or nsec1...")
      }
    }
  }
}

/// Initializes a new `Keystore`. If a key already exists in `storage`, loads and
/// validates it; otherwise generates and persists a fresh secp256k1 private key.
pub fn new(store: Storage) -> Keystore {
  let existing_key = case store.get(storage_key_private_key) {
    Some(saved) -> {
      case normalize_key_input(saved) {
        Ok(hex) ->
          case secp256k1.get_public_key(hex) {
            Ok(_) -> Some(hex)
            Error(_) -> None
          }
        Error(_) -> None
      }
    }
    None -> None
  }

  let privkey = case existing_key {
    Some(hex) -> hex
    None -> {
      let fresh = secp256k1.generate_private_key()
      let _ = store.set(storage_key_private_key, fresh)
      fresh
    }
  }

  Keystore(
    storage: store,
    private_key: ref.new(privkey),
    listeners: ref.new([]),
  )
}

/// Derives and returns the current active user's `Pubkey`.
pub fn get_public_key(keystore: Keystore) -> Pubkey {
  let priv = ref.get(keystore.private_key)
  let assert Ok(pub_hex) = secp256k1.get_public_key(priv)
  let assert Ok(pk) = pubkey.parse(pub_hex)
  pk
}

/// Returns the raw 64-character lowercase hex string of the current private key.
pub fn get_private_key(keystore: Keystore) -> String {
  ref.get(keystore.private_key)
}

/// Returns the bech32 `npub1...` representation of the current public key.
pub fn get_npub(keystore: Keystore) -> String {
  nip19.encode_npub(get_public_key(keystore))
}

/// Returns the bech32 `nsec1...` representation of the current private key.
pub fn get_nsec(keystore: Keystore) -> Result(String, String) {
  case nip19.encode_nsec(get_private_key(keystore)) {
    Ok(nsec) -> Ok(nsec)
    Error(_) -> Error("Failed to encode nsec")
  }
}

/// Computes the event ID hash and produces a signed NIP-01 `Event` using Schnorr BIP-340.
pub fn sign_event(
  keystore: Keystore,
  draft: UnsignedEvent,
) -> Result(Event, String) {
  let privkey = ref.get(keystore.private_key)
  case secp256k1.get_public_key(privkey) {
    Ok(pub_hex) -> {
      let assert Ok(pk) = pubkey.parse(pub_hex)
      let serialized =
        event.serialize_for_id(
          pk,
          draft.created_at,
          draft.kind,
          draft.tags,
          draft.content,
        )
      let id_hex = webcrypto.sha256_hex(serialized)
      case event_id.parse(id_hex) {
        Ok(eid) -> {
          case secp256k1.schnorr_sign(id_hex, privkey) {
            Ok(sig) -> {
              Ok(Event(
                id: eid,
                pubkey: pk,
                created_at: draft.created_at,
                kind: draft.kind,
                tags: draft.tags,
                content: draft.content,
                sig: sig,
              ))
            }
            Error(Nil) -> Error("Schnorr sign failed")
          }
        }
        Error(Nil) -> Error("Failed to parse calculated event ID")
      }
    }
    Error(Nil) -> Error("Invalid private key in keystore")
  }
}

/// Switches the active private key to `privkey_hex` (accepting hex or `nsec1...`).
///
/// Updates persistence and notifies all registered listeners.
pub fn switch_key(
  keystore: Keystore,
  privkey_hex: String,
) -> Result(Pubkey, String) {
  case normalize_key_input(privkey_hex) {
    Ok(hex) -> {
      case secp256k1.get_public_key(hex) {
        Ok(pub_hex) -> {
          let assert Ok(pk) = pubkey.parse(pub_hex)
          ref.set(keystore.private_key, hex)
          let _ = storage.set(keystore.storage, storage_key_private_key, hex)
          let listeners = ref.get(keystore.listeners)
          list.each(listeners, fn(listener) { listener(pk) })
          Ok(pk)
        }
        Error(Nil) -> Error("Invalid secp256k1 private key")
      }
    }
    Error(err) -> Error(err)
  }
}

/// Registers a callback invoked whenever the active key changes.
///
/// Returns an unsubscription closer.
pub fn on_key_change(
  keystore: Keystore,
  listener: fn(Pubkey) -> Nil,
) -> fn() -> Nil {
  ref.update(keystore.listeners, fn(l) { [listener, ..l] })
  fn() {
    ref.update(keystore.listeners, fn(l) {
      list.filter(l, fn(item) { item != listener })
    })
  }
}
