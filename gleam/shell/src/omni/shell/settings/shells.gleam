//// User-swappable Shell theme & layout switcher and accent color customization.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/int
import gleam/list
import gleam/string
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/model.{type Model, type ShellInfo, ShellInfo}
import omni/shell/msg.{
  type Msg, InstallCustomShell, InstallShell, SelectShell, SetAccentColor,
  SetCustomShellUrl, SetThemeMode, UninstallShell,
}
import omni/ui/icons

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
  let shells = case model.installed_shells {
    [] ->
      case available_shells {
        [] -> builtin_shells()
        list -> list
      }
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

  let curated_cards =
    list.map(model.curated_shells, fn(sh) {
      html.article(
        [
          attribute.class("omni-shell-card curated"),
          attribute.attribute("data-shell-card", sh.id),
        ],
        [
          html.div([attribute.class("omni-shell-card-header")], [
            html.div([attribute.class("omni-shell-card-identity")], [
              html.div([attribute.class("omni-shell-card-icon")], [
                icons.render_icon(sh.icon, 18),
              ]),
              html.div([attribute.class("omni-shell-card-titles")], [
                html.div([attribute.class("omni-shell-card-title-row")], [
                  html.strong([attribute.class("omni-shell-card-name")], [
                    element.text(sh.name),
                  ]),
                  html.span([attribute.class("omni-shell-badge catalog")], [
                    element.text("Catalog"),
                  ]),
                ]),
                html.span([attribute.class("omni-shell-card-meta")], [
                  element.text("by " <> sh.author <> " • v" <> sh.version),
                ]),
              ]),
            ]),
            html.div([attribute.class("omni-shell-card-actions")], [
              html.button(
                [
                  attribute.type_("button"),
                  attribute.id("btn-install-shell-" <> sh.id),
                  attribute.class("omni-button omni-button-primary"),
                  event.on_click(InstallShell(sh.id)),
                ],
                [element.text("Install")],
              ),
            ]),
          ]),
          html.p([attribute.class("omni-shell-card-description")], [
            element.text(sh.description),
          ]),
        ],
      )
    })

  let curated_section = case curated_cards {
    [] -> element.none()
    cards ->
      html.div([attribute.class("omni-shell-catalog-section")], [
        html.h4([attribute.class("omni-settings-subsection-title")], [
          element.text("Curated Shell Catalog"),
        ]),
        html.div(
          [
            attribute.id("curated-shells-list"),
            attribute.class("omni-shells-card-list"),
          ],
          cards,
        ),
      ])
  }

  let custom_shell_installer =
    html.div([attribute.class("omni-custom-installer-box")], [
      html.label(
        [
          attribute.class("omni-custom-installer-label"),
          attribute.for("input-custom-shell-url"),
        ],
        [
          icons.render_icon("download", 14),
          html.span([], [element.text("Install Custom Shell from URL")]),
        ],
      ),
      html.div([attribute.class("omni-custom-installer-row")], [
        html.input([
          attribute.type_("text"),
          attribute.id("input-custom-shell-url"),
          attribute.class("omni-input omni-custom-install-input"),
          attribute.placeholder("https://example.com/shell.html"),
          attribute.value(model.custom_shell_url),
          event.on_input(SetCustomShellUrl),
        ]),
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-install-shell-editorial"),
            attribute.class("omni-button omni-button-primary"),
            attribute.disabled(string.trim(model.custom_shell_url) == ""),
            event.on_click(InstallCustomShell("editorial")),
          ],
          [element.text("Install Editorial Layout")],
        ),
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-install-shell-panorama"),
            attribute.class("omni-button omni-button-secondary"),
            attribute.disabled(string.trim(model.custom_shell_url) == ""),
            event.on_click(InstallCustomShell("panorama")),
          ],
          [element.text("Install Panorama Layout")],
        ),
      ]),
    ])

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
      curated_section,
      custom_shell_installer,
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
        html.div([attribute.class("omni-shell-card-actions")], [
          action_el,
          case shell.is_builtin {
            True -> element.none()
            False ->
              html.button(
                [
                  attribute.type_("button"),
                  attribute.id("btn-uninstall-shell-" <> shell.id),
                  attribute.class("omni-button omni-button-danger"),
                  event.on_click(UninstallShell(shell.id)),
                ],
                [element.text("Uninstall")],
              )
          },
        ]),
      ]),
      html.p([attribute.class("omni-shell-card-description")], [
        element.text(shell.description),
      ]),
    ],
  )
}
