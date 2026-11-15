//// Declarative Schema UI views for `plugin_publisher`.

import gleam/bit_array
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
import plugin/publisher/bundle
import plugin/publisher/model.{
  type BlossomServer, type Model, type PublishedPlugin, type StudioTab,
  ModeBlossom, ModeInlined, TabPublished, TabServers, TabStudio, TabWidget,
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
    schema.button("Open Plugin Studio", action.navigate_view("studio"))

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
      "Bundle URL (.zip, .html, .js) or naddr1...",
      model.bundle_url,
      "set-bundle-url",
    )

  let fetch_url_btn =
    schema.button("Fetch & Inspect", schema.new_action("fetch-url"))
    |> schema.with_icon("download")

  let install_url_btn = case
    schema.button("Install from URL", schema.new_action("install-url"))
    |> schema.with_icon("globe")
  {
    node.Button(..) as b -> node.Button(..b, variant: Some(ButtonSecondary))
    other -> other
  }

  let choose_zip_btn =
    schema.button("Choose .zip", schema.new_action("choose-local-zip"))
    |> schema.with_icon("upload")

  let choose_file_btn =
    schema.button("Choose .html/.js", schema.new_action("choose-local-file"))
    |> schema.with_icon("file")

  let template_btn =
    schema.button("Start from Template", schema.new_action("use-template"))
    |> schema.with_icon("file")

  let source_url_row =
    schema.box()
    |> schema.row()
    |> schema.gap("sm")
    |> schema.children([bundle_url_input, fetch_url_btn])

  let source_file_row =
    schema.box()
    |> schema.row()
    |> schema.gap("sm")
    |> schema.children([
      choose_zip_btn,
      choose_file_btn,
      install_url_btn,
      template_btn,
    ])

  let source_card =
    schema.card()
    |> schema.title("1. Choose Source")
    |> schema.subtitle(
      "Load a local bundle (.zip, .html, .js) or fetch from a URL / naddr",
    )
    |> schema.with_icon("upload")
    |> schema.children([source_url_row, source_file_row])

  let packaging_toggle = case
    schema.toggle(
      "packagingMode",
      model.packaging_mode == ModeInlined,
      schema.new_action("set-packaging-mode"),
    )
  {
    node.Toggle(..) as t ->
      node.Toggle(
        ..t,
        label: Some(case model.packaging_mode {
          ModeInlined -> "Embed single HTML file directly in Nostr event"
          ModeBlossom -> "Upload multi-file bundle to Blossom media server"
        }),
      )
    other -> other
  }

  let install_local_btn = case
    schema.button("Install on This Device", schema.new_action("install-local"))
    |> schema.with_icon("package")
  {
    node.Button(..) as b -> node.Button(..b, variant: Some(ButtonSecondary))
    other -> other
  }

  let publish_label = case model.packaging_mode {
    ModeInlined -> "Publish to Nostr"
    ModeBlossom -> "Upload & Publish to Nostr"
  }

  let publish_btn =
    schema.button(publish_label, schema.new_action("publish-package"))
    |> schema.with_icon("upload")

  let action_hint =
    schema.text(
      "Install on This Device saves the app locally in your browser. Publish shares it to your Nostr relays.",
    )
    |> schema.text_variant(node.Caption)
    |> schema.text_tone(node.ToneMuted)

  let action_row =
    schema.box()
    |> schema.row()
    |> schema.gap("sm")
    |> schema.justify(JustifyEnd)
    |> schema.children([install_local_btn, publish_btn])

  let details_card =
    schema.card()
    |> schema.title("2. App Details & Publish")
    |> schema.subtitle(
      "Set app metadata, install locally to test, or publish to Nostr",
    )
    |> schema.with_icon("edit")
    |> schema.children([
      row_meta,
      desc_input,
      packaging_toggle,
      action_hint,
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

  let preview_files = case model.packaging_mode, model.bundle {
    ModeInlined, _ -> []
    ModeBlossom, Some(parsed) -> parsed.files
    ModeBlossom, None -> []
  }
  let preview_servers = case model.packaging_mode {
    ModeInlined -> []
    ModeBlossom ->
      model.servers
      |> list.filter(fn(s: BlossomServer) { s.enabled })
      |> list.map(fn(s: BlossomServer) { blossom.normalize_server(s.url) })
  }
  let preview_content = case model.packaging_mode, model.bundle {
    ModeInlined, Some(parsed) ->
      case bundle.entry_file(parsed) {
        Ok(entry) ->
          case bit_array.to_string(entry.bytes) {
            Ok(txt) -> txt
            Error(_) -> ""
          }
        Error(_) -> ""
      }
    _, _ -> ""
  }
  let tags = model.build_nip5a_tags(d, preview_files, preview_servers)
  let preview_json =
    json.object([
      #("kind", json.int(35_129)),
      #(
        "tags",
        json.array(tags, of: fn(tag) { json.array(tag, of: json.string) }),
      ),
      #("content", json.string(preview_content)),
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

  let inventory = render_bundle_inventory(model)

  case model.bundle, model.upload_reports {
    Some(_), _ -> [
      source_card,
      details_card,
      hash_inspector_card,
      inventory,
      preview_card,
    ]
    None, [] -> [source_card, details_card]
    None, _ -> [source_card, details_card, inventory]
  }
}

fn render_published_tab(model: Model) -> List(Node) {
  let query_btn =
    schema.button("Query Relays", schema.new_action("query-relays"))
    |> schema.with_icon("refresh")

  let toolbar_card =
    schema.card()
    |> schema.title("Published Packages (Kind 35129)")
    |> schema.subtitle("Sync published NIP-5A manifests from configured relays")
    |> schema.with_icon("globe")
    |> schema.children([
      schema.box()
      |> schema.row()
      |> schema.justify(JustifyEnd)
      |> schema.children([query_btn]),
    ])

  let body = case model.published {
    [] -> [
      schema.empty_state("No published plugins yet")
      |> schema.with_icon("globe"),
    ]
    items -> list.map(items, render_published_card)
  }

  [toolbar_card, ..body]
}

fn render_bundle_inventory(model: Model) -> Node {
  let files = case model.bundle {
    Some(parsed) -> parsed.files
    None -> []
  }
  let items =
    list.map(files, fn(file) {
      schema.list_item(file.path)
      |> schema.subtitle(
        file.mime
        <> " | "
        <> int.to_string(file.size)
        <> " bytes | "
        <> string.slice(file.sha256, 0, 12)
        <> "...",
      )
      |> schema.with_icon("file")
    })
  let report_items =
    list.map(model.upload_reports, fn(report) {
      let ok =
        list.count(report.servers, fn(pair) {
          case pair {
            #(_, True) -> True
            _ -> False
          }
        })
      schema.list_item(report.path)
      |> schema.subtitle(
        "Uploaded to "
        <> int.to_string(ok)
        <> "/"
        <> int.to_string(list.length(report.servers))
        <> " server(s)",
      )
      |> schema.with_icon("upload")
    })

  schema.card()
  |> schema.title("Bundle File Inventory")
  |> schema.subtitle(case files {
    [] -> "No bundle loaded yet."
    list -> int.to_string(list.length(list)) <> " file(s) packaged"
  })
  |> schema.with_icon("package")
  |> schema.children(
    list.append([schema.list_view(items)], case report_items {
      [] -> []
      _ -> [schema.list_view(report_items)]
    }),
  )
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
    schema.box()
      |> schema.row()
      |> schema.gap("sm")
      |> schema.justify(JustifyEnd)
      |> schema.children([
        schema.button("Install / Update", naddr_action("open-naddr", pkg.naddr))
          |> schema.with_icon("download"),
        case
          schema.button("Update .zip", id_action("prepare-update", pkg.id))
          |> schema.with_icon("edit")
        {
          node.Button(..) as b ->
            node.Button(..b, variant: Some(ButtonSecondary))
          other -> other
        },
        case
          schema.button(
            "Delete (Kind 5)",
            url_action("delete-published", pkg.id),
          )
          |> schema.with_icon("trash")
        {
          node.Button(..) as b -> node.Button(..b, variant: Some(ButtonDanger))
          other -> other
        },
      ]),
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

  let sync_btn =
    schema.button(
      "Publish Server List (Kind 10063)",
      schema.new_action("publish-server-list"),
    )
    |> schema.with_icon("send")

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
      schema.box()
        |> schema.row()
        |> schema.justify(JustifyEnd)
        |> schema.children([sync_btn]),
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

fn naddr_action(action_name: String, naddr: String) -> Action {
  let payload = dict.from_list([#("naddr", dynamic.string(naddr))])
  schema.new_action(action_name)
  |> schema.with_payload(payload)
}

fn id_action(action_name: String, id: String) -> Action {
  let payload = dict.from_list([#("id", dynamic.string(id))])
  schema.new_action(action_name)
  |> schema.with_payload(payload)
}

fn url_action(action_name: String, url: String) -> Action {
  let payload = dict.from_list([#("url", dynamic.string(url))])
  schema.new_action(action_name)
  |> schema.with_payload(payload)
}
