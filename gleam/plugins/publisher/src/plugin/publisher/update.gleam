//// Pure state transition logic and action mapping for `plugin_publisher`.

import gleam/bit_array
import gleam/javascript/promise
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import omni/nostr/event.{UnsignedEvent}
import omni/nostr/kind
import omni/nostr/nip19
import omni/nostr/pubkey
import omni/platform/clock
import omni/platform/file_picker
import omni/platform/http
import omni/plugin_kit/app.{type Effect, Async, Publish, UploadBlob}
import omni/plugin_kit/schema
import omni/protocol/blossom
import omni/protocol/schema/action.{type Action}
import plugin/publisher/bundle
import plugin/publisher/model.{
  type BlossomServer, type Model, type PublishedPlugin, type StudioTab,
  BlossomServer, Model, PublishDraft, PublishedPlugin, TabPublished, TabServers,
  TabStudio, TabWidget,
}
import plugin/publisher/msg.{
  type Msg, AddServer, BundleLoaded, ChooseLocalZip, DismissBanner, LoadBundle,
  PublishPackage, RemoveServer, SelectTab, SetBundleMetadata, SetBundleUrl,
  SetDraftDescription, SetDraftIcon, SetDraftId, SetDraftName, SetDraftServerUrl,
  SetDraftVersion, ToggleServer,
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

    SetBundleUrl(url) -> #(
      Model(..model, bundle_url: url, error_message: None),
      [],
    )

    LoadBundle -> {
      case string.trim(model.bundle_url) {
        "" -> #(
          Model(
            ..model,
            error_message: Some("Enter a bundle zip URL."),
            status_message: None,
          ),
          [],
        )
        url ->
          case
            string.starts_with(url, "https://")
            || string.starts_with(url, "http://")
          {
            False -> #(
              Model(
                ..model,
                error_message: Some("Bundle URL must be http(s)."),
                status_message: None,
              ),
              [],
            )
            True -> #(Model(..model, publishing: True, error_message: None), [
              Async(fn(dispatch) {
                let _ =
                  http.fetch_bytes(url)
                  |> promise.map(fn(result) {
                    dispatch(BundleLoaded(
                      result
                      |> result.map(fn(bytes) {
                        bit_array.base64_encode(bytes, True)
                      }),
                    ))
                    Nil
                  })
                Nil
              }),
            ])
          }
      }
    }

    ChooseLocalZip -> #(Model(..model, publishing: True, error_message: None), [
      Async(fn(dispatch) {
        let _ =
          file_picker.pick_zip_base64()
          |> promise.map(fn(result) {
            dispatch(BundleLoaded(result))
            Nil
          })
        Nil
      }),
    ])

    BundleLoaded(result) -> {
      case result {
        Error(err) -> #(
          Model(
            ..model,
            publishing: False,
            error_message: Some(err),
            status_message: None,
          ),
          [],
        )
        Ok(encoded) ->
          case bit_array.base64_decode(encoded) {
            Error(_) -> #(
              Model(
                ..model,
                publishing: False,
                error_message: Some("Invalid bundle data."),
              ),
              [],
            )
            Ok(bytes) ->
              case bundle.from_zip_bytes(bytes) {
                Error(err) -> #(
                  Model(..model, publishing: False, error_message: Some(err)),
                  [],
                )
                Ok(parsed) -> {
                  let entry_size = case bundle.entry_file(parsed) {
                    Ok(file) -> file.size
                    Error(_) -> 0
                  }
                  let next_draft =
                    PublishDraft(
                      ..model.draft,
                      bundle_sha256: case bundle.entry_file(parsed) {
                        Ok(file) -> file.sha256
                        Error(_) -> model.draft.bundle_sha256
                      },
                      bundle_size_bytes: entry_size,
                    )
                  #(
                    Model(
                      ..model,
                      draft: next_draft,
                      bundle: Some(parsed),
                      publishing: False,
                      status_message: Some("Bundle loaded."),
                      error_message: None,
                    ),
                    [],
                  )
                }
              }
          }
      }
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

  case model.bundle, model.user_pubkey {
    None, _ -> #(
      Model(
        ..model,
        error_message: Some("Load a bundle zip before publishing."),
        status_message: None,
      ),
      [],
    )
    _, None -> #(
      Model(
        ..model,
        error_message: Some("Sign in to publish an nsite."),
        status_message: None,
      ),
      [],
    )
    Some(parsed), Some(pubkey_hex) ->
      case clean_id == "", clean_name == "" {
        True, _ -> #(
          Model(
            ..model,
            error_message: Some("Plugin identifier ('d' tag) is required."),
            status_message: None,
          ),
          [],
        )
        _, True -> #(
          Model(
            ..model,
            error_message: Some("Plugin name is required."),
            status_message: None,
          ),
          [],
        )
        False, False -> publish_bundle(model, parsed, pubkey_hex, clean_id)
      }
  }
}

fn publish_bundle(
  model: Model,
  parsed: bundle.Bundle,
  pubkey_hex: String,
  clean_id: String,
) -> #(Model, List(Effect(Msg))) {
  let clean_ver = case string.trim(model.draft.version) {
    "" -> "1.0.0"
    v -> v
  }
  let servers =
    model.servers
    |> list.filter(fn(server: BlossomServer) { server.enabled })
    |> list.map(fn(server: BlossomServer) {
      blossom.normalize_server(server.url)
    })

  let uploads = case servers {
    [] -> []
    _ ->
      list.map(parsed.files, fn(file) {
        UploadBlob(blossom.BlobUpload(
          servers: servers,
          path: file.path,
          mime: file.mime,
          sha256: file.sha256,
          body: file.bytes,
        ))
      })
  }

  let files_for_tags = case servers {
    [] -> []
    _ -> parsed.files
  }
  let tags = model.build_nip5a_tags(model.draft, files_for_tags, servers)

  let content = case servers, bundle.entry_file(parsed) {
    [], Ok(entry) ->
      case bit_array.to_string(entry.bytes) {
        Ok(html) -> html
        Error(_) -> ""
      }
    _, _ -> ""
  }

  let draft =
    UnsignedEvent(
      pubkey: None,
      created_at: clock.system().now_ms() / 1000,
      kind: kind.from_int(blossom.nsite_manifest_kind_int),
      tags: tags,
      content: content,
    )

  let assert Ok(pk) = pubkey_parse(pubkey_hex)
  let naddr =
    nip19.encode_naddr(
      nip19.AddressData(
        identifier: clean_id,
        pubkey: pk,
        kind: kind.from_int(blossom.nsite_manifest_kind_int),
        relays: [],
      ),
    )

  let record =
    PublishedPlugin(
      id: clean_id,
      name: string.trim(model.draft.name),
      version: clean_ver,
      description: string.trim(model.draft.description),
      icon: case string.trim(model.draft.icon) {
        "" -> "globe"
        ic -> ic
      },
      blossom_sha256: case bundle.entry_file(parsed) {
        Ok(entry) -> entry.sha256
        Error(_) -> model.draft.bundle_sha256
      },
      blossom_url: case servers {
        [server, ..] -> blossom.blob_url(server, model.draft.bundle_sha256)
        [] -> ""
      },
      naddr: naddr,
      published_at: clock.system().now_ms() / 1000,
    )

  let without_existing =
    list.filter(model.published, fn(p: PublishedPlugin) { p.id != clean_id })
  let next_published = [record, ..without_existing]

  #(
    Model(
      ..model,
      published: next_published,
      status_message: Some(
        "Queued " <> string.trim(model.draft.name) <> " v" <> clean_ver,
      ),
      error_message: None,
      publishing: False,
    ),
    list.append(uploads, [Publish(draft)]),
  )
}

fn pubkey_parse(hex: String) -> Result(pubkey.Pubkey, Nil) {
  pubkey.parse(pubkey_hex_trim(hex))
}

fn pubkey_hex_trim(raw: String) -> String {
  string.trim(raw)
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

    "set-bundle-url" | "set_bundle_url" ->
      Some(SetBundleUrl(extract_text(act, ["url", "bundleUrl", "value"])))

    "load-bundle" | "load_bundle" -> Some(LoadBundle)

    "choose-local-zip" | "choose_local_zip" | "pick-local-zip" ->
      Some(ChooseLocalZip)

    "set-bundle-zip" | "set_bundle_zip" ->
      Some(BundleLoaded(Ok(extract_text(act, ["zip", "data", "value"]))))

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
