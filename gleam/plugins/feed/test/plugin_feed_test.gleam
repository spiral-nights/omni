//// Unit tests for the Feed plugin (`plugin_feed`, Phase 7.9).

import gleam/dict
import gleam/dynamic
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/nostr/event.{type Event, Event}
import omni/nostr/event_id
import omni/nostr/kind.{type Kind, Note}
import omni/nostr/pubkey
import omni/platform/storage
import omni/plugin_kit/app
import omni/plugin_kit/local_store
import omni/plugin_kit/route
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import plugin/feed/main as feed_main
import plugin/feed/model.{
  Model, TabFollowing, TabGlobal, TabReplies, ViewSearch, ViewSettings,
  ViewThread, ViewTimeline, ViewWidget,
}
import plugin/feed/msg.{
  IngestEvent, LikeNote, LoadMore, NavigateBack, OpenThread, PublishNote,
  PublishReply, SelectTab, SelectView, SetComposerDraft,
  SetComposerDraftAndPublish, SetReplyDraft, SetSearchQuery, StartReply,
  ToggleInlineMedia, ToggleShowReplies,
}
import plugin/feed/update
import plugin/feed/view

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

fn note_kind() -> Kind {
  Note
}

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

fn note_event(id_hex: String, pk_hex: String, content: String) -> Event {
  make_event(id_hex, pk_hex, 1_700_000_100, note_kind(), [], content)
}

pub fn model_init_and_route_resolution_test() {
  let m = model.init(route.parse_search(""))
  m.view |> should.equal(ViewTimeline)
  m.active_tab |> should.equal(TabFollowing)
  m.visible_limit |> should.equal(20)
  dict.size(m.notes) |> should.equal(0)

  model.view_from_route(route.parse_search("?view=search"))
  |> should.equal(ViewSearch)
  model.view_from_route(route.parse_search("?view=settings"))
  |> should.equal(ViewSettings)
  model.view_from_route(route.parse_search("?view=widget"))
  |> should.equal(ViewWidget)
  model.view_from_route(route.parse_search("?view=thread&id=abc"))
  |> should.equal(ViewThread("abc"))
  model.view_from_route(route.parse_search("?view=thread&eventId=xyz"))
  |> should.equal(ViewThread("xyz"))
  model.view_from_route(route.parse_search("?view=thread"))
  |> should.equal(ViewTimeline)

  model.init(route.parse_search("?q=gleam")).search_query
  |> should.equal("gleam")
}

pub fn ingest_note_event_reaches_timeline_test() {
  let m0 = model.init(route.main())
  let #(m1, _) =
    update.update(
      m0,
      IngestEvent(note_event(note1_hex, alice_hex, "hello nostr")),
    )

  let notes = model.filtered_timeline_notes(m1)
  list.length(notes) |> should.equal(1)
  let assert Ok(parsed) = list.first(notes)
  parsed.content |> should.equal("hello nostr")
  parsed.pubkey |> should.equal(alice_hex)

  // Unknown author is not followed: Following tab hides it, Global shows it.
  m1.active_tab |> should.equal(TabFollowing)
  let #(m_global, _) = update.update(m1, SelectTab(TabGlobal))
  list.length(model.filtered_timeline_notes(m_global)) |> should.equal(1)
}

pub fn tab_filters_and_reply_setting_test() {
  let reply =
    make_event(
      note2_hex,
      bob_hex,
      1_700_000_200,
      note_kind(),
      [["e", note1_hex], ["p", alice_hex]],
      "a reply",
    )

  let m0 = model.init(route.main())
  let #(m1, _) =
    update.update(m0, IngestEvent(note_event(note1_hex, alice_hex, "root")))
  let #(m2, _) = update.update(m1, IngestEvent(reply))

  let #(m_replies, _) = update.update(m2, SelectTab(TabReplies))
  list.length(model.filtered_timeline_notes(m_replies)) |> should.equal(1)

  // Replies hidden from Global by default, shown when enabled.
  let #(m_global, _) = update.update(m2, SelectTab(TabGlobal))
  list.length(model.filtered_timeline_notes(m_global)) |> should.equal(1)
  let #(m_show, _) = update.update(m_global, ToggleShowReplies)
  list.length(model.filtered_timeline_notes(m_show)) |> should.equal(2)
}

pub fn composer_publish_and_draft_clearing_test() {
  let m0 = model.init(route.main())

  let #(m_empty, _) = update.update(m0, PublishNote)
  dict.size(m_empty.notes) |> should.equal(0)

  let #(m1, _) = update.update(m0, SetComposerDraft("  first post  "))
  m1.composer_draft |> should.equal("  first post  ")

  let #(m2, _) = update.update(m1, PublishNote)
  m2.composer_draft |> should.equal("")
  dict.size(m2.notes) |> should.equal(1)

  // Inline-text publish path sets the draft and publishes in one message.
  let #(m3, _) = update.update(m0, SetComposerDraftAndPublish("quick post"))
  m3.composer_draft |> should.equal("")
  dict.size(m3.notes) |> should.equal(1)
}

pub fn reply_flow_test() {
  let m0 = model.init(route.main())
  let #(m1, _) =
    update.update(m0, IngestEvent(note_event(note1_hex, alice_hex, "root")))
  let assert Ok(parent) = list.first(dict.values(m1.notes))

  let #(m2, _) = update.update(m1, OpenThread(parent.id))
  m2.view |> should.equal(ViewThread(parent.id))
  m2.replying_to |> should.equal(Some(parent.id))

  let #(m3, _) = update.update(m2, NavigateBack)
  m3.view |> should.equal(ViewTimeline)
  m3.replying_to |> should.equal(None)

  let #(m4, _) = update.update(m3, StartReply(parent.id))
  m4.replying_to |> should.equal(Some(parent.id))

  let #(m5, _) = update.update(m4, SetReplyDraft("nice note"))
  let #(m6, _) = update.update(m5, PublishReply(parent.id))
  m6.reply_draft |> should.equal("")
  dict.size(m6.notes) |> should.equal(2)
}

pub fn search_and_load_more_test() {
  let m0 = model.init(route.main())
  let #(m1, _) =
    update.update(
      m0,
      IngestEvent(note_event(note1_hex, alice_hex, "learning gleam today")),
    )
  let #(m2, _) =
    update.update(
      m1,
      IngestEvent(note_event(note2_hex, bob_hex, "nostr draft")),
    )

  let #(m3, _) = update.update(m2, SetSearchQuery("gleam"))
  let results = model.search_results(m3)
  list.length(results) |> should.equal(1)
  let assert Ok(found) = list.first(results)
  found.content |> should.equal("learning gleam today")

  let #(m4, _) = update.update(m2, SetSearchQuery("zzz"))
  list.length(model.search_results(m4)) |> should.equal(0)

  // Page size limits visible notes and LoadMore expands the window.
  let m_small = Model(..m2, visible_limit: 1)
  list.length(model.visible_timeline_notes(m_small)) |> should.equal(1)
  model.has_more_timeline_notes(m_small) |> should.equal(True)
  let #(m_more, _) = update.update(m_small, LoadMore)
  should.be_true(m_more.visible_limit > 1)
}

pub fn engagement_and_toggles_are_noops_or_state_updates_test() {
  let m0 = model.init(route.main())
  let #(m1, _) = update.update(m0, LikeNote("some-note"))
  m1.notes |> dict.size |> should.equal(0)

  let #(m2, _) = update.update(m1, ToggleInlineMedia)
  m2.settings.show_inline_media |> should.equal(False)

  let #(m3, _) = update.update(m2, ToggleShowReplies)
  m3.settings.show_replies |> should.equal(True)
}

pub fn action_mapping_test() {
  update.action_to_msg(schema_action("select-tab", [#("tab", "global")]))
  |> should.equal(Some(SelectTab(TabGlobal)))

  update.action_to_msg(schema_action("select_tab", [#("tab", "replies")]))
  |> should.equal(Some(SelectTab(TabReplies)))

  update.action_to_msg(schema_action("open-thread", [#("id", "abc")]))
  |> should.equal(Some(OpenThread("abc")))

  update.action_to_msg(schema_action("view-note", [#("noteId", "abc")]))
  |> should.equal(Some(OpenThread("abc")))

  update.action_to_msg(schema_action("publish-note", [#("composerText", "hi")]))
  |> should.equal(Some(SetComposerDraftAndPublish("hi")))

  update.action_to_msg(schema_action("publish-note", []))
  |> should.equal(Some(PublishNote))

  update.action_to_msg(schema_action("load-more", []))
  |> should.equal(Some(LoadMore))

  update.action_to_msg(schema_action("unknown-action", []))
  |> should.equal(None)
}

pub fn view_renders_all_modes_test() {
  let base = model.init(route.main())
  let #(m1, _) =
    update.update(
      base,
      IngestEvent(note_event(note1_hex, alice_hex, "hello world")),
    )

  let timeline_wire = schema.encode_schema_message(view.view(m1))
  should.be_true(string.contains(timeline_wire, "hello world"))

  let thread_wire =
    schema.encode_schema_message(view.view(
      Model(..m1, view: ViewThread(note1_hex)),
    ))
  should.be_true(string.contains(thread_wire, "hello world"))

  let search_wire =
    schema.encode_schema_message(view.view(Model(..m1, view: ViewSearch)))
  should.be_true(string.length(search_wire) > 0)

  let settings_wire =
    schema.encode_schema_message(view.view(Model(..m1, view: ViewSettings)))
  should.be_true(string.length(settings_wire) > 0)

  let widget_wire =
    schema.encode_schema_message(view.view(Model(..m1, view: ViewWidget)))
  should.be_true(string.length(widget_wire) > 0)

  let #(m_view, _) = update.update(m1, SelectView(ViewTimeline))
  m_view.view |> should.equal(ViewTimeline)
}

pub fn storage_backed_spec_persists_settings_test() {
  let store = storage.in_memory()
  let spec = feed_main.app_spec_with_storage(store)
  let #(m0, _) = spec.init(route.parse_search("?view=settings"))
  m0.view |> should.equal(ViewSettings)

  let #(m1, _) = spec.update(m0, ToggleShowReplies)
  m1.settings.show_replies |> should.equal(True)

  let reloaded = local_store.load(store, model.settings_store_config())
  reloaded.show_replies |> should.equal(True)
}

pub fn running_app_emits_schema_test() {
  let running = feed_main.start_app("?view=timeline", fn(_node) { Nil })
  let wire = running |> app.current_view |> schema.encode_schema_message
  should.be_true(string.length(wire) > 0)
}

// Test-only helpers -----------------------------------------------------------

fn schema_action(name: String, fields: List(#(String, String))) -> Action {
  let payload =
    fields
    |> list.map(fn(pair) { #(pair.0, dynamic.string(pair.1)) })
    |> dict.from_list
  action.new(name) |> action.with_payload(payload)
}
