import gleam/option.{Some}
import omni/nostr/event.{type Event, Event}
import omni/nostr/event_id
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/pubkey
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

fn sample_id_1() {
  let assert Ok(id) =
    event_id.parse(
      "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770",
    )
  id
}

fn make_event(
  id: event_id.EventId,
  pk: pubkey.Pubkey,
  created_at: Int,
  k: kind.Kind,
  tags: List(List(String)),
  content: String,
) -> Event {
  Event(
    id: id,
    pubkey: pk,
    created_at: created_at,
    kind: k,
    tags: tags,
    content: content,
    sig: "somesig",
  )
}

pub fn empty_filter_matches_anything_test() {
  let ev =
    make_event(
      sample_id_1(),
      sample_pubkey_1(),
      1000,
      kind.Note,
      [],
      "Hello Nostr",
    )
  let f = filter.new()
  assert filter.matches(ev, f) == True
}

pub fn filter_builder_test() {
  let f =
    filter.new()
    |> filter.with_ids(["a2a0"])
    |> filter.with_authors(["3bf0"])
    |> filter.with_kinds([kind.Note, kind.Metadata])
    |> filter.with_since(500)
    |> filter.with_until(2000)
    |> filter.with_limit(10)
    |> filter.with_search("nostr")
    |> filter.with_e_tags(["ev123"])
    |> filter.with_p_tags(["pk456"])
    |> filter.with_d_tag("my-slug")

  assert f.ids == Some(["a2a0"])
  assert f.authors == Some(["3bf0"])
  assert f.kinds == Some([kind.Note, kind.Metadata])
  assert f.since == Some(500)
  assert f.until == Some(2000)
  assert f.limit == Some(10)
  assert f.search == Some("nostr")
  assert filter.get_tag(f, "e") == ["ev123"]
  assert filter.get_tag(f, "#e") == ["ev123"]
  assert filter.get_tag(f, "p") == ["pk456"]
  assert filter.get_tag(f, "d") == ["my-slug"]
}

pub fn ids_matching_test() {
  let ev =
    make_event(sample_id_1(), sample_pubkey_1(), 1000, kind.Note, [], "content")

  // Full exact ID match
  let f1 = filter.new() |> filter.with_ids([event_id.to_hex(sample_id_1())])
  assert filter.matches(ev, f1) == True

  // Prefix match
  let f2 = filter.new() |> filter.with_ids(["a2a0a221"])
  assert filter.matches(ev, f2) == True

  // Case insensitive prefix match
  let f3 = filter.new() |> filter.with_ids(["A2A0A221"])
  assert filter.matches(ev, f3) == True

  // Non-matching prefix
  let f4 = filter.new() |> filter.with_ids(["b2a0a221"])
  assert filter.matches(ev, f4) == False

  // Multiple IDs where one matches
  let f5 = filter.new() |> filter.with_ids(["b2a0", "a2a0"])
  assert filter.matches(ev, f5) == True
}

pub fn authors_matching_test() {
  let ev =
    make_event(sample_id_1(), sample_pubkey_1(), 1000, kind.Note, [], "content")

  // Full exact match
  let f1 =
    filter.new() |> filter.with_authors([pubkey.to_hex(sample_pubkey_1())])
  assert filter.matches(ev, f1) == True

  // Prefix match
  let f2 = filter.new() |> filter.with_authors(["3bf0c6"])
  assert filter.matches(ev, f2) == True

  // Non-matching author
  let f3 =
    filter.new() |> filter.with_authors([pubkey.to_hex(sample_pubkey_2())])
  assert filter.matches(ev, f3) == False
}

pub fn kinds_matching_test() {
  let ev =
    make_event(sample_id_1(), sample_pubkey_1(), 1000, kind.Note, [], "content")

  let f_note = filter.new() |> filter.with_kinds([kind.Note])
  assert filter.matches(ev, f_note) == True

  let f_meta = filter.new() |> filter.with_kinds([kind.Metadata])
  assert filter.matches(ev, f_meta) == False

  let f_multi =
    filter.new() |> filter.with_kinds([kind.Metadata, kind.Note, kind.Reaction])
  assert filter.matches(ev, f_multi) == True
}

pub fn since_until_matching_test() {
  let ev =
    make_event(sample_id_1(), sample_pubkey_1(), 1500, kind.Note, [], "content")

  // In range
  assert filter.matches(ev, filter.new() |> filter.with_since(1000)) == True
  assert filter.matches(ev, filter.new() |> filter.with_since(1500)) == True
  assert filter.matches(ev, filter.new() |> filter.with_since(1501)) == False

  assert filter.matches(ev, filter.new() |> filter.with_until(2000)) == True
  assert filter.matches(ev, filter.new() |> filter.with_until(1500)) == True
  assert filter.matches(ev, filter.new() |> filter.with_until(1499)) == False

  let f_range =
    filter.new() |> filter.with_since(1000) |> filter.with_until(2000)
  assert filter.matches(ev, f_range) == True
}

pub fn search_nip50_matching_test() {
  let ev =
    make_event(
      sample_id_1(),
      sample_pubkey_1(),
      1000,
      kind.Note,
      [],
      "Hello World and Nostr Decentralized Web",
    )

  assert filter.matches(ev, filter.new() |> filter.with_search("world")) == True
  assert filter.matches(ev, filter.new() |> filter.with_search("WORLD")) == True
  assert filter.matches(
      ev,
      filter.new() |> filter.with_search("world decentralized"),
    )
    == True
  assert filter.matches(ev, filter.new() |> filter.with_search("world bitcoin"))
    == False
}

pub fn tags_matching_test() {
  let ev =
    make_event(
      sample_id_1(),
      sample_pubkey_1(),
      1000,
      kind.Note,
      [
        ["e", "ev_id_1"],
        ["p", "pk_1"],
        ["d", "my-app-state"],
        ["t", "nostr"],
      ],
      "content",
    )

  // Matching #e
  let f1 = filter.new() |> filter.with_e_tags(["ev_id_1", "ev_id_2"])
  assert filter.matches(ev, f1) == True

  // Non-matching #e
  let f2 = filter.new() |> filter.with_e_tags(["ev_id_999"])
  assert filter.matches(ev, f2) == False

  // Matching multiple tags: #e AND #d
  let f3 =
    filter.new()
    |> filter.with_e_tags(["ev_id_1"])
    |> filter.with_d_tag("my-app-state")
  assert filter.matches(ev, f3) == True

  // One tag matches but other does not
  let f4 =
    filter.new()
    |> filter.with_e_tags(["ev_id_1"])
    |> filter.with_d_tag("other-state")
  assert filter.matches(ev, f4) == False
}

pub fn matches_any_test() {
  let ev =
    make_event(sample_id_1(), sample_pubkey_1(), 1000, kind.Note, [], "content")

  assert filter.matches_any(ev, []) == False

  let f_match = filter.new() |> filter.with_kinds([kind.Note])
  let f_nomatch = filter.new() |> filter.with_kinds([kind.Metadata])

  assert filter.matches_any(ev, [f_nomatch]) == False
  assert filter.matches_any(ev, [f_nomatch, f_match]) == True
  assert filter.matches_any(ev, [f_match, f_nomatch]) == True
}

pub fn merge_filters_test() {
  let f1 =
    filter.new()
    |> filter.with_ids(["id1"])
    |> filter.with_authors(["pk1"])
    |> filter.with_kinds([kind.Note])
    |> filter.with_since(1000)
    |> filter.with_until(2000)
    |> filter.with_limit(5)
    |> filter.with_tag("t", ["nostr"])

  let f2 =
    filter.new()
    |> filter.with_ids(["id2", "id1"])
    |> filter.with_authors(["pk2"])
    |> filter.with_kinds([kind.Metadata])
    |> filter.with_since(800)
    |> filter.with_until(2500)
    |> filter.with_limit(10)
    |> filter.with_tag("t", ["bitcoin", "nostr"])

  let merged = filter.merge([f1, f2])

  assert merged.ids == Some(["id1", "id2"])
  assert merged.authors == Some(["pk1", "pk2"])
  assert merged.kinds == Some([kind.Note, kind.Metadata])
  assert merged.since == Some(800)
  assert merged.until == Some(2500)
  assert merged.limit == Some(15)
  assert filter.get_tag(merged, "t") == ["nostr", "bitcoin"]
}

pub fn qcheck_empty_filter_matches_any_event_test() {
  let event_gen =
    qcheck.tuple3(
      qcheck.bounded_int(0, 2_000_000_000),
      qcheck.bounded_int(0, 40_000),
      qcheck.generic_string(
        qcheck.alphanumeric_ascii_codepoint(),
        qcheck.bounded_int(0, 50),
      ),
    )

  qcheck.run(qcheck.default_config(), event_gen, fn(tuple) {
    let #(created_at, kind_int, content) = tuple
    let ev =
      make_event(
        sample_id_1(),
        sample_pubkey_1(),
        created_at,
        kind.from_int(kind_int),
        [],
        content,
      )
    assert filter.matches(ev, filter.new()) == True
  })
}

pub fn qcheck_matches_any_singleton_test() {
  let event_gen =
    qcheck.tuple2(
      qcheck.bounded_int(1, 10),
      qcheck.bounded_int(0, 2_000_000_000),
    )

  qcheck.run(qcheck.default_config(), event_gen, fn(tuple) {
    let #(kind_int, created_at) = tuple
    let ev =
      make_event(
        sample_id_1(),
        sample_pubkey_1(),
        created_at,
        kind.from_int(kind_int),
        [],
        "test",
      )
    let f = filter.new() |> filter.with_kinds([kind.from_int(kind_int)])

    assert filter.matches_any(ev, [f]) == filter.matches(ev, f)
  })
}

pub fn qcheck_merge_singleton_identity_test() {
  let filter_gen =
    qcheck.tuple3(
      qcheck.bounded_int(0, 100_000),
      qcheck.bounded_int(100_001, 200_000),
      qcheck.bounded_int(1, 100),
    )

  qcheck.run(qcheck.default_config(), filter_gen, fn(tuple) {
    let #(since, until, limit) = tuple
    let f =
      filter.new()
      |> filter.with_since(since)
      |> filter.with_until(until)
      |> filter.with_limit(limit)

    let merged = filter.merge([f])
    assert merged.since == f.since
    assert merged.until == f.until
    assert merged.limit == f.limit
  })
}
