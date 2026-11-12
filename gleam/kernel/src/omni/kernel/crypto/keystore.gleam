//// Key custody manager and cryptographic signer for Nostr.
////
//// Manages the active user's secp256k1 private key, generates public keys and
//// BIP-340 Schnorr signatures, and persists credentials in `Storage`.

import gleam/bit_array
import gleam/dynamic/decode
import gleam/javascript/promise.{type Promise}
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{type Event, type UnsignedEvent, Event}
import omni/nostr/event_id
import omni/nostr/nip19
import omni/nostr/pubkey.{type Pubkey}
import omni/platform/nip44
import omni/platform/ref.{type Ref}
import omni/platform/secp256k1
import omni/platform/storage.{type Storage}
import omni/platform/webcrypto

/// Storage key under which the user's private key hex is persisted.
pub const storage_key_private_key = "omni_privkey"

/// Storage key for the NIP-44 encrypted private key blob.
pub const storage_key_encrypted_key = "omni_privkey_encrypted"

/// Storage key for the salt used to derive the passphrase encryption key.
pub const storage_key_key_salt = "omni_privkey_salt"

/// Storage key for the public key, kept available while locked.
pub const storage_key_public_key = "omni_privkey_pub"

/// Storage key for the known account public-key list.
pub const storage_key_accounts = "omni_accounts"

/// Storage key holding a specific account's plaintext private key.
pub fn account_key_storage_key(pubkey_hex: String) -> String {
  "omni_account_key:" <> string.lowercase(pubkey_hex)
}

/// Storage key holding a specific account's encrypted private key blob.
pub fn account_enc_storage_key(pubkey_hex: String) -> String {
  "omni_account_enc:" <> string.lowercase(pubkey_hex)
}

/// Key custody manager storing the active secret key and notifying subscribers.
pub type Keystore {
  Keystore(
    storage: Storage,
    private_key: Ref(String),
    public_key: Ref(Pubkey),
    listeners: Ref(List(fn(Pubkey) -> Nil)),
    locked: Ref(Bool),
    encrypted: Ref(Bool),
    passphrase_key: Ref(Option(String)),
    passphrase_pub: Ref(Option(String)),
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
fn parse_pubkey_or_panic(hex: String) -> Pubkey {
  case pubkey.parse(hex) {
    Ok(pk) -> pk
    Error(Nil) -> panic as "invalid public key"
  }
}

fn locked_or_stored_pubkey(store: Storage) -> Pubkey {
  case store.get(storage_key_public_key) {
    Some(stored) -> parse_pubkey_or_panic(stored)
    None ->
      parse_pubkey_or_panic(
        "0000000000000000000000000000000000000000000000000000000000000000",
      )
  }
}

fn load_accounts(store: Storage) -> List(String) {
  case store.get(storage_key_accounts) {
    None -> []
    Some(raw) ->
      case json.parse(from: raw, using: decode.list(of: decode.string)) {
        Ok(accounts) -> accounts
        Error(_) -> []
      }
  }
}

fn save_accounts(store: Storage, accounts: List(String)) -> Nil {
  let encoded =
    accounts
    |> list.unique
    |> list.map(json.string)
    |> json.array(fn(value) { value })
    |> json.to_string
  let _ = store.set(storage_key_accounts, encoded)
  Nil
}

fn remember_account(
  store: Storage,
  pubkey_hex: String,
  private_hex: String,
) -> Nil {
  let clean_pub = string.lowercase(pubkey_hex)
  let _ = store.set(account_key_storage_key(clean_pub), private_hex)
  save_accounts(store, [clean_pub, ..load_accounts(store)])
}

/// Known account public keys, active account first when known.
pub fn accounts(keystore: Keystore) -> List(String) {
  let active = pubkey.to_hex(get_public_key(keystore))
  let known = load_accounts(keystore.storage)
  let with_active = case list.contains(known, active) {
    True -> known
    False -> [active, ..known]
  }
  [active, ..list.filter(with_active, fn(pk) { pk != active })]
}

fn activate_account(keystore: Keystore, hex: String) -> Result(Pubkey, String) {
  case secp256k1.get_public_key(hex) {
    Error(_) -> Error("Stored account key is invalid")
    Ok(pk_hex) ->
      case pubkey.parse(pk_hex) {
        Error(Nil) -> Error("Stored account key is invalid")
        Ok(pk) -> {
          ref.set(keystore.private_key, hex)
          ref.set(keystore.public_key, pk)
          let _ = storage.set(keystore.storage, storage_key_public_key, pk_hex)
          case ref.get(keystore.encrypted) {
            False -> {
              let _ =
                storage.set(keystore.storage, storage_key_private_key, hex)
              let _ =
                storage.set(
                  keystore.storage,
                  account_key_storage_key(pk_hex),
                  hex,
                )
              Nil
            }
            True -> {
              let _ = storage.remove(keystore.storage, storage_key_private_key)
              Nil
            }
          }
          let known = load_accounts(keystore.storage)
          let next_accounts = case list.contains(known, pk_hex) {
            True -> known
            False -> [pk_hex, ..known]
          }
          save_accounts(keystore.storage, next_accounts)
          let listeners = ref.get(keystore.listeners)
          list.each(listeners, fn(listener) { listener(pk) })
          Ok(pk)
        }
      }
  }
}

/// Switch to a previously imported account, decrypting it when needed.
pub fn switch_account(
  keystore: Keystore,
  pubkey_hex: String,
) -> Promise(Result(Pubkey, String)) {
  case ref.get(keystore.locked) {
    True ->
      promise.resolve(Error("Unlock the keystore before switching accounts"))
    False -> {
      let target = string.lowercase(string.trim(pubkey_hex))
      let current = pubkey.to_hex(get_public_key(keystore))
      case target == current {
        True -> promise.resolve(Ok(get_public_key(keystore)))
        False ->
          case account_private_key(keystore, target) {
            Some(hex) -> promise.resolve(activate_account(keystore, hex))
            None ->
              case
                storage.get(keystore.storage, account_enc_storage_key(target))
              {
                None -> promise.resolve(Error("Unknown account: " <> target))
                Some(blob) ->
                  case
                    ref.get(keystore.passphrase_key),
                    ref.get(keystore.passphrase_pub)
                  {
                    Some(derived), Some(derived_pub) -> {
                      use result <- promise.await(nip44.nip44_decrypt(
                        derived,
                        derived_pub,
                        blob,
                      ))
                      case result {
                        Error(_) ->
                          promise.resolve(Error("Incorrect passphrase"))
                        Ok(hex) -> {
                          let _ =
                            storage.set(
                              keystore.storage,
                              storage_key_encrypted_key,
                              blob,
                            )
                          promise.resolve(activate_account(keystore, hex))
                        }
                      }
                    }
                    _, _ ->
                      promise.resolve(Error(
                        "Unlock the keystore before switching accounts",
                      ))
                  }
              }
          }
      }
    }
  }
}

pub fn new(store: Storage) -> Keystore {
  let encrypted_blob = store.get(storage_key_encrypted_key)
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

  let #(privkey, locked) = case existing_key, encrypted_blob {
    Some(hex), _ -> #(hex, False)
    None, Some(_) -> #("", True)
    None, None -> {
      let fresh = secp256k1.generate_private_key()
      let _ = store.set(storage_key_private_key, fresh)
      #(fresh, False)
    }
  }

  let pubkey = case existing_key {
    Some(hex) ->
      case secp256k1.get_public_key(hex) {
        Ok(pk_hex) -> parse_pubkey_or_panic(pk_hex)
        Error(_) -> locked_or_stored_pubkey(store)
      }
    None ->
      case locked {
        True -> locked_or_stored_pubkey(store)
        False ->
          case secp256k1.get_public_key(privkey) {
            Ok(pk_hex) -> parse_pubkey_or_panic(pk_hex)
            Error(_) -> locked_or_stored_pubkey(store)
          }
      }
  }
  let _ = store.set(storage_key_public_key, pubkey.to_hex(pubkey))
  let active_encrypted = case encrypted_blob {
    Some(_) -> True
    None ->
      case store.get(account_enc_storage_key(pubkey.to_hex(pubkey))) {
        Some(_) -> True
        None -> False
      }
  }
  let encrypted = active_encrypted

  let _ = case locked {
    False -> remember_account(store, pubkey.to_hex(pubkey), privkey)
    True ->
      save_accounts(store, [pubkey.to_hex(pubkey), ..load_accounts(store)])
  }

  Keystore(
    storage: store,
    private_key: ref.new(privkey),
    public_key: ref.new(pubkey),
    listeners: ref.new([]),
    locked: ref.new(locked),
    encrypted: ref.new(encrypted),
    passphrase_key: ref.new(None),
    passphrase_pub: ref.new(None),
  )
}

/// Derives and returns the current active user's `Pubkey`.
pub fn get_public_key(keystore: Keystore) -> Pubkey {
  ref.get(keystore.public_key)
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
  case ref.get(keystore.locked) {
    True -> Error("Keystore is locked. Unlock it with your passphrase.")
    False -> get_nsec_unlocked(keystore)
  }
}

fn get_nsec_unlocked(keystore: Keystore) -> Result(String, String) {
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
  case ref.get(keystore.locked) {
    True -> Error("Keystore is locked. Unlock it with your passphrase.")
    False -> sign_event_unlocked(keystore, draft)
  }
}

fn sign_event_unlocked(
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

/// Whether the active key is currently locked behind a passphrase.
pub fn is_locked(keystore: Keystore) -> Bool {
  ref.get(keystore.locked)
}

/// Whether a passphrase-encrypted key blob is stored.
pub fn is_encrypted(keystore: Keystore) -> Bool {
  ref.get(keystore.encrypted)
}

fn derive_passphrase_key(
  salt: String,
  passphrase: String,
) -> Result(#(String, String), String) {
  let derived = webcrypto.sha256_hex(salt <> ":" <> passphrase)
  case secp256k1.get_public_key(derived) {
    Ok(derived_pub) -> Ok(#(derived, derived_pub))
    Error(_) -> Error("Could not derive an encryption key from the passphrase")
  }
}

fn active_encrypted_blob(keystore: Keystore) -> Option(String) {
  case storage.get(keystore.storage, storage_key_encrypted_key) {
    Some(blob) -> Some(blob)
    None ->
      storage.get(
        keystore.storage,
        account_enc_storage_key(pubkey.to_hex(get_public_key(keystore))),
      )
  }
}

/// Unlock an encrypted keystore with `passphrase`.
pub fn unlock(
  keystore: Keystore,
  passphrase: String,
) -> Promise(Result(Pubkey, String)) {
  case active_encrypted_blob(keystore) {
    None -> promise.resolve(Ok(get_public_key(keystore)))
    Some(blob) ->
      case storage.get(keystore.storage, storage_key_key_salt) {
        None -> promise.resolve(Error("Encrypted key is missing its salt"))
        Some(salt) ->
          case derive_passphrase_key(salt, passphrase) {
            Error(err) -> promise.resolve(Error(err))
            Ok(#(derived, derived_pub)) -> {
              use result <- promise.await(nip44.nip44_decrypt(
                derived,
                derived_pub,
                blob,
              ))
              promise.resolve(case result {
                Error(_) -> Error("Incorrect passphrase")
                Ok(hex) ->
                  case secp256k1.get_public_key(hex) {
                    Error(_) -> Error("Stored key is invalid")
                    Ok(pk_hex) ->
                      case pubkey.parse(pk_hex) {
                        Error(Nil) -> Error("Stored key is invalid")
                        Ok(pk) -> {
                          ref.set(keystore.private_key, hex)
                          ref.set(keystore.public_key, pk)
                          ref.set(keystore.locked, False)
                          ref.set(keystore.passphrase_key, Some(derived))
                          ref.set(keystore.passphrase_pub, Some(derived_pub))
                          Ok(pk)
                        }
                      }
                  }
              })
            }
          }
      }
  }
}

fn account_private_key(
  keystore: Keystore,
  pubkey_hex: String,
) -> Option(String) {
  let active = pubkey.to_hex(get_public_key(keystore))
  case pubkey_hex == active {
    True ->
      case ref.get(keystore.private_key) {
        "" -> storage.get(keystore.storage, account_key_storage_key(pubkey_hex))
        key -> Some(key)
      }
    False -> storage.get(keystore.storage, account_key_storage_key(pubkey_hex))
  }
}

fn encrypt_accounts(
  keystore: Keystore,
  derived: String,
  derived_pub: String,
  accounts: List(String),
) -> Promise(Result(List(#(String, String)), String)) {
  case accounts {
    [] -> promise.resolve(Ok([]))
    [pubkey_hex, ..rest] ->
      case account_private_key(keystore, pubkey_hex) {
        None -> encrypt_accounts(keystore, derived, derived_pub, rest)
        Some(hex) -> {
          use result <- promise.await(nip44.nip44_encrypt(
            derived,
            derived_pub,
            hex,
          ))
          case result {
            Error(err) -> promise.resolve(Error(err))
            Ok(blob) -> {
              use rest_result <- promise.await(encrypt_accounts(
                keystore,
                derived,
                derived_pub,
                rest,
              ))
              promise.resolve(case rest_result {
                Error(err) -> Error(err)
                Ok(rest_encrypted) ->
                  Ok([#(pubkey_hex, blob), ..rest_encrypted])
              })
            }
          }
        }
      }
  }
}

/// Encrypt every imported account at rest with `passphrase`.
pub fn enable_passphrase(
  keystore: Keystore,
  passphrase: String,
) -> Promise(Result(Nil, String)) {
  case ref.get(keystore.locked), string.trim(passphrase) {
    True, _ ->
      promise.resolve(Error("Unlock the key before changing encryption"))
    _, "" -> promise.resolve(Error("Enter a passphrase"))
    False, _ -> {
      let salt = webcrypto.random_bytes(16) |> bit_array.base16_encode
      case derive_passphrase_key(salt, passphrase) {
        Error(err) -> promise.resolve(Error(err))
        Ok(#(derived, derived_pub)) -> {
          let accounts = accounts(keystore)
          use result <- promise.await(encrypt_accounts(
            keystore,
            derived,
            derived_pub,
            accounts,
          ))
          promise.resolve(case result {
            Error(err) -> Error(err)
            Ok(encrypted) -> {
              list.each(encrypted, fn(entry) {
                let #(pubkey_hex, blob) = entry
                let _ =
                  storage.set(
                    keystore.storage,
                    account_enc_storage_key(pubkey_hex),
                    blob,
                  )
                let _ =
                  storage.remove(
                    keystore.storage,
                    account_key_storage_key(pubkey_hex),
                  )
              })
              let active_hex = pubkey.to_hex(get_public_key(keystore))
              let active_blob = case
                list.find(encrypted, fn(entry) { entry.0 == active_hex })
              {
                Ok(entry) -> Some(entry.1)
                Error(Nil) -> None
              }
              case active_blob {
                Some(blob) -> {
                  let _ =
                    storage.set(
                      keystore.storage,
                      storage_key_encrypted_key,
                      blob,
                    )
                  Nil
                }
                None -> Nil
              }
              let _ = storage.set(keystore.storage, storage_key_key_salt, salt)
              let _ =
                storage.set(
                  keystore.storage,
                  storage_key_public_key,
                  active_hex,
                )
              let _ = storage.remove(keystore.storage, storage_key_private_key)
              ref.set(keystore.encrypted, True)
              ref.set(keystore.passphrase_key, Some(derived))
              ref.set(keystore.passphrase_pub, Some(derived_pub))
              Ok(Nil)
            }
          })
        }
      }
    }
  }
}

fn decrypt_accounts(
  keystore: Keystore,
  derived: String,
  derived_pub: String,
  accounts: List(String),
) -> Promise(Result(List(#(String, String)), String)) {
  case accounts {
    [] -> promise.resolve(Ok([]))
    [pubkey_hex, ..rest] ->
      case account_private_key(keystore, pubkey_hex) {
        Some(hex) -> {
          use rest_result <- promise.await(decrypt_accounts(
            keystore,
            derived,
            derived_pub,
            rest,
          ))
          promise.resolve(case rest_result {
            Error(err) -> Error(err)
            Ok(items) -> Ok([#(pubkey_hex, hex), ..items])
          })
        }
        None -> {
          let blob = case
            storage.get(keystore.storage, account_enc_storage_key(pubkey_hex))
          {
            Some(value) -> Some(value)
            None ->
              case pubkey_hex == pubkey.to_hex(get_public_key(keystore)) {
                True -> storage.get(keystore.storage, storage_key_encrypted_key)
                False -> None
              }
          }
          case blob {
            None -> decrypt_accounts(keystore, derived, derived_pub, rest)
            Some(blob) -> {
              use result <- promise.await(nip44.nip44_decrypt(
                derived,
                derived_pub,
                blob,
              ))
              case result {
                Error(_) -> promise.resolve(Error("Incorrect passphrase"))
                Ok(hex) -> {
                  use rest_result <- promise.await(decrypt_accounts(
                    keystore,
                    derived,
                    derived_pub,
                    rest,
                  ))
                  promise.resolve(case rest_result {
                    Error(err) -> Error(err)
                    Ok(items) -> Ok([#(pubkey_hex, hex), ..items])
                  })
                }
              }
            }
          }
        }
      }
  }
}

/// Remove passphrase encryption and store account keys in plaintext again.
pub fn disable_passphrase(keystore: Keystore) -> Promise(Result(Nil, String)) {
  case ref.get(keystore.locked) {
    True -> promise.resolve(Error("Unlock the key before disabling encryption"))
    False ->
      case ref.get(keystore.passphrase_key), ref.get(keystore.passphrase_pub) {
        Some(derived), Some(derived_pub) -> {
          let accounts = accounts(keystore)
          use result <- promise.await(decrypt_accounts(
            keystore,
            derived,
            derived_pub,
            accounts,
          ))
          promise.resolve(case result {
            Error(err) -> Error(err)
            Ok(decrypted) -> {
              list.each(decrypted, fn(entry) {
                let #(pubkey_hex, hex) = entry
                let _ =
                  storage.set(
                    keystore.storage,
                    account_key_storage_key(pubkey_hex),
                    hex,
                  )
                let _ =
                  storage.remove(
                    keystore.storage,
                    account_enc_storage_key(pubkey_hex),
                  )
              })
              let _ =
                storage.set(
                  keystore.storage,
                  storage_key_private_key,
                  ref.get(keystore.private_key),
                )
              let _ =
                storage.remove(keystore.storage, storage_key_encrypted_key)
              let _ = storage.remove(keystore.storage, storage_key_key_salt)
              ref.set(keystore.encrypted, False)
              ref.set(keystore.passphrase_key, None)
              ref.set(keystore.passphrase_pub, None)
              Ok(Nil)
            }
          })
        }
        _, _ ->
          promise.resolve(Error("Unlock the key before disabling encryption"))
      }
  }
}

/// Switches the active private key to `privkey_hex` (accepting hex or `nsec1...`).
///
/// Updates persistence and notifies all registered listeners.
pub fn switch_key(
  keystore: Keystore,
  privkey_hex: String,
) -> Result(Pubkey, String) {
  case ref.get(keystore.encrypted) {
    True -> Error("Remove passphrase encryption before importing a new key")
    False -> switch_key_unencrypted(keystore, privkey_hex)
  }
}

fn switch_key_unencrypted(
  keystore: Keystore,
  privkey_hex: String,
) -> Result(Pubkey, String) {
  case normalize_key_input(privkey_hex) {
    Ok(hex) -> {
      case secp256k1.get_public_key(hex) {
        Ok(pub_hex) -> {
          let assert Ok(pk) = pubkey.parse(pub_hex)
          ref.set(keystore.private_key, hex)
          ref.set(keystore.public_key, pk)
          ref.set(keystore.locked, False)
          ref.set(keystore.encrypted, False)
          let _ = storage.set(keystore.storage, storage_key_private_key, hex)
          let _ = storage.set(keystore.storage, storage_key_public_key, pub_hex)
          remember_account(keystore.storage, pub_hex, hex)
          let _ = storage.remove(keystore.storage, storage_key_encrypted_key)
          let _ = storage.remove(keystore.storage, storage_key_key_salt)
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
