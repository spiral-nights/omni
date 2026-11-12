//// Versioned local store helper for persisting `Dict(String, Profile)` across reloads.

import gleam/dict.{type Dict}
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import omni/platform/storage.{type Storage}
import omni/plugin_kit/local_store.{type StoreConfig, StoreConfig}
import omni/social/profile.{type Profile, Profile}

/// Default storage key for the social profile cache.
pub const default_cache_key = "omni_social_profile_cache_v1"

/// Default schema version for the social profile cache.
pub const default_cache_version = 1

/// Construct a `StoreConfig` for a `Dict(String, Profile)` cache with a custom `key` and `version`.
pub fn config_with_key(
  key: String,
  version: Int,
) -> StoreConfig(Dict(String, Profile)) {
  StoreConfig(
    key: key,
    version: version,
    encode: fn(profiles_map: Dict(String, Profile)) {
      dict.to_list(profiles_map)
      |> list.map(fn(pair) {
        let #(pk, prof) = pair
        #(pk, profile.to_json(Profile(..prof, pubkey: pk)))
      })
      |> json.object
    },
    decoder: decode.dict(decode.string, profile.decoder())
      |> decode.map(fn(raw_map) {
        dict.to_list(raw_map)
        |> list.map(fn(pair) {
          let #(pk, prof) = pair
          let resolved_pk = case prof.pubkey {
            "" -> pk
            existing -> existing
          }
          #(pk, Profile(..prof, pubkey: resolved_pk))
        })
        |> dict.from_list
      }),
    default: fn() { dict.new() },
  )
}

/// Default `StoreConfig` for persisting `Dict(String, Profile)`.
pub fn default_config() -> StoreConfig(Dict(String, Profile)) {
  config_with_key(default_cache_key, default_cache_version)
}

/// Load the cached `Dict(String, Profile)` from `store`.
pub fn load(store: Storage) -> Dict(String, Profile) {
  local_store.load(store, default_config())
}

/// Save `profiles` into `store`.
pub fn save(
  store: Storage,
  profiles: Dict(String, Profile),
) -> Result(Nil, String) {
  local_store.save(store, default_config(), profiles)
}

/// Retrieve a single `Profile` by `pubkey` from `store`.
pub fn get_profile(store: Storage, pubkey: String) -> Option(Profile) {
  dict.get(load(store), pubkey)
  |> option.from_result
}

/// Insert or update a `Profile` in `store` (replacing only if `incoming.created_at >= existing.created_at`).
pub fn upsert(store: Storage, incoming: Profile) -> Dict(String, Profile) {
  local_store.update(store, default_config(), fn(current) {
    case dict.get(current, incoming.pubkey) {
      Ok(existing) if existing.created_at > incoming.created_at -> current
      _ -> dict.insert(current, incoming.pubkey, incoming)
    }
  })
}

/// Default TTL before a cached profile is refreshed from relays.
pub const default_ttl_ms = 3_600_000

/// Storage key for per-author profile fetch timestamps.
pub const timestamps_key = "omni_social_profile_fetch_ts_v1"

fn timestamps_config() -> StoreConfig(Dict(String, Int)) {
  StoreConfig(
    key: timestamps_key,
    version: 1,
    encode: fn(map) {
      dict.to_list(map)
      |> list.map(fn(pair) { #(pair.0, json.int(pair.1)) })
      |> json.object
    },
    decoder: decode.dict(decode.string, decode.int),
    default: fn() { dict.new() },
  )
}

fn load_timestamps(store: Storage) -> Dict(String, Int) {
  local_store.load(store, timestamps_config())
}

/// Whether `pubkey` should be fetched: no cached Profile, or the last fetch is
/// older than `ttl_ms`.
pub fn needs_fetch(
  store: Storage,
  pubkey: String,
  now_ms: Int,
  ttl_ms: Int,
) -> Bool {
  case get_profile(store, pubkey) {
    None -> True
    Some(_) ->
      case dict.get(load_timestamps(store), pubkey) {
        Ok(fetched_at) -> now_ms - fetched_at > ttl_ms
        Error(Nil) -> True
      }
  }
}

/// Record that `pubkey` was requested at `now_ms`.
pub fn mark_fetched(store: Storage, pubkey: String, now_ms: Int) -> Nil {
  let _ =
    local_store.update(store, timestamps_config(), fn(current) {
      dict.insert(current, pubkey, now_ms)
    })
  Nil
}

/// Cached profiles whose last fetch is older than `ttl_ms`.
pub fn stale_pubkeys(store: Storage, now_ms: Int, ttl_ms: Int) -> List(String) {
  let profiles = load(store)
  let timestamps = load_timestamps(store)
  dict.keys(profiles)
  |> list.filter(fn(pubkey) {
    case dict.get(timestamps, pubkey) {
      Ok(fetched_at) -> now_ms - fetched_at > ttl_ms
      Error(Nil) -> True
    }
  })
  |> list.unique
}

/// Clear the profile cache in `store`.
pub fn clear(store: Storage) -> Nil {
  local_store.clear(store, default_config())
}
