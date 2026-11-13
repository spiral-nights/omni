//// Shell messages representing user actions, navigation, placements, and system events.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/dict.{type Dict}
import gleam/dynamic.{type Dynamic}
import gleam/option.{type Option}
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{type Node}
import omni/protocol/viewport.{type Viewport}
import omni/protocol/workspace.{type WorkspaceState}
import omni/shell/model.{
  type InstalledApp, type IntentPromptState, type Page,
  type PermissionPromptState, type PlacementConfig, type SettingsTab,
  type SyncStatus, type UpdateModalState, type UserProfileSummary,
}

/// Messages processed by the Omni Shell Elm update loop.
pub type Msg {
  // Navigation
  NavigateTo(Page)
  NavigateBack
  OpenApp(plugin_id: String, route: Option(String))
  OpenSettings(SettingsTab)
  ToggleFullscreen
  OpenSearch

  // App lifecycle & placements
  ToggleAppEnabled(plugin_id: String)
  ToggleAppPinned(plugin_id: String)
  SetAppPlacements(plugin_id: String, placements: List(PlacementConfig))
  AddAppPlacement(plugin_id: String, placement: PlacementConfig)
  RemoveAppPlacement(plugin_id: String, viewport: Viewport)
  InstallApp(InstalledApp)
  UninstallApp(plugin_id: String)
  SetCustomInstallUrl(String)
  SetSearchQuery(String)

  // Intents & permissions
  ToggleAppIntent(plugin_id: String, intent_name: String)
  ShowIntentPrompt(IntentPromptState)
  SelectIntentHandler(plugin_id: String)
  DismissIntentPrompt

  // Relay scoping
  SetAppRelays(plugin_id: String, relays: Option(List(String)))

  // Host-rendered built-in plugin views
  EmbedSchema(plugin_id: String, node: Node)
  ClearEmbeddedSchema(plugin_id: String)
  HostedSchemaAction(plugin_id: String, action: Action)
  DispatchIntent(action: String, payload: Option(Dict(String, Dynamic)))

  // Shell & theme
  SelectShell(shell_id: String)
  SetAccentColor(String)
  SetThemeMode(String)
  SetKeyInput(String)
  ImportKey
  ExportKey
  KeyImportResult(Result(Nil, String))
  SetExportedNsec(Result(String, String))
  SetPassphrase(String)
  EnablePassphrase
  DisablePassphrase
  UnlockKey
  KeySecurityStatus(encrypted: Bool, locked: Bool)
  KeySecurityResult(Result(Nil, String))
  SwitchAccount(String)
  AccountSwitchResult(Result(Nil, String))

  // Profile & sync
  SetUserProfile(UserProfileSummary)
  SetSyncStatus(SyncStatus)
  ToggleAutoSync(Bool)
  TriggerWorkspaceSync
  ApplyRemoteWorkspace(WorkspaceState)

  // Permission prompts
  ShowPermissionPrompt(PermissionPromptState)
  ResolvePermission(prompt_id: Int, allowed: Bool)

  // Modals & gestures
  ShowUpdateModal(UpdateModalState)
  ConfirmPluginUpdate(plugin_id: String)
  DismissUpdateModal
  StartPullRefresh
  FinishPullRefresh
}
