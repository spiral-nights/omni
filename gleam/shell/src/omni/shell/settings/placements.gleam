//// Companion viewport placement configuration panel for Settings.
////
//// Follows the Omni architectural mandate: full-page application presentation
//// (`Main`) is native to every installed plugin, so user-defined viewport
//// assignments are strictly for companion surfaces (`Dock`, `Sidebar`,
//// `HeaderActions`) and route selection.

import gleam/list
import gleam/option.{type Option, None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/protocol/viewport.{type Viewport, Dock, HeaderActions, Sidebar}
import omni/shell/model.{
  type InstalledApp, type Model, type PlacementConfig, type ViewOption,
  PlacementConfig, ViewOption,
}
import omni/shell/msg.{
  type Msg, AddAppPlacement, OpenApp, RemoveAppPlacement, ToggleAppPinned,
}
import omni/ui/icons

/// Companion viewport descriptor for user assignment.
pub type CompanionViewportOption {
  CompanionViewportOption(
    viewport: Viewport,
    id: String,
    label: String,
    description: String,
  )
}

/// Canonical companion viewports assignable in Settings.
/// Full-page application (`Main`) is native to every installed app and not a companion placement.
pub fn companion_viewport_options() -> List(CompanionViewportOption) {
  [
    CompanionViewportOption(
      viewport: Dock,
      id: "dock",
      label: "Navigation Dock Shortcut",
      description: "Quick launcher pinned to the primary navigation dock",
    ),
    CompanionViewportOption(
      viewport: Sidebar,
      id: "sidebar",
      label: "Workspace Widget",
      description: "Interactive card inside the multi-column Widgets Dashboard",
    ),
    CompanionViewportOption(
      viewport: HeaderActions,
      id: "header-actions",
      label: "Header Quick Action",
      description: "Compact status icon and action pill in the top navigation bar",
    ),
  ]
}

/// Render the companion viewport assignments and route selection panel for all installed apps.
pub fn render_placements_panel(model: Model) -> Element(Msg) {
  let app_cards =
    list.map(model.installed_apps, fn(app) { render_app_placements_card(app) })

  let body_content = case app_cards {
    [] -> [
      html.div([attribute.class("omni-empty-state")], [
        html.p([attribute.class("omni-empty-state-description")], [
          element.text(
            "No applications installed. Visit the App Store to install Nostr sites.",
          ),
        ]),
      ]),
    ]
    cards -> cards
  }

  html.section(
    [
      attribute.class("omni-settings-panel omni-placements-panel"),
      attribute.id("settings-placements-panel"),
    ],
    [
      html.header([attribute.class("omni-settings-section-header")], [
        html.div([attribute.class("omni-settings-title-group")], [
          icons.render_icon("layout", 18),
          html.h3([attribute.class("omni-settings-section-title")], [
            element.text("Companion Viewports & Route Assignments"),
          ]),
        ]),
        html.p([attribute.class("omni-settings-section-desc")], [
          element.text(
            "Every installed application runs natively as a Full-Page App. Assign optional companion surfaces (Dock, Workspace Widget, Header Quick Action) and sub-view routes below.",
          ),
        ]),
      ]),
      html.div([attribute.class("omni-placements-app-list")], body_content),
    ],
  )
}

/// Render the placement controls for a single installed application.
pub fn render_app_placements_card(app: InstalledApp) -> Element(Msg) {
  let title = model.app_title(app)
  let has_sidebar = has_placement(app.placements, Sidebar)
  let has_header = has_placement(app.placements, HeaderActions)
  let is_dock_pinned = app.pinned || has_placement(app.placements, Dock)

  let default_view = default_view_for_app(app, "widget")
  let header_view = default_view_for_app(app, "status")

  let existing_rows =
    list.map(app.placements, fn(pl) { render_placement_row(app, pl) })

  let placements_body = case existing_rows {
    [] ->
      html.div([attribute.class("empty-placements-note")], [
        element.text(
          "No companion surfaces assigned — available as a Full-Page App.",
        ),
      ])
    rows -> html.div([attribute.class("plugin-placements-rows")], rows)
  }

  html.article(
    [
      attribute.class("omni-settings-card plugin-placements-section"),
      attribute.attribute("data-placement-app", app.id),
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
        html.div([attribute.class("omni-placement-quick-actions")], [
          html.button(
            [
              attribute.type_("button"),
              attribute.class("omni-button omni-button-ghost"),
              attribute.id("btn-open-fullpage-" <> app.id),
              attribute.title("Open " <> title <> " as Full-Page App"),
              event.on_click(OpenApp(app.id, None)),
            ],
            [
              icons.render_icon("external", 14),
              html.span([], [element.text("Open App")]),
            ],
          ),
        ]),
      ]),
      html.div([attribute.class("omni-companion-surface-toggles")], [
        // 1. Navigation Dock Shortcut toggle
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-toggle-pin-" <> app.id),
            attribute.class(case is_dock_pinned {
              True -> "omni-surface-pill active"
              False -> "omni-surface-pill"
            }),
            attribute.attribute("aria-pressed", bool_str(is_dock_pinned)),
            event.on_click(ToggleAppPinned(app.id)),
          ],
          [
            icons.render_icon("pin", 14),
            html.span([], [
              element.text(case is_dock_pinned {
                True -> "Pinned to Dock"
                False -> "Pin to Dock"
              }),
            ]),
          ],
        ),
        // 2. Workspace Widget (Sidebar) toggle
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-toggle-sidebar-" <> app.id),
            attribute.class(case has_sidebar {
              True -> "omni-surface-pill active"
              False -> "omni-surface-pill"
            }),
            attribute.attribute("aria-pressed", bool_str(has_sidebar)),
            event.on_click(case has_sidebar {
              True -> RemoveAppPlacement(app.id, Sidebar)
              False ->
                AddAppPlacement(
                  app.id,
                  PlacementConfig(
                    viewport: Sidebar,
                    view_id: default_view.id,
                    route: route_option(default_view.path),
                  ),
                )
            }),
          ],
          [
            icons.render_icon("widgets", 14),
            html.span([], [
              element.text(case has_sidebar {
                True -> "Workspace Widget Active"
                False -> "+ Add Workspace Widget"
              }),
            ]),
          ],
        ),
        // 3. Header Quick Action toggle
        html.button(
          [
            attribute.type_("button"),
            attribute.id("btn-toggle-header-action-" <> app.id),
            attribute.class(case has_header {
              True -> "omni-surface-pill active"
              False -> "omni-surface-pill"
            }),
            attribute.attribute("aria-pressed", bool_str(has_header)),
            event.on_click(case has_header {
              True -> RemoveAppPlacement(app.id, HeaderActions)
              False ->
                AddAppPlacement(
                  app.id,
                  PlacementConfig(
                    viewport: HeaderActions,
                    view_id: header_view.id,
                    route: route_option(header_view.path),
                  ),
                )
            }),
          ],
          [
            icons.render_icon("bolt", 14),
            html.span([], [
              element.text(case has_header {
                True -> "Header Action Active"
                False -> "+ Add Header Action"
              }),
            ]),
          ],
        ),
      ]),
      placements_body,
    ],
  )
}

fn render_placement_row(
  app: InstalledApp,
  placement: PlacementConfig,
) -> Element(Msg) {
  let vp_str = viewport.to_string(placement.viewport)
  let vp_label = viewport_label(placement.viewport)
  let current_route = option.unwrap(placement.route, "")
  let views = available_views_for_app(app)

  let route_buttons =
    list.map(views, fn(v) {
      let is_selected = v.path == current_route || v.id == placement.view_id
      html.button(
        [
          attribute.type_("button"),
          attribute.class(case is_selected {
            True -> "omni-route-chip active"
            False -> "omni-route-chip"
          }),
          attribute.title("Select route " <> v.path),
          event.on_click(AddAppPlacement(
            app.id,
            PlacementConfig(
              viewport: placement.viewport,
              view_id: v.id,
              route: route_option(v.path),
            ),
          )),
        ],
        [
          html.span([attribute.class("omni-route-chip-title")], [
            element.text(v.title),
          ]),
          html.code([attribute.class("omni-route-chip-path")], [
            element.text(case v.path {
              "" -> "/"
              p -> p
            }),
          ]),
        ],
      )
    })

  html.div(
    [
      attribute.class("plugin-placement-row"),
      attribute.attribute("data-placement-viewport", vp_str),
    ],
    [
      html.div([attribute.class("plugin-placement-row-header")], [
        html.span([attribute.class("plugin-placement-viewport-badge")], [
          element.text(vp_label),
        ]),
        html.button(
          [
            attribute.type_("button"),
            attribute.class("btn-remove-placement"),
            attribute.id("btn-remove-placement-" <> app.id <> "-" <> vp_str),
            attribute.title("Remove " <> vp_label <> " placement"),
            event.on_click(RemoveAppPlacement(app.id, placement.viewport)),
          ],
          [
            icons.render_icon("close", 12),
            html.span([], [element.text("Remove")]),
          ],
        ),
      ]),
      html.div([attribute.class("plugin-placement-routes")], [
        html.span([attribute.class("plugin-placement-routes-label")], [
          element.text("View / Route:"),
        ]),
        html.div(
          [attribute.class("plugin-placement-route-chips")],
          route_buttons,
        ),
      ]),
    ],
  )
}

fn has_placement(placements: List(PlacementConfig), vp: Viewport) -> Bool {
  list.any(placements, fn(p) { p.viewport == vp })
}

fn available_views_for_app(app: InstalledApp) -> List(ViewOption) {
  case app.views {
    [] -> [
      ViewOption(id: "default", title: "Default", path: "/", format: "html"),
      ViewOption(
        id: "widget",
        title: "Widget",
        path: "?view=widget",
        format: "html",
      ),
    ]
    views -> views
  }
}

fn default_view_for_app(app: InstalledApp, preferred_id: String) -> ViewOption {
  let views = available_views_for_app(app)
  case list.find(views, fn(v) { v.id == preferred_id }) {
    Ok(found) -> found
    Error(Nil) ->
      case views {
        [first, ..] -> first
        [] ->
          ViewOption(
            id: preferred_id,
            title: "Default",
            path: "?view=" <> preferred_id,
            format: "html",
          )
      }
  }
}

fn route_option(path: String) -> Option(String) {
  case path {
    "" | "/" -> None
    p -> Some(p)
  }
}

fn viewport_label(vp: Viewport) -> String {
  case vp {
    Dock -> "Navigation Dock Shortcut"
    Sidebar -> "Workspace Widget"
    HeaderActions -> "Header Quick Action"
    _ -> "Primary Surface"
  }
}

fn bool_str(b: Bool) -> String {
  case b {
    True -> "true"
    False -> "false"
  }
}
