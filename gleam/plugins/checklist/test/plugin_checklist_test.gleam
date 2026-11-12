import gleam/dict
import gleam/dynamic
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import gleeunit/should
import omni/nostr/kind as omni_kind
import omni/nostr/pubkey
import omni/platform/ref
import omni/platform/storage
import omni/plugin_kit/app
import omni/plugin_kit/local_store
import omni/plugin_kit/nostr
import omni/plugin_kit/route
import omni/plugin_kit/schema
import omni/protocol/schema/action
import omni/protocol/schema/node.{Card, Metric, MetricString}
import plugin/checklist/main as checklist_main
import plugin/checklist/model.{
  FilterActive, FilterAll, FilterCompleted, Model, TaskItem, ViewCompact,
  ViewMain, ViewSettings, ViewWidget,
}
import plugin/checklist/msg.{
  AddTask, ClearCompleted, DeleteTask, IngestRemoteDoc, LoadTasks,
  SetDefaultPriority, SetDraftTitle, SetFilter, SetViewMode, ToggleShowCompleted,
  ToggleSyncNostr, ToggleTask,
}
import plugin/checklist/update
import plugin/checklist/view

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn model_init_and_metrics_test() {
  let m = model.init(route.parse_search(""))
  m.view_mode |> should.equal(ViewMain)
  m.filter |> should.equal(FilterAll)
  list.length(m.tasks) |> should.equal(3)
  model.completed_count(m) |> should.equal(1)
  model.active_count(m) |> should.equal(2)
  model.completion_percentage(m) |> should.equal(33)
}

pub fn update_task_creation_toggle_delete_and_clear_test() {
  let m0 = model.init(route.main())

  // Empty draft title is ignored
  let #(m_empty, _) = update.update(m0, AddTask)
  list.length(m_empty.tasks) |> should.equal(3)

  // Set draft title and add task
  let #(m1, _) = update.update(m0, SetDraftTitle("  Write Gleam tests  "))
  let #(m2, _) = update.update(m1, AddTask)
  m2.draft_title |> should.equal("")
  list.length(m2.tasks) |> should.equal(4)
  let assert Ok(added) = list.last(m2.tasks)
  added.title |> should.equal("Write Gleam tests")
  added.completed |> should.be_false()
  added.id |> should.equal("task-4")

  // Toggle task-4 to completed
  let #(m3, _) = update.update(m2, ToggleTask("task-4"))
  model.completed_count(m3) |> should.equal(2)
  model.completion_percentage(m3) |> should.equal(50)

  // Delete task-2
  let #(m4, _) = update.update(m3, DeleteTask("task-2"))
  list.length(m4.tasks) |> should.equal(3)

  // Clear completed removes task-1 and task-4, leaving only task-3
  let #(m5, _) = update.update(m4, ClearCompleted)
  list.length(m5.tasks) |> should.equal(1)
  model.completed_count(m5) |> should.equal(0)
  model.active_count(m5) |> should.equal(1)
}

pub fn filtering_and_settings_test() {
  let m0 = model.init(route.main())

  // FilterAll returns all 3
  list.length(model.filtered_tasks(m0)) |> should.equal(3)

  // FilterActive returns 2
  let #(m_active, _) = update.update(m0, SetFilter(FilterActive))
  list.length(model.filtered_tasks(m_active)) |> should.equal(2)

  // FilterCompleted returns 1
  let #(m_completed, _) = update.update(m0, SetFilter(FilterCompleted))
  list.length(model.filtered_tasks(m_completed)) |> should.equal(1)

  // ToggleShowCompleted hides completed tasks in FilterAll
  let #(m_hide_done, _) = update.update(m0, ToggleShowCompleted)
  m_hide_done.settings.show_completed |> should.be_false()
  list.length(model.filtered_tasks(m_hide_done)) |> should.equal(2)

  // ToggleSyncNostr flips sync_nostr
  let #(m_sync, _) = update.update(m0, ToggleSyncNostr)
  m_sync.settings.sync_nostr |> should.be_false()

  // SetDefaultPriority updates priority for new tasks
  let #(m_prio, _) = update.update(m0, SetDefaultPriority("high"))
  m_prio.settings.default_priority |> should.equal("high")

  // LoadTasks replaces tasks list
  let custom = [
    TaskItem(
      id: "t-99",
      title: "Custom loaded task",
      completed: True,
      created_at: 100,
      priority: "low",
    ),
  ]
  let #(m_loaded, _) = update.update(m0, LoadTasks(custom))
  m_loaded.tasks |> should.equal(custom)
  model.completion_percentage(m_loaded) |> should.equal(100)
}

pub fn all_four_view_modes_render_schema_test() {
  // 1. ViewMain
  let m_main = model.init(route.parse_search(""))
  let node_main = view.view(m_main)
  let wire_main = schema.encode_schema_message(node_main)
  string.contains(wire_main, "Task List") |> should.be_true()
  string.contains(wire_main, "Clear Completed") |> should.be_true()
  string.contains(wire_main, "33% completed") |> should.be_true()

  // 2. ViewCompact (?view=compact)
  let m_compact = model.init(route.parse_search("?view=compact"))
  m_compact.view_mode |> should.equal(ViewCompact)
  let node_compact = view.view(m_compact)
  case node_compact {
    Metric(label: lbl, value: MetricString(val), subtext: Some(sub), ..) -> {
      lbl |> should.equal("Tasks Done")
      val |> should.equal("33%")
      sub |> should.equal("Next: Review Omni PR")
    }
    _ -> should.fail()
  }

  // 3. ViewWidget (?view=widget)
  let m_widget = model.init(route.parse_search("?view=widget"))
  m_widget.view_mode |> should.equal(ViewWidget)
  let node_widget = view.view(m_widget)
  case node_widget {
    Card(title: Some("Task List"), icon: Some("check"), ..) -> Nil
    _ -> should.fail()
  }

  // 4. ViewSettings (?view=settings)
  let m_settings = model.init(route.parse_search("?view=settings"))
  m_settings.view_mode |> should.equal(ViewSettings)
  let wire_settings = schema.encode_schema_message(view.view(m_settings))
  string.contains(wire_settings, "Task List Settings") |> should.be_true()
  string.contains(wire_settings, "Clear Completed Tasks") |> should.be_true()
  string.contains(wire_settings, "syncNostr") |> should.be_true()
}

pub fn local_store_and_nostr_doc_spec_persistence_test() {
  let mem = storage.in_memory()
  let tasks_cfg = model.tasks_store_config()

  // Default load returns starter tasks
  let initial = local_store.load(mem, tasks_cfg)
  list.length(initial) |> should.equal(3)

  // Save custom task list and reload
  let custom = [
    TaskItem(
      id: "task-10",
      title: "Saved in local store",
      completed: False,
      created_at: 1_700_000_500,
      priority: "high",
    ),
  ]
  local_store.save(mem, tasks_cfg, custom) |> should.equal(Ok(Nil))
  local_store.load(mem, tasks_cfg) |> should.equal(custom)

  // Verify nostr.DocSpec d_tag is "omni/checklist/v1"
  let spec = model.checklist_doc_spec()
  spec.d_tag |> should.equal("omni/checklist/v1")

  let assert Ok(pk) =
    pubkey.parse(
      "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    )
  let client = nostr.mock_client(pk, [])
  let doc = nostr.open_doc(client, spec)
  list.length(doc.read()) |> should.equal(3)
}

pub fn start_app_action_round_trip_test() {
  let emitted = ref.new([])
  let running =
    checklist_main.start_app("?view=main", fn(n) {
      ref.update(emitted, fn(prev) { list.append(prev, [n]) })
    })

  // Set draft title via action JSON
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"set-draft-title\",\"payload\":{\"value\":\"Ship Phase 7.3\"}}",
    )
  app.current_model(running).draft_title |> should.equal("Ship Phase 7.3")

  // Add task via action JSON
  let assert Ok(True) =
    app.handle_action_json(
      running,
      "{\"type\":\"omni:action\",\"action\":\"add-task\"}",
    )
  list.length(app.current_model(running).tasks) |> should.equal(4)

  // Toggle task-1 via action with payload
  let toggle_act =
    action.new("toggle-task")
    |> action.with_payload(dict.from_list([#("id", dynamic.string("task-1"))]))
  app.handle_action(running, toggle_act) |> should.be_true()
  model.completed_count(app.current_model(running)) |> should.equal(0)

  // Navigate to ?view=compact
  app.navigate(running, route.parse_search("?view=compact"))
  app.current_model(running).view_mode |> should.equal(ViewCompact)

  let latest_wire = schema.encode_schema_message(app.current_view(running))
  string.contains(latest_wire, "0%") |> should.be_true()
  { list.length(ref.get(emitted)) >= 4 } |> should.be_true()
}

pub fn sync_publishes_and_ingests_nip78_document_test() {
  let m1 = model.init(route.main())
  m1.settings.sync_nostr |> should.equal(True)

  let #(_m2, effects) = update.update(m1, ToggleTask("task-1"))
  let assert [app.Publish(draft)] = effects
  draft.kind |> should.equal(omni_kind.AppData)
  draft.tags |> should.equal([["d", "omni/checklist/v1"]])
  string.contains(draft.content, "task-1") |> should.be_true()

  let remote =
    "[{\"id\":\"remote-1\",\"title\":\"Synced task\",\"completed\":true,\"created_at\":1700000100,\"priority\":\"high\"}]"
  let #(m3, _) = update.update(m1, IngestRemoteDoc(remote))
  list.length(m3.tasks) |> should.equal(1)
  let assert [task] = m3.tasks
  task.title |> should.equal("Synced task")
  task.completed |> should.be_true()
  m3.next_id |> should.equal(4)
}
