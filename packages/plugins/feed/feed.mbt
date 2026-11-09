///|
pub struct Note {
  id : String
  pubkey : String
  mut author_name : String
  npub : String
  content : String
  created_at : Int32
  mut liked : Bool
  mut reposted : Bool
  mut likes : Int32
  mut reposts : Int32
  mut replies : Int32
  reply_to_id : String
  reply_to_pubkey : String
  e_tags : Array[String]
}

///|
pub struct UserProfile {
  pubkey : String
  mut name : String
}

///|
pub struct FeedState {
  mut active_tab : String
  mut active_thread_id : String
  mut thread_replies_loaded : Bool
  notes : Array[Note]
  follows : Array[String]
  mut follows_loaded : Bool
  mut follows_subscribed : Bool
  profiles : Array[UserProfile]
  mut pending_profile_reqs : Array[String]
  queried_profiles : Array[String]
  mut pending_interaction_reqs : Array[String]
  queried_interactions : Array[String]
  mut oldest_timestamp : Int32
  mut is_loading_older : Bool
  mut is_syncing : Bool
  mut my_pubkey : String
  mut view : String
  mut is_fetching_interactions : Bool
  mut is_fetching_profiles : Bool
}

///|
let global_state : FeedState = {
  active_tab: "following",
  active_thread_id: "",
  thread_replies_loaded: false,
  notes: [],
  follows: [],
  follows_loaded: false,
  follows_subscribed: false,
  profiles: [],
  pending_profile_reqs: [],
  queried_profiles: [],
  pending_interaction_reqs: [],
  queried_interactions: [],
  oldest_timestamp: 0,
  is_loading_older: false,
  is_syncing: true,
  my_pubkey: "",
  view: "main",
  is_fetching_interactions: false,
  is_fetching_profiles: false,
}

///|
fn array_contains(arr : Array[String], target : String) -> Bool {
  for item in arr {
    if item == target {
      return true
    }
  }
  false
}

///|
fn push_unique(arr : Array[String], val : String) -> Bool {
  if !array_contains(arr, val) {
    arr.push(val)
    true
  } else {
    false
  }
}

///|
fn note_is_reply_to(n : Note, target_id : String) -> Bool {
  n.reply_to_id == target_id || array_contains(n.e_tags, target_id)
}

///|
fn build_follows_authors(follows : Array[String]) -> Array[String] {
  let authors : Array[String] = []
  let limit = if follows.length() > 100 { 100 } else { follows.length() }
  if global_state.my_pubkey != "" {
    authors.push(global_state.my_pubkey)
  }
  for i in 0..<limit {
    let f = follows[i]
    if f != global_state.my_pubkey {
      authors.push(f)
    }
  }
  authors
}

///|
fn subscribe_to_follows(follows : Array[String]) -> Unit {
  if follows.length() == 0 && global_state.my_pubkey == "" {
    return
  }
  global_state.is_syncing = true
  let authors = build_follows_authors(follows)
  let filters : Json = [{ "kinds": [1], "authors": authors, "limit": 40 }]
  ignore(@nostr.subscribe(filters.stringify()))
}

///|
fn find_profile_name(pubkey : String) -> String {
  for p in global_state.profiles {
    if p.pubkey == pubkey {
      return p.name
    }
  }
  ""
}

///|
fn clean_at_prefix(name : String) -> String {
  if name.length() > 0 && name[0] == '@' {
    name[1:name.length()].to_owned()
  } else {
    name
  }
}

///|
fn truncate_npub(npub : String) -> String {
  if npub.length() > 14 {
    let max_k = if npub.length() > 10 { 10 } else { npub.length() }
    npub[0:max_k].to_owned() + "..."
  } else {
    npub
  }
}

///|
fn get_reply_badge_label(n : Note) -> String {
  if n.reply_to_id != "" {
    for other in global_state.notes {
      if other.id == n.reply_to_id {
        if other.author_name != "" && other.author_name != "Nostr User" {
          return "Reply to @" + clean_at_prefix(other.author_name)
        }
        if other.npub != "" {
          return "Reply to " + truncate_npub(other.npub)
        }
      }
    }
  }
  if n.reply_to_pubkey != "" {
    let known = find_profile_name(n.reply_to_pubkey)
    if known != "" && known != "Nostr User" {
      return "Reply to @" + clean_at_prefix(known)
    }
    if n.reply_to_pubkey.length() >= 16 {
      let npub = bech32_encode("npub", n.reply_to_pubkey)
      return "Reply to " + truncate_npub(npub)
    }
  }
  "Reply to thread"
}

///|
fn set_profile_name(pubkey : String, name : String) -> Unit {
  if pubkey == "" || name == "" {
    return
  }
  let mut found = false
  for p in global_state.profiles {
    if p.pubkey == pubkey {
      p.name = name
      found = true
      break
    }
  }
  if !found {
    global_state.profiles.push({ pubkey, name, })
  }
  for n in global_state.notes {
    if n.pubkey == pubkey {
      n.author_name = name
    }
  }
}

///|
fn take_batch(
  queue : Array[String],
  max_count : Int32,
) -> (Array[String], Array[String]) {
  let count = queue.length()
  let limit = if count > max_count { max_count } else { count }
  let batch : Array[String] = []
  for i in 0..<limit {
    batch.push(queue[i])
  }
  let remaining : Array[String] = []
  for i in limit..<count {
    remaining.push(queue[i])
  }
  (batch, remaining)
}

///|
fn request_missing_profiles() -> Unit {
  if global_state.pending_profile_reqs.length() == 0 {
    global_state.is_fetching_profiles = false
    return
  }
  global_state.is_fetching_profiles = true
  let (authors, remaining) = take_batch(global_state.pending_profile_reqs, 50)
  global_state.pending_profile_reqs = remaining
  let filters : Json = [
    { "kinds": [0], "authors": authors, "limit": authors.length() },
  ]
  ignore(@nostr.subscribe(filters.stringify()))
}

///|
fn request_missing_interactions() -> Unit {
  if global_state.pending_interaction_reqs.length() == 0 {
    global_state.is_fetching_interactions = false
    return
  }
  global_state.is_fetching_interactions = true
  let (event_ids, _) = take_batch(global_state.pending_interaction_reqs, 20)
  global_state.pending_interaction_reqs = []
  let filters : Json = [
    { "kinds": [6, 7], "#e": event_ids, "limit": event_ids.length() * 3 },
  ]
  ignore(@nostr.subscribe(filters.stringify()))
}

///|
fn render_author_header(
  pubkey : String,
  author_name : String,
  npub : String,
  avatar_size : String,
  primary_variant : String,
  show_secondary_npub : Bool,
  extra_style : String,
  source_note : Note?,
) -> Json {
  let short_npub = truncate_npub(npub)
  let has_named = author_name != "" &&
    author_name != "Nostr User" &&
    author_name != npub &&
    author_name != short_npub
  let author_texts : Array[Json] = if has_named && show_secondary_npub {
    [
      {
        "type": "text",
        "content": author_name,
        "variant": primary_variant,
        "tone": "primary",
      },
      {
        "type": "text",
        "content": short_npub,
        "variant": "caption",
        "tone": "muted",
      },
    ]
  } else {
    let label = if has_named { author_name } else { short_npub }
    [
      {
        "type": "text",
        "content": label,
        "variant": primary_variant,
        "tone": "primary",
      },
    ]
  }

  let profile_payload : Json = match source_note {
    Some(n) =>
      {
        "pubkey": pubkey,
        "initialNote": {
          "id": n.id,
          "pubkey": n.pubkey,
          "content": n.content,
          "created_at": n.created_at,
          "author_name": n.author_name,
          "npub": n.npub,
        },
      }
    None => { "pubkey": pubkey }
  }
  let profile_action : Json = {
    "name": "view-profile",
    "payload": profile_payload,
  }
  {
    "type": "box",
    "direction": "row",
    "gap": "sm",
    "align": "center",
    "style": "cursor: pointer;" + extra_style,
    "action": profile_action,
    "children": [
      {
        "type": "avatar",
        "pubkey": pubkey,
        "name": author_name,
        "size": avatar_size,
        "action": profile_action,
      },
      {
        "type": "box",
        "direction": "row",
        "gap": "xs",
        "align": "baseline",
        "children": author_texts,
      },
    ],
  }
}

///|
fn render_compact_view(state : FeedState) -> String {
  let count = state.notes.length()
  let latest = if count > 0 {
    state.notes[0].content
  } else {
    "Connecting to relays..."
  }
  let preview = if latest.length() > 30 {
    latest[0:30].to_owned() + "..."
  } else {
    latest
  }
  let schema : Json = {
    "type": "metric",
    "label": "Timeline Notes",
    "value": count.to_string() + " notes",
    "subtext": preview,
  }
  schema.stringify()
}

///|
fn render_widget_view(state : FeedState) -> String {
  let items : Array[Json] = []
  if state.notes.length() == 0 {
    items.push({
      "type": "list-item",
      "id": "empty",
      "title": "Connecting to relays...",
      "subtitle": "Notes will stream in from relays",
    })
  } else {
    let limit = if state.notes.length() < 3 { state.notes.length() } else { 3 }
    for i in 0..<limit {
      let n = state.notes[i]
      let variant = if n.liked { "secondary" } else { "ghost" }
      items.push({
        "type": "list-item",
        "id": n.id,
        "title": n.author_name,
        "subtitle": n.content,
        "actions": [
          {
            "type": "icon-button",
            "icon": "heart",
            "variant": variant,
            "action": { "name": "like-note", "payload": { "id": n.id } },
          },
        ],
      })
    }
  }

  let schema : Json = {
    "type": "card",
    "title": "Recent Notes",
    "icon": "message",
    "children": [
      {
        "type": "box",
        "direction": "row",
        "gap": "sm",
        "children": [
          {
            "type": "input",
            "name": "noteText",
            "placeholder": "Quick note...",
            "actionOnEnter": { "name": "publish-note" },
          },
          {
            "type": "button",
            "label": "Post",
            "variant": "primary",
            "size": "sm",
            "action": { "name": "publish-note" },
          },
        ],
      },
      { "type": "list", "items": items },
    ],
  }
  schema.stringify()
}

///|
fn render_thread_reply_card(n : Note) -> Json {
  {
    "type": "card",
    "key": "reply-" + n.id,
    "id": "reply-" + n.id,
    "style": "margin-top: 8px; margin-left: 12px;",
    "children": [
      render_author_header(
        n.pubkey,
        n.author_name,
        n.npub,
        "sm",
        "body",
        false,
        "",
        Some(n),
      ),
      {
        "type": "text",
        "content": n.content,
        "variant": "body",
        "style": "margin-top: 6px;",
      },
    ],
  }
}

///|
fn append_thread_parent_and_replies(
  children : Array[Json],
  state : FeedState,
  p : Note,
) -> Unit {
  children.push(
    render_author_header(
      p.pubkey,
      p.author_name,
      p.npub,
      "md",
      "caption",
      true,
      " margin-bottom: 8px;",
      Some(p),
    ),
  )
  children.push({ "type": "text", "content": p.content, "variant": "body" })
  children.push({ "type": "divider" })

  let reply_action : Json = {
    "name": "publish-reply",
    "payload": { "replyToId": p.id },
  }
  children.push({
    "type": "box",
    "direction": "row",
    "gap": "sm",
    "children": [
      {
        "type": "input",
        "name": "replyText",
        "placeholder": "Write a reply...",
        "actionOnEnter": reply_action,
      },
      {
        "type": "button",
        "label": "Reply",
        "variant": "primary",
        "size": "sm",
        "action": reply_action,
      },
    ],
  })

  let mut reply_count = 0
  for n in state.notes {
    if n.id != p.id && note_is_reply_to(n, p.id) {
      reply_count = reply_count + 1
      children.push(render_thread_reply_card(n))
    }
  }

  if reply_count == 0 {
    if !state.thread_replies_loaded && p.replies > 0 {
      children.push({
        "type": "box",
        "direction": "row",
        "align": "center",
        "gap": "sm",
        "style": "margin-top: 14px; margin-left: 4px;",
        "children": [
          { "type": "icon", "name": "spinner", "size": 16 },
          {
            "type": "text",
            "content": "Fetching conversation replies from relays...",
            "tone": "muted",
            "style": "font-style: italic;",
          },
        ],
      })
    } else {
      children.push({
        "type": "text",
        "content": "No replies yet. Be the first to reply!",
        "tone": "muted",
        "style": "margin-top: 14px; margin-left: 4px; font-style: italic;",
      })
    }
  }
}

///|
fn render_thread_view(state : FeedState) -> String {
  let target_id = state.active_thread_id
  let mut parent_note : Note? = None
  for n in state.notes {
    if n.id == target_id {
      parent_note = Some(n)
      break
    }
  }

  let children : Array[Json] = [
    {
      "type": "button",
      "label": "Back to Feed",
      "icon": "arrow-left",
      "variant": "ghost",
      "size": "sm",
      "action": { "name": "back-to-feed", "navigate": { "back": true } },
    },
    { "type": "divider" },
  ]

  match parent_note {
    Some(p) => append_thread_parent_and_replies(children, state, p)
    None =>
      children.push({
        "type": "text",
        "content": "Note not found or deleted.",
        "tone": "muted",
      })
  }

  let schema : Json = {
    "type": "card",
    "title": "Conversation Thread",
    "icon": "reply",
    "page": {
      "id": "thread-" + target_id,
      "title": "Conversation Thread",
      "url": "?view=thread&id=" + target_id,
      "state": { "view": "thread", "id": target_id },
    },
    "children": children,
  }
  schema.stringify()
}

///|
fn render_note_actions(n : Note) -> Json {
  let repost_variant = if n.reposted { "secondary" } else { "ghost" }
  let like_variant = if n.liked { "secondary" } else { "ghost" }
  {
    "type": "box",
    "direction": "row",
    "justify": "between",
    "align": "center",
    "style": "margin-top: 2px; max-width: 320px;",
    "children": [
      {
        "type": "button",
        "icon": "reply",
        "label": n.replies.to_string(),
        "tooltip": "Reply",
        "title": "Reply",
        "variant": "ghost",
        "size": "sm",
        "action": { "name": "view-thread", "payload": { "id": n.id } },
      },
      {
        "type": "button",
        "icon": "repeat",
        "label": n.reposts.to_string(),
        "tooltip": "Repost",
        "title": "Repost",
        "variant": repost_variant,
        "size": "sm",
        "action": { "name": "repost-note", "payload": { "id": n.id } },
      },
      {
        "type": "button",
        "icon": "heart",
        "label": n.likes.to_string(),
        "tooltip": "Like",
        "title": "Like",
        "variant": like_variant,
        "size": "sm",
        "action": { "name": "like-note", "payload": { "id": n.id } },
      },
      {
        "type": "button",
        "icon": "zap",
        "label": "0",
        "tooltip": "Zap",
        "title": "Zap",
        "variant": "ghost",
        "size": "sm",
        "action": { "name": "zap-note", "payload": { "id": n.id } },
      },
    ],
  }
}

///|
fn render_note_card(n : Note) -> Json {
  let card_children : Array[Json] = []
  if n.reply_to_id != "" {
    card_children.push({
      "type": "box",
      "direction": "row",
      "align": "center",
      "gap": "xs",
      "style": "margin-bottom: 4px; cursor: pointer;",
      "action": { "name": "view-thread", "payload": { "id": n.reply_to_id } },
      "children": [
        { "type": "badge", "label": get_reply_badge_label(n), "tone": "accent" },
      ],
    })
  }

  card_children.push(
    render_author_header(
      n.pubkey,
      n.author_name,
      n.npub,
      "sm",
      "body",
      true,
      "",
      Some(n),
    ),
  )
  card_children.push({
    "type": "text",
    "content": n.content,
    "variant": "body",
    "style": "margin-top: 3px; margin-bottom: 4px; cursor: pointer;",
    "action": { "name": "view-thread", "payload": { "id": n.id } },
  })
  card_children.push(render_note_actions(n))

  {
    "type": "card",
    "key": "note-" + n.id,
    "id": "note-" + n.id,
    "style": "padding: 9px 12px; margin-bottom: 5px;",
    "children": card_children,
  }
}

///|
fn render_feed_tabs_and_composer(state : FeedState) -> Array[Json] {
  let following_variant = if state.active_tab == "following" {
    "primary"
  } else {
    "ghost"
  }
  let global_variant = if state.active_tab == "global" {
    "primary"
  } else {
    "ghost"
  }
  let bar_items : Array[Json] = [
    {
      "type": "box",
      "direction": "row",
      "gap": "xs",
      "children": [
        {
          "type": "button",
          "label": "Following",
          "variant": following_variant,
          "size": "sm",
          "action": { "name": "set-tab", "payload": { "tab": "following" } },
        },
        {
          "type": "button",
          "label": "Global",
          "variant": global_variant,
          "size": "sm",
          "action": { "name": "set-tab", "payload": { "tab": "global" } },
        },
      ],
    },
  ]
  if state.is_syncing || state.is_loading_older {
    bar_items.push({
      "type": "status-indicator",
      "status": "connecting",
      "label": "Syncing relays...",
      "pulse": true,
    })
  }
  [
    {
      "type": "box",
      "direction": "row",
      "justify": "between",
      "align": "center",
      "children": bar_items,
    },
    {
      "type": "box",
      "direction": "column",
      "gap": "sm",
      "style": "margin-top: 10px; margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;",
      "children": [
        {
          "type": "input",
          "name": "composerText",
          "placeholder": "What's on your mind? Broadcast to Nostr...",
          "actionOnEnter": { "name": "publish-note" },
        },
        {
          "type": "box",
          "direction": "row",
          "justify": "end",
          "children": [
            {
              "type": "button",
              "label": "Publish Note",
              "variant": "primary",
              "size": "sm",
              "icon": "send",
              "action": { "name": "publish-note" },
            },
          ],
        },
      ],
    },
  ]
}

///|
fn is_author_in_follows(state : FeedState, pubkey : String) -> Bool {
  (state.my_pubkey != "" && pubkey == state.my_pubkey) ||
  array_contains(state.follows, pubkey)
}

///|
fn filter_displayed_notes(state : FeedState) -> Array[Note] {
  let is_following = state.active_tab == "following"
  let has_follows = state.follows.length() > 0
  let displayed : Array[Note] = []
  for n in state.notes {
    if !is_following || !has_follows || is_author_in_follows(state, n.pubkey) {
      displayed.push(n)
    }
  }
  displayed
}

///|
fn render_empty_feed_card(state : FeedState) -> Json {
  let is_following = state.active_tab == "following"
  let has_follows = state.follows.length() > 0
  let (heading, subtext, is_loading) = if is_following && has_follows {
    (
      "No notes from followed creators yet",
      "Follow creators in Profiles or switch to Global to view all network timeline notes.",
      state.is_syncing,
    )
  } else if is_following && !state.follows_loaded && state.my_pubkey != "" {
    (
      "Connecting to Nostr relays...", "Loading your followed creators and notes...",
      true,
    )
  } else if is_following && state.follows_loaded && !has_follows {
    (
      "No follows found", "Follow creators in Profiles or switch to Global to view all network timeline notes.",
      false,
    )
  } else {
    (
      "Connecting to Nostr relays...", "Notes will stream in as relays respond, or post a note above.",
      true,
    )
  }

  let box_children : Array[Json] = []
  if is_loading {
    box_children.push({ "type": "icon", "name": "spinner", "size": 24 })
  }
  box_children.push({
    "type": "text",
    "content": heading,
    "variant": "subheading",
    "tone": "primary",
  })
  box_children.push({
    "type": "text",
    "content": subtext,
    "variant": "body",
    "tone": "muted",
  })

  {
    "type": "card",
    "style": "padding: 24px; text-align: center; margin-top: 8px;",
    "children": [
      {
        "type": "box",
        "direction": "column",
        "align": "center",
        "gap": "sm",
        "children": box_children,
      },
    ],
  }
}

///|
pub fn render_feed(state : FeedState) -> String {
  if state.view == "compact" {
    return render_compact_view(state)
  }
  if state.view == "widget" {
    return render_widget_view(state)
  }
  if state.active_thread_id != "" {
    return render_thread_view(state)
  }

  let children = render_feed_tabs_and_composer(state)
  let displayed_notes = filter_displayed_notes(state)

  if displayed_notes.length() == 0 {
    children.push(render_empty_feed_card(state))
  } else {
    for n in displayed_notes {
      children.push(render_note_card(n))
    }
    let load_more_label = if state.is_loading_older {
      "Loading older notes..."
    } else {
      "Load More Notes"
    }
    children.push({
      "type": "box",
      "direction": "row",
      "justify": "center",
      "style": "margin-top: 14px; margin-bottom: 20px;",
      "children": [
        {
          "type": "button",
          "label": load_more_label,
          "variant": "secondary",
          "size": "md",
          "icon": "arrow-down",
          "loading": state.is_loading_older,
          "action": { "name": "load-more" },
        },
      ],
    })
  }

  let schema : Json = {
    "type": "card",
    "title": "Timeline Notes",
    "icon": "feed",
    "page": {
      "id": "timeline",
      "title": "Timeline Notes",
      "url": "",
      "state": null,
    },
    "children": children,
  }
  schema.stringify()
}

///|
fn handle_set_tab(payload_str : String) -> Unit {
  global_state.oldest_timestamp = 0
  global_state.is_loading_older = false
  global_state.is_syncing = true
  let parsed = parse_json(payload_str)
  let tab = match parsed {
    Some(j) => json_get_string(j, "tab")
    None => ""
  }
  if tab == "global" || payload_str.contains("\"global\"") {
    global_state.active_tab = "global"
    global_state.follows_subscribed = false
    let filters : Json = [{ "kinds": [1], "limit": 40 }]
    ignore(@nostr.subscribe(filters.stringify()))
  } else {
    global_state.active_tab = "following"
    if global_state.follows.length() > 0 {
      global_state.follows_subscribed = true
      subscribe_to_follows(global_state.follows)
    } else if global_state.my_pubkey != "" {
      let filters : Json = [
        { "kinds": [3], "authors": [global_state.my_pubkey], "limit": 1 },
      ]
      ignore(@nostr.subscribe(filters.stringify()))
    }
  }
}

///|
fn handle_load_more() -> Unit {
  if !global_state.is_loading_older && global_state.oldest_timestamp > 0 {
    global_state.is_loading_older = true
    let until_ts = global_state.oldest_timestamp - 1
    if global_state.active_tab == "following" &&
      global_state.follows.length() > 0 {
      let authors = build_follows_authors(global_state.follows)
      let filters : Json = [
        { "kinds": [1], "authors": authors, "until": until_ts, "limit": 20 },
      ]
      ignore(@nostr.subscribe(filters.stringify()))
    } else {
      let filters : Json = [{ "kinds": [1], "until": until_ts, "limit": 20 }]
      ignore(@nostr.subscribe(filters.stringify()))
    }
  }
}

///|
fn handle_view_thread(payload_str : String) -> Unit {
  let parsed = parse_json(payload_str)
  let mut target_id = match parsed {
    Some(j) => {
      let id = json_get_string(j, "id")
      if id != "" {
        id
      } else {
        json_get_string(j, "eventId")
      }
    }
    None => ""
  }
  if target_id == "" {
    for n in global_state.notes {
      if payload_str.contains(n.id) {
        target_id = n.id
        break
      }
    }
  }
  if target_id != "" {
    global_state.active_thread_id = target_id
    global_state.thread_replies_loaded = false
    let filters : Json = [
      { "kinds": [1], "#e": [target_id], "limit": 50 },
      { "kinds": [1], "ids": [target_id], "limit": 1 },
    ]
    ignore(@nostr.subscribe(filters.stringify()))
  }
}

///|
fn handle_back_to_feed() -> Unit {
  global_state.active_thread_id = ""
}

///|
fn handle_like_note(payload_str : String) -> Unit {
  let target_id = match parse_json(payload_str) {
    Some(j) => json_get_string(j, "id")
    None => ""
  }
  if target_id == "" {
    return
  }
  for n in global_state.notes {
    if n.id == target_id {
      n.liked = !n.liked
      if n.liked {
        n.likes = n.likes + 1
        let draft : Json = {
          "kind": 7,
          "content": "+",
          "tags": [["e", target_id]],
        }
        ignore(@nostr.publish(draft.stringify()))
      } else {
        n.likes = n.likes - 1
      }
      break
    }
  }
}

///|
fn handle_repost_note(payload_str : String) -> Unit {
  let target_id = match parse_json(payload_str) {
    Some(j) => json_get_string(j, "id")
    None => ""
  }
  if target_id == "" {
    return
  }
  for n in global_state.notes {
    if n.id == target_id {
      n.reposted = !n.reposted
      if n.reposted {
        n.reposts = n.reposts + 1
        let draft : Json = {
          "kind": 6,
          "content": "",
          "tags": [["e", target_id]],
        }
        ignore(@nostr.publish(draft.stringify()))
      } else {
        n.reposts = n.reposts - 1
      }
      break
    }
  }
}

///|
fn handle_publish_note(payload_str : String) -> Unit {
  let new_text = match parse_json(payload_str) {
    Some(j) => {
      let t = json_get_string(j, "noteText")
      if t != "" {
        t
      } else {
        json_get_string(j, "composerText")
      }
    }
    None => ""
  }
  if new_text != "" {
    let draft : Json = { "kind": 1, "content": new_text, "tags": [] }
    ignore(@nostr.publish(draft.stringify()))
  }
}

///|
fn handle_publish_reply(payload_str : String) -> Unit {
  let parent_id = global_state.active_thread_id
  if parent_id == "" {
    return
  }
  let reply_text = match parse_json(payload_str) {
    Some(j) => json_get_string(j, "replyText")
    None => ""
  }
  if reply_text != "" {
    let draft : Json = {
      "kind": 1,
      "content": reply_text,
      "tags": [["e", parent_id, "", "reply"]],
    }
    ignore(@nostr.publish(draft.stringify()))
  }
}

///|
fn handle_set_view(payload_str : String) -> Unit {
  let view_str = match parse_json(payload_str) {
    Some(j) => json_get_string(j, "view")
    None => ""
  }
  if view_str == "widget" || payload_str.contains("\"widget\"") {
    global_state.view = "widget"
  } else if view_str == "compact" || payload_str.contains("\"compact\"") {
    global_state.view = "compact"
  } else {
    global_state.view = "main"
  }
}

///|
fn handle_nostr_eose() -> Unit {
  global_state.thread_replies_loaded = true
  global_state.is_syncing = false
  global_state.is_loading_older = false
  global_state.is_fetching_interactions = false
  global_state.pending_interaction_reqs = []
  if global_state.pending_profile_reqs.length() > 0 {
    request_missing_profiles()
  } else {
    global_state.is_fetching_profiles = false
  }
  @ui.render(render_feed(global_state))
}

///|
fn handle_kind_0(event : @json.Json) -> Unit {
  let pubkey = json_get_string(event, "pubkey")
  let content = json_get_string(event, "content")
  if pubkey != "" && content != "" {
    let name = extract_profile_name(content)
    if name != "" {
      set_profile_name(pubkey, name)
    }
  }
}

///|
fn handle_kind_3(event : @json.Json) -> Unit {
  let p_tags = json_get_tags_by_type(event, "p")
  let mut new_follows = false
  for pk in p_tags {
    if push_unique(global_state.follows, pk) {
      new_follows = true
    }
  }
  global_state.follows_loaded = true
  if new_follows &&
    !global_state.follows_subscribed &&
    global_state.follows.length() > 0 &&
    global_state.active_tab == "following" {
    global_state.follows_subscribed = true
    subscribe_to_follows(global_state.follows)
  }
}

///|
fn handle_kind_6(event : @json.Json) -> Unit {
  let e_tags = json_get_tags_by_type(event, "e")
  let pubkey = json_get_string(event, "pubkey")
  for target_id in e_tags {
    for n in global_state.notes {
      if n.id == target_id {
        n.reposts = n.reposts + 1
        if pubkey != "" && pubkey == global_state.my_pubkey {
          n.reposted = true
        }
        break
      }
    }
  }
}

///|
fn handle_kind_7(event : @json.Json) -> Unit {
  let e_tags = json_get_tags_by_type(event, "e")
  let pubkey = json_get_string(event, "pubkey")
  for target_id in e_tags {
    for n in global_state.notes {
      if n.id == target_id {
        n.likes = n.likes + 1
        if pubkey != "" && pubkey == global_state.my_pubkey {
          n.liked = true
        }
        break
      }
    }
  }
}

///|
fn resolve_reply_metadata(
  event : @json.Json,
  e_tags : Array[String],
  p_tags : Array[String],
  q_tags : Array[String],
) -> (String, String) {
  let mut reply_to = get_reply_id_from_tags(e_tags, q_tags)
  if reply_to == "" && e_tags.length() > 0 {
    let first_e = e_tags[0]
    if !array_contains(q_tags, first_e) {
      reply_to = first_e
    }
  }
  if reply_to == "" {
    reply_to = json_get_string(event, "replyToId")
  }
  let mut reply_to_pubkey = if p_tags.length() > 0 { p_tags[0] } else { "" }
  if reply_to_pubkey == "" && reply_to != "" {
    for other in global_state.notes {
      if other.id == reply_to {
        reply_to_pubkey = other.pubkey
        break
      }
    }
  }
  (reply_to, reply_to_pubkey)
}

///|
fn increment_parent_reply_counts(
  note_id : String,
  e_tags : Array[String],
) -> Unit {
  for target_id in e_tags {
    if target_id != note_id {
      for n in global_state.notes {
        if n.id == target_id {
          n.replies = n.replies + 1
          break
        }
      }
    }
  }
}

///|
fn enqueue_note_queries(
  id : String,
  pubkey : String,
  reply_to_pubkey : String,
  is_root : Bool,
) -> Unit {
  if pubkey.length() >= 16 &&
    find_profile_name(pubkey) == "" &&
    push_unique(global_state.queried_profiles, pubkey) {
    ignore(push_unique(global_state.pending_profile_reqs, pubkey))
  }
  if reply_to_pubkey.length() >= 16 &&
    find_profile_name(reply_to_pubkey) == "" &&
    push_unique(global_state.queried_profiles, reply_to_pubkey) {
    ignore(push_unique(global_state.pending_profile_reqs, reply_to_pubkey))
  }
  if is_root && push_unique(global_state.queried_interactions, id) {
    global_state.pending_interaction_reqs.push(id)
  }
}

///|
fn insert_note_sorted(note : Note) -> Unit {
  let mut inserted = false
  for i in 0..<global_state.notes.length() {
    if note.created_at >= global_state.notes[i].created_at {
      global_state.notes.insert(i, note)
      inserted = true
      break
    }
  }
  if !inserted {
    global_state.notes.push(note)
  }
  if global_state.notes.length() > 250 {
    ignore(global_state.notes.pop())
  }
}

///|
fn handle_kind_1(event : @json.Json) -> Unit {
  let id = json_get_string(event, "id")
  let pubkey = json_get_string(event, "pubkey")
  let content = json_get_string(event, "content")
  let created_at = json_get_int(event, "created_at")
  let e_tags = json_get_tags_by_type(event, "e")
  let p_tags = json_get_tags_by_type(event, "p")
  let q_tags = json_get_tags_by_type(event, "q")
  let (reply_to, reply_to_pubkey) = resolve_reply_metadata(
    event, e_tags, p_tags, q_tags,
  )
  increment_parent_reply_counts(id, e_tags)

  if id == "" || content == "" {
    return
  }
  global_state.is_loading_older = false
  for n in global_state.notes {
    if n.id == id {
      return
    }
  }

  let is_thread_reply = global_state.active_thread_id != "" &&
    (
      reply_to == global_state.active_thread_id ||
      array_contains(e_tags, global_state.active_thread_id)
    )
  if is_thread_reply {
    global_state.thread_replies_loaded = true
  }

  let should_display = reply_to == "" ||
    is_thread_reply ||
    is_author_in_follows(global_state, pubkey) ||
    global_state.follows.length() == 0 ||
    global_state.active_tab == "global"
  if !should_display {
    return
  }

  let known_name = find_profile_name(pubkey)
  let author_name = if known_name != "" {
    known_name
  } else if pubkey.length() >= 8 {
    pubkey[0:8].to_owned()
  } else {
    "Nostr User"
  }
  let is_root = reply_to == ""
  if is_root || is_thread_reply {
    enqueue_note_queries(id, pubkey, reply_to_pubkey, is_root)
  }

  let note_ts = if created_at > 0 { created_at } else { 1730000000 }
  if (
      note_ts < global_state.oldest_timestamp ||
      global_state.oldest_timestamp == 0
    ) &&
    reply_to == "" {
    global_state.oldest_timestamp = note_ts
  }

  let mut final_content = content
  if q_tags.length() > 0 {
    let q_id = q_tags[0]
    if !final_content.contains(q_id) &&
      !final_content.contains("nostr:note1") &&
      !final_content.contains("nostr:nevent1") {
      final_content = final_content + "\n\nnostr:" + bech32_encode("note", q_id)
    }
  }

  insert_note_sorted({
    id,
    pubkey,
    author_name,
    npub: if pubkey.length() >= 16 {
      bech32_encode("npub", pubkey)
    } else {
      "npub1..."
    },
    content: final_content,
    created_at: note_ts,
    liked: false,
    reposted: false,
    likes: 0,
    reposts: 0,
    replies: 0,
    reply_to_id: reply_to,
    reply_to_pubkey,
    e_tags,
  })
}

///|
fn handle_nostr_event(payload_str : String) -> Unit {
  let parsed = match parse_json(payload_str) {
    Some(j) => j
    None => return
  }
  match json_get_int(parsed, "kind") {
    0 => handle_kind_0(parsed)
    1 => handle_kind_1(parsed)
    3 => handle_kind_3(parsed)
    6 => handle_kind_6(parsed)
    7 => handle_kind_7(parsed)
    _ => ()
  }
  if !global_state.is_fetching_interactions &&
    global_state.pending_interaction_reqs.length() >= 10 {
    request_missing_interactions()
  }
  if !global_state.is_fetching_profiles &&
    global_state.pending_profile_reqs.length() > 0 {
    request_missing_profiles()
  }
}

///|
pub fn handle_action_impl(action_name : String, payload_str : String) -> Unit {
  match action_name {
    "view-profile" | "view_profile" => return
    "set-tab" => handle_set_tab(payload_str)
    "load-more" => handle_load_more()
    "view-thread" => handle_view_thread(payload_str)
    "back-to-feed" | "back" => handle_back_to_feed()
    "like-note" => handle_like_note(payload_str)
    "repost-note" => handle_repost_note(payload_str)
    "publish-note" => handle_publish_note(payload_str)
    "publish-reply" => handle_publish_reply(payload_str)
    "set-view" => handle_set_view(payload_str)
    "zap-note" => ()
    "nostr:eose" => {
      handle_nostr_eose()
      return
    }
    "nostr:event" => handle_nostr_event(payload_str)
    _ => ()
  }
  @ui.render(render_feed(global_state))
}

///|
pub fn start() -> Unit {
  let my_pk = @nostr.get_public_key()
  global_state.my_pubkey = my_pk
  global_state.is_syncing = true
  @ui.render(render_feed(global_state))
  if my_pk != "" {
    let filters : Json = [
      { "kinds": [1], "limit": 40 },
      { "kinds": [3], "authors": [my_pk], "limit": 1 },
    ]
    ignore(@nostr.subscribe(filters.stringify()))
  } else {
    let filters : Json = [
      { "kinds": [1], "limit": 40 },
      { "kinds": [3], "limit": 1 },
    ]
    ignore(@nostr.subscribe(filters.stringify()))
  }
}
