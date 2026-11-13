//// Top header quick actions, sync status indicator, fullscreen toggle, and profile button.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/list
import gleam/option.{None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/protocol/viewport.{HeaderActions}
import omni/shell/layout/viewport_host
import omni/shell/model.{
  type InstalledApp, type Model, type PlacementConfig, type SyncStatus,
  SyncError, SyncIdle, Synced, Syncing, TabProfile,
}
import omni/shell/msg.{
  type Msg, NavigateBack, OpenApp, OpenSettings, ToggleFullscreen,
  TriggerWorkspaceSync,
}
import omni/shell/shell
import omni/ui/icons
import omni/ui/plugin_icon
import omni/ui/sanitize

/// Render an in-app back button when there is navigation history.
pub fn render_back_button(model: Model) -> Element(Msg) {
  case model.back_stack {
    [] -> element.none()
    _ ->
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-shell-back"),
          attribute.class("omni-header-action-btn omni-back-btn"),
          attribute.title("Back"),
          attribute.attribute("aria-label", "Back"),
          event.on_click(NavigateBack),
        ],
        [icons.render_icon("arrow-left", 18)],
      )
  }
}

/// Render the header quick-actions toolbar (`<div class="omni-header-actions">`).
pub fn render_header_actions(model: Model) -> Element(Msg) {
  let sync_el = render_sync_indicator(model.sync_status)

  let action_pills =
    model.header_action_apps(model)
    |> list.map(fn(pair) { render_header_action_pill(pair.0, pair.1) })

  let fullscreen_btn =
    html.button(
      [
        attribute.type_("button"),
        attribute.id("btn-shell-toggle-fullscreen"),
        attribute.class("omni-header-action-btn"),
        attribute.title(case model.fullscreen {
          True -> "Exit Fullscreen"
          False -> "Toggle Fullscreen"
        }),
        attribute.attribute("aria-label", case model.fullscreen {
          True -> "Exit Fullscreen"
          False -> "Toggle Fullscreen"
        }),
        event.on_click(ToggleFullscreen),
      ],
      [icons.render_icon("layout", 16)],
    )

  let profile_btn = render_profile_button(model)

  html.div(
    [attribute.class("omni-header-actions")],
    list.flatten([[sync_el], action_pills, [fullscreen_btn, profile_btn]]),
  )
}

fn render_sync_indicator(status: SyncStatus) -> Element(Msg) {
  let #(status_class, label, icon_name) = case status {
    SyncIdle -> #("sync-idle", "Local", "cloud")
    Syncing -> #("sync-active", "Syncing...", "spinner")
    Synced(_) -> #("sync-ok", "Synced", "check-circle")
    SyncError(_) -> #("sync-error", "Sync Error", "refresh")
  }

  html.button(
    [
      attribute.type_("button"),
      attribute.class("omni-sync-status " <> status_class),
      attribute.title("Workspace Sync: " <> label),
      attribute.attribute("data-sync-status", status_class),
      event.on_click(TriggerWorkspaceSync),
    ],
    [
      icons.render_icon(icon_name, 14),
      html.span([attribute.class("omni-sync-label")], [element.text(label)]),
    ],
  )
}

fn render_header_action_pill(
  app: InstalledApp,
  placement: PlacementConfig,
) -> Element(Msg) {
  let title = model.app_title(app)
  html.div([attribute.class("omni-header-action-item")], [
    html.button(
      [
        attribute.type_("button"),
        attribute.class("omni-header-action-pill"),
        attribute.title(title),
        event.on_click(OpenApp(app.id, placement.route)),
      ],
      [
        plugin_icon.render(app.icon, 14),
        html.span([attribute.class("omni-header-action-label")], [
          element.text(title),
        ]),
      ],
    ),
    viewport_host.render_slot_anchor(
      HeaderActions,
      app.id,
      placement.route,
      True,
    ),
  ])
}

fn render_profile_button(model: Model) -> Element(Msg) {
  let #(display_name, avatar_src) = case model.user_profile {
    Some(profile) -> {
      let safe_pic = case profile.picture {
        Some(raw) -> sanitize.sanitize_url(raw)
        None -> None
      }
      let img_url = case safe_pic {
        Some(url) -> url
        None -> shell.avatar_data_uri(profile.pubkey, profile.display_name)
      }
      #(profile.display_name, img_url)
    }
    None -> #("Profile", shell.avatar_data_uri("anonymous", "P"))
  }

  html.button(
    [
      attribute.type_("button"),
      attribute.id("btn-header-profile"),
      attribute.class("omni-header-profile-btn"),
      attribute.title(display_name),
      attribute.attribute("aria-label", "Open Profile Settings"),
      event.on_click(OpenSettings(TabProfile)),
    ],
    [
      html.img([
        attribute.class("omni-header-avatar"),
        attribute.src(avatar_src),
        attribute.alt(display_name),
      ]),
      html.span([attribute.class("omni-header-profile-name")], [
        element.text(display_name),
      ]),
    ],
  )
}
