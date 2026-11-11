import gleam/dynamic.{type Dynamic}
import omni/interop/acl

fn undefined() -> Dynamic {
  dynamic.nil()
}

fn null() -> Dynamic {
  dynamic.nil()
}

fn grant(name: String) -> Dynamic {
  dynamic.string(name)
}

/// Build `{kind, tags}` details as the TS caller would pass them.
fn details(kind: Int, tags: List(Dynamic)) -> Dynamic {
  dynamic.properties([
    #(dynamic.string("kind"), dynamic.int(kind)),
    #(dynamic.string("tags"), dynamic.list(tags)),
  ])
}

fn tag(items: List(Dynamic)) -> Dynamic {
  dynamic.list(items)
}

pub fn unknown_category_fails_closed_test() {
  assert acl.decide("nostr:teleport", undefined(), grant("always")) == "deny"
}

pub fn no_grant_prompts_test() {
  assert acl.decide("storage:kv", undefined(), null()) == "prompt"
}

pub fn stored_grants_test() {
  assert acl.decide("storage:kv", undefined(), grant("always")) == "allow"
  assert acl.decide("storage:kv", undefined(), grant("session")) == "allow"
  assert acl.decide("storage:kv", undefined(), grant("deny")) == "deny"
}

pub fn garbage_grant_is_treated_as_missing_test() {
  assert acl.decide("storage:kv", undefined(), grant("bogus")) == "prompt"
  assert acl.decide("storage:kv", undefined(), dynamic.int(42)) == "prompt"
}

pub fn reserved_workspace_tag_denied_even_with_always_grant_test() {
  let details =
    details(30_078, [
      tag([dynamic.string("d"), dynamic.string("omni/workspace/v1")]),
    ])
  assert acl.decide("nostr:sign", details, grant("always")) == "deny"
  assert acl.decide("nostr:write", details, grant("always")) == "deny"
}

pub fn malformed_tags_cannot_bypass_reservation_test() {
  // Non-array entries and extra non-string elements are skipped, not fatal.
  let details =
    details(30_078, [
      dynamic.nil(),
      dynamic.int(7),
      tag([dynamic.string("x")]),
      tag([dynamic.string("d"), dynamic.string("omni:x"), dynamic.int(5)]),
    ])
  assert acl.decide("nostr:sign", details, grant("always")) == "deny"
}

pub fn non_string_d_tag_value_is_not_reserved_test() {
  let details = details(30_078, [tag([dynamic.string("d"), dynamic.int(5)])])
  assert acl.decide("nostr:sign", details, grant("always")) == "allow"
}

pub fn first_d_tag_wins_test() {
  let details =
    details(30_078, [
      tag([dynamic.string("d"), dynamic.string("fine")]),
      tag([dynamic.string("d"), dynamic.string("omni")]),
    ])
  assert acl.decide("nostr:sign", details, grant("always")) == "allow"
}

pub fn read_filter_test() {
  assert acl.decide_read(1, null(), null()) == "check"
  assert acl.decide_read(4, null(), null()) == "deny"
  assert acl.decide_read(4, grant("session"), null()) == "allow"
  assert acl.decide_read(1059, null(), grant("always")) == "allow"
}
