//// Injectable web storage port.
////
//// Provides a typed `Storage` port abstraction backed either by
//// `window.localStorage` in production or an in-memory mutable `Ref` fake in tests.

import gleam/dict
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/list
import gleam/option.{type Option, None, Some}
import omni/platform/ref

/// Storage error categories.
pub type StorageError {
  StorageUnavailable(String)
  QuotaExceeded
  StorageOperationError(String)
}

/// A storage port exposing key-value store operations.
pub type Storage {
  Storage(
    get: fn(String) -> Option(String),
    set: fn(String, String) -> Result(Nil, StorageError),
    remove: fn(String) -> Nil,
    clear: fn() -> Nil,
    keys: fn() -> List(String),
  )
}

/// Retrieves the item with `key`, or `None` if not present.
pub fn get(storage: Storage, key: String) -> Option(String) {
  storage.get(key)
}

/// Stores `value` under `key`.
pub fn set(
  storage: Storage,
  key: String,
  value: String,
) -> Result(Nil, StorageError) {
  storage.set(key, value)
}

/// Removes the item with `key`.
pub fn remove(storage: Storage, key: String) -> Nil {
  storage.remove(key)
}

/// Clears all items in the store.
pub fn clear(storage: Storage) -> Nil {
  storage.clear()
}

/// Returns a list of all keys in the store.
pub fn keys(storage: Storage) -> List(String) {
  storage.keys()
}

/// Returns the number of items stored.
pub fn length(storage: Storage) -> Int {
  list.length(storage.keys())
}

/// Checks whether an item with `key` exists.
pub fn has_key(storage: Storage, key: String) -> Bool {
  option.is_some(storage.get(key))
}

/// Creates an in-memory storage port backed by an isolated `Ref(Dict)`.
/// Perfect for unit tests and sandboxed environments.
pub fn in_memory() -> Storage {
  in_memory_from([])
}

/// Creates an in-memory storage port pre-populated with initial entries.
pub fn in_memory_from(initial: List(#(String, String))) -> Storage {
  let cell = ref.new(dict.from_list(initial))
  Storage(
    get: fn(key) {
      dict.get(ref.get(cell), key)
      |> option.from_result
    },
    set: fn(key, value) {
      ref.update(cell, fn(d) { dict.insert(d, key, value) })
      Ok(Nil)
    },
    remove: fn(key) {
      ref.update(cell, fn(d) { dict.delete(d, key) })
      Nil
    },
    clear: fn() {
      ref.set(cell, dict.new())
      Nil
    },
    keys: fn() { dict.keys(ref.get(cell)) },
  )
}

@external(javascript, "./storage.ffi.mjs", "is_available")
pub fn is_available() -> Bool

@external(javascript, "./storage.ffi.mjs", "get_item")
fn ffi_get_item(key: String) -> Dynamic

@external(javascript, "./storage.ffi.mjs", "set_item")
fn ffi_set_item(key: String, value: String) -> Dynamic

@external(javascript, "./storage.ffi.mjs", "remove_item")
fn ffi_remove_item(key: String) -> Nil

@external(javascript, "./storage.ffi.mjs", "clear_items")
fn ffi_clear_items() -> Nil

@external(javascript, "./storage.ffi.mjs", "get_keys")
fn ffi_get_keys() -> Dynamic

fn raw_get(key: String) -> Option(String) {
  let dyn = ffi_get_item(key)
  case decode.run(dyn, decode.optional(decode.string)) {
    Ok(opt) -> opt
    Error(_) -> None
  }
}

fn raw_set(key: String, value: String) -> Result(Nil, StorageError) {
  let dyn = ffi_set_item(key, value)
  case decode.run(dyn, decode.optional(decode.string)) {
    Ok(None) -> Ok(Nil)
    Ok(Some("quota_exceeded")) -> Error(QuotaExceeded)
    Ok(Some("unavailable")) ->
      Error(StorageUnavailable("localStorage is unavailable"))
    Ok(Some(other)) -> Error(StorageOperationError(other))
    Error(_) -> Ok(Nil)
  }
}

fn raw_keys() -> List(String) {
  let dyn = ffi_get_keys()
  case decode.run(dyn, decode.list(decode.string)) {
    Ok(k) -> k
    Error(_) -> []
  }
}

/// Constructs a `Storage` instance backed by the browser `localStorage`.
/// Returns `Error(StorageUnavailable)` if `localStorage` cannot be accessed.
pub fn local() -> Result(Storage, StorageError) {
  case is_available() {
    True ->
      Ok(Storage(
        get: raw_get,
        set: raw_set,
        remove: ffi_remove_item,
        clear: ffi_clear_items,
        keys: raw_keys,
      ))
    False ->
      Error(StorageUnavailable(
        "localStorage is not available in the current environment",
      ))
  }
}

/// Returns a `localStorage` port if available, falling back to `in_memory()` if not.
pub fn local_or_in_memory() -> Storage {
  case local() {
    Ok(s) -> s
    Error(_) -> in_memory()
  }
}

@external(javascript, "./storage.ffi.mjs", "set_custom_backend")
pub fn set_custom_backend_for_test(backend: Dynamic) -> Nil
