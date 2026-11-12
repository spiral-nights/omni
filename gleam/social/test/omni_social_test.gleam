import gleam/dict
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/nostr/event.{type Event, Event}
import omni/nostr/event_id
import omni/nostr/kind.{type Kind}
import omni/nostr/pubkey
import omni/platform/storage
import omni/social/follows.{Follows}
import omni/social/note
import omni/social/profile.{Profile}
import omni/social/profile_cache
import omni/social/queries
import omni/social/stats.{NoteStats}
import omni/social/thread

pub fn main() -> Nil {
  gleeunit.main()
}

const alice_hex =
  "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"

const bob_hex =
  "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"

const carol_hex =
  "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"

const note1_hex =
  "1111111111111111111111111111111111111111111111111111111111111111"

const note2_hex =
  "2222222222222222222222222222222222222222222222222222222222222222"

const note3_hex =
  "3333333333333333333333333333333333333333333333333333333333333333"

const note4_hex =
  "4444444444444444444444444444444444444444444444444444444444444444"

const ev_like_hex =
  "5555555555555555555555555555555555555555555555555555555555555555"

const ev_repost_hex =
  "6666666666666666666666666666666666666666666666666666666666666666"

const ev_zap_hex =
  "7777777777777777777777777777777777777777777777777777777777777777"

fn make_event(
  id_hex: String,
  pk_hex: String,
  created_at: Int,
  k: Kind,
  tags: List(List(String)),
  content: String,
) -> Event {
  let assert Ok(id) = event_id.parse(id_hex)
  let assert Ok(pk) = pubkey.parse(pk_hex)
  Event(
    id: id,
    pubkey: pk,
    created_at: created_at,
    kind: k,
    tags: tags,
    content: content,
    sig: string.repeat("a", 128),
  )
}

// -----------------------------------------------------------------------------
// 1. Profile tests
// -----------------------------------------------------------------------------

pub fn profile_from_event_and_to_metadata_json_test() {
  let meta_json =
    "{\"name\":\"alice\",\"display_name\":\"Alice Wonderland\",\"about\":\"Building on Nostr\",\"picture\":\"https://example.com/a.png\",\"nip05\":\"alice@example.com\",\"lud16\":\"alice@walletofsatoshi.com\",\"website\":\"https://alice.example.com\"}"

  let ev =
    make_event(
      note1_hex,
      alice_hex,
      1_700_000_000,
      kind.Metadata,
      [],
      meta_json,
    )
  let assert Ok(p) = profile.from_event(ev)

  p.pubkey |> should.equal(alice_hex)
  p.name |> should.equal(Some("alice"))
  p.display_name |> should.equal(Some("Alice Wonderland"))
  p.about |> should.equal(Some("Building on Nostr"))
  p.picture |> should.equal(Some("https://example.com/a.png"))
  p.banner |> should.equal(None)
  p.nip05 |> should.equal(Some("alice@example.com"))
  p.lud16 |> should.equal(Some("alice@walletofsatoshi.com"))
  p.website |> should.equal(Some("https://alice.example.com"))
  p.created_at |> should.equal(1_700_000_000)

  // Roundtrip via to_metadata_json
  let re_encoded = profile.to_metadata_json(p)
  let ev2 =
    make_event(
      note2_hex,
      alice_hex,
      1_700_000_000,
      kind.Metadata,
      [],
      re_encoded,
    )
  let assert Ok(p2) = profile.from_event(ev2)
  p2 |> should.equal(p)
}

pub fn profile_missing_fields_and_display_name_fallback_test() {
  let empty_ev =
    make_event(note1_hex, bob_hex, 1_700_000_010, kind.Metadata, [], "{}")
  let assert Ok(empty_prof) = profile.from_event(empty_ev)
  empty_prof.pubkey |> should.equal(bob_hex)
  empty_prof.name |> should.equal(None)
  empty_prof.display_name |> should.equal(None)

  // Wrong kind returns Error
  let note_ev =
    make_event(note1_hex, bob_hex, 1_700_000_010, kind.Note, [], "hello")
  profile.from_event(note_ev) |> should.be_error()

  // truncate_npub formats hex pubkey into npub1xxxx...yyyy
  let short_npub = profile.truncate_npub(alice_hex)
  string.starts_with(short_npub, "npub1") |> should.be_true()
  string.contains(short_npub, "...") |> should.be_true()

  // best_display_name precedence: display_name > name > truncate_npub
  let with_display =
    Profile(
      ..profile.empty(alice_hex),
      name: Some("alice"),
      display_name: Some("Alice W"),
    )
  profile.best_display_name(Some(with_display), alice_hex)
  |> should.equal("Alice W")

  let with_name_only =
    Profile(
      ..profile.empty(alice_hex),
      name: Some("alice"),
      display_name: Some("  "),
    )
  profile.best_display_name(Some(with_name_only), alice_hex)
  |> should.equal("alice")

  profile.best_display_name(Some(profile.empty(alice_hex)), alice_hex)
  |> should.equal(short_npub)
  profile.best_display_name(None, alice_hex)
  |> should.equal(short_npub)
}

// -----------------------------------------------------------------------------
// 2. Note tests (NIP-10 marked & positional tags, relative time)
// -----------------------------------------------------------------------------

pub fn note_nip10_marked_and_positional_tags_test() {
  // 1. Root note (no e tags)
  let root_ev =
    make_event(
      note1_hex,
      alice_hex,
      1_700_000_000,
      kind.Note,
      [["t", "Nostr"], ["t", "gleam"]],
      "Hello Nostr!",
    )
  let root_note = note.from_event(root_ev)
  note.is_reply(root_note) |> should.be_false()
  root_note.reply_to_id |> should.equal(None)
  root_note.root_id |> should.equal(None)
  root_note.hashtags |> should.equal(["nostr", "gleam"])

  // 2. Marked NIP-10 reply with explicit "root" and "reply"
  let marked_ev =
    make_event(
      note3_hex,
      carol_hex,
      1_700_000_200,
      kind.Note,
      [
        ["e", note1_hex, "wss://relay.damus.io", "root"],
        ["e", note2_hex, "wss://relay.damus.io", "reply"],
        ["p", bob_hex],
        ["p", alice_hex],
      ],
      "Replying to Bob inside Alice thread",
    )
  let marked_note = note.from_event(marked_ev)
  note.is_reply(marked_note) |> should.be_true()
  marked_note.root_id |> should.equal(Some(note1_hex))
  marked_note.reply_to_id |> should.equal(Some(note2_hex))
  marked_note.reply_to_pubkey |> should.equal(Some(bob_hex))
  marked_note.mentioned_pubkeys |> should.equal([bob_hex, alice_hex])

  // 3. Positional NIP-10 fallback: single ["e", root_id]
  let pos_single_ev =
    make_event(
      note2_hex,
      bob_hex,
      1_700_000_100,
      kind.Note,
      [["e", note1_hex], ["p", alice_hex]],
      "Direct positional reply",
    )
  let pos_single = note.from_event(pos_single_ev)
  pos_single.root_id |> should.equal(Some(note1_hex))
  pos_single.reply_to_id |> should.equal(Some(note1_hex))
  pos_single.reply_to_pubkey |> should.equal(Some(alice_hex))

  // 4. Positional NIP-10 fallback: multiple ["e", root_id], ["e", reply_id]
  let pos_multi_ev =
    make_event(
      note4_hex,
      alice_hex,
      1_700_000_300,
      kind.Note,
      [["e", note1_hex], ["e", note2_hex], ["e", note3_hex], ["p", carol_hex]],
      "Positional nested reply",
    )
  let pos_multi = note.from_event(pos_multi_ev)
  pos_multi.root_id |> should.equal(Some(note1_hex))
  pos_multi.reply_to_id |> should.equal(Some(note3_hex))
  pos_multi.reply_to_pubkey |> should.equal(Some(carol_hex))
}

pub fn note_format_relative_time_test() {
  let now = 1_700_010_000
  note.format_relative_time(now - 15, now) |> should.equal("just now")
  note.format_relative_time(now - 300, now) |> should.equal("5m")
  note.format_relative_time(now - 7200, now) |> should.equal("2h")
  note.format_relative_time(now - 259_200, now) |> should.equal("3d")
}

// -----------------------------------------------------------------------------
// 3. Stats reducer tests (Kind 1, 6, 7, 9735)
// -----------------------------------------------------------------------------

pub fn stats_apply_events_reducer_test() {
  let reply_ev =
    make_event(
      note2_hex,
      bob_hex,
      1_700_000_100,
      kind.Note,
      [["e", note1_hex, "", "reply"]],
      "Great post!",
    )
  let like_by_me_ev =
    make_event(
      ev_like_hex,
      alice_hex,
      1_700_000_110,
      kind.Reaction,
      [["e", note1_hex]],
      "+",
    )
  let dislike_ev =
    make_event(
      note3_hex,
      carol_hex,
      1_700_000_115,
      kind.Reaction,
      [["e", note1_hex]],
      "-",
    )
  let repost_by_bob_ev =
    make_event(
      ev_repost_hex,
      bob_hex,
      1_700_000_120,
      kind.Repost,
      [["e", note1_hex]],
      "",
    )
  let zap_ev =
    make_event(
      ev_zap_hex,
      carol_hex,
      1_700_000_130,
      kind.Zap,
      [["e", note1_hex], ["amount", "21000"]],
      "",
    )

  let map =
    stats.apply_events(
      [
        reply_ev,
        like_by_me_ev,
        // Duplicate event ID should be ignored by apply_events
        like_by_me_ev,
        dislike_ev,
        repost_by_bob_ev,
        zap_ev,
      ],
      Some(alice_hex),
    )

  let assert Ok(s) = dict.get(map, note1_hex)
  s
  |> should.equal(NoteStats(
    note_id: note1_hex,
    likes: 1,
    reposts: 1,
    replies: 1,
    zaps: 1,
    zap_sats: 21,
    liked_by_me: True,
    reposted_by_me: False,
  ))
}

// -----------------------------------------------------------------------------
// 4. Thread resolution tests
// -----------------------------------------------------------------------------

pub fn thread_build_and_root_notes_test() {
  let n1 =
    note.from_event(make_event(
      note1_hex,
      alice_hex,
      100,
      kind.Note,
      [],
      "Root 1",
    ))
  let n2 =
    note.from_event(make_event(
      note2_hex,
      bob_hex,
      200,
      kind.Note,
      [["e", note1_hex, "", "root"], ["e", note1_hex, "", "reply"]],
      "Reply to Root 1",
    ))
  let n3 =
    note.from_event(make_event(
      note3_hex,
      carol_hex,
      300,
      kind.Note,
      [["e", note1_hex, "", "root"], ["e", note2_hex, "", "reply"]],
      "Nested reply to n2",
    ))
  let n4 =
    note.from_event(make_event(
      note4_hex,
      bob_hex,
      400,
      kind.Note,
      [],
      "Root 2 (newer)",
    ))

  let all_notes = [n3, n1, n4, n2]

  // root_notes filters out replies and sorts newest-first
  let roots = thread.root_notes(all_notes)
  list.map(roots, fn(n) { n.id }) |> should.equal([note4_hex, note1_hex])

  // Thread centered on n2 has ancestor [n1] and reply [n3]
  let assert Some(tv_mid) = thread.build_thread(note2_hex, all_notes)
  tv_mid.focal.id |> should.equal(note2_hex)
  list.map(tv_mid.ancestors, fn(n) { n.id }) |> should.equal([note1_hex])
  list.map(tv_mid.replies, fn(n) { n.id }) |> should.equal([note3_hex])

  // Thread centered on n1 has no ancestors and replies [n2, n3] sorted oldest-first
  let assert Some(tv_root) = thread.build_thread(note1_hex, all_notes)
  tv_root.ancestors |> should.equal([])
  list.map(tv_root.replies, fn(n) { n.id })
  |> should.equal([note2_hex, note3_hex])
}

// -----------------------------------------------------------------------------
// 5. Follows tests
// -----------------------------------------------------------------------------

pub fn follows_from_event_and_toggle_test() {
  let ev =
    make_event(
      note1_hex,
      alice_hex,
      1_700_000_000,
      kind.ContactList,
      [["p", bob_hex], ["p", carol_hex], ["p", bob_hex]],
      "",
    )
  let f0 = follows.from_event(ev)
  f0
  |> should.equal(Follows(
    pubkey: alice_hex,
    followed_pubkeys: [bob_hex, carol_hex],
    updated_at: 1_700_000_000,
  ))

  follows.is_following(f0, bob_hex) |> should.be_true()

  // Toggle off bob
  let f1 = follows.toggle_follow(f0, bob_hex, 1_700_000_050)
  follows.is_following(f1, bob_hex) |> should.be_false()
  f1.followed_pubkeys |> should.equal([carol_hex])
  f1.updated_at |> should.equal(1_700_000_050)

  // Toggle on bob again
  let f2 = follows.toggle_follow(f1, bob_hex, 1_700_000_060)
  follows.is_following(f2, bob_hex) |> should.be_true()
  follows.to_tags(f2) |> should.equal([["p", carol_hex], ["p", bob_hex]])
}

// -----------------------------------------------------------------------------
// 6. Queries and ProfileCache tests
// -----------------------------------------------------------------------------

pub fn queries_and_profile_cache_test() {
  let tf = queries.timeline_filter(Some([alice_hex, bob_hex]), 40)
  tf.kinds |> should.equal(Some([kind.Note]))
  tf.authors |> should.equal(Some([alice_hex, bob_hex]))
  tf.limit |> should.equal(Some(40))

  let nf = queries.notes_by_author(alice_hex, 20)
  nf.authors |> should.equal(Some([alice_hex]))
  nf.limit |> should.equal(Some(20))

  let pf = queries.profiles_for([alice_hex, bob_hex, alice_hex])
  pf.kinds |> should.equal(Some([kind.Metadata]))
  pf.authors |> should.equal(Some([alice_hex, bob_hex]))
  pf.limit |> should.equal(Some(2))

  let ff = queries.follows_for(alice_hex)
  ff.kinds |> should.equal(Some([kind.ContactList]))
  ff.limit |> should.equal(Some(1))

  let intf = queries.interactions_for([note1_hex, note2_hex])
  intf.kinds
  |> should.equal(Some([kind.Note, kind.Repost, kind.Reaction, kind.Zap]))

  let rf = queries.replies_to(note1_hex)
  rf.kinds |> should.equal(Some([kind.Note]))

  // ProfileCache persistence
  let store = storage.in_memory()
  profile_cache.load(store) |> should.equal(dict.new())

  let alice_prof =
    Profile(
      ..profile.empty(alice_hex),
      name: Some("alice"),
      display_name: Some("Alice"),
      created_at: 100,
    )
  let _ = profile_cache.upsert(store, alice_prof)
  profile_cache.get_profile(store, alice_hex)
  |> should.equal(Some(alice_prof))

  // Older profile event does not overwrite newer cached profile
  let stale_alice =
    Profile(..alice_prof, display_name: Some("Old Alice"), created_at: 50)
  let _ = profile_cache.upsert(store, stale_alice)
  profile_cache.get_profile(store, alice_hex)
  |> should.equal(Some(alice_prof))

  profile_cache.clear(store)
  profile_cache.get_profile(store, alice_hex) |> should.equal(None)
}

pub fn profile_cache_ttl_gates_fetches_test() {
  let store = storage.in_memory()
  let alice_hex =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  let alice_prof =
    Profile(..profile.empty(alice_hex), name: Some("alice"), created_at: 100)

  // No profile yet: must fetch.
  profile_cache.needs_fetch(store, alice_hex, 1000, 500) |> should.be_true()

  let _ = profile_cache.upsert(store, alice_prof)
  profile_cache.mark_fetched(store, alice_hex, 1000)

  // Fresh enough: skip.
  profile_cache.needs_fetch(store, alice_hex, 1200, 500)
  |> should.be_false()

  // Expired: fetch again.
  profile_cache.needs_fetch(store, alice_hex, 1800, 500) |> should.be_true()
  profile_cache.stale_pubkeys(store, 1800, 500)
  |> should.equal([alice_hex])
  profile_cache.stale_pubkeys(store, 1200, 500) |> should.equal([])
}
