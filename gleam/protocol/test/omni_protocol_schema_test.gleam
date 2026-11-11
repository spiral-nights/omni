//// Unit tests for Omni declarative schema nodes, builders, actions, and codecs.

import gleam/dict
import gleam/list
import gleam/option.{None, Some}
import gleeunit/should
import omni/platform/json as platform_json
import omni/protocol/schema/action.{NavigateTarget}
import omni/protocol/schema/builder
import omni/protocol/schema/codec.{SchemaMessage}
import omni/protocol/schema/node.{
  BadgeAccent, BannerInfo, Body, Box, MetricInt, MetricString, Row, SelectOption,
  StatusOnline, TabItem, Title, ToneAccent, TonePrimary,
}
import omni/protocol/schema/style.{
  AccentPrimary, Canvas, Gap, Padding, SizeMd, SizeSm, StyleProps,
}

pub fn builder_composability_test() {
  let tree =
    builder.box()
    |> builder.row()
    |> builder.gap("sm")
    |> builder.padding("md")
    |> builder.with_id("main-container")
    |> builder.child(
      builder.text("Hello Omni")
      |> builder.text_variant(Title)
      |> builder.text_tone(TonePrimary),
    )
    |> builder.child(
      builder.button("Submit", action.new("submit_event"))
      |> builder.with_icon("send"),
    )

  case tree {
    Box(base, direction, gap, _, _, _, padding, _, _, children) -> {
      base.id |> should.equal(Some("main-container"))
      direction |> should.equal(Some(Row))
      gap |> should.equal(Some(SizeSm))
      padding |> should.equal(Some(SizeMd))
      list.length(children) |> should.equal(2)
    }
    _ -> should.fail()
  }
}

pub fn action_and_navigation_roundtrip_test() {
  let nav =
    NavigateTarget(
      plugin_id: Some("org.omni.plugin.feed"),
      view: Some("thread"),
      route: Some("?view=thread&id=123"),
      page: Some("thread:123"),
      back: Some(False),
    )
  let assert Ok(id_dyn) = platform_json.parse_dynamic("\"123\"")
  let assert Ok(count_dyn) = platform_json.parse_dynamic("42")
  let act =
    action.new("open_thread")
    |> action.with_navigate(nav)
    |> action.with_payload(
      dict.from_list([#("id", id_dyn), #("count", count_dyn)]),
    )

  let encoded = action.encode(act)
  let assert Ok(decoded) = action.decode_json(encoded)

  decoded.name |> should.equal("open_thread")
  case decoded.navigate {
    Some(target) -> {
      target.plugin_id |> should.equal(Some("org.omni.plugin.feed"))
      target.view |> should.equal(Some("thread"))
      target.page |> should.equal(Some("thread:123"))
    }
    None -> should.fail()
  }
  case decoded.payload {
    Some(p) -> {
      dict.has_key(p, "id") |> should.be_true
      dict.has_key(p, "count") |> should.be_true
    }
    None -> should.fail()
  }
}

pub fn style_tokens_roundtrip_test() {
  let st =
    StyleProps([
      Padding(SizeMd),
      Gap(SizeSm),
      style.Background(Canvas),
      style.Color(AccentPrimary),
    ])

  let _json_obj = style.to_json(st)
  let css_str = style.to_css_string(st)

  should.be_true(css_str != "")
  should.equal(style.size_to_string(SizeMd), "md")
  should.equal(style.size_from_string("md"), Ok(SizeMd))
  should.equal(style.color_to_var(Canvas), "var(--omni-bg-canvas)")
  should.equal(style.color_to_hex(Canvas), "#141312")
}

pub fn schema_all_nodes_roundtrip_test() {
  let sample_nodes = [
    builder.box()
      |> builder.gap("lg")
      |> builder.child(builder.text("Item in box")),
    builder.card()
      |> builder.title("Card Title")
      |> builder.subtitle("Card Subtitle")
      |> builder.child(builder.text("Inside card")),
    builder.divider(),
    builder.vertical_divider(),
    builder.spacer(),
    builder.text("Content text")
      |> builder.text_variant(Body)
      |> builder.text_tone(ToneAccent),
    builder.badge("Active")
      |> builder.badge_tone(BadgeAccent),
    builder.metric("Total Views", MetricInt(1250)),
    builder.metric("Growth", MetricString("+14%")),
    builder.icon("zap"),
    builder.avatar(),
    builder.button("Click Me", action.new("click")),
    builder.icon_button("settings", action.navigate_view("settings")),
    builder.input("username")
      |> builder.placeholder("Enter name"),
    builder.textarea("bio")
      |> builder.placeholder("Bio"),
    builder.toggle("notifications", True, action.new("toggle_notif")),
    builder.select("options", [
      SelectOption("Option 1", "opt1"),
      SelectOption("Option 2", "opt2"),
    ]),
    builder.tabs(
      [
        TabItem("timeline", "Timeline", Some("clock"), None),
        TabItem("mentions", "Mentions", Some("at"), Some("3")),
      ],
      "timeline",
      action.new("switch_tab"),
    ),
    builder.status_indicator(StatusOnline),
    builder.code_block("const x = 42;"),
    builder.progress(75.5),
    builder.banner("Operation succeeded")
      |> builder.banner_tone(BannerInfo),
    builder.list_view([
      builder.list_item("First item"),
      builder.list_item("Second item"),
    ]),
    builder.empty_state("No notes found")
      |> builder.title("Empty"),
    builder.virtual_list([builder.text("Virtualized item")]),
  ]

  list.each(sample_nodes, fn(node) {
    let encoded = codec.encode_node(node)
    case codec.decode_node(encoded) {
      Ok(decoded) -> {
        node.node_type_name(decoded)
        |> should.equal(node.node_type_name(node))
      }
      Error(_) -> should.fail()
    }
  })
}

pub fn schema_message_envelope_test() {
  let root =
    builder.card()
    |> builder.title("Widget")
    |> builder.child(builder.text("Body"))

  let msg =
    SchemaMessage(
      type_name: "omni:schema",
      schema: root,
      component_id: Some("widget"),
    )

  let encoded = codec.encode_schema_message(msg)
  let assert Ok(decoded) = codec.decode_schema_message(encoded)

  decoded.type_name |> should.equal("omni:schema")
  decoded.component_id |> should.equal(Some("widget"))
  node.node_type_name(decoded.schema) |> should.equal("card")
}
