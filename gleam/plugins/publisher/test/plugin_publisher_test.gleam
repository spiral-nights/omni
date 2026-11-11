//// Unit and integration tests for `plugin_publisher` (Phase 7.8).

import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import omni/platform/ref
import omni/plugin_kit/app
import omni/plugin_kit/schema
import omni/protocol/schema/node
import plugin/publisher/main
import plugin/publisher/model.{
  type BlossomServer, BlossomServer, PublishDraft, TabPublished, TabServers,
  TabStudio, TabWidget,
}
import plugin/publisher/msg.{
  AddServer, DismissBanner, PublishPackage, RemoveServer, SelectTab,
  SetBundleMetadata, SetDraftDescription, SetDraftIcon, SetDraftId, SetDraftName,
  SetDraftServerUrl, SetDraftVersion, ToggleServer,
}
import plugin/publisher/update
import plugin/publisher/view

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn studio_draft_validation_and_publish_test() {
  let m0 = model.init(TabStudio)
  assert list.length(m0.published) == 0

  // Empty ID rejected
  let #(m1, _) = update.update(m0, SetDraftId("   "))
  let #(m2, _) = update.update(m1, PublishPackage)
  assert m2.error_message != None
  assert list.length(m2.published) == 0

  // Dismiss banner clears error
  let #(m3, _) = update.update(m2, DismissBanner)
  assert m3.error_message == None

  // Populate valid draft and publish
  let #(m4, _) = update.update(m3, SetDraftId("org.example.notes"))
  let #(m5, _) = update.update(m4, SetDraftName("Example Notes"))
  let #(m6, _) = update.update(m5, SetDraftVersion("2.1.0"))
  let #(m7, _) =
    update.update(m6, SetDraftDescription("Encrypted notes nsite."))
  let #(m8, _) = update.update(m7, SetDraftIcon("file"))
  let #(m9, _) =
    update.update(
      m8,
      SetBundleMetadata(
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        size_bytes: 4096,
      ),
    )

  let #(m10, _) = update.update(m9, PublishPackage)
  assert m10.error_message == None
  assert m10.status_message != None
  assert list.length(m10.published) == 1

  let assert [pkg] = m10.published
  assert pkg.id == "org.example.notes"
  assert pkg.name == "Example Notes"
  assert pkg.version == "2.1.0"
  assert pkg.naddr == "naddr1_org.example.notes"
  assert string.contains(pkg.blossom_url, "cdn.satellite.earth")
}

pub fn nip5a_tag_generation_test() {
  let draft =
    PublishDraft(
      id: "example.nsite.timer",
      name: "Focus Timer",
      version: "1.2.0",
      description: "Pomodoro focus timer",
      icon: "clock",
      entry_html: "index.html",
      bundle_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      bundle_size_bytes: 1024,
    )

  let tags =
    model.build_nip5a_tags(
      draft,
      "https://cdn.satellite.earth/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.html",
    )

  assert list.contains(tags, ["d", "example.nsite.timer"])
  assert list.contains(tags, ["name", "Focus Timer"])
  assert list.contains(tags, ["version", "1.2.0"])
  assert list.contains(tags, ["description", "Pomodoro focus timer"])
  assert list.contains(tags, ["icon", "clock"])
  assert list.contains(tags, [
    "f",
    "index.html",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "text/html",
  ])
  assert list.contains(tags, [
    "x",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  ])
}

pub fn blossom_server_management_test() {
  let m0 = model.init(TabServers)
  assert list.length(m0.servers) == 3

  // Reject invalid server URL scheme
  let #(m1, _) = update.update(m0, SetDraftServerUrl("ftp://invalid.server"))
  let #(m2, _) = update.update(m1, AddServer)
  assert m2.error_message != None
  assert list.length(m2.servers) == 3

  // Add valid server URL (strips trailing slash)
  let #(m3, _) =
    update.update(m2, SetDraftServerUrl("https://blossom.example.org/"))
  let #(m4, _) = update.update(m3, AddServer)
  assert m4.error_message == None
  assert m4.draft_server_url == ""
  assert list.length(m4.servers) == 4
  assert list.any(m4.servers, fn(s: BlossomServer) {
    s.url == "https://blossom.example.org" && s.enabled
  })

  // Toggle server enabled flag
  let #(m5, _) = update.update(m4, ToggleServer("https://blossom.example.org"))
  let assert Ok(toggled) =
    list.find(m5.servers, fn(s: BlossomServer) {
      s.url == "https://blossom.example.org"
    })
  assert toggled.enabled == False

  // Remove server
  let #(m6, _) = update.update(m5, RemoveServer("https://blossom.example.org"))
  assert list.length(m6.servers) == 3
}

pub fn tab_navigation_and_views_test() {
  let m_studio = model.init(TabStudio)
  let json_studio = schema.encode_schema_message(view.view(m_studio))
  assert string.contains(json_studio, "Plugin Studio Form")
  assert string.contains(json_studio, "Bundle Hash Inspector")
  assert string.contains(json_studio, "code-block")

  let #(m_pub, _) = update.update(m_studio, SelectTab(TabPublished))
  let json_pub = schema.encode_schema_message(view.view(m_pub))
  assert string.contains(json_pub, "No published plugins yet")

  let #(m_srv, _) = update.update(m_pub, SelectTab(TabServers))
  let json_srv = schema.encode_schema_message(view.view(m_srv))
  assert string.contains(json_srv, "Blossom Server Endpoints")

  let #(m_widget, _) = update.update(m_srv, SelectTab(TabWidget))
  let node_widget = view.view(m_widget)
  assert node.node_type_name(node_widget) == "card"
  let json_widget = schema.encode_schema_message(node_widget)
  assert string.contains(json_widget, "Open Plugin Studio")
}

pub fn start_app_action_round_trip_test() {
  let emitted_ref = ref.new([])
  let running =
    main.start_app("?view=main", fn(n) {
      ref.update(emitted_ref, fn(prev) { list.append(prev, [n]) })
    })

  assert list.length(ref.get(emitted_ref)) == 1
  assert app.current_model(running).active_tab == TabStudio

  // Update draft ID via action
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"set-draft-id\",\"payload\":{\"value\":\"org.example.custom\"}}",
    )
  assert app.current_model(running).draft.id == "org.example.custom"

  // Publish package via action
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"publish-package\"}",
    )
  assert list.length(app.current_model(running).published) == 1

  // Switch tab to published via action
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"select-tab\",\"payload\":{\"tab\":\"published\"}}",
    )
  assert app.current_model(running).active_tab == TabPublished
}
