//// Local file selection port (FFI-quarantined).

import gleam/javascript/promise.{type Promise}
import gleam/string

/// File input `accept` filter for nsite bundle archives.
pub fn zip_accept() -> String {
  ".zip,application/zip"
}

/// Whether `name` refers to a `.zip` archive, ignoring case and surrounding space.
pub fn is_zip_file_name(name: String) -> Bool {
  name
  |> string.trim
  |> string.lowercase
  |> string.ends_with(".zip")
}

/// Open the browser file picker constrained to `accept` and resolve with the
/// selected file's Base64 payload, or an error when cancelled or unreadable.
@external(javascript, "./file_picker.ffi.mjs", "pick_base64")
pub fn pick_base64(accept: String) -> Promise(Result(String, String))

/// Open the browser file picker constrained to zip archives.
pub fn pick_zip_base64() -> Promise(Result(String, String)) {
  pick_base64(zip_accept())
}
