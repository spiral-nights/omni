//// Shared declarative Schema UI builders (`Note -> Node`) for social note cards,
//// author headers, NIP-10 reply badges, interaction bars, and empty timeline states.
////
//// Used by both `plugin_feed` (interactive timeline & threads) and `plugin_profiles`
//// (read-only or intent-linked author notes).

import gleam/dict
import gleam/dynamic
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/builder
import omni/protocol/schema/node.{
  type ButtonVariant, type Node, AlignCenter, Avatar, BadgeAccent, Body, Button,
  ButtonGhost, ButtonSecondary, Caption, JustifyBetween, ToneMuted, TonePrimary,
}
import omni/protocol/schema/style.{SizeSm, StyleRaw}
import omni/social/note.{type Note}
import omni/social/profile.{type Profile}
import omni/social/stats.{type NoteStats}

/// Configuration for rendering a social note card.
pub type NoteCardConfig {
  NoteCardConfig(
    interactive: Bool,
    show_actions: Bool,
    now_sec: Int,
    on_open_note: Option(fn(String) -> Action),
    on_open_author: Option(fn(String) -> Action),
    on_like: Option(fn(String) -> Action),
    on_repost: Option(fn(String) -> Action),
    on_reply: Option(fn(String) -> Action),
    on_zap: Option(fn(String) -> Action),
  )
}

/// Construct a default interactive `NoteCardConfig` at `now_sec` with standard
/// action callbacks (`view_note`, `view_profile`, `like-note`, `repost-note`, `zap-note`).
pub fn default_config(now_sec: Int) -> NoteCardConfig {
  NoteCardConfig(
    interactive: True,
    show_actions: True,
    now_sec: now_sec,
    on_open_note: Some(fn(id) { action_with_id("view_note", id) }),
    on_open_author: Some(fn(pk) { action_with_pubkey("view_profile", pk) }),
    on_like: Some(fn(id) { action_with_id("like-note", id) }),
    on_repost: Some(fn(id) { action_with_id("repost-note", id) }),
    on_reply: Some(fn(id) { action_with_id("view_note", id) }),
    on_zap: Some(fn(id) { action_with_id("zap-note", id) }),
  )
}

fn action_with_id(name: String, id: String) -> Action {
  action.new(name)
  |> action.with_payload(dict.from_list([#("id", dynamic.string(id))]))
}

fn action_with_pubkey(name: String, pubkey: String) -> Action {
  action.new(name)
  |> action.with_payload(dict.from_list([#("pubkey", dynamic.string(pubkey))]))
}

/// Render the author header row (avatar, display name, relative timestamp, and truncated npub).
pub fn render_author_header(
  n: Note,
  author: Option(Profile),
  config: NoteCardConfig,
) -> Node {
  let display_name = profile.best_display_name(author, n.pubkey)
  let short_npub = profile.truncate_npub(n.pubkey)
  let rel_time = note.format_relative_time(n.created_at, config.now_sec)
  let meta_text = case short_npub {
    "" -> rel_time
    _ -> rel_time <> " · " <> short_npub
  }

  let author_action = case config.on_open_author {
    Some(mk_act) -> Some(mk_act(n.pubkey))
    None -> None
  }

  let picture_opt = case author {
    Some(prof) -> prof.picture
    None -> None
  }

  let avatar_node =
    Avatar(
      base: node.empty_base(),
      src: picture_opt,
      pubkey: Some(n.pubkey),
      name: Some(display_name),
      size: Some(SizeSm),
      action: author_action,
    )

  let name_node =
    builder.text(display_name)
    |> builder.text_variant(Body)
    |> builder.text_tone(TonePrimary)

  let meta_node =
    builder.text(meta_text)
    |> builder.text_variant(Caption)
    |> builder.text_tone(ToneMuted)

  let left_group =
    builder.box()
    |> builder.row
    |> builder.gap("xs")
    |> builder.align(AlignCenter)
    |> builder.children([avatar_node, name_node, meta_node])

  let left_with_action = case author_action {
    Some(act) -> builder.action(left_group, act)
    None -> left_group
  }

  builder.box()
  |> builder.row
  |> builder.justify(JustifyBetween)
  |> builder.align(AlignCenter)
  |> builder.children([left_with_action])
}

/// Render a NIP-10 reply indicator badge if `n` is a reply (`Some(Node)`), or `None` if root note.
pub fn render_reply_badge(
  n: Note,
  reply_author: Option(Profile),
) -> Option(Node) {
  case n.reply_to_id {
    None -> None
    Some(reply_id) -> {
      let label = resolve_reply_badge_label(n, reply_author)
      let badge_node =
        builder.badge(label)
        |> builder.badge_tone(BadgeAccent)

      let wrapper =
        builder.box()
        |> builder.row
        |> builder.align(AlignCenter)
        |> builder.gap("xs")
        |> builder.with_style(StyleRaw(
          "margin-bottom: 4px; cursor: pointer; align-self: flex-start; width: fit-content; max-width: fit-content; display: inline-flex;",
        ))
        |> builder.action(action_with_id("view_note", reply_id))
        |> builder.children([badge_node])

      Some(wrapper)
    }
  }
}

fn resolve_reply_badge_label(n: Note, reply_author: Option(Profile)) -> String {
  case reply_author {
    Some(prof) -> {
      let name = profile.best_display_name(Some(prof), prof.pubkey)
      case string.starts_with(name, "npub1") {
        True -> "Reply to " <> name
        False -> "Reply to @" <> strip_leading_at(name)
      }
    }
    None ->
      case n.reply_to_pubkey {
        Some(pk) if pk != "" -> "Reply to " <> profile.truncate_npub(pk)
        _ -> "Reply to thread"
      }
  }
}

fn strip_leading_at(name: String) -> String {
  case string.starts_with(name, "@") {
    True -> string.drop_start(name, 1)
    False -> name
  }
}

/// Render the action button row (reply, repost, like, zap) for a note.
pub fn render_note_actions(
  n: Note,
  s: NoteStats,
  config: NoteCardConfig,
) -> Node {
  let is_disabled = case config.interactive {
    True -> None
    False -> Some(True)
  }

  let reply_act = resolve_action(config.on_reply, "view_note", n.id)
  let repost_act = resolve_action(config.on_repost, "repost-note", n.id)
  let like_act = resolve_action(config.on_like, "like-note", n.id)
  let zap_act = resolve_action(config.on_zap, "zap-note", n.id)

  let repost_variant = case s.reposted_by_me {
    True -> ButtonSecondary
    False -> ButtonGhost
  }

  let like_variant = case s.liked_by_me {
    True -> ButtonSecondary
    False -> ButtonGhost
  }

  let zap_label = case s.zap_sats > 0 {
    True -> int.to_string(s.zap_sats)
    False -> int.to_string(s.zaps)
  }

  builder.box()
  |> builder.row
  |> builder.justify(JustifyBetween)
  |> builder.align(AlignCenter)
  |> builder.with_style(StyleRaw("margin-top: 2px; max-width: 320px;"))
  |> builder.children([
    action_button(
      "reply",
      int.to_string(s.replies),
      ButtonGhost,
      reply_act,
      is_disabled,
    ),
    action_button(
      "repeat",
      int.to_string(s.reposts),
      repost_variant,
      repost_act,
      is_disabled,
    ),
    action_button(
      "heart",
      int.to_string(s.likes),
      like_variant,
      like_act,
      is_disabled,
    ),
    action_button("zap", zap_label, ButtonGhost, zap_act, is_disabled),
  ])
}

fn resolve_action(
  cb_opt: Option(fn(String) -> Action),
  fallback_name: String,
  note_id: String,
) -> Action {
  case cb_opt {
    Some(mk) -> mk(note_id)
    None -> action_with_id(fallback_name, note_id)
  }
}

fn action_button(
  icon_name: String,
  label: String,
  variant: ButtonVariant,
  act: Action,
  disabled: Option(Bool),
) -> Node {
  Button(
    base: node.empty_base(),
    label: label,
    action: act,
    variant: Some(variant),
    size: Some(SizeSm),
    icon: Some(icon_name),
    icon_position: None,
    disabled: disabled,
    loading: None,
  )
}

/// Render a complete social note card (`Card` primitive) with optional reply badge,
/// author header, body text, and interaction bar.
pub fn render_note_card(
  n: Note,
  author: Option(Profile),
  reply_author: Option(Profile),
  s: NoteStats,
  config: NoteCardConfig,
) -> Node {
  let open_action = case config.on_open_note {
    Some(mk) -> Some(mk(n.id))
    None -> None
  }

  let badge_nodes = case render_reply_badge(n, reply_author) {
    Some(b) -> [b]
    None -> []
  }

  let header_node = render_author_header(n, author, config)

  let body_base =
    builder.text(n.content)
    |> builder.text_variant(Body)
    |> builder.with_inline_images(True)
    |> builder.with_style(StyleRaw(
      "margin-top: 3px; margin-bottom: 4px; cursor: pointer;",
    ))

  let body_node = case open_action {
    Some(act) -> builder.action(body_base, act)
    None -> body_base
  }

  let actions_nodes = case config.show_actions {
    True -> [render_note_actions(n, s, config)]
    False -> []
  }

  let all_children =
    list.flatten([badge_nodes, [header_node, body_node], actions_nodes])

  let card_base =
    builder.card()
    |> builder.with_id("note-" <> n.id)
    |> builder.with_key("note-" <> n.id)
    |> builder.with_style(StyleRaw("padding: 9px 12px; margin-bottom: 5px;"))
    |> builder.children(all_children)

  case open_action {
    Some(act) -> builder.action(card_base, act)
    None -> card_base
  }
}

/// Render a clean empty timeline state placeholder (`EmptyState` primitive).
pub fn render_empty_timeline(title: String, description: String) -> Node {
  let base =
    builder.empty_state(title)
    |> builder.with_icon("feed")

  case string.trim(description) {
    "" -> base
    desc ->
      case base {
        node.EmptyState(..) as es ->
          node.EmptyState(..es, description: Some(desc))
        other -> other
      }
  }
}
