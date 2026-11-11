//// Which stored events a plugin may read.
////
//// Encrypted direct-message kinds are filtered out unless the user has
//// explicitly granted access; everything else defers to the normal
//// `nostr:read` permission check.

import gleam/list
import gleam/option.{type Option, None, Some}
import omni/protocol/grant.{type Grant}

/// Kinds that carry private messages: NIP-04 DMs (4), NIP-17 seals/wraps
/// (14, 1059).
pub const sensitive_kinds = [4, 1059, 14]

/// Result of the read filter for one event.
pub type ReadDecision {
  ReadAllowed
  ReadDenied
  /// Not sensitive: fall back to the regular `nostr:read` permission check.
  CheckReadPermission
}

/// Decide whether an event of `kind` may be read.
///
/// - `encrypt_grant`: the plugin's `nostr:encrypt` grant (any scope).
/// - `kind_grant`: an *exact* `nostr:read` grant scoped to this kind (a
///   wildcard grant does not unlock sensitive kinds).
pub fn decide(
  kind: Int,
  encrypt_grant: Option(Grant),
  kind_grant: Option(Grant),
) -> ReadDecision {
  case list.contains(sensitive_kinds, kind) {
    False -> CheckReadPermission
    True ->
      case permits(encrypt_grant) || permits(kind_grant) {
        True -> ReadAllowed
        False -> ReadDenied
      }
  }
}

fn permits(grant: Option(Grant)) -> Bool {
  case grant {
    Some(g) -> grant.permits(g)
    None -> False
  }
}
