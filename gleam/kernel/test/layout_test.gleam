import gleam/list
import gleeunit/should
import omni/kernel/layout/layout.{type ViewportAssignment, ViewportAssignment}
import omni/protocol/viewport.{Dock, HeaderActions, HeaderStatus, Main, Sidebar}

fn make_assign(
  plugin_id: String,
  comp_id: String,
  vp: viewport.Viewport,
  order: Int,
) -> ViewportAssignment {
  ViewportAssignment(
    plugin_id: plugin_id,
    component_id: comp_id,
    viewport: vp,
    order: order,
    enabled: True,
  )
}

pub fn layout_assign_and_get_test() {
  let model =
    layout.new()
    |> layout.assign(make_assign("plugin.feed", "main", Main, 0))
    |> layout.assign(make_assign("plugin.feed", "dock", Dock, 0))

  layout.count(model) |> should.equal(2)
  layout.get_viewport(model, "plugin.feed", "main") |> should.equal(Ok(Main))
  layout.get_viewport(model, "plugin.feed", "dock") |> should.equal(Ok(Dock))
  layout.get_viewport(model, "plugin.feed", "missing") |> should.be_error
}

pub fn layout_set_viewport_and_reorder_test() {
  let model =
    layout.new()
    |> layout.assign(make_assign("p1", "widget1", Sidebar, 0))
    |> layout.assign(make_assign("p2", "widget2", Sidebar, 1))

  // Move widget1 to Dock
  let moved = layout.set_viewport(model, "p1", "widget1", Dock)
  layout.get_viewport(moved, "p1", "widget1") |> should.equal(Ok(Dock))

  let sidebar_items = layout.get_for_viewport(moved, Sidebar)
  let assert [a] = sidebar_items
  a.component_id |> should.equal("widget2")

  let dock_items = layout.get_for_viewport(moved, Dock)
  let assert [d] = dock_items
  d.component_id |> should.equal("widget1")
}

pub fn layout_reorder_viewport_test() {
  let model =
    layout.new()
    |> layout.assign(make_assign("p1", "w1", Sidebar, 0))
    |> layout.assign(make_assign("p2", "w2", Sidebar, 1))
    |> layout.assign(make_assign("p3", "w3", Sidebar, 2))

  // Reorder to w3, w1, w2
  let reordered = layout.reorder_viewport(model, Sidebar, ["w3", "w1", "w2"])
  let items = layout.get_for_viewport(reordered, Sidebar)

  let assert [first, second, third] = items
  first.component_id |> should.equal("w3")
  second.component_id |> should.equal("w1")
  third.component_id |> should.equal("w2")
}

pub fn layout_set_enabled_and_filter_test() {
  let model =
    layout.new()
    |> layout.assign(make_assign("p1", "action1", HeaderActions, 0))
    |> layout.assign(make_assign("p2", "action2", HeaderActions, 1))
    |> layout.set_enabled("p1", "action1", False)

  layout.is_component_enabled(model, "p1", "action1") |> should.be_false
  layout.is_component_enabled(model, "p2", "action2") |> should.be_true

  let all_items = layout.get_for_viewport(model, HeaderActions)
  list.length(all_items) |> should.equal(2)

  let enabled_items = layout.get_enabled_for_viewport(model, HeaderActions)
  let assert [item] = enabled_items
  item.component_id |> should.equal("action2")
}

pub fn layout_remove_component_and_plugin_test() {
  let model =
    layout.new()
    |> layout.assign(make_assign("pluginA", "comp1", Sidebar, 0))
    |> layout.assign(make_assign("pluginA", "comp2", Dock, 0))
    |> layout.assign(make_assign("pluginB", "comp3", HeaderStatus, 0))

  layout.count(model) |> should.equal(3)

  let without_comp = layout.remove_component(model, "pluginA", "comp1")
  layout.count(without_comp) |> should.equal(2)
  layout.get_viewport(without_comp, "pluginA", "comp1") |> should.be_error

  let without_plugin = layout.remove_plugin(model, "pluginA")
  layout.count(without_plugin) |> should.equal(1)
  layout.get_viewport(without_plugin, "pluginB", "comp3")
  |> should.equal(Ok(HeaderStatus))
}
