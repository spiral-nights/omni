import gleeunit
import omni/interop/viewport

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn viewport_is_valid_test() {
  assert viewport.is_valid("dock")
  assert !viewport.is_valid("full-page")
}
