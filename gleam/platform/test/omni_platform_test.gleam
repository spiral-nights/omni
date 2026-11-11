import gleeunit
import omni/platform/clock

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn fixed_clock_test() {
  let c = clock.fixed(42)
  assert c.now_ms() == 42
}

pub fn system_clock_is_after_2020_test() {
  // 2020-01-01T00:00:00Z in ms
  assert clock.system().now_ms() > 1_577_836_800_000
}
