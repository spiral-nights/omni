//// Domain model, folder filtering, search, and NIP-78 document codec for `plugin_notes`.

import gleam/dynamic/decode.{type Decoder}
import gleam/int
import gleam/json.{type Json}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

/// NIP-78 replaceable document `d` tag identifier for notebook sync.
pub const notes_d_tag = "omni/notes/v1"

/// Sidebar folder filter for the personal notebook.
pub type NotebookFolder {
  FolderAll
  FolderStarred
  FolderArchive
  FolderTag(String)
}

/// A single personal note document.
pub type NoteDoc {
  NoteDoc(
    id: String,
    title: String,
    content: String,
    tags: List(String),
    starred: Bool,
    archived: Bool,
    encrypted: Bool,
    updated_at: Int,
  )
}

/// Complete application state for `plugin_notes`.
pub type Model {
  Model(
    notes: List(NoteDoc),
    active_note_id: Option(String),
    folder: NotebookFolder,
    search_query: String,
    draft_title: String,
    draft_content: String,
    draft_tag: String,
    sync_encrypted: Bool,
    dirty: Bool,
    next_id: Int,
    my_pubkey: Option(String),
    show_settings: Bool,
  )
}

/// Construct the default welcome note seeded into a new notebook.
pub fn default_welcome_note() -> NoteDoc {
  NoteDoc(
    id: "note_1",
    title: "Welcome to Notes",
    content: "<p>A private, local-first personal notebook for your thoughts.</p><ul><li><b>End-to-End Encrypted</b>: Only your key can decrypt your notes via NIP-44.</li><li><b>Multi-Device Sync</b>: Changes sync seamlessly via NIP-78 replaceable documents.</li><li><b>Zero Distractions</b>: Clean typography, tag organization, and offline access.</li></ul>",
    tags: ["welcome", "nostr"],
    starred: True,
    archived: False,
    encrypted: True,
    updated_at: 1_700_000_000,
  )
}

/// Initialize the default `Model` with a welcome note selected.
pub fn init() -> Model {
  let welcome = default_welcome_note()
  Model(
    notes: [welcome],
    active_note_id: Some(welcome.id),
    folder: FolderAll,
    search_query: "",
    draft_title: welcome.title,
    draft_content: welcome.content,
    draft_tag: "",
    sync_encrypted: True,
    dirty: False,
    next_id: 2,
    my_pubkey: None,
    show_settings: False,
  )
}

/// Initialize a `Model` from an explicit list of `NoteDoc` items.
pub fn init_with_notes(notes: List(NoteDoc)) -> Model {
  case notes {
    [] ->
      Model(
        notes: [],
        active_note_id: None,
        folder: FolderAll,
        search_query: "",
        draft_title: "",
        draft_content: "",
        draft_tag: "",
        sync_encrypted: True,
        dirty: False,
        next_id: 1,
        my_pubkey: None,
        show_settings: False,
      )
    [first, ..] ->
      Model(
        notes: notes,
        active_note_id: Some(first.id),
        folder: FolderAll,
        search_query: "",
        draft_title: first.title,
        draft_content: first.content,
        draft_tag: "",
        sync_encrypted: first.encrypted,
        dirty: False,
        next_id: list.length(notes) + 1,
        my_pubkey: None,
        show_settings: False,
      )
  }
}

/// Return the currently selected `NoteDoc` if `active_note_id` matches an existing note.
pub fn active_note(model: Model) -> Option(NoteDoc) {
  case model.active_note_id {
    None -> None
    Some(target_id) ->
      list.find(model.notes, fn(n) { n.id == target_id })
      |> option.from_result
  }
}

/// Return the list of notes matching both the active `folder` and `search_query`.
pub fn visible_notes(model: Model) -> List(NoteDoc) {
  let query_lower = string.lowercase(string.trim(model.search_query))
  list.filter(model.notes, fn(note) {
    matches_folder(note, model.folder) && matches_query(note, query_lower)
  })
}

fn matches_folder(note: NoteDoc, folder: NotebookFolder) -> Bool {
  case folder {
    FolderAll -> !note.archived
    FolderStarred -> note.starred && !note.archived
    FolderArchive -> note.archived
    FolderTag(tag) -> {
      let target = string.lowercase(string.trim(tag))
      !note.archived
      && list.any(note.tags, fn(t) {
        string.lowercase(string.trim(t)) == target
      })
    }
  }
}

fn matches_query(note: NoteDoc, query_lower: String) -> Bool {
  case query_lower {
    "" -> True
    q -> {
      let in_title = string.contains(string.lowercase(note.title), q)
      let in_content = string.contains(string.lowercase(note.content), q)
      let in_tags =
        list.any(note.tags, fn(t) { string.contains(string.lowercase(t), q) })
      in_title || in_content || in_tags
    }
  }
}

/// Collect all unique tags across non-archived notes in the model.
pub fn all_tags(model: Model) -> List(String) {
  model.notes
  |> list.filter(fn(n) { !n.archived })
  |> list.flat_map(fn(n) { n.tags })
  |> list.map(fn(t) { string.lowercase(string.trim(t)) })
  |> list.filter(fn(t) { t != "" })
  |> list.unique
}

/// Convert a `NotebookFolder` to a route/tab identifier string.
pub fn folder_to_id(folder: NotebookFolder) -> String {
  case folder {
    FolderAll -> "all"
    FolderStarred -> "starred"
    FolderArchive -> "archive"
    FolderTag(tag) -> "tag:" <> string.lowercase(string.trim(tag))
  }
}

/// Parse a `NotebookFolder` from a tab/action identifier string.
pub fn folder_from_id(raw: String) -> NotebookFolder {
  let trimmed = string.trim(raw)
  case trimmed {
    "all" | "" -> FolderAll
    "starred" -> FolderStarred
    "archive" -> FolderArchive
    _ ->
      case string.starts_with(trimmed, "tag:") {
        True -> {
          let tag = string.trim(string.drop_start(trimmed, 4))
          case tag {
            "" -> FolderAll
            t -> FolderTag(t)
          }
        }
        False -> FolderTag(trimmed)
      }
  }
}

/// Estimate word count of a note's content (stripping HTML tags).
pub fn word_count(raw_html: String) -> Int {
  let plain = strip_html_tags(raw_html, "")
  plain
  |> string.replace("\n", " ")
  |> string.replace("\t", " ")
  |> string.split(" ")
  |> list.filter(fn(w) { string.trim(w) != "" })
  |> list.length
}

/// Extract a plain-text snippet from HTML note content.
pub fn content_snippet(raw_html: String, max_len: Int) -> String {
  let plain =
    strip_html_tags(raw_html, " ")
    |> string.trim
  case plain {
    "" -> "Empty note..."
    _ ->
      case string.length(plain) > max_len {
        True -> string.slice(plain, at_index: 0, length: max_len) <> "..."
        False -> plain
      }
  }
}

fn strip_html_tags(remaining: String, replacement: String) -> String {
  do_strip_html_tags(remaining, replacement, "")
}

fn do_strip_html_tags(
  remaining: String,
  replacement: String,
  acc: String,
) -> String {
  case string.split_once(remaining, "<") {
    Error(Nil) -> acc <> remaining
    Ok(#(before, after_lt)) ->
      case string.split_once(after_lt, ">") {
        Error(Nil) -> acc <> before
        Ok(#(_tag, after_gt)) ->
          do_strip_html_tags(
            after_gt,
            replacement,
            acc <> before <> replacement,
          )
      }
  }
}

// -----------------------------------------------------------------------------
// JSON Codec for NIP-78 Encrypted Document Sync (`d_tag: "omni/notes/v1"`)
// -----------------------------------------------------------------------------

/// Encode a single `NoteDoc` to `Json`.
pub fn encode_note_doc(note: NoteDoc) -> Json {
  json.object([
    #("id", json.string(note.id)),
    #("title", json.string(note.title)),
    #("content", json.string(note.content)),
    #("tags", json.array(note.tags, json.string)),
    #("starred", json.bool(note.starred)),
    #("archived", json.bool(note.archived)),
    #("encrypted", json.bool(note.encrypted)),
    #("updated_at", json.int(note.updated_at)),
  ])
}

/// Dynamic decoder for a `NoteDoc`.
pub fn note_doc_decoder() -> Decoder(NoteDoc) {
  use id <- decode.field("id", decode.string)
  use title <- decode.optional_field("title", "", decode.string)
  use content <- decode.optional_field(
    "content",
    None,
    decode.optional(decode.string),
  )
  // Documents written by the previous app used `html` for the body.
  use legacy_html <- decode.optional_field("html", "", decode.string)
  use tags <- decode.optional_field("tags", [], decode.list(decode.string))
  use starred <- decode.optional_field("starred", False, decode.bool)
  use archived <- decode.optional_field("archived", False, decode.bool)
  use encrypted <- decode.optional_field("encrypted", True, decode.bool)
  use updated_at <- decode.optional_field("updated_at", 0, decode.int)
  use legacy_updated <- decode.optional_field("updatedAt", 0, decode.int)

  decode.success(NoteDoc(
    id: id,
    title: title,
    content: option.unwrap(content, legacy_html),
    tags: tags,
    starred: starred,
    archived: archived,
    encrypted: encrypted,
    updated_at: int.max(updated_at, legacy_updated),
  ))
}

/// Encode the notebook document (`d_tag: "omni/notes/v1"`) into `Json`.
pub fn encode_notebook(model: Model) -> Json {
  json.object([
    #("d_tag", json.string(notes_d_tag)),
    #("sync_encrypted", json.bool(model.sync_encrypted)),
    #("next_id", json.int(model.next_id)),
    #("active_note_id", case model.active_note_id {
      Some(id) -> json.string(id)
      None -> json.null()
    }),
    #("notes", json.array(model.notes, encode_note_doc)),
  ])
}

/// Serialize the notebook model to a JSON string for NIP-78 document storage.
pub fn to_json_string(model: Model) -> String {
  encode_notebook(model) |> json.to_string
}

/// Decoder for the NIP-78 notebook document (`d_tag: "omni/notes/v1"`).
pub fn notebook_decoder() -> Decoder(Model) {
  use notes <- decode.optional_field(
    "notes",
    [],
    decode.list(note_doc_decoder()),
  )
  use active_note_id <- decode.optional_field(
    "active_note_id",
    None,
    decode.optional(decode.string),
  )
  use sync_encrypted <- decode.optional_field(
    "sync_encrypted",
    True,
    decode.bool,
  )
  use next_id <- decode.optional_field("next_id", 1, decode.int)

  let resolved_active = case active_note_id {
    Some(id) ->
      case list.any(notes, fn(n) { n.id == id }) {
        True -> Some(id)
        False ->
          case notes {
            [first, ..] -> Some(first.id)
            [] -> None
          }
      }
    None ->
      case notes {
        [first, ..] -> Some(first.id)
        [] -> None
      }
  }

  let #(draft_title, draft_content) = case resolved_active {
    Some(id) ->
      case list.find(notes, fn(n) { n.id == id }) {
        Ok(found) -> #(found.title, found.content)
        Error(Nil) -> #("", "")
      }
    None -> #("", "")
  }

  let computed_next_id = int.max(next_id, list.length(notes) + 1)

  decode.success(Model(
    notes: notes,
    active_note_id: resolved_active,
    folder: FolderAll,
    search_query: "",
    draft_title: draft_title,
    draft_content: draft_content,
    draft_tag: "",
    sync_encrypted: sync_encrypted,
    dirty: False,
    next_id: computed_next_id,
    my_pubkey: None,
    show_settings: False,
  ))
}

/// Parse a `Model` from a JSON string encoded by `to_json_string` / `encode_notebook`.
pub fn from_json_string(raw: String) -> Result(Model, String) {
  case json.parse(from: raw, using: notebook_decoder()) {
    Ok(m) -> Ok(m)
    Error(_) -> Error("Failed to decode omni/notes/v1 notebook JSON")
  }
}
