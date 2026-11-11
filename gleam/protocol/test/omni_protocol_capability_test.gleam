import gleam/list
import omni/protocol/capability
import omni/protocol/grant.{Always, Deny, Session}

const all_capabilities = [
  capability.NostrRead,
  capability.NostrWrite,
  capability.NostrSign,
  capability.NostrEncrypt,
  capability.StorageKv,
  capability.IntentsDispatch,
  capability.IntentsHandle,
  capability.RelaysManage,
  capability.IdentityManageKeys,
  capability.SystemGeolocation,
]

pub fn capability_round_trip_test() {
  assert all_capabilities
    == list.map(all_capabilities, fn(c) {
      let assert Ok(parsed) = capability.parse(capability.to_string(c))
      parsed
    })
}

pub fn capability_rejects_unknown_test() {
  assert capability.parse("nostr:teleport") == Error(Nil)
}

pub fn grant_round_trip_test() {
  assert grant.parse("always") == Ok(Always)
  assert grant.parse("session") == Ok(Session)
  assert grant.parse("deny") == Ok(Deny)
  assert grant.parse("maybe") == Error(Nil)
}

pub fn grant_permits_test() {
  assert grant.permits(Always)
  assert grant.permits(Session)
  assert !grant.permits(Deny)
}
