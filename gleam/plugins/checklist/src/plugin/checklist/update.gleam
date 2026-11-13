//// Pure Elm-style state transitions and action mapping for the Checklist plugin.

import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import omni/nostr/event.{UnsignedEvent}
import omni/nostr/kind
import omni/platform/clock
import omni/plugin_kit/app.{type Effect, Publish}
import omni/plugin_kit/schema.{type Action}
import plugin/checklist/model.{
  type Model, type TaskItem, ChecklistSettings, Model, TaskItem, checklist_d_tag,
  encode_tasks, tasks_decoder,
}
import plugin/checklist/msg.{
  type Msg, AddTask, ClearCompleted, DeleteTask, IngestRemoteDoc, LoadTasks,
  SetDefaultPriority, SetDraftTitle, SetFilter, SetViewMode, ToggleShowCompleted,
  ToggleSyncNostr, ToggleTask,
}

/// Applies `msg` to `model` and returns the updated `Model` and resulting `Effect`s.
pub fn update(model: Model, msg: Msg) -> #(Model, List(Effect(Msg))) {
  case msg {
    AddTask -> {
      let trimmed = string.trim(model.draft_title)
      case trimmed {
        "" -> #(model, [])
        non_empty -> {
          let new_id = "task-" <> int.to_string(model.next_id)
          let new_item =
            TaskItem(
              id: new_id,
              title: non_empty,
              completed: False,
              created_at: 1_700_000_000 + model.next_id,
              priority: model.settings.default_priority,
            )
          let next_tasks = list.append(model.tasks, [new_item])
          let next_model =
            Model(
              ..model,
              tasks: next_tasks,
              draft_title: "",
              next_id: model.next_id + 1,
            )
          #(next_model, tasks_publish_effects(next_model))
        }
      }
    }

    ToggleTask(target_id) -> {
      let next_tasks =
        list.map(model.tasks, fn(item: TaskItem) {
          case item.id == target_id {
            True -> TaskItem(..item, completed: !item.completed)
            False -> item
          }
        })
      let next_model = Model(..model, tasks: next_tasks)
      #(next_model, tasks_publish_effects(next_model))
    }

    DeleteTask(target_id) -> {
      let next_tasks =
        list.filter(model.tasks, fn(item) { item.id != target_id })
      let next_model = Model(..model, tasks: next_tasks)
      #(next_model, tasks_publish_effects(next_model))
    }

    ClearCompleted -> {
      let next_tasks = list.filter(model.tasks, fn(item) { !item.completed })
      let next_model = Model(..model, tasks: next_tasks)
      #(next_model, tasks_publish_effects(next_model))
    }

    SetDraftTitle(text) -> #(Model(..model, draft_title: text), [])

    SetFilter(tab) -> #(Model(..model, filter: tab), [])

    SetViewMode(mode) -> #(Model(..model, view_mode: mode), [])

    ToggleSyncNostr -> {
      let settings = model.settings
      let next_settings =
        ChecklistSettings(..settings, sync_nostr: !settings.sync_nostr)
      #(Model(..model, settings: next_settings), [])
    }

    ToggleShowCompleted -> {
      let settings = model.settings
      let next_settings =
        ChecklistSettings(..settings, show_completed: !settings.show_completed)
      #(Model(..model, settings: next_settings), [])
    }

    SetDefaultPriority(prio) -> {
      let normalized = case string.lowercase(string.trim(prio)) {
        "low" -> "low"
        "high" -> "high"
        _ -> "medium"
      }
      let settings = model.settings
      let next_settings =
        ChecklistSettings(..settings, default_priority: normalized)
      #(Model(..model, settings: next_settings), [])
    }

    LoadTasks(loaded) -> {
      let next_seq = model.next_sequence(loaded)
      #(
        Model(..model, tasks: loaded, next_id: int.max(model.next_id, next_seq)),
        [],
      )
    }

    IngestRemoteDoc(raw) ->
      case model.settings.sync_nostr {
        False -> #(model, [])
        True ->
          case json.parse(from: raw, using: tasks_decoder()) {
            Ok(tasks) -> {
              let next_seq = model.next_sequence(tasks)
              #(
                Model(
                  ..model,
                  tasks: tasks,
                  next_id: int.max(model.next_id, next_seq),
                ),
                [],
              )
            }
            Error(_) -> #(model, [])
          }
      }
  }
}

fn tasks_publish_effects(model: Model) -> List(Effect(Msg)) {
  case model.settings.sync_nostr {
    False -> []
    True -> {
      let draft =
        UnsignedEvent(
          pubkey: None,
          created_at: clock.system().now_ms() / 1000,
          kind: kind.AppData,
          tags: [["d", checklist_d_tag]],
          content: encode_tasks(model.tasks) |> json.to_string,
        )
      [Publish(draft)]
    }
  }
}

/// Maps a declarative Schema `Action` to a typed `Msg`.
pub fn action_to_msg(act: Action) -> Option(Msg) {
  case act.name {
    "add-task" | "add_task" | "create_task" | "submit-task" | "submit_task" ->
      Some(AddTask)

    "set-draft-title" | "set_draft_title" | "input-task" ->
      case extract_title_payload(act) {
        Some(val) -> Some(SetDraftTitle(val))
        None -> Some(SetDraftTitle(""))
      }

    "toggle-task" | "toggle_task" ->
      case extract_id_payload(act) {
        Some(id) -> Some(ToggleTask(id))
        None -> None
      }

    "delete-task" | "delete_task" ->
      case extract_id_payload(act) {
        Some(id) -> Some(DeleteTask(id))
        None -> None
      }

    "clear-completed" | "clear_completed" -> Some(ClearCompleted)

    "set-filter" | "set_filter" ->
      case extract_tab_payload(act) {
        Some(tab_str) -> Some(SetFilter(model.filter_from_string(tab_str)))
        None -> None
      }

    "set-view" | "set_view" ->
      case schema.payload_string(act, "view") {
        Some(v) -> Some(SetViewMode(model.view_mode_from_string(v)))
        None -> None
      }

    "toggle-sync-nostr" | "toggle_sync_nostr" -> Some(ToggleSyncNostr)

    "toggle-show-completed" | "toggle_show_completed" ->
      Some(ToggleShowCompleted)

    "set-default-priority" | "set_default_priority" ->
      case extract_priority_payload(act) {
        Some(p) -> Some(SetDefaultPriority(p))
        None -> None
      }

    _ -> None
  }
}

fn extract_id_payload(act: Action) -> Option(String) {
  case schema.payload_string(act, "id") {
    Some(id) if id != "" -> Some(id)
    _ ->
      case schema.payload_int(act, "id") {
        Some(n) -> Some("task-" <> int.to_string(n))
        None -> None
      }
  }
}

fn extract_title_payload(act: Action) -> Option(String) {
  case schema.payload_string(act, "title") {
    Some(s) -> Some(s)
    None ->
      case schema.payload_string(act, "text") {
        Some(s) -> Some(s)
        None ->
          case schema.payload_string(act, "taskText") {
            Some(s) -> Some(s)
            None -> schema.payload_string(act, "value")
          }
      }
  }
}

fn extract_tab_payload(act: Action) -> Option(String) {
  case schema.payload_string(act, "tab") {
    Some(s) -> Some(s)
    None ->
      case schema.payload_string(act, "filter") {
        Some(s) -> Some(s)
        None -> schema.payload_string(act, "value")
      }
  }
}

fn extract_priority_payload(act: Action) -> Option(String) {
  case schema.payload_string(act, "priority") {
    Some(s) -> Some(s)
    None -> schema.payload_string(act, "value")
  }
}
