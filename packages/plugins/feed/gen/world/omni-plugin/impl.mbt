///|
/// Invoked when the plugin is mounted.
/// Returns the initial UI view (JSON string), or an empty string if using `ui.render()`.
pub fn init_() -> String {
  @plugin.start()
  ""
}

///|
/// Invoked when the user interacts with a UI primitive (button click, toggle, form submit).
/// `action` is the action name string (e.g., "increment", "add-task").
/// `payload` is the JSON-serialized action payload including ambient form values.
/// Returns an optional updated UI view (JSON string), or an empty string if no re-render.
pub fn handle_action(action : String, payload : String) -> String {
  @plugin.handle_action_impl(action, payload)
  ""
}
