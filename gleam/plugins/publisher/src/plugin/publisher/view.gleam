//// Declarative Schema UI views for `plugin_publisher`.

import gleam/dict
import gleam/dynamic
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import omni/plugin_kit/schema
import omni/protocol/blossom
import omni/protocol/schema/action.{type Action}
import omni/protocol/schema/node.{
  type Node, AlignCenter, BannerError, BannerSuccess, ButtonDanger,
  ButtonSecondary, CodeBlock, Input, InputUrl, JustifyBetween, JustifyEnd,
  ListItem, MetricInt, TabItem, ToneSecondary,
}
import omni/protocol/schema/style.{SizeSm}
import plugin/publisher/model.{
  type BlossomServer, type Model, type PublishedPlugin, type StudioTab,
  TabPublished, TabServers, TabStudio, TabWidget,
}

/// Renders the root Schema `Node` for the current `Model`.
pub fn view(model: Model) -> Node {
  case model.active_tab {
    TabWidget -> view_widget(model)
    _ -> view_full(model)
  }
}

fn view_widget(model: Model) -> Node {
  let pub_count = list.length(model.published)
  let active_servers =
    list.count(model.servers, fn(s: BlossomServer) { s.enabled })

  let count_metric = schema.metric("Published Plugins", MetricInt(pub_count))

  let srv_text =
    schema.text(
      int.to_string(active_servers) <> " active Blossom server(s) configured.",
    )
    |> schema.text_tone(ToneSecondary)

  let open_btn =
    schema.button("Open Plugin Studio", tab_action("select-tab", "studio"))

  schema.card()
  |> schema.title("Plugin Studio")
  |> schema.subtitle("Packaging & Blossom distribution")
  |> schema.with_icon("package")
  |> schema.children([count_metric, srv_text, open_btn])
}

fn view_full(model: Model) -> Node {
  let pub_count = list.length(model.published)
  let enabled_srv_count =
    list.count(model.servers, fn(s: BlossomServer) { s.enabled })

  let tab_items = [
    TabItem(
      id: "studio",
      label: "Plugin Studio",
      icon: Some("package"),
      badge: None,
    ),
    TabItem(
      id: "published",
      label: "Published (" <> int.to_string(pub_count) <> ")",
      icon: Some("globe"),
      badge: Some(int.to_string(pub_count)),
    ),
    TabItem(
      id: "servers",
      label: "Blossom Servers (" <> int.to_string(enabled_srv_count) <> ")",
      icon: Some("server"),
      badge: None,
    ),
  ]

  let header_card =
    schema.card()
    |> schema.title("Plugin Publisher")
    |> schema.subtitle(
      "Package standard nsites, inspect SHA-256 bundles, and publish NIP-5A events.",
    )
    |> schema.with_icon("package")
    |> schema.children([
      schema.tabs(
        tab_items,
        tab_id(model.active_tab),
        schema.new_action("select-tab"),
      ),
    ])

  let banners = render_banners(model)

  let body_nodes = case model.active_tab {
    TabStudio -> render_studio_tab(model)
    TabPublished -> render_published_tab(model)
    TabServers -> render_servers_tab(model)
    TabWidget -> [view_widget(model)]
  }

  schema.box()
  |> schema.gap("md")
  |> schema.children(list.flatten([[header_card], banners, body_nodes]))
}

fn render_banners(model: Model) -> List(Node) {
  let err_nodes = case model.error_message {
    Some(err) -> {
      let b = case
        schema.banner(err)
        |> schema.title("Publisher Error")
        |> schema.banner_tone(BannerError)
      {
        node.Banner(..) as ban ->
          node.Banner(
            ..ban,
            dismissible: Some(True),
            on_dismiss_action: Some(schema.new_action("dismiss-banner")),
          )
        other -> other
      }
      [b]
    }
    None -> []
  }

  let status_nodes = case model.status_message {
    Some(msg) -> {
      let b = case
        schema.banner(msg)
        |> schema.title("Publish Complete")
        |> schema.banner_tone(BannerSuccess)
      {
        node.Banner(..) as ban ->
          node.Banner(
            ..ban,
            dismissible: Some(True),
            on_dismiss_action: Some(schema.new_action("dismiss-banner")),
          )
        other -> other
      }
      [b]
    }
    None -> []
  }

  list.append(err_nodes, status_nodes)
}

fn render_studio_tab(model: Model) -> List(Node) {
  let d = model.draft

  let id_input =
    input_with_change(
      "appId",
      "App Slug (NIP-5A 'd' tag)",
      d.id,
      "set-draft-id",
    )
  let name_input =
    input_with_change("appName", "Plugin Name", d.name, "set-draft-name")
  let ver_input =
    input_with_change("appVersion", "Version", d.version, "set-draft-version")
  let desc_input =
    input_with_change(
      "appDescription",
      "Description",
      d.description,
      "set-draft-description",
    )
  let icon_input =
    input_with_change("appIcon", "Icon Name", d.icon, "set-draft-icon")

  let row_meta =
    schema.box()
    |> schema.row()
    |> schema.gap("sm")
    |> schema.children([name_input, id_input, ver_input, icon_input])

  let bundle_url_input =
    input_with_change(
      "bundleUrl",
      "Bundle zip URL",
      model.bundle_url,
      "set-bundle-url",
    )

  let load_bundle_btn =
    schema.button("Load Bundle", schema.new_action("load-bundle"))
    |> schema.with_icon("download")

  let choose_zip_btn =
    schema.button("Choose .zip", schema.new_action("choose-local-zip"))
    |> schema.with_icon("upload")

  let bundle_row =
    schema.box()
    |> schema.row()
    |> schema.gap("sm")
    |> schema.children([bundle_url_input, load_bundle_btn, choose_zip_btn])

  let publish_btn =
    schema.button(
      "Upload to Blossom & Publish (NIP-5A)",
      schema.new_action("publish-package"),
    )
    |> schema.with_icon("upload")

  let action_row =
    schema.box()
    |> schema.row()
    |> schema.justify(JustifyEnd)
    |> schema.children([publish_btn])

  let studio_form_card =
    schema.card()
    |> schema.title("Plugin Studio Form")
    |> schema.subtitle("Configure NIP-5A metadata and entry bundle")
    |> schema.with_icon("edit")
    |> schema.children([
      row_meta,
      desc_input,
      bundle_row,
      action_row,
    ])

  let hash_inspector_card =
    schema.card()
    |> schema.title("Bundle Hash Inspector")
    |> schema.subtitle(
      "Entry: "
      <> d.entry_html
      <> " ("
      <> int.to_string(d.bundle_size_bytes)
      <> " bytes)",
    )
    |> schema.with_icon("code")
    |> schema.children([
      schema.text("SHA-256: " <> d.bundle_sha256)
      |> schema.text_tone(ToneSecondary),
    ])

  let preview_files = case model.bundle {
    Some(parsed) -> parsed.files
    None -> []
  }
  let preview_servers =
    model.servers
    |> list.filter(fn(s: BlossomServer) { s.enabled })
    |> list.map(fn(s: BlossomServer) { blossom.normalize_server(s.url) })
  let tags = model.build_nip5a_tags(d, preview_files, preview_servers)
  let preview_json =
    json.object([
      #("kind", json.int(35_129)),
      #(
        "tags",
        json.array(tags, of: fn(tag) { json.array(tag, of: json.string) }),
      ),
      #("content", json.string("")),
    ])
    |> json.to_string

  let code_preview =
    CodeBlock(
      base: node.empty_base(),
      code: preview_json,
      language: Some("json"),
      copyable: Some(True),
    )

  let preview_card =
    schema.card()
    |> schema.title("NIP-5A Event Preview (Kind 35129)")
    |> schema.subtitle("Signed addressable event broadcast to Nostr relays")
    |> schema.with_icon("file")
    |> schema.children([code_preview])

  [studio_form_card, hash_inspector_card, preview_card]
}

fn render_published_tab(model: Model) -> List(Node) {
  case model.published {
    [] -> [
      schema.empty_state("No published plugins yet")
      |> schema.with_icon("globe"),
    ]
    items -> list.map(items, render_published_card)
  }
}

fn render_published_card(pkg: PublishedPlugin) -> Node {
  let naddr_code =
    CodeBlock(
      base: node.empty_base(),
      code: pkg.naddr,
      language: Some("text"),
      copyable: Some(True),
    )

  schema.card()
  |> schema.with_id("published-" <> pkg.id)
  |> schema.title(pkg.name <> " v" <> pkg.version)
  |> schema.subtitle("d:" <> pkg.id <> " | " <> pkg.blossom_url)
  |> schema.with_icon(pkg.icon)
  |> schema.children([
    schema.text(pkg.description),
    naddr_code,
  ])
}

fn render_servers_tab(model: Model) -> List(Node) {
  let srv_input = case
    schema.input("newServerUrl")
    |> schema.input_type(InputUrl)
    |> schema.placeholder("https://blossom.example.com")
    |> schema.value(model.draft_server_url)
  {
    Input(..) as inp ->
      Input(
        ..inp,
        action_on_change: Some(schema.new_action("set-draft-server-url")),
        action_on_enter: Some(schema.new_action("add-server")),
      )
    other -> other
  }

  let add_srv_btn = schema.button("Add Server", schema.new_action("add-server"))

  let add_row =
    schema.box()
    |> schema.row()
    |> schema.gap("sm")
    |> schema.align(AlignCenter)
    |> schema.justify(JustifyBetween)
    |> schema.children([srv_input, add_srv_btn])

  let srv_items = list.map(model.servers, render_server_item)

  [
    schema.card()
    |> schema.title("Blossom Server Endpoints (BUD-01 / Kind 10063)")
    |> schema.subtitle(
      "Content-addressed blob storage servers authenticated via Kind 24242",
    )
    |> schema.with_icon("server")
    |> schema.children([
      add_row,
      schema.list_view(srv_items),
    ]),
  ]
}

fn render_server_item(srv: BlossomServer) -> Node {
  let toggle_label = case srv.enabled {
    True -> "Disable"
    False -> "Enable"
  }
  let state_str = case srv.enabled {
    True -> "Active"
    False -> "Disabled"
  }

  let toggle_btn = case
    schema.button(toggle_label, url_action("toggle-server", srv.url))
  {
    node.Button(..) as b ->
      node.Button(..b, variant: Some(ButtonSecondary), size: Some(SizeSm))
    other -> other
  }

  let remove_btn = case
    schema.button("Remove", url_action("remove-server", srv.url))
  {
    node.Button(..) as b ->
      node.Button(..b, variant: Some(ButtonDanger), size: Some(SizeSm))
    other -> other
  }

  let base_item =
    schema.list_item(srv.url)
    |> schema.subtitle(srv.status <> " | " <> state_str)
    |> schema.with_icon("server")

  case base_item {
    ListItem(..) as li -> ListItem(..li, actions: [toggle_btn, remove_btn])
    other -> other
  }
}

fn input_with_change(
  field_name: String,
  placeholder_text: String,
  current_val: String,
  change_action_name: String,
) -> Node {
  case
    schema.input(field_name)
    |> schema.placeholder(placeholder_text)
    |> schema.value(current_val)
  {
    Input(..) as inp ->
      Input(
        ..inp,
        action_on_change: Some(schema.new_action(change_action_name)),
      )
    other -> other
  }
}

fn tab_id(tab: StudioTab) -> String {
  case tab {
    TabStudio -> "studio"
    TabPublished -> "published"
    TabServers -> "servers"
    TabWidget -> "widget"
  }
}

fn tab_action(action_name: String, tab: String) -> Action {
  let payload = dict.from_list([#("tab", dynamic.string(tab))])
  schema.new_action(action_name)
  |> schema.with_payload(payload)
}

fn url_action(action_name: String, url: String) -> Action {
  let payload = dict.from_list([#("url", dynamic.string(url))])
  schema.new_action(action_name)
  |> schema.with_payload(payload)
}
