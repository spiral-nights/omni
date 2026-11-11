//// An opaque mutable reference cell `Ref(a)`.
////
//// Intended strictly for cases where isolated, controlled mutable state
//// is necessary (e.g. effect runners, state machine loops, in-memory fake stores).

/// An opaque mutable container holding a value of type `a`.
pub type Ref(a)

@external(javascript, "./ref.ffi.mjs", "new_ref")
pub fn new(initial: a) -> Ref(a)

@external(javascript, "./ref.ffi.mjs", "get")
pub fn get(ref: Ref(a)) -> a

@external(javascript, "./ref.ffi.mjs", "set")
pub fn set(ref: Ref(a), value: a) -> Nil

/// Updates the value inside the `Ref` by applying `f` to the current value.
pub fn update(ref: Ref(a), f: fn(a) -> a) -> Nil {
  set(ref, f(get(ref)))
}

/// Updates the value inside the `Ref` by applying `f`, and returns the new value.
pub fn modify(ref: Ref(a), f: fn(a) -> a) -> a {
  let next = f(get(ref))
  set(ref, next)
  next
}

/// Replaces the value in the `Ref` and returns the previous value.
pub fn get_and_set(ref: Ref(a), value: a) -> a {
  let prev = get(ref)
  set(ref, value)
  prev
}
