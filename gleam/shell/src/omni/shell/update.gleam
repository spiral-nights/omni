//// Pure, deterministic Elm update function and side-effect descriptors for Omni Shell.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/dict
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/kernel/workspace/sync as workspace_sync
import omni/platform/clock
import omni/protocol/schema/action.{type Action}
import omni/protocol/viewport.{type Viewport, Main}
import omni/protocol/workspace.{type WorkspaceState}
import omni/shell/model.{
  type InstalledApp, type Model, type Page, InstalledApp, Model, PrimaryApp,
  Settings, Syncing, TabPluginSettings, WidgetsDashboard,
}
import omni/shell/msg.{
  type Msg, AccountSwitchResult, AddAppPlacement, ApplyRemoteWorkspace,
  ClearEmbeddedSchema, ConfirmPluginUpdate, DisablePassphrase,
  DismissIntentPrompt, DismissUpdateModal, DispatchIntent, EmbedSchema,
  EnablePassphrase, ExportKey, FinishPullRefresh, HostedSchemaAction, ImportKey,
  InstallApp, InstallCustomShell, InstallShell, KeyImportResult,
  KeySecurityResult, KeySecurityStatus, NavigateBack, NavigateTo, OpenApp,
  OpenSearch, OpenSettings, RemoveAppPlacement, ResolvePermission,
  SelectIntentHandler, SelectShell, SetAccentColor, SetAppPlacements,
  SetAppRelays, SetCapabilityGrants, SetCustomInstallUrl, SetCustomShellUrl,
  SetExportedNsec, SetKeyInput, SetPassphrase, SetSearchQuery, SetSyncStatus,
  SetThemeMode, SetUserProfile, ShowIntentPrompt, ShowPermissionPrompt,
  ShowUpdateModal, StartPullRefresh, SwitchAccount, ToggleAppEnabled,
  ToggleAppIntent, ToggleAppPinned, ToggleAutoSync, ToggleCapabilityGrant,
  ToggleFullscreen, TriggerWorkspaceSync, UninstallApp, UninstallShell,
  UnlockKey,
}

/// Side-effect commands emitted by the pure shell `update` function.
pub type ShellEffect {
  MountPluginInSlot(
    plugin_id: String,
    viewport: Viewport,
    route: Option(String),
  )
  UnmountPluginFromSlot(plugin_id: String, viewport: Viewport)
  PersistWorkspaceLocal(WorkspaceState)
  PublishWorkspaceNip78(WorkspaceState)
  SwitchActiveShell(shell_id: String)
  PersistAccentColor(String)
  PersistThemeMode(String)
  ImportKeyEffect(String)
  ExportKeyEffect
  EnablePassphraseEffect(String)
  DisablePassphraseEffect
  UnlockKeyEffect(String)
  SwitchAccountEffect(String)
  DispatchIntentToPlugin(
    plugin_id: String,
    intent_name: String,
    payload_json: String,
  )
  UpgradePlugin(plugin_id: String)
  RouteIntent(intent_name: String)
  RefreshActiveView
  DispatchHostedAction(plugin_id: String, action: Action)
  PermissionDecision(prompt_id: Int, allowed: Bool)
  InstallPluginFromUrl(url: String, plugin_id: String)
}

/// Pure, exhaustive, deterministic state transition for `Model`.
pub fn update(model: Model, msg: Msg) -> #(Model, List(ShellEffect)) {
  case msg {
    NavigateTo(page) -> {
      let next_model =
        Model(..model, active_page: page, back_stack: push_back(model, page))
      let mount_effects = case page {
        PrimaryApp(plugin_id, route) -> [
          MountPluginInSlot(plugin_id: plugin_id, viewport: Main, route: route),
        ]
        WidgetsDashboard -> widget_mount_effects(model)
        _ -> []
      }
      #(
        next_model,
        list.append(mount_effects, workspace_persistence_effects(next_model)),
      )
    }

    OpenApp(plugin_id, route) -> {
      let page = PrimaryApp(plugin_id: plugin_id, route: route)
      let next_model =
        Model(..model, active_page: page, back_stack: push_back(model, page))
      let effects = [
        MountPluginInSlot(plugin_id: plugin_id, viewport: Main, route: route),
        ..workspace_persistence_effects(next_model)
      ]
      #(next_model, effects)
    }

    OpenSettings(tab) -> {
      let page = Settings(tab: tab)
      let next_model =
        Model(..model, active_page: page, back_stack: push_back(model, page))
      let mount_effects = case tab {
        TabPluginSettings(plugin_id) -> [
          MountPluginInSlot(
            plugin_id: plugin_id,
            viewport: Main,
            route: Some("?view=settings"),
          ),
        ]
        _ -> []
      }
      #(
        next_model,
        list.append(mount_effects, workspace_persistence_effects(next_model)),
      )
    }

    NavigateBack -> {
      case model.back_stack {
        [previous, ..rest] -> {
          let next_model =
            Model(..model, active_page: previous, back_stack: rest)
          #(next_model, workspace_persistence_effects(next_model))
        }
        [] -> #(model, [])
      }
    }

    ToggleFullscreen -> {
      #(Model(..model, fullscreen: !model.fullscreen), [])
    }

    OpenSearch -> #(model, [RouteIntent("search")])

    ToggleAppEnabled(plugin_id) -> {
      let target = model.find_app(model, plugin_id)
      let updated_apps =
        list.map(model.installed_apps, fn(app) {
          case app.id == plugin_id {
            True -> InstalledApp(..app, enabled: !app.enabled)
            False -> app
          }
        })

      let next_page = case model.active_page, target {
        PrimaryApp(active_id, _), Some(app)
          if active_id == plugin_id && app.enabled
        -> fallback_page_for_apps(updated_apps)
        page, _ -> page
      }

      let next_model =
        Model(..model, installed_apps: updated_apps, active_page: next_page)

      let slot_effects = case target {
        Some(app) ->
          case app.enabled {
            True -> {
              // Disabling app: unmount from Main (if active) and all companion placements
              let placement_unmounts =
                list.map(app.placements, fn(p) {
                  UnmountPluginFromSlot(
                    plugin_id: plugin_id,
                    viewport: p.viewport,
                  )
                })
              [
                UnmountPluginFromSlot(plugin_id: plugin_id, viewport: Main),
                ..placement_unmounts
              ]
            }
            False -> {
              // Enabling app: mount any configured companion placements
              list.map(app.placements, fn(p) {
                MountPluginInSlot(
                  plugin_id: plugin_id,
                  viewport: p.viewport,
                  route: p.route,
                )
              })
            }
          }
        None -> []
      }

      #(
        next_model,
        list.append(slot_effects, workspace_persistence_effects(next_model)),
      )
    }

    ToggleAppPinned(plugin_id) -> {
      let updated_apps =
        list.map(model.installed_apps, fn(app) {
          case app.id == plugin_id {
            True -> InstalledApp(..app, pinned: !app.pinned)
            False -> app
          }
        })
      let next_model = Model(..model, installed_apps: updated_apps)
      #(next_model, workspace_persistence_effects(next_model))
    }

    SetAppPlacements(plugin_id, placements) -> {
      let prev_app = model.find_app(model, plugin_id)
      let updated_apps =
        list.map(model.installed_apps, fn(app) {
          case app.id == plugin_id {
            True -> InstalledApp(..app, placements: placements)
            False -> app
          }
        })
      let next_model = Model(..model, installed_apps: updated_apps)

      let unmount_removed = case prev_app {
        Some(prev) ->
          prev.placements
          |> list.filter(fn(old_p) {
            !list.any(placements, fn(new_p) { new_p.viewport == old_p.viewport })
          })
          |> list.map(fn(old_p) {
            UnmountPluginFromSlot(
              plugin_id: plugin_id,
              viewport: old_p.viewport,
            )
          })
        None -> []
      }

      let mount_current =
        list.map(placements, fn(p) {
          MountPluginInSlot(
            plugin_id: plugin_id,
            viewport: p.viewport,
            route: p.route,
          )
        })

      let effects =
        list.flatten([
          unmount_removed,
          mount_current,
          workspace_persistence_effects(next_model),
        ])
      #(next_model, effects)
    }

    AddAppPlacement(plugin_id, placement) -> {
      let updated_apps =
        list.map(model.installed_apps, fn(app) {
          case app.id == plugin_id {
            True -> {
              let filtered =
                list.filter(app.placements, fn(p) {
                  p.viewport != placement.viewport
                })
              InstalledApp(
                ..app,
                placements: list.append(filtered, [placement]),
              )
            }
            False -> app
          }
        })
      let next_model = Model(..model, installed_apps: updated_apps)
      let effects = [
        MountPluginInSlot(
          plugin_id: plugin_id,
          viewport: placement.viewport,
          route: placement.route,
        ),
        ..workspace_persistence_effects(next_model)
      ]
      #(next_model, effects)
    }

    RemoveAppPlacement(plugin_id, viewport) -> {
      let updated_apps =
        list.map(model.installed_apps, fn(app) {
          case app.id == plugin_id {
            True -> {
              let filtered =
                list.filter(app.placements, fn(p) { p.viewport != viewport })
              InstalledApp(..app, placements: filtered)
            }
            False -> app
          }
        })
      let next_model = Model(..model, installed_apps: updated_apps)
      let effects = [
        UnmountPluginFromSlot(plugin_id: plugin_id, viewport: viewport),
        ..workspace_persistence_effects(next_model)
      ]
      #(next_model, effects)
    }

    InstallApp(new_app) -> {
      let exists = list.any(model.installed_apps, fn(a) { a.id == new_app.id })
      let updated_apps = case exists {
        True ->
          list.map(model.installed_apps, fn(a) {
            case a.id == new_app.id {
              True -> new_app
              False -> a
            }
          })
        False -> list.append(model.installed_apps, [new_app])
      }
      let next_model =
        Model(..model, installed_apps: updated_apps, custom_install_url: "")
      // Only a first install triggers resolution; later `InstallApp` messages
      // carry already-resolved metadata (e.g. updates) and must not re-fetch.
      let is_custom_nsite = string.starts_with(new_app.id, "nsite.custom.")
      let install_effects = case exists, new_app.source_url {
        False, url if url != "" && is_custom_nsite -> [
          InstallPluginFromUrl(url: url, plugin_id: new_app.id),
        ]
        _, _ -> []
      }
      #(
        next_model,
        list.append(workspace_persistence_effects(next_model), install_effects),
      )
    }

    UninstallApp(plugin_id) -> {
      let target = model.find_app(model, plugin_id)
      let updated_apps =
        list.filter(model.installed_apps, fn(a) { a.id != plugin_id })
      let next_page = case model.active_page {
        PrimaryApp(active_id, _) if active_id == plugin_id ->
          fallback_page_for_apps(updated_apps)
        page -> page
      }
      let next_model =
        Model(..model, installed_apps: updated_apps, active_page: next_page)

      let unmount_effects = case target {
        Some(app) -> {
          let placement_unmounts =
            list.map(app.placements, fn(p) {
              UnmountPluginFromSlot(plugin_id: plugin_id, viewport: p.viewport)
            })
          [
            UnmountPluginFromSlot(plugin_id: plugin_id, viewport: Main),
            ..placement_unmounts
          ]
        }
        None -> [UnmountPluginFromSlot(plugin_id: plugin_id, viewport: Main)]
      }

      #(
        next_model,
        list.append(unmount_effects, workspace_persistence_effects(next_model)),
      )
    }

    SetCustomInstallUrl(url) -> {
      #(Model(..model, custom_install_url: url), [])
    }

    SetSearchQuery(query) -> {
      #(Model(..model, search_query: query), [])
    }

    ToggleAppIntent(plugin_id, intent_name) -> {
      let updated_apps =
        list.map(model.installed_apps, fn(app) {
          case app.id == plugin_id {
            True -> {
              let next_disabled = case
                list.contains(app.disabled_intents, intent_name)
              {
                True ->
                  list.filter(app.disabled_intents, fn(i) { i != intent_name })
                False -> list.append(app.disabled_intents, [intent_name])
              }
              InstalledApp(..app, disabled_intents: next_disabled)
            }
            False -> app
          }
        })
      let next_model = Model(..model, installed_apps: updated_apps)
      #(next_model, workspace_persistence_effects(next_model))
    }

    ShowPermissionPrompt(prompt) -> #(
      Model(..model, permission_prompt: Some(prompt)),
      [],
    )

    ResolvePermission(prompt_id, allowed) -> #(
      Model(..model, permission_prompt: None),
      [
        PermissionDecision(prompt_id, allowed),
      ],
    )

    SetCapabilityGrants(grants) -> #(
      Model(..model, capability_grants: grants),
      [],
    )

    SetCustomShellUrl(url) -> #(Model(..model, custom_shell_url: url), [])

    InstallShell(_shell_id) -> #(model, [])
    UninstallShell(_shell_id) -> #(model, [])
    InstallCustomShell(_base_layout) -> #(model, [])

    ToggleCapabilityGrant(_plugin_id, _capability, _scope, _allowed) -> #(
      model,
      [],
    )

    ShowIntentPrompt(prompt) -> {
      #(Model(..model, intent_prompt: Some(prompt)), [])
    }

    SelectIntentHandler(plugin_id) -> {
      case model.intent_prompt {
        Some(prompt) -> {
          let next_page = PrimaryApp(plugin_id: plugin_id, route: None)
          let next_model =
            Model(..model, active_page: next_page, intent_prompt: None)
          let effects = [
            MountPluginInSlot(plugin_id: plugin_id, viewport: Main, route: None),
            DispatchIntentToPlugin(
              plugin_id: plugin_id,
              intent_name: prompt.intent_name,
              payload_json: prompt.payload_json,
            ),
          ]
          #(next_model, effects)
        }
        None -> #(model, [])
      }
    }

    DismissIntentPrompt -> {
      #(Model(..model, intent_prompt: None), [])
    }

    SetAppRelays(plugin_id, relays) -> {
      let updated_apps =
        list.map(model.installed_apps, fn(app) {
          case app.id == plugin_id {
            True -> InstalledApp(..app, relays: relays)
            False -> app
          }
        })
      let next_model = Model(..model, installed_apps: updated_apps)
      #(next_model, workspace_persistence_effects(next_model))
    }

    EmbedSchema(plugin_id, node) -> #(
      Model(
        ..model,
        embedded_views: dict.insert(model.embedded_views, plugin_id, node),
      ),
      [],
    )

    ClearEmbeddedSchema(plugin_id) -> #(
      Model(
        ..model,
        embedded_views: dict.delete(model.embedded_views, plugin_id),
      ),
      [],
    )

    HostedSchemaAction(plugin_id, action) -> #(model, [
      DispatchHostedAction(plugin_id, action),
    ])

    DispatchIntent(_action, _payload) -> #(model, [])

    SelectShell(shell_id) -> {
      let next_model = Model(..model, active_shell_id: shell_id)
      let effects = [
        SwitchActiveShell(shell_id: shell_id),
        ..workspace_persistence_effects(next_model)
      ]
      #(next_model, effects)
    }

    SetAccentColor(color) -> {
      let next_model = Model(..model, accent_color: color)
      #(next_model, [PersistAccentColor(color)])
    }

    SetThemeMode(mode) -> {
      let normalized = case string.lowercase(string.trim(mode)) {
        "light" -> "light"
        "system" -> "system"
        "auto" -> "system"
        _ -> "dark"
      }
      #(Model(..model, theme_mode: normalized), [PersistThemeMode(normalized)])
    }

    SetKeyInput(raw) -> #(Model(..model, key_input: raw), [])

    ImportKey -> {
      case string.trim(model.key_input) {
        "" -> #(
          Model(..model, key_message: Some("Enter an nsec or hex key")),
          [],
        )
        raw -> #(model, [ImportKeyEffect(raw)])
      }
    }

    ExportKey -> #(model, [ExportKeyEffect])

    KeyImportResult(result) -> {
      let message = case result {
        Ok(_) -> "Key imported. Signing as the new identity."
        Error(err) -> err
      }
      #(
        Model(..model, key_input: "", key_message: Some(message)),
        workspace_persistence_effects(model),
      )
    }

    SetPassphrase(value) -> #(Model(..model, passphrase: value), [])

    EnablePassphrase -> {
      case string.trim(model.passphrase) {
        "" -> #(Model(..model, key_message: Some("Enter a passphrase")), [])
        passphrase -> #(model, [EnablePassphraseEffect(passphrase)])
      }
    }

    DisablePassphrase -> #(model, [DisablePassphraseEffect])

    UnlockKey -> {
      case string.trim(model.passphrase) {
        "" -> #(Model(..model, key_message: Some("Enter your passphrase")), [])
        passphrase -> #(model, [UnlockKeyEffect(passphrase)])
      }
    }

    KeySecurityStatus(encrypted, locked) -> #(
      Model(
        ..model,
        key_encrypted: encrypted,
        key_locked: locked,
        passphrase: "",
      ),
      [],
    )

    SwitchAccount(pubkey_hex) -> #(model, [SwitchAccountEffect(pubkey_hex)])

    AccountSwitchResult(result) -> {
      let message = case result {
        Ok(Nil) -> "Switched account."
        Error(err) -> err
      }
      #(Model(..model, key_message: Some(message)), [])
    }

    KeySecurityResult(result) -> {
      let message = case result {
        Ok(Nil) -> None
        Error(err) -> Some(err)
      }
      #(Model(..model, key_message: message), [])
    }

    SetExportedNsec(result) -> {
      case result {
        Ok(nsec) -> #(
          Model(..model, exported_nsec: Some(nsec), key_message: None),
          [],
        )
        Error(err) -> #(Model(..model, key_message: Some(err)), [])
      }
    }

    SetUserProfile(profile) -> {
      #(Model(..model, user_profile: Some(profile)), [])
    }

    SetSyncStatus(status) -> {
      #(Model(..model, sync_status: status), [])
    }

    ToggleAutoSync(enabled) -> {
      let next_model = Model(..model, auto_sync_nip78: enabled)
      #(next_model, workspace_persistence_effects(next_model))
    }

    TriggerWorkspaceSync -> {
      let ws = model.to_workspace_state(model, clock.system().now_ms())
      let next_model = Model(..model, sync_status: Syncing)
      #(next_model, [
        PersistWorkspaceLocal(ws),
        PublishWorkspaceNip78(ws),
      ])
    }

    ApplyRemoteWorkspace(remote) -> {
      let local = model.to_workspace_state(model, clock.system().now_ms())
      let merged = workspace_sync.merge(local, remote)
      let next_model = model.apply_workspace_state(model, merged)
      #(next_model, [PersistWorkspaceLocal(merged)])
    }

    ShowUpdateModal(modal) -> {
      #(Model(..model, update_modal: Some(modal)), [])
    }

    ConfirmPluginUpdate(plugin_id) -> {
      let next_model = Model(..model, update_modal: None)
      #(next_model, [UpgradePlugin(plugin_id: plugin_id)])
    }

    DismissUpdateModal -> {
      #(Model(..model, update_modal: None), [])
    }

    StartPullRefresh -> {
      #(Model(..model, pull_refreshing: True), [RefreshActiveView])
    }

    FinishPullRefresh -> {
      #(Model(..model, pull_refreshing: False), [])
    }
  }
}

fn fallback_page_for_apps(apps: List(InstalledApp)) -> Page {
  case model.first_enabled_app(apps) {
    Some(app) -> PrimaryApp(plugin_id: app.id, route: None)
    None -> WidgetsDashboard
  }
}

fn widget_mount_effects(model: Model) -> List(ShellEffect) {
  model.installed_apps
  |> list.filter(fn(app) { app.enabled })
  |> list.flat_map(fn(app) {
    list.map(app.placements, fn(placement) {
      MountPluginInSlot(
        plugin_id: app.id,
        viewport: placement.viewport,
        route: placement.route,
      )
    })
  })
}

fn push_back(model: Model, next: Page) -> List(Page) {
  case model.active_page == next {
    True -> model.back_stack
    False -> [model.active_page, ..model.back_stack]
  }
}

fn workspace_persistence_effects(model: Model) -> List(ShellEffect) {
  let ws = model.to_workspace_state(model, clock.system().now_ms())
  case model.auto_sync_nip78 {
    True -> [PersistWorkspaceLocal(ws), PublishWorkspaceNip78(ws)]
    False -> [PersistWorkspaceLocal(ws)]
  }
}
