import gleam/list
import gleam/option.{None, Some}
import omni/platform/storage
import omni/testkit/fake_ports

pub fn in_memory_storage_empty_test() {
  let store = fake_ports.in_memory_storage()

  assert storage.get(store, "nonexistent") == None
  assert storage.keys(store) == []
  assert storage.length(store) == 0
  assert !storage.has_key(store, "nonexistent")

  let assert Ok(Nil) = storage.set(store, "foo", "bar")
  assert storage.get(store, "foo") == Some("bar")
  assert storage.has_key(store, "foo")
  assert storage.length(store) == 1
  assert storage.keys(store) == ["foo"]

  storage.remove(store, "foo")
  assert storage.get(store, "foo") == None
  assert storage.length(store) == 0

  let assert Ok(Nil) = storage.set(store, "a", "1")
  let assert Ok(Nil) = storage.set(store, "b", "2")
  assert storage.length(store) == 2
  storage.clear(store)
  assert storage.length(store) == 0
}

pub fn in_memory_storage_from_test() {
  let initial = [#("alpha", "100"), #("beta", "200")]
  let store = fake_ports.in_memory_storage_from(initial)

  assert storage.get(store, "alpha") == Some("100")
  assert storage.get(store, "beta") == Some("200")
  assert storage.length(store) == 2

  let keys = storage.keys(store)
  assert list.contains(keys, "alpha")
  assert list.contains(keys, "beta")
}

pub fn fixed_clock_test() {
  let c = fake_ports.fixed_clock(123_456_789)
  assert c.now_ms() == 123_456_789
  assert c.now_ms() == 123_456_789
}

pub fn steppable_clock_test() {
  let #(c, step) = fake_ports.steppable(1000)
  assert c.now_ms() == 1000

  step(500)
  assert c.now_ms() == 1500

  step(250)
  assert c.now_ms() == 1750

  step(-750)
  assert c.now_ms() == 1000

  // Alias steppable_clock behaves identically
  let #(c2, step2) = fake_ports.steppable_clock(5000)
  assert c2.now_ms() == 5000
  step2(1000)
  assert c2.now_ms() == 6000
}
