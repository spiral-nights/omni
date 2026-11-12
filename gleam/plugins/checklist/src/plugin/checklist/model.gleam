//// Domain model, filters, settings, local store configuration, and Nostr document
//// specification for the Checklist plugin.

import gleam/dynamic/decode.{type Decoder}
import gleam/float
import gleam/int
import gleam/json.{type Json}
import gleam/list
import gleam/option.{None}
import gleam/string
import omni/nostr/kind
import omni/plugin_kit/local_store.{type StoreConfig, StoreConfig}
import omni/plugin_kit/nostr.{type DocSpec, DocSpec}
import omni/plugin_kit/route.{type Route}

/// Active task filter tab.
pub type FilterTab {
  FilterAll
  FilterActive
  FilterCompleted
}

/// A single checklist task item.
pub type TaskItem {
  TaskItem(
    id: String,
    title: String,
    completed: Bool,
    created_at: Int,
    priority: String,
  )
}

/// User settings for the checklist plugin.
pub type ChecklistSettings {
  ChecklistSettings(
    sync_nostr: Bool,
    show_completed: Bool,
    default_priority: String,
  )
}

/// Active route view mode.
pub type ViewMode {
  ViewMain
  ViewCompact
  ViewWidget
  ViewSettings
}

/// Complete state model for the checklist plugin.
pub type Model {
  Model(
    tasks: List(TaskItem),
    draft_title: String,
    filter: FilterTab,
    view_mode: ViewMode,
    settings: ChecklistSettings,
    next_id: Int,
  )
}

/// Default NIP-78 addressable document d-tag for checklist synchronization.
pub const checklist_d_tag = "omni/checklist/v1"

/// Default starter tasks when no tasks have been saved yet.
pub fn default_tasks() -> List(TaskItem) {
  [
    TaskItem(
      id: "task-1",
      title: "Send Nostr note",
      completed: True,
      created_at: 1_700_000_001,
      priority: "medium",
    ),
    TaskItem(
      id: "task-2",
      title: "Review Omni PR",
      completed: False,
      created_at: 1_700_000_002,
      priority: "high",
    ),
    TaskItem(
      id: "task-3",
      title: "Test Focus Timer",
      completed: False,
      created_at: 1_700_000_003,
      priority: "medium",
    ),
  ]
}

/// Default checklist settings.
pub fn default_settings() -> ChecklistSettings {
  ChecklistSettings(
    sync_nostr: True,
    show_completed: True,
    default_priority: "medium",
  )
}

/// Maps a `Route` to its corresponding `ViewMode`.
pub fn view_mode_from_route(r: Route) -> ViewMode {
  view_mode_from_string(r.view)
}

/// Parses a view string (`"main"`, `"compact"`, `"widget"`, `"settings"`) into `ViewMode`.
pub fn view_mode_from_string(view_str: String) -> ViewMode {
  case string.lowercase(string.trim(view_str)) {
    "compact" -> ViewCompact
    "widget" -> ViewWidget
    "settings" -> ViewSettings
    _ -> ViewMain
  }
}

/// Converts a `ViewMode` to its canonical string identifier.
pub fn view_mode_to_string(mode: ViewMode) -> String {
  case mode {
    ViewMain -> "main"
    ViewCompact -> "compact"
    ViewWidget -> "widget"
    ViewSettings -> "settings"
  }
}

/// Converts a `FilterTab` to its tab ID string (`"all"`, `"active"`, `"completed"`).
pub fn filter_to_string(tab: FilterTab) -> String {
  case tab {
    FilterAll -> "all"
    FilterActive -> "active"
    FilterCompleted -> "completed"
  }
}

/// Parses a `FilterTab` from a string (`"all"`, `"active"`, `"completed"`).
pub fn filter_from_string(raw: String) -> FilterTab {
  case string.lowercase(string.trim(raw)) {
    "active" -> FilterActive
    "completed" -> FilterCompleted
    _ -> FilterAll
  }
}

/// Initializes a new `Model` for the given `Route` with default starter tasks.
pub fn init(initial_route: Route) -> Model {
  let initial_tasks = default_tasks()
  Model(
    tasks: initial_tasks,
    draft_title: "",
    filter: FilterAll,
    view_mode: view_mode_from_route(initial_route),
    settings: default_settings(),
    next_id: list.length(initial_tasks) + 1,
  )
}

/// Returns the tasks visible under the current `filter` and `settings.show_completed`.
pub fn filtered_tasks(model: Model) -> List(TaskItem) {
  let by_tab = case model.filter {
    FilterAll ->
      case model.settings.show_completed {
        True -> model.tasks
        False -> list.filter(model.tasks, fn(t) { !t.completed })
      }
    FilterActive -> list.filter(model.tasks, fn(t) { !t.completed })
    FilterCompleted -> list.filter(model.tasks, fn(t) { t.completed })
  }
  by_tab
}

/// Counts the number of completed tasks in `model.tasks`.
pub fn completed_count(model: Model) -> Int {
  list.count(model.tasks, fn(t) { t.completed })
}

/// Counts the number of active (incomplete) tasks in `model.tasks`.
pub fn active_count(model: Model) -> Int {
  list.count(model.tasks, fn(t) { !t.completed })
}

/// Computes the task completion percentage (`0` to `100`) as an `Int`.
pub fn completion_percentage(model: Model) -> Int {
  let total = list.length(model.tasks)
  case total <= 0 {
    True -> 0
    False -> {
      let done = completed_count(model)
      let ratio = int.to_float(done * 100) /. int.to_float(total)
      float.round(ratio)
    }
  }
}

/// Encodes a single `TaskItem` to JSON.
pub fn encode_task(task: TaskItem) -> Json {
  json.object([
    #("id", json.string(task.id)),
    #("title", json.string(task.title)),
    #("completed", json.bool(task.completed)),
    #("created_at", json.int(task.created_at)),
    #("priority", json.string(task.priority)),
  ])
}

/// Decoder for a single `TaskItem`.
pub fn task_decoder() -> Decoder(TaskItem) {
  // The previous app stored `{ id: number, text, done }`; accept both shapes.
  use id_raw <- decode.field("id", decode.dynamic)
  let id = case decode.run(id_raw, decode.string) {
    Ok(value) -> value
    Error(_) ->
      case decode.run(id_raw, decode.int) {
        Ok(number) -> int.to_string(number)
        Error(_) -> "task"
      }
  }
  use title_opt <- decode.optional_field(
    "title",
    None,
    decode.optional(decode.string),
  )
  use legacy_title <- decode.optional_field("text", "", decode.string)
  let title = option.unwrap(title_opt, legacy_title)
  use completed_opt <- decode.optional_field(
    "completed",
    None,
    decode.optional(decode.bool),
  )
  use legacy_completed <- decode.optional_field("done", False, decode.bool)
  let completed = option.unwrap(completed_opt, legacy_completed)
  use created_at <- decode.optional_field("created_at", 0, decode.int)
  use priority <- decode.optional_field("priority", "medium", decode.string)
  decode.success(TaskItem(
    id: id,
    title: title,
    completed: completed,
    created_at: created_at,
    priority: priority,
  ))
}

/// Encodes a list of `TaskItem`s to JSON.
pub fn encode_tasks(tasks: List(TaskItem)) -> Json {
  json.array(tasks, of: encode_task)
}

/// Decoder for a list of `TaskItem`s.
pub fn tasks_decoder() -> Decoder(List(TaskItem)) {
  decode.list(task_decoder())
}

/// Encodes `ChecklistSettings` to JSON.
pub fn encode_settings(settings: ChecklistSettings) -> Json {
  json.object([
    #("sync_nostr", json.bool(settings.sync_nostr)),
    #("show_completed", json.bool(settings.show_completed)),
    #("default_priority", json.string(settings.default_priority)),
  ])
}

/// Decoder for `ChecklistSettings`.
pub fn settings_decoder() -> Decoder(ChecklistSettings) {
  use sync_nostr <- decode.optional_field("sync_nostr", True, decode.bool)
  use show_completed <- decode.optional_field(
    "show_completed",
    True,
    decode.bool,
  )
  use default_priority <- decode.optional_field(
    "default_priority",
    "medium",
    decode.string,
  )
  decode.success(ChecklistSettings(
    sync_nostr: sync_nostr,
    show_completed: show_completed,
    default_priority: default_priority,
  ))
}

/// Versioned `local_store.StoreConfig` for persisting checklist tasks.
pub fn tasks_store_config() -> StoreConfig(List(TaskItem)) {
  StoreConfig(
    key: "omni:checklist:tasks",
    version: 1,
    encode: encode_tasks,
    decoder: tasks_decoder(),
    default: default_tasks,
  )
}

/// Versioned `local_store.StoreConfig` for persisting checklist settings.
pub fn settings_store_config() -> StoreConfig(ChecklistSettings) {
  StoreConfig(
    key: "omni:checklist:settings",
    version: 1,
    encode: encode_settings,
    decoder: settings_decoder(),
    default: default_settings,
  )
}

/// Reactive Nostr replaceable document (`kind: 30078`, `d: "omni/checklist/v1"`) specification.
pub fn checklist_doc_spec() -> DocSpec(List(TaskItem)) {
  DocSpec(
    kind: kind.AppData,
    d_tag: checklist_d_tag,
    encrypted: False,
    default: default_tasks(),
    encode: encode_tasks,
    decoder: tasks_decoder(),
  )
}
