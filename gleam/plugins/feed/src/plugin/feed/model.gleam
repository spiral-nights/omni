//// Pure state model and query helpers for the Omni Feed plugin (`plugin_feed`).
////
//// Built on `omni_social` (`Note`, `Profile`, `NoteStats`, `Follows`, `ThreadView`).

import gleam/dict.{type Dict}
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/order
import gleam/string
import omni/plugin_kit/route.{type Route}
import omni/social/follows.{type Follows}
import omni/social/note.{type Note}
import omni/social/profile.{type Profile}
import omni/social/stats.{type NoteStats}
import omni/social/thread.{type ThreadView}

/// Timeline filter tab selection.
pub type FeedTab {
  TabFollowing
  TabGlobal
  TabReplies
}

/// Active view mode for the Feed plugin.
pub type FeedView {
  ViewTimeline
  ViewThread(note_id: String)
  ViewSearch
  ViewSettings
  ViewWidget
}

/// User-configurable feed display settings.
pub type FeedSettings {
  FeedSettings(show_replies: Bool, show_inline_media: Bool, page_size: Int)
}

/// Complete immutable state for the Feed plugin.
pub type Model {
  Model(
    view: FeedView,
    active_tab: FeedTab,
    notes: Dict(String, Note),
    profiles: Dict(String, Profile),
    stats: Dict(String, NoteStats),
    follows: Follows,
    my_pubkey: Option(String),
    composer_draft: String,
    reply_draft: String,
    replying_to: Option(String),
    search_query: String,
    settings: FeedSettings,
    visible_limit: Int,
    now_sec: Int,
  )
}

/// Default feed settings (`show_replies: False`, `show_inline_media: True`, `page_size: 20`).
pub fn default_settings() -> FeedSettings {
  FeedSettings(show_replies: False, show_inline_media: True, page_size: 20)
}

/// Resolve a `FeedView` from a parsed URL `Route`.
pub fn view_from_route(r: Route) -> FeedView {
  case string.lowercase(string.trim(r.view)) {
    "thread" ->
      case route.get_param(r, "id") {
        Some(id) if id != "" -> ViewThread(note_id: id)
        _ ->
          case route.get_param(r, "eventId") {
            Some(eid) if eid != "" -> ViewThread(note_id: eid)
            _ -> ViewTimeline
          }
      }
    "search" -> ViewSearch
    "settings" -> ViewSettings
    "widget" | "compact" -> ViewWidget
    _ -> ViewTimeline
  }
}

/// Initialize the default `Model` for a given initial `Route`.
pub fn init(initial_route: Route) -> Model {
  let settings = default_settings()
  let initial_search = case route.get_param(initial_route, "q") {
    Some(q) -> q
    None -> ""
  }

  Model(
    view: view_from_route(initial_route),
    active_tab: TabFollowing,
    notes: dict.new(),
    profiles: dict.new(),
    stats: dict.new(),
    follows: follows.empty(""),
    my_pubkey: None,
    composer_draft: "",
    reply_draft: "",
    replying_to: None,
    search_query: initial_search,
    settings: settings,
    visible_limit: settings.page_size,
    now_sec: 1_700_000_000,
  )
}

/// Return all filtered timeline notes matching `model.active_tab` and `model.settings`
/// (prior to `visible_limit` slicing), sorted newest-first.
pub fn filtered_timeline_notes(model: Model) -> List(Note) {
  let all_sorted =
    dict.values(model.notes)
    |> sort_newest_first

  let tab_filtered = case model.active_tab {
    TabGlobal ->
      filter_by_reply_setting(all_sorted, model.settings.show_replies)
    TabReplies -> list.filter(all_sorted, note.is_reply)
    TabFollowing -> {
      let by_author =
        list.filter(all_sorted, fn(n) { is_followed_or_self(model, n.pubkey) })
      filter_by_reply_setting(by_author, model.settings.show_replies)
    }
  }

  tab_filtered
}

/// Return the currently visible slice of timeline notes (`list.take(..., model.visible_limit)`),
/// sorted newest-first.
pub fn visible_timeline_notes(model: Model) -> List(Note) {
  filtered_timeline_notes(model)
  |> list.take(model.visible_limit)
}

/// Return `True` if there are more timeline notes beyond `model.visible_limit`.
pub fn has_more_timeline_notes(model: Model) -> Bool {
  list.length(filtered_timeline_notes(model)) > model.visible_limit
}

/// Search notes by case-insensitive substring matching on note content, hashtags,
/// or author display name, sorted newest-first.
pub fn search_results(model: Model) -> List(Note) {
  let needle = string.lowercase(string.trim(model.search_query))
  let all_sorted =
    dict.values(model.notes)
    |> sort_newest_first

  case needle {
    "" -> list.take(all_sorted, model.visible_limit)
    _ ->
      list.filter(all_sorted, fn(n) {
        let content_match = string.contains(string.lowercase(n.content), needle)
        let tag_match =
          list.any(n.hashtags, fn(t) {
            string.contains(string.lowercase(t), needle)
          })
        let author_opt =
          dict.get(model.profiles, n.pubkey) |> option.from_result
        let author_name =
          string.lowercase(profile.best_display_name(author_opt, n.pubkey))
        let author_match = string.contains(author_name, needle)
        content_match || tag_match || author_match
      })
  }
}

/// Resolve the active `ThreadView` when `model.view` is `ViewThread(note_id)`,
/// or `None` if not in thread view or if the focal note is not found.
pub fn active_thread(model: Model) -> Option(ThreadView) {
  case model.view {
    ViewThread(note_id) ->
      thread.build_thread(note_id, dict.values(model.notes))
    _ -> None
  }
}

fn filter_by_reply_setting(
  notes: List(Note),
  show_replies: Bool,
) -> List(Note) {
  case show_replies {
    True -> notes
    False -> list.filter(notes, fn(n) { !note.is_reply(n) })
  }
}

fn is_followed_or_self(model: Model, author_pubkey: String) -> Bool {
  let has_any_follows = model.follows.followed_pubkeys != []
  let is_me = case model.my_pubkey {
    Some(me) ->
      string.lowercase(string.trim(me)) == string.lowercase(author_pubkey)
    None -> False
  }

  case has_any_follows, model.my_pubkey {
    False, None -> True
    False, Some(_) -> True
    True, _ -> is_me || follows.is_following(model.follows, author_pubkey)
  }
}

fn sort_newest_first(notes: List(Note)) -> List(Note) {
  list.sort(notes, fn(a, b) {
    case int.compare(b.created_at, a.created_at) {
      order.Eq -> string.compare(a.id, b.id)
      other -> other
    }
  })
}
