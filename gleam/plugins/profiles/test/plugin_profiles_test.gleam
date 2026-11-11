//// Unit tests for the Profiles plugin (`plugin_profiles`, Phase 7.7).

import gleam/dict
import gleam/dynamic
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/nostr/event.{type Event, Event}
import omni/nostr/event_id
import omni/nostr/kind.{type Kind, ContactList, Metadata, Note as KindNote}
import omni/nostr/pubkey
import omni/plugin_kit/app.{Publish}
import omni/plugin_kit/local_store
import omni/plugin_kit/route
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import omni/testkit/fake_ports
import plugin/profiles/main as profiles_main
import plugin/profiles/model.{
  Model, SignerLocked, SignerMissing, SignerReady, ViewDirectory, ViewKeys,
  ViewMetadata, ViewProfile, bob_pubkey_hex, filtered_profiles, follow_count,
  following, my_pubkey_hex, notes_by_author, own_npub, selected_profile,
}
import plugin/profiles/msg.{
  IngestEvent, RefreshSigner, SaveMetadata, SelectProfile, SelectView,
  SetMetadataAbout, SetMetadataName, SetMetadataPicture, SetSearchQuery,
  ToggleFollow,
}
import plugin/profiles/update
import plugin/profiles/view

pub fn main() -> Nil {
  gleeunit.main()
}

const carol_pubkey_hex =
  "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"

const dave_pubkey_hex =
  "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"

const alice_note_id =
  "1111111111111111111111111111111111111111111111111111111111111111"

pub fn model_init_and_route_resolution_test() {
  let m = model.init(route.main())
  m.view |> should.equal(ViewDirectory)
  dict.size(m.profiles) |> should.equal(3)
  m.my_pubkey |> should.equal(Some(my_pubkey_hex))
  m.selected_pubkey |> should.equal(None)
  m.signer_status |> should.equal(SignerLocked)
  m.metadata_draft.name |> should.equal("Alice")
  list.length(model.all_profiles(m)) |> should.equal(3)

  model.view_from_route(route.parse_search(
    "?view=profile&id=" <> bob_pubkey_hex,
  ))
  |> should.equal(ViewProfile(bob_pubkey_hex))
  model.view_from_route(route.parse_search("?view=metadata"))
  |> should.equal(ViewMetadata)
  model.view_from_route(route.parse_search("?view=keys"))
  |> should.equal(ViewKeys)
  model.view_from_route(route.parse_search("?view=profile"))
  |> should.equal(ViewDirectory)

  let routed =
    model.init(route.parse_search("?view=profile&id=" <> bob_pubkey_hex))
  routed.selected_pubkey |> should.equal(Some(bob_pubkey_hex))
  routed.metadata_draft.name |> should.equal("Bob")
}

pub fn directory_search_filters_people_test() {
  let m0 = model.init(route.main())
  let #(m1, _) = update.update(m0, SetSearchQuery("bob@"))

  let matched = filtered_profiles(m1)
  list.length(matched) |> should.equal(1)
  let assert Ok(bob) = list.first(matched)
  bob.pubkey |> should.equal(bob_pubkey_hex)

  let #(m2, _) = update.update(m1, SetSearchQuery("ILLUSTRATOR"))
  let assert Ok(carol) = list.first(filtered_profiles(m2))
  carol.pubkey |> should.equal(carol_pubkey_hex)

  let #(m3, _) = update.update(m2, SetSearchQuery("missing person"))
  filtered_profiles(m3) |> should.equal([])

  let #(m4, _) = update.update(m3, SetSearchQuery(""))
  list.length(filtered_profiles(m4)) |> should.equal(3)
}

pub fn select_profile_populates_detail_and_draft_test() {
  let m0 = model.init(route.main())
  let #(m1, _) = update.update(m0, SelectProfile(bob_pubkey_hex))

  m1.view |> should.equal(ViewProfile(bob_pubkey_hex))
  m1.selected_pubkey |> should.equal(Some(bob_pubkey_hex))
  m1.metadata_draft.name |> should.equal("Bob")
  m1.metadata_draft.about
  |> should.equal("Relay operator and long-form writer.")

  let assert Some(person) = selected_profile(m1)
  person.pubkey |> should.equal(bob_pubkey_hex)

  let #(m2, _) = update.update(m1, SelectProfile("   "))
  m2 |> should.equal(m1)

  let #(m3, _) = update.update(m1, SelectView(ViewMetadata))
  m3.metadata_draft.name |> should.equal("Alice")
  m3.metadata_dirty |> should.equal(False)
}

pub fn follow_toggle_updates_contact_list_test() {
  let m0 = model.init(route.main())
  follow_count(m0) |> should.equal(0)
  following(m0, bob_pubkey_hex) |> should.equal(False)

  let #(m1, _) = update.update(m0, ToggleFollow(bob_pubkey_hex))
  follow_count(m1) |> should.equal(1)
  following(m1, bob_pubkey_hex) |> should.equal(True)
  m1.follows.followed_pubkeys |> should.equal([bob_pubkey_hex])

  let #(m2, _) = update.update(m1, ToggleFollow(bob_pubkey_hex))
  follow_count(m2) |> should.equal(0)
  following(m2, bob_pubkey_hex) |> should.equal(False)

  let #(m3, _) = update.update(m2, ToggleFollow(""))
  m3 |> should.equal(m2)
}

pub fn metadata_edit_and_save_test() {
  let m0 = model.init(route.parse_search("?view=metadata"))
  m0.metadata_dirty |> should.equal(False)

  let #(m1, _) = update.update(m0, SetMetadataName("  Alice Updated  "))
  let #(m2, _) = update.update(m1, SetMetadataAbout("New bio"))
  let #(m3, _) = update.update(m2, SetMetadataPicture("https://x.test/a.png"))
  m3.metadata_dirty |> should.equal(True)

  let #(m4, _) = update.update(m3, SaveMetadata)
  let assert Ok(saved) = dict.get(m4.profiles, my_pubkey_hex)
  saved.name |> should.equal(Some("Alice Updated"))
  saved.about |> should.equal(Some("New bio"))
  saved.picture |> should.equal(Some("https://x.test/a.png"))
  saved.created_at |> should.equal(m3.now_sec + 1)
  m4.metadata_dirty |> should.equal(False)
  m4.metadata_draft.name |> should.equal("Alice Updated")
  m4.view |> should.equal(ViewMetadata)

  let #(m5, _) = update.update(m3, SetMetadataName(""))
  let #(m6, _) = update.update(m5, SaveMetadata)
  let assert Ok(cleared) = dict.get(m6.profiles, my_pubkey_hex)
  cleared.name |> should.equal(None)
}

pub fn action_mapping_core_test() {
  update.action_to_msg(
    schema_action("select-profile", [
      #("pubkey", bob_pubkey_hex),
    ]),
  )
  |> should.equal(Some(SelectProfile(bob_pubkey_hex)))

  update.action_to_msg(schema_action("search", [#("query", "gleam")]))
  |> should.equal(Some(SetSearchQuery("gleam")))

  update.action_to_msg(
    schema_action("toggle-follow", [
      #("pubkey", bob_pubkey_hex),
    ]),
  )
  |> should.equal(Some(ToggleFollow(bob_pubkey_hex)))

  update.action_to_msg(
    schema_action("set-metadata-name", [
      #("value", "Alice"),
    ]),
  )
  |> should.equal(Some(SetMetadataName("Alice")))

  update.action_to_msg(
    schema_action("set-metadata-about", [
      #("value", "bio"),
    ]),
  )
  |> should.equal(Some(SetMetadataAbout("bio")))

  update.action_to_msg(
    schema_action("input", [
      #("name", "picture"),
      #("value", "https://x.test/p.png"),
    ]),
  )
  |> should.equal(Some(SetMetadataPicture("https://x.test/p.png")))

  update.action_to_msg(schema_action("save-metadata", []))
  |> should.equal(Some(SaveMetadata))

  update.action_to_msg(schema_action("edit-metadata", []))
  |> should.equal(Some(SelectView(ViewMetadata)))

  update.action_to_msg(schema_action("view-keys", []))
  |> should.equal(Some(SelectView(ViewKeys)))

  update.action_to_msg(schema_action("view-directory", []))
  |> should.equal(Some(SelectView(ViewDirectory)))

  update.action_to_msg(
    schema_action("select-view", [
      #("view", "profile"),
      #("id", bob_pubkey_hex),
    ]),
  )
  |> should.equal(Some(SelectView(ViewProfile(bob_pubkey_hex))))

  update.action_to_msg(schema_action("refresh-signer", []))
  |> should.equal(Some(RefreshSigner))

  update.action_to_msg(schema_action("unknown-action", []))
  |> should.equal(None)
}

pub fn view_note_intent_is_emitted_but_not_consumed_test() {
  // The host intent broker owns note navigation, so the plugin ignores it.
  update.action_to_msg(schema_action("view_note", [#("id", alice_note_id)]))
  |> should.equal(None)

  let m0 = model.init(route.main())
  let #(m1, _) = update.update(m0, SelectProfile(my_pubkey_hex))
  let wire = view.view(m1) |> schema.encode_schema_message

  string.contains(wire, "\"name\":\"view_note\"") |> should.be_true()
  string.contains(wire, "\"id\":\"" <> alice_note_id <> "\"")
  |> should.be_true()
  string.contains(wire, "\"noteId\":\"" <> alice_note_id <> "\"")
  |> should.be_true()
}

pub fn directory_view_renders_people_and_search_test() {
  let m = model.init(route.main())
  let wire = view.view(m) |> schema.encode_schema_message

  string.contains(wire, "People") |> should.be_true()
  string.contains(wire, "profiles-directory") |> should.be_true()
  string.contains(wire, "alice@profiles.example") |> should.be_true()
  string.contains(wire, "toggle-follow") |> should.be_true()
  string.contains(wire, "select-profile") |> should.be_true()
}

pub fn profile_view_renders_detail_follow_and_notes_test() {
  let m0 = model.init(route.main())
  let #(m1, _) = update.update(m0, SelectProfile(bob_pubkey_hex))
  let wire = view.view(m1) |> schema.encode_schema_message

  string.contains(wire, "Bob Chen") |> should.be_true()
  string.contains(wire, "bob@profiles.example") |> should.be_true()
  string.contains(wire, "Relay operator and long-form writer.")
  |> should.be_true()
  string.contains(wire, "Follow") |> should.be_true()
  string.contains(wire, "Contact lists are Kind 3 replaceable events.")
  |> should.be_true()
  string.contains(wire, "view_note") |> should.be_true()

  let #(m2, _) = update.update(m1, ToggleFollow(bob_pubkey_hex))
  let followed_wire = view.view(m2) |> schema.encode_schema_message
  string.contains(followed_wire, "Unfollow") |> should.be_true()
}

pub fn metadata_and_keys_views_render_test() {
  let m0 = model.init(route.parse_search("?view=metadata"))
  let metadata_wire = view.view(m0) |> schema.encode_schema_message
  string.contains(metadata_wire, "Edit Metadata") |> should.be_true()
  string.contains(metadata_wire, "Save Profile") |> should.be_true()
  string.contains(metadata_wire, "set-metadata-name") |> should.be_true()
  string.contains(metadata_wire, "Saved") |> should.be_true()

  let #(m1, _) = update.update(m0, SetMetadataName("Changed"))
  let dirty_wire = view.view(m1) |> schema.encode_schema_message
  string.contains(dirty_wire, "Unsaved changes") |> should.be_true()

  let keys_wire =
    view.view(model.init(route.parse_search("?view=keys")))
    |> schema.encode_schema_message
  string.contains(keys_wire, "Key Custody") |> should.be_true()
  string.contains(keys_wire, "npub1") |> should.be_true()
  string.contains(keys_wire, "Signer locked") |> should.be_true()
  string.contains(keys_wire, "Refresh Signer") |> should.be_true()
}

pub fn ingest_metadata_note_and_contact_events_test() {
  let m0 = model.init(route.main())

  let metadata_event =
    make_event(
      "d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
      dave_pubkey_hex,
      1_700_000_500,
      Metadata,
      [],
      "{\"name\":\"Dave\",\"about\":\"New arrival\"}",
    )
  let #(m1, _) = update.update(m0, IngestEvent(metadata_event))
  let assert Ok(dave) = dict.get(m1.profiles, dave_pubkey_hex)
  dave.name |> should.equal(Some("Dave"))
  dave.about |> should.equal(Some("New arrival"))
  m1.now_sec |> should.equal(1_700_000_500)

  let note =
    make_event(
      "4444444444444444444444444444444444444444444444444444444444444444",
      dave_pubkey_hex,
      1_700_000_600,
      KindNote,
      [],
      "Hello from Dave",
    )
  let #(m2, _) = update.update(m1, IngestEvent(note))
  let dave_notes = notes_by_author(m2, dave_pubkey_hex)
  list.length(dave_notes) |> should.equal(1)
  let assert Ok(parsed) = list.first(dave_notes)
  parsed.content |> should.equal("Hello from Dave")
  m2.now_sec |> should.equal(1_700_000_600)

  let contacts =
    make_event(
      "5555555555555555555555555555555555555555555555555555555555555555",
      my_pubkey_hex,
      1_700_000_700,
      ContactList,
      [["p", bob_pubkey_hex], ["p", carol_pubkey_hex]],
      "",
    )
  let #(m3, _) = update.update(m2, IngestEvent(contacts))
  follow_count(m3) |> should.equal(2)
  following(m3, carol_pubkey_hex) |> should.equal(True)
}

pub fn refresh_signer_status_test() {
  let m0 = model.init(route.main())
  m0.signer_status |> should.equal(SignerLocked)

  let #(m1, _) = update.update(m0, RefreshSigner)
  m1.signer_status |> should.equal(SignerReady)

  let anonymous = Model(..m0, my_pubkey: None)
  let #(m2, _) = update.update(anonymous, RefreshSigner)
  m2.signer_status |> should.equal(SignerMissing)
  own_npub(anonymous) |> should.equal("")
  string.starts_with(own_npub(m0), "npub1") |> should.be_true()
}

pub fn storage_backed_spec_persists_profiles_test() {
  let store = fake_ports.in_memory_storage()
  let spec = profiles_main.app_spec_with_storage(store)
  let #(m0, _) = spec.init(route.main())

  let #(m1, _) = spec.update(m0, SetMetadataName("Persisted Alice"))
  let #(_m2, _) = spec.update(m1, SaveMetadata)

  let stored = local_store.load(store, model.profile_store_config())
  let assert Ok(alice) = dict.get(stored, my_pubkey_hex)
  alice.name |> should.equal(Some("Persisted Alice"))
  dict.size(stored) |> should.equal(3)

  let #(reloaded, _) = spec.init(route.main())
  let assert Ok(cached) = dict.get(reloaded.profiles, my_pubkey_hex)
  cached.name |> should.equal(Some("Persisted Alice"))
}

pub fn running_app_emits_schema_and_handles_actions_test() {
  let running = profiles_main.start_app("", fn(_node) { Nil })
  let wire = app.current_view(running) |> schema.encode_schema_message
  string.contains(wire, "People") |> should.be_true()

  let handled =
    app.handle_action(
      running,
      schema_action("select-profile", [#("pubkey", bob_pubkey_hex)]),
    )
  handled |> should.be_true()

  case app.current_model(running).view {
    ViewProfile(pubkey) -> pubkey |> should.equal(bob_pubkey_hex)
    _ -> should.fail()
  }

  let ignored =
    app.handle_action(
      running,
      schema_action("view_note", [
        #("id", alice_note_id),
      ]),
    )
  ignored |> should.be_false()
}

// Test-only helpers -----------------------------------------------------------

fn make_event(
  id_hex: String,
  pk_hex: String,
  created_at: Int,
  kind: Kind,
  tags: List(List(String)),
  content: String,
) -> Event {
  let assert Ok(id) = event_id.parse(id_hex)
  let assert Ok(pk) = pubkey.parse(pk_hex)
  Event(
    id: id,
    pubkey: pk,
    created_at: created_at,
    kind: kind,
    tags: tags,
    content: content,
    sig: string.repeat("a", 128),
  )
}

fn schema_action(name: String, fields: List(#(String, String))) -> Action {
  let payload =
    fields
    |> list.map(fn(pair) { #(pair.0, dynamic.string(pair.1)) })
    |> dict.from_list
  action.new(name) |> action.with_payload(payload)
}

pub fn follow_and_metadata_emits_publish_effects_test() {
  let m0 = model.init(route.main())
  let #(_, follow_effects) = update.update(m0, ToggleFollow(bob_pubkey_hex))
  should.be_true(
    list.any(follow_effects, fn(effect) {
      case effect {
        Publish(draft) -> draft.kind == ContactList
        _ -> False
      }
    }),
  )

  let #(m1, _) = update.update(m0, SetMetadataName("Alice"))
  let #(_, meta_effects) = update.update(m1, SaveMetadata)
  should.be_true(
    list.any(meta_effects, fn(effect) {
      case effect {
        Publish(draft) -> draft.kind == Metadata
        _ -> False
      }
    }),
  )
}
