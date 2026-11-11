//// Viewport assignment and slot layout data model.
////
//// Manages companion surface placement across standard shell viewports:
//// `Main`, `Dock`, `Sidebar`, `HeaderActions`, and `HeaderStatus`.
//// Agnostic to specific plugins: zero hard-coded plugin identifiers.

import gleam/int
import gleam/list
import omni/protocol/viewport.{
  type Viewport, Dock, HeaderActions, HeaderStatus, Main, Sidebar,
}

/// A single component viewport assignment mapping.
pub type ViewportAssignment {
  ViewportAssignment(
    plugin_id: String,
    component_id: String,
    viewport: Viewport,
    order: Int,
    enabled: Bool,
  )
}

/// Headless layout model tracking all component viewport placements.
pub type LayoutModel {
  LayoutModel(assignments: List(ViewportAssignment))
}

/// Create an empty `LayoutModel`.
pub fn new() -> LayoutModel {
  LayoutModel(assignments: [])
}

/// Create a `LayoutModel` from an initial list of assignments.
pub fn from_assignments(assignments: List(ViewportAssignment)) -> LayoutModel {
  LayoutModel(assignments: assignments)
}

/// Return all assignments in the layout model.
pub fn to_assignments(layout: LayoutModel) -> List(ViewportAssignment) {
  layout.assignments
}

/// Total count of assigned components.
pub fn count(layout: LayoutModel) -> Int {
  list.length(layout.assignments)
}

/// Return list of all standard shell viewports.
pub fn standard_viewports() -> List(Viewport) {
  [Main, Dock, Sidebar, HeaderStatus, HeaderActions]
}

/// Lookup assignment for a specific plugin component.
pub fn get_assignment(
  layout: LayoutModel,
  plugin_id: String,
  component_id: String,
) -> Result(ViewportAssignment, Nil) {
  list.find(layout.assignments, fn(a) {
    a.plugin_id == plugin_id && a.component_id == component_id
  })
}

/// Lookup assigned viewport for a specific plugin component.
pub fn get_viewport(
  layout: LayoutModel,
  plugin_id: String,
  component_id: String,
) -> Result(Viewport, Nil) {
  case get_assignment(layout, plugin_id, component_id) {
    Ok(a) -> Ok(a.viewport)
    Error(Nil) -> Error(Nil)
  }
}

/// Check whether a component is enabled. Defaults to True if not configured.
pub fn is_component_enabled(
  layout: LayoutModel,
  plugin_id: String,
  component_id: String,
) -> Bool {
  case get_assignment(layout, plugin_id, component_id) {
    Ok(a) -> a.enabled
    Error(Nil) -> True
  }
}

/// Assign or update a component's viewport placement.
pub fn assign(
  layout: LayoutModel,
  assignment: ViewportAssignment,
) -> LayoutModel {
  let is_existing =
    list.any(layout.assignments, fn(a) {
      a.plugin_id == assignment.plugin_id
      && a.component_id == assignment.component_id
    })

  let updated = case is_existing {
    True ->
      list.map(layout.assignments, fn(a) {
        case
          a.plugin_id == assignment.plugin_id
          && a.component_id == assignment.component_id
        {
          True -> assignment
          False -> a
        }
      })
    False -> list.append(layout.assignments, [assignment])
  }

  LayoutModel(assignments: updated)
}

/// Move a component to a new viewport, placing it at the end of that viewport.
pub fn set_viewport(
  layout: LayoutModel,
  plugin_id: String,
  component_id: String,
  target_viewport: Viewport,
) -> LayoutModel {
  let existing_in_target = get_for_viewport(layout, target_viewport)
  let next_order = list.length(existing_in_target)

  case get_assignment(layout, plugin_id, component_id) {
    Ok(prev) -> {
      let updated =
        ViewportAssignment(..prev, viewport: target_viewport, order: next_order)
      assign(layout, updated)
    }
    Error(Nil) -> {
      let new_assignment =
        ViewportAssignment(
          plugin_id: plugin_id,
          component_id: component_id,
          viewport: target_viewport,
          order: next_order,
          enabled: True,
        )
      assign(layout, new_assignment)
    }
  }
}

/// Update ordering index of a component.
pub fn set_order(
  layout: LayoutModel,
  plugin_id: String,
  component_id: String,
  order: Int,
) -> LayoutModel {
  let updated =
    list.map(layout.assignments, fn(a) {
      case a.plugin_id == plugin_id && a.component_id == component_id {
        True -> ViewportAssignment(..a, order: order)
        False -> a
      }
    })
  LayoutModel(assignments: updated)
}

/// Enable or disable a component assignment.
pub fn set_enabled(
  layout: LayoutModel,
  plugin_id: String,
  component_id: String,
  enabled: Bool,
) -> LayoutModel {
  let updated =
    list.map(layout.assignments, fn(a) {
      case a.plugin_id == plugin_id && a.component_id == component_id {
        True -> ViewportAssignment(..a, enabled: enabled)
        False -> a
      }
    })
  LayoutModel(assignments: updated)
}

/// Remove a single component's assignment.
pub fn remove_component(
  layout: LayoutModel,
  plugin_id: String,
  component_id: String,
) -> LayoutModel {
  let updated =
    list.filter(layout.assignments, fn(a) {
      a.plugin_id != plugin_id || a.component_id != component_id
    })
  LayoutModel(assignments: updated)
}

/// Remove all assignments associated with a plugin (e.g. upon uninstall).
pub fn remove_plugin(layout: LayoutModel, plugin_id: String) -> LayoutModel {
  let updated =
    list.filter(layout.assignments, fn(a) { a.plugin_id != plugin_id })
  LayoutModel(assignments: updated)
}

/// Return all assignments for `viewport`, sorted ascending by `order`.
pub fn get_for_viewport(
  layout: LayoutModel,
  target_viewport: Viewport,
) -> List(ViewportAssignment) {
  layout.assignments
  |> list.filter(fn(a) { a.viewport == target_viewport })
  |> list.sort(fn(a, b) { int.compare(a.order, b.order) })
}

/// Return only enabled assignments for `viewport`, sorted ascending by `order`.
pub fn get_enabled_for_viewport(
  layout: LayoutModel,
  target_viewport: Viewport,
) -> List(ViewportAssignment) {
  layout.assignments
  |> list.filter(fn(a) { a.viewport == target_viewport && a.enabled })
  |> list.sort(fn(a, b) { int.compare(a.order, b.order) })
}

fn find_index(items: List(a), target: a) -> Result(Int, Nil) {
  find_index_loop(items, target, 0)
}

fn find_index_loop(
  items: List(a),
  target: a,
  current: Int,
) -> Result(Int, Nil) {
  case items {
    [] -> Error(Nil)
    [first, ..rest] ->
      case first == target {
        True -> Ok(current)
        False -> find_index_loop(rest, target, current + 1)
      }
  }
}

/// Reorder components within a viewport according to an explicit ID sequence.
pub fn reorder_viewport(
  layout: LayoutModel,
  target_viewport: Viewport,
  ordered_component_ids: List(String),
) -> LayoutModel {
  let updated =
    list.map(layout.assignments, fn(a) {
      case a.viewport == target_viewport {
        True -> {
          case find_index(ordered_component_ids, a.component_id) {
            Ok(idx) -> ViewportAssignment(..a, order: idx)
            Error(Nil) -> a
          }
        }
        False -> a
      }
    })
  LayoutModel(assignments: updated)
}
