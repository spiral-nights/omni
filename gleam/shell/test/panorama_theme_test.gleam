//// Unit tests for the Panorama Hub shell theme (Phase 6.6).

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
import omni/shell/themes/panorama
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

pub fn panorama_theme_descriptor_test() {
  let t = panorama.theme()

  t.id |> should.equal("panorama")
  t.name |> should.equal("Panorama Hub")
  t.is_builtin |> should.equal(True)
  t.stylesheet_href |> should.equal("assets/styles/panorama.css")
  t.icon |> should.equal("windows")
}

pub fn panorama_theme_matches_builtin_shell_registry_entry_test() {
  let info = panorama.theme() |> theme.to_shell_info

  let builtin =
    shells.builtin_shells()
    |> list.find(fn(s) { s.id == "panorama" })

  case builtin {
    Ok(expected) -> info |> should.equal(expected)
    Error(Nil) -> should.fail()
  }
}

pub fn panorama_view_renders_shell_skeleton_test() {
  let m = model.init("panorama", [sample_app("example.app.alpha", "Alpha")])
  let html_str = panorama.view(m) |> element.to_string

  should.be_true(string.contains(html_str, "omni-shell panorama-shell-root"))
  should.be_true(string.contains(html_str, "id=\"panorama-shell-root\""))
  should.be_true(string.contains(html_str, "data-shell=\"panorama\""))
  should.be_true(string.contains(html_str, "class=\"panorama-hero-header\""))
  should.be_true(string.contains(html_str, "id=\"panorama-pivot-nav\""))
  should.be_true(string.contains(html_str, "class=\"panorama-canvas\""))
  should.be_true(string.contains(html_str, "id=\"panorama-header-user-btn\""))
}

pub fn panorama_view_renders_pivot_items_test() {
  let m = model.init("panorama", [sample_app("example.app.alpha", "Alpha")])
  let html_str = panorama.view(m) |> element.to_string

  should.be_true(string.contains(html_str, "id=\"pivot-app-example.app.alpha\""))
  should.be_true(string.contains(html_str, "id=\"pivot-widgets\""))
  should.be_true(string.contains(html_str, "id=\"pivot-apps\""))
  should.be_true(string.contains(html_str, "id=\"pivot-system\""))
  should.be_true(string.contains(
    html_str,
    "class=\"panorama-pivot-item active\"",
  ))
}

pub fn panorama_view_marks_active_pivot_item_test() {
  let base = model.init("panorama", [sample_app("example.app.alpha", "Alpha")])

  let m_widgets =
    update.update(base, msg.NavigateTo(WidgetsDashboard)) |> fn(m) { m.0 }
  let widgets_html = panorama.view(m_widgets) |> element.to_string
  should.be_true(string.contains(widgets_html, "id=\"pivot-widgets\""))
  should.be_true(string.contains(widgets_html, "aria-current=\"page\""))
  should.be_true(string.contains(
    widgets_html,
    "id=\"panorama-section-widgets\"",
  ))

  let m_store = update.update(base, msg.NavigateTo(AppStore)) |> fn(m) { m.0 }
  let store_html = panorama.view(m_store) |> element.to_string
  should.be_true(string.contains(store_html, "id=\"panorama-section-apps\""))
}

pub fn panorama_view_renders_active_app_island_test() {
  let m = model.init("panorama", [sample_app("example.app.alpha", "Alpha")])
  let html_str = panorama.view(m) |> element.to_string

  should.be_true(string.contains(html_str, "panorama-app-active-view"))
  should.be_true(string.contains(html_str, "id=\"slot-main-example.app.alpha\""))
  should.be_true(string.contains(
    html_str,
    "data-plugin-slot=\"example.app.alpha\"",
  ))
}

pub fn panorama_view_renders_system_section_for_settings_test() {
  let base = model.init("panorama", [])
  let m = update.update(base, msg.OpenSettings(TabProfile)) |> fn(m) { m.0 }
  let html_str = panorama.view(m) |> element.to_string

  should.be_true(string.contains(html_str, "id=\"panorama-section-system\""))
  should.be_true(string.contains(html_str, "data-settings-tab=\"profile\""))
  should.be_true(string.contains(html_str, "omni-settings-view"))
}

pub fn panorama_view_applies_accent_color_test() {
  let m = Model(..model.init("panorama", []), accent_color: "#b88320")
  let html_str = panorama.view(m) |> element.to_string

  should.be_true(string.contains(html_str, "--omni-accent-primary:#b88320"))
}

pub fn panorama_view_renders_profile_identity_test() {
  let prof =
    UserProfileSummary(
      pubkey: "1234abcd",
      npub: "npub11234",
      display_name: "Satoshi",
      picture: Some("https://example.com/avatar.png"),
      nip05: None,
    )
  let m = Model(..model.init("panorama", []), user_profile: Some(prof))
  let html_str = panorama.view(m) |> element.to_string

  should.be_true(string.contains(html_str, ">Satoshi</span>"))
  should.be_true(string.contains(
    html_str,
    "src=\"https://example.com/avatar.png\"",
  ))
}
