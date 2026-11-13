//// Decentralized Nostr App Store & NIP-5A nsite catalog browser.
////
//// Strictly plugin-agnostic: zero hardcoded plugin IDs.

import gleam/list
import gleam/option.{None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import omni/shell/model.{type InstalledApp, type Model, InstalledApp, ViewOption}
import omni/shell/msg.{
  type Msg, InstallApp, OpenApp, SetAppStoreView, SetCustomInstallUrl,
  SetSearchQuery,
}
import omni/ui/icons
import omni/ui/plugin_icon

/// Entry in the App Store nsite catalog.
pub type CatalogEntry {
  CatalogEntry(
    id: String,
    name: String,
    description: String,
    icon: String,
    category: String,
    author: String,
    version: String,
    source_url: String,
  )
}

/// Curated sample catalog entries using neutral nsite identifiers.
pub fn curated_catalog() -> List(CatalogEntry) {
  [
    CatalogEntry(
      id: "nsite.catalog.reader",
      name: "Social Stream & Reader",
      description: "Local-first timeline reader, thread explorer, and short note composer.",
      icon: "feed",
      category: "Social",
      author: "nostr@community",
      version: "1.0.0",
      source_url: "https://nsite.example/reader.html",
    ),
    CatalogEntry(
      id: "nsite.catalog.tasks",
      name: "Daily Tasks & Checklist",
      description: "Encrypted NIP-78 task manager and daily focus checklist widget.",
      icon: "check-circle",
      category: "Productivity",
      author: "nostr@community",
      version: "1.0.0",
      source_url: "https://nsite.example/tasks.html",
    ),
    CatalogEntry(
      id: "nsite.catalog.notes",
      name: "Encrypted Notebook",
      description: "Private NIP-44 encrypted markdown notes synchronized across relays.",
      icon: "notes",
      category: "Productivity",
      author: "nostr@community",
      version: "1.0.0",
      source_url: "https://nsite.example/notes.html",
    ),
    CatalogEntry(
      id: "nsite.catalog.relays",
      name: "Relay Pool Inspector",
      description: "Real-time WebSocket relay health monitor, latency inspector, and NIP-65 manager.",
      icon: "relays",
      category: "Utilities",
      author: "nostr@community",
      version: "1.0.0",
      source_url: "https://nsite.example/relays.html",
    ),
    CatalogEntry(
      id: "nsite.catalog.profiles",
      name: "Identity & Profiles",
      description: "Kind 0 profile editor, NIP-05 verifier, and WebCrypto key custody manager.",
      icon: "user",
      category: "Social",
      author: "nostr@community",
      version: "1.0.0",
      source_url: "https://nsite.example/profiles.html",
    ),
    CatalogEntry(
      id: "nsite.catalog.studio",
      name: "Nsite Publisher Studio",
      description: "Build, package, and publish standalone NIP-5A nsites to Blossom and Nostr relays.",
      icon: "upload",
      category: "Utilities",
      author: "nostr@community",
      version: "1.0.0",
      source_url: "https://nsite.example/studio.html",
    ),
    CatalogEntry(
      id: "nsite.catalog.timer",
      name: "Focus Countdown Timer",
      description: "Minimalist Pomodoro and visual countdown timer for deep work sessions.",
      icon: "timer",
      category: "Productivity",
      author: "nostr@community",
      version: "1.0.0",
      source_url: "https://nsite.example/timer.html",
    ),
  ]
}

/// Convert a `CatalogEntry` into an `InstalledApp` descriptor ready for installation.
pub fn catalog_entry_to_installed_app(entry: CatalogEntry) -> InstalledApp {
  InstalledApp(
    id: entry.id,
    name: entry.name,
    display_name: Some(entry.name),
    description: entry.description,
    icon: entry.icon,
    enabled: True,
    pinned: False,
    views: [
      ViewOption(id: "default", title: "Default", path: "/", format: "html"),
      ViewOption(
        id: "widget",
        title: "Widget",
        path: "?view=widget",
        format: "html",
      ),
    ],
    placements: [],
    handled_intents: [],
    disabled_intents: [],
    relays: None,
    source_url: entry.source_url,
    version: Some(entry.version),
  )
}

/// Filter catalog entries by a case-insensitive search query across name, description, category, and ID.
pub fn filter_catalog(
  catalog: List(CatalogEntry),
  query: String,
) -> List(CatalogEntry) {
  let q = string.lowercase(string.trim(query))
  case q {
    "" -> catalog
    _ ->
      list.filter(catalog, fn(entry) {
        string.contains(string.lowercase(entry.name), q)
        || string.contains(string.lowercase(entry.description), q)
        || string.contains(string.lowercase(entry.category), q)
        || string.contains(string.lowercase(entry.id), q)
      })
  }
}

/// Render the App Store view (`<div class="omni-app-store">`).
pub fn render_app_store(
  model: Model,
  catalog: List(CatalogEntry),
) -> Element(Msg) {
  let filtered = filter_catalog(catalog, model.search_query)
  let custom_url_trimmed = string.trim(model.custom_install_url)

  let cards =
    list.map(filtered, fn(entry) { render_catalog_card(model, entry) })

  let installed_section = render_installed_index(model)

  let grid_body = case cards {
    [] ->
      html.div([attribute.class("omni-empty-state")], [
        html.div([attribute.class("omni-empty-state-icon")], [
          icons.render_icon("search", 28),
        ]),
        html.h3([attribute.class("omni-empty-state-title")], [
          element.text("No Matching Applications"),
        ]),
        html.p([attribute.class("omni-empty-state-description")], [
          element.text(
            "No catalog entries matched \""
            <> model.search_query
            <> "\". Try another search term or install directly via naddr / URL.",
          ),
        ]),
      ])
    items ->
      html.div(
        [
          attribute.class(case model.app_store_view {
            "ledger" -> "omni-app-store-ledger"
            _ -> "omni-app-store-grid"
          }),
        ],
        items,
      )
  }

  html.div(
    [
      attribute.class("omni-app-store"),
      attribute.id("omni-app-store"),
    ],
    [
      html.header([attribute.class("omni-app-store-header")], [
        html.div([attribute.class("omni-app-store-title-group")], [
          icons.render_icon("apps", 22),
          html.div([], [
            html.h2([attribute.class("omni-app-store-title")], [
              element.text("Decentralized App Store"),
            ]),
            html.p([attribute.class("omni-app-store-subtitle")], [
              element.text(
                "Discover standard Nostr sites (NIP-5A nsites), Blossom bundles, and sandboxed micro-apps.",
              ),
            ]),
          ]),
        ]),
        html.div([attribute.class("omni-app-store-controls")], [
          // Search Bar
          html.div([attribute.class("omni-app-store-search-box")], [
            icons.render_icon("search", 16),
            html.input([
              attribute.type_("search"),
              attribute.id("input-app-store-search"),
              attribute.class("omni-input omni-app-store-search-input"),
              attribute.placeholder(
                "Search apps by name, category, or capability...",
              ),
              attribute.value(model.search_query),
              event.on_input(SetSearchQuery),
            ]),
          ]),
          html.div([attribute.class("omni-app-store-view-toggle")], [
            html.button(
              [
                attribute.type_("button"),
                attribute.id("btn-app-store-view-grid"),
                attribute.class(case model.app_store_view {
                  "ledger" -> "omni-view-toggle-btn"
                  _ -> "omni-view-toggle-btn active"
                }),
                attribute.title("Grid view"),
                attribute.attribute("aria-pressed", case model.app_store_view {
                  "ledger" -> "false"
                  _ -> "true"
                }),
                event.on_click(SetAppStoreView("grid")),
              ],
              [icons.render_icon("grid", 15)],
            ),
            html.button(
              [
                attribute.type_("button"),
                attribute.id("btn-app-store-view-ledger"),
                attribute.class(case model.app_store_view {
                  "ledger" -> "omni-view-toggle-btn active"
                  _ -> "omni-view-toggle-btn"
                }),
                attribute.title("Ledger view"),
                attribute.attribute("aria-pressed", case model.app_store_view {
                  "ledger" -> "true"
                  _ -> "false"
                }),
                event.on_click(SetAppStoreView("ledger")),
              ],
              [icons.render_icon("menu", 15)],
            ),
          ]),
          // Custom naddr / URL Install Bar
          html.div([attribute.class("omni-app-store-custom-install")], [
            html.input([
              attribute.type_("text"),
              attribute.id("input-app-store-custom-url"),
              attribute.class("omni-input omni-app-store-url-input"),
              attribute.placeholder(
                "Install from naddr1..., Blossom hash, or https:// URL",
              ),
              attribute.value(model.custom_install_url),
              event.on_input(SetCustomInstallUrl),
            ]),
            html.button(
              [
                attribute.type_("button"),
                attribute.id("btn-app-store-install-url"),
                attribute.class("omni-button omni-button-primary"),
                attribute.disabled(custom_url_trimmed == ""),
                event.on_click(
                  InstallApp(custom_url_to_installed_app(custom_url_trimmed)),
                ),
              ],
              [
                icons.render_icon("download", 14),
                html.span([], [element.text("Install URL")]),
              ],
            ),
          ]),
        ]),
      ]),
      installed_section,
      grid_body,
    ],
  )
}

fn render_installed_index(model: Model) -> Element(Msg) {
  let q = string.lowercase(string.trim(model.search_query))
  let matches = fn(app: InstalledApp) {
    case q {
      "" -> True
      _ ->
        string.contains(string.lowercase(model.app_title(app)), q)
        || string.contains(string.lowercase(app.id), q)
        || string.contains(string.lowercase(app.description), q)
    }
  }
  let apps = list.filter(model.installed_apps, matches)
  let pinned = list.filter(apps, fn(app) { app.pinned })
  let others = list.filter(apps, fn(app) { !app.pinned })

  case apps {
    [] -> element.none()
    _ ->
      html.section(
        [
          attribute.class("omni-app-index"),
          attribute.id("omni-app-index"),
        ],
        list.flatten([
          [
            html.h3([attribute.class("omni-app-index-title")], [
              icons.render_icon("widgets", 16),
              element.text("Your Apps"),
            ]),
          ],
          case pinned {
            [] -> []
            _ -> [
              html.h4([attribute.class("omni-app-index-subtitle")], [
                element.text("Pinned"),
              ]),
              html.div(
                [attribute.class("omni-app-index-list")],
                list.map(pinned, fn(app) { render_installed_row(model, app) }),
              ),
            ]
          },
          case others {
            [] -> []
            _ -> [
              html.h4([attribute.class("omni-app-index-subtitle")], [
                element.text("All Apps"),
              ]),
              html.div(
                [attribute.class("omni-app-index-list")],
                list.map(others, fn(app) { render_installed_row(model, app) }),
              ),
            ]
          },
        ]),
      )
  }
}

fn render_installed_row(model: Model, app: InstalledApp) -> Element(Msg) {
  html.div(
    [
      attribute.class("omni-app-index-row"),
      attribute.attribute("data-app-id", app.id),
    ],
    [
      html.div([attribute.class("omni-app-index-icon")], [
        plugin_icon.render(app.icon, 18),
      ]),
      html.div([attribute.class("omni-app-index-info")], [
        html.div([attribute.class("omni-app-index-name-row")], [
          html.strong([attribute.class("omni-app-index-name")], [
            element.text(model.app_title(app)),
          ]),
          case app.pinned {
            True ->
              html.span([attribute.class("omni-app-index-pin")], [
                icons.render_icon("pin", 12),
              ])
            False -> element.none()
          },
        ]),
        html.span([attribute.class("omni-app-index-desc")], [
          element.text(app.description),
        ]),
      ]),
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-app-index-open-" <> app.id),
          attribute.class("omni-button omni-button-secondary"),
          event.on_click(OpenApp(app.id, None)),
        ],
        [
          icons.render_icon("external", 14),
          html.span([], [element.text("Open")]),
        ],
      ),
    ],
  )
}

fn render_catalog_card(model: Model, entry: CatalogEntry) -> Element(Msg) {
  // A catalog entry is installed if an app with the same ID or source URL is
  // already present (built-in apps ship with their own IDs).
  let installed_opt = model.find_app(model, entry.id)
  let installed_by_source =
    list.find(model.installed_apps, fn(app) {
      app.source_url == entry.source_url
    })
    |> option.from_result
  let installed_app = case installed_opt {
    Some(app) -> Some(app)
    None -> installed_by_source
  }
  let is_installed = option.is_some(installed_app)

  let action_buttons = case installed_app {
    Some(_) -> [
      html.span([attribute.class("omni-catalog-installed-badge")], [
        icons.render_icon("check", 12),
        html.span([], [element.text("Installed")]),
      ]),
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-open-catalog-" <> entry.id),
          attribute.class("omni-button omni-button-secondary"),
          event.on_click(OpenApp(entry.id, None)),
        ],
        [
          icons.render_icon("external", 14),
          html.span([], [element.text("Open")]),
        ],
      ),
    ]
    None -> [
      html.button(
        [
          attribute.type_("button"),
          attribute.id("btn-install-catalog-" <> entry.id),
          attribute.class("omni-button omni-button-primary"),
          event.on_click(InstallApp(catalog_entry_to_installed_app(entry))),
        ],
        [
          icons.render_icon("plus", 14),
          html.span([], [element.text("Install")]),
        ],
      ),
    ]
  }

  html.article(
    [
      attribute.class(case is_installed {
        True -> "omni-catalog-card installed"
        False -> "omni-catalog-card"
      }),
      attribute.attribute("data-catalog-id", entry.id),
      attribute.attribute("data-catalog-category", entry.category),
    ],
    [
      html.div([attribute.class("omni-catalog-card-header")], [
        html.div([attribute.class("omni-catalog-card-icon")], [
          plugin_icon.render(entry.icon, 20),
        ]),
        html.div([attribute.class("omni-catalog-card-titles")], [
          html.div([attribute.class("omni-catalog-card-title-row")], [
            html.strong([attribute.class("omni-catalog-card-name")], [
              element.text(entry.name),
            ]),
            html.span([attribute.class("omni-catalog-category-badge")], [
              element.text(entry.category),
            ]),
          ]),
          html.span([attribute.class("omni-catalog-card-meta")], [
            element.text("by " <> entry.author <> " • v" <> entry.version),
          ]),
        ]),
      ]),
      html.p([attribute.class("omni-catalog-card-description")], [
        element.text(entry.description),
      ]),
      html.footer([attribute.class("omni-catalog-card-footer")], action_buttons),
    ],
  )
}

fn custom_url_to_installed_app(url: String) -> InstalledApp {
  let slug = case url {
    "" -> "custom"
    u ->
      u
      |> string.lowercase
      |> string.replace("https://", "")
      |> string.replace("http://", "")
      |> string.replace("/", ".")
      |> string.replace(":", "-")
      |> string.slice(0, 32)
  }

  InstalledApp(
    id: "nsite.custom." <> slug,
    name: "Custom Nsite",
    display_name: Some("Custom Nsite"),
    description: "Installed from " <> url,
    icon: "apps",
    enabled: True,
    pinned: False,
    views: [
      ViewOption(id: "default", title: "Default", path: "/", format: "html"),
    ],
    placements: [],
    handled_intents: [],
    disabled_intents: [],
    relays: None,
    source_url: url,
    version: Some("1.0.0"),
  )
}
