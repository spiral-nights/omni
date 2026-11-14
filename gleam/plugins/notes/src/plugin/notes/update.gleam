//// Pure Elm-style state transitions and action decoder for `plugin_notes`.

import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{UnsignedEvent}
import omni/nostr/kind
import omni/platform/clock
import omni/plugin_kit/app.{type Effect, Async, Publish, PublishEncrypted}
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import omni/ui/sanitize
import plugin/notes/model.{
  type Model, type NoteDoc, Model, NoteDoc, StatusOffline, StatusSaved,
  StatusSaving, active_note, encode_note_doc, note_doc_decoder, notes_d_tag,
}
import plugin/notes/msg.{
  type Msg, AddDraftTag, AddTag, AutoSaveTick, CreateNote, DeleteNote,
  IngestRemoteDoc, InsertMarkdown, RemoveTag, SaveActiveNote, SelectFolder,
  SelectNote, SetDraftContent, SetDraftTag, SetDraftTitle, SetOnline, SetPubkey,
  SetSearchQuery, ShowSettings, ToggleArchive, ToggleEncryptedSync,
  TogglePreview, ToggleStar,
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
      let next_model =
        Model(
          ..synced_model,
          notes: [new_note, ..synced_model.notes],
          active_note_id: Some(new_id),
          folder: next_folder,
          draft_title: new_note.title,
          draft_content: new_note.content,
          draft_tag: "",
          dirty: False,
          preview_mode: False,
          save_status: saved_status(synced_model.online),
          next_id: synced_model.next_id + 1,
        )
      #(next_model, publish_note(next_model, new_note))
    }

    SelectNote(target_id) -> {
      let #(synced_model, commit_effects) = commit_dirty_and_publish(model)
      case list.find(synced_model.notes, fn(n) { n.id == target_id }) {
        Ok(found) -> #(
          Model(
            ..synced_model,
            active_note_id: Some(found.id),
            draft_title: found.title,
            draft_content: found.content,
            draft_tag: "",
            dirty: False,
            save_status: saved_status(synced_model.online),
          ),
          commit_effects,
        )
        Error(Nil) -> #(synced_model, commit_effects)
      }
    }

    DeleteNote(target_id) -> {
      let tombstone = tombstone_effects(model, target_id)
      let remaining = list.filter(model.notes, fn(n) { n.id != target_id })
      case model.active_note_id == Some(target_id) {
        False -> #(Model(..model, notes: remaining), tombstone)
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
              tombstone,
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
              tombstone,
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
      publish_updated_note(model, updated_notes, target_id)
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
      publish_updated_note(model, updated_notes, target_id)
    }

    SetDraftTitle(title) -> {
      let next_rev = model.save_revision + 1
      let next_model =
        Model(
          ..model,
          draft_title: title,
          dirty: True,
          save_revision: next_rev,
          save_status: saving_status(model.online),
        )
      #(next_model, [debounced_autosave_effect(next_rev)])
    }

    SetDraftContent(content) -> {
      let next_rev = model.save_revision + 1
      let next_model =
        Model(
          ..model,
          draft_content: content,
          dirty: True,
          save_revision: next_rev,
          save_status: saving_status(model.online),
        )
      #(next_model, [debounced_autosave_effect(next_rev)])
    }

    SetDraftTag(tag) -> #(Model(..model, draft_tag: tag), [])

    AddTag(raw_tag) -> apply_add_tag(model, raw_tag)

    AddDraftTag -> apply_add_tag(model, model.draft_tag)

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
          publish_updated_note(model, updated_notes, active_id)
        }
      }
    }

    SetSearchQuery(query) -> #(Model(..model, search_query: query), [])

    ShowSettings(visible) -> #(Model(..model, show_settings: visible), [])

    SelectFolder(folder) -> #(Model(..model, folder: folder), [])

    SetPubkey(pubkey) -> {
      let cleaned = string.trim(pubkey)
      case cleaned {
        "" -> #(model, [])
        _ -> #(Model(..model, my_pubkey: Some(cleaned)), [])
      }
    }

    SaveActiveNote -> save_and_publish_active(model)

    AutoSaveTick(rev) ->
      case rev == model.save_revision && model.dirty {
        True -> save_and_publish_active(model)
        False -> #(model, [])
      }

    SetOnline(is_online) ->
      case is_online {
        False -> #(
          Model(..model, online: False, save_status: StatusOffline),
          [],
        )
        True -> {
          let online_model = Model(..model, online: True)
          case online_model.dirty {
            True -> save_and_publish_active(online_model)
            False -> #(Model(..online_model, save_status: StatusSaved), [])
          }
        }
      }

    TogglePreview -> #(Model(..model, preview_mode: !model.preview_mode), [])

    InsertMarkdown(snippet) -> {
      let next_content = case model.draft_content {
        "" -> snippet
        existing -> existing <> snippet
      }
      let next_rev = model.save_revision + 1
      let next_model =
        Model(
          ..model,
          draft_content: next_content,
          dirty: True,
          preview_mode: False,
          save_revision: next_rev,
          save_status: saving_status(model.online),
        )
      #(next_model, [debounced_autosave_effect(next_rev)])
    }

    IngestRemoteDoc(raw) ->
      case json.parse(from: raw, using: note_doc_decoder()) {
        Ok(note) -> #(upsert_remote_note(model, note), [])
        Error(_) -> #(model, [])
      }

    ToggleEncryptedSync -> {
      let next_enc = !model.sync_encrypted
      let ts = next_timestamp(model)
      let updated_notes =
        list.map(model.notes, fn(n) {
          NoteDoc(..n, encrypted: next_enc, updated_at: ts)
        })
      let next_model =
        Model(..model, sync_encrypted: next_enc, notes: updated_notes)
      let effects =
        list.flat_map(updated_notes, fn(n) { publish_note(next_model, n) })
      #(next_model, effects)
    }
  }
}

/// Publish a single note document (encrypted when the notebook syncs encrypted).
fn publish_note(model: Model, note: NoteDoc) -> List(Effect(Msg)) {
  let draft =
    UnsignedEvent(
      pubkey: None,
      created_at: note.updated_at + 1,
      kind: kind.AppData,
      tags: [["d", notes_d_tag <> "/" <> note.id]],
      content: encode_note_doc(note) |> json.to_string,
    )
  case model.sync_encrypted {
    True -> [PublishEncrypted(draft)]
    False -> [Publish(draft)]
  }
}

fn publish_updated_note(
  model: Model,
  updated_notes: List(NoteDoc),
  target_id: String,
) -> #(Model, List(Effect(Msg))) {
  let next_model = Model(..model, notes: updated_notes)
  let effects = case list.find(updated_notes, fn(n) { n.id == target_id }) {
    Ok(note) -> publish_note(next_model, note)
    Error(Nil) -> []
  }
  #(next_model, effects)
}

fn commit_dirty_and_publish(model: Model) -> #(Model, List(Effect(Msg))) {
  let saved = commit_dirty_active_note(model)
  let effects = case model.dirty, active_note(saved) {
    True, Some(note) -> publish_note(saved, note)
    _, _ -> []
  }
  #(saved, effects)
}

/// NIP-09 deletion tombstone for an addressable note document.
fn tombstone_effects(model: Model, note_id: String) -> List(Effect(Msg)) {
  case model.my_pubkey {
    None -> []
    Some(pubkey) -> [
      Publish(UnsignedEvent(
        pubkey: None,
        created_at: next_timestamp(model),
        kind: kind.Other(5),
        tags: [
          ["a", "30078:" <> pubkey <> ":" <> notes_d_tag <> "/" <> note_id],
          ["k", "30078"],
        ],
        content: "",
      )),
    ]
  }
}

fn apply_add_tag(model: Model, raw_tag: String) -> #(Model, List(Effect(Msg))) {
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
          let next_model = Model(..model, notes: updated_notes, draft_tag: "")
          publish_updated_note(next_model, updated_notes, active_id)
        }
      }
  }
}

fn save_and_publish_active(model: Model) -> #(Model, List(Effect(Msg))) {
  let saved = save_active_note(model)
  let next_model =
    Model(
      ..saved,
      save_revision: model.save_revision + 1,
      save_status: saved_status(model.online),
    )
  case next_model.online, active_note(next_model) {
    True, Some(note) -> #(next_model, publish_note(next_model, note))
    _, _ -> #(next_model, [])
  }
}

fn saving_status(online: Bool) -> model.SaveStatus {
  case online {
    True -> StatusSaving
    False -> StatusOffline
  }
}

fn saved_status(online: Bool) -> model.SaveStatus {
  case online {
    True -> StatusSaved
    False -> StatusOffline
  }
}

fn debounced_autosave_effect(revision: Int) -> Effect(Msg) {
  Async(fn(dispatch) {
    let _ =
      promise.wait(800)
      |> promise.map(fn(_) {
        dispatch(AutoSaveTick(revision))
        Nil
      })
    Nil
  })
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
  next_timestamp_with_clock(model, clock.system())
}

/// Compute the next monotonically non-decreasing Unix timestamp (seconds)
/// floored by `clk.now_ms() / 1000`.
pub fn next_timestamp_with_clock(model: Model, clk: clock.Clock) -> Int {
  let now = clk.now_ms() / 1000
  let max_ts =
    list.fold(model.notes, 0, fn(acc, n) { int.max(acc, n.updated_at) })
  int.max(now, max_ts + 1)
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

    "set_draft_tag" | "set-draft-tag" | "draft_tag" ->
      case extract_value(act, "tag") {
        Some(v) -> Some(SetDraftTag(v))
        None -> None
      }

    "add_tag" | "add-tag" ->
      case extract_value(act, "tag") {
        Some(tag) -> Some(AddTag(tag))
        None -> Some(AddDraftTag)
      }

    "toggle_preview" | "toggle-preview" -> Some(TogglePreview)

    "insert_markdown" | "insert-markdown" ->
      case extract_value(act, "snippet") {
        Some(s) -> Some(InsertMarkdown(s))
        None -> None
      }

    "set_online" | "set-online" ->
      case schema.payload_string(act, "online") {
        Some("false") | Some("0") -> Some(SetOnline(False))
        Some("true") | Some("1") -> Some(SetOnline(True))
        _ -> None
      }

    "remove_tag" | "remove-tag" ->
      case extract_value(act, "tag") {
        Some(tag) -> Some(RemoveTag(tag))
        None -> None
      }

    "show-settings" | "show_settings" | "open-settings" ->
      Some(ShowSettings(True))

    "hide-settings" | "hide_settings" | "close-settings" ->
      Some(ShowSettings(False))

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
            Some(t) -> Some(SetDraftTag(t))
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

fn upsert_remote_note(model: Model, remote: NoteDoc) -> Model {
  let existing = list.find(model.notes, fn(n) { n.id == remote.id })
  let notes = case existing {
    Ok(local) ->
      case remote.updated_at >= local.updated_at {
        True ->
          list.map(model.notes, fn(n) {
            case n.id == remote.id {
              True -> remote
              False -> n
            }
          })
        False -> model.notes
      }
    Error(Nil) -> [remote, ..model.notes]
  }
  let active = case model.active_note_id {
    Some(_) -> model.active_note_id
    None -> Some(remote.id)
  }
  Model(
    ..model,
    notes: notes,
    active_note_id: active,
    draft_title: case model.active_note_id {
      None -> remote.title
      Some(_) -> model.draft_title
    },
    draft_content: case model.active_note_id {
      None -> remote.content
      Some(_) -> model.draft_content
    },
  )
}
