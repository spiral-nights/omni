import gleam/dict
import gleam/option.{None, Some}
import omni/kernel/acl/capability_store.{CapabilityStore}
import omni/platform/storage
import omni/protocol/capability
import omni/protocol/grant
import omni/protocol/plugin_id

fn make_plugin_id(id: String) -> plugin_id.PluginId {
  let assert Ok(pid) = plugin_id.parse(id)
  pid
}

pub fn fresh_store_is_empty_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")

  assert capability_store.get_grant(
      store,
      plugin,
      capability.NostrRead,
      None,
      True,
    )
    == None
  assert capability_store.get_all_grants(store, plugin) == dict.new()
}

pub fn always_grant_persists_test() {
  let s = storage.in_memory()
  let store1 = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")

  capability_store.set_grant(
    store1,
    plugin,
    capability.NostrRead,
    grant.Always,
    None,
  )

  assert capability_store.get_grant(
      store1,
      plugin,
      capability.NostrRead,
      None,
      True,
    )
    == Some(grant.Always)

  // Re-load into a separate store instance to verify persistence
  let store2 = capability_store.new(s)
  assert capability_store.get_grant(
      store2,
      plugin,
      capability.NostrRead,
      None,
      True,
    )
    == Some(grant.Always)
}

pub fn session_grant_does_not_persist_test() {
  let s = storage.in_memory()
  let store1 = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.notes")

  capability_store.set_grant(
    store1,
    plugin,
    capability.StorageKv,
    grant.Session,
    None,
  )

  // Present in active session
  assert capability_store.get_grant(
      store1,
      plugin,
      capability.StorageKv,
      None,
      True,
    )
    == Some(grant.Session)

  // Gone after reloading store from storage
  let store2 = capability_store.new(s)
  assert capability_store.get_grant(
      store2,
      plugin,
      capability.StorageKv,
      None,
      True,
    )
    == None
}

pub fn deny_grant_persists_test() {
  let s = storage.in_memory()
  let store1 = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.relays")

  capability_store.set_grant(
    store1,
    plugin,
    capability.RelaysManage,
    grant.Deny,
    None,
  )

  assert capability_store.get_grant(
      store1,
      plugin,
      capability.RelaysManage,
      None,
      True,
    )
    == Some(grant.Deny)

  let store2 = capability_store.new(s)
  assert capability_store.get_grant(
      store2,
      plugin,
      capability.RelaysManage,
      None,
      True,
    )
    == Some(grant.Deny)
}

pub fn scoped_grants_and_wildcard_fallback_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")

  // Grant specific scope for kind 1
  capability_store.set_grant(
    store,
    plugin,
    capability.NostrWrite,
    grant.Always,
    Some("1"),
  )

  // Exact match for kind 1 succeeds with or without wildcard
  assert capability_store.get_grant(
      store,
      plugin,
      capability.NostrWrite,
      Some("1"),
      True,
    )
    == Some(grant.Always)
  assert capability_store.get_grant(
      store,
      plugin,
      capability.NostrWrite,
      Some("1"),
      False,
    )
    == Some(grant.Always)

  // Querying kind 4 has no exact match and no wildcard yet
  assert capability_store.get_grant(
      store,
      plugin,
      capability.NostrWrite,
      Some("4"),
      True,
    )
    == None

  // Now set wildcard grant for nostr:write
  capability_store.set_grant(
    store,
    plugin,
    capability.NostrWrite,
    grant.Session,
    None,
  )

  // Querying kind 4 with allow_wildcard: True falls back to wildcard
  assert capability_store.get_grant(
      store,
      plugin,
      capability.NostrWrite,
      Some("4"),
      True,
    )
    == Some(grant.Session)

  // Querying kind 4 with allow_wildcard: False does NOT fall back
  assert capability_store.get_grant(
      store,
      plugin,
      capability.NostrWrite,
      Some("4"),
      False,
    )
    == None
}

pub fn specific_scope_overrides_wildcard_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")

  // Broad wildcard grant
  capability_store.set_grant(
    store,
    plugin,
    capability.NostrRead,
    grant.Always,
    None,
  )
  // Specific scope denial
  capability_store.set_grant(
    store,
    plugin,
    capability.NostrRead,
    grant.Deny,
    Some("4"),
  )

  assert capability_store.get_grant(
      store,
      plugin,
      capability.NostrRead,
      Some("4"),
      True,
    )
    == Some(grant.Deny)
  assert capability_store.get_grant(
      store,
      plugin,
      capability.NostrRead,
      Some("1"),
      True,
    )
    == Some(grant.Always)
}

pub fn revoke_capability_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin_a = make_plugin_id("org.omni.plugin.feed")
  let plugin_b = make_plugin_id("org.omni.plugin.notes")

  capability_store.set_grant(
    store,
    plugin_a,
    capability.NostrRead,
    grant.Always,
    None,
  )
  capability_store.set_grant(
    store,
    plugin_a,
    capability.NostrWrite,
    grant.Always,
    None,
  )
  capability_store.set_grant(
    store,
    plugin_b,
    capability.NostrRead,
    grant.Always,
    None,
  )

  // Revoke only NostrRead on plugin_a
  capability_store.revoke(store, plugin_a, Some(capability.NostrRead))

  assert capability_store.get_grant(
      store,
      plugin_a,
      capability.NostrRead,
      None,
      True,
    )
    == None
  assert capability_store.get_grant(
      store,
      plugin_a,
      capability.NostrWrite,
      None,
      True,
    )
    == Some(grant.Always)
  assert capability_store.get_grant(
      store,
      plugin_b,
      capability.NostrRead,
      None,
      True,
    )
    == Some(grant.Always)

  // Revoke everything for plugin_a
  capability_store.revoke(store, plugin_a, None)
  assert capability_store.get_grant(
      store,
      plugin_a,
      capability.NostrWrite,
      None,
      True,
    )
    == None
  assert capability_store.get_grant(
      store,
      plugin_b,
      capability.NostrRead,
      None,
      True,
    )
    == Some(grant.Always)

  // Verify revocation persisted across reloads
  let reloaded = capability_store.new(s)
  assert capability_store.get_grant(
      reloaded,
      plugin_a,
      capability.NostrWrite,
      None,
      True,
    )
    == None
  assert capability_store.get_grant(
      reloaded,
      plugin_b,
      capability.NostrRead,
      None,
      True,
    )
    == Some(grant.Always)
}

pub fn get_all_grants_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")
  let other = make_plugin_id("org.omni.plugin.other")

  capability_store.set_grant(
    store,
    plugin,
    capability.NostrRead,
    grant.Always,
    None,
  )
  capability_store.set_grant(
    store,
    plugin,
    capability.NostrWrite,
    grant.Session,
    Some("1"),
  )
  capability_store.set_grant(
    store,
    other,
    capability.StorageKv,
    grant.Always,
    None,
  )

  let grants = capability_store.get_all_grants(store, plugin)
  assert dict.get(grants, "nostr:read:*") == Ok(grant.Always)
  assert dict.get(grants, "nostr:write:1") == Ok(grant.Session)
  assert dict.get(grants, "storage:kv:*") == Error(Nil)
}

pub fn custom_key_and_record_update_test() {
  let s = storage.in_memory()
  let store = capability_store.new_with_key(s, "custom_grants_key")
  assert store.storage_key == "custom_grants_key"

  let updated = CapabilityStore(..store, storage_key: "updated_key")
  assert updated.storage_key == "updated_key"
}

pub fn corrupted_storage_loads_cleanly_test() {
  let s = storage.in_memory()
  let _ = storage.set(s, capability_store.default_storage_key, "invalid {json")

  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")
  assert capability_store.get_all_grants(store, plugin) == dict.new()
}
