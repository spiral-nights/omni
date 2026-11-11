//// Per-plugin intent capability configuration and "Open With..." intent chooser modal.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/list
import gleam/option.{None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/model.{type InstalledApp, type IntentPromptState, type Model}
import omni/shell/msg.{
  type Msg, DismissIntentPrompt, SelectIntentHandler, ToggleAppIntent,
}
import omni/ui/icons

/// Friendly metadata for standard cross-application intents.
pub type IntentDescriptor {
  IntentDescriptor(action: String, label: String, description: String)
}

/// Resolve human-friendly label and description for a Nostr / web intent name.
pub fn describe_intent(action: String) -> IntentDescriptor {
  case action {
    "compose_note" | "compose-note" ->
      IntentDescriptor(
        action: action,
        label: "Compose Note",
        description: "Compose and draft Nostr notes",
      )
    "create_note" | "create-note" ->
      IntentDescriptor(
        action: action,
        label: "Create Note",
        description: "Compose and publish short Nostr notes",
      )
    "view_note" | "view-note" ->
      IntentDescriptor(
        action: action,
        label: "View Note",
        description: "Display note threads and Nostr event URIs",
      )
    "share" ->
      IntentDescriptor(
        action: action,
        label: "Web Share",
        description: "Target for standard navigator.share() drafts",
      )
    "view_profile" | "view-profile" ->
      IntentDescriptor(
        action: action,
        label: "View Profile",
        description: "Display user profile and NIP-05 metadata",
      )
    "edit_profile" | "edit-profile" ->
      IntentDescriptor(
        action: action,
        label: "Edit Profile",
        description: "Edit account metadata and cryptographic key custody",
      )
    "create_task" | "create-task" ->
      IntentDescriptor(
        action: action,
        label: "Create Task",
        description: "Add tasks and checklist items",
      )
    "pay_invoice" | "pay-invoice" ->
      IntentDescriptor(
        action: action,
        label: "Lightning Payment",
        description: "Pay Lightning BOLT-11 or Cashu token URIs",
      )
    _ ->
      IntentDescriptor(
        action: action,
        label: action,
        description: "Handler for \"" <> action <> "\" intent",
      )
  }
}

/// Render the Intents & Protocol Handlers configuration panel for Settings.
pub fn render_intents_panel(model: Model) -> Element(Msg) {
  let cards =
    list.map(model.installed_apps, fn(app) { render_app_intents_card(app) })

  let content = case cards {
    [] -> [
      html.div([attribute.class("omni-empty-state")], [
        html.p([attribute.class("omni-empty-state-description")], [
          element.text("No applications installed."),
        ]),
      ]),
    ]
    items -> items
  }

  html.section(
    [
      attribute.class("omni-settings-panel omni-intents-panel"),
      attribute.id("settings-intents-panel"),
    ],
    [
      html.header([attribute.class("omni-settings-section-header")], [
        html.div([attribute.class("omni-settings-title-group")], [
          icons.render_icon("bolt", 18),
          html.h3([attribute.class("omni-settings-section-title")], [
            element.text("Handled Intents & Protocol Routing"),
          ]),
        ]),
        html.p([attribute.class("omni-settings-section-desc")], [
          element.text(
            "Enable or disable which cross-application intents and protocol URIs (nostr:, lightning:, cashu:) each application is permitted to handle.",
          ),
        ]),
      ]),
      html.div([attribute.class("omni-intents-app-list")], content),
    ],
  )
}

fn render_app_intents_card(app: InstalledApp) -> Element(Msg) {
  let title = model.app_title(app)
  let intents_content = case app.handled_intents {
    [] ->
      html.div([attribute.class("omni-empty-intents-note")], [
        element.text("No declared intent handlers for this application."),
      ])
    intents ->
      html.div(
        [attribute.class("omni-intent-capability-list")],
        list.map(intents, fn(intent_name) {
          render_intent_toggle_row(app, intent_name)
        }),
      )
  }

  html.article(
    [
      attribute.class("omni-settings-card plugin-handled-intents-section"),
      attribute.attribute("data-intents-app", app.id),
    ],
    [
      html.div([attribute.class("omni-settings-card-header")], [
        html.div([attribute.class("omni-settings-app-identity")], [
          icons.render_icon(app.icon, 18),
          html.div([attribute.class("omni-settings-app-titles")], [
            html.strong([attribute.class("omni-settings-app-name")], [
              element.text(title),
            ]),
            html.span([attribute.class("omni-settings-app-id")], [
              element.text(app.id),
            ]),
          ]),
        ]),
      ]),
      intents_content,
    ],
  )
}

fn render_intent_toggle_row(
  app: InstalledApp,
  intent_name: String,
) -> Element(Msg) {
  let info = describe_intent(intent_name)
  let is_disabled = list.contains(app.disabled_intents, intent_name)
  let is_enabled = !is_disabled

  html.div(
    [
      attribute.class(case is_enabled {
        True -> "intent-capability-card enabled"
        False -> "intent-capability-card disabled"
      }),
      attribute.attribute("data-intent-name", intent_name),
    ],
    [
      html.div([attribute.class("intent-capability-info")], [
        html.div([attribute.class("intent-capability-title-row")], [
          html.strong([attribute.class("intent-capability-label")], [
            element.text(info.label),
          ]),
          html.code([attribute.class("intent-capability-code")], [
            element.text(info.action),
          ]),
        ]),
        html.span([attribute.class("intent-capability-desc")], [
          element.text(info.description),
        ]),
      ]),
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-toggle-intent-" <> app.id <> "-" <> intent_name),
          attribute.class(case is_enabled {
            True -> "omni-intent-toggle-btn active"
            False -> "omni-intent-toggle-btn"
          }),
          attribute.attribute("aria-pressed", case is_enabled {
            True -> "true"
            False -> "false"
          }),
          event.on_click(ToggleAppIntent(app.id, intent_name)),
        ],
        [
          element.text(case is_enabled {
            True -> "Enabled"
            False -> "Disabled"
          }),
        ],
      ),
    ],
  )
}

/// Render the "Open With..." intent handler chooser modal when `model.intent_prompt` is `Some(prompt)`.
pub fn render_intent_chooser_modal(model: Model) -> Element(Msg) {
  case model.intent_prompt {
    None -> element.none()
    Some(prompt) -> render_active_intent_modal(model, prompt)
  }
}

fn render_active_intent_modal(
  model: Model,
  prompt: IntentPromptState,
) -> Element(Msg) {
  let info = describe_intent(prompt.intent_name)

  let candidate_buttons =
    list.map(prompt.candidates, fn(candidate_id) {
      let #(label, icon_name, desc) = case model.find_app(model, candidate_id) {
        Some(app) -> #(model.app_title(app), app.icon, app.description)
        None -> #(candidate_id, "apps", "")
      }

      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-select-intent-handler-" <> candidate_id),
          attribute.class("omni-intent-candidate-btn"),
          attribute.attribute("data-candidate-plugin", candidate_id),
          event.on_click(SelectIntentHandler(candidate_id)),
        ],
        [
          html.div([attribute.class("omni-intent-candidate-icon")], [
            icons.render_icon(icon_name, 18),
          ]),
          html.div([attribute.class("omni-intent-candidate-text")], [
            html.strong([attribute.class("omni-intent-candidate-name")], [
              element.text(label),
            ]),
            html.span([attribute.class("omni-intent-candidate-id")], [
              element.text(candidate_id),
            ]),
            case desc {
              "" -> element.none()
              d ->
                html.span([attribute.class("omni-intent-candidate-desc")], [
                  element.text(d),
                ])
            },
          ]),
          icons.render_icon("chevron-right", 16),
        ],
      )
    })

  html.div(
    [
      attribute.class("omni-modal-overlay open"),
      attribute.id("omni-intent-chooser-modal"),
      attribute.attribute("role", "dialog"),
      attribute.attribute("aria-modal", "true"),
      attribute.attribute("aria-labelledby", "intent-chooser-title"),
    ],
    [
      html.div([attribute.class("omni-modal-card intent-chooser-card")], [
        html.header([attribute.class("omni-modal-header")], [
          html.div([attribute.class("omni-modal-title-group")], [
            html.h3(
              [
                attribute.id("intent-chooser-title"),
                attribute.class("omni-modal-title"),
              ],
              [element.text("Open With...")],
            ),
            html.p([attribute.class("omni-modal-subtitle")], [
              element.text(
                "Choose an application to handle \""
                <> info.label
                <> "\" ("
                <> prompt.intent_name
                <> ")",
              ),
            ]),
          ]),
          html.button(
            [
              attribute.type_("button"),
              attribute.id("btn-dismiss-intent-modal"),
              attribute.class("omni-modal-close-btn"),
              attribute.title("Dismiss"),
              event.on_click(DismissIntentPrompt),
            ],
            [icons.render_icon("close", 18)],
          ),
        ]),
        html.div(
          [attribute.class("omni-intent-candidates-list")],
          candidate_buttons,
        ),
        html.footer([attribute.class("omni-modal-footer")], [
          html.button(
            [
              attribute.type_("button"),
              attribute.id("btn-cancel-intent-modal"),
              attribute.class("omni-button omni-button-secondary"),
              event.on_click(DismissIntentPrompt),
            ],
            [element.text("Cancel")],
          ),
        ]),
      ]),
    ],
  )
}
