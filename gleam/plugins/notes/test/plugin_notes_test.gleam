//// Unit tests for the Notes plugin (`plugin_notes`, Phase 7.6).

import gleam/dict
import gleam/dynamic
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/nostr/kind
import omni/platform/storage
import omni/plugin_kit/app.{Publish, PublishEncrypted}
import omni/plugin_kit/local_store
import omni/plugin_kit/route
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import plugin/notes/main as notes_main
import plugin/notes/model.{
  FolderAll, FolderArchive, FolderStarred, FolderTag, Model, NoteDoc,
  content_snippet, from_json_string, init, init_with_notes, to_json_string,
  word_count,
}
import plugin/notes/msg.{
  AddTag, CreateNote, DeleteNote, RemoveTag, SaveActiveNote, SelectFolder,
  SelectNote, SetDraftContent, SetDraftTitle, SetSearchQuery, ToggleArchive,
  ToggleEncryptedSync, ToggleStar,
}
import plugin/notes/update
import plugin/notes/view

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn init_selects_welcome_note_test() {
  let m = init()
  list.length(m.notes) |> should.equal(1)
  m.active_note_id |> should.equal(Some("note_1"))
  m.draft_title |> should.equal("Welcome to Notes")
  m.sync_encrypted |> should.equal(True)
  m.folder |> should.equal(FolderAll)
}

pub fn create_select_and_delete_notes_test() {
  let #(m1, _) = update.update(init(), CreateNote)
  list.length(m1.notes) |> should.equal(2)
  m1.active_note_id |> should.equal(Some("note_2"))
  m1.draft_title |> should.equal("Untitled Note")

  let #(m2, _) = update.update(m1, SetDraftTitle("Second thoughts"))
  let #(m3, _) = update.update(m2, SetDraftContent("some content"))
  let #(m4, _) = update.update(m3, SaveActiveNote)

  let assert Ok(saved) = list.find(m4.notes, fn(n) { n.id == "note_2" })
  saved.title |> should.equal("Second thoughts")
  saved.content |> should.equal("some content")

  let #(m5, _) = update.update(m4, SelectNote("note_1"))
  m5.draft_title |> should.equal("Welcome to Notes")

  let #(m6, _) = update.update(m5, DeleteNote("note_1"))
  list.length(m6.notes) |> should.equal(1)
  m6.active_note_id |> should.equal(Some("note_2"))
}

pub fn save_sanitizes_unsafe_html_test() {
  let m0 = init()
  let #(m1, _) =
    update.update(
      m0,
      SetDraftContent("<p>safe</p><script>alert('xss')</script>"),
    )
  let #(m2, _) = update.update(m1, SaveActiveNote)
  let assert Ok(saved) = list.find(m2.notes, fn(n) { n.id == "note_1" })
  should.be_false(string.contains(saved.content, "<script"))
}

pub fn star_archive_and_folders_test() {
  let #(m1, _) = update.update(init(), CreateNote)
  let #(m2, _) = update.update(m1, ToggleStar("note_2"))
  let assert Ok(starred) = list.find(m2.notes, fn(n) { n.id == "note_2" })
  starred.starred |> should.equal(True)

  let #(m3, _) = update.update(m2, SelectFolder(FolderStarred))
  let starred_notes = model.visible_notes(m3)
  list.any(starred_notes, fn(n) { n.id == "note_2" }) |> should.equal(True)

  let #(m4, _) = update.update(m3, ToggleArchive("note_2"))
  let assert Ok(archived) = list.find(m4.notes, fn(n) { n.id == "note_2" })
  archived.archived |> should.equal(True)

  let #(m5, _) = update.update(m4, SelectFolder(FolderArchive))
  list.length(model.visible_notes(m5)) |> should.equal(1)

  // Archived notes stay out of the All folder.
  let #(m6, _) = update.update(m5, SelectFolder(FolderAll))
  list.length(model.visible_notes(m6)) |> should.equal(1)
}

pub fn tags_and_tag_folder_test() {
  let #(m1, _) = update.update(init(), AddTag("  Gleam  "))
  let assert Ok(note) = list.find(m1.notes, fn(n) { n.id == "note_1" })
  should.be_true(list.contains(note.tags, "gleam"))

  let #(m2, _) = update.update(m1, SelectFolder(FolderTag("gleam")))
  list.length(model.visible_notes(m2)) |> should.equal(1)

  let #(m3, _) = update.update(m2, RemoveTag("gleam"))
  let assert Ok(cleaned) = list.find(m3.notes, fn(n) { n.id == "note_1" })
  should.be_false(list.contains(cleaned.tags, "gleam"))
}

pub fn search_filters_notes_test() {
  let notes = [
    NoteDoc("a", "Shopping", "milk and eggs", [], False, False, True, 1),
    NoteDoc(
      "b",
      "Gleam notes",
      "pattern matching",
      ["code"],
      False,
      False,
      True,
      2,
    ),
  ]
  let m0 = init_with_notes(notes)
  let #(m1, _) = update.update(m0, SetSearchQuery("pattern"))
  let found = model.visible_notes(m1)
  list.length(found) |> should.equal(1)
  let assert Ok(match) = list.first(found)
  match.id |> should.equal("b")
}

pub fn encryption_toggle_and_dirty_flag_test() {
  let m0 = init()
  let #(m1, _) = update.update(m0, ToggleEncryptedSync)
  m1.sync_encrypted |> should.equal(False)

  let #(m2, _) = update.update(m1, SetDraftTitle("Changed"))
  m2.dirty |> should.equal(True)
  should.be_true(m2.draft_title == "Changed")
}

pub fn json_round_trip_test() {
  let #(m1, _) = update.update(init(), CreateNote)
  let raw = to_json_string(m1)
  let assert Ok(restored) = from_json_string(raw)
  list.length(restored.notes) |> should.equal(2)
  restored.active_note_id |> should.equal(Some("note_2"))
}

pub fn word_count_and_snippet_helpers_test() {
  word_count("<p>hello brave new world</p>") |> should.equal(4)
  content_snippet("<p>hello brave new world</p>", 10)
  |> should.equal("hello brav...")
}

pub fn action_mapping_test() {
  update.action_to_msg(schema_action("create_note", []))
  |> should.equal(Some(CreateNote))

  update.action_to_msg(schema_action("select_note", [#("id", "note_1")]))
  |> should.equal(Some(SelectNote("note_1")))

  update.action_to_msg(schema_action("toggle_star", [#("id", "note_1")]))
  |> should.equal(Some(ToggleStar("note_1")))

  update.action_to_msg(schema_action("delete_note", [#("id", "note_1")]))
  |> should.equal(Some(DeleteNote("note_1")))

  update.action_to_msg(schema_action("set_draft_title", [#("value", "Hi")]))
  |> should.equal(Some(SetDraftTitle("Hi")))

  update.action_to_msg(schema_action("save_active_note", []))
  |> should.equal(Some(SaveActiveNote))

  update.action_to_msg(schema_action("select_folder", [#("folder", "starred")]))
  |> should.equal(Some(SelectFolder(FolderStarred)))

  update.action_to_msg(schema_action("add_tag", [#("tag", "x")]))
  |> should.equal(Some(AddTag("x")))

  update.action_to_msg(schema_action("remove_tag", [#("tag", "x")]))
  |> should.equal(Some(RemoveTag("x")))

  update.action_to_msg(schema_action("toggle_encrypted_sync", []))
  |> should.equal(Some(ToggleEncryptedSync))

  update.action_to_msg(schema_action("unknown", []))
  |> should.equal(None)
}

pub fn view_renders_notebook_and_widget_test() {
  let m = init()
  let wire = view.view(m) |> schema.encode_schema_message
  should.be_true(string.contains(wire, "Welcome to Notes"))
  should.be_true(string.contains(wire, "notes-editor"))
  should.be_true(string.contains(wire, "tabs"))

  let widget_wire = view.view_widget(m) |> schema.encode_schema_message
  should.be_true(string.contains(widget_wire, "Welcome to Notes"))
}

pub fn storage_backed_spec_persists_notebook_test() {
  let store = storage.in_memory()
  let spec = notes_main.app_spec_with_storage(store)
  let #(m0, _) = spec.init(route.parse_search(""))
  let #(m1, _) = spec.update(m0, CreateNote)
  let #(m2, _) = spec.update(m1, SetDraftTitle("Persisted"))

  let reloaded = notes_main.notebook_store_config()
  let stored = local_store.load(store, notes_main.notebook_store_config())
  list.length(stored.notes) |> should.equal(2)
}

pub fn running_apps_emit_schema_test() {
  let running = notes_main.start_app("", fn(_node) { Nil })
  let wire = running |> app.current_view |> schema.encode_schema_message
  should.be_true(string.length(wire) > 0)

  let widget = notes_main.start_widget_app("", fn(_node) { Nil })
  let widget_wire = widget |> app.current_view |> schema.encode_schema_message
  should.be_true(string.contains(widget_wire, "Welcome to Notes"))
}

// Test-only helpers -----------------------------------------------------------

fn schema_action(name: String, fields: List(#(String, String))) -> Action {
  let payload =
    fields
    |> list.map(fn(pair) { #(pair.0, dynamic.string(pair.1)) })
    |> dict.from_list
  action.new(name) |> action.with_payload(payload)
}

pub fn save_publishes_encrypted_nip78_doc_test() {
  let m0 = init()
  let #(m1, _) = update.update(m0, SetDraftContent("<p>secret</p>"))
  let #(_, effects) = update.update(m1, SaveActiveNote)
  should.be_true(
    list.any(effects, fn(effect) {
      case effect {
        PublishEncrypted(draft) ->
          draft.kind == kind.AppData
          && list.any(draft.tags, fn(tag) {
            case tag {
              ["d", ..] -> True
              _ -> False
            }
          })
        _ -> False
      }
    }),
  )

  // Plain publishing when encrypted sync is disabled.
  let #(m2, _) = update.update(m1, ToggleEncryptedSync)
  let #(_, plain_effects) = update.update(m2, SaveActiveNote)
  should.be_true(
    list.any(plain_effects, fn(effect) {
      case effect {
        Publish(_) -> True
        _ -> False
      }
    }),
  )
}
