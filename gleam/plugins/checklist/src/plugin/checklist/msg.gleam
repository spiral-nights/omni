//// Messages handled by the Checklist plugin update loop.

import plugin/checklist/model.{type FilterTab, type TaskItem, type ViewMode}

/// Exhaustive message type for the Checklist plugin.
pub type Msg {
  AddTask
  ToggleTask(id: String)
  DeleteTask(id: String)
  ClearCompleted
  SetDraftTitle(String)
  SetFilter(FilterTab)
  SetViewMode(ViewMode)
  ToggleSyncNostr
  ToggleShowCompleted
  SetDefaultPriority(String)
  LoadTasks(List(TaskItem))
}
