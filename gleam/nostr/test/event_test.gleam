import gleam/option.{None, Some}
import omni/nostr/event.{Event, UnsignedEvent}
import omni/nostr/event_id
import omni/nostr/kind
import omni/nostr/pubkey

pub fn tag_helpers_test() {
  let tags = [
    ["e", "event_id_1", "wss://relay.damus.io"],
    ["p", "pubkey_1"],
    ["d", "my-identifier"],
    ["p", "pubkey_2"],
    ["custom", "value1", "value2"],
  ]

  assert event.get_tags(tags, "p") == [["p", "pubkey_1"], ["p", "pubkey_2"]]
  assert event.get_tags(tags, "e")
    == [
      ["e", "event_id_1", "wss://relay.damus.io"],
    ]
  assert event.get_tags(tags, "nonexistent") == []

  assert event.get_tag_values(tags, "p") == ["pubkey_1", "pubkey_2"]
  assert event.get_tag_values(tags, "e") == ["event_id_1"]
  assert event.get_tag_values(tags, "custom") == ["value1"]
  assert event.get_tag_values(tags, "nonexistent") == []

  assert event.d_tag(tags) == Some("my-identifier")
  assert event.d_tag([["e", "123"], ["p", "456"]]) == None
}

pub fn serialize_for_id_golden_test() {
  let pk_hex =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let id_hex =
    "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770"
  let assert Ok(pk) = pubkey.parse(pk_hex)
  let assert Ok(id) = event_id.parse(id_hex)

  let tags = [["e", "event1"], ["p", "pubkey1"]]
  let serialized =
    event.serialize_for_id(pk, 1_672_531_200, kind.Note, tags, "Hello Nostr")

  let expected =
    "[0,\"3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d\",1672531200,1,[[\"e\",\"event1\"],[\"p\",\"pubkey1\"]],\"Hello Nostr\"]"

  assert serialized == expected

  let signed =
    Event(
      id: id,
      pubkey: pk,
      created_at: 1_672_531_200,
      kind: kind.Note,
      tags: tags,
      content: "Hello Nostr",
      sig: "somesig",
    )
  assert event.serialize_event_for_id(signed) == expected

  let unsigned =
    UnsignedEvent(
      pubkey: Some(pk),
      created_at: 1_672_531_200,
      kind: kind.Note,
      tags: tags,
      content: "Hello Nostr",
    )
  assert event.serialize_unsigned_for_id(unsigned, pk) == expected
}
