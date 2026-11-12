//// JS-facing facade over the `omni_web` shell bootloader.
////
//// The host page (`apps/web`) calls `start` to open IndexedDB and initialize
//// the kernel/registry/shell model, renders the returned HTML string into
//// `#omni-root`, and can rebuild the HTML after navigation or shell switches
//// through the exposed message helpers. DOM mounting and event wiring stay in
//// the host so this shared package needs no DOM FFI.

import gleam/dict
import gleam/javascript/promise
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

import lustre/effect.{type Effect}
import lustre/element.{type Element}
import omni/kernel/crypto/keystore
import omni/kernel/kernel.{KernelPorts}
import omni/kernel/nostr/coordinator
import omni/kernel/nostr/relay_pool
import omni/kernel/plugins/updates
import omni/nostr/event as nostr_event
import omni/nostr/filter.{type Filter, Filter}
import omni/nostr/kind
import omni/nostr/pubkey
import omni/nostr/relay_url
import omni/platform/clock
import omni/platform/idb
import omni/platform/nip44
import omni/platform/storage
import omni/platform/url
import omni/plugin_kit/route.{type Route}
import omni/protocol/rpc/method.{FetchOptions}
import omni/protocol/viewport.{type Viewport, Main}
import omni/protocol/workspace
import omni/shell/layout/viewport_host
import omni/shell/model.{
  type InstalledApp, type SettingsTab, type UpdateModalState, AppStore,
  InstalledApp, PrimaryApp, Settings, TabPluginSettings, TabPlugins, TabProfile,
  TabRelays, TabShells, TabWorkspace, UpdateModalState, WidgetsDashboard,
}
import omni/shell/model as omni_shell_model
import omni/shell/msg.{
  ApplyRemoteWorkspace, EmbedSchema, FinishPullRefresh, InstallApp,
  KeyImportResult, NavigateTo, OpenApp, OpenSettings, SetExportedNsec,
  SetUserProfile, ShowPermissionPrompt, ShowUpdateModal, StartPullRefresh,
  UninstallApp,
}
import omni/shell/update
import omni/social/profile as social_profile
import omni/web/boot
import omni/web/config
import omni/web/installer
import omni/web/permission_prompt
import omni/web/rpc

/// Opaque shell boot state handed back to the host page.
pub type ShellBoot {
  ShellBoot(booted: boot.Booted)
}

/// Initialize the shell boot state, opening the host IndexedDB database and
/// resolving the persisted shell selection.
pub fn start(db_name: String) -> promise.Promise(Result(ShellBoot, String)) {
  start_with_bridge(db_name, "")
}

/// Initialize the shell boot state with the bundled Gleam guest bridge script
/// injected into every plugin sandbox (empty string disables injection).
pub fn start_with_bridge(
  db_name: String,
  bridge_script_source: String,
) -> promise.Promise(Result(ShellBoot, String)) {
  let bridge_script = case string.trim(bridge_script_source) {
    "" -> None
    source -> Some(source)
  }
  use db_res <- promise.await(idb.open(db_name, 1, fn(_) { Nil }))

  case db_res {
    Ok(db) -> {
      let ports =
        KernelPorts(
          storage: storage.local_or_in_memory(),
          idb: db,
          clock: clock.system(),
          prompt_handler: None,
        )
      promise.resolve(
        Ok(ShellBoot(boot.init_with_bridge(ports, bridge_script))),
      )
    }
    Error(err) -> promise.resolve(Error(err))
  }
}

/// Spawn a plugin sandbox and mount its `<iframe>` into the island container
/// identified by `selector`, using the bootstrapped guest bridge.
pub fn spawn_plugin(
  host: ShellBoot,
  selector: String,
  plugin_id: String,
  content: String,
  route: Option(String),
) -> Result(ShellBoot, String) {
  case boot.spawn_sandbox(host.booted, plugin_id, content, route) {
    Ok(#(next_booted, mount)) -> {
      mount_island(selector, mount.srcdoc, plugin_id, fn(raw_request, respond) {
        let _ =
          rpc.handle(next_booted, plugin_id, raw_request)
          |> promise.map(fn(response) { respond(response) })
        Nil
      })
      Ok(ShellBoot(next_booted))
    }
    Error(err) -> Error(err)
  }
}

/// Current user public key (hex) and npub.
pub fn user_pubkey(host: ShellBoot) -> String {
  rpc.public_key_hex(host.booted)
}

pub fn user_npub(host: ShellBoot) -> String {
  rpc.npub(host.booted)
}

/// Sign an unsigned-event JSON draft and return the signed event JSON.
pub fn sign_event(
  host: ShellBoot,
  draft_json: String,
) -> Result(String, String) {
  rpc.sign_draft_json(host.booted, draft_json)
}

/// Answer a raw JSON-RPC frame for `plugin_id` (Channel 2 host binding).
pub fn rpc_frame(
  host: ShellBoot,
  plugin_id: String,
  request_json: String,
) -> promise.Promise(String) {
  rpc.handle(host.booted, plugin_id, request_json)
}

/// Terminate a plugin sandbox and remove its mounted island contents.
pub fn terminate_plugin(host: ShellBoot, selector: String) -> ShellBoot {
  unmount_island(selector)
  ShellBoot(host.booted)
}

/// Render the current shell tree as HTML (static snapshot; no event handlers).
pub fn render(host: ShellBoot) -> String {
  boot.view(host.booted) |> element.to_string
}

/// Mount the interactive shell into `selector` using Lustre's client runtime.
/// Messages are dispatched through the bootloader, so persistence effects apply
/// and the view re-renders in place with live event handlers.
pub fn mount_shell(selector: String, host: ShellBoot) -> Nil {
  mount_dom(
    selector,
    fn(_flags) { #(host, effect.none()) },
    fn(current: ShellBoot, message: msg.Msg) {
      let #(next, effects) = boot.dispatch(current.booted, message)
      let host = apply_effects(ShellBoot(next), effects)
      let _ =
        boot.publish_pending(host.booted)
        |> promise.map(fn(event_ids) {
          case event_ids {
            [] -> Nil
            _ -> push_views(host)
          }
        })
      #(host, effect.none())
    },
    fn(current: ShellBoot) { boot.view(current.booted) },
    msg_from_url,
    page_url,
    StartPullRefresh,
  )
}

/// URL for the shell's current page, used for `history.pushState`.
pub fn page_url(host: ShellBoot) -> String {
  case host.booted.model.active_page {
    PrimaryApp(plugin_id, _route) -> "?app=" <> url.encode_component(plugin_id)
    WidgetsDashboard -> "?view=widgets"
    AppStore -> "?view=apps"
    Settings(tab) -> "?view=settings&tab=" <> settings_tab_slug(tab)
  }
}

fn settings_tab_slug(tab: SettingsTab) -> String {
  case tab {
    TabProfile -> "profile"
    TabRelays -> "relays"
    TabPlugins -> "plugins"
    TabWorkspace -> "workspace"
    TabShells -> "shells"
    TabPluginSettings(plugin_id) -> "plugin:" <> plugin_id
  }
}

/// Decode a browser URL (`path?search`) into a shell message for back/forward.
pub fn msg_from_url(raw: String) -> Option(msg.Msg) {
  let search = case string.split_once(raw, "?") {
    Ok(#(_path, query)) -> "?" <> query
    Error(Nil) -> raw
  }
  let parsed = route.parse_search(search)

  case route.get_param(parsed, "app") {
    Some(plugin_id) if plugin_id != "" -> Some(msg.OpenApp(plugin_id, None))
    _ ->
      case route.get_param(parsed, "view") {
        Some(view) ->
          case string.lowercase(view) {
            "widgets" -> Some(msg.NavigateTo(WidgetsDashboard))
            "apps" -> Some(msg.NavigateTo(AppStore))
            "settings" -> Some(msg.OpenSettings(tab_from_slug(parsed)))
            _ -> None
          }
        None -> None
      }
  }
}

fn tab_from_slug(parsed: Route) -> SettingsTab {
  case route.get_param(parsed, "tab") {
    Some(raw) ->
      case raw {
        "relays" -> TabRelays
        "plugins" -> TabPlugins
        "workspace" -> TabWorkspace
        "shells" -> TabShells
        _ ->
          case string.starts_with(raw, "plugin:") {
            True -> TabPluginSettings(string.drop_start(raw, 7))
            False -> TabProfile
          }
      }
    None -> TabProfile
  }
}

@external(javascript, "./shell_boot.ffi.mjs", "mount_dom")
fn mount_dom(
  selector: String,
  init: fn(String) -> #(ShellBoot, Effect(msg.Msg)),
  update: fn(ShellBoot, msg.Msg) -> #(ShellBoot, Effect(msg.Msg)),
  view: fn(ShellBoot) -> Element(msg.Msg),
  parse_url: fn(String) -> Option(msg.Msg),
  page_url: fn(ShellBoot) -> String,
  pull_start: msg.Msg,
) -> Nil

/// Apply the shell's side effects: sandbox mounts/unmounts, plugin teardown,
/// first-time installs, and confirmed upgrades.
fn apply_effects(
  host: ShellBoot,
  effects: List(update.ShellEffect),
) -> ShellBoot {
  list.fold(effects, host, fn(acc, effect) {
    case effect {
      update.UnmountPluginFromSlot(plugin_id, viewport) -> {
        unmount_island(slot_selector(viewport, plugin_id))
        ShellBoot(boot.terminate_sandbox(acc.booted, plugin_id))
      }

      update.MountPluginInSlot(plugin_id, viewport, route) -> {
        mount_installed(acc, plugin_id, viewport, route)
        acc
      }

      update.InstallPluginFromUrl(target, plugin_id) -> {
        install_bundle(acc, target, plugin_id)
        acc
      }

      update.UpgradePlugin(plugin_id) -> {
        upgrade_plugin(acc, plugin_id)
        acc
      }

      update.RefreshActiveView -> {
        refresh_public_feed(acc)
        acc
      }

      update.ImportKeyEffect(raw) -> {
        case boot.import_key(acc.booted, raw) {
          Ok(next) -> {
            dispatch_shell_msg(KeyImportResult(Ok(Nil)))
            dispatch_shell_msg(
              SetUserProfile(profile_summary_for(
                user_npub(ShellBoot(next)),
                empty_profile(keystore.get_public_key(next.kernel.keystore)),
              )),
            )
          }
          Error(err) -> dispatch_shell_msg(KeyImportResult(Error(err)))
        }
        acc
      }

      update.ExportKeyEffect -> {
        dispatch_shell_msg(SetExportedNsec(boot.export_key_nsec(acc.booted)))
        acc
      }

      _ -> acc
    }
  })
}

fn refresh_public_feed(host: ShellBoot) -> Nil {
  let _ =
    coordinator.fetch(
      host.booted.kernel.coordinator,
      "omni_internal_refresh",
      [public_events_filter()],
      Some(FetchOptions(timeout_ms: Some(3000), relays: None, local_only: None)),
    )
    |> promise.map(fn(events) {
      list.each(events, fn(event) {
        dict.each(host.booted.builtins, fn(_id, app) {
          case app.ingest {
            Some(ingest) -> ingest(event)
            None -> Nil
          }
        })
      })
      push_views(host)
      dispatch_shell_msg(FinishPullRefresh)
      Nil
    })
  Nil
}

fn slot_selector(viewport: Viewport, plugin_id: String) -> String {
  "#" <> viewport_host.slot_dom_id(viewport, plugin_id)
}

fn find_installed(
  host: ShellBoot,
  plugin_id: String,
) -> Result(InstalledApp, Nil) {
  list.find(host.booted.model.installed_apps, fn(app) { app.id == plugin_id })
}

fn install_bundle(host: ShellBoot, target: String, plugin_id: String) -> Nil {
  let _ =
    installer.resolve(host.booted.kernel, target, plugin_id)
    |> promise.map(fn(result) {
      case result {
        Error(_) -> {
          // Validation failed: roll the optimistic install back out.
          dispatch_shell_msg(UninstallApp(plugin_id))
          Nil
        }
        Ok(bundle) -> {
          dispatch_shell_msg(InstallApp(bundle.app))
          dispatch_shell_msg(OpenApp(plugin_id, None))
          Nil
        }
      }
    })
  Nil
}

/// Re-spawn an installed custom app when it is opened. Built-ins render from
/// the host-embedded schema and have no `source_url`, so they are skipped.
fn mount_installed(
  host: ShellBoot,
  plugin_id: String,
  viewport: Viewport,
  route: Option(String),
) -> Nil {
  case find_installed(host, plugin_id) {
    Error(Nil) -> Nil
    Ok(app) -> {
      case app.source_url, island_mounted(slot_selector(viewport, plugin_id)) {
        "", _ -> Nil
        _, True -> Nil
        target, False -> {
          let _ =
            installer.resolve(host.booted.kernel, target, plugin_id)
            |> promise.map(fn(result) {
              case result {
                Error(_) -> Nil
                Ok(bundle) -> {
                  offer_update(host, app, bundle.app)
                  after_render(fn() {
                    let _ =
                      spawn_plugin(
                        host,
                        slot_selector(viewport, plugin_id),
                        plugin_id,
                        bundle.content,
                        route,
                      )
                    Nil
                  })
                  Nil
                }
              }
            })
          Nil
        }
      }
    }
  }
}

/// Show the update modal once per session when a resolved app is newer.
fn offer_update(
  host: ShellBoot,
  current: InstalledApp,
  latest: InstalledApp,
) -> Nil {
  case current.version, latest.version {
    Some(current_version), Some(latest_version) -> {
      case
        updates.is_newer(latest_version, current_version),
        host.booted.model.update_modal
      {
        True, None ->
          dispatch_shell_msg(
            ShowUpdateModal(UpdateModalState(
              plugin_id: current.id,
              plugin_name: latest.name,
              current_version: current_version,
              latest_version: latest_version,
              changelog: None,
            )),
          )
        _, _ -> Nil
      }
    }
    _, _ -> Nil
  }
}

/// Re-resolve and re-spawn a plugin after the user confirms an update,
/// preserving companion placements, pinning, and enablement.
fn upgrade_plugin(host: ShellBoot, plugin_id: String) -> Nil {
  case find_installed(host, plugin_id) {
    Error(Nil) -> Nil
    Ok(app) ->
      case app.source_url {
        "" -> Nil
        target -> {
          let _ =
            installer.resolve(host.booted.kernel, target, plugin_id)
            |> promise.map(fn(result) {
              case result {
                Error(_) -> Nil
                Ok(bundle) -> {
                  unmount_island(slot_selector(Main, plugin_id))
                  let merged =
                    InstalledApp(
                      ..bundle.app,
                      placements: app.placements,
                      pinned: app.pinned,
                      enabled: app.enabled,
                    )
                  dispatch_shell_msg(InstallApp(merged))
                  dispatch_shell_msg(OpenApp(plugin_id, None))
                  Nil
                }
              }
            })
          Nil
        }
      }
  }
}

@external(javascript, "./shell_boot.ffi.mjs", "island_mounted")
fn island_mounted(selector: String) -> Bool

@external(javascript, "./shell_boot.ffi.mjs", "after_render")
fn after_render(callback: fn() -> Nil) -> Nil

/// Show runtime ACL prompts requested by the kernel in the shell modal.
pub fn watch_permission_prompts(host: ShellBoot) -> Nil {
  let _ =
    permission_prompt.watch(host.booted.permission_prompts, fn(prompt) {
      dispatch_shell_msg(ShowPermissionPrompt(prompt))
    })
  Nil
}

/// Subscribe to public relay events, feed them to built-in apps that consume
/// events, push live relay statuses, and refresh the embedded Schema views.
pub fn start_live_data(host: ShellBoot) -> Nil {
  let _ =
    coordinator.subscribe(
      host.booted.kernel.coordinator,
      "omni_internal_feed",
      [public_events_filter()],
      fn(event) {
        dict.each(host.booted.builtins, fn(_id, app) {
          case app.ingest {
            Some(ingest) -> ingest(event)
            None -> Nil
          }
        })
        push_views(host)
      },
      None,
    )

  let self_pubkey = rpc.public_key_hex(host.booted)
  let _ =
    coordinator.subscribe(
      host.booted.kernel.coordinator,
      "omni_internal_workspace",
      [workspace_filter(self_pubkey)],
      fn(event) {
        case nostr_event.get_tag_values(event.tags, "d") {
          [d_tag, ..] if d_tag == config.workspace_sync_d_tag ->
            case workspace.decode_json(event.content) {
              Ok(state) -> dispatch_shell_msg(ApplyRemoteWorkspace(state))
              Error(_) -> Nil
            }
          _ -> Nil
        }
      },
      None,
    )

  // Notes: decrypt remote NIP-78 docs and hand them to the notebook.
  let _ =
    coordinator.subscribe(
      host.booted.kernel.coordinator,
      "omni_internal_notes",
      [app_data_filter(self_pubkey)],
      fn(event) {
        case nostr_event.get_tag_values(event.tags, "d") {
          [d_tag, ..] ->
            case d_tag == "omni/checklist/v1" {
              True -> {
                dict.each(host.booted.builtins, fn(_id, app) {
                  case app.ingest_doc {
                    Some(ingest) -> ingest(event.content)
                    None -> Nil
                  }
                })
                push_views(host)
              }
              False -> {
                case string.starts_with(d_tag, "omni/notes/v1/") {
                  False -> Nil
                  True -> {
                    let private_key =
                      keystore.get_private_key(host.booted.kernel.keystore)
                    let _ =
                      nip44.nip44_decrypt(
                        private_key,
                        self_pubkey,
                        event.content,
                      )
                      |> promise.map(fn(result) {
                        case result {
                          Error(_) -> Nil
                          Ok(raw_doc) -> {
                            dict.each(host.booted.builtins, fn(_id, app) {
                              case app.ingest_doc {
                                Some(ingest) -> ingest(raw_doc)
                                None -> Nil
                              }
                            })
                            push_views(host)
                            Nil
                          }
                        }
                      })
                    Nil
                  }
                }
              }
            }
          _ -> Nil
        }
      },
      None,
    )

  // Follows: fetch the user's own kind-3 contact list into Profiles.
  let _ =
    coordinator.subscribe(
      host.booted.kernel.coordinator,
      "omni_internal_follows",
      [contact_list_filter(self_pubkey)],
      fn(event) {
        dict.each(host.booted.builtins, fn(_id, app) {
          case app.ingest {
            Some(ingest) -> ingest(event)
            None -> Nil
          }
        })
        push_views(host)
      },
      None,
    )

  // Own profile: restore display name, avatar, and NIP-05 from relays.
  let _ =
    coordinator.subscribe(
      host.booted.kernel.coordinator,
      "omni_internal_profile",
      [profile_filter(self_pubkey)],
      fn(event) {
        case social_profile.from_event(event) {
          Ok(profile) ->
            dispatch_shell_msg(
              SetUserProfile(profile_summary_for(user_npub(host), profile)),
            )
          Error(_) -> Nil
        }
      },
      None,
    )

  // Relay list: apply NIP-65 read/write scopes and add discovered relays.
  let _ =
    coordinator.subscribe(
      host.booted.kernel.coordinator,
      "omni_internal_relay_list",
      [relay_list_filter(self_pubkey)],
      fn(event) {
        boot.apply_relay_list(host.booted, event.tags)
        push_relay_statuses(
          host,
          relay_pool.get_statuses(host.booted.kernel.relay_pool),
        )
        push_views(host)
      },
      None,
    )

  push_relay_statuses(
    host,
    relay_pool.get_statuses(host.booted.kernel.relay_pool),
  )
  let _ =
    relay_pool.watch_statuses(host.booted.kernel.relay_pool, fn(statuses) {
      push_relay_statuses(host, statuses)
      push_views(host)
    })

  push_views(host)
}

fn push_relay_statuses(
  host: ShellBoot,
  statuses: List(#(relay_url.RelayUrl, relay_pool.RelayStatus)),
) -> Nil {
  list.each(statuses, fn(pair) {
    let #(url, status) = pair
    let connected = case status {
      relay_pool.Connected -> True
      _ -> False
    }
    dict.each(host.booted.builtins, fn(_id, app) {
      case app.relay_status {
        Some(update) -> update(relay_url.to_string(url), connected)
        None -> Nil
      }
    })
  })
}

fn profile_filter(author_hex: String) -> Filter {
  Filter(
    ids: None,
    authors: Some([author_hex]),
    kinds: Some([kind.Metadata]),
    since: None,
    until: None,
    limit: Some(1),
    search: None,
    tags: dict.new(),
  )
}

fn empty_profile(pubkey: pubkey.Pubkey) -> social_profile.Profile {
  social_profile.empty(pubkey.to_hex(pubkey))
}

pub fn profile_summary_for(
  npub: String,
  profile: social_profile.Profile,
) -> omni_shell_model.UserProfileSummary {
  let fallback = "npub" <> string.drop_start(npub, 5) |> string.slice(0, 8)
  let display_name = case profile.display_name {
    Some(name) if name != "" -> name
    _ ->
      case profile.name {
        Some(name) if name != "" -> name
        _ -> fallback
      }
  }
  omni_shell_model.UserProfileSummary(
    pubkey: profile.pubkey,
    npub: npub,
    display_name: display_name,
    picture: profile.picture,
    nip05: profile.nip05,
  )
}

fn app_data_filter(author_hex: String) -> Filter {
  Filter(
    ids: None,
    authors: Some([author_hex]),
    kinds: Some([kind.AppData]),
    since: None,
    until: None,
    limit: Some(250),
    search: None,
    tags: dict.new(),
  )
}

fn contact_list_filter(author_hex: String) -> Filter {
  Filter(
    ids: None,
    authors: Some([author_hex]),
    kinds: Some([kind.ContactList]),
    since: None,
    until: None,
    limit: Some(1),
    search: None,
    tags: dict.new(),
  )
}

fn relay_list_filter(author_hex: String) -> Filter {
  Filter(
    ids: None,
    authors: Some([author_hex]),
    kinds: Some([kind.RelayList]),
    since: None,
    until: None,
    limit: Some(1),
    search: None,
    tags: dict.new(),
  )
}

fn workspace_filter(author_hex: String) -> Filter {
  Filter(
    ids: None,
    authors: Some([author_hex]),
    kinds: Some([kind.AppData]),
    since: None,
    until: None,
    limit: Some(5),
    search: None,
    tags: dict.new(),
  )
}

fn public_events_filter() -> Filter {
  Filter(
    ids: None,
    authors: None,
    kinds: Some([kind.Note, kind.Metadata, kind.Repost, kind.Reaction]),
    since: None,
    until: None,
    limit: Some(80),
    search: None,
    tags: dict.new(),
  )
}

fn push_views(host: ShellBoot) -> Nil {
  dict.each(host.booted.builtins, fn(plugin_id, app) {
    dispatch_shell_msg(EmbedSchema(plugin_id, app.render()))
  })
}

@external(javascript, "./shell_boot.ffi.mjs", "dispatch_shell_msg")
fn dispatch_shell_msg(message: msg.Msg) -> Nil

/// The active shell theme ID (`"classic"`, `"panorama"`, `"editorial"`).
pub fn active_shell_id(host: ShellBoot) -> String {
  host.booted.registry.active_id
}

/// Switch the active shell theme and persist the choice.
pub fn select_shell(host: ShellBoot, shell_id: String) -> ShellBoot {
  ShellBoot(boot.select_shell(host.booted, shell_id))
}

/// Open a plugin application by ID.
pub fn open_app(host: ShellBoot, plugin_id: String) -> ShellBoot {
  ShellBoot(dispatch(host, OpenApp(plugin_id, None)))
}

/// Navigate to the Widgets dashboard.
pub fn open_widgets(host: ShellBoot) -> ShellBoot {
  ShellBoot(dispatch(host, NavigateTo(WidgetsDashboard)))
}

/// Navigate to the Apps / App Store view.
pub fn open_apps(host: ShellBoot) -> ShellBoot {
  ShellBoot(dispatch(host, NavigateTo(AppStore)))
}

/// Open Settings (profile tab by default).
pub fn open_settings(host: ShellBoot) -> ShellBoot {
  ShellBoot(dispatch(host, OpenSettings(TabProfile)))
}

/// Toggle expansive fullscreen mode.
pub fn toggle_fullscreen(host: ShellBoot) -> ShellBoot {
  ShellBoot(dispatch(host, msg.ToggleFullscreen))
}

fn dispatch(host: ShellBoot, message: msg.Msg) -> boot.Booted {
  boot.dispatch(host.booted, message) |> fn(pair) { pair.0 }
}

/// Open Settings on a specific tab ID: `"profile"`, `"relays"`, `"plugins"`,
/// `"workspace"`, `"shells"`, or `"plugin:<id>"` for a plugin settings tab.
pub fn open_settings_tab(host: ShellBoot, tab_id: String) -> ShellBoot {
  let tab = case tab_id {
    "relays" -> TabRelays
    "plugins" -> TabPlugins
    "workspace" -> TabWorkspace
    "shells" -> TabShells
    _ ->
      case string.starts_with(tab_id, "plugin:") {
        True -> TabPluginSettings(plugin_settings_id(tab_id))
        False -> TabProfile
      }
  }
  ShellBoot(dispatch(host, OpenSettings(tab)))
}

@external(javascript, "./shell_boot.ffi.mjs", "mount_island")
fn mount_island(
  selector: String,
  srcdoc: String,
  plugin_id: String,
  on_rpc: fn(String, fn(String) -> Nil) -> Nil,
) -> Nil

@external(javascript, "./shell_boot.ffi.mjs", "unmount_island")
fn unmount_island(selector: String) -> Nil

fn plugin_settings_id(tab_id: String) -> String {
  string.drop_start(tab_id, 7)
}
