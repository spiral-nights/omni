//// User-swappable Shell theme & layout switcher and accent color customization.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/int
import gleam/list
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/model.{type Model}
import omni/shell/msg.{type Msg, SelectShell, SetAccentColor, SetThemeMode}
import omni/ui/icons

/// Metadata describing an installed or built-in user-swappable shell.
pub type ShellInfo {
  ShellInfo(
    id: String,
    name: String,
    description: String,
    icon: String,
    author: String,
    version: String,
    is_builtin: Bool,
  )
}

/// Built-in first-class shells bundled with Omni (`"editorial"`, `"panorama"`).
pub fn builtin_shells() -> List(ShellInfo) {
  [
    ShellInfo(
      id: "editorial",
      name: "Editorial Shell",
      description: "Warm Paper Dark typography-first layout with clean reading proportions and bottom/side dock.",
      icon: "notes",
      author: "Omni Core Team",
      version: "1.0.0",
      is_builtin: True,
    ),
    ShellInfo(
      id: "panorama",
      name: "Panorama Hub",
      description: "Horizontal metro-inspired panoramic canvas with live tiles and fluid hub columns.",
      icon: "windows",
      author: "Omni Core Team",
      version: "1.0.0",
      is_builtin: True,
    ),
  ]
}

/// Curated Warm Paper Dark accent color presets.
pub fn accent_presets() -> List(#(String, String)) {
  [
    #("#d4a373", "Warm Sandstone"),
    #("#c85d3e", "Terracotta"),
    #("#288755", "Sage Emerald"),
    #("#356ec4", "Cobalt Ink"),
    #("#b88320", "Amber Ochre"),
  ]
}

/// Render the Shells & Theme switcher panel (`<section class="omni-settings-panel omni-shells-panel">`).
pub fn render_shells_panel(
  model: Model,
  available_shells: List(ShellInfo),
) -> Element(Msg) {
  let shells = case available_shells {
    [] -> builtin_shells()
    list -> list
  }

  let count_str = int.to_string(list.length(shells)) <> " installed"

  let quick_switcher_buttons =
    list.map(shells, fn(sh) {
      let is_active = model.active_shell_id == sh.id
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-shell-" <> sh.id),
          attribute.class(case is_active {
            True -> "omni-shell-switch-btn active"
            False -> "omni-shell-switch-btn"
          }),
          attribute.title(sh.description),
          event.on_click(SelectShell(sh.id)),
        ],
        [element.text(sh.name)],
      )
    })

  let shell_cards =
    list.map(shells, fn(sh) { render_shell_card(model.active_shell_id, sh) })

  let accent_swatches =
    list.map(accent_presets(), fn(preset) {
      let #(hex, name) = preset
      let is_selected = model.accent_color == hex
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-accent-" <> hex),
          attribute.class(case is_selected {
            True -> "omni-accent-swatch active"
            False -> "omni-accent-swatch"
          }),
          attribute.title(name <> " (" <> hex <> ")"),
          attribute.attribute("data-accent-color", hex),
          event.on_click(SetAccentColor(hex)),
        ],
        [
          html.span([attribute.class("omni-accent-swatch-label")], [
            element.text(name),
          ]),
          html.code([attribute.class("omni-accent-swatch-hex")], [
            element.text(hex),
          ]),
        ],
      )
    })

  html.section(
    [
      attribute.class("omni-settings-panel omni-shells-panel"),
      attribute.id("settings-shells-panel"),
    ],
    [
      html.header([attribute.class("omni-settings-section-header")], [
        html.div([attribute.class("omni-settings-title-group")], [
          icons.render_icon("layout", 18),
          html.h3([attribute.class("omni-settings-section-title")], [
            element.text("User-Swappable Shells & Appearance"),
          ]),
          html.span(
            [
              attribute.id("shell-count-badge"),
              attribute.class("omni-shell-count-badge"),
            ],
            [element.text(count_str)],
          ),
        ]),
        html.p([attribute.class("omni-settings-section-desc")], [
          element.text(
            "Switch dynamically between Editorial, Panorama Hub, Omni Classic, or custom installed shells without reloading running plugin sandboxes.",
          ),
        ]),
      ]),
      html.div(
        [
          attribute.id("shell-switcher-buttons"),
          attribute.class("omni-shell-switcher-bar"),
        ],
        quick_switcher_buttons,
      ),
      html.div(
        [
          attribute.id("installed-shells-list"),
          attribute.class("omni-shells-card-list"),
        ],
        shell_cards,
      ),
      html.div([attribute.class("omni-theme-mode-section")], [
        html.h4([attribute.class("omni-settings-subsection-title")], [
          element.text("Appearance Mode"),
        ]),
        html.div([attribute.class("omni-theme-mode-row")], [
          theme_mode_button(model.theme_mode, "dark", "Dark", "moon"),
          theme_mode_button(model.theme_mode, "light", "Light", "sun"),
        ]),
      ]),
      html.div([attribute.class("omni-accent-color-section")], [
        html.h4([attribute.class("omni-settings-subsection-title")], [
          element.text("Accent Color Palette"),
        ]),
        html.div([attribute.class("omni-accent-swatch-row")], accent_swatches),
        html.div([attribute.class("omni-accent-custom-input-row")], [
          html.label([attribute.for("input-custom-accent-color")], [
            element.text("Custom Hex Accent:"),
          ]),
          html.input([
            attribute.type_("text"),
            attribute.id("input-custom-accent-color"),
            attribute.class("omni-input omni-accent-input"),
            attribute.value(model.accent_color),
            event.on_input(SetAccentColor),
          ]),
        ]),
      ]),
    ],
  )
}

fn theme_mode_button(
  active: String,
  mode: String,
  label: String,
  icon: String,
) -> Element(Msg) {
  let is_active = active == mode
  html.button(
    [
      attribute.type_("button"),
      attribute.class(case is_active {
        True -> "omni-button omni-button-primary omni-theme-mode-btn active"
        False -> "omni-button omni-button-secondary omni-theme-mode-btn"
      }),
      attribute.attribute("data-theme-mode-option", mode),
      event.on_click(SetThemeMode(mode)),
    ],
    [
      icons.render_icon(icon, 15),
      html.span([], [element.text(label)]),
    ],
  )
}

fn render_shell_card(
  active_shell_id: String,
  shell: ShellInfo,
) -> Element(Msg) {
  let is_active = active_shell_id == shell.id

  let action_el = case is_active {
    True ->
      html.span([attribute.class("omni-shell-active-indicator")], [
        element.text("Current"),
      ])
    False ->
      html.button(
        [
          attribute.type_("button"),
          attribute.class("omni-button omni-button-primary btn-activate-shell"),
          attribute.attribute("data-shell-id", shell.id),
          event.on_click(SelectShell(shell.id)),
        ],
        [element.text("Activate")],
      )
  }

  let badge_el = case shell.is_builtin {
    True ->
      html.span([attribute.class("omni-shell-badge builtin")], [
        element.text("Built-in"),
      ])
    False ->
      html.span([attribute.class("omni-shell-badge custom")], [
        element.text("Custom"),
      ])
  }

  html.article(
    [
      attribute.class(case is_active {
        True -> "omni-shell-card active"
        False -> "omni-shell-card"
      }),
      attribute.attribute("data-shell-card", shell.id),
    ],
    [
      html.div([attribute.class("omni-shell-card-header")], [
        html.div([attribute.class("omni-shell-card-identity")], [
          html.div([attribute.class("omni-shell-card-icon")], [
            icons.render_icon(shell.icon, 18),
          ]),
          html.div([attribute.class("omni-shell-card-titles")], [
            html.div([attribute.class("omni-shell-card-title-row")], [
              html.strong([attribute.class("omni-shell-card-name")], [
                element.text(shell.name),
              ]),
              case is_active {
                True ->
                  html.span([attribute.class("omni-shell-badge active")], [
                    element.text("Active"),
                  ])
                False -> element.none()
              },
              badge_el,
            ]),
            html.span([attribute.class("omni-shell-card-meta")], [
              element.text("by " <> shell.author <> " • v" <> shell.version),
            ]),
          ]),
        ]),
        html.div([attribute.class("omni-shell-card-actions")], [action_el]),
      ]),
      html.p([attribute.class("omni-shell-card-description")], [
        element.text(shell.description),
      ]),
    ],
  )
}
