//// Factory functions for fake platform dependencies used in tests.

import omni/platform/clock.{type Clock, Clock}
import omni/platform/ref
import omni/platform/storage.{type Storage}

/// Construct a fake in-memory `Storage` port backed by an isolated mutable dictionary.
pub fn in_memory_storage() -> Storage {
  storage.in_memory()
}

/// Construct a fake in-memory `Storage` port pre-populated with initial key-value entries.
pub fn in_memory_storage_from(initial: List(#(String, String))) -> Storage {
  storage.in_memory_from(initial)
}

/// Construct a fixed `Clock` that always returns the same millisecond timestamp.
pub fn fixed_clock(ms: Int) -> Clock {
  clock.fixed(ms)
}

/// Construct a steppable `Clock` starting at `initial_ms`.
///
/// Returns a tuple of:
/// 1. The `Clock` port.
/// 2. A function taking `delta_ms: Int` that advances the clock forward by `delta_ms` milliseconds.
pub fn steppable(initial_ms: Int) -> #(Clock, fn(Int) -> Nil) {
  let cell = ref.new(initial_ms)
  let c = Clock(now_ms: fn() { ref.get(cell) })
  let step = fn(delta_ms: Int) {
    ref.update(cell, fn(current) { current + delta_ms })
  }
  #(c, step)
}

/// Alias for `steppable` clock constructor.
pub fn steppable_clock(initial_ms: Int) -> #(Clock, fn(Int) -> Nil) {
  steppable(initial_ms)
}
