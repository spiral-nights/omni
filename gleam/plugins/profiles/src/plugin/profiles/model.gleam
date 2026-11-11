//// Pure state model, directory filtering, and persistence config for `plugin_profiles`.
////
//// Built on `omni_social` (`Profile`, `Follows`, `Note`, `profile_cache`).

import gleam/dict.{type Dict}
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/order
import gleam/string
import omni/nostr/event.{type Event}
import omni/nostr/kind
import omni/nostr/nip19
import omni/nostr/pubkey
import omni/plugin_kit/local_store.{type StoreConfig}
import omni/plugin_kit/route.{type Route}
import omni/social/follows.{type Follows}
import omni/social/note.{type Note, Note}
import omni/social/profile.{type Profile, Profile}
import omni/social/profile_cache

/// Default local identity used by the seeded in-memory profile directory.
pub const my_pubkey_hex =
  "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"

/// Pubkey of the second seeded person in the directory.
pub const bob_pubkey_hex =
  "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"

/// Pubkey of the third seeded person in the directory.
pub const carol_pubkey_hex =
  "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"

/// Active view mode for the Profiles plugin.
pub type ProfilesView {
  ViewDirectory
  ViewProfile(pubkey: String)
  ViewMetadata
  ViewKeys
}

/// Availability of the standard NIP-07 signer.
pub type SignerStatus {
  SignerReady
  SignerLocked
  SignerMissing
}

/// Editable Kind 0 metadata draft.
pub type MetadataDraft {
  MetadataDraft(name: String, about: String, picture: String)
}

/// Complete immutable state for the Profiles plugin.
pub type Model {
  Model(
    view: ProfilesView,
    profiles: Dict(String, Profile),
    notes: Dict(String, Note),
    follows: Follows,
    my_pubkey: Option(String),
    selected_pubkey: Option(String),
    search_query: String,
    metadata_draft: MetadataDraft,
    metadata_dirty: Bool,
    signer_status: SignerStatus,
    now_sec: Int,
  )
}

/// Resolve a `ProfilesView` from a parsed URL `Route`.
pub fn view_from_route(r: Route) -> ProfilesView {
  case string.lowercase(string.trim(r.view)) {
    "profile" ->
      case route_param(r, ["id", "pubkey", "npub"]) {
        Some(pk) -> ViewProfile(pk)
        None -> ViewDirectory
      }
    "metadata" | "edit" | "editor" -> ViewMetadata
    "keys" | "key-custody" | "custody" | "signer" -> ViewKeys
    _ -> ViewDirectory
  }
}

/// Initialize the default `Model` for a given initial `Route`.
pub fn init(initial_route: Route) -> Model {
  let view = view_from_route(initial_route)
  let profiles = seed_profiles()
  let my_pubkey = Some(my_pubkey_hex)
  let selected_pubkey = case view {
    ViewProfile(pk) -> Some(pk)
    _ -> None
  }
  let draft_target = case selected_pubkey {
    Some(pk) -> Some(pk)
    None -> my_pubkey
  }

  Model(
    view: view,
    profiles: profiles,
    notes: seed_notes(),
    follows: follows.empty(my_pubkey_hex),
    my_pubkey: my_pubkey,
    selected_pubkey: selected_pubkey,
    search_query: "",
    metadata_draft: draft_for(profiles, draft_target),
    metadata_dirty: False,
    signer_status: SignerLocked,
    now_sec: 1_700_000_000,
  )
}

fn route_param(r: Route, keys: List(String)) -> Option(String) {
  list.find_map(keys, fn(key) {
    case route.get_param(r, key) {
      Some(value) ->
        case string.trim(value) {
          "" -> Error(Nil)
          _ -> Ok(value)
        }
      None -> Error(Nil)
    }
  })
  |> option.from_result
}

/// Deterministic seeded profile directory used for in-memory rendering.
pub fn seed_profiles() -> Dict(String, Profile) {
  let people = [
    Profile(
      pubkey: my_pubkey_hex,
      name: Some("Alice"),
      display_name: Some("Alice"),
      about: Some("Building calm, local-first social software on Nostr."),
      picture: Some("https://example.com/avatars/alice.png"),
      banner: None,
      nip05: Some("alice@profiles.example"),
      lud16: Some("alice@getalby.com"),
      website: Some("https://alice.example"),
      created_at: 1_700_000_000,
    ),
    Profile(
      pubkey: bob_pubkey_hex,
      name: Some("Bob"),
      display_name: Some("Bob Chen"),
      about: Some("Relay operator and long-form writer."),
      picture: Some("https://example.com/avatars/bob.png"),
      banner: None,
      nip05: Some("bob@profiles.example"),
      lud16: None,
      website: None,
      created_at: 1_700_000_000,
    ),
    Profile(
      pubkey: carol_pubkey_hex,
      name: Some("Carol"),
      display_name: Some("Carol Diaz"),
      about: Some("Illustrator exploring open protocols."),
      picture: None,
      banner: None,
      nip05: Some("carol@profiles.example"),
      lud16: None,
      website: None,
      created_at: 1_700_000_000,
    ),
  ]

  list.fold(people, dict.new(), fn(acc, prof) {
    dict.insert(acc, prof.pubkey, prof)
  })
}

/// Deterministic seeded notes authored by the directory people.
pub fn seed_notes() -> Dict(String, Note) {
  let authored = [
    Note(
      id: "1111111111111111111111111111111111111111111111111111111111111111",
      pubkey: my_pubkey_hex,
      content: "Your profile metadata is just a Kind 0 event you own.",
      created_at: 1_699_999_800,
      reply_to_id: None,
      root_id: None,
      reply_to_pubkey: None,
      mentioned_pubkeys: [],
      hashtags: ["nostr"],
    ),
    Note(
      id: "2222222222222222222222222222222222222222222222222222222222222222",
      pubkey: bob_pubkey_hex,
      content: "Contact lists are Kind 3 replaceable events.",
      created_at: 1_699_999_600,
      reply_to_id: None,
      root_id: None,
      reply_to_pubkey: None,
      mentioned_pubkeys: [],
      hashtags: ["nostr"],
    ),
    Note(
      id: "3333333333333333333333333333333333333333333333333333333333333333",
      pubkey: my_pubkey_hex,
      content: "Your keys stay in the signer, never in the plugin.",
      created_at: 1_699_999_400,
      reply_to_id: None,
      root_id: None,
      reply_to_pubkey: None,
      mentioned_pubkeys: [],
      hashtags: ["keys"],
    ),
  ]

  list.fold(authored, dict.new(), fn(acc, note) {
    dict.insert(acc, note.id, note)
  })
}

/// Profiles sorted by display name (case-insensitive), then pubkey.
pub fn all_profiles(model: Model) -> List(Profile) {
  dict.values(model.profiles)
  |> list.sort(fn(a, b) {
    let by_name =
      string.compare(
        string.lowercase(display_name(a)),
        string.lowercase(display_name(b)),
      )
    case by_name {
      order.Eq -> string.compare(a.pubkey, b.pubkey)
      other -> other
    }
  })
}

/// Profiles matching the current case-insensitive directory search query.
pub fn filtered_profiles(model: Model) -> List(Profile) {
  let needle = string.lowercase(string.trim(model.search_query))
  case needle {
    "" -> all_profiles(model)
    _ ->
      list.filter(all_profiles(model), fn(prof) {
        let haystacks = [
          display_name(prof),
          option.unwrap(prof.name, ""),
          option.unwrap(prof.nip05, ""),
          option.unwrap(prof.about, ""),
          prof.pubkey,
          profile.truncate_npub(prof.pubkey),
        ]
        list.any(haystacks, fn(value) {
          string.contains(string.lowercase(value), needle)
        })
      })
  }
}

/// The profile currently selected in the detail view, if known.
pub fn selected_profile(model: Model) -> Option(Profile) {
  let target = case model.view {
    ViewProfile(pubkey) -> Some(pubkey)
    _ -> model.selected_pubkey
  }
  case target {
    Some(pk) -> dict.get(model.profiles, pk) |> option.from_result
    None -> None
  }
}

/// Notes authored by `author_pubkey`, sorted newest-first.
pub fn notes_by_author(model: Model, author_pubkey: String) -> List(Note) {
  let target = string.lowercase(string.trim(author_pubkey))
  dict.values(model.notes)
  |> list.filter(fn(note) { string.lowercase(note.pubkey) == target })
  |> list.sort(fn(a, b) {
    case int.compare(b.created_at, a.created_at) {
      order.Eq -> string.compare(a.id, b.id)
      other -> other
    }
  })
}

/// Returns `True` when `target_pubkey` is in the Kind 3 follow list.
pub fn following(model: Model, target_pubkey: String) -> Bool {
  follows.is_following(model.follows, target_pubkey)
}

/// Number of followed pubkeys in the active Kind 3 list.
pub fn follow_count(model: Model) -> Int {
  list.length(model.follows.followed_pubkeys)
}

/// Returns `True` when `target_pubkey` is the local identity.
pub fn is_own_profile(model: Model, target_pubkey: String) -> Bool {
  case model.my_pubkey {
    Some(me) ->
      string.lowercase(string.trim(me))
      == string.lowercase(string.trim(target_pubkey))
    None -> False
  }
}

/// Full bech32 npub for the local identity, or an empty string when unavailable.
pub fn own_npub(model: Model) -> String {
  case model.my_pubkey {
    Some(hex) ->
      case pubkey.parse(string.trim(hex)) {
        Ok(pk) -> nip19.encode_npub(pk)
        Error(Nil) -> ""
      }
    None -> ""
  }
}

/// Human-readable label for a `SignerStatus`.
pub fn signer_status_label(status: SignerStatus) -> String {
  case status {
    SignerReady -> "Signer ready"
    SignerLocked -> "Signer locked"
    SignerMissing -> "No signer detected"
  }
}

/// Build a `MetadataDraft` for `target_pubkey` from the profile directory.
pub fn draft_for(
  profiles: Dict(String, Profile),
  target_pubkey: Option(String),
) -> MetadataDraft {
  let prof = case target_pubkey {
    Some(pk) -> dict.get(profiles, pk) |> option.from_result
    None -> None
  }

  case prof {
    Some(p) ->
      MetadataDraft(
        name: option.unwrap(p.name, ""),
        about: option.unwrap(p.about, ""),
        picture: option.unwrap(p.picture, ""),
      )
    None -> MetadataDraft(name: "", about: "", picture: "")
  }
}

/// Pubkey targeted by the metadata editor (local identity first).
pub fn metadata_pubkey(model: Model) -> Option(String) {
  case model.my_pubkey {
    Some(pk) ->
      case string.trim(pk) {
        "" -> model.selected_pubkey
        _ -> Some(pk)
      }
    None -> model.selected_pubkey
  }
}

/// Ingest a single Nostr event into the profile, note, and follow stores.
pub fn ingest_event(model: Model, ev: Event) -> Model {
  let next_now = case ev.created_at > model.now_sec {
    True -> ev.created_at
    False -> model.now_sec
  }

  case ev.kind {
    kind.Metadata ->
      case profile.from_event(ev) {
        Ok(incoming) ->
          Model(
            ..model,
            profiles: upsert_profile(model.profiles, incoming),
            now_sec: next_now,
          )
        Error(_) -> Model(..model, now_sec: next_now)
      }
    kind.Note -> {
      let incoming = note.from_event(ev)
      Model(
        ..model,
        notes: dict.insert(model.notes, incoming.id, incoming),
        now_sec: next_now,
      )
    }
    kind.ContactList -> {
      let incoming = follows.from_event(ev)
      let should_apply = case model.my_pubkey {
        Some(me) ->
          string.lowercase(string.trim(me)) == incoming.pubkey
          || model.follows.followed_pubkeys == []
        None -> incoming.updated_at >= model.follows.updated_at
      }
      let next_follows = case should_apply {
        True -> incoming
        False -> model.follows
      }
      let next_my_pubkey = case model.my_pubkey {
        Some(me) -> Some(me)
        None -> Some(incoming.pubkey)
      }
      Model(
        ..model,
        follows: next_follows,
        my_pubkey: next_my_pubkey,
        now_sec: next_now,
      )
    }
    _ -> Model(..model, now_sec: next_now)
  }
}

/// Keep the newest Kind 0 metadata per pubkey.
pub fn upsert_profile(
  profiles: Dict(String, Profile),
  incoming: Profile,
) -> Dict(String, Profile) {
  case dict.get(profiles, incoming.pubkey) {
    Ok(existing) ->
      case incoming.created_at >= existing.created_at {
        True -> dict.insert(profiles, incoming.pubkey, incoming)
        False -> profiles
      }
    Error(Nil) -> dict.insert(profiles, incoming.pubkey, incoming)
  }
}

/// Versioned `local_store.StoreConfig` for the shared social profile cache.
pub fn profile_store_config() -> StoreConfig(Dict(String, Profile)) {
  profile_cache.default_config()
}

fn display_name(prof: Profile) -> String {
  profile.best_display_name(Some(prof), prof.pubkey)
}
