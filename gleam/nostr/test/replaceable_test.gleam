import gleam/int
import gleam/option.{None, Some}
import gleam/string
import omni/nostr/event.{type Event, Event}
import omni/nostr/event_id
import omni/nostr/kind
import omni/nostr/pubkey
import omni/nostr/replaceable
import qcheck

fn sample_pubkey_1() {
  let assert Ok(pk) =
    pubkey.parse(
      "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
    )
  pk
}

fn sample_pubkey_2() {
  let assert Ok(pk) =
    pubkey.parse(
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    )
  pk
}

fn make_id(hex_prefix: String) {
  let padded =
    string.slice(
      hex_prefix
        <> "0000000000000000000000000000000000000000000000000000000000000000",
      0,
      64,
    )
  let assert Ok(id) = event_id.parse(padded)
  id
}

fn make_event(
  id_prefix: String,
  pk: pubkey.Pubkey,
  created_at: Int,
  k: kind.Kind,
  tags: List(List(String)),
) -> Event {
  Event(
    id: make_id(id_prefix),
    pubkey: pk,
    created_at: created_at,
    kind: k,
    tags: tags,
    content: "replaceable test",
    sig: "sig",
  )
}

pub fn is_replaceable_test() {
  assert replaceable.is_replaceable(kind.Metadata) == True
  assert replaceable.is_replaceable(kind.ContactList) == True
  assert replaceable.is_replaceable(kind.RelayList) == True
  assert replaceable.is_replaceable(kind.from_int(10_000)) == True
  assert replaceable.is_replaceable(kind.from_int(19_999)) == True

  assert replaceable.is_replaceable(kind.Note) == False
  assert replaceable.is_replaceable(kind.from_int(20_000)) == False
  assert replaceable.is_replaceable(kind.AppData) == False
}

pub fn is_addressable_test() {
  assert replaceable.is_addressable(kind.Bookmark) == True
  assert replaceable.is_addressable(kind.Longform) == True
  assert replaceable.is_addressable(kind.AppData) == True
  assert replaceable.is_addressable(kind.from_int(39_999)) == True

  assert replaceable.is_addressable(kind.Metadata) == False
  assert replaceable.is_addressable(kind.Note) == False
  assert replaceable.is_addressable(kind.RelayList) == False
  assert replaceable.is_addressable(kind.from_int(40_000)) == False
}

pub fn is_ephemeral_test() {
  assert replaceable.is_ephemeral(kind.from_int(20_000)) == True
  assert replaceable.is_ephemeral(kind.from_int(29_999)) == True
  assert replaceable.is_ephemeral(kind.Note) == False
}

pub fn d_tag_and_coordinate_test() {
  let pk = sample_pubkey_1()
  let ev1 =
    make_event("aaaa", pk, 1000, kind.AppData, [["d", "omni/workspace/v1"]])
  assert replaceable.get_d_tag(ev1) == "omni/workspace/v1"
  assert replaceable.coordinate(ev1)
    == Some(
      "30078:3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d:omni/workspace/v1",
    )

  let ev2 = make_event("bbbb", pk, 1000, kind.AppData, [])
  assert replaceable.get_d_tag(ev2) == ""
  assert replaceable.coordinate(ev2)
    == Some(
      "30078:3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d:",
    )

  let ev_note = make_event("cccc", pk, 1000, kind.Note, [["d", "ignored"]])
  assert replaceable.coordinate(ev_note) == None
}

pub fn should_replace_replaceable_test() {
  let pk = sample_pubkey_1()

  let older = make_event("bbbb", pk, 1000, kind.Metadata, [])
  let newer = make_event("cccc", pk, 1001, kind.Metadata, [])

  // Newer created_at replaces older
  assert replaceable.should_replace(existing: older, incoming: newer) == True
  // Older created_at does not replace newer
  assert replaceable.should_replace(existing: newer, incoming: older) == False

  // Tie-breaker: same created_at, lower event ID wins
  let tie_low = make_event("1111", pk, 1000, kind.Metadata, [])
  let tie_high = make_event("9999", pk, 1000, kind.Metadata, [])

  assert replaceable.should_replace(existing: tie_high, incoming: tie_low)
    == True
  assert replaceable.should_replace(existing: tie_low, incoming: tie_high)
    == False

  // Same event does not replace itself
  assert replaceable.should_replace(existing: older, incoming: older) == False

  // Different author does not replace
  let other_author =
    make_event("cccc", sample_pubkey_2(), 2000, kind.Metadata, [])
  assert replaceable.should_replace(existing: older, incoming: other_author)
    == False

  // Different kind does not replace
  let different_kind = make_event("cccc", pk, 2000, kind.ContactList, [])
  assert replaceable.should_replace(existing: older, incoming: different_kind)
    == False

  // Non-replaceable kind does not replace
  let note1 = make_event("aaaa", pk, 1000, kind.Note, [])
  let note2 = make_event("bbbb", pk, 2000, kind.Note, [])
  assert replaceable.should_replace(existing: note1, incoming: note2) == False
}

pub fn should_replace_addressable_test() {
  let pk = sample_pubkey_1()

  let existing = make_event("aaaa", pk, 1000, kind.AppData, [["d", "doc-1"]])
  let newer_same_d =
    make_event("bbbb", pk, 2000, kind.AppData, [["d", "doc-1"]])
  let newer_diff_d =
    make_event("cccc", pk, 2000, kind.AppData, [["d", "doc-2"]])

  // Same d tag, newer created_at replaces
  assert replaceable.should_replace(existing: existing, incoming: newer_same_d)
    == True

  // Different d tag does not replace, even if newer!
  assert replaceable.should_replace(existing: existing, incoming: newer_diff_d)
    == False

  // Tie-breaker for addressable events
  let tie_high = make_event("9999", pk, 1000, kind.AppData, [["d", "doc-1"]])
  let tie_low = make_event("1111", pk, 1000, kind.AppData, [["d", "doc-1"]])

  assert replaceable.should_replace(existing: tie_high, incoming: tie_low)
    == True
  assert replaceable.should_replace(existing: tie_low, incoming: tie_high)
    == False
}

pub fn qcheck_irreflexive_replacement_test() {
  let pk = sample_pubkey_1()
  let event_gen =
    qcheck.tuple2(
      qcheck.bounded_int(0, 2_000_000_000),
      qcheck.bounded_int(0, 9999),
    )

  qcheck.run(qcheck.default_config(), event_gen, fn(tuple) {
    let #(timestamp, prefix_num) = tuple
    let prefix = "aa" <> int.to_string(prefix_num)
    let ev = make_event(prefix, pk, timestamp, kind.Metadata, [])
    assert replaceable.should_replace(existing: ev, incoming: ev) == False
  })
}

pub fn qcheck_asymmetry_and_strict_order_test() {
  let pk = sample_pubkey_1()
  let pair_gen =
    qcheck.tuple2(
      qcheck.bounded_int(0, 1_000_000),
      qcheck.bounded_int(1_000_001, 2_000_000),
    )

  qcheck.run(qcheck.default_config(), pair_gen, fn(tuple) {
    let #(time1, time2) = tuple
    let ev1 = make_event("1111", pk, time1, kind.Metadata, [])
    let ev2 = make_event("2222", pk, time2, kind.Metadata, [])

    // ev2 is strictly newer than ev1
    assert replaceable.should_replace(existing: ev1, incoming: ev2) == True
    assert replaceable.should_replace(existing: ev2, incoming: ev1) == False
  })
}

pub fn qcheck_transitivity_test() {
  let pk = sample_pubkey_1()
  let times_gen =
    qcheck.tuple3(
      qcheck.bounded_int(100, 200),
      qcheck.bounded_int(300, 400),
      qcheck.bounded_int(500, 600),
    )

  qcheck.run(qcheck.default_config(), times_gen, fn(tuple) {
    let #(t1, t2, t3) = tuple
    let ev1 = make_event("aaaa", pk, t1, kind.Metadata, [])
    let ev2 = make_event("bbbb", pk, t2, kind.Metadata, [])
    let ev3 = make_event("cccc", pk, t3, kind.Metadata, [])

    // t1 < t2 < t3 => ev2 replaces ev1, ev3 replaces ev2, so ev3 replaces ev1
    let r12 = replaceable.should_replace(existing: ev1, incoming: ev2)
    let r23 = replaceable.should_replace(existing: ev2, incoming: ev3)
    let r13 = replaceable.should_replace(existing: ev1, incoming: ev3)

    assert r12 == True
    assert r23 == True
    assert r13 == True
  })
}
