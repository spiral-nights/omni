//// Form and input DOM inspection & helper ports (FFI-quarantined).

import gleam/dynamic.{type Dynamic}

/// Collects named form field values (input, textarea, select) from the container enclosing `target`.
@external(javascript, "./form.ffi.mjs", "collect_ambient_form_values")
pub fn collect_ambient_form_values(target: Dynamic) -> List(#(String, Dynamic))

/// Initiates FileReader reading of a file input change event.
@external(javascript, "./form.ffi.mjs", "handle_file_input_change")
pub fn handle_file_input_change(event: Dynamic) -> Dynamic

/// Initiates FileReader reading of a drag-drop event.
@external(javascript, "./form.ffi.mjs", "handle_file_drop")
pub fn handle_file_drop(event: Dynamic) -> Dynamic

/// Computes an SVG `<path>` `d` attribute string for a pie countdown wedge disk.
@external(javascript, "./form.ffi.mjs", "pie_wedge_path")
pub fn pie_wedge_path(ratio: Float, cx: Float, cy: Float, r: Float) -> String
