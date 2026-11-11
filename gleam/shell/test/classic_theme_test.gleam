//// Unit tests for the Omni Classic shell theme (Phase 6.5).

import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import lustre/element
import omni/shell/model.{
  type InstalledApp, AppStore, InstalledApp, Model, Settings, TabProfile,
  UpdateModalState, ViewOption, WidgetsDashboard,
}
import omni/shell/msg.{ShowUpdateModal, ToggleMobileMenu}
import omni/shell/settings/shells
import omni/shell/theme
import omni/shell/themes/classic
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

pub fn classic_theme_descriptor_test() {
  let t = classic.theme()

  t.id |> should.equal("classic")
  t.name |> should.equal("Omni Classic")
  t.is_builtin |> should.equal(True)
  t.stylesheet_href |> should.equal("assets/styles/classic.css")
  t.icon |> should.equal("layout")
}

pub fn classic_theme_matches_builtin_shell_registry_entry_test() {
  let info = classic.theme() |> theme.to_shell_info

  let builtin =
    shells.builtin_shells()
    |> list.find(fn(s) { s.id == "classic" })

  case builtin {
    Ok(expected) -> info |> should.equal(expected)
    Error(Nil) -> should.fail()
  }
}

pub fn classic_view_renders_shell_skeleton_test() {
  let m = model.init("classic", [sample_app("example.app.alpha", "Alpha")])
  let html_str = classic.view(m) |> element.to_string

  should.be_true(string.contains(html_str, "omni-shell omni-shell-classic"))
  should.be_true(string.contains(html_str, "id=\"omni-shell-root\""))
  should.be_true(string.contains(html_str, "data-shell=\"classic\""))
  should.be_true(string.contains(html_str, "class=\"app-header\""))
  should.be_true(string.contains(html_str, "class=\"brand-logo\""))
  should.be_true(string.contains(html_str, ">Omni</span>"))
  should.be_true(string.contains(html_str, "class=\"app-layout\""))
  should.be_true(string.contains(html_str, "class=\"omni-dock\""))
  should.be_true(string.contains(html_str, "class=\"omni-main-viewport\""))
  should.be_true(string.contains(html_str, "id=\"btn-shell-mobile-menu\""))
  should.be_true(string.contains(html_str, "data-mobile-menu=\"closed\""))
}

pub fn classic_view_renders_active_app_island_test() {
  let m = model.init("classic", [sample_app("example.app.alpha", "Alpha")])
  let html_str = classic.view(m) |> element.to_string

  should.be_true(string.contains(html_str, "id=\"slot-main-example.app.alpha\""))
  should.be_true(string.contains(html_str, "data-active=\"true\""))
  should.be_true(string.contains(
    html_str,
    "data-plugin-slot=\"example.app.alpha\"",
  ))
}

pub fn classic_view_renders_system_pages_test() {
  let base = model.init("classic", [sample_app("example.app.alpha", "Alpha")])

  let widgets_html =
    classic.view(Model(..base, active_page: WidgetsDashboard))
    |> element.to_string
  should.be_true(string.contains(widgets_html, "omni-widgets-grid"))

  let store_html =
    classic.view(Model(..base, active_page: AppStore))
    |> element.to_string
  should.be_true(string.contains(store_html, "omni-app-store"))

  let settings_html =
    classic.view(Model(..base, active_page: Settings(TabProfile)))
    |> element.to_string
  should.be_true(string.contains(settings_html, "omni-settings-view"))
  should.be_true(string.contains(settings_html, "id=\"settings-tab-profile\""))
}

pub fn classic_view_reflects_mobile_menu_state_test() {
  let base = model.init("classic", [])

  let #(m_open, _) = update.update(base, ToggleMobileMenu)
  let open_html = classic.view(m_open) |> element.to_string
  should.be_true(string.contains(open_html, "data-mobile-menu=\"open\""))
  should.be_true(string.contains(open_html, "aria-expanded=\"true\""))

  let closed_html = classic.view(base) |> element.to_string
  should.be_true(string.contains(closed_html, "data-mobile-menu=\"closed\""))
}

pub fn classic_view_overlays_hidden_by_default_test() {
  let m = model.init("classic", [])
  let html_str = classic.view(m) |> element.to_string

  should.be_true(!string.contains(html_str, "omni-modal-overlay open"))
  should.be_true(string.contains(html_str, "id=\"omni-pull-to-refresh\""))
}

pub fn classic_view_renders_update_modal_when_active_test() {
  let base = model.init("classic", [])
  let #(m_modal, _) =
    update.update(
      base,
      ShowUpdateModal(UpdateModalState(
        plugin_id: "example.app.alpha",
        plugin_name: "Alpha",
        current_version: "1.0.0",
        latest_version: "1.1.0",
        changelog: Some("Bug fixes"),
      )),
    )

  let html_str = classic.view(m_modal) |> element.to_string
  should.be_true(string.contains(html_str, "omni-modal-overlay open"))
  should.be_true(string.contains(html_str, "v1.0.0 -&gt; v1.1.0"))
}
