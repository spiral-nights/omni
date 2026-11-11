import gleam/list
import omni/nostr/kind.{
  AppData, Bookmark, ContactList, DirectMessage, GiftWrap, Longform, Metadata,
  Note, Other, Reaction, RelayList, Repost, Seal, Zap,
}

pub fn standard_kinds_round_trip_test() {
  let standard = [
    #(Metadata, 0),
    #(Note, 1),
    #(ContactList, 3),
    #(DirectMessage, 4),
    #(Repost, 6),
    #(Reaction, 7),
    #(Seal, 14),
    #(GiftWrap, 1059),
    #(Zap, 9735),
    #(RelayList, 10_002),
    #(Bookmark, 30_000),
    #(Longform, 30_023),
    #(AppData, 30_078),
  ]

  list.each(standard, fn(pair) {
    let #(k, code) = pair
    assert kind.to_int(k) == code
    assert kind.from_int(code) == k
  })
}

pub fn custom_other_kind_test() {
  assert kind.from_int(42) == Other(42)
  assert kind.to_int(Other(42)) == 42
  assert kind.from_int(31_999) == Other(31_999)
}

pub fn sensitive_kinds_test() {
  assert kind.is_sensitive(DirectMessage)
  assert kind.is_sensitive(Seal)
  assert kind.is_sensitive(GiftWrap)
  assert kind.is_sensitive(Other(4))
  assert kind.is_sensitive(Other(14))
  assert kind.is_sensitive(Other(1059))

  assert !kind.is_sensitive(Metadata)
  assert !kind.is_sensitive(Note)
  assert !kind.is_sensitive(ContactList)
  assert !kind.is_sensitive(Reaction)
  assert !kind.is_sensitive(AppData)
  assert !kind.is_sensitive(Other(100))
}
