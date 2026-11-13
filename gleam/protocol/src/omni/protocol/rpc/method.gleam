//// Strongly-typed RPC request domain model and parameter definitions.
////
//// Every RPC request emitted by sandboxed guest plugins over Channel 2
//// maps to a variant of the exhaustive `Request` ADT.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{type Event, type UnsignedEvent}
import omni/nostr/filter.{type Filter}
import omni/nostr/nip19
import omni/nostr/pubkey.{type Pubkey}
import omni/nostr/relay_url.{type RelayUrl}

/// Options for one-shot Nostr event fetching (`nostr.fetch`).
pub type FetchOptions {
  FetchOptions(
    timeout_ms: Option(Int),
    relays: Option(List(RelayUrl)),
    local_only: Option(Bool),
  )
}

/// Create default `FetchOptions` with all options unset.
pub fn default_fetch_options() -> FetchOptions {
  FetchOptions(timeout_ms: None, relays: None, local_only: None)
}

fn dummy_relay_url() -> RelayUrl {
  let assert Ok(u) = relay_url.parse("wss://relay.damus.io")
  u
}

/// Dynamic decoder for a valid `RelayUrl`.
pub fn relay_url_decoder() -> decode.Decoder(RelayUrl) {
  use raw <- decode.then(decode.string)
  case relay_url.parse(raw) {
    Ok(u) -> decode.success(u)
    Error(Nil) ->
      case relay_url.parse("wss://" <> string.trim(raw)) {
        Ok(u) -> decode.success(u)
        Error(Nil) -> decode.failure(dummy_relay_url(), "valid RelayUrl")
      }
  }
}

/// Dynamic decoder for `FetchOptions`.
pub fn fetch_options_decoder() -> decode.Decoder(FetchOptions) {
  use timeout_ms <- decode.optional_field(
    "timeoutMs",
    None,
    decode.optional(decode.int),
  )
  use relays <- decode.optional_field(
    "relays",
    None,
    decode.optional(decode.list(relay_url_decoder())),
  )
  use local_only <- decode.optional_field(
    "localOnly",
    None,
    decode.optional(decode.bool),
  )
  decode.success(FetchOptions(
    timeout_ms: timeout_ms,
    relays: relays,
    local_only: local_only,
  ))
}

/// Convert `FetchOptions` to a list of JSON object fields.
pub fn fetch_options_fields(
  options: FetchOptions,
) -> List(#(String, json.Json)) {
  let fields = []
  let fields = case options.timeout_ms {
    Some(t) -> [#("timeoutMs", json.int(t)), ..fields]
    None -> fields
  }
  let fields = case options.relays {
    Some(r) -> [
      #(
        "relays",
        json.array(r, of: fn(u) { json.string(relay_url.to_string(u)) }),
      ),
      ..fields
    ]
    None -> fields
  }
  let fields = case options.local_only {
    Some(l) -> [#("localOnly", json.bool(l)), ..fields]
    None -> fields
  }
  fields
}

/// Wire encryption scheme requested by a `nostr.nip04.*` or `nostr.nip44.*` call.
pub type EncryptionScheme {
  Nip04
  Nip44
}

/// Exhaustive ADT covering all RPC requests emitted by guest plugins.
pub type Request {
  /// Query the active user's public key (NIP-07 `getPublicKey`).
  NostrGetPublicKey
  /// Sign an unsigned Nostr event draft (NIP-07 `signEvent`).
  NostrSignEvent(draft: UnsignedEvent)
  /// One-shot query across local cache and relay pool (`nostr.fetch`).
  NostrFetch(filters: List(Filter), options: Option(FetchOptions))
  /// Broadcast a signed Nostr event to relays and local store (`nostr.publish`).
  NostrPublish(event: Event)
  /// Sign and broadcast an unsigned draft (`nostr.publish` from the bridge).
  NostrPublishDraft(draft: UnsignedEvent)
  /// Open a live relay subscription (`nostr.subscribe`).
  NostrSubscribe(subscription_id: String, filters: List(Filter))
  /// Close a live relay subscription (`nostr.unsubscribe`).
  NostrUnsubscribe(subscription_id: String)
  /// Active relay map with read/write scopes (`nostr.getRelays`).
  NostrGetRelays
  /// Read a cached Kind 0 profile (`profile.get`).
  ProfileGet(pubkey: Pubkey)
  /// Publish a Kind 0 profile metadata document (`profile.publish`).
  ProfilePublish(metadata: Dynamic)
  /// Encrypt plaintext for a recipient pubkey (NIP-04 / NIP-44).
  NostrEncrypt(
    scheme: EncryptionScheme,
    recipient_pubkey: Pubkey,
    plaintext: String,
  )
  /// Decrypt ciphertext from a sender pubkey (NIP-04 / NIP-44).
  NostrDecrypt(
    scheme: EncryptionScheme,
    sender_pubkey: Pubkey,
    ciphertext: String,
  )
  /// Read a value from plugin-partitioned storage (`storage.get`).
  StorageGet(key: String)
  /// Write a key-value entry into plugin storage (`storage.set`).
  StorageSet(key: String, value: String)
  /// Delete a key from plugin storage (`storage.delete`).
  StorageRemove(key: String)
  /// List all storage keys for this plugin (`storage.keys`).
  StorageKeys
  /// Clear all storage for this plugin (`storage.clear`).
  StorageClear
  /// List active connected Nostr relays (`relays.list`).
  RelaysList
  /// Add a Nostr relay to the pool (`relays.add`).
  RelaysAdd(url: RelayUrl)
  /// Remove a Nostr relay from the pool (`relays.remove`).
  RelaysRemove(url: RelayUrl)
  /// Dispatch a semantic intent action (`intent.dispatch`).
  IntentsDispatch(action: String, payload: Option(Dynamic))
  /// Register this plugin as a guest handler for an intent (`intent.handle`).
  IntentHandle(action: String)
  /// Broadcast an intent to every registered guest handler (`intent.emit`).
  IntentEmit(action: String, payload: Option(Dynamic))
  /// Navigate to a view and optional page in the shell (`navigation.open`).
  NavigationOpen(view: String, page: Option(String))
  /// Invoke host web share dialog (`kernel.handleShare`).
  Share(title: Option(String), text: Option(String), url: Option(String))
  /// Switch the active cryptographic identity (`auth.switchKey`).
  AuthSwitchKey(key: String)
  /// Read the active user's bech32 `npub1...` (`auth.getNpub`).
  AuthGetNpub
  /// Read the active user's bech32 `nsec1...` (`auth.getNsec`).
  AuthGetNsec
  /// Generate a fresh secp256k1 keypair without switching to it (`auth.generateKey`).
  AuthGenerateKey
  /// Open a protocol URI through the shell intent broker (`kernel.handleUri`).
  KernelHandleUri(uri: String)
  /// Any unrecognized or extension method name.
  UnknownMethod(name: String, params: Option(Dynamic))
}

/// Canonical wire method name for a `Request`.
pub fn method_name(request: Request) -> String {
  case request {
    NostrGetPublicKey -> "nostr.getPublicKey"
    NostrSignEvent(_) -> "nostr.signEvent"
    NostrFetch(_, _) -> "nostr.fetch"
    NostrPublish(_) -> "nostr.publish"
    NostrPublishDraft(_) -> "nostr.publish"
    NostrSubscribe(_, _) -> "nostr.subscribe"
    NostrUnsubscribe(_) -> "nostr.unsubscribe"
    NostrGetRelays -> "nostr.getRelays"
    ProfileGet(_) -> "profile.get"
    ProfilePublish(_) -> "profile.publish"
    NostrEncrypt(scheme, _, _) -> encryption_method(scheme, "encrypt")
    NostrDecrypt(scheme, _, _) -> encryption_method(scheme, "decrypt")
    StorageGet(_) -> "storage.get"
    StorageSet(_, _) -> "storage.set"
    StorageRemove(_) -> "storage.delete"
    StorageKeys -> "storage.keys"
    StorageClear -> "storage.clear"
    RelaysList -> "relays.list"
    RelaysAdd(_) -> "relays.add"
    RelaysRemove(_) -> "relays.remove"
    IntentsDispatch(_, _) -> "intent.dispatch"
    IntentHandle(_) -> "intent.handle"
    IntentEmit(_, _) -> "intent.emit"
    NavigationOpen(_, _) -> "navigation.open"
    Share(_, _, _) -> "kernel.handleShare"
    AuthSwitchKey(_) -> "auth.switchKey"
    AuthGetNpub -> "auth.getNpub"
    AuthGetNsec -> "auth.getNsec"
    AuthGenerateKey -> "auth.generateKey"
    KernelHandleUri(_) -> "kernel.handleUri"
    UnknownMethod(name, _) -> name
  }
}

fn encryption_method(scheme: EncryptionScheme, op: String) -> String {
  case scheme {
    Nip04 -> "nostr.nip04." <> op
    Nip44 -> "nostr.nip44." <> op
  }
}

/// Dynamic decoder for a valid 64-character hex `Pubkey` or NIP-19 `npub1...`.
pub fn pubkey_tolerant_decoder() -> decode.Decoder(Pubkey) {
  use raw <- decode.then(decode.string)
  case pubkey.parse(raw) {
    Ok(pk) -> decode.success(pk)
    Error(Nil) ->
      case nip19.decode_npub(raw) {
        Ok(pk) -> decode.success(pk)
        Error(_) ->
          decode.failure(
            pubkey_from_dummy(),
            "valid 64-char hex pubkey or npub",
          )
      }
  }
}

fn pubkey_from_dummy() -> Pubkey {
  let assert Ok(pk) =
    pubkey.parse(
      "0000000000000000000000000000000000000000000000000000000000000000",
    )
  pk
}
