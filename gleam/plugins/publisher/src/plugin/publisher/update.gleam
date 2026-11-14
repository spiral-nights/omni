//// Pure state transition logic and action mapping for `plugin_publisher`.

import gleam/bit_array
import gleam/int
import gleam/javascript/promise
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import omni/nostr/event.{UnsignedEvent}
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/nip19
import omni/nostr/pubkey
import omni/nostr/relay_frame
import omni/platform/clock
import omni/platform/file_picker
import omni/platform/http
import omni/platform/ref
import omni/platform/websocket
import omni/plugin_kit/app.{type Effect, Async, OpenUrl, Publish, UploadBlob}
import omni/plugin_kit/schema
import omni/protocol/blossom
import omni/protocol/schema/action.{type Action}
import plugin/publisher/bundle
import plugin/publisher/model.{
  type BlossomServer, type Model, type PackagingMode, type PublishedPlugin,
  type StudioTab, BlossomServer, ModeBlossom, ModeInlined, Model, PublishDraft,
  PublishedPlugin, TabPublished, TabServers, TabStudio, TabWidget,
}
import plugin/publisher/msg.{
  type Msg, AddServer, BundleLoaded, ChooseLocalFile, ChooseLocalZip,
  DeletePublished, DismissBanner, FetchUrl, InstallFromUrl, InstallLocal,
  LoadBundle, OpenNaddr, PrepareUpdate, PublishPackage, PublishServerList,
  QueryRelays, RelaysQueried, RemoveServer, SelectTab, SetBundleMetadata,
  SetBundleUrl, SetDraftDescription, SetDraftIcon, SetDraftId, SetDraftName,
  SetDraftServerUrl, SetDraftVersion, SetPackagingMode, SingleFileLoaded,
  ToggleServer, UploadReported, UseTemplate,
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

    SetPackagingMode(mode) -> #(
      Model(..model, packaging_mode: mode, error_message: None),
      [],
    )

    LoadBundle | FetchUrl -> handle_fetch_url(model)

    InstallFromUrl -> handle_install_from_url(model)

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

    ChooseLocalFile -> #(Model(..model, publishing: True, error_message: None), [
      Async(fn(dispatch) {
        let _ =
          file_picker.pick_base64(
            ".html,.htm,.js,text/html,application/javascript,text/javascript",
          )
          |> promise.map(fn(result) {
            dispatch(BundleLoaded(result))
            Nil
          })
        Nil
      }),
    ])

    SingleFileLoaded(filename, content) -> {
      let parsed = bundle.from_single_file(content, filename)
      let #(sha, size) = case bundle.entry_file(parsed) {
        Ok(file) -> #(file.sha256, file.size)
        Error(_) -> #(model.draft.bundle_sha256, 0)
      }
      let next_draft =
        PublishDraft(
          ..model.draft,
          entry_html: parsed.entry,
          bundle_sha256: sha,
          bundle_size_bytes: size,
        )
      #(
        Model(
          ..model,
          draft: next_draft,
          bundle: Some(parsed),
          publishing: False,
          status_message: Some(
            "Loaded "
            <> parsed.entry
            <> " ("
            <> int.to_string(size)
            <> " bytes).",
          ),
          error_message: None,
        ),
        [],
      )
    }

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
              case
                bundle.from_bytes_auto(
                  bytes,
                  infer_filename_hint(model.bundle_url),
                )
              {
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
                      entry_html: parsed.entry,
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

    UploadReported(path, servers) -> {
      let report = model.UploadReport(path: path, servers: servers)
      let succeeded =
        list.count(servers, fn(pair) {
          case pair {
            #(_, True) -> True
            _ -> False
          }
        })
      let next_reports = [
        report,
        ..list.filter(model.upload_reports, fn(existing) {
          existing.path != path
        })
      ]
      let message =
        "Uploaded "
        <> path
        <> " to "
        <> int.to_string(succeeded)
        <> "/"
        <> int.to_string(list.length(servers))
        <> " server(s)"
      #(
        Model(
          ..model,
          upload_reports: next_reports,
          status_message: Some(message),
          error_message: None,
        ),
        [],
      )
    }

    UseTemplate -> {
      let parsed = bundle.from_html(template_html(), "index.html")
      let #(sha, size) = case bundle.entry_file(parsed) {
        Ok(file) -> #(file.sha256, file.size)
        Error(_) -> #("", 0)
      }
      let next_draft =
        PublishDraft(
          ..model.draft,
          entry_html: "index.html",
          bundle_sha256: sha,
          bundle_size_bytes: size,
        )
      #(
        Model(
          ..model,
          draft: next_draft,
          bundle: Some(parsed),
          status_message: Some("Template bundle ready to publish."),
          error_message: None,
          publishing: False,
        ),
        [],
      )
    }

    DeletePublished(plugin_id) -> handle_delete(model, plugin_id)

    QueryRelays -> handle_query_relays(model)

    RelaysQueried(result) ->
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
        Ok(found) -> {
          let merged = merge_published(model.published, found)
          #(
            Model(
              ..model,
              published: merged,
              publishing: False,
              status_message: Some(
                "Found "
                <> int.to_string(list.length(found))
                <> " published plugin(s) on relays.",
              ),
              error_message: None,
            ),
            [],
          )
        }
      }

    OpenNaddr(raw) -> handle_open_naddr(model, raw)

    PrepareUpdate(plugin_id) -> handle_prepare_update(model, plugin_id)

    PublishServerList -> handle_server_list(model)

    InstallLocal -> handle_install_local(model)

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
  case pubkey_parse(pubkey_hex) {
    Error(Nil) -> #(
      Model(
        ..model,
        error_message: Some("Invalid signing public key."),
        status_message: None,
        publishing: False,
      ),
      [],
    )
    Ok(pk) -> {
      let clean_ver = case string.trim(model.draft.version) {
        "" -> "1.0.0"
        v -> v
      }
      let enabled_servers =
        model.servers
        |> list.filter(fn(server: BlossomServer) { server.enabled })
        |> list.map(fn(server: BlossomServer) {
          blossom.normalize_server(server.url)
        })

      let servers = case model.packaging_mode {
        ModeInlined -> []
        ModeBlossom -> enabled_servers
      }

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

      let content_res = case servers, bundle.entry_file(parsed) {
        [], Ok(entry) ->
          case bit_array.to_string(entry.bytes) {
            Ok(html) -> Ok(html)
            Error(_) ->
              Error(
                "Single-file inlined mode requires a valid UTF-8 entry file.",
              )
          }
        [], Error(err) -> Error(err)
        _, _ -> Ok("")
      }

      case content_res {
        Error(err) -> #(
          Model(
            ..model,
            error_message: Some(err),
            status_message: None,
            publishing: False,
          ),
          [],
        )
        Ok(content) -> {
          let draft =
            UnsignedEvent(
              pubkey: None,
              created_at: clock.system().now_ms() / 1000,
              kind: kind.from_int(blossom.nsite_manifest_kind_int),
              tags: tags,
              content: content,
            )

          let naddr =
            nip19.encode_naddr(nip19.AddressData(
              identifier: clean_id,
              pubkey: pk,
              kind: kind.from_int(blossom.nsite_manifest_kind_int),
              relays: list.take(model.relay_urls, 3),
            ))

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
                [server, ..] ->
                  blossom.blob_url(server, model.draft.bundle_sha256)
                [] -> ""
              },
              naddr: naddr,
              published_at: clock.system().now_ms() / 1000,
            )

          let without_existing =
            list.filter(model.published, fn(p: PublishedPlugin) {
              p.id != clean_id
            })
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
      }
    }
  }
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
    "select-tab"
    | "select_tab"
    | "switch-tab"
    | "navigate"
    | "select-view"
    | "select_view" -> {
      let nav_tab = case act.navigate {
        Some(target) ->
          case target.view {
            Some(v) -> Some(v)
            None -> target.route
          }
        None -> None
      }
      let tab_str =
        first_some([
          nav_tab,
          schema.payload_string(act, "tab"),
          schema.payload_string(act, "view"),
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

    "set-packaging-mode" | "set_packaging_mode" ->
      Some(SetPackagingMode(parse_packaging_mode(act)))

    "publish-package" | "publish_package" | "publish-blossom" ->
      Some(PublishPackage)

    "install-local" | "install_local" -> Some(InstallLocal)

    "set-bundle-url" | "set_bundle_url" ->
      Some(SetBundleUrl(extract_text(act, ["url", "bundleUrl", "value"])))

    "load-bundle" | "load_bundle" -> Some(LoadBundle)

    "fetch-url" | "fetch_url" -> Some(FetchUrl)

    "install-url" | "install_url" -> Some(InstallFromUrl)

    "use-template" | "use_template" -> Some(UseTemplate)

    "delete-published" | "delete_published" ->
      case extract_opt_text(act, ["id", "url", "value"]) {
        Some(id) -> Some(DeletePublished(id))
        None -> None
      }

    "query-relays" | "query_relays" -> Some(QueryRelays)

    "open-naddr" | "open_naddr" ->
      Some(OpenNaddr(extract_text(act, ["naddr", "url", "value"])))

    "prepare-update" | "prepare_update" ->
      case extract_opt_text(act, ["id", "value"]) {
        Some(id) -> Some(PrepareUpdate(id))
        None -> None
      }

    "publish-server-list" | "publish_server_list" -> Some(PublishServerList)

    "choose-local-zip" | "choose_local_zip" | "pick-local-zip" ->
      Some(ChooseLocalZip)

    "choose-local-file" | "choose_local_file" | "pick-local-file" ->
      Some(ChooseLocalFile)

    "set-bundle-file"
    | "set_bundle_file"
    | "set-bundle-html"
    | "set_bundle_html" -> {
      let filename = case extract_opt_text(act, ["filename", "name", "entry"]) {
        Some(f) -> f
        None -> "index.html"
      }
      let content =
        extract_text(act, ["content", "html", "code", "data", "value"])
      Some(SingleFileLoaded(filename: filename, content: content))
    }

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

fn template_html() -> String {
  "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
  <> "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
  <> "<title>Omni Nsite</title>\n"
  <> "<style>body{margin:0;font-family:system-ui,sans-serif;background:#141312;color:#ede8df;display:flex;align-items:center;justify-content:center;min-height:100vh}main{text-align:center;padding:32px}h1{color:#d4a373;font-size:1.6rem}</style>\n"
  <> "</head>\n<body>\n<main>\n<h1>Hello from an Omni nsite</h1>\n"
  <> "<p>Edit index.html and publish to NIP-5A.</p>\n</main>\n</body>\n</html>\n"
}

fn handle_delete(
  model: Model,
  plugin_id: String,
) -> #(Model, List(Effect(Msg))) {
  let removed =
    list.filter(model.published, fn(p: PublishedPlugin) { p.id != plugin_id })
  let next_model = Model(..model, published: removed)
  case model.user_pubkey {
    None -> #(
      Model(
        ..next_model,
        error_message: Some("Sign in to delete a published nsite."),
        status_message: None,
      ),
      [],
    )
    Some(pubkey_hex) -> {
      let draft =
        UnsignedEvent(
          pubkey: None,
          created_at: clock.system().now_ms() / 1000,
          kind: kind.from_int(5),
          tags: [
            ["a", "35129:" <> pubkey_hex <> ":" <> plugin_id],
            ["k", "35129"],
          ],
          content: "Deleted nsite " <> plugin_id,
        )
      #(
        Model(
          ..next_model,
          status_message: Some("Queued deletion for " <> plugin_id),
          error_message: None,
        ),
        [Publish(draft)],
      )
    }
  }
}

fn handle_server_list(model: Model) -> #(Model, List(Effect(Msg))) {
  let servers =
    model.servers
    |> list.filter(fn(server: BlossomServer) { server.enabled })
    |> list.map(fn(server: BlossomServer) {
      blossom.normalize_server(server.url)
    })
  case model.user_pubkey {
    None -> #(
      Model(
        ..model,
        error_message: Some("Sign in to publish your Blossom server list."),
        status_message: None,
      ),
      [],
    )
    Some(_) -> {
      let draft =
        UnsignedEvent(
          pubkey: None,
          created_at: clock.system().now_ms() / 1000,
          kind: blossom.server_list_kind(),
          tags: list.map(servers, fn(url) { ["server", url] }),
          content: "",
        )
      #(
        Model(
          ..model,
          status_message: Some("Queued Blossom server list (Kind 10063)."),
          error_message: None,
        ),
        [Publish(draft)],
      )
    }
  }
}

fn parse_packaging_mode(act: Action) -> PackagingMode {
  case
    first_some([
      schema.payload_string(act, "mode"),
      schema.payload_string(act, "packagingMode"),
      schema.payload_string(act, "value"),
    ])
  {
    Some(raw) ->
      case string.lowercase(string.trim(raw)) {
        "inlined" | "inline" | "single" | "single-file" -> ModeInlined
        _ -> ModeBlossom
      }
    None ->
      case
        first_some([
          schema.payload_bool(act, "checked"),
          schema.payload_bool(act, "value"),
        ])
      {
        Some(True) -> ModeInlined
        _ -> ModeBlossom
      }
  }
}

fn infer_filename_hint(raw_url: String) -> Option(String) {
  let clean = string.trim(raw_url)
  case clean {
    "" -> None
    _ -> {
      let without_query = case string.split_once(clean, "?") {
        Ok(#(before, _)) -> before
        Error(Nil) -> clean
      }
      case list.last(string.split(without_query, "/")) {
        Ok(segment) if segment != "" -> Some(segment)
        _ -> None
      }
    }
  }
}

fn strip_nostr_prefix(raw: String) -> String {
  let trimmed = string.trim(raw)
  case string.starts_with(string.lowercase(trimmed), "nostr:") {
    True -> string.drop_start(trimmed, 6)
    False -> trimmed
  }
}

fn handle_fetch_url(model: Model) -> #(Model, List(Effect(Msg))) {
  let raw = string.trim(model.bundle_url)
  case raw {
    "" -> #(
      Model(
        ..model,
        error_message: Some("Enter a bundle URL or naddr1... coordinate."),
        status_message: None,
      ),
      [],
    )
    _ -> {
      let clean = strip_nostr_prefix(raw)
      case string.starts_with(string.lowercase(clean), "naddr1") {
        True ->
          case nip19.decode(clean) {
            Ok(nip19.Naddr(addr)) -> {
              let next_draft = case string.trim(addr.identifier) {
                "" -> model.draft
                ident -> PublishDraft(..model.draft, id: ident)
              }
              #(
                Model(
                  ..model,
                  draft: next_draft,
                  publishing: False,
                  status_message: Some(
                    "Inspected naddr1 coordinate for '"
                    <> addr.identifier
                    <> "' (kind "
                    <> int.to_string(kind.to_int(addr.kind))
                    <> ", "
                    <> int.to_string(list.length(addr.relays))
                    <> " relay hint(s)).",
                  ),
                  error_message: None,
                ),
                [],
              )
            }
            _ -> #(
              Model(
                ..model,
                error_message: Some("Invalid naddr1 coordinate."),
                status_message: None,
              ),
              [],
            )
          }
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
                  "URL must start with https://, http://, or naddr1.",
                ),
                status_message: None,
              ),
              [],
            )
            True -> #(Model(..model, publishing: True, error_message: None), [
              Async(fn(dispatch) {
                let _ =
                  http.fetch_bytes(raw)
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
    }
  }
}

fn handle_install_from_url(model: Model) -> #(Model, List(Effect(Msg))) {
  let raw = string.trim(model.bundle_url)
  case raw {
    "" -> #(
      Model(
        ..model,
        error_message: Some("Enter a URL or naddr1... coordinate to install."),
        status_message: None,
      ),
      [],
    )
    _ -> {
      let clean = strip_nostr_prefix(raw)
      case string.starts_with(string.lowercase(clean), "naddr1") {
        True ->
          case nip19.decode(clean) {
            Ok(nip19.Naddr(_)) -> #(
              Model(
                ..model,
                status_message: Some("Installing " <> clean <> " in Omni..."),
                error_message: None,
              ),
              [OpenUrl("nostr:" <> clean)],
            )
            _ -> #(
              Model(
                ..model,
                error_message: Some("Invalid naddr1 coordinate."),
                status_message: None,
              ),
              [],
            )
          }
        False -> {
          let lower = string.lowercase(raw)
          case
            string.starts_with(lower, "https://")
            || string.starts_with(lower, "http://")
          {
            True -> #(
              Model(
                ..model,
                status_message: Some("Installing from " <> raw <> "..."),
                error_message: None,
              ),
              [OpenUrl(raw)],
            )
            False -> #(
              Model(
                ..model,
                error_message: Some(
                  "Install target must be https://, http://, or naddr1...",
                ),
                status_message: None,
              ),
              [],
            )
          }
        }
      }
    }
  }
}

fn handle_install_local(model: Model) -> #(Model, List(Effect(Msg))) {
  let clean_id = string.trim(model.draft.id)
  let clean_name = string.trim(model.draft.name)
  case model.bundle, clean_id == "", clean_name == "" {
    None, _, _ -> #(
      Model(
        ..model,
        error_message: Some("Load a bundle before installing locally."),
        status_message: None,
      ),
      [],
    )
    _, True, _ -> #(
      Model(
        ..model,
        error_message: Some("Plugin identifier ('d' tag) is required."),
        status_message: None,
      ),
      [],
    )
    _, _, True -> #(
      Model(
        ..model,
        error_message: Some("Plugin name is required."),
        status_message: None,
      ),
      [],
    )
    Some(parsed), False, False -> {
      let clean_ver = case string.trim(model.draft.version) {
        "" -> "1.0.0"
        v -> v
      }
      let naddr = case model.user_pubkey {
        Some(pk_hex) ->
          case pubkey_parse(pk_hex) {
            Ok(pk) ->
              nip19.encode_naddr(nip19.AddressData(
                identifier: clean_id,
                pubkey: pk,
                kind: kind.from_int(blossom.nsite_manifest_kind_int),
                relays: list.take(model.relay_urls, 3),
              ))
            Error(Nil) -> ""
          }
        None -> ""
      }
      let sha = case bundle.entry_file(parsed) {
        Ok(entry) -> entry.sha256
        Error(_) -> model.draft.bundle_sha256
      }
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
          blossom_sha256: sha,
          blossom_url: "",
          naddr: naddr,
          published_at: clock.system().now_ms() / 1000,
        )
      let without_existing =
        list.filter(model.published, fn(p: PublishedPlugin) { p.id != clean_id })
      let effects = case naddr {
        "" -> []
        addr -> [OpenUrl("nostr:" <> addr)]
      }
      #(
        Model(
          ..model,
          published: [record, ..without_existing],
          status_message: Some(
            "Installed " <> clean_name <> " locally in Omni.",
          ),
          error_message: None,
        ),
        effects,
      )
    }
  }
}

fn handle_open_naddr(model: Model, raw: String) -> #(Model, List(Effect(Msg))) {
  let clean = strip_nostr_prefix(raw)
  case clean {
    "" -> #(
      Model(
        ..model,
        error_message: Some("No naddr coordinate available for this plugin."),
        status_message: None,
      ),
      [],
    )
    _ -> #(
      Model(
        ..model,
        status_message: Some("Opening " <> clean <> " in Omni..."),
        error_message: None,
      ),
      [OpenUrl("nostr:" <> clean)],
    )
  }
}

fn handle_prepare_update(
  model: Model,
  plugin_id: String,
) -> #(Model, List(Effect(Msg))) {
  case
    list.find(model.published, fn(p: PublishedPlugin) { p.id == plugin_id })
  {
    Error(Nil) -> #(
      Model(
        ..model,
        error_message: Some("Published plugin not found: " <> plugin_id),
        status_message: None,
      ),
      [],
    )
    Ok(pkg) -> {
      let next_draft =
        PublishDraft(
          ..model.draft,
          id: pkg.id,
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          icon: pkg.icon,
          bundle_sha256: pkg.blossom_sha256,
        )
      #(
        Model(
          ..model,
          active_tab: TabStudio,
          draft: next_draft,
          status_message: Some(
            "Loaded "
            <> pkg.name
            <> " into Studio for update. Choose a new .zip or file and publish.",
          ),
          error_message: None,
        ),
        [],
      )
    }
  }
}

fn handle_query_relays(model: Model) -> #(Model, List(Effect(Msg))) {
  case model.relay_urls {
    [] -> #(
      Model(
        ..model,
        error_message: Some("No relays configured to query."),
        status_message: None,
      ),
      [],
    )
    relays -> #(
      Model(
        ..model,
        publishing: True,
        status_message: Some("Querying relays for kind:35129..."),
        error_message: None,
      ),
      [
        Async(fn(dispatch) {
          query_relays_async(relays, model.user_pubkey, dispatch)
        }),
      ],
    )
  }
}

fn query_relays_async(
  relays: List(String),
  user_pubkey: Option(String),
  dispatch: fn(Msg) -> Nil,
) -> Nil {
  let base_filter =
    filter.new()
    |> filter.with_kinds([kind.from_int(35_129)])
    |> filter.with_limit(50)
  let req_filter = case user_pubkey {
    Some(pk_hex) ->
      case pubkey_parse(pk_hex) {
        Ok(pk) -> filter.with_authors(base_filter, [pubkey.to_hex(pk)])
        Error(Nil) -> base_filter
      }
    None -> base_filter
  }
  let sub_id = "pub_query"
  let req_json =
    relay_frame.client_frame_to_json(
      relay_frame.Req(sub_id: sub_id, filters: [req_filter]),
    )
  let collected = ref.new([])
  let remaining = ref.new(list.length(relays))

  list.each(relays, fn(url) {
    let conn_ref = ref.new(None)
    let done_ref = ref.new(False)
    let finish_one = fn() {
      case ref.get(done_ref) {
        True -> Nil
        False -> {
          ref.set(done_ref, True)
          case ref.get(conn_ref) {
            Some(c) -> websocket.close(c, 1000, "done")
            None -> Nil
          }
          let left = ref.get(remaining) - 1
          ref.set(remaining, left)
          case left <= 0 {
            True -> dispatch(RelaysQueried(Ok(ref.get(collected))))
            False -> Nil
          }
        }
      }
    }
    let conn =
      websocket.connect(url, fn(ws_ev) {
        case ws_ev {
          websocket.Open ->
            case ref.get(conn_ref) {
              Some(c) -> {
                let _ = websocket.send(c, req_json)
                Nil
              }
              None -> Nil
            }
          websocket.Message(text) ->
            case relay_frame.parse_relay_frame(text) {
              Ok(relay_frame.EventFrame(_, ev)) ->
                case model.published_from_event(ev, relays) {
                  Some(pkg) ->
                    ref.update(collected, fn(prev) {
                      merge_published(prev, [pkg])
                    })
                  None -> Nil
                }
              Ok(relay_frame.Eose(_)) -> finish_one()
              Ok(relay_frame.Closed(_, _)) -> finish_one()
              _ -> Nil
            }
          websocket.Close(_, _) | websocket.Error(_) -> finish_one()
        }
      })
    ref.set(conn_ref, Some(conn))
  })
}

/// Merges newly discovered `PublishedPlugin` entries into `existing`, deduping by `id`.
pub fn merge_published(
  existing: List(PublishedPlugin),
  incoming: List(PublishedPlugin),
) -> List(PublishedPlugin) {
  list.fold(incoming, existing, fn(acc, pkg) {
    let filtered =
      list.filter(acc, fn(item: PublishedPlugin) { item.id != pkg.id })
    [pkg, ..filtered]
  })
}
