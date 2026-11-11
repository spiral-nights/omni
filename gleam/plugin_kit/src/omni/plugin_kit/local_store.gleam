//// Versioned `localStorage` JSON store helper backed by `omni/platform/storage`.
////
//// Persists structured values in JSON envelopes `{ "version": <v>, "data": <data> }`
//// with fallback support for unversioned raw JSON payloads and safe defaults
//// when missing, corrupt, or on version mismatch.

import gleam/dynamic/decode.{type Decoder}
import gleam/json.{type Json}
import gleam/option.{None, Some}
import omni/platform/storage.{
  type Storage, QuotaExceeded, StorageOperationError, StorageUnavailable,
}

/// Configuration for a versioned JSON local store entry.
pub type StoreConfig(a) {
  StoreConfig(
    key: String,
    version: Int,
    encode: fn(a) -> Json,
    decoder: Decoder(a),
    default: fn() -> a,
  )
}

/// Loads the typed value from `storage` according to `config`.
///
/// Supports both `{ "version": <v>, "data": <data> }` envelopes (verifying `version == config.version`)
/// and raw `<data>` fallback payloads. Returns `config.default()` if the key is absent,
/// the JSON is malformed, or the version does not match `config.version`.
pub fn load(store: Storage, config: StoreConfig(a)) -> a {
  case storage.get(store, config.key) {
    None -> config.default()
    Some(raw) -> decode_stored(raw, config)
  }
}

/// Saves `value` into `storage` under `config.key` wrapped in a versioned JSON envelope:
/// `{ "version": config.version, "data": config.encode(value) }`.
pub fn save(
  store: Storage,
  config: StoreConfig(a),
  value: a,
) -> Result(Nil, String) {
  let payload =
    json.object([
      #("version", json.int(config.version)),
      #("data", config.encode(value)),
    ])
    |> json.to_string

  case storage.set(store, config.key, payload) {
    Ok(Nil) -> Ok(Nil)
    Error(QuotaExceeded) -> Error("Storage quota exceeded")
    Error(StorageUnavailable(msg)) -> Error(msg)
    Error(StorageOperationError(msg)) -> Error(msg)
  }
}

/// Loads the current value from `storage`, applies `f`, saves the updated value,
/// and returns the updated value.
pub fn update(store: Storage, config: StoreConfig(a), f: fn(a) -> a) -> a {
  let next = f(load(store, config))
  let _ = save(store, config, next)
  next
}

/// Removes `config.key` from `storage`.
pub fn clear(store: Storage, config: StoreConfig(a)) -> Nil {
  storage.remove(store, config.key)
}

fn decode_stored(raw: String, config: StoreConfig(a)) -> a {
  let version_only_decoder = {
    use v <- decode.field("version", decode.int)
    decode.success(v)
  }

  let versioned_data_decoder = {
    use v <- decode.field("version", decode.int)
    use d <- decode.field("data", config.decoder)
    decode.success(#(v, d))
  }

  // First check if the JSON has a "version" field.
  case json.parse(from: raw, using: version_only_decoder) {
    Ok(v) ->
      case v == config.version {
        False -> config.default()
        True ->
          case json.parse(from: raw, using: versioned_data_decoder) {
            Ok(#(_, data)) -> data
            Error(_) -> config.default()
          }
      }
    Error(_) ->
      // Fallback: try decoding raw `<data>` directly
      case json.parse(from: raw, using: config.decoder) {
        Ok(data) -> data
        Error(_) -> config.default()
      }
  }
}
