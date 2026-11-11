//// Injectable wall-clock port. Production code reads time through `Clock`
//// so tests can supply a fixed or scripted clock.

/// A source of the current time.
pub type Clock {
  Clock(now_ms: fn() -> Int)
}

/// The real system clock.
pub fn system() -> Clock {
  Clock(now_ms: now_ms)
}

/// A clock that always returns `ms`. Intended for tests.
pub fn fixed(ms: Int) -> Clock {
  Clock(now_ms: fn() { ms })
}

/// Milliseconds since the Unix epoch, from `Date.now()`.
@external(javascript, "./clock.ffi.mjs", "now_ms")
fn now_ms() -> Int
