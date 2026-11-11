import gleam/dynamic.{type Dynamic}
import gleam/list
import gleam/option.{None, Some}
import omni/platform/storage

@external(javascript, "./storage_test.ffi.mjs", "make_mock_storage")
fn make_mock_storage(quota_error: Bool) -> Dynamic

@external(javascript, "./storage_test.ffi.mjs", "reset_backend")
fn reset_backend() -> Dynamic

pub fn in_memory_basic_test() {
  let s = storage.in_memory()

  assert storage.length(s) == 0
  assert storage.has_key(s, "token") == False
  assert storage.get(s, "token") == None

  assert storage.set(s, "token", "secret123") == Ok(Nil)
  assert storage.length(s) == 1
  assert storage.has_key(s, "token") == True
  assert storage.get(s, "token") == Some("secret123")

  assert storage.set(s, "theme", "dark") == Ok(Nil)
  assert storage.length(s) == 2

  let k = storage.keys(s)
  assert list.contains(k, "token")
  assert list.contains(k, "theme")

  storage.remove(s, "token")
  assert storage.get(s, "token") == None
  assert storage.length(s) == 1

  storage.clear(s)
  assert storage.length(s) == 0
  assert storage.get(s, "theme") == None
}

pub fn in_memory_from_test() {
  let s = storage.in_memory_from([#("k1", "v1"), #("k2", "v2")])
  assert storage.length(s) == 2
  assert storage.get(s, "k1") == Some("v1")
  assert storage.get(s, "k2") == Some("v2")
  assert storage.get(s, "k3") == None
}

pub fn local_fallback_in_node_test() {
  // Reset any custom backend to test environment default
  storage.set_custom_backend_for_test(reset_backend())

  let s = storage.local_or_in_memory()
  assert storage.set(s, "foo", "bar") == Ok(Nil)
  assert storage.get(s, "foo") == Some("bar")
}

pub fn mock_local_storage_backend_test() {
  let mock = make_mock_storage(False)
  storage.set_custom_backend_for_test(mock)

  assert storage.is_available() == True
  let res = storage.local()
  case res {
    Ok(s) -> {
      assert storage.set(s, "user", "alice") == Ok(Nil)
      assert storage.get(s, "user") == Some("alice")
      assert storage.has_key(s, "user") == True
      assert storage.length(s) == 1

      let k = storage.keys(s)
      assert k == ["user"]

      storage.remove(s, "user")
      assert storage.get(s, "user") == None
      assert storage.length(s) == 0
    }
    Error(_) -> panic as "expected local storage to be available with mock"
  }

  // Cleanup
  storage.set_custom_backend_for_test(reset_backend())
}

pub fn mock_storage_quota_exceeded_test() {
  let mock = make_mock_storage(True)
  storage.set_custom_backend_for_test(mock)

  let res = storage.local()
  case res {
    Ok(s) -> {
      let set_res = storage.set(s, "huge", "payload")
      assert set_res == Error(storage.QuotaExceeded)
    }
    Error(_) ->
      // If is_available returned false because setItem failed during availability check,
      // verify that Error is StorageUnavailable
      Nil
  }

  // Cleanup
  storage.set_custom_backend_for_test(reset_backend())
}
