//// Plugin update confirmation modal dialog.
////
//// Renders a modal when `model.update_modal` is `Some(state)` displaying
//// `plugin_name`, `current_version -> latest_version`, optional `changelog`,
//// "Update Now" (`ConfirmPluginUpdate(state.plugin_id)`), and "Later"
//// (`DismissUpdateModal`). Zero emojis; strictly plugin-agnostic.

import gleam/option.{None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/model.{type Model, type UpdateModalState}
import omni/shell/msg.{type Msg, ConfirmPluginUpdate, DismissUpdateModal}
import omni/ui/icons

/// Render the plugin update confirmation modal when `model.update_modal` is `Some(state)`.
pub fn render_update_modal(model: Model) -> Element(Msg) {
  case model.update_modal {
    None -> element.none()
    Some(state) -> render_active_update_modal(state)
  }
}

fn render_active_update_modal(state: UpdateModalState) -> Element(Msg) {
  let version_transition =
    "v" <> state.current_version <> " -> v" <> state.latest_version

  let changelog_el = case state.changelog {
    Some(notes) if notes != "" ->
      html.div([attribute.class("omni-update-changelog")], [
        html.strong([attribute.class("omni-update-changelog-title")], [
          element.text("Release Notes"),
        ]),
        html.p([attribute.class("omni-update-changelog-body")], [
          element.text(notes),
        ]),
      ])
    _ -> element.none()
  }

  html.div(
    [
      attribute.class("omni-modal-overlay open"),
      attribute.id("update-app-modal"),
      attribute.attribute("role", "dialog"),
      attribute.attribute("aria-modal", "true"),
      attribute.attribute("aria-labelledby", "update-modal-title"),
    ],
    [
      html.div([attribute.class("omni-modal-card update-modal-card")], [
        html.header([attribute.class("omni-modal-header")], [
          html.div([attribute.class("omni-modal-title-group")], [
            html.div([attribute.class("omni-update-modal-icon")], [
              icons.render_icon("download", 20),
            ]),
            html.div([], [
              html.h3(
                [
                  attribute.id("update-modal-title"),
                  attribute.class("omni-modal-title"),
                ],
                [element.text("Update " <> state.plugin_name)],
              ),
              html.span([attribute.class("omni-update-modal-meta")], [
                element.text(state.plugin_id),
              ]),
            ]),
          ]),
          html.button(
            [
              attribute.type_("button"),
              attribute.id("btn-close-update-modal"),
              attribute.class("omni-modal-close-btn"),
              attribute.title("Later"),
              event.on_click(DismissUpdateModal),
            ],
            [icons.render_icon("close", 18)],
          ),
        ]),
        html.div([attribute.class("omni-update-modal-body")], [
          html.div([attribute.class("omni-update-version-banner")], [
            icons.render_icon("refresh", 16),
            html.code([attribute.class("omni-update-version-diff")], [
              element.text(version_transition),
            ]),
          ]),
          html.p([attribute.class("omni-update-modal-description")], [
            element.text(
              "A newer version of "
              <> state.plugin_name
              <> " is available. Updating preserves your assigned companion viewports, permissions, and local storage.",
            ),
          ]),
          changelog_el,
        ]),
        html.footer([attribute.class("omni-modal-footer")], [
          html.button(
            [
              attribute.type_("button"),
              attribute.id("btn-update-later"),
              attribute.class("omni-button omni-button-secondary"),
              event.on_click(DismissUpdateModal),
            ],
            [element.text("Later")],
          ),
          html.button(
            [
              attribute.type_("button"),
              attribute.id("btn-confirm-plugin-update"),
              attribute.class("omni-button omni-button-primary"),
              event.on_click(ConfirmPluginUpdate(state.plugin_id)),
            ],
            [
              icons.render_icon("check", 14),
              html.span([], [element.text("Update Now")]),
            ],
          ),
        ]),
      ]),
    ],
  )
}
