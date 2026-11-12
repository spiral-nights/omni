//// Re-export of the shared NIP-65 parser for host call sites.

import omni/nostr/nip65

pub type RelayHint =
  nip65.RelayHint

pub fn parse_tags(tags: List(List(String))) -> List(RelayHint) {
  nip65.parse_tags(tags)
}

pub fn read_relays(tags: List(List(String))) -> List(String) {
  nip65.read_relays(tags)
}
