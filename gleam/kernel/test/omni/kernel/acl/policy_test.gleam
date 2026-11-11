import gleam/list
import gleam/option.{None, Some}
import omni/kernel/acl/policy.{Allowed, Denied, NeedsPrompt, Request}
import omni/protocol/capability
import omni/protocol/grant
import qcheck

fn plain(cap) {
  Request(capability: cap, kind: None, d_tag: None)
}

pub fn no_grant_needs_prompt_test() {
  assert policy.decide(plain(capability.StorageKv), None) == NeedsPrompt
}

pub fn always_and_session_allow_test() {
  assert policy.decide(plain(capability.StorageKv), Some(grant.Always))
    == Allowed
  assert policy.decide(plain(capability.StorageKv), Some(grant.Session))
    == Allowed
}

pub fn deny_grant_denies_test() {
  assert policy.decide(plain(capability.StorageKv), Some(grant.Deny)) == Denied
}

fn nip78(cap, d_tag) {
  Request(capability: cap, kind: Some(30_078), d_tag: Some(d_tag))
}

pub fn reserved_d_tags_denied_for_every_grant_test() {
  let grants = [None, Some(grant.Always), Some(grant.Session), Some(grant.Deny)]
  list.each([capability.NostrSign, capability.NostrWrite], fn(cap) {
    list.each(["omni", "omni/workspace/v1", "omni:settings"], fn(d) {
      list.each(grants, fn(g) {
        assert policy.decide(nip78(cap, d), g) == Denied
      })
    })
  })
}

pub fn any_omni_slash_prefix_is_reserved_property_test() {
  qcheck.run(qcheck.default_config(), qcheck.string(), fn(suffix) {
    assert policy.decide(
        nip78(capability.NostrSign, "omni/" <> suffix),
        Some(grant.Always),
      )
      == Denied
  })
}

pub fn non_reserved_nip78_follows_grant_test() {
  assert policy.decide(
      nip78(capability.NostrSign, "myapp/state"),
      Some(grant.Always),
    )
    == Allowed
  assert policy.decide(nip78(capability.NostrSign, "omnivore"), None)
    == NeedsPrompt
}

pub fn reservation_only_applies_to_kind_30078_test() {
  let other_kind =
    Request(
      capability: capability.NostrSign,
      kind: Some(1),
      d_tag: Some("omni/workspace/v1"),
    )
  assert policy.decide(other_kind, Some(grant.Always)) == Allowed
}

pub fn reservation_only_applies_to_writes_test() {
  let read =
    Request(
      capability: capability.NostrRead,
      kind: Some(30_078),
      d_tag: Some("omni/workspace/v1"),
    )
  assert policy.decide(read, Some(grant.Always)) == Allowed
}
