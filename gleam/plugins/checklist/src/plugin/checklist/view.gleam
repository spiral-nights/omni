//// Declarative Schema UI rendering for the Checklist plugin across all 4 view modes:
//// `ViewMain`, `ViewCompact`, `ViewWidget`, and `ViewSettings`.

import gleam/dict
import gleam/dynamic
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import omni/plugin_kit/schema.{type Action, type Node}
import omni/protocol/schema/node.{
  AlignCenter, ButtonSecondary, IconButtonDanger, Input, InputText,
  JustifyBetween, ListItem, Metric, MetricInt, MetricString, NodeBase, Progress,
  ProgressBar, SelectOption, TabItem, Toggle,
}
import omni/protocol/schema/style.{SizeSm}
import plugin/checklist/model.{
  type Model, type TaskItem, ViewCompact, ViewMain, ViewSettings, ViewWidget,
}

/// Renders the declarative Schema UI tree for `model` based on `model.view_mode`.
pub fn view(model: Model) -> Node {
  case model.view_mode {
    ViewMain -> view_main(model)
    ViewCompact -> view_compact(model)
    ViewWidget -> view_widget(model)
    ViewSettings -> view_settings(model)
  }
}

fn view_main(model: Model) -> Node {
  let visible_items = model.filtered_tasks(model)
  let total = list.length(model.tasks)
  let done = model.completed_count(model)
  let active = model.active_count(model)
  let pct = model.completion_percentage(model)

  let filter_tabs =
    schema.tabs(
      [
        TabItem(
          id: "all",
          label: "All",
          icon: None,
          badge: Some(int.to_string(total)),
        ),
        TabItem(
          id: "active",
          label: "Active",
          icon: None,
          badge: Some(int.to_string(active)),
        ),
        TabItem(
          id: "completed",
          label: "Completed",
          icon: None,
          badge: Some(int.to_string(done)),
        ),
      ],
      model.filter_to_string(model.filter),
      schema.new_action("set-filter"),
    )

  let progress_node =
    Progress(
      base: NodeBase(
        id: Some("checklist-progress"),
        key: None,
        visible: None,
        style: None,
        page: None,
      ),
      value: int.to_float(pct),
      max: Some(100.0),
      label: Some(int.to_string(pct) <> "% completed"),
      variant: Some(ProgressBar),
      size: None,
      color: None,
      show_ticks: None,
      action: None,
    )

  let task_input_row =
    schema.box()
    |> schema.row()
    |> schema.gap("sm")
    |> schema.align(AlignCenter)
    |> schema.children([
      Input(
        base: node.empty_base(),
        name: "taskText",
        placeholder: Some("Add a new task..."),
        value: Some(model.draft_title),
        input_type: Some(InputText),
        accept: None,
        clearable: Some(True),
        prefix_icon: None,
        action_on_enter: Some(schema.new_action("add-task")),
        action_on_change: Some(schema.new_action("set-draft-title")),
      ),
      schema.button("Add Task", schema.new_action("add-task")),
    ])

  let list_content = case visible_items {
    [] ->
      schema.empty_state("No tasks in this view")
      |> schema.with_icon("check")
    items -> schema.list_view(list.map(items, render_task_item))
  }

  let footer_row =
    schema.box()
    |> schema.row()
    |> schema.align(AlignCenter)
    |> schema.justify(JustifyBetween)
    |> schema.children([
      schema.badge(int.to_string(active) <> " remaining"),
      node.Button(
        base: node.empty_base(),
        label: "Clear Completed",
        action: schema.new_action("clear-completed"),
        variant: Some(ButtonSecondary),
        size: Some(SizeSm),
        icon: None,
        icon_position: None,
        disabled: Some(done == 0),
        loading: None,
      ),
    ])

  schema.card()
  |> schema.title("Task List")
  |> schema.subtitle(
    int.to_string(done) <> " of " <> int.to_string(total) <> " tasks complete",
  )
  |> schema.with_icon("check")
  |> schema.children([
    progress_node,
    task_input_row,
    filter_tabs,
    list_content,
  ])
  |> schema.footer([footer_row])
}

fn view_compact(model: Model) -> Node {
  let pct = model.completion_percentage(model)
  let next_pending = list.find(model.tasks, fn(t) { !t.completed })
  let subtext_str = case next_pending {
    Ok(task) -> "Next: " <> task.title
    Error(Nil) -> "All tasks complete!"
  }

  Metric(
    base: node.empty_base(),
    label: "Tasks Done",
    value: MetricString(int.to_string(pct) <> "%"),
    subtext: Some(subtext_str),
    trend: None,
  )
}

fn view_widget(model: Model) -> Node {
  let visible_items = model.filtered_tasks(model)
  let input_row =
    schema.box()
    |> schema.row()
    |> schema.gap("sm")
    |> schema.children([
      Input(
        base: node.empty_base(),
        name: "taskText",
        placeholder: Some("Add task..."),
        value: Some(model.draft_title),
        input_type: Some(InputText),
        accept: None,
        clearable: None,
        prefix_icon: None,
        action_on_enter: Some(schema.new_action("add-task")),
        action_on_change: Some(schema.new_action("set-draft-title")),
      ),
      node.Button(
        base: node.empty_base(),
        label: "+",
        action: schema.new_action("add-task"),
        variant: None,
        size: Some(SizeSm),
        icon: None,
        icon_position: None,
        disabled: None,
        loading: None,
      ),
    ])

  schema.card()
  |> schema.title("Task List")
  |> schema.with_icon("check")
  |> schema.children([
    input_row,
    schema.list_view(list.map(visible_items, render_task_item)),
  ])
}

fn view_settings(model: Model) -> Node {
  let total = list.length(model.tasks)
  let done = model.completed_count(model)

  let metrics_row =
    schema.box()
    |> schema.row()
    |> schema.gap("md")
    |> schema.children([
      schema.metric("Total Tasks", MetricInt(total)),
      schema.metric("Completed", MetricInt(done)),
    ])

  let sync_toggle =
    Toggle(
      base: node.empty_base(),
      name: "syncNostr",
      label: Some("Synchronize tasks via Nostr NIP-78"),
      checked: model.settings.sync_nostr,
      action: schema.new_action("toggle-sync-nostr"),
      disabled: None,
    )

  let show_completed_toggle =
    Toggle(
      base: node.empty_base(),
      name: "showCompleted",
      label: Some("Show completed tasks in All view"),
      checked: model.settings.show_completed,
      action: schema.new_action("toggle-show-completed"),
      disabled: None,
    )

  let priority_select =
    schema.select("defaultPriority", [
      SelectOption(label: "Low", value: "low"),
      SelectOption(label: "Medium", value: "medium"),
      SelectOption(label: "High", value: "high"),
    ])
    |> schema.value(model.settings.default_priority)
    |> schema.action(schema.new_action("set-default-priority"))

  let clear_btn =
    node.Button(
      base: node.empty_base(),
      label: "Clear Completed Tasks",
      action: schema.new_action("clear-completed"),
      variant: Some(ButtonSecondary),
      size: None,
      icon: None,
      icon_position: None,
      disabled: None,
      loading: None,
    )

  schema.card()
  |> schema.title("Task List Settings")
  |> schema.subtitle(
    "Manage persistent tasks storage and cleanup completed items.",
  )
  |> schema.children([
    metrics_row,
    sync_toggle,
    show_completed_toggle,
    priority_select,
    clear_btn,
  ])
}

fn render_task_item(t: TaskItem) -> Node {
  let toggle_act = action_with_id("toggle-task", t.id)
  let delete_act = action_with_id("delete-task", t.id)

  let delete_btn =
    node.IconButton(
      base: node.empty_base(),
      icon: "trash",
      tooltip: Some("Delete task"),
      action: delete_act,
      variant: Some(IconButtonDanger),
      size: None,
      disabled: None,
    )

  ListItem(
    base: NodeBase(
      id: Some(t.id),
      key: Some(t.id),
      visible: None,
      style: None,
      page: None,
    ),
    title: t.title,
    subtitle: None,
    meta: Some(t.priority),
    icon: None,
    avatar_url: None,
    avatar_pubkey: None,
    checked: Some(t.completed),
    on_check_action: Some(toggle_act),
    on_click_action: None,
    actions: [delete_btn],
  )
}

fn action_with_id(name: String, id: String) -> Action {
  let payload = dict.from_list([#("id", dynamic.string(id))])
  schema.new_action(name)
  |> schema.with_payload(payload)
}
