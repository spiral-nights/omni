import gleam/javascript/promise
import gleam/option.{None, Some}
import omni/kernel/acl/capability_store
import omni/kernel/acl/engine.{AclEngine}
import omni/kernel/acl/policy
import omni/nostr/kind
import omni/platform/ref
import omni/platform/storage
import omni/protocol/capability
import omni/protocol/grant
import omni/protocol/plugin_id

fn make_plugin_id(id: String) -> plugin_id.PluginId {
  let assert Ok(pid) = plugin_id.parse(id)
  pid
}

pub fn check_permission_with_existing_grant_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")
  let eng = engine.new(store, None)

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
    None,
  )
  capability_store.set_grant(
    store,
    plugin,
    capability.StorageKv,
    grant.Deny,
    None,
  )

  use allowed_always <- promise.await(engine.check_permission(
    eng,
    plugin,
    policy.Request(capability: capability.NostrRead, kind: None, d_tag: None),
  ))
  assert allowed_always == True

  use allowed_session <- promise.await(engine.check_permission(
    eng,
    plugin,
    policy.Request(capability: capability.NostrWrite, kind: None, d_tag: None),
  ))
  assert allowed_session == True

  use denied <- promise.await(engine.check_permission(
    eng,
    plugin,
    policy.Request(capability: capability.StorageKv, kind: None, d_tag: None),
  ))
  assert denied == False

  promise.resolve(Nil)
}

pub fn check_permission_without_grant_and_no_prompt_handler_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")
  let eng = engine.new(store, None)

  use res <- promise.await(engine.check_permission(
    eng,
    plugin,
    policy.Request(capability: capability.StorageKv, kind: None, d_tag: None),
  ))
  assert res == False

  promise.resolve(Nil)
}

pub fn check_permission_with_prompt_handler_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")

  let prompt_calls = ref.new(0)
  let handler = fn(_pid, _cap, _kind, _d_tag) {
    ref.update(prompt_calls, fn(c) { c + 1 })
    promise.resolve(grant.Always)
  }

  let eng = engine.new(store, Some(handler))
  let req =
    policy.Request(capability: capability.StorageKv, kind: None, d_tag: None)

  // First call invokes prompt handler
  use res1 <- promise.await(engine.check_permission(eng, plugin, req))
  assert res1 == True
  assert ref.get(prompt_calls) == 1

  // Second call uses stored grant, prompt handler is not invoked
  use res2 <- promise.await(engine.check_permission(eng, plugin, req))
  assert res2 == True
  assert ref.get(prompt_calls) == 1

  // Grant was persisted in store
  assert capability_store.get_grant(
      store,
      plugin,
      capability.StorageKv,
      None,
      True,
    )
    == Some(grant.Always)

  promise.resolve(Nil)
}

pub fn prompt_handler_receives_details_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.checklist")

  let recorded = ref.new(#(capability.StorageKv, None, None))
  let handler = fn(_pid, cap, k, d) {
    ref.set(recorded, #(cap, k, d))
    promise.resolve(grant.Session)
  }

  let eng = engine.new(store, Some(handler))
  let req =
    policy.Request(
      capability: capability.NostrWrite,
      kind: Some(30_000),
      d_tag: Some("checklist:daily"),
    )

  use res <- promise.await(engine.check_permission(eng, plugin, req))
  assert res == True
  assert ref.get(recorded)
    == #(capability.NostrWrite, Some(30_000), Some("checklist:daily"))

  promise.resolve(Nil)
}

pub fn prompt_handler_deny_stores_denial_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")

  let handler = fn(_pid, _cap, _kind, _d_tag) { promise.resolve(grant.Deny) }

  let eng = engine.new(store, Some(handler))
  let req =
    policy.Request(
      capability: capability.SystemGeolocation,
      kind: None,
      d_tag: None,
    )

  use res <- promise.await(engine.check_permission(eng, plugin, req))
  assert res == False
  assert capability_store.get_grant(
      store,
      plugin,
      capability.SystemGeolocation,
      None,
      True,
    )
    == Some(grant.Deny)

  promise.resolve(Nil)
}

pub fn reserved_rules_block_even_with_always_grant_and_prompt_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")

  // Pre-grant Always for NostrWrite
  capability_store.set_grant(
    store,
    plugin,
    capability.NostrWrite,
    grant.Always,
    None,
  )

  let prompt_called = ref.new(False)
  let handler = fn(_pid, _cap, _kind, _d_tag) {
    ref.set(prompt_called, True)
    promise.resolve(grant.Always)
  }

  let eng = engine.new(store, Some(handler))
  let reserved_req =
    policy.Request(
      capability: capability.NostrWrite,
      kind: Some(30_078),
      d_tag: Some("omni/workspace/v1"),
    )

  use res <- promise.await(engine.check_permission(eng, plugin, reserved_req))
  assert res == False
  assert ref.get(prompt_called) == False

  promise.resolve(Nil)
}

pub fn record_updates_and_modifiers_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")
  let eng = engine.new(store, None)

  let handler = fn(_pid, _cap, _kind, _d_tag) { promise.resolve(grant.Always) }

  // Using helper
  let with_handler = engine.with_prompt_handler(eng, handler)
  assert option.is_some(with_handler.prompt_handler)

  let without_handler = engine.without_prompt_handler(with_handler)
  assert without_handler.prompt_handler == None

  // Using concise record update syntax
  let updated_eng = AclEngine(..eng, prompt_handler: Some(handler))
  assert option.is_some(updated_eng.prompt_handler)

  use res <- promise.await(engine.check_permission(
    updated_eng,
    plugin,
    policy.Request(capability: capability.StorageKv, kind: None, d_tag: None),
  ))
  assert res == True

  promise.resolve(Nil)
}

pub fn can_read_event_non_sensitive_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")
  let eng = engine.new(store, None)

  // With stored NostrRead grant
  capability_store.set_grant(
    store,
    plugin,
    capability.NostrRead,
    grant.Always,
    None,
  )

  use can_read_note <- promise.await(engine.can_read_event(
    eng,
    plugin,
    kind.Note,
  ))
  assert can_read_note == True

  use can_read_meta <- promise.await(engine.can_read_event(
    eng,
    plugin,
    kind.Metadata,
  ))
  assert can_read_meta == True

  promise.resolve(Nil)
}

pub fn can_read_event_sensitive_denied_with_wildcard_read_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.feed")
  let eng = engine.new(store, None)

  // Only wildcard nostr:read
  capability_store.set_grant(
    store,
    plugin,
    capability.NostrRead,
    grant.Always,
    None,
  )

  // Sensitive kinds (DirectMessage = 4, Seal = 14, GiftWrap = 1059) fail closed
  use can_read_dm <- promise.await(engine.can_read_event(
    eng,
    plugin,
    kind.DirectMessage,
  ))
  assert can_read_dm == False

  use can_read_seal <- promise.await(engine.can_read_event(
    eng,
    plugin,
    kind.Seal,
  ))
  assert can_read_seal == False

  use can_read_wrap <- promise.await(engine.can_read_event(
    eng,
    plugin,
    kind.GiftWrap,
  ))
  assert can_read_wrap == False

  promise.resolve(Nil)
}

pub fn can_read_event_sensitive_allowed_with_encrypt_grant_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.notes")
  let eng = engine.new(store, None)

  // Grant NostrEncrypt
  capability_store.set_grant(
    store,
    plugin,
    capability.NostrEncrypt,
    grant.Always,
    None,
  )

  use can_read_dm <- promise.await(engine.can_read_event(
    eng,
    plugin,
    kind.DirectMessage,
  ))
  assert can_read_dm == True

  use can_read_wrap <- promise.await(engine.can_read_event(
    eng,
    plugin,
    kind.GiftWrap,
  ))
  assert can_read_wrap == True

  promise.resolve(Nil)
}

pub fn can_read_event_sensitive_allowed_with_exact_kind_grant_test() {
  let s = storage.in_memory()
  let store = capability_store.new(s)
  let plugin = make_plugin_id("org.omni.plugin.notes")
  let eng = engine.new(store, None)

  // Grant exact NostrRead scoped to kind 4 only
  capability_store.set_grant(
    store,
    plugin,
    capability.NostrRead,
    grant.Always,
    Some("4"),
  )

  // Kind 4 is permitted
  use can_read_dm <- promise.await(engine.can_read_event(
    eng,
    plugin,
    kind.DirectMessage,
  ))
  assert can_read_dm == True

  // Kind 1059 is still denied
  use can_read_wrap <- promise.await(engine.can_read_event(
    eng,
    plugin,
    kind.GiftWrap,
  ))
  assert can_read_wrap == False

  promise.resolve(Nil)
}
