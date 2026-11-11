import gleam/dict
import gleam/dynamic
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/protocol/schema/action
import omni/social/note.{Note}
import omni/social/profile.{Profile}
import omni/social/stats.{NoteStats}
import omni/social_ui/note_card.{NoteCardConfig}
import omni/testkit/golden
import omni/ui/render

pub fn main() -> Nil {
  gleeunit.main()
}

const alice_hex =
  "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"

const bob_hex =
  "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"

const note1_hex =
  "1111111111111111111111111111111111111111111111111111111111111111"

const note2_hex =
  "2222222222222222222222222222222222222222222222222222222222222222"

pub fn note_card_interactive_golden_test() {
  let now = 1_700_000_600
  let n =
    Note(
      id: note2_hex,
      pubkey: alice_hex,
      content: "Replying with declarative schema UI in Gleam!",
      created_at: now - 300,
      reply_to_id: Some(note1_hex),
      root_id: Some(note1_hex),
      reply_to_pubkey: Some(bob_hex),
      mentioned_pubkeys: [bob_hex],
      hashtags: ["gleam", "nostr"],
    )

  let author =
    Profile(
      ..profile.empty(alice_hex),
      name: Some("alice"),
      display_name: Some("Alice Wonderland"),
      picture: Some("https://example.com/alice.png"),
    )

  let reply_author =
    Profile(
      ..profile.empty(bob_hex),
      name: Some("bob"),
      display_name: Some("Bob Builder"),
    )

  let s =
    NoteStats(
      note_id: note2_hex,
      likes: 7,
      reposts: 2,
      replies: 3,
      zaps: 1,
      zap_sats: 210,
      liked_by_me: True,
      reposted_by_me: False,
    )

  let cfg = note_card.default_config(now)
  let card_node =
    note_card.render_note_card(n, Some(author), Some(reply_author), s, cfg)

  let rendered = render.render_to_readable_string(card_node)
  golden.assert_matches("note_card_interactive.html", rendered)
}

pub fn note_card_readonly_golden_test() {
  let now = 1_700_007_200
  let n =
    Note(
      id: note1_hex,
      pubkey: bob_hex,
      content: "Standalone Nostr note rendered on profile view via intent.",
      created_at: now - 7200,
      reply_to_id: None,
      root_id: None,
      reply_to_pubkey: None,
      mentioned_pubkeys: [],
      hashtags: [],
    )

  let author =
    Profile(
      ..profile.empty(bob_hex),
      name: Some("bob"),
      display_name: Some("Bob Builder"),
    )

  let s =
    NoteStats(
      note_id: note1_hex,
      likes: 12,
      reposts: 4,
      replies: 1,
      zaps: 0,
      zap_sats: 0,
      liked_by_me: False,
      reposted_by_me: False,
    )

  let readonly_cfg =
    NoteCardConfig(
      ..note_card.default_config(now),
      interactive: False,
      show_actions: True,
      on_open_note: Some(fn(id) {
        action.new("view_note")
        |> action.with_payload(
          dict.from_list([#("eventId", dynamic.string(id))]),
        )
      }),
      on_open_author: None,
    )

  let card_node =
    note_card.render_note_card(n, Some(author), None, s, readonly_cfg)

  let rendered = render.render_to_readable_string(card_node)
  golden.assert_matches("note_card_readonly.html", rendered)
}

pub fn reply_badge_and_empty_timeline_test() {
  let now = 1_700_000_000
  let root_note =
    Note(
      id: note1_hex,
      pubkey: alice_hex,
      content: "Root note",
      created_at: now,
      reply_to_id: None,
      root_id: None,
      reply_to_pubkey: None,
      mentioned_pubkeys: [],
      hashtags: [],
    )
  note_card.render_reply_badge(root_note, None) |> should.equal(None)

  let empty_node =
    note_card.render_empty_timeline(
      "No notes yet",
      "Notes will stream in as relays respond.",
    )
  let html = render.render_to_string(empty_node)
  string.contains(html, "No notes yet") |> should.be_true()
  string.contains(html, "Notes will stream in as relays respond.")
  |> should.be_true()
}
