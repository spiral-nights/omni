//// Unit tests for the Editorial shell theme (Phase 6.7).

import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import lustre/element
import omni/shell/model.{
  type InstalledApp, AppStore, InstalledApp, Model, Settings, TabProfile,
  UserProfileSummary, ViewOption, WidgetsDashboard,
}
import omni/shell/msg
import omni/shell/settings/shells
import omni/shell/theme
import omni/shell/themes/editorial
import omni/shell/update

fn sample_app(id: String, name: String) -> InstalledApp {
  InstalledApp(
    id: id,
    name: name,
    display_name: Some(name),
    description: "Description for " <> name,
    icon: "apps",
    enabled: True,
    pinned: True,
    views: [
      ViewOption(id: "default", title: "Default", path: "/", format: "html"),
    ],
    placements: [],
    handled_intents: ["view-note"],
    disabled_intents: [],
    relays: None,
    source_url: "https://example.com/" <> id,
    version: Some("1.0.0"),
  )
}

pub fn editorial_theme_descriptor_test() {
  let t = editorial.theme()

  t.id |> should.equal("editorial")
  t.name |> should.equal("Editorial Shell")
  t.is_builtin |> should.equal(True)
  t.stylesheet_href |> should.equal("assets/styles/editorial.css")
  t.icon |> should.equal("notes")
}

pub fn editorial_theme_matches_builtin_shell_registry_entry_test() {
  let info = editorial.theme() |> theme.to_shell_info

  let builtin =
    shells.builtin_shells()
    |> list.find(fn(s) { s.id == "editorial" })

  case builtin {
    Ok(expected) -> info |> should.equal(expected)
    Error(Nil) -> should.fail()
  }
}

pub fn editorial_view_renders_shell_skeleton_test() {
  let m = model.init("editorial", [sample_app("example.app.alpha", "Alpha")])
  let html_str = editorial.view(m) |> element.to_string

  should.be_true(string.contains(html_str, "editorial-shell-root"))
  should.be_true(string.contains(html_str, "id=\"editorial-shell-root\""))
  should.be_true(string.contains(html_str, "data-shell=\"editorial\""))
  should.be_true(string.contains(html_str, "data-theme-mode=\"dark\""))
  should.be_true(string.contains(html_str, "class=\"editorial-header\""))
  should.be_true(string.contains(html_str, "class=\"editorial-brand-title\""))
  should.be_true(string.contains(html_str, ">OMNI</h1>"))
  should.be_true(string.contains(html_str, "class=\"editorial-main-content\""))
  should.be_true(string.contains(html_str, "class=\"editorial-dock-inner\""))
}

pub fn editorial_view_renders_app_subtitle_and_island_test() {
  let m = model.init("editorial", [sample_app("example.app.alpha", "Alpha")])
  let html_str = editorial.view(m) |> element.to_string

  should.be_true(string.contains(html_str, "has-active-app"))
  should.be_true(string.contains(html_str, ">Alpha</span>"))
  should.be_true(string.contains(html_str, "id=\"editorial-page-app\""))
  should.be_true(string.contains(html_str, "id=\"slot-main-example.app.alpha\""))
  should.be_true(string.contains(
    html_str,
    "data-plugin-slot=\"example.app.alpha\"",
  ))
}

pub fn editorial_view_renders_system_pages_test() {
  let base = model.init("editorial", [sample_app("example.app.alpha", "Alpha")])

  let widgets_html =
    editorial.view(Model(..base, active_page: WidgetsDashboard))
    |> element.to_string
  should.be_true(string.contains(widgets_html, "has-widgets-page"))
  should.be_true(string.contains(widgets_html, "id=\"editorial-page-widgets\""))
  should.be_true(string.contains(widgets_html, "omni-widgets-grid"))

  let store_html =
    editorial.view(Model(..base, active_page: AppStore))
    |> element.to_string
  should.be_true(string.contains(store_html, "has-apps-page"))
  should.be_true(string.contains(store_html, "id=\"editorial-page-apps\""))
  should.be_true(string.contains(store_html, "omni-app-store"))

  let settings_html =
    editorial.view(Model(..base, active_page: Settings(TabProfile)))
    |> element.to_string
  should.be_true(string.contains(
    settings_html,
    "id=\"editorial-page-settings\"",
  ))
  should.be_true(string.contains(settings_html, "omni-settings-view"))
  should.be_true(string.contains(settings_html, ">Profile</span>"))
}

pub fn editorial_view_renders_dock_items_test() {
  let m = model.init("editorial", [sample_app("example.app.alpha", "Alpha")])
  let html_str = editorial.view(m) |> element.to_string

  should.be_true(string.contains(
    html_str,
    "id=\"btn-editorial-dock-app-example.app.alpha\"",
  ))
  should.be_true(string.contains(html_str, "id=\"btn-editorial-dock-apps\""))
  should.be_true(string.contains(html_str, "id=\"btn-editorial-dock-widgets\""))
  should.be_true(string.contains(html_str, "id=\"btn-editorial-dock-prefs\""))
  should.be_true(string.contains(html_str, "editorial-dock-item active"))
  should.be_true(string.contains(html_str, "editorial-active-dot"))
}

pub fn editorial_view_reflects_fullscreen_test() {
  let base = model.init("editorial", [])
  let #(m_fs, _) = update.update(base, msg.ToggleFullscreen)
  let html_str = editorial.view(m_fs) |> element.to_string

  should.be_true(string.contains(html_str, "app-fullscreen"))
}

pub fn editorial_view_renders_profile_avatar_test() {
  let prof =
    UserProfileSummary(
      pubkey: "1234abcd",
      npub: "npub11234",
      display_name: "Satoshi",
      picture: Some("https://example.com/avatar.png"),
      nip05: None,
    )
  let m = Model(..model.init("editorial", []), user_profile: Some(prof))
  let html_str = editorial.view(m) |> element.to_string

  should.be_true(string.contains(
    html_str,
    "id=\"btn-editorial-profile-toggle\"",
  ))
  should.be_true(string.contains(
    html_str,
    "src=\"https://example.com/avatar.png\"",
  ))
}

pub fn editorial_view_renders_active_pivot_subtitle_for_apps_test() {
  let base = model.init("editorial", [])
  let m = update.update(base, msg.NavigateTo(AppStore)) |> fn(r) { r.0 }
  let html_str = editorial.view(m) |> element.to_string

  should.be_true(string.contains(html_str, ">Apps</span>"))
  should.be_true(string.contains(html_str, "id=\"editorial-dock-items\""))
}
