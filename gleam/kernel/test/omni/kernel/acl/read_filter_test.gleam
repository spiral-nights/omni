import gleam/list
import gleam/option.{None, Some}
import omni/kernel/acl/read_filter.{CheckReadPermission, ReadAllowed, ReadDenied}
import omni/protocol/grant

pub fn non_sensitive_kind_defers_to_permission_check_test() {
  assert read_filter.decide(1, None, None) == CheckReadPermission
  assert read_filter.decide(1, Some(grant.Deny), None) == CheckReadPermission
}

pub fn sensitive_kinds_denied_by_default_test() {
  list.each(read_filter.sensitive_kinds, fn(kind) {
    assert read_filter.decide(kind, None, None) == ReadDenied
  })
}

pub fn encrypt_grant_unlocks_sensitive_kinds_test() {
  list.each(read_filter.sensitive_kinds, fn(kind) {
    assert read_filter.decide(kind, Some(grant.Always), None) == ReadAllowed
    assert read_filter.decide(kind, Some(grant.Session), None) == ReadAllowed
  })
}

pub fn kind_scoped_read_grant_unlocks_sensitive_kind_test() {
  assert read_filter.decide(4, None, Some(grant.Always)) == ReadAllowed
}

pub fn deny_grants_do_not_unlock_test() {
  assert read_filter.decide(4, Some(grant.Deny), Some(grant.Deny)) == ReadDenied
}
