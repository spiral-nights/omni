//// Pure state reducer and Channel 1 `Action -> Option(Msg)` mapper for `plugin_feed`.

import gleam/bit_array
import gleam/dict
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{type Event, UnsignedEvent}
import omni/nostr/kind
import omni/nostr/pubkey
import omni/plugin_kit/app.{type Effect, FetchUntil, Publish}
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import omni/social/follows
import omni/social/note.{type Note, Note}
import omni/social/profile.{type Profile}
import omni/social/stats.{type NoteStats, NoteStats}
import plugin/feed/model.{
  type FeedSettings, type FeedTab, type FeedView, type Model, FeedSettings,
  Model, TabFollowing, TabGlobal, TabReplies, ViewSearch, ViewSettings,
  ViewThread, ViewTimeline, ViewWidget,
}
import plugin/feed/msg.{
  type Msg, CancelZap, IngestEvent, IngestEvents, LikeNote, LoadMore,
  NavigateBack, OpenThread, PublishNote, PublishReply, RepostNote, SelectTab,
  SelectView, SendZap, SetComposerDraft, SetComposerDraftAndPublish,
  SetReplyDraft, SetSearchQuery, SetZapAmount, SetZapComment, StartReply,
  StartZap, ToggleInlineMedia, ToggleShowReplies,
}
import plugin/feed/zap

const default_author_hex =
  "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"

/// Apply a `Msg` to `Model`, returning the updated `Model` and any side `Effect`s.
pub fn update(model: Model, msg: Msg) -> #(Model, List(Effect(Msg))) {
  case msg {
    SelectTab(tab) -> #(
      Model(..model, active_tab: tab, visible_limit: model.settings.page_size),
      [],
    )

    SelectView(view) -> #(Model(..model, view: view), [])

    OpenThread(note_id) -> {
      let cleaned = string.trim(note_id)
      case cleaned {
        "" -> #(model, [])
        _ -> #(
          Model(
            ..model,
            view: ViewThread(note_id: cleaned),
            replying_to: Some(cleaned),
          ),
          [],
        )
      }
    }

    NavigateBack -> #(Model(..model, view: ViewTimeline, replying_to: None), [])

    SetComposerDraft(draft) -> #(Model(..model, composer_draft: draft), [])

    SetComposerDraftAndPublish(text) -> publish_note_effect(model, text)

    PublishNote -> publish_note_effect(model, model.composer_draft)

    StartReply(note_id) -> {
      let cleaned = string.trim(note_id)
      case cleaned {
        "" -> #(model, [])
        _ -> #(
          Model(
            ..model,
            view: ViewThread(note_id: cleaned),
            replying_to: Some(cleaned),
          ),
          [],
        )
      }
    }

    SetReplyDraft(draft) -> #(Model(..model, reply_draft: draft), [])

    PublishReply(parent_id) -> publish_reply_effect(model, parent_id)

    LikeNote(note_id) -> #(
      model,
      reaction_effect(model, note_id, kind.Reaction, "+"),
    )

    RepostNote(note_id) -> #(
      model,
      reaction_effect(model, note_id, kind.Repost, ""),
    )

    StartZap(note_id) -> #(start_zap(model, note_id), [])

    SetZapAmount(amount) -> #(Model(..model, zap_amount: amount), [])

    SetZapComment(comment) -> #(Model(..model, zap_comment: comment), [])

    SendZap -> send_zap(model)

    CancelZap -> #(clear_zap(model), [])

    SetSearchQuery(query) -> #(
      Model(..model, view: ViewSearch, search_query: query),
      [],
    )

    LoadMore -> {
      let next_model =
        Model(
          ..model,
          visible_limit: model.visible_limit + model.settings.page_size,
        )
      case oldest_note_time(model) {
        Some(until) -> #(next_model, [FetchUntil(until - 1)])
        None -> #(next_model, [])
      }
    }

    ToggleShowReplies -> {
      let current = model.settings
      let next_settings =
        FeedSettings(..current, show_replies: !current.show_replies)
      #(Model(..model, settings: next_settings), [])
    }

    ToggleInlineMedia -> {
      let current = model.settings
      let next_settings =
        FeedSettings(..current, show_inline_media: !current.show_inline_media)
      #(Model(..model, settings: next_settings), [])
    }

    IngestEvent(ev) -> #(ingest_single_event(model, ev), [])

    IngestEvents(events) -> #(list.fold(events, model, ingest_single_event), [])
  }
}

/// Map an incoming Schema `Action` over Channel 1 to an optional `Msg`.
pub fn action_to_msg(act: Action) -> Option(Msg) {
  case act.name {
    "select-tab" | "set-tab" | "select_tab" ->
      case extract_string(act, ["tab", "value", "id"]) {
        Some(t) -> Some(SelectTab(parse_tab(t)))
        None -> None
      }

    "select-view" | "set-view" | "select_view" | "navigate" ->
      case extract_view(act) {
        Some(v) -> Some(SelectView(v))
        None -> None
      }

    "open-thread" | "view-thread" | "view_thread" | "view-note" | "view_note" ->
      case extract_string(act, ["id", "noteId", "note_id", "eventId"]) {
        Some(id) if id != "" -> Some(OpenThread(id))
        _ -> None
      }

    "back" | "back-to-feed" | "navigate-back" | "navigate_back" ->
      Some(NavigateBack)

    "set-composer-draft" | "composer-input" | "set_composer_draft" ->
      case extract_string(act, ["value", "draft", "composerText", "noteText"]) {
        Some(text) -> Some(SetComposerDraft(text))
        None -> Some(SetComposerDraft(""))
      }

    "publish-note" | "publish_note" ->
      case
        extract_string(act, ["composerText", "noteText", "content", "value"])
      {
        Some(text) if text != "" -> Some(SetComposerDraftAndPublish(text))
        _ -> Some(PublishNote)
      }

    "start-reply" | "reply-note" | "start_reply" ->
      case extract_string(act, ["id", "noteId", "note_id"]) {
        Some(id) if id != "" -> Some(StartReply(id))
        _ -> None
      }

    "set-reply-draft" | "reply-input" | "set_reply_draft" ->
      case extract_string(act, ["value", "draft", "replyText"]) {
        Some(text) -> Some(SetReplyDraft(text))
        None -> Some(SetReplyDraft(""))
      }

    "publish-reply" | "publish_reply" ->
      case extract_string(act, ["parentId", "parent_id", "replyToId", "id"]) {
        Some(pid) if pid != "" -> Some(PublishReply(pid))
        _ -> None
      }

    "like-note" | "like_note" ->
      case extract_string(act, ["id", "noteId", "note_id"]) {
        Some(id) if id != "" -> Some(LikeNote(id))
        _ -> None
      }

    "repost-note" | "repost_note" ->
      case extract_string(act, ["id", "noteId", "note_id"]) {
        Some(id) if id != "" -> Some(RepostNote(id))
        _ -> None
      }

    "zap-note" | "zap_note" ->
      case extract_string(act, ["id", "noteId", "note_id"]) {
        Some(id) if id != "" -> Some(StartZap(id))
        _ -> None
      }

    "set-zap-amount" | "set_zap_amount" | "zap-preset" | "zap_preset" ->
      case extract_string(act, ["amount", "value", "zapAmount", "zap_amount"]) {
        Some(amount) -> Some(SetZapAmount(amount))
        None -> None
      }

    "set-zap-comment" | "set_zap_comment" | "zap-comment" | "zap_comment" ->
      case
        extract_string(act, ["comment", "value", "zapComment", "zap_comment"])
      {
        Some(comment) -> Some(SetZapComment(comment))
        None -> Some(SetZapComment(""))
      }

    "send-zap" | "send_zap" -> Some(SendZap)

    "cancel-zap" | "cancel_zap" -> Some(CancelZap)

    "search" | "set-search-query" | "set_search_query" ->
      case extract_string(act, ["query", "q", "value", "searchQuery"]) {
        Some(q) -> Some(SetSearchQuery(q))
        None -> Some(SetSearchQuery(""))
      }

    "load-more" | "load_more" -> Some(LoadMore)

    "toggle-show-replies" | "toggle_show_replies" -> Some(ToggleShowReplies)

    "toggle-inline-media" | "toggle_inline_media" -> Some(ToggleInlineMedia)

    _ -> None
  }
}

fn ingest_single_event(model: Model, ev: Event) -> Model {
  let next_now = case ev.created_at > model.now_sec {
    True -> ev.created_at
    False -> model.now_sec
  }

  // Always run stats reducer on every incoming event (handles Kind 1 replies, Kind 6, Kind 7, Kind 9735)
  let updated_stats = stats.apply_event(model.stats, ev, model.my_pubkey)

  case ev.kind {
    kind.Metadata -> {
      let next_profiles = case profile.from_event(ev) {
        Ok(prof) -> upsert_profile(model.profiles, prof)
        Error(_) -> model.profiles
      }
      Model(
        ..model,
        profiles: next_profiles,
        stats: updated_stats,
        now_sec: next_now,
      )
    }

    kind.Note -> {
      let parsed_note = note.from_event(ev)
      let resolved_note = enrich_reply_pubkey(parsed_note, model.notes)
      let next_notes = dict.insert(model.notes, resolved_note.id, resolved_note)
      Model(..model, notes: next_notes, stats: updated_stats, now_sec: next_now)
    }

    kind.ContactList -> {
      let parsed_follows = follows.from_event(ev)
      let should_apply_follows = case model.my_pubkey {
        Some(me) ->
          string.lowercase(string.trim(me)) == parsed_follows.pubkey
          || model.follows.followed_pubkeys == []
        None -> parsed_follows.updated_at >= model.follows.updated_at
      }
      let next_follows = case should_apply_follows {
        True -> parsed_follows
        False -> model.follows
      }
      let next_my_pubkey = case model.my_pubkey {
        Some(me) -> Some(me)
        None -> Some(pubkey.to_hex(ev.pubkey))
      }
      Model(
        ..model,
        follows: next_follows,
        my_pubkey: next_my_pubkey,
        stats: updated_stats,
        now_sec: next_now,
      )
    }

    _ -> Model(..model, stats: updated_stats, now_sec: next_now)
  }
}

fn oldest_note_time(model: Model) -> Option(Int) {
  model.notes
  |> dict.values
  |> list.fold(None, fn(acc, note) {
    case acc {
      None -> Some(note.created_at)
      Some(ts) -> Some(int.min(ts, note.created_at))
    }
  })
}

fn upsert_profile(
  profiles: dict.Dict(String, Profile),
  incoming: Profile,
) -> dict.Dict(String, Profile) {
  case dict.get(profiles, incoming.pubkey) {
    Ok(existing) ->
      case incoming.created_at >= existing.created_at {
        True -> dict.insert(profiles, incoming.pubkey, incoming)
        False -> profiles
      }
    Error(Nil) -> dict.insert(profiles, incoming.pubkey, incoming)
  }
}

fn enrich_reply_pubkey(n: Note, known_notes: dict.Dict(String, Note)) -> Note {
  case n.reply_to_pubkey, n.reply_to_id {
    None, Some(parent_id) ->
      case dict.get(known_notes, parent_id) {
        Ok(parent) -> Note(..n, reply_to_pubkey: Some(parent.pubkey))
        Error(Nil) -> n
      }
    _, _ -> n
  }
}

fn publish_new_note(model: Model) -> Model {
  let content = string.trim(model.composer_draft)
  case content {
    "" -> model
    _ -> {
      let author_pk = case model.my_pubkey {
        Some(pk) if pk != "" -> pk
        _ -> default_author_hex
      }
      let created_at = model.now_sec + 1
      let seq = dict.size(model.notes) + 1
      let note_id = synthetic_note_id(seq, created_at, author_pk, content)
      let new_note =
        Note(
          id: note_id,
          pubkey: author_pk,
          content: content,
          created_at: created_at,
          reply_to_id: None,
          root_id: None,
          reply_to_pubkey: None,
          mentioned_pubkeys: [],
          hashtags: extract_inline_hashtags(content),
        )
      Model(
        ..model,
        notes: dict.insert(model.notes, note_id, new_note),
        composer_draft: "",
        now_sec: created_at,
      )
    }
  }
}

fn publish_reply_note(model: Model, parent_id: String) -> Model {
  let clean_parent = string.trim(parent_id)
  let content = string.trim(model.reply_draft)
  case clean_parent == "" || content == "" {
    True -> model
    False -> {
      let author_pk = case model.my_pubkey {
        Some(pk) if pk != "" -> pk
        _ -> default_author_hex
      }
      let created_at = model.now_sec + 1
      let seq = dict.size(model.notes) + 1
      let note_id = synthetic_note_id(seq, created_at, author_pk, content)

      let #(root_id, parent_pubkey, mentioned) = case
        dict.get(model.notes, clean_parent)
      {
        Ok(parent_note) -> {
          let resolved_root = case parent_note.root_id {
            Some(r) -> r
            None -> parent_note.id
          }
          #(
            resolved_root,
            Some(parent_note.pubkey),
            list.unique([parent_note.pubkey, ..parent_note.mentioned_pubkeys]),
          )
        }
        Error(Nil) -> #(clean_parent, None, [])
      }

      let reply_note =
        Note(
          id: note_id,
          pubkey: author_pk,
          content: content,
          created_at: created_at,
          reply_to_id: Some(clean_parent),
          root_id: Some(root_id),
          reply_to_pubkey: parent_pubkey,
          mentioned_pubkeys: mentioned,
          hashtags: extract_inline_hashtags(content),
        )

      let current_parent_stats = get_or_empty_stats(model.stats, clean_parent)
      let updated_parent_stats =
        NoteStats(
          ..current_parent_stats,
          replies: current_parent_stats.replies + 1,
        )

      Model(
        ..model,
        notes: dict.insert(model.notes, note_id, reply_note),
        stats: dict.insert(model.stats, clean_parent, updated_parent_stats),
        reply_draft: "",
        now_sec: created_at,
      )
    }
  }
}

fn toggle_like(model: Model, note_id: String) -> Model {
  let clean_id = string.trim(note_id)
  case clean_id {
    "" -> model
    _ -> {
      let current = get_or_empty_stats(model.stats, clean_id)
      let next_stats = case current.liked_by_me {
        True ->
          NoteStats(
            ..current,
            likes: int.max(0, current.likes - 1),
            liked_by_me: False,
          )
        False ->
          NoteStats(..current, likes: current.likes + 1, liked_by_me: True)
      }
      Model(..model, stats: dict.insert(model.stats, clean_id, next_stats))
    }
  }
}

fn toggle_repost(model: Model, note_id: String) -> Model {
  let clean_id = string.trim(note_id)
  case clean_id {
    "" -> model
    _ -> {
      let current = get_or_empty_stats(model.stats, clean_id)
      let next_stats = case current.reposted_by_me {
        True ->
          NoteStats(
            ..current,
            reposts: int.max(0, current.reposts - 1),
            reposted_by_me: False,
          )
        False ->
          NoteStats(
            ..current,
            reposts: current.reposts + 1,
            reposted_by_me: True,
          )
      }
      Model(..model, stats: dict.insert(model.stats, clean_id, next_stats))
    }
  }
}

fn start_zap(model: Model, note_id: String) -> Model {
  let clean_id = string.trim(note_id)
  case clean_id {
    "" -> model
    _ -> {
      let lud16 = case dict.get(model.notes, clean_id) {
        Ok(target) ->
          case dict.get(model.profiles, target.pubkey) {
            Ok(profile) -> profile.lud16
            Error(Nil) -> None
          }
        Error(Nil) -> None
      }
      let lnurl = case lud16 {
        Some(address) ->
          case zap.lud16_to_lnurl(address) {
            Ok(encoded) -> Some(encoded)
            Error(Nil) -> None
          }
        None -> None
      }
      Model(
        ..model,
        zap_target: Some(clean_id),
        zap_amount: "21",
        zap_comment: "",
        zap_recipient_lud16: lud16,
        zap_lnurl: lnurl,
      )
    }
  }
}

fn clear_zap(model: Model) -> Model {
  Model(
    ..model,
    zap_target: None,
    zap_amount: "21",
    zap_comment: "",
    zap_recipient_lud16: None,
    zap_lnurl: None,
  )
}

fn send_zap(model: Model) -> #(Model, List(Effect(Msg))) {
  case model.zap_target {
    None -> #(model, [])
    Some(note_id) ->
      case dict.get(model.notes, note_id) {
        Error(Nil) -> #(model, [])
        Ok(target) ->
          case zap.parse_amount(model.zap_amount) {
            Error(_) -> #(model, [])
            Ok(sats) -> {
              let draft: zap.ZapRequestDraft =
                zap.ZapRequestDraft(
                  note_id: target.id,
                  recipient_pubkey: target.pubkey,
                  amount_sats: sats,
                  comment: model.zap_comment,
                  relays: zap.default_relay_urls,
                  lnurl: model.zap_lnurl,
                )
              let unsigned = zap.request_event(draft, model.now_sec + 1)
              #(increment_zap(clear_zap(model), target.id, sats), [
                Publish(unsigned),
              ])
            }
          }
      }
  }
}

fn increment_zap(model: Model, note_id: String, sats: Int) -> Model {
  let clean_id = string.trim(note_id)
  case clean_id {
    "" -> model
    _ -> {
      let current = get_or_empty_stats(model.stats, clean_id)
      let next_stats =
        NoteStats(
          ..current,
          zaps: current.zaps + 1,
          zap_sats: current.zap_sats + sats,
        )
      Model(..model, stats: dict.insert(model.stats, clean_id, next_stats))
    }
  }
}

fn get_or_empty_stats(
  stats_map: dict.Dict(String, NoteStats),
  note_id: String,
) -> NoteStats {
  case dict.get(stats_map, note_id) {
    Ok(s) -> s
    Error(Nil) -> stats.empty_stats(note_id)
  }
}

fn synthetic_note_id(
  seq: Int,
  created_at: Int,
  pubkey_hex: String,
  content: String,
) -> String {
  let seed =
    "note_"
    <> int.to_string(seq)
    <> "_"
    <> int.to_string(created_at)
    <> "_"
    <> pubkey_hex
    <> "_"
    <> content
  let hex =
    string.lowercase(bit_array.base16_encode(bit_array.from_string(seed)))
  let padded = string.pad_end(hex, to: 64, with: "0")
  string.slice(padded, at_index: 0, length: 64)
}

fn extract_inline_hashtags(content: String) -> List(String) {
  string.split(content, " ")
  |> list.filter_map(fn(word) {
    let trimmed = string.trim(word)
    case string.starts_with(trimmed, "#") && string.length(trimmed) > 1 {
      True -> Ok(string.lowercase(string.drop_start(trimmed, 1)))
      False -> Error(Nil)
    }
  })
  |> list.unique
}

fn parse_tab(raw: String) -> FeedTab {
  case string.lowercase(string.trim(raw)) {
    "global" -> TabGlobal
    "replies" -> TabReplies
    _ -> TabFollowing
  }
}

fn extract_view(act: Action) -> Option(FeedView) {
  let view_name_opt = case extract_string(act, ["view"]) {
    Some(v) -> Some(v)
    None ->
      case act.navigate {
        Some(nav) -> nav.view
        None -> None
      }
  }

  case view_name_opt {
    Some(v) ->
      case string.lowercase(string.trim(v)) {
        "timeline" | "main" -> Some(ViewTimeline)
        "thread" ->
          case extract_string(act, ["id", "noteId", "note_id"]) {
            Some(id) if id != "" -> Some(ViewThread(id))
            _ -> None
          }
        "search" -> Some(ViewSearch)
        "settings" -> Some(ViewSettings)
        "widget" | "compact" -> Some(ViewWidget)
        _ -> None
      }
    None ->
      case act.navigate {
        Some(nav) ->
          case nav.back {
            Some(True) -> Some(ViewTimeline)
            _ -> None
          }
        None -> None
      }
  }
}

fn extract_string(act: Action, keys: List(String)) -> Option(String) {
  list.find_map(keys, fn(k) {
    case schema.payload_string(act, k) {
      Some(val) -> Ok(val)
      None -> Error(Nil)
    }
  })
  |> option.from_result
}

fn publish_note_effect(
  model: Model,
  raw: String,
) -> #(Model, List(Effect(Msg))) {
  let content = string.trim(raw)
  case content {
    "" -> #(model, [])
    _ -> #(Model(..model, composer_draft: ""), [
      Publish(UnsignedEvent(
        pubkey: None,
        created_at: model.now_sec + 1,
        kind: kind.Note,
        tags: [],
        content: content,
      )),
    ])
  }
}

fn publish_reply_effect(
  model: Model,
  parent_id: String,
) -> #(Model, List(Effect(Msg))) {
  let parent = string.trim(parent_id)
  let content = string.trim(model.reply_draft)
  case parent == "" || content == "" {
    True -> #(model, [])
    False ->
      case dict.get(model.notes, parent) {
        Error(Nil) -> #(model, [])
        Ok(parent_note) -> {
          let root = case parent_note.root_id {
            Some(r) -> r
            None -> parent_note.id
          }
          #(Model(..model, reply_draft: ""), [
            Publish(UnsignedEvent(
              pubkey: None,
              created_at: model.now_sec + 1,
              kind: kind.Note,
              tags: [
                ["e", root, "", "root"],
                ["e", parent_note.id, "", "reply"],
                ["p", parent_note.pubkey],
              ],
              content: content,
            )),
          ])
        }
      }
  }
}

fn reaction_effect(
  model: Model,
  note_id: String,
  reaction_kind: kind.Kind,
  content: String,
) -> List(Effect(Msg)) {
  let id = string.trim(note_id)
  case id {
    "" -> []
    _ -> {
      let author_tags = case dict.get(model.notes, id) {
        Ok(note) -> [["p", note.pubkey]]
        Error(Nil) -> []
      }
      [
        Publish(UnsignedEvent(
          pubkey: None,
          created_at: model.now_sec + 1,
          kind: reaction_kind,
          tags: [["e", id], ..author_tags],
          content: content,
        )),
      ]
    }
  }
}
