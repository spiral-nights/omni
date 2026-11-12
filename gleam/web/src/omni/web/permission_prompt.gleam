//// Bridge between kernel ACL prompts and the shell permission modal.

import gleam/dict.{type Dict}
import gleam/int
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{None, Some}
import omni/kernel/acl/engine
import omni/platform/ref.{type Ref}
import omni/protocol/capability
import omni/protocol/grant.{type Grant, Always, Deny}
import omni/protocol/plugin_id
import omni/shell/model.{type PermissionPromptState, PermissionPromptState}

/// Pending permission prompts: resolver per prompt id plus UI listeners.
pub type PermissionPrompts {
  PermissionPrompts(
    next_id: Ref(Int),
    pending: Ref(Dict(Int, fn(Bool) -> Nil)),
    listeners: Ref(List(fn(PermissionPromptState) -> Nil)),
  )
}

pub fn new() -> PermissionPrompts {
  PermissionPrompts(
    next_id: ref.new(1),
    pending: ref.new(dict.new()),
    listeners: ref.new([]),
  )
}

/// Build the kernel prompt handler: shows a shell prompt and resolves when the
/// user allows or denies.
pub fn handler(prompts: PermissionPrompts) -> engine.PromptHandler {
  fn(plugin, capability_, kind, d_tag) -> Promise(Grant) {
    let prompt_id = ref.get(prompts.next_id)
    ref.update(prompts.next_id, fn(n) { n + 1 })
    let #(waiter, resolve) = promise.start()
    ref.update(prompts.pending, fn(pending) {
      dict.insert(pending, prompt_id, fn(allowed: Bool) {
        resolve(case allowed {
          True -> Always
          False -> Deny
        })
      })
    })
    let scope = case d_tag {
      Some(tag) -> Some(tag)
      None ->
        case kind {
          Some(k) -> Some(int.to_string(k))
          None -> None
        }
    }
    let state =
      PermissionPromptState(
        id: prompt_id,
        plugin_id: plugin_id.to_string(plugin),
        capability: capability.to_string(capability_),
        scope: scope,
      )
    ref.get(prompts.listeners)
    |> list.each(fn(listener) { listener(state) })
    waiter
  }
}

/// Resolve a pending prompt with the user's decision.
pub fn resolve(
  prompts: PermissionPrompts,
  prompt_id: Int,
  allowed: Bool,
) -> Nil {
  case dict.get(ref.get(prompts.pending), prompt_id) {
    Error(Nil) -> Nil
    Ok(resolve_prompt) -> {
      ref.update(prompts.pending, fn(pending) {
        dict.delete(pending, prompt_id)
      })
      resolve_prompt(allowed)
    }
  }
}

/// Listen for prompt requests. Returns an unsubscribe function.
pub fn watch(
  prompts: PermissionPrompts,
  listener: fn(PermissionPromptState) -> Nil,
) -> fn() -> Nil {
  ref.update(prompts.listeners, fn(ls) { [listener, ..ls] })
  fn() {
    ref.update(prompts.listeners, fn(ls) {
      list.filter(ls, fn(l) { l != listener })
    })
  }
}
