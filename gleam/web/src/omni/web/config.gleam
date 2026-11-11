//// Default Omni web bootstrap configuration.
////
//// Declares the bootstrap relay set, the default system plugin entries, and
//// the default shell ID used by the `omni_web` bootloader. These are the only
//// place default plugin IDs may appear; shell and UI packages stay generic.

import gleam/list
import gleam/option.{None, Some}
import omni/nostr/relay_url.{type RelayUrl}
import omni/protocol/viewport.{Dock, Sidebar}
import omni/shell/model.{
  type InstalledApp, type PlacementConfig, InstalledApp, PlacementConfig,
  ViewOption,
}

/// NIP-78 workspace sync document tag.
pub const workspace_sync_d_tag = "omni/workspace/v1"

/// Shell ID activated on a first boot with no persisted preference.
pub const default_shell_id = "editorial"

/// Default relay URLs dialed on startup.
pub fn bootstrap_relay_urls() -> List(String) {
  [
    "wss://relay.damus.io",
    "wss://relay.ditto.pub",
    "wss://nos.lol",
  ]
}

/// Parsed bootstrap relays, silently skipping any malformed default.
pub fn bootstrap_relays() -> List(RelayUrl) {
  bootstrap_relay_urls()
  |> list.filter_map(relay_url.parse)
}

/// Default first-party system plugin entries installed on first boot.
/// These are pure standard nsites: no proprietary manifest or SDK.
pub fn system_apps() -> List(InstalledApp) {
  [
    InstalledApp(
      id: "org.omni.plugin.feed",
      name: "Feed",
      display_name: Some("Feed"),
      description: "Timeline, composer, threads, and search over standard Nostr events.",
      icon: "feed",
      enabled: True,
      pinned: True,
      views: [
        ViewOption(id: "timeline", title: "Timeline", path: "/", format: "html"),
        ViewOption(
          id: "thread",
          title: "Thread",
          path: "/?view=thread",
          format: "html",
        ),
        ViewOption(
          id: "search",
          title: "Search",
          path: "/?view=search",
          format: "html",
        ),
        ViewOption(
          id: "settings",
          title: "Feed Settings",
          path: "/?view=settings",
          format: "html",
        ),
        ViewOption(
          id: "widget",
          title: "Feed Widget",
          path: "/?view=widget",
          format: "html",
        ),
      ],
      placements: [],
      handled_intents: ["view-note", "create-note", "view-profile"],
      disabled_intents: [],
      relays: None,
      source_url: "https://nsite.example/reader.html",
      version: Some("1.0.0"),
    ),
    InstalledApp(
      id: "org.omni.plugin.checklist",
      name: "Checklist",
      display_name: Some("Checklist"),
      description: "Daily task list with All/Active/Completed filters and progress.",
      icon: "check-circle",
      enabled: True,
      pinned: True,
      views: [
        ViewOption(id: "main", title: "Checklist", path: "/", format: "html"),
        ViewOption(
          id: "widget",
          title: "Checklist Widget",
          path: "/?view=widget",
          format: "html",
        ),
        ViewOption(
          id: "settings",
          title: "Checklist Settings",
          path: "/?view=settings",
          format: "html",
        ),
      ],
      placements: [
        PlacementConfig(
          viewport: Sidebar,
          view_id: "widget",
          route: Some("?view=widget"),
        ),
      ],
      handled_intents: [],
      disabled_intents: [],
      relays: None,
      source_url: "https://nsite.example/tasks.html",
      version: Some("1.0.0"),
    ),
    InstalledApp(
      id: "org.omni.plugin.timer",
      name: "Timer",
      display_name: Some("Focus Timer"),
      description: "Focus countdown with presets and a compact widget view.",
      icon: "timer",
      enabled: True,
      pinned: False,
      views: [
        ViewOption(id: "main", title: "Timer", path: "/", format: "html"),
        ViewOption(
          id: "widget",
          title: "Timer Widget",
          path: "/?view=widget",
          format: "html",
        ),
      ],
      placements: [
        PlacementConfig(
          viewport: Sidebar,
          view_id: "widget",
          route: Some("?view=widget"),
        ),
      ],
      handled_intents: [],
      disabled_intents: [],
      relays: None,
      source_url: "https://nsite.example/timer.html",
      version: Some("1.0.0"),
    ),
    InstalledApp(
      id: "org.omni.plugin.notes",
      name: "Notes",
      display_name: Some("Notes"),
      description: "Private encrypted notebook backed by NIP-78 documents.",
      icon: "notes",
      enabled: True,
      pinned: True,
      views: [
        ViewOption(id: "main", title: "Notes", path: "/", format: "html"),
        ViewOption(
          id: "settings",
          title: "Notes Settings",
          path: "/?view=settings",
          format: "html",
        ),
      ],
      placements: [],
      handled_intents: [],
      disabled_intents: [],
      relays: None,
      source_url: "https://nsite.example/notes.html",
      version: Some("1.0.0"),
    ),
    InstalledApp(
      id: "org.omni.plugin.relays",
      name: "Relays",
      display_name: Some("Relay Pool"),
      description: "Relay connection states, read/write scoping, and NIP-65 lists.",
      icon: "relays",
      enabled: True,
      pinned: True,
      views: [
        ViewOption(id: "main", title: "Relays", path: "/", format: "html"),
        ViewOption(
          id: "settings",
          title: "Relay Settings",
          path: "/?view=settings",
          format: "html",
        ),
      ],
      placements: [],
      handled_intents: [],
      disabled_intents: [],
      relays: None,
      source_url: "https://nsite.example/relays.html",
      version: Some("1.0.0"),
    ),
    InstalledApp(
      id: "org.omni.plugin.profiles",
      name: "Profiles",
      display_name: Some("Profiles"),
      description: "People directory, metadata editor, follows, and key custody.",
      icon: "users",
      enabled: True,
      pinned: False,
      views: [
        ViewOption(id: "main", title: "Profiles", path: "/", format: "html"),
        ViewOption(
          id: "settings",
          title: "Profile Settings",
          path: "/?view=settings",
          format: "html",
        ),
      ],
      placements: [],
      handled_intents: ["view-profile"],
      disabled_intents: [],
      relays: None,
      source_url: "https://nsite.example/profiles.html",
      version: Some("1.0.0"),
    ),
    InstalledApp(
      id: "org.omni.plugin.publisher",
      name: "Publisher",
      display_name: Some("Plugin Studio"),
      description: "Nsite draft studio, Blossom uploads, and published app listing.",
      icon: "upload",
      enabled: True,
      pinned: False,
      views: [
        ViewOption(id: "studio", title: "Studio", path: "/", format: "html"),
        ViewOption(
          id: "settings",
          title: "Publisher Settings",
          path: "/?view=settings",
          format: "html",
        ),
      ],
      placements: [],
      handled_intents: [],
      disabled_intents: [],
      relays: None,
      source_url: "https://nsite.example/studio.html",
      version: Some("1.0.0"),
    ),
  ]
}

/// Default dock-pinned system entries, in display order.
pub fn dock_apps() -> List(InstalledApp) {
  system_apps() |> list.filter(fn(app) { app.pinned })
}

/// Viewport affinity for a default system app ID: dock entries for pinned apps
/// and no companion placement otherwise.
pub fn default_placement(_app: InstalledApp) -> PlacementConfig {
  PlacementConfig(viewport: Dock, view_id: "main", route: None)
}
