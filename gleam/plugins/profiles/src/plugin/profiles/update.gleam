//// Pure state reducer and Channel 1 `Action -> Option(Msg)` mapper for `plugin_profiles`.

import gleam/dict
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/plugin_kit/app.{type Effect}
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import omni/social/follows
import omni/social/profile.{Profile}
import plugin/profiles/model.{
  type Model, type ProfilesView, MetadataDraft, Model, SignerMissing,
  SignerReady, ViewDirectory, ViewKeys, ViewMetadata, ViewProfile, draft_for,
  ingest_event, metadata_pubkey,
}
import plugin/profiles/msg.{
  type Msg, IngestEvent, IngestEvents, RefreshSigner, SaveMetadata,
  SelectProfile, SelectView, SetMetadataAbout, SetMetadataName,
  SetMetadataPicture, SetSearchQuery, ToggleFollow,
}

/// Apply a `Msg` to `Model`, returning the updated `Model` and any side `Effect`s.
pub fn update(model: Model, msg: Msg) -> #(Model, List(Effect(Msg))) {
  case msg {
    SelectView(view) -> #(apply_view(model, view), [])

    SelectProfile(pubkey) -> {
      let cleaned = string.trim(pubkey)
      case cleaned {
        "" -> #(model, [])
        _ -> #(apply_view(model, ViewProfile(cleaned)), [])
      }
    }

    SetSearchQuery(query) -> #(Model(..model, search_query: query), [])

    ToggleFollow(pubkey) -> {
      let cleaned = string.trim(pubkey)
      case cleaned {
        "" -> #(model, [])
        _ -> #(
          Model(
            ..model,
            follows: follows.toggle_follow(
              model.follows,
              cleaned,
              model.now_sec,
            ),
          ),
          [],
        )
      }
    }

    SetMetadataName(name) -> #(
      Model(
        ..model,
        metadata_draft: MetadataDraft(..model.metadata_draft, name: name),
        metadata_dirty: True,
      ),
      [],
    )

    SetMetadataAbout(about) -> #(
      Model(
        ..model,
        metadata_draft: MetadataDraft(..model.metadata_draft, about: about),
        metadata_dirty: True,
      ),
      [],
    )

    SetMetadataPicture(picture) -> #(
      Model(
        ..model,
        metadata_draft: MetadataDraft(..model.metadata_draft, picture: picture),
        metadata_dirty: True,
      ),
      [],
    )

    SaveMetadata -> #(save_metadata(model), [])

    RefreshSigner -> #(refresh_signer(model), [])

    IngestEvent(ev) -> #(ingest_event(model, ev), [])

    IngestEvents(events) -> #(list.fold(events, model, ingest_event), [])
  }
}

/// Map an incoming Schema `Action` over Channel 1 to an optional `Msg`.
pub fn action_to_msg(act: Action) -> Option(Msg) {
  case act.name {
    "select-view" | "select_view" | "navigate" ->
      case extract_view(act) {
        Some(view) -> Some(SelectView(view))
        None -> None
      }

    "select-profile" | "select_profile" | "view-profile" | "view_profile" ->
      case extract_pubkey(act) {
        Some(pk) -> Some(SelectProfile(pk))
        None -> None
      }

    "search" | "set-search-query" | "set_search_query" ->
      case extract_string(act, ["query", "q", "value", "searchQuery"]) {
        Some(query) -> Some(SetSearchQuery(query))
        None -> Some(SetSearchQuery(""))
      }

    "toggle-follow" | "toggle_follow" | "follow" | "unfollow" ->
      case extract_pubkey(act) {
        Some(pk) -> Some(ToggleFollow(pk))
        None -> None
      }

    "edit-metadata" | "edit_metadata" | "open-metadata" | "open_metadata" ->
      Some(SelectView(ViewMetadata))

    "view-keys" | "view_keys" | "key-custody" | "key_custody" ->
      Some(SelectView(ViewKeys))

    "view-directory" | "view_directory" | "back-to-directory" ->
      Some(SelectView(ViewDirectory))

    "set-metadata-name" | "set_metadata_name" ->
      case extract_string(act, ["value", "name"]) {
        Some(value) -> Some(SetMetadataName(value))
        None -> Some(SetMetadataName(""))
      }

    "set-metadata-about" | "set_metadata_about" ->
      case extract_string(act, ["value", "about"]) {
        Some(value) -> Some(SetMetadataAbout(value))
        None -> Some(SetMetadataAbout(""))
      }

    "set-metadata-picture" | "set_metadata_picture" ->
      case extract_string(act, ["value", "picture"]) {
        Some(value) -> Some(SetMetadataPicture(value))
        None -> Some(SetMetadataPicture(""))
      }

    "save-metadata" | "save_metadata" | "save-profile" | "save_profile" ->
      Some(SaveMetadata)

    "refresh-signer" | "refresh_signer" | "check-signer" | "check_signer" ->
      Some(RefreshSigner)

    "input" | "change" ->
      case schema.payload_string(act, "name") {
        Some("name") | Some("metadata_name") ->
          Some(SetMetadataName(extract_value(act, "name")))
        Some("about") | Some("metadata_about") ->
          Some(SetMetadataAbout(extract_value(act, "about")))
        Some("picture") | Some("metadata_picture") ->
          Some(SetMetadataPicture(extract_value(act, "picture")))
        Some("search") | Some("search_query") ->
          Some(SetSearchQuery(extract_value(act, "query")))
        _ -> None
      }

    "view_note" | "open-thread" | "view-thread" ->
      // Note opening is delegated to the host intent broker.
      None

    _ -> None
  }
}

fn apply_view(model: Model, view: ProfilesView) -> Model {
  case view {
    ViewDirectory -> Model(..model, view: ViewDirectory)

    ViewProfile(pubkey) -> {
      let cleaned = string.trim(pubkey)
      case cleaned {
        "" -> Model(..model, view: ViewDirectory)
        _ ->
          Model(
            ..model,
            view: ViewProfile(cleaned),
            selected_pubkey: Some(cleaned),
            metadata_draft: draft_for(model.profiles, Some(cleaned)),
            metadata_dirty: False,
          )
      }
    }

    ViewMetadata ->
      Model(
        ..model,
        view: ViewMetadata,
        metadata_draft: draft_for(model.profiles, metadata_pubkey(model)),
        metadata_dirty: False,
      )

    ViewKeys -> Model(..model, view: ViewKeys)
  }
}

fn save_metadata(model: Model) -> Model {
  case metadata_pubkey(model) {
    None -> model
    Some(pubkey) -> {
      let existing =
        dict.get(model.profiles, pubkey)
        |> option.from_result
        |> option.unwrap(profile.empty(pubkey))
      let draft = model.metadata_draft
      let created_at = model.now_sec + 1
      let updated =
        Profile(
          ..existing,
          name: optional_text(draft.name),
          about: optional_text(draft.about),
          picture: optional_text(draft.picture),
          created_at: created_at,
        )
      Model(
        ..model,
        profiles: dict.insert(model.profiles, pubkey, updated),
        metadata_draft: MetadataDraft(
          name: option.unwrap(updated.name, ""),
          about: option.unwrap(updated.about, ""),
          picture: option.unwrap(updated.picture, ""),
        ),
        metadata_dirty: False,
        now_sec: created_at,
      )
    }
  }
}

fn optional_text(raw: String) -> Option(String) {
  case string.trim(raw) {
    "" -> None
    cleaned -> Some(cleaned)
  }
}

fn refresh_signer(model: Model) -> Model {
  let status = case model.my_pubkey {
    Some(pk) ->
      case string.trim(pk) {
        "" -> SignerMissing
        _ -> SignerReady
      }
    None -> SignerMissing
  }
  Model(..model, signer_status: status)
}

fn extract_view(act: Action) -> Option(ProfilesView) {
  let raw = case extract_string(act, ["view"]) {
    Some(value) -> Some(value)
    None ->
      case act.navigate {
        Some(nav) -> nav.view
        None -> None
      }
  }

  case raw {
    Some(value) ->
      case string.lowercase(string.trim(value)) {
        "directory" | "people" | "main" -> Some(ViewDirectory)
        "profile" ->
          case extract_pubkey(act) {
            Some(pk) -> Some(ViewProfile(pk))
            None -> None
          }
        "metadata" | "edit" | "editor" -> Some(ViewMetadata)
        "keys" | "key-custody" | "custody" | "signer" -> Some(ViewKeys)
        _ -> None
      }
    None -> None
  }
}

fn extract_pubkey(act: Action) -> Option(String) {
  list.find_map(["pubkey", "id", "npub", "value"], fn(key) {
    case schema.payload_string(act, key) {
      Some(value) ->
        case string.trim(value) {
          "" -> Error(Nil)
          cleaned -> Ok(cleaned)
        }
      None -> Error(Nil)
    }
  })
  |> option.from_result
}

fn extract_value(act: Action, fallback_key: String) -> String {
  case schema.payload_string(act, "value") {
    Some(value) -> value
    None -> option.unwrap(schema.payload_string(act, fallback_key), "")
  }
}

fn extract_string(act: Action, keys: List(String)) -> Option(String) {
  list.find_map(keys, fn(key) {
    case schema.payload_string(act, key) {
      Some(value) -> Ok(value)
      None -> Error(Nil)
    }
  })
  |> option.from_result
}
