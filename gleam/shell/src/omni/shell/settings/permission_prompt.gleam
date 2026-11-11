//// Runtime capability prompt modal.

import gleam/option.{None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/model.{type Model}
import omni/shell/msg.{type Msg, ResolvePermission}
import omni/ui/icons

/// Render the permission prompt modal when a capability request is pending.
pub fn render_permission_prompt(model: Model) -> Element(Msg) {
  case model.permission_prompt {
    None -> element.none()
    Some(prompt) ->
      html.div(
        [
          attribute.class("omni-modal-overlay open"),
          attribute.id("omni-permission-prompt"),
        ],
        [
          html.div([attribute.class("omni-modal-card")], [
            html.header([attribute.class("omni-modal-header")], [
              html.div([attribute.class("omni-modal-title-group")], [
                html.div([attribute.class("omni-update-modal-icon")], [
                  icons.render_icon("key", 16),
                ]),
                html.h3([attribute.class("omni-modal-title")], [
                  element.text("Permission Request"),
                ]),
              ]),
            ]),
            html.div([attribute.class("omni-update-modal-body")], [
              html.p([attribute.class("omni-update-modal-description")], [
                element.text("Application "),
                html.code([], [element.text(prompt.plugin_id)]),
                element.text(" requests "),
                html.code([], [element.text(prompt.capability)]),
                element.text("."),
              ]),
              case prompt.scope {
                None -> element.none()
                Some(scope) ->
                  html.code([attribute.class("omni-update-version-diff")], [
                    element.text("scope: " <> scope),
                  ])
              },
            ]),
            html.footer([attribute.class("omni-modal-footer")], [
              html.button(
                [
                  attribute.type_("button"),
                  attribute.class("omni-button omni-button-secondary"),
                  event.on_click(ResolvePermission(prompt.id, False)),
                ],
                [element.text("Deny")],
              ),
              html.button(
                [
                  attribute.type_("button"),
                  attribute.class("omni-button omni-button-primary"),
                  event.on_click(ResolvePermission(prompt.id, True)),
                ],
                [element.text("Allow")],
              ),
            ]),
          ]),
        ],
      )
  }
}
