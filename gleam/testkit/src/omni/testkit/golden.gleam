//// File-based golden snapshot comparison helper.
////
//// Reads and writes snapshot files in `test/golden/` (or a custom directory)
//// using Node `fs`. When `UPDATE_GOLDEN=1` (or `UPDATE_SNAPSHOTS=1`) is set,
//// snapshots are automatically written or updated.

import gleam/string

/// Error categories during golden snapshot verification.
pub type GoldenError {
  MissingGolden(path: String)
  ReadError(path: String, message: String)
  WriteError(path: String, message: String)
  Mismatch(path: String, expected: String, actual: String)
}

@external(javascript, "./golden.ffi.mjs", "read_file")
fn ffi_read_file(
  path: String,
  on_ok: fn(String) -> Result(String, GoldenError),
  on_err: fn(String) -> Result(String, GoldenError),
) -> Result(String, GoldenError)

@external(javascript, "./golden.ffi.mjs", "write_file")
fn ffi_write_file(
  path: String,
  content: String,
  on_ok: fn(Nil) -> Result(Nil, GoldenError),
  on_err: fn(String) -> Result(Nil, GoldenError),
) -> Result(Nil, GoldenError)

@external(javascript, "./golden.ffi.mjs", "file_exists")
pub fn file_exists(path: String) -> Bool

@external(javascript, "./golden.ffi.mjs", "is_update_mode")
pub fn is_update_mode() -> Bool

@external(javascript, "./golden.ffi.mjs", "resolve_path")
fn ffi_resolve_path(dir: String, filename: String) -> String

/// Resolve the absolute path of a golden file within the default directory (`test/golden`).
pub fn golden_path(filename: String) -> String {
  ffi_resolve_path("test/golden", filename)
}

/// Resolve the absolute path of a golden file within the specified directory.
pub fn golden_path_in(dir: String, filename: String) -> String {
  ffi_resolve_path(dir, filename)
}

/// Read a file directly from any file path.
pub fn read_fixture(filepath: String) -> Result(String, GoldenError) {
  ffi_read_file(filepath, fn(c) { Ok(c) }, fn(msg) {
    Error(ReadError(filepath, msg))
  })
}

/// Read a golden snapshot file from `test/golden/<filename>`.
pub fn read(filename: String) -> Result(String, GoldenError) {
  read_from("test/golden", filename)
}

/// Read a golden snapshot file from `<dir>/<filename>`.
pub fn read_from(dir: String, filename: String) -> Result(String, GoldenError) {
  let path = golden_path_in(dir, filename)
  case file_exists(path) {
    True ->
      ffi_read_file(path, fn(c) { Ok(c) }, fn(msg) {
        Error(ReadError(path, msg))
      })
    False -> Error(MissingGolden(path))
  }
}

/// Write content to a golden snapshot file in `test/golden/<filename>`.
pub fn write(filename: String, content: String) -> Result(Nil, GoldenError) {
  write_to("test/golden", filename, content)
}

/// Write content to a golden snapshot file in `<dir>/<filename>`.
pub fn write_to(
  dir: String,
  filename: String,
  content: String,
) -> Result(Nil, GoldenError) {
  let path = golden_path_in(dir, filename)
  ffi_write_file(path, content, fn(_) { Ok(Nil) }, fn(msg) {
    Error(WriteError(path, msg))
  })
}

fn normalize(s: String) -> String {
  string.replace(s, "\r\n", "\n")
}

/// Compare `actual` string against the golden snapshot file `test/golden/<filename>`.
///
/// If `is_update_mode()` is true (e.g. `UPDATE_GOLDEN=1`), the snapshot is updated
/// on disk and `Ok(Nil)` is returned.
pub fn check(filename: String, actual: String) -> Result(Nil, GoldenError) {
  check_in("test/golden", filename, actual)
}

/// Compare `actual` string against the golden snapshot file `<dir>/<filename>`.
pub fn check_in(
  dir: String,
  filename: String,
  actual: String,
) -> Result(Nil, GoldenError) {
  let path = golden_path_in(dir, filename)
  case is_update_mode() {
    True -> write_to(dir, filename, actual)
    False ->
      case file_exists(path) {
        False -> Error(MissingGolden(path))
        True ->
          case read_from(dir, filename) {
            Error(err) -> Error(err)
            Ok(expected) ->
              case normalize(expected) == normalize(actual) {
                True -> Ok(Nil)
                False -> Error(Mismatch(path, expected, actual))
              }
          }
      }
  }
}

/// Assert that `actual` matches the golden snapshot `test/golden/<filename>`.
///
/// If they do not match, panics with a descriptive error message.
pub fn assert_match(filename: String, actual: String) -> Nil {
  assert_match_in("test/golden", filename, actual)
}

/// Alias for `assert_match`.
pub fn assert_matches(filename: String, actual: String) -> Nil {
  assert_match_in("test/golden", filename, actual)
}

/// Assert that `actual` matches the golden snapshot `<dir>/<filename>`.
pub fn assert_match_in(dir: String, filename: String, actual: String) -> Nil {
  case check_in(dir, filename, actual) {
    Ok(Nil) -> Nil
    Error(MissingGolden(path)) ->
      panic as string.concat([
          "Golden snapshot file not found: ",
          path,
          "\nRun with UPDATE_GOLDEN=1 to create it.",
        ])
    Error(ReadError(path, msg)) ->
      panic as string.concat([
          "Failed to read golden snapshot ",
          path,
          ": ",
          msg,
        ])
    Error(WriteError(path, msg)) ->
      panic as string.concat([
          "Failed to write golden snapshot ",
          path,
          ": ",
          msg,
        ])
    Error(Mismatch(path, expected, act)) ->
      panic as string.concat([
          "Golden snapshot mismatch in ",
          path,
          ":\n--- Expected ---\n",
          expected,
          "\n--- Actual ---\n",
          act,
          "\nRun with UPDATE_GOLDEN=1 to accept changes.",
        ])
  }
}
