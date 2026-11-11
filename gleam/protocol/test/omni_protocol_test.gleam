import gleeunit
import omni/platform/clock
import omni/protocol/viewport.{Dock, HeaderActions, Main, Sidebar}

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn viewport_round_trip_test() {
  [Main, Dock, Sidebar, HeaderActions]
  |> list_each(fn(v) { assert viewport.parse(viewport.to_string(v)) == Ok(v) })
}

pub fn viewport_rejects_unknown_test() {
  assert viewport.parse("full-page") == Error(Nil)
}

/// Proves path dependencies and the shared `omni/` module namespace resolve
/// across packages (checklist 0.2 / 0.4).
pub fn path_dependency_resolves_test() {
  assert clock.fixed(7).now_ms() == 7
}

fn list_each(items: List(a), f: fn(a) -> Nil) -> Nil {
  case items {
    [] -> Nil
    [first, ..rest] -> {
      f(first)
      list_each(rest, f)
    }
  }
}
