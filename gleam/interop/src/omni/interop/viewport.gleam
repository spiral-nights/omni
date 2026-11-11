//// JS-facing facade over `omni/protocol/viewport`.
////
//// Facades accept and return plain JS values (strings, booleans) so that
//// TypeScript callers never touch Gleam custom types or `Result`.

import omni/protocol/viewport

/// True when `name` is a known viewport id.
pub fn is_valid(name: String) -> Bool {
  case viewport.parse(name) {
    Ok(_) -> True
    Error(_) -> False
  }
}
