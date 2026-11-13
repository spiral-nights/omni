//// Declarative Schema UI views (`Model -> Node`) for the Omni Profiles plugin.
////
//// Shares `omni/social_ui/note_card` with the Feed plugin. Opening a note emits
//// the standard `view_note` intent for the host broker to route elsewhere.

import gleam/dict
import gleam/dynamic
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{
  type Node, Avatar, BadgeAccent, Body, Button, ButtonGhost, ButtonPrimary,
  ButtonSecondary, Caption, CodeBlock, IconButton, IconButtonGhost,
  IconButtonSecondary, Input, InputSearch, InputText, InputUrl, JustifyBetween,
  JustifyEnd, ListItem, StatusConnecting, StatusIndicator, StatusOffline,
  StatusOnline, Textarea, ToneMuted, TonePrimary,
}
import omni/protocol/schema/style.{SizeLg, SizeMd, SizeSm, StyleRaw}
import omni/social/note.{type Note}
import omni/social/profile
import omni/social/stats
import omni/social_ui/note_card.{type NoteCardConfig, NoteCardConfig}
import omni/ui/avatar as generated_avatar
import plugin/profiles/model.{
  type Model, SignerLocked, SignerMissing, SignerReady, ViewDirectory,
  ViewFollowing, ViewKeys, ViewMetadata, ViewProfile,
}

/// Render the top-level declarative Schema `Node` for `model`.
pub fn view(model: Model) -> Node {
  case model.view {
    ViewDirectory -> render_directory(model)
    ViewFollowing -> render_following(model)
    ViewProfile(pubkey) -> render_profile(model, pubkey)
    ViewMetadata -> render_metadata_editor(model)
    ViewKeys -> render_key_custody(model)
  }
}

// -----------------------------------------------------------------------------
// 1. People Directory
// -----------------------------------------------------------------------------

fn render_directory(model: Model) -> Node {
  let search_input =
    Input(
      base: node.empty_base(),
      name: "search",
      placeholder: Some("Search people by name, npub, or NIP-05..."),
      value: Some(model.search_query),
      input_type: Some(InputSearch),
      accept: None,
      clearable: Some(True),
      prefix_icon: Some("search"),
      action_on_enter: Some(action.new("search")),
      action_on_change: Some(action.new("search")),
    )

  let people = model.filtered_profiles(model)

  let body = case people {
    [] -> [
      note_card.render_empty_timeline(
        "No matching people",
        "Try another name, npub, or NIP-05 identifier.",
      ),
    ]
    matched -> [
      schema.list_view(
        list.map(matched, fn(person) { render_directory_item(model, person) }),
      ),
    ]
  }

  let count_badge =
    schema.badge(int.to_string(list.length(people)) <> " people")

  let header =
    schema.box()
    |> schema.row
    |> schema.justify(JustifyBetween)
    |> schema.children([count_badge])

  schema.card()
  |> schema.with_id("profiles-directory")
  |> schema.title("People")
  |> schema.subtitle("Browse profiles and follow creators on Nostr")
  |> schema.with_icon("users")
  |> schema.page("directory")
  |> schema.with_style(StyleRaw(
    "max-width: 720px; margin: 0 auto; width: 100%;",
  ))
  |> schema.children(
    list.flatten([[render_view_tabs("directory"), search_input, header], body]),
  )
}

fn render_view_tabs(active: String) -> Node {
  let people_action = action.new("view-directory")
  let following_action = action.new("view-following")
  schema.box()
  |> schema.row()
  |> schema.gap("xs")
  |> schema.children([
    schema.button("People", people_action)
      |> schema.with_icon("users"),
    schema.button("Following", following_action)
      |> schema.with_icon("user-check"),
  ])
  |> schema.with_id("profiles-tabs-" <> active)
}

fn render_following(model: Model) -> Node {
  let people = model.following_profiles(model)
  let body = case people {
    [] -> [
      note_card.render_empty_timeline(
        "Not following anyone yet",
        "Follow people from the directory and they will appear here.",
      ),
    ]
    matched -> [
      schema.list_view(
        list.map(matched, fn(person) { render_directory_item(model, person) }),
      ),
    ]
  }

  schema.card()
  |> schema.with_id("profiles-following")
  |> schema.title("Following")
  |> schema.subtitle("People you follow with your Kind 3 contact list")
  |> schema.with_icon("user-check")
  |> schema.page("following")
  |> schema.with_style(StyleRaw(
    "max-width: 720px; margin: 0 auto; width: 100%;",
  ))
  |> schema.children(list.flatten([[render_view_tabs("following")], body]))
}

fn render_directory_item(model: Model, person: profile.Profile) -> Node {
  let name = profile.best_display_name(Some(person), person.pubkey)
  let follow = model.following(model, person.pubkey)

  let subtitle = case person.nip05 {
    Some(nip05) -> Some(nip05)
    None -> person.about
  }

  let meta = case follow {
    True -> Some("Following")
    False -> None
  }

  let follow_variant = case follow {
    True -> IconButtonSecondary
    False -> IconButtonGhost
  }

  let follow_icon = case follow {
    True -> "user-check"
    False -> "user-plus"
  }

  let follow_button =
    IconButton(
      base: node.empty_base(),
      icon: follow_icon,
      tooltip: Some(case follow {
        True -> "Unfollow"
        False -> "Follow"
      }),
      action: action_with_pubkey("toggle-follow", person.pubkey),
      variant: Some(follow_variant),
      size: Some(SizeSm),
      disabled: None,
    )

  ListItem(
    base: node.empty_base(),
    title: name,
    subtitle: subtitle,
    meta: meta,
    icon: None,
    avatar_url: person.picture,
    avatar_pubkey: Some(person.pubkey),
    checked: None,
    on_check_action: None,
    on_click_action: Some(action_with_pubkey("select-profile", person.pubkey)),
    actions: [follow_button],
  )
  |> schema.with_id("person-" <> person.pubkey)
}

// -----------------------------------------------------------------------------
// 2. Selected Profile Detail
// -----------------------------------------------------------------------------

fn render_profile(model: Model, pubkey: String) -> Node {
  let person =
    dict.get(model.profiles, pubkey)
    |> option.from_result
    |> option.unwrap(profile.empty(pubkey))
  let name = profile.best_display_name(Some(person), pubkey)
  let follow = model.following(model, pubkey)

  let avatar =
    Avatar(
      base: node.empty_base(),
      src: person.picture,
      pubkey: Some(pubkey),
      name: Some(name),
      size: Some(SizeLg),
      action: None,
    )

  let name_node =
    schema.text(name)
    |> schema.text_variant(Body)
    |> schema.text_tone(TonePrimary)

  let nip05_nodes = case person.nip05 {
    Some(nip05) -> [
      schema.badge(nip05) |> schema.badge_tone(BadgeAccent),
    ]
    None -> []
  }

  let about_node =
    schema.text(option.unwrap(person.about, "No bio published yet."))
    |> schema.text_variant(Body)
    |> schema.text_tone(ToneMuted)

  let lud16_nodes = case person.lud16 {
    Some(address) -> [
      schema.text(address),
    ]
    None -> []
  }

  let website_nodes = case person.website {
    Some(url) -> [
      schema.text(url),
    ]
    None -> []
  }

  let identity_column =
    schema.box()
    |> schema.column
    |> schema.gap("xs")
    |> schema.children(
      list.flatten([
        [name_node],
        nip05_nodes,
        [about_node],
        lud16_nodes,
        website_nodes,
      ]),
    )

  let header =
    schema.box()
    |> schema.row
    |> schema.gap("sm")
    |> schema.children([avatar, identity_column])

  let follow_button =
    Button(
      base: node.empty_base(),
      label: case follow {
        True -> "Unfollow"
        False -> "Follow"
      },
      action: action_with_pubkey("toggle-follow", pubkey),
      variant: Some(case follow {
        True -> ButtonSecondary
        False -> ButtonPrimary
      }),
      size: Some(SizeSm),
      icon: Some(case follow {
        True -> "user-check"
        False -> "user-plus"
      }),
      icon_position: None,
      disabled: None,
      loading: None,
    )

  let actions =
    list.flatten([
      [follow_button],
      case model.is_own_profile(model, pubkey) {
        True -> [
          Button(
            base: node.empty_base(),
            label: "Edit Metadata",
            action: action.new("edit-metadata"),
            variant: Some(ButtonGhost),
            size: Some(SizeSm),
            icon: Some("edit"),
            icon_position: None,
            disabled: None,
            loading: None,
          ),
          Button(
            base: node.empty_base(),
            label: "Key Custody",
            action: action.new("view-keys"),
            variant: Some(ButtonGhost),
            size: Some(SizeSm),
            icon: Some("key"),
            icon_position: None,
            disabled: None,
            loading: None,
          ),
        ]
        False -> []
      },
    ])

  let action_row =
    schema.box()
    |> schema.row
    |> schema.justify(JustifyEnd)
    |> schema.gap("xs")
    |> schema.children(actions)

  let notes = model.notes_by_author(model, pubkey)
  let note_nodes = case notes {
    [] -> [
      note_card_empty("No notes yet", "This author has not published a note."),
    ]
    published ->
      list.map(published, fn(note) { render_author_note(model, note) })
  }

  let notes_header =
    schema.text(int.to_string(list.length(notes)) <> " notes")
    |> schema.text_variant(Caption)
    |> schema.text_tone(ToneMuted)

  let back_button =
    Button(
      base: node.empty_base(),
      label: "Back to Directory",
      action: action.new("view-directory"),
      variant: Some(ButtonGhost),
      size: Some(SizeSm),
      icon: Some("arrow-left"),
      icon_position: None,
      disabled: None,
      loading: None,
    )

  schema.card()
  |> schema.with_id("profile-" <> pubkey)
  |> schema.banner_background(generated_avatar.banner_gradient(pubkey))
  |> schema.title("Profile")
  |> schema.with_icon("user")
  |> schema.page("profile")
  |> schema.with_style(StyleRaw(
    "max-width: 720px; margin: 0 auto; width: 100%;",
  ))
  |> schema.children(
    list.flatten([
      [back_button, header, action_row, schema.divider(), notes_header],
      note_nodes,
    ]),
  )
}

fn render_author_note(model: Model, note: Note) -> Node {
  let author = dict.get(model.profiles, note.pubkey) |> option.from_result
  let empty_stats = stats.empty_stats(note.id)
  note_card.render_note_card(
    note,
    author,
    None,
    empty_stats,
    profile_note_card_config(model),
  )
}

// -----------------------------------------------------------------------------
// 3. Kind 0 Metadata Editor
// -----------------------------------------------------------------------------

fn render_metadata_editor(model: Model) -> Node {
  let draft = model.metadata_draft

  let name_input =
    Input(
      base: node.empty_base(),
      name: "name",
      placeholder: Some("Display name"),
      value: Some(draft.name),
      input_type: Some(InputText),
      accept: None,
      clearable: Some(True),
      prefix_icon: Some("user"),
      action_on_enter: None,
      action_on_change: Some(action.new("set-metadata-name")),
    )

  let about_area =
    Textarea(
      base: node.empty_base(),
      name: "about",
      placeholder: Some("Tell people about yourself"),
      value: Some(draft.about),
      rows: Some(4),
      action_on_change: Some(action.new("set-metadata-about")),
    )

  let picture_input =
    Input(
      base: node.empty_base(),
      name: "picture",
      placeholder: Some("https://example.com/avatar.png"),
      value: Some(draft.picture),
      input_type: Some(InputUrl),
      accept: None,
      clearable: Some(True),
      prefix_icon: Some("image"),
      action_on_enter: None,
      action_on_change: Some(action.new("set-metadata-picture")),
    )

  let nip05_input =
    Input(
      base: node.empty_base(),
      name: "nip05",
      placeholder: Some("you@example.com"),
      value: Some(draft.nip05),
      input_type: Some(InputText),
      accept: None,
      clearable: Some(True),
      prefix_icon: Some("check-circle"),
      action_on_enter: None,
      action_on_change: Some(action.new("set-metadata-nip05")),
    )

  let lud16_input =
    Input(
      base: node.empty_base(),
      name: "lud16",
      placeholder: Some("you@getalby.com"),
      value: Some(draft.lud16),
      input_type: Some(InputText),
      accept: None,
      clearable: Some(True),
      prefix_icon: Some("zap"),
      action_on_enter: None,
      action_on_change: Some(action.new("set-metadata-lud16")),
    )

  let website_input =
    Input(
      base: node.empty_base(),
      name: "website",
      placeholder: Some("https://example.com"),
      value: Some(draft.website),
      input_type: Some(InputUrl),
      accept: None,
      clearable: Some(True),
      prefix_icon: Some("external"),
      action_on_enter: None,
      action_on_change: Some(action.new("set-metadata-website")),
    )

  let save_button =
    Button(
      base: node.empty_base(),
      label: "Save Profile",
      action: action.new("save-metadata"),
      variant: Some(ButtonPrimary),
      size: Some(SizeMd),
      icon: Some("save"),
      icon_position: None,
      disabled: None,
      loading: None,
    )

  let back_button =
    Button(
      base: node.empty_base(),
      label: "Back to Directory",
      action: action.new("view-directory"),
      variant: Some(ButtonGhost),
      size: Some(SizeSm),
      icon: Some("arrow-left"),
      icon_position: None,
      disabled: None,
      loading: None,
    )

  let footer =
    schema.box()
    |> schema.row
    |> schema.justify(JustifyEnd)
    |> schema.gap("xs")
    |> schema.children([save_button])

  let status_badge = case model.metadata_dirty {
    True -> schema.badge("Unsaved changes")
    False -> schema.badge("Saved")
  }

  schema.card()
  |> schema.with_id("profiles-metadata-editor")
  |> schema.title("Edit Metadata")
  |> schema.subtitle("Publish a Kind 0 profile event from your signer")
  |> schema.with_icon("edit")
  |> schema.page("metadata")
  |> schema.with_style(StyleRaw(
    "max-width: 720px; margin: 0 auto; width: 100%;",
  ))
  |> schema.children([
    status_badge,
    name_input,
    about_area,
    picture_input,
    nip05_input,
    lud16_input,
    website_input,
    footer,
    back_button,
  ])
}

// -----------------------------------------------------------------------------
// 4. Key Custody
// -----------------------------------------------------------------------------

fn render_key_custody(model: Model) -> Node {
  let npub = model.own_npub(model)

  let npub_node = case npub {
    "" ->
      schema.text("No public key available from the signer.")
      |> schema.text_variant(Body)
      |> schema.text_tone(ToneMuted)
    value ->
      CodeBlock(
        base: node.empty_base(),
        code: value,
        language: Some("npub"),
        copyable: Some(True),
      )
      |> schema.with_id("profiles-npub")
  }

  let status =
    StatusIndicator(
      base: node.empty_base(),
      status: signer_indicator(model.signer_status),
      label: Some(model.signer_status_label(model.signer_status)),
      pulse: Some(False),
    )

  let explanation =
    schema.text(
      "Your private key never leaves the standard browser signer. This plugin only requests metadata and contact list signatures.",
    )
    |> schema.text_variant(Caption)
    |> schema.text_tone(ToneMuted)

  let refresh_button =
    Button(
      base: node.empty_base(),
      label: "Refresh Signer",
      action: action.new("refresh-signer"),
      variant: Some(ButtonSecondary),
      size: Some(SizeSm),
      icon: Some("refresh"),
      icon_position: None,
      disabled: None,
      loading: None,
    )

  let back_button =
    Button(
      base: node.empty_base(),
      label: "Back to Directory",
      action: action.new("view-directory"),
      variant: Some(ButtonGhost),
      size: Some(SizeSm),
      icon: Some("arrow-left"),
      icon_position: None,
      disabled: None,
      loading: None,
    )

  schema.card()
  |> schema.with_id("profiles-key-custody")
  |> schema.title("Key Custody")
  |> schema.subtitle("NIP-07 signer status and public identity")
  |> schema.with_icon("key")
  |> schema.page("keys")
  |> schema.with_style(StyleRaw(
    "max-width: 720px; margin: 0 auto; width: 100%;",
  ))
  |> schema.children([
    npub_node,
    status,
    explanation,
    schema.box()
      |> schema.row
      |> schema.justify(JustifyBetween)
      |> schema.children([back_button, refresh_button]),
  ])
}

fn signer_indicator(status: model.SignerStatus) -> node.IndicatorStatus {
  case status {
    SignerReady -> StatusOnline
    SignerLocked -> StatusConnecting
    SignerMissing -> StatusOffline
  }
}

// -----------------------------------------------------------------------------
// Shared `omni/social_ui/note_card` wiring
// -----------------------------------------------------------------------------

fn profile_note_card_config(model: Model) -> NoteCardConfig {
  NoteCardConfig(
    interactive: True,
    show_actions: False,
    now_sec: model.now_sec,
    on_open_note: Some(view_note_action),
    on_open_author: Some(fn(pubkey) {
      action_with_pubkey("select-profile", pubkey)
    }),
    on_like: None,
    on_repost: None,
    on_reply: Some(view_note_action),
    on_zap: None,
  )
}

fn view_note_action(note_id: String) -> Action {
  action.new("view_note")
  |> action.with_payload(
    dict.from_list([
      #("id", dynamic.string(note_id)),
      #("noteId", dynamic.string(note_id)),
    ]),
  )
}

fn action_with_pubkey(name: String, pubkey: String) -> Action {
  action.new(name)
  |> action.with_payload(dict.from_list([#("pubkey", dynamic.string(pubkey))]))
}

fn note_card_empty(title: String, description: String) -> Node {
  note_card.render_empty_timeline(title, description)
}
