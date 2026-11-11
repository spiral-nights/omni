//// Capability-based access control engine.
////
//// Evaluates capability requests against stored grants and pure policy rules,
//// delegating to an asynchronous prompt handler when no stored grant exists.

import gleam/int
import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option, None, Some}
import omni/kernel/acl/capability_store.{type CapabilityStore} as cap_store
import omni/kernel/acl/policy
import omni/kernel/acl/read_filter
import omni/nostr/kind.{type Kind}
import omni/protocol/capability.{type Capability}
import omni/protocol/grant.{type Grant}
import omni/protocol/plugin_id.{type PluginId}

/// Asynchronous callback invoked when a permission request requires user interaction.
pub type PromptHandler =
  fn(PluginId, Capability, Option(Int), Option(String)) -> Promise(Grant)

/// Orchestrator for capability access control.
pub type AclEngine {
  AclEngine(store: CapabilityStore, prompt_handler: Option(PromptHandler))
}

/// Create a new `AclEngine` with the given store and optional prompt handler.
pub fn new(
  store: CapabilityStore,
  prompt_handler: Option(PromptHandler),
) -> AclEngine {
  AclEngine(store: store, prompt_handler: prompt_handler)
}

/// Return a copy of `engine` configured with `prompt_handler`.
pub fn with_prompt_handler(
  engine: AclEngine,
  prompt_handler: PromptHandler,
) -> AclEngine {
  AclEngine(..engine, prompt_handler: Some(prompt_handler))
}

/// Return a copy of `engine` without a prompt handler.
pub fn without_prompt_handler(engine: AclEngine) -> AclEngine {
  AclEngine(..engine, prompt_handler: None)
}

/// Check whether `plugin_id` is permitted to execute `request`.
///
/// 1. Reserved rules (such as NIP-78 host workspace sync tags) are checked
///    first. If reserved, immediately resolves to `False`.
/// 2. If a grant already exists in `store` (`Always`, `Session`, or `Deny`),
///    it is returned immediately.
/// 3. If no grant exists and a prompt handler is configured, the handler is
///    invoked. The user's decision is recorded in `store` and returned.
/// 4. If no grant exists and no prompt handler is available, resolves to `False`.
pub fn check_permission(
  engine: AclEngine,
  plugin_id: PluginId,
  request: policy.Request,
) -> Promise(Bool) {
  let scope = option.map(request.kind, int.to_string)
  let existing_grant =
    cap_store.get_grant(
      engine.store,
      plugin_id,
      request.capability,
      scope,
      True,
    )
  case policy.decide(request, existing_grant) {
    policy.Allowed -> promise.resolve(True)
    policy.Denied -> promise.resolve(False)
    policy.NeedsPrompt -> {
      case engine.prompt_handler {
        None -> promise.resolve(False)
        Some(prompt) -> {
          use user_choice <- promise.await(prompt(
            plugin_id,
            request.capability,
            request.kind,
            request.d_tag,
          ))
          cap_store.set_grant(
            engine.store,
            plugin_id,
            request.capability,
            user_choice,
            scope,
          )
          promise.resolve(grant.permits(user_choice))
        }
      }
    }
  }
}

/// Determine whether `plugin_id` may read an event of kind `event_kind`.
///
/// Encrypted direct-message kinds (NIP-04 kind 4, NIP-17 kind 14 and kind 1059)
/// are sensitive and strictly require either a `nostr:encrypt` grant or an
/// explicit exact grant for that specific kind (a wildcard `nostr:read` grant
/// is insufficient).
///
/// All other kinds fall back to regular `nostr:read` permission checks.
pub fn can_read_event(
  engine: AclEngine,
  plugin_id: PluginId,
  event_kind: Kind,
) -> Promise(Bool) {
  let kind_int = kind.to_int(event_kind)
  let kind_str = int.to_string(kind_int)
  let encrypt_grant =
    cap_store.get_grant(
      engine.store,
      plugin_id,
      capability.NostrEncrypt,
      None,
      True,
    )
  let kind_grant =
    cap_store.get_grant(
      engine.store,
      plugin_id,
      capability.NostrRead,
      Some(kind_str),
      False,
    )
  case read_filter.decide(kind_int, encrypt_grant, kind_grant) {
    read_filter.ReadAllowed -> promise.resolve(True)
    read_filter.ReadDenied -> promise.resolve(False)
    read_filter.CheckReadPermission -> {
      let request =
        policy.Request(
          capability: capability.NostrRead,
          kind: Some(kind_int),
          d_tag: None,
        )
      check_permission(engine, plugin_id, request)
    }
  }
}
