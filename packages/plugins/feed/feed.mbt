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
fn subscribe_to_follows(follows : Array[String]) -> Unit {
  if follows.length() == 0 && global_state.my_pubkey == "" {
    return
  }
  let buf = StringBuilder()
  buf.write_string("[{\"kinds\":[1],\"authors\":[")
  let limit = if follows.length() > 100 { 100 } else { follows.length() }
  let mut count = 0
  if global_state.my_pubkey != "" {
    buf.write_string("\"")
    buf.write_string(global_state.my_pubkey)
    buf.write_string("\"")
    count = 1
  }
  for i in 0..<limit {
    let f = follows[i]
    if f != global_state.my_pubkey {
      if count > 0 {
        buf.write_string(",")
      }
      buf.write_string("\"")
      buf.write_string(f)
      buf.write_string("\"")
      count = count + 1
    }
  }
  buf.write_string("],\"limit\":40}]")
  ignore(@nostr.subscribe(buf.to_string()))
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
    let buf = StringBuilder()
    for k in 1..<name.length() {
      buf.write_char(name[k].to_int().unsafe_to_char())
    }
    buf.to_string()
  } else {
    name
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
          if other.npub.length() > 14 {
            let buf = StringBuilder()
            buf.write_string("Reply to ")
            let max_k = if other.npub.length() > 10 {
              10
            } else {
              other.npub.length()
            }
            for k in 0..<max_k {
              buf.write_char(other.npub[k].to_int().unsafe_to_char())
            }
            buf.write_string("...")
            return buf.to_string()
          }
          return "Reply to " + other.npub
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
      let buf = StringBuilder()
      buf.write_string("Reply to ")
      let max_k = if npub.length() > 10 { 10 } else { npub.length() }
      for k in 0..<max_k {
        buf.write_char(npub[k].to_int().unsafe_to_char())
      }
      buf.write_string("...")
      return buf.to_string()
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
  let buf = StringBuilder()
  buf.write_string("[{\"kinds\":[0],\"authors\":[")
  for i in 0..<limit {
    if i > 0 {
      buf.write_string(",")
    }
    buf.write_string("\"")
    buf.write_string(global_state.pending_profile_reqs[i])
    buf.write_string("\"")
  }
  buf.write_string("]}]")
  ignore(@nostr.subscribe(buf.to_string()))

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
  let buf = StringBuilder()
  buf.write_string("[{\"kinds\":[1,6,7],\"#e\":[")
  for i in 0..<limit {
    if i > 0 {
      buf.write_string(",")
    }
    buf.write_string("\"")
    buf.write_string(global_state.pending_interaction_reqs[i])
    buf.write_string("\"")
  }
  buf.write_string("],\"limit\":")
  buf.write_string((limit * 15).to_string())
  buf.write_string("}]")
  ignore(@nostr.subscribe(buf.to_string()))

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
    let buf = StringBuilder()
    for i in 0..<30 {
      buf.write_char(latest[i].to_int().unsafe_to_char())
    }
    buf.write_string("...")
    buf.to_string()
  } else {
    latest
  }
  let subtext = json_escape(preview)
  let buf = StringBuilder()
  buf.write_string(
    "{\"type\":\"metric\",\"label\":\"Timeline Notes\",\"value\":\"",
  )
  buf.write_string(count.to_string())
  buf.write_string(" notes\",\"subtext\":\"")
  buf.write_string(subtext)
  buf.write_string("\"}")
  buf.to_string()
}

///|
fn render_widget_view(state : FeedState) -> String {
  let buf = StringBuilder()
  buf.write_string(
    "{\"type\":\"card\",\"title\":\"Recent Notes\",\"icon\":\"message\",\"children\":[",
  )

  // Quick Post Input
  buf.write_string(
    "{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"sm\",\"children\":[",
  )
  buf.write_string(
    "{\"type\":\"input\",\"name\":\"noteText\",\"placeholder\":\"Quick note...\",\"actionOnEnter\":{\"name\":\"publish-note\"}},",
  )
  buf.write_string(
    "{\"type\":\"button\",\"label\":\"Post\",\"variant\":\"primary\",\"size\":\"sm\",\"action\":{\"name\":\"publish-note\"}}",
  )
  buf.write_string("]},")

  // Recent List Items
  buf.write_string("{\"type\":\"list\",\"items\":[")
  if state.notes.length() == 0 {
    buf.write_string(
      "{\"type\":\"list-item\",\"id\":\"empty\",\"title\":\"Connecting to relays...\",\"subtitle\":\"Notes will stream in from relays\"}",
    )
  } else {
    let limit = if state.notes.length() < 3 { state.notes.length() } else { 3 }
    for i in 0..<limit {
      if i > 0 {
        buf.write_string(",")
      }
      let n = state.notes[i]
      buf.write_string("{\"type\":\"list-item\",\"id\":\"")
      buf.write_string(n.id)
      buf.write_string("\",\"title\":\"")
      buf.write_string(json_escape(n.author_name))
      buf.write_string("\",\"subtitle\":\"")
      buf.write_string(json_escape(n.content))
      buf.write_string(
        "\",\"actions\":[{\"type\":\"icon-button\",\"icon\":\"heart\",\"variant\":\"",
      )
      if n.liked {
        buf.write_string("secondary")
      } else {
        buf.write_string("ghost")
      }
      buf.write_string(
        "\",\"action\":{\"name\":\"like-note\",\"payload\":{\"id\":\"",
      )
      buf.write_string(n.id)
      buf.write_string("\"}}}]}")
    }
  }
  buf.write_string("]}")

  buf.write_string("]}")
  buf.to_string()
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

  let buf = StringBuilder()
  buf.write_string(
    "{\"type\":\"card\",\"title\":\"Conversation Thread\",\"icon\":\"reply\",",
  )
  buf.write_string("\"page\":{\"id\":\"thread-")
  buf.write_string(target_id)
  buf.write_string(
    "\",\"title\":\"Conversation Thread\",\"url\":\"?view=thread&id=",
  )
  buf.write_string(target_id)
  buf.write_string("\",\"state\":{\"view\":\"thread\",\"id\":\"")
  buf.write_string(target_id)
  buf.write_string("\"}},\"children\":[")

  // Back to Feed Button
  buf.write_string(
    "{\"type\":\"button\",\"label\":\"Back to Feed\",\"icon\":\"arrow-left\",\"variant\":\"ghost\",\"size\":\"sm\",\"action\":{\"name\":\"back-to-feed\",\"navigate\":{\"back\":true}}},",
  )
  buf.write_string("{\"type\":\"divider\"},")

  match parent_note {
    Some(p) => {
      // Parent Note Details
      buf.write_string(
        "{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"sm\",\"align\":\"center\",\"style\":\"cursor: pointer; margin-bottom: 8px;\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"",
      )
      buf.write_string(p.pubkey)
      buf.write_string("\"}},\"children\":[")
      buf.write_string("{\"type\":\"avatar\",\"pubkey\":\"")
      buf.write_string(p.pubkey)
      buf.write_string("\",\"name\":\"")
      buf.write_string(json_escape(p.author_name))
      buf.write_string(
        "\",\"size\":\"md\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"",
      )
      buf.write_string(p.pubkey)
      buf.write_string("\"}}},")
      buf.write_string(
        "{\"type\":\"box\",\"direction\":\"column\",\"children\":[",
      )

      let short_p_npub = if p.npub.length() > 14 {
        let sbuf = StringBuilder()
        let max_k = if p.npub.length() > 10 { 10 } else { p.npub.length() }
        for k in 0..<max_k {
          sbuf.write_char(p.npub[k].to_int().unsafe_to_char())
        }
        sbuf.write_string("...")
        sbuf.to_string()
      } else {
        p.npub
      }
      let has_named_p = p.author_name != "" &&
        p.author_name != "Nostr User" &&
        p.author_name != p.npub &&
        p.author_name != short_p_npub
      if has_named_p {
        buf.write_string("{\"type\":\"text\",\"content\":\"")
        buf.write_string(json_escape(p.author_name))
        buf.write_string("\",\"variant\":\"caption\",\"tone\":\"primary\"},")
        buf.write_string("{\"type\":\"text\",\"content\":\"")
        buf.write_string(short_p_npub)
        buf.write_string("\",\"variant\":\"caption\",\"tone\":\"muted\"}")
      } else {
        buf.write_string("{\"type\":\"text\",\"content\":\"")
        buf.write_string(short_p_npub)
        buf.write_string("\",\"variant\":\"caption\",\"tone\":\"primary\"}")
      }
      buf.write_string("]}")
      buf.write_string("]},")
      buf.write_string("{\"type\":\"text\",\"content\":\"")
      buf.write_string(json_escape(p.content))
      buf.write_string("\",\"variant\":\"body\"},")
      buf.write_string("{\"type\":\"divider\"},")

      // Reply Input
      buf.write_string(
        "{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"sm\",\"children\":[",
      )
      buf.write_string(
        "{\"type\":\"input\",\"name\":\"replyText\",\"placeholder\":\"Write a reply...\",\"actionOnEnter\":{\"name\":\"publish-reply\",\"payload\":{\"replyToId\":\"",
      )
      buf.write_string(p.id)
      buf.write_string("\"}}},")
      buf.write_string(
        "{\"type\":\"button\",\"label\":\"Reply\",\"variant\":\"primary\",\"size\":\"sm\",\"action\":{\"name\":\"publish-reply\",\"payload\":{\"replyToId\":\"",
      )
      buf.write_string(p.id)
      buf.write_string("\"}}}")
      buf.write_string("]}")

      // Replies to this note
      let mut reply_count = 0
      for n in state.notes {
        if n.id != p.id && note_is_reply_to(n, p.id) {
          reply_count = reply_count + 1
          buf.write_string(",")
          buf.write_string("{\"type\":\"card\",\"key\":\"reply-")
          buf.write_string(n.id)
          buf.write_string("\",\"id\":\"reply-")
          buf.write_string(n.id)
          buf.write_string(
            "\",\"style\":\"margin-top: 8px; margin-left: 12px;\",\"children\":[",
          )
          buf.write_string(
            "{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"sm\",\"align\":\"center\",\"style\":\"cursor: pointer;\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"",
          )
          buf.write_string(n.pubkey)
          buf.write_string("\"}},\"children\":[")
          buf.write_string("{\"type\":\"avatar\",\"pubkey\":\"")
          buf.write_string(n.pubkey)
          buf.write_string("\",\"name\":\"")
          buf.write_string(json_escape(n.author_name))
          buf.write_string(
            "\",\"size\":\"sm\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"",
          )
          buf.write_string(n.pubkey)
          buf.write_string("\"}}},")
          buf.write_string(
            "{\"type\":\"box\",\"direction\":\"column\",\"children\":[",
          )

          let short_reply_npub = if n.npub.length() > 14 {
            let sbuf = StringBuilder()
            let max_k = if n.npub.length() > 10 { 10 } else { n.npub.length() }
            for k in 0..<max_k {
              sbuf.write_char(n.npub[k].to_int().unsafe_to_char())
            }
            sbuf.write_string("...")
            sbuf.to_string()
          } else {
            n.npub
          }
          let reply_has_name = n.author_name != "" &&
            n.author_name != "Nostr User" &&
            n.author_name != n.npub &&
            n.author_name != short_reply_npub
          if reply_has_name {
            buf.write_string("{\"type\":\"text\",\"content\":\"")
            buf.write_string(json_escape(n.author_name))
            buf.write_string("\",\"variant\":\"body\",\"tone\":\"primary\"}")
          } else {
            buf.write_string("{\"type\":\"text\",\"content\":\"")
            buf.write_string(short_reply_npub)
            buf.write_string("\",\"variant\":\"body\",\"tone\":\"primary\"}")
          }
          buf.write_string("]}")
          buf.write_string("]},")
          buf.write_string("{\"type\":\"text\",\"content\":\"")
          buf.write_string(json_escape(n.content))
          buf.write_string(
            "\",\"variant\":\"body\",\"style\":\"margin-top: 6px;\"}",
          )
          buf.write_string("]}")
        }
      }
      if reply_count == 0 {
        buf.write_string(",")
        if !state.thread_replies_loaded && p.replies > 0 {
          buf.write_string(
            "{\"type\":\"text\",\"content\":\"Fetching conversation replies from relays...\",\"tone\":\"muted\",\"style\":\"margin-top: 14px; margin-left: 4px; font-style: italic;\"}",
          )
        } else {
          buf.write_string(
            "{\"type\":\"text\",\"content\":\"No replies yet. Be the first to reply!\",\"tone\":\"muted\",\"style\":\"margin-top: 14px; margin-left: 4px; font-style: italic;\"}",
          )
        }
      }
    }
    None =>
      buf.write_string(
        "{\"type\":\"text\",\"content\":\"Note not found or deleted.\",\"tone\":\"muted\"}",
      )
  }

  buf.write_string("]}")
  buf.to_string()
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

  let buf = StringBuilder()
  buf.write_string(
    "{\"type\":\"card\",\"title\":\"Timeline Notes\",\"icon\":\"feed\",\"page\":{\"id\":\"timeline\",\"title\":\"Timeline Notes\",\"url\":\"\",\"state\":null},\"children\":[",
  )

  // Top Bar: Navigation Tabs (Following, Global)
  buf.write_string(
    "{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"xs\",\"children\":[",
  )
  buf.write_string(
    "{\"type\":\"button\",\"label\":\"Following\",\"variant\":\"",
  )
  if state.active_tab == "following" {
    buf.write_string("primary")
  } else {
    buf.write_string("ghost")
  }
  buf.write_string(
    "\",\"size\":\"sm\",\"action\":{\"name\":\"set-tab\",\"payload\":{\"tab\":\"following\"}}},",
  )
  buf.write_string("{\"type\":\"button\",\"label\":\"Global\",\"variant\":\"")
  if state.active_tab == "global" {
    buf.write_string("primary")
  } else {
    buf.write_string("ghost")
  }
  buf.write_string(
    "\",\"size\":\"sm\",\"action\":{\"name\":\"set-tab\",\"payload\":{\"tab\":\"global\"}}}",
  )
  buf.write_string("]},")

  // Composer Box
  buf.write_string(
    "{\"type\":\"box\",\"direction\":\"column\",\"gap\":\"sm\",\"style\":\"margin-top: 10px; margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;\",\"children\":[",
  )
  buf.write_string(
    "{\"type\":\"input\",\"name\":\"composerText\",\"placeholder\":\"What's on your mind? Broadcast to Nostr...\",\"actionOnEnter\":{\"name\":\"publish-note\"}},",
  )
  buf.write_string(
    "{\"type\":\"box\",\"direction\":\"row\",\"justify\":\"end\",\"children\":[",
  )
  buf.write_string(
    "{\"type\":\"button\",\"label\":\"Publish Note\",\"variant\":\"primary\",\"size\":\"sm\",\"icon\":\"send\",\"action\":{\"name\":\"publish-note\"}}",
  )
  buf.write_string("]}")
  buf.write_string("]},")

  let is_following = state.active_tab == "following"
  let has_follows = state.follows.length() > 0

  // Filter notes when Following tab is active and follows list is present
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

  // Notes List
  if displayed_notes.length() == 0 {
    buf.write_string(
      "{\"type\":\"card\",\"style\":\"padding: 24px; text-align: center; margin-top: 8px;\",\"children\":[",
    )
    buf.write_string(
      "{\"type\":\"box\",\"direction\":\"column\",\"align\":\"center\",\"gap\":\"sm\",\"children\":[",
    )
    if is_following && has_follows {
      buf.write_string(
        "{\"type\":\"text\",\"content\":\"No notes from followed creators yet\",\"variant\":\"subheading\",\"tone\":\"primary\"},",
      )
      buf.write_string(
        "{\"type\":\"text\",\"content\":\"Follow creators in Profiles or switch to Global to view all network timeline notes.\",\"variant\":\"body\",\"tone\":\"muted\"}",
      )
    } else if is_following && !state.follows_loaded && state.my_pubkey != "" {
      buf.write_string(
        "{\"type\":\"text\",\"content\":\"Connecting to Nostr relays...\",\"variant\":\"subheading\",\"tone\":\"primary\"},",
      )
      buf.write_string(
        "{\"type\":\"text\",\"content\":\"Loading your followed creators and notes...\",\"variant\":\"body\",\"tone\":\"muted\"}",
      )
    } else if is_following && state.follows_loaded && !has_follows {
      buf.write_string(
        "{\"type\":\"text\",\"content\":\"No follows found\",\"variant\":\"subheading\",\"tone\":\"primary\"},",
      )
      buf.write_string(
        "{\"type\":\"text\",\"content\":\"Follow creators in Profiles or switch to Global to view all network timeline notes.\",\"variant\":\"body\",\"tone\":\"muted\"}",
      )
    } else {
      buf.write_string(
        "{\"type\":\"text\",\"content\":\"Connecting to Nostr relays...\",\"variant\":\"subheading\",\"tone\":\"primary\"},",
      )
      buf.write_string(
        "{\"type\":\"text\",\"content\":\"Notes will stream in as relays respond, or post a note above.\",\"variant\":\"body\",\"tone\":\"muted\"}",
      )
    }
    buf.write_string("]}")
    buf.write_string("]}")
  } else {
    for i in 0..<displayed_notes.length() {
      if i > 0 {
        buf.write_string(",")
      }
      let n = displayed_notes[i]
      buf.write_string("{\"type\":\"card\",\"key\":\"note-")
      buf.write_string(n.id)
      buf.write_string("\",\"id\":\"note-")
      buf.write_string(n.id)
      buf.write_string("\",\"style\":\"margin-bottom: 8px;\",\"children\":[")

      if n.reply_to_id != "" {
        let badge_label = get_reply_badge_label(n)
        buf.write_string(
          "{\"type\":\"box\",\"direction\":\"row\",\"align\":\"center\",\"gap\":\"xs\",\"style\":\"margin-bottom: 8px; cursor: pointer;\",\"action\":{\"name\":\"view-thread\",\"payload\":{\"id\":\"",
        )
        buf.write_string(n.reply_to_id)
        buf.write_string("\"}},\"children\":[")
        buf.write_string("{\"type\":\"badge\",\"label\":\"")
        buf.write_string(json_escape(badge_label))
        buf.write_string("\",\"tone\":\"accent\"}")
        buf.write_string("]},")
      }

      // Header Row: Avatar, Name, npub (clickable to open profile)
      buf.write_string(
        "{\"type\":\"box\",\"direction\":\"row\",\"gap\":\"sm\",\"align\":\"center\",\"style\":\"cursor: pointer;\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"",
      )
      buf.write_string(n.pubkey)
      buf.write_string("\"}},\"children\":[")
      buf.write_string("{\"type\":\"avatar\",\"pubkey\":\"")
      buf.write_string(n.pubkey)
      buf.write_string("\",\"name\":\"")
      buf.write_string(json_escape(n.author_name))
      buf.write_string(
        "\",\"size\":\"md\",\"action\":{\"name\":\"view-profile\",\"payload\":{\"pubkey\":\"",
      )
      buf.write_string(n.pubkey)
      buf.write_string("\"}}},")
      buf.write_string(
        "{\"type\":\"box\",\"direction\":\"column\",\"children\":[",
      )

      let short_npub = if n.npub.length() > 14 {
        let sbuf = StringBuilder()
        let max_k = if n.npub.length() > 10 { 10 } else { n.npub.length() }
        for k in 0..<max_k {
          sbuf.write_char(n.npub[k].to_int().unsafe_to_char())
        }
        sbuf.write_string("...")
        sbuf.to_string()
      } else {
        n.npub
      }

      let has_named_author = n.author_name != "" &&
        n.author_name != "Nostr User" &&
        n.author_name != n.npub &&
        n.author_name != short_npub
      if has_named_author {
        buf.write_string("{\"type\":\"text\",\"content\":\"")
        buf.write_string(json_escape(n.author_name))
        buf.write_string("\",\"variant\":\"body\",\"tone\":\"primary\"},")
        buf.write_string("{\"type\":\"text\",\"content\":\"")
        buf.write_string(short_npub)
        buf.write_string("\",\"variant\":\"caption\",\"tone\":\"muted\"}")
      } else {
        buf.write_string("{\"type\":\"text\",\"content\":\"")
        buf.write_string(short_npub)
        buf.write_string("\",\"variant\":\"body\",\"tone\":\"primary\"}")
      }
      buf.write_string("]}")
      buf.write_string("]},")

      // Note Body
      buf.write_string("{\"type\":\"text\",\"content\":\"")
      buf.write_string(json_escape(n.content))
      buf.write_string(
        "\",\"variant\":\"body\",\"style\":\"margin-top: 8px; margin-bottom: 8px; cursor: pointer;\",\"action\":{\"name\":\"view-thread\",\"payload\":{\"id\":\"",
      )
      buf.write_string(n.id)
      buf.write_string("\"}}},")

      // Divider
      buf.write_string("{\"type\":\"divider\"},")

      // Action Row (Reply, Repost, Like, Zap)
      buf.write_string(
        "{\"type\":\"box\",\"direction\":\"row\",\"justify\":\"between\",\"align\":\"center\",\"children\":[",
      )

      // Reply Button
      buf.write_string("{\"type\":\"button\",\"icon\":\"reply\",\"label\":\"")
      buf.write_string(n.replies.to_string())
      buf.write_string(
        "\",\"tooltip\":\"Reply\",\"title\":\"Reply\",\"variant\":\"ghost\",\"size\":\"sm\",\"action\":{\"name\":\"view-thread\",\"payload\":{\"id\":\"",
      )
      buf.write_string(n.id)
      buf.write_string("\"}}},")

      // Repost Button
      buf.write_string("{\"type\":\"button\",\"icon\":\"repeat\",\"label\":\"")
      buf.write_string(n.reposts.to_string())
      buf.write_string(
        "\",\"tooltip\":\"Repost\",\"title\":\"Repost\",\"variant\":\"",
      )
      if n.reposted {
        buf.write_string("secondary")
      } else {
        buf.write_string("ghost")
      }
      buf.write_string(
        "\",\"size\":\"sm\",\"action\":{\"name\":\"repost-note\",\"payload\":{\"id\":\"",
      )
      buf.write_string(n.id)
      buf.write_string("\"}}},")

      // Like Button
      buf.write_string("{\"type\":\"button\",\"icon\":\"heart\",\"label\":\"")
      buf.write_string(n.likes.to_string())
      buf.write_string(
        "\",\"tooltip\":\"Like\",\"title\":\"Like\",\"variant\":\"",
      )
      if n.liked {
        buf.write_string("secondary")
      } else {
        buf.write_string("ghost")
      }
      buf.write_string(
        "\",\"size\":\"sm\",\"action\":{\"name\":\"like-note\",\"payload\":{\"id\":\"",
      )
      buf.write_string(n.id)
      buf.write_string("\"}}},")

      // Zap Button
      buf.write_string(
        "{\"type\":\"button\",\"icon\":\"zap\",\"label\":\"0\",\"tooltip\":\"Zap\",\"title\":\"Zap\",\"variant\":\"ghost\",\"size\":\"sm\",\"action\":{\"name\":\"zap-note\",\"payload\":{\"id\":\"",
      )
      buf.write_string(n.id)
      buf.write_string("\"}}}")

      buf.write_string("]}")
      buf.write_string("]}")
    }

    // Load More Button / Sentinel for infinite scroll
    buf.write_string(",")
    buf.write_string(
      "{\"type\":\"box\",\"direction\":\"row\",\"justify\":\"center\",\"style\":\"margin-top: 14px; margin-bottom: 20px;\",\"children\":[",
    )
    buf.write_string("{\"type\":\"button\",\"label\":\"")
    if state.is_loading_older {
      buf.write_string("Loading older notes...")
    } else {
      buf.write_string("Load More Notes")
    }
    buf.write_string(
      "\",\"variant\":\"secondary\",\"size\":\"md\",\"icon\":\"arrow-down\",\"action\":{\"name\":\"load-more\"}}",
    )
    buf.write_string("]}")
  }

  buf.write_string("]}")
  buf.to_string()
}

///|
fn handle_set_tab(payload_str : String) -> Unit {
  global_state.oldest_timestamp = 0
  global_state.is_loading_older = false
  if payload_str.contains("\"global\"") {
    global_state.active_tab = "global"
    global_state.follows_subscribed = false
    ignore(@nostr.subscribe("[{\"kinds\":[1],\"limit\":40}]"))
  } else {
    global_state.active_tab = "following"
    if global_state.follows.length() > 0 {
      global_state.follows_subscribed = true
      subscribe_to_follows(global_state.follows)
    } else if global_state.my_pubkey != "" {
      ignore(
        @nostr.subscribe(
          "[{\"kinds\":[3],\"authors\":[\"" +
          global_state.my_pubkey +
          "\"],\"limit\":1}]",
        ),
      )
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
      let buf = StringBuilder()
      buf.write_string("[{\"kinds\":[1],\"authors\":[")
      let limit = if global_state.follows.length() > 100 {
        100
      } else {
        global_state.follows.length()
      }
      let mut count = 0
      if global_state.my_pubkey != "" {
        buf.write_string("\"")
        buf.write_string(global_state.my_pubkey)
        buf.write_string("\"")
        count = 1
      }
      for i in 0..<limit {
        let f = global_state.follows[i]
        if f != global_state.my_pubkey {
          if count > 0 {
            buf.write_string(",")
          }
          buf.write_string("\"")
          buf.write_string(f)
          buf.write_string("\"")
          count = count + 1
        }
      }
      buf.write_string("],\"until\":")
      buf.write_string(until_ts.to_string())
      buf.write_string(",\"limit\":20}]")
      ignore(@nostr.subscribe(buf.to_string()))
    } else {
      let buf = StringBuilder()
      buf.write_string("[{\"kinds\":[1],\"until\":")
      buf.write_string(until_ts.to_string())
      buf.write_string(",\"limit\":20}]")
      ignore(@nostr.subscribe(buf.to_string()))
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
    let buf = StringBuilder()
    buf.write_string("[{\"kinds\":[1],\"#e\":[\"")
    buf.write_string(target_id)
    buf.write_string("\"],\"limit\":50},{\"kinds\":[1],\"ids\":[\"")
    buf.write_string(target_id)
    buf.write_string("\"],\"limit\":1}]")
    ignore(@nostr.subscribe(buf.to_string()))
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
          let draft_json = "{\"kind\":7,\"content\":\"+\",\"tags\":[[\"e\",\"" +
            target_id +
            "\"]]}"
          ignore(@nostr.publish(draft_json))
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
          let draft_json = "{\"kind\":6,\"content\":\"\",\"tags\":[[\"e\",\"" +
            target_id +
            "\"]]}"
          ignore(@nostr.publish(draft_json))
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
    let draft_json = "{\"kind\":1,\"content\":\"" +
      json_escape(new_text) +
      "\",\"tags\":[]}"
    ignore(@nostr.publish(draft_json))
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
      let draft_json = "{\"kind\":1,\"content\":\"" +
        json_escape(reply_text) +
        "\",\"tags\":[[\"e\",\"" +
        parent_id +
        "\",\"\",\"reply\"]]}"
      ignore(@nostr.publish(draft_json))
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
    ignore(
      @nostr.subscribe(
        "[{\"kinds\":[1],\"limit\":40},{\"kinds\":[3],\"authors\":[\"" +
        my_pk +
        "\"],\"limit\":1}]",
      ),
    )
  } else {
    ignore(
      @nostr.subscribe(
        "[{\"kinds\":[1],\"limit\":40},{\"kinds\":[3],\"limit\":1}]",
      ),
    )
  }
}
