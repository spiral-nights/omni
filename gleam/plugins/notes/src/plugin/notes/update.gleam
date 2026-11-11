//// Pure Elm-style state transitions and action decoder for `plugin_notes`.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/plugin_kit/app.{type Effect}
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import omni/ui/sanitize
import plugin/notes/model.{type Model, type NoteDoc, Model, NoteDoc}
import plugin/notes/msg.{
  type Msg, AddTag, CreateNote, DeleteNote, RemoveTag, SaveActiveNote,
  SelectFolder, SelectNote, SetDraftContent, SetDraftTitle, SetSearchQuery,
  ToggleArchive, ToggleEncryptedSync, ToggleStar,
}

/// Apply a `Msg` to `model`, returning the updated `Model` and resulting effects.
///
/// Sanitizes note content via `omni/ui/sanitize.strip_unsafe_html` on save.
pub fn update(model: Model, msg: Msg) -> #(Model, List(Effect(Msg))) {
  case msg {
    CreateNote -> {
      let synced_model = commit_dirty_active_note(model)
      let new_id = "note_" <> int.to_string(synced_model.next_id)
      let initial_tags = case synced_model.folder {
        model.FolderTag(tag) -> [string.lowercase(string.trim(tag))]
        _ -> []
      }
      let initial_starred = case synced_model.folder {
        model.FolderStarred -> True
        _ -> False
      }
      let new_note =
        NoteDoc(
          id: new_id,
          title: "Untitled Note",
          content: "",
          tags: initial_tags,
          starred: initial_starred,
          archived: False,
          encrypted: synced_model.sync_encrypted,
          updated_at: next_timestamp(synced_model),
        )
      let next_folder = case synced_model.folder {
        model.FolderArchive -> model.FolderAll
        other -> other
      }
      #(
        Model(
          ..synced_model,
          notes: [new_note, ..synced_model.notes],
          active_note_id: Some(new_id),
          folder: next_folder,
          draft_title: new_note.title,
          draft_content: new_note.content,
          draft_tag: "",
          dirty: False,
          next_id: synced_model.next_id + 1,
        ),
        [],
      )
    }

    SelectNote(target_id) -> {
      let synced_model = commit_dirty_active_note(model)
      case list.find(synced_model.notes, fn(n) { n.id == target_id }) {
        Ok(found) -> #(
          Model(
            ..synced_model,
            active_note_id: Some(found.id),
            draft_title: found.title,
            draft_content: found.content,
            draft_tag: "",
            dirty: False,
          ),
          [],
        )
        Error(Nil) -> #(synced_model, [])
      }
    }

    DeleteNote(target_id) -> {
      let remaining = list.filter(model.notes, fn(n) { n.id != target_id })
      case model.active_note_id == Some(target_id) {
        False -> #(Model(..model, notes: remaining), [])
        True -> {
          let next_active = case remaining {
            [first, ..] -> Some(first)
            [] -> None
          }
          case next_active {
            Some(first) -> #(
              Model(
                ..model,
                notes: remaining,
                active_note_id: Some(first.id),
                draft_title: first.title,
                draft_content: first.content,
                draft_tag: "",
                dirty: False,
              ),
              [],
            )
            None -> #(
              Model(
                ..model,
                notes: [],
                active_note_id: None,
                draft_title: "",
                draft_content: "",
                draft_tag: "",
                dirty: False,
              ),
              [],
            )
          }
        }
      }
    }

    ToggleStar(target_id) -> {
      let ts = next_timestamp(model)
      let updated_notes =
        list.map(model.notes, fn(n) {
          case n.id == target_id {
            True -> NoteDoc(..n, starred: !n.starred, updated_at: ts)
            False -> n
          }
        })
      #(Model(..model, notes: updated_notes), [])
    }

    ToggleArchive(target_id) -> {
      let ts = next_timestamp(model)
      let updated_notes =
        list.map(model.notes, fn(n) {
          case n.id == target_id {
            True -> NoteDoc(..n, archived: !n.archived, updated_at: ts)
            False -> n
          }
        })
      #(Model(..model, notes: updated_notes), [])
    }

    SetDraftTitle(title) -> #(
      Model(..model, draft_title: title, dirty: True),
      [],
    )

    SetDraftContent(content) -> #(
      Model(..model, draft_content: content, dirty: True),
      [],
    )

    AddTag(raw_tag) -> {
      let clean_tag =
        raw_tag
        |> string.trim
        |> string.lowercase
        |> strip_leading_hash
      case clean_tag == "" {
        True -> #(model, [])
        False ->
          case model.active_note_id {
            None -> #(Model(..model, draft_tag: clean_tag), [])
            Some(active_id) -> {
              let ts = next_timestamp(model)
              let updated_notes =
                list.map(model.notes, fn(n) {
                  case n.id == active_id {
                    False -> n
                    True ->
                      case list.contains(n.tags, clean_tag) {
                        True -> n
                        False ->
                          NoteDoc(
                            ..n,
                            tags: list.append(n.tags, [clean_tag]),
                            updated_at: ts,
                          )
                      }
                  }
                })
              #(Model(..model, notes: updated_notes, draft_tag: ""), [])
            }
          }
      }
    }

    RemoveTag(raw_tag) -> {
      let clean_tag =
        raw_tag
        |> string.trim
        |> string.lowercase
        |> strip_leading_hash
      case model.active_note_id {
        None -> #(model, [])
        Some(active_id) -> {
          let ts = next_timestamp(model)
          let updated_notes =
            list.map(model.notes, fn(n) {
              case n.id == active_id {
                False -> n
                True ->
                  NoteDoc(
                    ..n,
                    tags: list.filter(n.tags, fn(t) {
                      string.lowercase(string.trim(t)) != clean_tag
                    }),
                    updated_at: ts,
                  )
              }
            })
          #(Model(..model, notes: updated_notes), [])
        }
      }
    }

    SetSearchQuery(query) -> #(Model(..model, search_query: query), [])

    SelectFolder(folder) -> #(Model(..model, folder: folder), [])

    SaveActiveNote -> #(save_active_note(model), [])

    ToggleEncryptedSync -> {
      let next_enc = !model.sync_encrypted
      let updated_notes =
        list.map(model.notes, fn(n) { NoteDoc(..n, encrypted: next_enc) })
      #(Model(..model, sync_encrypted: next_enc, notes: updated_notes), [])
    }
  }
}

fn commit_dirty_active_note(model: Model) -> Model {
  case model.dirty {
    True -> save_active_note(model)
    False -> model
  }
}

fn save_active_note(model: Model) -> Model {
  case model.active_note_id {
    None -> Model(..model, dirty: False)
    Some(active_id) -> {
      let clean_title = case string.trim(model.draft_title) {
        "" -> "Untitled Note"
        t -> t
      }
      let safe_content = sanitize.strip_unsafe_html(model.draft_content)
      let ts = next_timestamp(model)
      let updated_notes =
        list.map(model.notes, fn(n) {
          case n.id == active_id {
            False -> n
            True ->
              NoteDoc(
                ..n,
                title: clean_title,
                content: safe_content,
                encrypted: model.sync_encrypted,
                updated_at: ts,
              )
          }
        })
      Model(
        ..model,
        notes: updated_notes,
        draft_title: clean_title,
        draft_content: safe_content,
        dirty: False,
      )
    }
  }
}

fn next_timestamp(model: Model) -> Int {
  let max_ts =
    list.fold(model.notes, 1_700_000_000, fn(acc, n) {
      int.max(acc, n.updated_at)
    })
  max_ts + 1
}

fn strip_leading_hash(s: String) -> String {
  case string.starts_with(s, "#") {
    True -> string.trim(string.drop_start(s, 1))
    False -> s
  }
}

/// Map a Channel 1 Schema `Action` to a `plugin_notes` `Msg`.
pub fn action_to_msg(act: Action) -> Option(Msg) {
  case act.name {
    "create_note" | "create-note" | "new_note" -> Some(CreateNote)

    "select_note" | "select-note" ->
      case extract_id(act) {
        Some(id) -> Some(SelectNote(id))
        None -> None
      }

    "delete_note" | "delete-note" ->
      case extract_id(act) {
        Some(id) -> Some(DeleteNote(id))
        None -> None
      }

    "toggle_star" | "toggle-star" | "star_note" ->
      case extract_id(act) {
        Some(id) -> Some(ToggleStar(id))
        None -> None
      }

    "toggle_archive" | "toggle-archive" | "archive_note" ->
      case extract_id(act) {
        Some(id) -> Some(ToggleArchive(id))
        None -> None
      }

    "set_draft_title" | "set-draft-title" | "draft_title" ->
      case extract_value(act, "title") {
        Some(v) -> Some(SetDraftTitle(v))
        None -> None
      }

    "set_draft_content" | "set-draft-content" | "draft_content" ->
      case extract_value(act, "content") {
        Some(v) -> Some(SetDraftContent(v))
        None -> None
      }

    "add_tag" | "add-tag" ->
      case extract_value(act, "tag") {
        Some(tag) -> Some(AddTag(tag))
        None -> None
      }

    "remove_tag" | "remove-tag" ->
      case extract_value(act, "tag") {
        Some(tag) -> Some(RemoveTag(tag))
        None -> None
      }

    "set_search_query" | "set-search-query" | "search" ->
      case extract_value(act, "query") {
        Some(q) -> Some(SetSearchQuery(q))
        None -> Some(SetSearchQuery(""))
      }

    "select_folder" | "select-folder" | "switch_folder" ->
      case extract_folder(act) {
        Some(folder_str) -> Some(SelectFolder(model.folder_from_id(folder_str)))
        None -> None
      }

    "save_active_note" | "save-active-note" | "save_note" | "save-note" ->
      Some(SaveActiveNote)

    "toggle_encrypted_sync" | "toggle-encrypted-sync" | "toggle_encryption" ->
      Some(ToggleEncryptedSync)

    "input" | "change" ->
      case schema.payload_string(act, "name") {
        Some("title") | Some("draft_title") ->
          case extract_value(act, "title") {
            Some(v) -> Some(SetDraftTitle(v))
            None -> None
          }
        Some("content") | Some("draft_content") ->
          case extract_value(act, "content") {
            Some(v) -> Some(SetDraftContent(v))
            None -> None
          }
        Some("search") | Some("search_query") ->
          case extract_value(act, "query") {
            Some(q) -> Some(SetSearchQuery(q))
            None -> None
          }
        Some("tag") | Some("draft_tag") ->
          case extract_value(act, "tag") {
            Some(t) -> Some(AddTag(t))
            None -> None
          }
        _ -> None
      }

    _ -> None
  }
}

fn extract_id(act: Action) -> Option(String) {
  case schema.payload_string(act, "id") {
    Some(id) if id != "" -> Some(id)
    _ ->
      case schema.payload_string(act, "note_id") {
        Some(id) if id != "" -> Some(id)
        _ -> schema.payload_string(act, "value")
      }
  }
}

fn extract_value(act: Action, fallback_key: String) -> Option(String) {
  case schema.payload_string(act, "value") {
    Some(v) -> Some(v)
    None -> schema.payload_string(act, fallback_key)
  }
}

fn extract_folder(act: Action) -> Option(String) {
  case schema.payload_string(act, "folder") {
    Some(f) if f != "" -> Some(f)
    _ ->
      case schema.payload_string(act, "tab") {
        Some(t) if t != "" -> Some(t)
        _ -> schema.payload_string(act, "value")
      }
  }
}
