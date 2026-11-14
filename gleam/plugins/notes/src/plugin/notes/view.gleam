//// Declarative Schema UI rendering for the Notes plugin (`plugin_notes`).
////
//// Private encrypted notebook: folder tabs, search, note list, and an editor
//// card. Note previews are stripped of unsafe HTML before rendering.

import gleam/dict
import gleam/dynamic
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/protocol/schema/action
import omni/protocol/schema/builder as schema
import omni/protocol/schema/node.{
  type Node, Button, ButtonGhost, Caption, Input, InputSearch, InputText,
  JustifyBetween, JustifyEnd, TabItem, Textarea, Toggle, ToneMuted, empty_base,
}
import omni/protocol/schema/style.{SizeMd, SizeSm, StyleRaw}
import omni/ui/sanitize
import plugin/notes/model.{type Model, type NoteDoc, folder_to_id}

/// Render the full Notes application view.
pub fn view(model: Model) -> Node {
  case model.show_settings {
    True -> render_settings(model)
    False -> render_notebook(model)
  }
}

fn render_notebook(model: Model) -> Node {
  let sidebar =
    schema.box()
    |> schema.column
    |> schema.gap("sm")
    |> schema.with_style(StyleRaw("flex: 0 0 320px; max-width: 320px;"))
    |> schema.children([render_folder_tabs(model), render_note_list(model)])

  let editor_pane =
    schema.box()
    |> schema.column
    |> schema.with_style(StyleRaw("flex: 1; min-width: 0;"))
    |> schema.children([render_editor(model)])

  let split_pane =
    schema.box()
    |> schema.row
    |> schema.gap("md")
    |> schema.children([sidebar, editor_pane])

  schema.box()
  |> schema.column
  |> schema.gap("md")
  |> schema.with_style(StyleRaw(
    "padding: 16px; max-width: 1100px; margin: 0 auto;",
  ))
  |> schema.children([
    render_header(model),
    render_toolbar(model),
    split_pane,
  ])
}

/// Render the compact widget view (recent notes, read-first).
pub fn view_widget(model: Model) -> Node {
  let notes = model.visible_notes(model)

  let rows =
    list.map(notes, fn(note) {
      schema.box()
      |> schema.row
      |> schema.justify(JustifyBetween)
      |> schema.with_id("notes-widget-note-" <> note.id)
      |> schema.action(select_action(note.id))
      |> schema.children([
        schema.text(note.title),
        schema.text(note_snippet(note)),
      ])
    })

  schema.box()
  |> schema.column
  |> schema.gap("sm")
  |> schema.children(case rows {
    [] -> [schema.text("No notes yet")]
    _ -> rows
  })
}

fn render_header(model: Model) -> Node {
  let dirty_badge = case model.dirty {
    True -> [schema.badge("Unsaved")]
    False -> []
  }

  schema.box()
  |> schema.row
  |> schema.justify(JustifyBetween)
  |> schema.children([
    schema.box()
      |> schema.row
      |> schema.gap("sm")
      |> schema.children([
        schema.text("Notes"),
        schema.badge(int.to_string(list.length(model.notes)) <> " notes"),
        ..dirty_badge
      ]),
    schema.box()
      |> schema.row
      |> schema.gap("xs")
      |> schema.children([
        Button(
          base: empty_base(),
          label: "Settings",
          action: action.new("show-settings"),
          variant: Some(ButtonGhost),
          size: Some(SizeSm),
          icon: Some("sliders"),
          icon_position: None,
          disabled: None,
          loading: None,
        ),
        Button(
          base: empty_base(),
          label: "New Note",
          action: action.new("create_note"),
          variant: None,
          size: Some(SizeMd),
          icon: Some("plus"),
          icon_position: None,
          disabled: None,
          loading: None,
        ),
      ]),
  ])
}

fn render_settings(model: Model) -> Node {
  let encrypted_label = case model.sync_encrypted {
    True -> "Encrypted sync (NIP-44)"
    False -> "Plaintext sync"
  }

  let toggle =
    Toggle(
      base: empty_base(),
      name: "sync_encrypted",
      label: Some(encrypted_label),
      checked: model.sync_encrypted,
      action: action.new("toggle-encrypted-sync"),
      disabled: None,
    )

  schema.card()
  |> schema.with_id("notes-settings")
  |> schema.title("Notes Settings")
  |> schema.subtitle("How notebook documents are synchronized")
  |> schema.with_icon("sliders")
  |> schema.page("settings")
  |> schema.children([
    toggle,
    schema.text(
      "Encrypted sync protects note contents with your key. Turning it off publishes plaintext documents that any relay reader can decode.",
    )
      |> schema.text_variant(Caption)
      |> schema.text_tone(ToneMuted),
    schema.box()
      |> schema.row
      |> schema.justify(JustifyEnd)
      |> schema.children([
        Button(
          base: empty_base(),
          label: "Back to Notes",
          action: action.new("hide-settings"),
          variant: Some(ButtonGhost),
          size: Some(SizeSm),
          icon: Some("arrow-left"),
          icon_position: None,
          disabled: None,
          loading: None,
        ),
      ]),
  ])
}

fn render_toolbar(model: Model) -> Node {
  let search =
    Input(
      base: empty_base(),
      name: "search",
      placeholder: Some("Search notes and tags..."),
      value: Some(model.search_query),
      input_type: Some(InputSearch),
      accept: None,
      clearable: Some(True),
      prefix_icon: Some("search"),
      action_on_enter: None,
      action_on_change: Some(input_action("search")),
    )

  let sync_toggle =
    Toggle(
      base: empty_base(),
      name: "encrypted_sync",
      label: Some("Encrypted sync"),
      checked: model.sync_encrypted,
      action: action.new("toggle_encrypted_sync"),
      disabled: None,
    )

  schema.box()
  |> schema.row
  |> schema.gap("sm")
  |> schema.children([search, sync_toggle])
}

fn render_folder_tabs(model: Model) -> Node {
  let tag_items =
    model.all_tags(model)
    |> list.map(fn(tag) {
      TabItem(id: "tag:" <> tag, label: "#" <> tag, icon: None, badge: None)
    })

  let items = [
    TabItem(id: "all", label: "All", icon: Some("notes"), badge: None),
    TabItem(id: "starred", label: "Starred", icon: Some("star"), badge: None),
    TabItem(
      id: "archive",
      label: "Archive",
      icon: Some("download"),
      badge: None,
    ),
    ..tag_items
  ]

  schema.tabs(items, folder_to_id(model.folder), action.new("select_folder"))
}

fn render_note_list(model: Model) -> Node {
  let notes = model.visible_notes(model)

  case notes {
    [] ->
      schema.empty_state("No notes in this folder")
      |> schema.with_style(StyleRaw("padding: 18px 0;"))
    _ ->
      schema.box()
      |> schema.column
      |> schema.gap("sm")
      |> schema.with_id("notes-list")
      |> schema.children(list.map(notes, render_note_card))
  }
}

fn render_note_card(note: NoteDoc) -> Node {
  let tags = list.map(note.tags, fn(tag) { schema.badge("#" <> tag) })

  let badge_row =
    schema.box()
    |> schema.row
    |> schema.gap("xs")
    |> schema.children(tags)

  schema.card()
  |> schema.with_id("notes-note-" <> note.id)
  |> schema.title(note.title)
  |> schema.subtitle(note_snippet(note))
  |> schema.children([badge_row])
  |> schema.footer([
    Button(
      base: empty_base(),
      label: "Open",
      action: select_action(note.id),
      variant: None,
      size: Some(SizeSm),
      icon: Some("external"),
      icon_position: None,
      disabled: None,
      loading: None,
    ),
    icon_button("star", "toggle_star", note.id),
    icon_button("download", "toggle_archive", note.id),
    icon_button("trash", "delete_note", note.id),
  ])
  |> schema.action(select_action(note.id))
}

fn render_editor(model: Model) -> Node {
  let title_input =
    Input(
      base: empty_base(),
      name: "title",
      placeholder: Some("Note title"),
      value: Some(model.draft_title),
      input_type: Some(InputText),
      accept: None,
      clearable: None,
      prefix_icon: None,
      action_on_enter: None,
      action_on_change: Some(input_action("title")),
    )

  let content_area =
    Textarea(
      base: empty_base(),
      name: "content",
      placeholder: Some("Write in Markdown or HTML..."),
      value: Some(model.draft_content),
      rows: Some(12),
      action_on_change: Some(action.new("set-draft-content")),
    )

  let tag_row =
    schema.box()
    |> schema.row
    |> schema.gap("xs")
    |> schema.children([
      Input(
        base: empty_base(),
        name: "tag",
        placeholder: Some("Add a tag"),
        value: Some(model.draft_tag),
        input_type: Some(InputText),
        accept: None,
        clearable: None,
        prefix_icon: None,
        action_on_enter: Some(input_action("tag")),
        action_on_change: None,
      ),
      action_button("Add Tag", "add_tag", None),
    ])

  let draft_tags =
    model.active_note(model)
    |> fn(active) {
      case active {
        Some(note) ->
          list.map(note.tags, fn(tag) {
            action_button("#" <> tag, "remove_tag", Some(#("tag", tag)))
          })
        None -> []
      }
    }

  let footer =
    schema.box()
    |> schema.row
    |> schema.justify(JustifyBetween)
    |> schema.children([
      schema.text(int.to_string(word_count(model.draft_content)) <> " words"),
      action_button("Save Note", "save_active_note", None),
    ])

  schema.card()
  |> schema.with_id("notes-editor")
  |> schema.title("Editor")
  |> schema.children([
    title_input,
    content_area,
    tag_row,
    schema.box()
      |> schema.row
      |> schema.gap("xs")
      |> schema.children(draft_tags),
    footer,
  ])
}

fn note_snippet(note: NoteDoc) -> String {
  note.content
  |> sanitize.strip_unsafe_html
  |> truncate(140)
}

fn truncate(value: String, max_len: Int) -> String {
  let cleaned =
    value
    |> replace_all("<", " ")
    |> replace_all(">", " ")
  case string_length(cleaned) <= max_len {
    True -> cleaned
    False -> slice(cleaned, 0, max_len) <> "..."
  }
}

fn replace_all(value: String, needle: String, replacement: String) -> String {
  value |> string.replace(needle, replacement)
}

fn string_length(value: String) -> Int {
  value |> string.to_graphemes |> list.length
}

fn slice(value: String, from: Int, count: Int) -> String {
  value
  |> string.to_graphemes
  |> list.drop(from)
  |> list.take(count)
  |> string.concat
}

fn word_count(raw: String) -> Int {
  raw
  |> sanitize.strip_unsafe_html
  |> string.split(on: " ")
  |> list.filter(fn(word) { string.trim(word) != "" })
  |> list.length
}

fn select_action(note_id: String) -> action.Action {
  action.new("select_note")
  |> action.with_payload(dynamic_from([#("id", dynamic.string(note_id))]))
}

fn input_action(field_name: String) -> action.Action {
  action.new("input")
  |> action.with_payload(dynamic_from([#("name", dynamic.string(field_name))]))
}

fn action_button(
  label: String,
  action_name: String,
  payload: Option(#(String, String)),
) -> Node {
  let act = case payload {
    Some(pair) ->
      action.new(action_name)
      |> action.with_payload(dynamic_from([#(pair.0, dynamic.string(pair.1))]))
    None -> action.new(action_name)
  }

  Button(
    base: empty_base(),
    label: label,
    action: act,
    variant: None,
    size: Some(SizeSm),
    icon: None,
    icon_position: None,
    disabled: None,
    loading: None,
  )
}

fn icon_button(
  icon_name: String,
  action_name: String,
  note_id: String,
) -> Node {
  Button(
    base: empty_base(),
    label: "",
    action: select_action_for(action_name, note_id),
    variant: None,
    size: Some(SizeSm),
    icon: Some(icon_name),
    icon_position: None,
    disabled: None,
    loading: None,
  )
}

fn select_action_for(action_name: String, note_id: String) -> action.Action {
  action.new(action_name)
  |> action.with_payload(dynamic_from([#("id", dynamic.string(note_id))]))
}

fn dynamic_from(
  fields: List(#(String, dynamic.Dynamic)),
) -> dict.Dict(String, dynamic.Dynamic) {
  dict.from_list(fields)
}
