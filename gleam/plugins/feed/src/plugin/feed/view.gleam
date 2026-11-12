//// Declarative Schema UI views (`Model -> Node`) for the Omni Feed plugin (`plugin_feed`).
////
//// Shares the exact same `omni/social_ui/note_card.render_note_card` implementation
//// with `plugin_profiles` via interactive action callbacks.

import gleam/dict
import gleam/dynamic
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{
  type Node, AlignCenter, Button, ButtonGhost, ButtonPrimary, ButtonSecondary,
  Caption, CodeBlock, IconButton, IconButtonGhost, IconButtonSecondary, Input,
  InputNumber, InputSearch, JustifyBetween, JustifyCenter, JustifyEnd, ListItem,
  NodeBase, PageDeclaration, StatusConnecting, StatusIndicator, TabItem, Toggle,
  ToneMuted,
}
import omni/protocol/schema/style.{SizeMd, SizeSm, StyleRaw}
import omni/social/note.{type Note}
import omni/social/profile
import omni/social/stats.{type NoteStats}
import omni/social_ui/note_card.{type NoteCardConfig, NoteCardConfig}
import plugin/feed/model.{
  type FeedTab, type Model, TabFollowing, TabGlobal, TabReplies, ViewSearch,
  ViewSettings, ViewThread, ViewTimeline, ViewWidget,
}
import plugin/feed/zap

/// Render the top-level declarative Schema `Node` for `model`.
pub fn view(model: Model) -> Node {
  case model.view {
    ViewTimeline -> render_timeline_view(model)
    ViewThread(note_id) -> render_thread_view(model, note_id)
    ViewSearch -> render_search_view(model)
    ViewSettings -> render_settings_view(model)
    ViewWidget -> render_widget_view(model)
  }
}

// -----------------------------------------------------------------------------
// 1. Timeline View
// -----------------------------------------------------------------------------

fn render_timeline_view(model: Model) -> Node {
  let composer_node = render_composer_card(model)
  let tabs_node = render_feed_tabs(model.active_tab)
  let visible_notes = model.visible_timeline_notes(model)
  let cfg = feed_note_card_config(model.now_sec)

  let timeline_content = case visible_notes {
    [] -> [
      note_card.render_empty_timeline(
        empty_timeline_title(model),
        empty_timeline_description(model),
      ),
    ]
    notes -> {
      let cards =
        list.map(notes, fn(n) { render_feed_note_card(model, n, cfg) })
      let load_more_nodes = case model.has_more_timeline_notes(model) {
        True -> [render_load_more_button()]
        False -> []
      }
      list.append(cards, load_more_nodes)
    }
  }

  let children =
    list.flatten([
      [composer_node, tabs_node],
      render_zap_panel(model),
      timeline_content,
    ])

  schema.card()
  |> schema.with_id("feed-timeline")
  |> schema.title("Timeline Notes")
  |> schema.with_icon("feed")
  |> schema.page("timeline")
  |> schema.with_style(StyleRaw(
    "max-width: 720px; margin: 0 auto; width: 100%;",
  ))
  |> schema.children(children)
}

fn render_composer_card(model: Model) -> Node {
  let textarea_node =
    schema.textarea("composerText")
    |> schema.with_id("composer-textarea")
    |> schema.placeholder("What's on your mind? Broadcast to Nostr...")
    |> schema.value(model.composer_draft)
    |> schema.action_on_change(action.new("set-composer-draft"))

  let post_btn =
    Button(
      base: node.empty_base(),
      label: "Post Note",
      action: action.new("publish-note"),
      variant: Some(ButtonPrimary),
      size: Some(SizeSm),
      icon: Some("send"),
      icon_position: None,
      disabled: None,
      loading: None,
    )

  let footer_row =
    schema.box()
    |> schema.row
    |> schema.justify(JustifyEnd)
    |> schema.children([post_btn])

  schema.box()
  |> schema.column
  |> schema.gap("sm")
  |> schema.with_style(StyleRaw(
    "margin-top: 8px; margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;",
  ))
  |> schema.children([textarea_node, footer_row])
}

fn render_feed_tabs(active_tab: FeedTab) -> Node {
  let active_id = tab_to_id(active_tab)
  let items = [
    TabItem(
      id: "following",
      label: "Following",
      icon: Some("users"),
      badge: None,
    ),
    TabItem(id: "global", label: "Global", icon: Some("globe"), badge: None),
    TabItem(id: "replies", label: "Replies", icon: Some("reply"), badge: None),
  ]

  let tabs_primitive = schema.tabs(items, active_id, action.new("select-tab"))

  schema.box()
  |> schema.row
  |> schema.justify(JustifyBetween)
  |> schema.align(AlignCenter)
  |> schema.with_style(StyleRaw("margin-bottom: 10px;"))
  |> schema.children([tabs_primitive])
}

fn tab_to_id(tab: FeedTab) -> String {
  case tab {
    TabFollowing -> "following"
    TabGlobal -> "global"
    TabReplies -> "replies"
  }
}

fn render_load_more_button() -> Node {
  let btn =
    Button(
      base: node.empty_base(),
      label: "Load More",
      action: action.new("load-more"),
      variant: Some(ButtonSecondary),
      size: Some(SizeMd),
      icon: Some("arrow-down"),
      icon_position: None,
      disabled: None,
      loading: None,
    )

  schema.box()
  |> schema.row
  |> schema.justify(JustifyCenter)
  |> schema.with_style(StyleRaw("margin-top: 12px; margin-bottom: 16px;"))
  |> schema.children([btn])
}

fn empty_timeline_title(model: Model) -> String {
  case model.active_tab {
    TabFollowing ->
      case model.follows.followed_pubkeys != [] {
        True -> "No notes from followed creators yet"
        False -> "No timeline notes yet"
      }
    TabGlobal -> "No global timeline notes yet"
    TabReplies -> "No reply notes yet"
  }
}

fn empty_timeline_description(model: Model) -> String {
  case model.active_tab {
    TabFollowing ->
      "Follow creators in Profiles, switch to Global, or publish a new note above."
    TabGlobal -> "Notes will stream in as relays respond, or post a note above."
    TabReplies -> "Conversation replies will appear here as notes arrive."
  }
}

// -----------------------------------------------------------------------------
// 2. Thread View
// -----------------------------------------------------------------------------

fn render_thread_view(model: Model, note_id: String) -> Node {
  let back_btn =
    Button(
      base: node.empty_base(),
      label: "Back to Feed",
      action: action.navigate_back(),
      variant: Some(ButtonGhost),
      size: Some(SizeSm),
      icon: Some("arrow-left"),
      icon_position: None,
      disabled: None,
      loading: None,
    )

  let cfg = feed_note_card_config(model.now_sec)

  let zap_panel = render_zap_panel(model)

  let body_nodes = case model.active_thread(model) {
    None -> [
      note_card.render_empty_timeline(
        "Note not found",
        "The requested conversation note has not arrived from relays yet.",
      ),
    ]
    Some(thread_view) -> {
      let ancestor_cards =
        list.map(thread_view.ancestors, fn(anc) {
          render_feed_note_card(model, anc, cfg)
        })

      let focal_card = render_feed_note_card(model, thread_view.focal, cfg)
      let reply_composer = render_reply_composer(model, thread_view.focal.id)

      let reply_cards = case thread_view.replies {
        [] -> [
          schema.text("No replies yet. Be the first to reply!")
          |> schema.text_variant(Caption)
          |> schema.text_tone(ToneMuted),
        ]
        replies ->
          list.map(replies, fn(rep) { render_feed_note_card(model, rep, cfg) })
      }

      list.flatten([
        ancestor_cards,
        [focal_card, schema.divider(), reply_composer],
        reply_cards,
      ])
    }
  }

  let card_base =
    schema.card()
    |> schema.with_id("thread-" <> note_id)
    |> schema.title("Conversation Thread")
    |> schema.with_icon("reply")
    |> schema.with_style(StyleRaw(
      "max-width: 720px; margin: 0 auto; width: 100%;",
    ))
    |> schema.children(
      list.flatten([[back_btn, schema.divider()], zap_panel, body_nodes]),
    )

  let b = node.get_base(card_base)
  let page_decl =
    PageDeclaration(
      id: "thread-" <> note_id,
      title: Some("Conversation Thread"),
      url: Some("?view=thread&id=" <> note_id),
    )
  node.set_base(card_base, NodeBase(..b, page: Some(page_decl)))
}

fn render_reply_composer(model: Model, parent_id: String) -> Node {
  let reply_act =
    action.new("publish-reply")
    |> action.with_payload(
      dict.from_list([#("parentId", dynamic.string(parent_id))]),
    )

  let textarea_node =
    schema.textarea("replyText")
    |> schema.with_id("reply-textarea")
    |> schema.placeholder("Write a reply...")
    |> schema.value(model.reply_draft)
    |> schema.action_on_change(action.new("set-reply-draft"))

  let reply_btn =
    Button(
      base: node.empty_base(),
      label: "Reply",
      action: reply_act,
      variant: Some(ButtonPrimary),
      size: Some(SizeSm),
      icon: Some("reply"),
      icon_position: None,
      disabled: None,
      loading: None,
    )

  let button_row =
    schema.box()
    |> schema.row
    |> schema.justify(JustifyEnd)
    |> schema.children([reply_btn])

  schema.box()
  |> schema.column
  |> schema.gap("sm")
  |> schema.with_style(StyleRaw("margin-top: 8px; margin-bottom: 12px;"))
  |> schema.children([textarea_node, button_row])
}

// -----------------------------------------------------------------------------
// 3. Search View
// -----------------------------------------------------------------------------

fn render_search_view(model: Model) -> Node {
  let search_act = action.new("search")
  let search_input =
    Input(
      base: node.empty_base(),
      name: "searchQuery",
      placeholder: Some("Search notes, #hashtags, or authors..."),
      value: Some(model.search_query),
      input_type: Some(InputSearch),
      accept: None,
      clearable: Some(True),
      prefix_icon: Some("search"),
      action_on_enter: Some(search_act),
      action_on_change: Some(search_act),
    )

  let relay_search_btn =
    schema.button("Search Relays", action.new("submit-search"))
    |> schema.with_icon("search")

  let cfg = feed_note_card_config(model.now_sec)
  let results = model.search_results(model)

  let result_nodes = case results {
    [] -> [
      note_card.render_empty_timeline(
        "No matching notes",
        "Try searching for another keyword, #hashtag, or author name.",
      ),
    ]
    matched -> list.map(matched, fn(n) { render_feed_note_card(model, n, cfg) })
  }

  schema.card()
  |> schema.with_id("feed-search")
  |> schema.title("Search Notes")
  |> schema.with_icon("search")
  |> schema.page("search")
  |> schema.with_style(StyleRaw(
    "max-width: 720px; margin: 0 auto; width: 100%;",
  ))
  |> schema.children(
    list.flatten([
      [search_input, relay_search_btn, schema.divider()],
      render_zap_panel(model),
      result_nodes,
    ]),
  )
}

// -----------------------------------------------------------------------------
// 4. Settings View
// -----------------------------------------------------------------------------

fn render_settings_view(model: Model) -> Node {
  let replies_toggle =
    Toggle(
      base: node.empty_base(),
      name: "showReplies",
      label: Some("Show replies in timeline"),
      checked: model.settings.show_replies,
      action: action.new("toggle-show-replies"),
      disabled: None,
    )

  let media_toggle =
    Toggle(
      base: node.empty_base(),
      name: "showInlineMedia",
      label: Some("Show inline media images"),
      checked: model.settings.show_inline_media,
      action: action.new("toggle-inline-media"),
      disabled: None,
    )

  let page_size_info =
    schema.text(
      "Page size: "
      <> int.to_string(model.settings.page_size)
      <> " notes per load",
    )
    |> schema.text_variant(Caption)
    |> schema.text_tone(ToneMuted)

  schema.card()
  |> schema.with_id("feed-settings")
  |> schema.title("Feed Settings")
  |> schema.subtitle("Customize how timeline notes and media are displayed")
  |> schema.with_icon("settings")
  |> schema.page("settings")
  |> schema.children([
    schema.box()
    |> schema.column
    |> schema.gap("md")
    |> schema.children([replies_toggle, media_toggle, page_size_info]),
  ])
}

// -----------------------------------------------------------------------------
// 5. Widget View
// -----------------------------------------------------------------------------

fn render_widget_view(model: Model) -> Node {
  let recent =
    model.filtered_timeline_notes(model)
    |> list.take(3)

  let list_items = case recent {
    [] -> [
      schema.list_item("Connecting to relays...")
      |> schema.with_id("empty")
      |> schema.subtitle("Notes will stream in from relays"),
    ]
    notes ->
      list.map(notes, fn(n) {
        let author_opt =
          dict.get(model.profiles, n.pubkey) |> option.from_result
        let author_name = profile.best_display_name(author_opt, n.pubkey)
        let s = get_note_stats(model, n.id)
        let like_variant = case s.liked_by_me {
          True -> IconButtonSecondary
          False -> IconButtonGhost
        }
        let like_act = action_with_id("like-note", n.id)
        let open_act = action_with_id("open-thread", n.id)
        let like_icon_btn =
          IconButton(
            base: node.empty_base(),
            icon: "heart",
            tooltip: Some("Like"),
            action: like_act,
            variant: Some(like_variant),
            size: Some(SizeSm),
            disabled: None,
          )

        ListItem(
          base: node.empty_base(),
          title: author_name,
          subtitle: Some(n.content),
          meta: Some(note.format_relative_time(n.created_at, model.now_sec)),
          icon: None,
          avatar_url: None,
          avatar_pubkey: Some(n.pubkey),
          checked: None,
          on_check_action: None,
          on_click_action: Some(open_act),
          actions: [like_icon_btn],
        )
        |> schema.with_id("widget-note-" <> n.id)
      })
  }

  let quick_input =
    Input(
      base: node.empty_base(),
      name: "composerText",
      placeholder: Some("Quick note..."),
      value: Some(model.composer_draft),
      input_type: None,
      accept: None,
      clearable: None,
      prefix_icon: None,
      action_on_enter: Some(action.new("publish-note")),
      action_on_change: Some(action.new("set-composer-draft")),
    )

  let post_btn =
    Button(
      base: node.empty_base(),
      label: "Post",
      action: action.new("publish-note"),
      variant: Some(ButtonPrimary),
      size: Some(SizeSm),
      icon: None,
      icon_position: None,
      disabled: None,
      loading: None,
    )

  let quick_composer =
    schema.box()
    |> schema.row
    |> schema.gap("sm")
    |> schema.children([quick_input, post_btn])

  schema.card()
  |> schema.with_id("feed-widget")
  |> schema.title("Recent Notes")
  |> schema.with_icon("message")
  |> schema.children([quick_composer, schema.list_view(list_items)])
}

// -----------------------------------------------------------------------------
// Zap dialog
// -----------------------------------------------------------------------------

fn render_zap_panel(model: Model) -> List(Node) {
  case model.zap_target {
    None -> []
    Some(note_id) -> {
      let target = dict.get(model.notes, note_id) |> option.from_result

      let author_name = case target {
        Some(n) -> {
          let author_opt =
            dict.get(model.profiles, n.pubkey) |> option.from_result
          profile.best_display_name(author_opt, n.pubkey)
        }
        None -> "this note"
      }

      let recipient_line = case model.zap_recipient_lud16 {
        Some(lud16) -> "Zapping " <> author_name <> " (" <> lud16 <> ")"
        None -> "Zapping " <> author_name
      }

      let button_row = fn(buttons: List(Node)) {
        schema.box()
        |> schema.row
        |> schema.justify(JustifyEnd)
        |> schema.gap("xs")
        |> schema.children(buttons)
      }

      let cancel_btn = fn(label: String) {
        Button(
          base: node.empty_base(),
          label: label,
          action: action.new("cancel-zap"),
          variant: Some(ButtonGhost),
          size: Some(SizeSm),
          icon: None,
          icon_position: None,
          disabled: None,
          loading: None,
        )
      }

      let body_nodes = case model.zap_pending, model.zap_invoice {
        True, _ -> [
          StatusIndicator(
            base: node.empty_base(),
            status: StatusConnecting,
            label: Some("Waiting for Lightning invoice"),
            pulse: Some(True),
          ),
          schema.text(
            "Signing your zap request and contacting the Lightning address.",
          )
            |> schema.text_variant(Caption)
            |> schema.text_tone(ToneMuted),
          button_row([cancel_btn("Cancel")]),
        ]

        False, Some(invoice) -> {
          let pay_action =
            action.new("pay-invoice")
            |> action.with_payload(
              dict.from_list([#("invoice", dynamic.string(invoice))]),
            )
          let pay_btn =
            Button(
              base: node.empty_base(),
              label: "Pay",
              action: pay_action,
              variant: Some(ButtonPrimary),
              size: Some(SizeSm),
              icon: Some("zap"),
              icon_position: None,
              disabled: None,
              loading: None,
            )
          [
            schema.text("Invoice ready")
              |> schema.text_variant(Caption)
              |> schema.text_tone(ToneMuted),
            CodeBlock(
              base: node.empty_base(),
              code: invoice,
              language: Some("text"),
              copyable: Some(True),
            ),
            schema.text(
              "Open the invoice in your Lightning wallet to complete the zap.",
            )
              |> schema.text_variant(Caption)
              |> schema.text_tone(ToneMuted),
            button_row([cancel_btn("Close"), pay_btn]),
          ]
        }

        False, None -> {
          let amount_status = case zap.parse_amount(model.zap_amount) {
            Ok(sats) -> "Amount: " <> int.to_string(sats) <> " sats"
            Error(_) -> "Enter a whole number of sats greater than zero."
          }

          let can_send = case target, zap.parse_amount(model.zap_amount) {
            Some(_), Ok(_) -> True
            _, _ -> False
          }

          let preset_row =
            schema.box()
            |> schema.row
            |> schema.gap("xs")
            |> schema.children([
              zap_preset_button(21, model.zap_amount),
              zap_preset_button(100, model.zap_amount),
              zap_preset_button(1000, model.zap_amount),
            ])

          let amount_input =
            Input(
              base: node.empty_base(),
              name: "zapAmount",
              placeholder: Some("Amount in sats"),
              value: Some(model.zap_amount),
              input_type: Some(InputNumber),
              accept: None,
              clearable: None,
              prefix_icon: Some("zap"),
              action_on_enter: Some(action.new("send-zap")),
              action_on_change: Some(action.new("set-zap-amount")),
            )

          let comment_input =
            Input(
              base: node.empty_base(),
              name: "zapComment",
              placeholder: Some("Optional zap comment"),
              value: Some(model.zap_comment),
              input_type: None,
              accept: None,
              clearable: Some(True),
              prefix_icon: None,
              action_on_enter: Some(action.new("send-zap")),
              action_on_change: Some(action.new("set-zap-comment")),
            )

          let send_btn =
            Button(
              base: node.empty_base(),
              label: "Send Zap",
              action: action.new("send-zap"),
              variant: Some(ButtonPrimary),
              size: Some(SizeSm),
              icon: Some("zap"),
              icon_position: None,
              disabled: Some(!can_send),
              loading: None,
            )

          [
            preset_row,
            amount_input,
            schema.text(amount_status)
              |> schema.text_variant(Caption)
              |> schema.text_tone(ToneMuted),
            comment_input,
            button_row([cancel_btn("Cancel"), send_btn]),
          ]
        }
      }

      [
        schema.card()
        |> schema.with_id("zap-dialog")
        |> schema.title("Zap note")
        |> schema.subtitle(recipient_line)
        |> schema.with_icon("zap")
        |> schema.with_style(StyleRaw(
          "margin-bottom: 12px; border: 1px solid rgba(229, 192, 123, 0.35);",
        ))
        |> schema.children(body_nodes),
      ]
    }
  }
}

fn zap_preset_button(amount: Int, current_amount: String) -> Node {
  let amount_text = int.to_string(amount)
  let is_selected = string.trim(current_amount) == amount_text
  let variant = case is_selected {
    True -> ButtonSecondary
    False -> ButtonGhost
  }
  let act =
    action.new("set-zap-amount")
    |> action.with_payload(
      dict.from_list([#("amount", dynamic.string(amount_text))]),
    )

  Button(
    base: node.empty_base(),
    label: amount_text <> " sats",
    action: act,
    variant: Some(variant),
    size: Some(SizeSm),
    icon: None,
    icon_position: None,
    disabled: None,
    loading: None,
  )
}

// -----------------------------------------------------------------------------
// Shared `omni/social_ui/note_card` wiring
// -----------------------------------------------------------------------------

fn feed_note_card_config(now_sec: Int) -> NoteCardConfig {
  NoteCardConfig(
    interactive: True,
    show_actions: True,
    now_sec: now_sec,
    on_open_note: Some(fn(id) { action_with_id("open-thread", id) }),
    on_open_author: Some(fn(pk) { action_with_pubkey("view_profile", pk) }),
    on_like: Some(fn(id) { action_with_id("like-note", id) }),
    on_repost: Some(fn(id) { action_with_id("repost-note", id) }),
    on_reply: Some(fn(id) { action_with_id("start-reply", id) }),
    on_zap: Some(fn(id) { action_with_id("zap-note", id) }),
  )
}

fn render_feed_note_card(model: Model, n: Note, cfg: NoteCardConfig) -> Node {
  let author_opt = dict.get(model.profiles, n.pubkey) |> option.from_result
  let reply_author_opt = resolve_reply_author_profile(model, n)
  let s = get_note_stats(model, n.id)
  note_card.render_note_card(n, author_opt, reply_author_opt, s, cfg)
}

fn resolve_reply_author_profile(
  model: Model,
  n: Note,
) -> Option(profile.Profile) {
  case n.reply_to_pubkey {
    Some(rpk) -> dict.get(model.profiles, rpk) |> option.from_result
    None ->
      case n.reply_to_id {
        Some(parent_id) ->
          case dict.get(model.notes, parent_id) {
            Ok(parent_note) ->
              dict.get(model.profiles, parent_note.pubkey)
              |> option.from_result
            Error(Nil) -> None
          }
        None -> None
      }
  }
}

fn get_note_stats(model: Model, note_id: String) -> NoteStats {
  case dict.get(model.stats, note_id) {
    Ok(s) -> s
    Error(Nil) -> stats.empty_stats(note_id)
  }
}

fn action_with_id(name: String, id: String) -> Action {
  action.new(name)
  |> action.with_payload(dict.from_list([#("id", dynamic.string(id))]))
}

fn action_with_pubkey(name: String, pubkey: String) -> Action {
  action.new(name)
  |> action.with_payload(dict.from_list([#("pubkey", dynamic.string(pubkey))]))
}
