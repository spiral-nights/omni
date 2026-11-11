//// Pure permission policy.
////
//// `decide` contains every rule that turns a request plus the stored grant
//// into a decision. It performs no I/O: looking up grants and prompting the
//// user are the caller's job (the ACL engine), which keeps this module trivial
//// to test exhaustively.

import gleam/option.{type Option, None, Some}
import gleam/string
import omni/protocol/capability.{type Capability}
import omni/protocol/grant.{type Grant, Always, Session}

/// NIP-78 application-data kind, also used for host workspace sync.
const nip78_kind = 30_078

/// What a plugin is asking to do.
pub type Request {
  Request(
    capability: Capability,
    /// The event kind involved, when the action concerns one.
    kind: Option(Int),
    /// The `d` tag of the event involved, when it has one.
    d_tag: Option(String),
  )
}

/// The outcome of evaluating a request against stored state.
pub type Decision {
  Allowed
  Denied
  /// No stored answer exists; the user should be asked.
  NeedsPrompt
}

/// Decide a request given the user's stored grant, if any.
///
/// Reserved host identifiers are refused before any grant is consulted, so no
/// stored grant (or prompt answer) can ever authorise them.
pub fn decide(request: Request, existing: Option(Grant)) -> Decision {
  case is_reserved(request) {
    True -> Denied
    False ->
      case existing {
        Some(Always) | Some(Session) -> Allowed
        Some(grant.Deny) -> Denied
        None -> NeedsPrompt
      }
  }
}

/// True when the request would write a NIP-78 record whose `d` tag is reserved
/// for host workspace synchronisation (`omni`, `omni/...`, `omni:...`).
///
/// Defence against plugins tampering with the host's own synced state.
pub fn is_reserved(request: Request) -> Bool {
  let writes = case request.capability {
    capability.NostrSign | capability.NostrWrite -> True
    _ -> False
  }
  case writes, request.kind, request.d_tag {
    True, Some(kind), Some(d_tag) if kind == nip78_kind ->
      d_tag == "omni"
      || string.starts_with(d_tag, "omni/")
      || string.starts_with(d_tag, "omni:")
    _, _, _ -> False
  }
}
