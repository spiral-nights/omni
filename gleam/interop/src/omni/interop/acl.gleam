//// JS-facing facade over the kernel ACL policy.
////
//// TypeScript still owns grant storage and the user prompt. It passes the raw
//// category string, the loosely-typed `details` object and the stored grant;
//// this facade parses them (never trusting their shape) and returns a plain
//// string verdict. Anything that cannot be parsed fails closed.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import omni/kernel/acl/policy
import omni/kernel/acl/read_filter
import omni/protocol/capability
import omni/protocol/grant.{type Grant}

/// Decide a permission request. Returns `"allow"`, `"deny"` or `"prompt"`.
///
/// `details` is the untyped object passed to `checkPermission` (may be
/// `undefined`); `existing_grant` is the stored grant string or `null`.
pub fn decide(
  category: String,
  details: Dynamic,
  existing_grant: Dynamic,
) -> String {
  case capability.parse(category) {
    Error(Nil) -> "deny"
    Ok(cap) -> {
      let request =
        policy.Request(
          capability: cap,
          kind: kind_of(details),
          d_tag: d_tag_of(details),
        )
      case policy.decide(request, grant_of(existing_grant)) {
        policy.Allowed -> "allow"
        policy.Denied -> "deny"
        policy.NeedsPrompt -> "prompt"
      }
    }
  }
}

/// Decide whether an event of `kind` can be read. Returns `"allow"`, `"deny"`
/// or `"check"` (fall back to the regular `nostr:read` permission check).
pub fn decide_read(
  kind: Int,
  encrypt_grant: Dynamic,
  kind_grant: Dynamic,
) -> String {
  case read_filter.decide(kind, grant_of(encrypt_grant), grant_of(kind_grant)) {
    read_filter.ReadAllowed -> "allow"
    read_filter.ReadDenied -> "deny"
    read_filter.CheckReadPermission -> "check"
  }
}

fn grant_of(value: Dynamic) -> Option(Grant) {
  decode.run(value, decode.string)
  |> result.replace_error(Nil)
  |> result.try(grant.parse)
  |> option.from_result
}

fn kind_of(details: Dynamic) -> Option(Int) {
  decode.run(details, decode.at(["kind"], decode.int))
  |> option.from_result
}

/// The second element of the first `["d", ...]` tag, mirroring the existing
/// behaviour: malformed tags are skipped, a non-string value yields `None`.
fn d_tag_of(details: Dynamic) -> Option(String) {
  decode.run(details, decode.at(["tags"], decode.list(decode.dynamic)))
  |> result.unwrap([])
  |> list.filter_map(fn(tag) { decode.run(tag, decode.list(decode.dynamic)) })
  |> list.find(fn(tag) { string_at(tag, 0) == Some("d") })
  |> result.map(fn(tag) { string_at(tag, 1) })
  |> result.unwrap(None)
}

fn string_at(items: List(Dynamic), index: Int) -> Option(String) {
  items
  |> list.drop(index)
  |> list.first
  |> result.try(fn(item) {
    decode.run(item, decode.string) |> result.replace_error(Nil)
  })
  |> option.from_result
}
