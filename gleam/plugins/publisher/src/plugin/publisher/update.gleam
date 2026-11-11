//// Pure state transition logic and action mapping for `plugin_publisher`.

import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/plugin_kit/app.{type Effect}
import omni/plugin_kit/schema
import omni/protocol/schema/action.{type Action}
import plugin/publisher/model.{
  type BlossomServer, type Model, type PublishedPlugin, type StudioTab,
  BlossomServer, Model, PublishDraft, PublishedPlugin, TabPublished, TabServers,
  TabStudio, TabWidget,
}
import plugin/publisher/msg.{
  type Msg, AddServer, DismissBanner, PublishPackage, RemoveServer, SelectTab,
  SetBundleMetadata, SetDraftDescription, SetDraftIcon, SetDraftId, SetDraftName,
  SetDraftServerUrl, SetDraftVersion, ToggleServer,
}

/// Pure Elm-style state update function for `plugin_publisher`.
pub fn update(model: Model, msg: Msg) -> #(Model, List(Effect(Msg))) {
  case msg {
    SelectTab(tab) -> #(Model(..model, active_tab: tab), [])

    SetDraftId(id) -> {
      let next_draft = PublishDraft(..model.draft, id: id)
      #(Model(..model, draft: next_draft, error_message: None), [])
    }

    SetDraftName(name) -> {
      let next_draft = PublishDraft(..model.draft, name: name)
      #(Model(..model, draft: next_draft, error_message: None), [])
    }

    SetDraftVersion(ver) -> {
      let next_draft = PublishDraft(..model.draft, version: ver)
      #(Model(..model, draft: next_draft, error_message: None), [])
    }

    SetDraftDescription(desc) -> {
      let next_draft = PublishDraft(..model.draft, description: desc)
      #(Model(..model, draft: next_draft), [])
    }

    SetDraftIcon(icon) -> {
      let next_draft = PublishDraft(..model.draft, icon: icon)
      #(Model(..model, draft: next_draft), [])
    }

    SetBundleMetadata(sha256, size_bytes) -> {
      let next_draft =
        PublishDraft(
          ..model.draft,
          bundle_sha256: sha256,
          bundle_size_bytes: size_bytes,
        )
      #(Model(..model, draft: next_draft, error_message: None), [])
    }

    PublishPackage -> handle_publish(model)

    SetDraftServerUrl(url) -> #(
      Model(..model, draft_server_url: url, error_message: None),
      [],
    )

    AddServer -> handle_add_server(model)

    RemoveServer(url) -> {
      let filtered =
        list.filter(model.servers, fn(s: BlossomServer) { s.url != url })
      #(Model(..model, servers: filtered), [])
    }

    ToggleServer(url) -> {
      let updated =
        list.map(model.servers, fn(s: BlossomServer) {
          case s.url == url {
            True -> {
              let next_enabled = !s.enabled
              let next_status = case next_enabled {
                True -> "Ready"
                False -> "Disabled"
              }
              BlossomServer(..s, enabled: next_enabled, status: next_status)
            }
            False -> s
          }
        })
      #(Model(..model, servers: updated), [])
    }

    DismissBanner -> #(
      Model(..model, status_message: None, error_message: None),
      [],
    )
  }
}

fn handle_publish(model: Model) -> #(Model, List(Effect(Msg))) {
  let clean_id = string.trim(model.draft.id)
  let clean_name = string.trim(model.draft.name)
  let clean_ver = case string.trim(model.draft.version) {
    "" -> "1.0.0"
    v -> v
  }
  let clean_hash = string.lowercase(string.trim(model.draft.bundle_sha256))

  case clean_id == "", clean_name == "", clean_hash == "" {
    True, _, _ -> #(
      Model(
        ..model,
        error_message: Some("Plugin identifier ('d' tag) is required."),
        status_message: None,
      ),
      [],
    )
    _, True, _ -> #(
      Model(
        ..model,
        error_message: Some("Plugin name is required."),
        status_message: None,
      ),
      [],
    )
    _, _, True -> #(
      Model(
        ..model,
        error_message: Some(
          "Bundle SHA-256 hash is required before publishing.",
        ),
        status_message: None,
      ),
      [],
    )
    False, False, False -> {
      let primary_server = case
        list.find(model.servers, fn(s: BlossomServer) { s.enabled })
      {
        Ok(srv) -> srv.url
        Error(Nil) -> "https://cdn.satellite.earth"
      }

      let blossom_url =
        strip_trailing_slashes(primary_server) <> "/" <> clean_hash <> ".html"
      let naddr = "naddr1_" <> clean_id

      let record =
        PublishedPlugin(
          id: clean_id,
          name: clean_name,
          version: clean_ver,
          description: string.trim(model.draft.description),
          icon: case string.trim(model.draft.icon) {
            "" -> "globe"
            ic -> ic
          },
          blossom_sha256: clean_hash,
          blossom_url: blossom_url,
          naddr: naddr,
          published_at: 1_700_000_000,
        )

      let without_existing =
        list.filter(model.published, fn(p: PublishedPlugin) { p.id != clean_id })
      let next_published = [record, ..without_existing]

      #(
        Model(
          ..model,
          published: next_published,
          status_message: Some(
            "Published "
            <> clean_name
            <> " v"
            <> clean_ver
            <> " ("
            <> naddr
            <> ")",
          ),
          error_message: None,
          publishing: False,
        ),
        [],
      )
    }
  }
}

fn handle_add_server(model: Model) -> #(Model, List(Effect(Msg))) {
  let raw = string.trim(model.draft_server_url)
  case raw == "" {
    True -> #(
      Model(
        ..model,
        error_message: Some("Please enter a valid https:// Blossom server URL."),
      ),
      [],
    )
    False -> {
      let lower = string.lowercase(raw)
      case
        string.starts_with(lower, "https://")
        || string.starts_with(lower, "http://")
      {
        False -> #(
          Model(
            ..model,
            error_message: Some(
              "Blossom server URL must start with https:// or http://.",
            ),
          ),
          [],
        )
        True -> {
          let norm = strip_trailing_slashes(raw)
          let exists =
            list.any(model.servers, fn(s: BlossomServer) { s.url == norm })
          case exists {
            True -> #(
              Model(
                ..model,
                error_message: Some(
                  "Blossom server already configured: " <> norm,
                ),
              ),
              [],
            )
            False -> {
              let srv = BlossomServer(url: norm, enabled: True, status: "Added")
              #(
                Model(
                  ..model,
                  servers: list.append(model.servers, [srv]),
                  draft_server_url: "",
                  error_message: None,
                ),
                [],
              )
            }
          }
        }
      }
    }
  }
}

fn strip_trailing_slashes(s: String) -> String {
  case string.ends_with(s, "/") {
    True -> strip_trailing_slashes(string.drop_end(s, 1))
    False -> s
  }
}

/// Maps incoming Channel 1 `Action` events into `Msg`.
pub fn action_to_msg(act: Action) -> Option(Msg) {
  case act.name {
    "select-tab" | "select_tab" | "switch-tab" -> {
      let tab_str =
        first_some([
          schema.payload_string(act, "tab"),
          schema.payload_string(act, "id"),
          schema.payload_string(act, "value"),
        ])
      case tab_str {
        Some(t) -> Some(SelectTab(parse_tab(t)))
        None -> Some(SelectTab(TabStudio))
      }
    }

    "set-draft-id" | "set_draft_id" ->
      Some(SetDraftId(extract_text(act, ["id", "appId", "value"])))

    "set-draft-name" | "set_draft_name" ->
      Some(SetDraftName(extract_text(act, ["name", "appName", "value"])))

    "set-draft-version" | "set_draft_version" ->
      Some(
        SetDraftVersion(extract_text(act, ["version", "appVersion", "value"])),
      )

    "set-draft-description" | "set_draft_description" ->
      Some(
        SetDraftDescription(
          extract_text(act, ["description", "appDescription", "value"]),
        ),
      )

    "set-draft-icon" | "set_draft_icon" ->
      Some(SetDraftIcon(extract_text(act, ["icon", "appIcon", "value"])))

    "set-bundle-metadata" | "set_bundle_metadata" -> {
      let sha = extract_text(act, ["sha256", "bundle_sha256", "value"])
      let size = case schema.payload_int(act, "size_bytes") {
        Some(n) -> n
        None ->
          case schema.payload_int(act, "size") {
            Some(n) -> n
            None -> 0
          }
      }
      Some(SetBundleMetadata(sha256: sha, size_bytes: size))
    }

    "publish-package" | "publish_package" | "publish-blossom" ->
      Some(PublishPackage)

    "set-draft-server-url" | "set_draft_server_url" ->
      Some(
        SetDraftServerUrl(extract_text(act, ["url", "newServerUrl", "value"])),
      )

    "add-server" | "add_server" -> Some(AddServer)

    "remove-server" | "remove_server" ->
      case extract_opt_text(act, ["url", "value"]) {
        Some(u) -> Some(RemoveServer(u))
        None -> None
      }

    "toggle-server" | "toggle_server" ->
      case extract_opt_text(act, ["url", "value"]) {
        Some(u) -> Some(ToggleServer(u))
        None -> None
      }

    "dismiss-banner" | "dismiss_banner" -> Some(DismissBanner)

    _ -> None
  }
}

/// Converts a tab/view route identifier into `StudioTab`.
pub fn parse_tab(raw: String) -> StudioTab {
  case string.lowercase(string.trim(raw)) {
    "published" -> TabPublished
    "servers" -> TabServers
    "widget" | "compact" | "sidebar" -> TabWidget
    _ -> TabStudio
  }
}

fn extract_text(act: Action, keys: List(String)) -> String {
  case extract_opt_text(act, keys) {
    Some(s) -> s
    None -> ""
  }
}

fn extract_opt_text(act: Action, keys: List(String)) -> Option(String) {
  list.map(keys, fn(k) { schema.payload_string(act, k) })
  |> first_some
}

fn first_some(items: List(Option(a))) -> Option(a) {
  case items {
    [] -> None
    [Some(v), ..] -> Some(v)
    [None, ..rest] -> first_some(rest)
  }
}
