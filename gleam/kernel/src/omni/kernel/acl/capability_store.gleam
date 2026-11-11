//// Storage backing for capability grants.
////
//// Manages capability grants backed by an injectable `Storage` port
//// (e.g. `window.localStorage` in production, `storage.in_memory()` in tests).
//// Grants marked `Always` or `Deny` are persisted across sessions, while
//// `Session` grants live only in memory.

import gleam/dict.{type Dict}
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import omni/platform/ref.{type Ref}
import omni/platform/storage.{type Storage}
import omni/protocol/capability.{type Capability}
import omni/protocol/grant.{type Grant}
import omni/protocol/plugin_id.{type PluginId}

/// The default localStorage key used for capability grant persistence.
pub const default_storage_key = "omni_capability_grants"

/// Backing store for capability grants.
pub type CapabilityStore {
  CapabilityStore(
    storage: Storage,
    storage_key: String,
    memory: Ref(Dict(String, Grant)),
  )
}

type StoredRecord {
  StoredRecord(
    plugin_id: String,
    category: String,
    scope: Option(String),
    grant: Grant,
  )
}

/// Create a new `CapabilityStore` with the default storage key.
pub fn new(storage: Storage) -> CapabilityStore {
  new_with_key(storage, default_storage_key)
}

/// Create a new `CapabilityStore` with a custom storage key.
pub fn new_with_key(storage: Storage, storage_key: String) -> CapabilityStore {
  let store =
    CapabilityStore(
      storage: storage,
      storage_key: storage_key,
      memory: ref.new(dict.new()),
    )
  load(store)
  store
}

/// Look up a stored grant for `plugin_id` and `cap`.
///
/// If `scope` is given (e.g. `Some("30078")`), looks for an exact match first.
/// When `allow_wildcard` is `True` and no exact match was found, falls back
/// to the wildcard scope `*`.
pub fn get_grant(
  store: CapabilityStore,
  plugin_id: PluginId,
  cap: Capability,
  scope: Option(String),
  allow_wildcard: Bool,
) -> Option(Grant) {
  let specific_scope = case scope {
    Some(s) if s != "" -> s
    _ -> "*"
  }
  let specific_key = make_key(plugin_id, cap, specific_scope)
  let mem = ref.get(store.memory)
  case dict.get(mem, specific_key) {
    Ok(g) -> Some(g)
    Error(Nil) -> {
      case allow_wildcard && specific_scope != "*" {
        True -> {
          let wildcard_key = make_key(plugin_id, cap, "*")
          dict.get(mem, wildcard_key) |> option.from_result
        }
        False -> None
      }
    }
  }
}

/// Record a grant for `plugin_id` and `cap`.
///
/// Grants with level `Always` or `Deny` are immediately persisted to storage.
/// Grants with level `Session` are kept in memory only.
pub fn set_grant(
  store: CapabilityStore,
  plugin_id: PluginId,
  cap: Capability,
  grant: Grant,
  scope: Option(String),
) -> Nil {
  let scope_str = case scope {
    Some(s) if s != "" -> s
    _ -> "*"
  }
  let key = make_key(plugin_id, cap, scope_str)
  ref.update(store.memory, fn(mem) { dict.insert(mem, key, grant) })
  case grant {
    grant.Always | grant.Deny -> save(store)
    grant.Session -> Nil
  }
}

/// Revoke grants for `plugin_id`.
///
/// When `cap` is `None`, revokes all capabilities granted to `plugin_id`.
/// When `cap` is `Some(c)`, revokes all scopes for that specific capability.
/// Updates persistent storage immediately.
pub fn revoke(
  store: CapabilityStore,
  plugin_id: PluginId,
  cap: Option(Capability),
) -> Nil {
  let pid_str = plugin_id.to_string(plugin_id)
  let prefix = pid_str <> "::"
  ref.update(store.memory, fn(mem) {
    dict.filter(mem, fn(key, _grant) {
      case string.starts_with(key, prefix) {
        False -> True
        True -> {
          case cap {
            None -> False
            Some(c) -> {
              let cap_str = capability.to_string(c)
              let cap_segment = "::" <> cap_str <> "::"
              case string.contains(key, cap_segment) {
                True -> False
                False -> True
              }
            }
          }
        }
      }
    })
  })
  save(store)
}

/// Retrieve all active grants for `plugin_id`.
///
/// Returns a map where each key is formatted as `"<category>:<scope>"`,
/// e.g. `"nostr:read:*"` or `"nostr:write:1"`.
pub fn get_all_grants(
  store: CapabilityStore,
  plugin_id: PluginId,
) -> Dict(String, Grant) {
  let pid_str = plugin_id.to_string(plugin_id)
  let prefix = pid_str <> "::"
  let mem = ref.get(store.memory)
  dict.fold(mem, dict.new(), fn(acc, key, grant_val) {
    case string.starts_with(key, prefix) {
      True -> {
        case string.split(key, "::") {
          [_, category, scope] -> {
            let out_key = category <> ":" <> scope
            dict.insert(acc, out_key, grant_val)
          }
          _ -> acc
        }
      }
      False -> acc
    }
  })
}

/// Persist all persistent (`Always` and `Deny`) grants to storage.
pub fn save(store: CapabilityStore) -> Nil {
  let mem = ref.get(store.memory)
  let records =
    dict.fold(mem, [], fn(acc, key, grant_val) {
      case grant_val {
        grant.Always | grant.Deny -> {
          case string.split(key, "::") {
            [plugin_id_str, category_str, scope_str] -> {
              let record =
                json.object([
                  #("pluginId", json.string(plugin_id_str)),
                  #("category", json.string(category_str)),
                  #("scope", json.string(scope_str)),
                  #("grant", grant.to_json(grant_val)),
                  #("updatedAt", json.int(0)),
                ])
              [record, ..acc]
            }
            _ -> acc
          }
        }
        grant.Session -> acc
      }
    })
  let raw = json.to_string(json.array(records, of: fn(x) { x }))
  let _ = storage.set(store.storage, store.storage_key, raw)
  Nil
}

/// Load persistent grants from storage into memory.
pub fn load(store: CapabilityStore) -> Nil {
  case storage.get(store.storage, store.storage_key) {
    None -> Nil
    Some(raw) -> {
      case parse_records(raw) {
        Ok(records) -> {
          let persistent_entries =
            list.filter_map(records, fn(rec) {
              case rec.grant {
                grant.Always | grant.Deny -> {
                  let scope_str = case rec.scope {
                    Some(s) if s != "" -> s
                    _ -> "*"
                  }
                  let key =
                    make_key_string(rec.plugin_id, rec.category, scope_str)
                  Ok(#(key, rec.grant))
                }
                grant.Session -> Error(Nil)
              }
            })
          ref.update(store.memory, fn(mem) {
            list.fold(persistent_entries, mem, fn(acc, entry) {
              dict.insert(acc, entry.0, entry.1)
            })
          })
          Nil
        }
        Error(_) -> Nil
      }
    }
  }
}

fn make_key(plugin_id: PluginId, cap: Capability, scope: String) -> String {
  make_key_string(
    plugin_id.to_string(plugin_id),
    capability.to_string(cap),
    scope,
  )
}

fn make_key_string(
  plugin_id: String,
  category: String,
  scope: String,
) -> String {
  let s = case scope {
    "" -> "*"
    _ -> scope
  }
  plugin_id <> "::" <> category <> "::" <> s
}

fn records_decoder() -> decode.Decoder(List(StoredRecord)) {
  let record_decoder = {
    use plugin_id <- decode.field("pluginId", decode.string)
    use category <- decode.field("category", decode.string)
    use scope <- decode.optional_field(
      "scope",
      None,
      decode.optional(decode.string),
    )
    use grant_str <- decode.field("grant", decode.string)
    case grant.parse(grant_str) {
      Ok(g) ->
        decode.success(StoredRecord(
          plugin_id: plugin_id,
          category: category,
          scope: scope,
          grant: g,
        ))
      Error(Nil) ->
        decode.failure(StoredRecord("", "", None, grant.Deny), "valid Grant")
    }
  }
  decode.list(record_decoder)
}

fn parse_records(raw: String) -> Result(List(StoredRecord), Nil) {
  json.parse(raw, records_decoder())
  |> result.replace_error(Nil)
}
