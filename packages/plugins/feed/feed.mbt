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
fn note_is_reply_to(n : Note, target_id : String) -> Bool {
  if n.reply_to_id == target_id {
    return true
  }
  for id in n.e_tags {
    if id == target_id {
      return true
    }
  }
  false
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
  mut pending_interaction_reqs : Array[String]
  queried_interactions : Array[String]
  mut oldest_timestamp : Int32
  mut is_loading_older : Bool
  mut my_pubkey : String
  mut view : String
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
  pending_interaction_reqs: [],
  queried_interactions: [],
  oldest_timestamp: 0,
  is_loading_older: false,
  my_pubkey: "",
  view: "main",
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
  // 1. Try finding parent in global_state.notes
  if n.reply_to_id != "" {
    for other in global_state.notes {
      if other.id == n.reply_to_id {
        if other.author_name != "" && other.author_name != "Nostr User" {
          let clean = clean_at_prefix(other.author_name)
          return "Reply to @" + clean
        }
        if other.npub != "" {
          return "Reply to " + truncate_npub(other.npub)
        }
      }
    }
  }

  // 2. Try reply_to_pubkey
  if n.reply_to_pubkey != "" {
    let known = find_profile_name(n.reply_to_pubkey)
    if known != "" && known != "Nostr User" {
      let clean = clean_at_prefix(known)
      return "Reply to @" + clean
    }
    if n.reply_to_pubkey.length() >= 16 {
      let npub = bech32_encode("npub", n.reply_to_pubkey)
      return "Reply to " + truncate_npub(npub)
    }
  }

  // 3. Fallback
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
fn request_missing_profiles() -> Unit {
  let count = global_state.pending_profile_reqs.length()
  if count == 0 {
    return
  }
  let limit = if count > 50 { 50 } else { count }
  let authors : Array[String] = []
  for i in 0..<limit {
    authors.push(global_state.pending_profile_reqs[i])
  }
  let filters : Json = [{ "kinds": [0], "authors": authors }]
  ignore(@nostr.subscribe(filters.stringify()))

  let remaining : Array[String] = []
  for i in limit..<count {
    remaining.push(global_state.pending_profile_reqs[i])
  }
  global_state.pending_profile_reqs = remaining
}

///|
fn request_missing_interactions() -> Unit {
  let count = global_state.pending_interaction_reqs.length()
  if count == 0 {
    return
  }
  let limit = if count > 30 { 30 } else { count }
  let event_ids : Array[String] = []
  for i in 0..<limit {
    event_ids.push(global_state.pending_interaction_reqs[i])
  }
  let filters : Json = [
    { "kinds": [1, 6, 7], "#e": event_ids, "limit": limit * 15 },
  ]
  ignore(@nostr.subscribe(filters.stringify()))

  let remaining : Array[String] = []
  for i in limit..<count {
    remaining.push(global_state.pending_interaction_reqs[i])
  }
  global_state.pending_interaction_reqs = remaining
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
    Some(p) => {
      let short_p_npub = truncate_npub(p.npub)
      let has_named_p = p.author_name != "" &&
        p.author_name != "Nostr User" &&
        p.author_name != p.npub &&
        p.author_name != short_p_npub
      let author_texts : Array[Json] = if has_named_p {
        [
          {
            "type": "text",
            "content": p.author_name,
            "variant": "caption",
            "tone": "primary",
          },
          {
            "type": "text",
            "content": short_p_npub,
            "variant": "caption",
            "tone": "muted",
          },
        ]
      } else {
        [
          {
            "type": "text",
            "content": short_p_npub,
            "variant": "caption",
            "tone": "primary",
          },
        ]
      }

      children.push({
        "type": "box",
        "direction": "row",
        "gap": "sm",
        "align": "center",
        "style": "cursor: pointer; margin-bottom: 8px;",
        "action": { "name": "view-profile", "payload": { "pubkey": p.pubkey } },
        "children": [
          {
            "type": "avatar",
            "pubkey": p.pubkey,
            "name": p.author_name,
            "size": "md",
            "action": {
              "name": "view-profile",
              "payload": { "pubkey": p.pubkey },
            },
          },
          { "type": "box", "direction": "column", "children": author_texts },
        ],
      })
      children.push({ "type": "text", "content": p.content, "variant": "body" })
      children.push({ "type": "divider" })
      children.push({
        "type": "box",
        "direction": "row",
        "gap": "sm",
        "children": [
          {
            "type": "input",
            "name": "replyText",
            "placeholder": "Write a reply...",
            "actionOnEnter": {
              "name": "publish-reply",
              "payload": { "replyToId": p.id },
            },
          },
          {
            "type": "button",
            "label": "Reply",
            "variant": "primary",
            "size": "sm",
            "action": {
              "name": "publish-reply",
              "payload": { "replyToId": p.id },
            },
          },
        ],
      })

      let mut reply_count = 0
      for n in state.notes {
        if n.id != p.id && note_is_reply_to(n, p.id) {
          reply_count = reply_count + 1
          let short_reply_npub = truncate_npub(n.npub)
          let reply_has_name = n.author_name != "" &&
            n.author_name != "Nostr User" &&
            n.author_name != n.npub &&
            n.author_name != short_reply_npub
          let reply_author_label = if reply_has_name {
            n.author_name
          } else {
            short_reply_npub
          }

          children.push({
            "type": "card",
            "key": "reply-" + n.id,
            "id": "reply-" + n.id,
            "style": "margin-top: 8px; margin-left: 12px;",
            "children": [
              {
                "type": "box",
                "direction": "row",
                "gap": "sm",
                "align": "center",
                "style": "cursor: pointer;",
                "action": {
                  "name": "view-profile",
                  "payload": { "pubkey": n.pubkey },
                },
                "children": [
                  {
                    "type": "avatar",
                    "pubkey": n.pubkey,
                    "name": n.author_name,
                    "size": "sm",
                    "action": {
                      "name": "view-profile",
                      "payload": { "pubkey": n.pubkey },
                    },
                  },
                  {
                    "type": "box",
                    "direction": "column",
                    "children": [
                      {
                        "type": "text",
                        "content": reply_author_label,
                        "variant": "body",
                        "tone": "primary",
                      },
                    ],
                  },
                ],
              },
              {
                "type": "text",
                "content": n.content,
                "variant": "body",
                "style": "margin-top: 6px;",
              },
            ],
          })
        }
      }

      if reply_count == 0 {
        let empty_msg = if !state.thread_replies_loaded && p.replies > 0 {
          "Fetching conversation replies from relays..."
        } else {
          "No replies yet. Be the first to reply!"
        }
        children.push({
          "type": "text",
          "content": empty_msg,
          "tone": "muted",
          "style": "margin-top: 14px; margin-left: 4px; font-style: italic;",
        })
      }
    }
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
fn render_note_card(n : Note) -> Json {
  let card_children : Array[Json] = []

  if n.reply_to_id != "" {
    let badge_label = get_reply_badge_label(n)
    card_children.push({
      "type": "box",
      "direction": "row",
      "align": "center",
      "gap": "xs",
      "style": "margin-bottom: 8px; cursor: pointer;",
      "action": { "name": "view-thread", "payload": { "id": n.reply_to_id } },
      "children": [{ "type": "badge", "label": badge_label, "tone": "accent" }],
    })
  }

  let short_npub = truncate_npub(n.npub)
  let has_named_author = n.author_name != "" &&
    n.author_name != "Nostr User" &&
    n.author_name != n.npub &&
    n.author_name != short_npub
  let author_texts : Array[Json] = if has_named_author {
    [
      {
        "type": "text",
        "content": n.author_name,
        "variant": "body",
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
    [
      {
        "type": "text",
        "content": short_npub,
        "variant": "body",
        "tone": "primary",
      },
    ]
  }

  card_children.push({
    "type": "box",
    "direction": "row",
    "gap": "sm",
    "align": "center",
    "style": "cursor: pointer;",
    "action": { "name": "view-profile", "payload": { "pubkey": n.pubkey } },
    "children": [
      {
        "type": "avatar",
        "pubkey": n.pubkey,
        "name": n.author_name,
        "size": "md",
        "action": { "name": "view-profile", "payload": { "pubkey": n.pubkey } },
      },
      { "type": "box", "direction": "column", "children": author_texts },
    ],
  })

  card_children.push({
    "type": "text",
    "content": n.content,
    "variant": "body",
    "style": "margin-top: 8px; margin-bottom: 8px; cursor: pointer;",
    "action": { "name": "view-thread", "payload": { "id": n.id } },
  })

  card_children.push({ "type": "divider" })

  let repost_variant = if n.reposted { "secondary" } else { "ghost" }
  let like_variant = if n.liked { "secondary" } else { "ghost" }

  card_children.push({
    "type": "box",
    "direction": "row",
    "justify": "between",
    "align": "center",
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
  })

  {
    "type": "card",
    "key": "note-" + n.id,
    "id": "note-" + n.id,
    "style": "margin-bottom: 8px;",
    "children": card_children,
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

  let children : Array[Json] = [
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

  let is_following = state.active_tab == "following"
  let has_follows = state.follows.length() > 0

  let displayed_notes : Array[Note] = []
  for n in state.notes {
    if !is_following {
      displayed_notes.push(n)
    } else if !has_follows {
      displayed_notes.push(n)
    } else {
      let mut is_followed = false
      if state.my_pubkey != "" && n.pubkey == state.my_pubkey {
        is_followed = true
      } else {
        for f in state.follows {
          if f == n.pubkey {
            is_followed = true
            break
          }
        }
      }
      if is_followed {
        displayed_notes.push(n)
      }
    }
  }

  if displayed_notes.length() == 0 {
    let (heading, subtext) = if is_following && has_follows {
      (
        "No notes from followed creators yet", "Follow creators in Profiles or switch to Global to view all network timeline notes.",
      )
    } else if is_following && !state.follows_loaded && state.my_pubkey != "" {
      (
        "Connecting to Nostr relays...", "Loading your followed creators and notes...",
      )
    } else if is_following && state.follows_loaded && !has_follows {
      (
        "No follows found", "Follow creators in Profiles or switch to Global to view all network timeline notes.",
      )
    } else {
      (
        "Connecting to Nostr relays...", "Notes will stream in as relays respond, or post a note above.",
      )
    }

    children.push({
      "type": "card",
      "style": "padding: 24px; text-align: center; margin-top: 8px;",
      "children": [
        {
          "type": "box",
          "direction": "column",
          "align": "center",
          "gap": "sm",
          "children": [
            {
              "type": "text",
              "content": heading,
              "variant": "subheading",
              "tone": "primary",
            },
            {
              "type": "text",
              "content": subtext,
              "variant": "body",
              "tone": "muted",
            },
          ],
        },
      ],
    })
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
  let parsed = parse_json(payload_str)
  let target_id = match parsed {
    Some(j) => json_get_string(j, "id")
    None => ""
  }
  if target_id != "" {
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
}

///|
fn handle_repost_note(payload_str : String) -> Unit {
  let parsed = parse_json(payload_str)
  let target_id = match parsed {
    Some(j) => json_get_string(j, "id")
    None => ""
  }
  if target_id != "" {
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
}

///|
fn handle_publish_note(payload_str : String) -> Unit {
  let parsed = parse_json(payload_str)
  let new_text = match parsed {
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
  if parent_id != "" {
    let parsed = parse_json(payload_str)
    let reply_text = match parsed {
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
}

///|
fn handle_set_view(payload_str : String) -> Unit {
  let parsed = parse_json(payload_str)
  let view_str = match parsed {
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
  if global_state.pending_interaction_reqs.length() > 0 {
    request_missing_interactions()
  }
  if global_state.pending_profile_reqs.length() > 0 {
    request_missing_profiles()
  }
  let updated_schema = render_feed(global_state)
  @ui.render(updated_schema)
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
    let mut exists = false
    for f in global_state.follows {
      if f == pk {
        exists = true
        break
      }
    }
    if !exists {
      global_state.follows.push(pk)
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
fn handle_kind_1(event : @json.Json) -> Unit {
  let id = json_get_string(event, "id")
  let pubkey = json_get_string(event, "pubkey")
  let content = json_get_string(event, "content")
  let created_at = json_get_int(event, "created_at")
  let e_tags = json_get_tags_by_type(event, "e")
  let p_tags = json_get_tags_by_type(event, "p")
  let q_tags = json_get_tags_by_type(event, "q")
  let mut reply_to = get_reply_id_from_tags(e_tags, q_tags)
  if reply_to == "" && e_tags.length() > 0 {
    let first_e = e_tags[0]
    let mut is_q = false
    for q in q_tags {
      if q == first_e {
        is_q = true
        break
      }
    }
    if !is_q {
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

  // Update reply counts for parent notes
  for target_id in e_tags {
    if target_id != id {
      for n in global_state.notes {
        if n.id == target_id {
          n.replies = n.replies + 1
          break
        }
      }
    }
  }

  if id != "" && content != "" {
    global_state.is_loading_older = false
    let mut exists = false
    for n in global_state.notes {
      if n.id == id {
        exists = true
        break
      }
    }

    // Only display if new and either root note or reply to active thread
    let mut is_thread_reply = false
    if global_state.active_thread_id != "" {
      if reply_to == global_state.active_thread_id {
        is_thread_reply = true
      } else {
        for target in e_tags {
          if target == global_state.active_thread_id {
            is_thread_reply = true
            break
          }
        }
      }
    }
    if is_thread_reply {
      global_state.thread_replies_loaded = true
    }

    let is_root = reply_to == ""
    let mut is_author_followed = false
    if global_state.my_pubkey != "" && pubkey == global_state.my_pubkey {
      is_author_followed = true
    } else {
      for f in global_state.follows {
        if f == pubkey {
          is_author_followed = true
          break
        }
      }
    }

    let has_follows = global_state.follows.length() > 0
    let should_display = !exists &&
      (
        is_root ||
        is_thread_reply ||
        is_author_followed ||
        !has_follows ||
        global_state.active_tab == "global"
      )

    if should_display {
      let known_name = find_profile_name(pubkey)
      let author_name = if known_name != "" {
        known_name
      } else if pubkey.length() >= 8 {
        pubkey[0:8].to_owned()
      } else {
        "Nostr User"
      }

      if known_name == "" && pubkey.length() >= 16 {
        let mut already_pending = false
        for pk in global_state.pending_profile_reqs {
          if pk == pubkey {
            already_pending = true
            break
          }
        }
        if !already_pending {
          global_state.pending_profile_reqs.push(pubkey)
        }
      }

      if reply_to_pubkey.length() >= 16 &&
        find_profile_name(reply_to_pubkey) == "" {
        let mut already_pending = false
        for pk in global_state.pending_profile_reqs {
          if pk == reply_to_pubkey {
            already_pending = true
            break
          }
        }
        if !already_pending {
          global_state.pending_profile_reqs.push(reply_to_pubkey)
        }
      }

      // Register for interaction count queries (replies, reposts, likes)
      let mut already_queried = false
      for q in global_state.queried_interactions {
        if q == id {
          already_queried = true
          break
        }
      }
      if !already_queried {
        global_state.queried_interactions.push(id)
        global_state.pending_interaction_reqs.push(id)
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
          let note_bech32 = bech32_encode("note", q_id)
          final_content = final_content + "\n\nnostr:" + note_bech32
        }
      }

      let note : Note = {
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
      }

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
        let _ = global_state.notes.pop()
      }
    }
  }
}

///|
fn handle_nostr_event(payload_str : String) -> Unit {
  let parsed = match parse_json(payload_str) {
    Some(j) => j
    None => return
  }
  let kind = json_get_int(parsed, "kind")
  match kind {
    0 => handle_kind_0(parsed)
    1 => handle_kind_1(parsed)
    3 => handle_kind_3(parsed)
    6 => handle_kind_6(parsed)
    7 => handle_kind_7(parsed)
    _ => ()
  }
  if global_state.pending_interaction_reqs.length() >= 20 {
    request_missing_interactions()
  }
  if global_state.pending_profile_reqs.length() >= 20 {
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

  let updated_schema = render_feed(global_state)
  @ui.render(updated_schema)
}

///|
pub fn start() -> Unit {
  let my_pk = @nostr.get_public_key()
  global_state.my_pubkey = my_pk
  let schema = render_feed(global_state)
  @ui.render(schema)
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
