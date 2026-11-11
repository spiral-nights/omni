//// Nsite bundle installation: fetch a URL and build an installed app entry.

import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import omni/platform/http
import omni/shell/model.{type InstalledApp, InstalledApp, ViewOption}

/// A fetched bundle ready to be mounted in a sandbox.
pub type InstalledBundle {
  InstalledBundle(app: InstalledApp, content: String)
}

/// Fetch `url` as a self-contained nsite document and describe it.
pub fn resolve_url(
  url: String,
  plugin_id: String,
) -> Promise(Result(InstalledBundle, String)) {
  use result <- promise.await(http.fetch_text(url))
  promise.resolve(case result {
    Error(err) -> Error(err)
    Ok(content) ->
      Ok(InstalledBundle(app: app_from(url, plugin_id), content: content))
  })
}

/// Build the installed-app descriptor for a fetched URL bundle.
pub fn app_from(url: String, plugin_id: String) -> InstalledApp {
  let name = case string.split(url, "/") |> list.reverse {
    [last, ..] if last != "" -> last
    _ -> "Custom Nsite"
  }
  InstalledApp(
    id: plugin_id,
    name: name,
    display_name: Some(name),
    description: "Installed from " <> url,
    icon: "apps",
    enabled: True,
    pinned: True,
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
