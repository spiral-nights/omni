import gleam/dict
import gleam/dynamic
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import lustre/element
import omni/protocol/schema/action.{NavigateTarget}
import omni/protocol/schema/node.{
  Body, Box, Column, Text, TonePrimary, empty_base,
}
import omni/protocol/schema/style.{SizeMd}
import omni/ui/host.{
  ClearSchema, SetSchema, SetSchemaJson, TriggerAction, encode_action_envelope,
}

pub fn host_init_and_set_schema_test() {
  let model = host.init(fn(_) { Nil })
  should.equal(model.root, None)
  should.equal(model.dispatched_actions, [])
  should.equal(element.to_string(host.view(model)), "")

  let tree =
    Box(
      base: empty_base(),
      direction: Some(Column),
      gap: Some(SizeMd),
      align: None,
      justify: None,
      wrap: None,
      padding: None,
      action: None,
      background: None,
      children: [
        Text(
          base: empty_base(),
          content: "Hosted Schema Tree",
          variant: Some(Body),
          tone: Some(TonePrimary),
          truncate: None,
          action: None,
          show_inline_images: None,
        ),
      ],
    )

  let model = host.update(model, SetSchema(tree))
  should.equal(model.root, Some(tree))

  let rendered = element.to_string(host.view(model))
  should.be_true(string.starts_with(
    rendered,
    "<div class=\"omni-schema-host\">",
  ))
  should.be_true(string.contains(rendered, "Hosted Schema Tree"))

  let cleared = host.update(model, ClearSchema)
  should.equal(cleared.root, None)
  should.equal(element.to_string(host.view(cleared)), "")
}

pub fn host_set_schema_json_test() {
  let model = host.init(fn(_) { Nil })

  // 1. Direct node JSON
  let raw_node =
    "{\"type\":\"text\",\"content\":\"Decoded from JSON\",\"variant\":\"title\"}"
  let model = host.update(model, SetSchemaJson(raw_node))
  let rendered = element.to_string(host.view(model))
  should.be_true(string.contains(rendered, "Decoded from JSON"))
  should.be_true(string.contains(rendered, "omni-text-title"))

  // 2. Full omni:schema envelope JSON
  let raw_envelope =
    "{\"type\":\"omni:schema\",\"schema\":{\"type\":\"button\",\"label\":\"Click Me\",\"action\":{\"name\":\"btn-clicked\"}}}"
  let model2 = host.update(model, SetSchemaJson(raw_envelope))
  let rendered2 = element.to_string(host.view(model2))
  should.be_true(string.contains(rendered2, "Click Me"))
  should.be_true(string.contains(rendered2, "data-action=\"btn-clicked\""))

  // 3. Invalid JSON leaves root intact
  let model3 = host.update(model2, SetSchemaJson("{invalid json"))
  should.equal(model3.root, model2.root)
}

pub fn host_trigger_action_and_encode_envelope_test() {
  let model = host.init(fn(_) { Nil })

  let payload =
    dict.from_list([
      #("noteId", dynamic.string("note1xyz")),
      #("count", dynamic.int(3)),
    ])
  let nav =
    NavigateTarget(
      plugin_id: None,
      view: Some("thread"),
      route: Some("?view=thread&id=note1xyz"),
      page: Some("thread-view"),
      back: None,
    )
  let act =
    action.new("open-thread")
    |> action.with_payload(payload)
    |> action.with_navigate(nav)

  let model = host.update(model, TriggerAction(act))
  should.equal(model.dispatched_actions, [act])

  let envelope = encode_action_envelope(act)
  should.be_true(string.contains(envelope, "\"type\":\"omni:action\""))
  should.be_true(string.contains(envelope, "\"action\":\"open-thread\""))
  should.be_true(string.contains(envelope, "\"noteId\":\"note1xyz\""))
  should.be_true(string.contains(envelope, "\"count\":3"))
  should.be_true(string.contains(envelope, "\"view\":\"thread\""))
  should.be_true(string.contains(
    envelope,
    "\"route\":\"?view=thread&id=note1xyz\"",
  ))
}
