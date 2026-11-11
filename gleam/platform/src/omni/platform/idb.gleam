//// Structured local storage port backed by IndexedDB and an in-memory test fake.
////
//// Provides a typed, Promise-based interface for object stores, secondary indices,
//// key-value lookups, range/index scans, and atomic transactions.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option, None, Some}

/// An opaque handle representing an open IndexedDB connection.
pub opaque type IdbDatabase {
  IdbDatabase(raw: Dynamic)
}

/// Secondary index definition for an object store.
pub type IndexDef {
  IndexDef(name: String, key_path: String, unique: Bool)
}

/// Object store definition with optional key path, auto-increment flag, and secondary indices.
pub type StoreDef {
  StoreDef(
    name: String,
    key_path: Option(String),
    auto_increment: Bool,
    indexes: List(IndexDef),
  )
}

/// Upgrade context passed to schema migration callbacks during `open`.
pub type IdbUpgrade {
  IdbUpgrade(
    old_version: Int,
    new_version: Int,
    create_store: fn(StoreDef) -> Result(Nil, String),
    delete_store: fn(String) -> Result(Nil, String),
  )
}

@external(javascript, "./idb.ffi.mjs", "open_db")
fn ffi_open_db(
  name: String,
  version: Int,
  on_upgrade: fn(IdbUpgrade) -> Nil,
  make_upgrade: fn(
    Int,
    Int,
    fn(StoreDef) -> Result(Nil, String),
    fn(String) -> Result(Nil, String),
  ) -> IdbUpgrade,
) -> Promise(Result(Dynamic, String))

@external(javascript, "./idb.ffi.mjs", "open_in_memory")
fn ffi_open_in_memory(
  on_upgrade: fn(IdbUpgrade) -> Nil,
  make_upgrade: fn(
    Int,
    Int,
    fn(StoreDef) -> Result(Nil, String),
    fn(String) -> Result(Nil, String),
  ) -> IdbUpgrade,
) -> Promise(Result(Dynamic, String))

/// Opens an IndexedDB database with schema version and migration callback.
pub fn open(
  name: String,
  version: Int,
  on_upgrade: fn(IdbUpgrade) -> Nil,
) -> Promise(Result(IdbDatabase, String)) {
  use res <- promise.map(
    ffi_open_db(name, version, on_upgrade, fn(old_v, new_v, create_s, del_s) {
      IdbUpgrade(old_v, new_v, create_s, del_s)
    }),
  )
  case res {
    Ok(raw) -> Ok(IdbDatabase(raw))
    Error(err) -> Error(err)
  }
}

/// Creates an in-memory mock database that conforms to the full `IdbDatabase` interface.
pub fn in_memory(
  on_upgrade: fn(IdbUpgrade) -> Nil,
) -> Promise(Result(IdbDatabase, String)) {
  use res <- promise.map(
    ffi_open_in_memory(on_upgrade, fn(old_v, new_v, create_s, del_s) {
      IdbUpgrade(old_v, new_v, create_s, del_s)
    }),
  )
  case res {
    Ok(raw) -> Ok(IdbDatabase(raw))
    Error(err) -> Error(err)
  }
}

/// Creates an in-memory mock database without requiring explicit schema migration.
pub fn in_memory_simple() -> Promise(Result(IdbDatabase, String)) {
  in_memory(fn(_) { Nil })
}

@external(javascript, "./idb.ffi.mjs", "set_custom_indexeddb")
pub fn set_custom_indexeddb_for_test(idb: Dynamic) -> Nil

@external(javascript, "./idb.ffi.mjs", "ffi_get")
fn ffi_get(
  db: Dynamic,
  store: String,
  key: String,
  fn_ok_some: fn(String) -> Result(Option(String), String),
  fn_ok_none: fn() -> Result(Option(String), String),
  fn_err: fn(String) -> Result(Option(String), String),
) -> Promise(Result(Option(String), String))

/// Retrieves an item from `store` by `key`. Resolves with `Ok(Some(value))` if found,
/// `Ok(None)` if key does not exist, or `Error(msg)` on failure.
pub fn get(
  db: IdbDatabase,
  store: String,
  key: String,
) -> Promise(Result(Option(String), String)) {
  ffi_get(db.raw, store, key, fn(s) { Ok(Some(s)) }, fn() { Ok(None) }, fn(e) {
    Error(e)
  })
}

@external(javascript, "./idb.ffi.mjs", "ffi_put")
fn ffi_put(
  db: Dynamic,
  store: String,
  key: Option(String),
  value: String,
) -> Promise(Result(Nil, String))

/// Stores `value` in `store`. If `key` is `Some(k)`, uses explicit key.
/// If `None`, relies on store's `key_path` inside `value`.
pub fn put(
  db: IdbDatabase,
  store: String,
  key: Option(String),
  value: String,
) -> Promise(Result(Nil, String)) {
  ffi_put(db.raw, store, key, value)
}

/// Convenience method to store `value` with explicit `key`.
pub fn put_kv(
  db: IdbDatabase,
  store: String,
  key: String,
  value: String,
) -> Promise(Result(Nil, String)) {
  put(db, store, Some(key), value)
}

/// Convenience method to store a JSON record using store's internal `key_path`.
pub fn put_record(
  db: IdbDatabase,
  store: String,
  value_json: String,
) -> Promise(Result(Nil, String)) {
  put(db, store, None, value_json)
}

@external(javascript, "./idb.ffi.mjs", "ffi_delete")
fn ffi_delete(
  db: Dynamic,
  store: String,
  key: String,
) -> Promise(Result(Nil, String))

/// Deletes the record with `key` from `store`.
pub fn delete(
  db: IdbDatabase,
  store: String,
  key: String,
) -> Promise(Result(Nil, String)) {
  ffi_delete(db.raw, store, key)
}

@external(javascript, "./idb.ffi.mjs", "ffi_all")
fn ffi_all(
  db: Dynamic,
  store: String,
  fn_ok: fn(List(String)) -> Result(List(String), String),
  fn_err: fn(String) -> Result(List(String), String),
) -> Promise(Result(List(String), String))

/// Returns all records in `store`.
pub fn all(
  db: IdbDatabase,
  store: String,
) -> Promise(Result(List(String), String)) {
  ffi_all(db.raw, store, fn(items) { Ok(items) }, fn(e) { Error(e) })
}

@external(javascript, "./idb.ffi.mjs", "ffi_query_by_index")
fn ffi_query_by_index(
  db: Dynamic,
  store: String,
  index_name: String,
  key: String,
  fn_ok: fn(List(String)) -> Result(List(String), String),
  fn_err: fn(String) -> Result(List(String), String),
) -> Promise(Result(List(String), String))

/// Queries records from `store` via secondary index `index_name` matching `key`.
pub fn query_by_index(
  db: IdbDatabase,
  store: String,
  index_name: String,
  key: String,
) -> Promise(Result(List(String), String)) {
  ffi_query_by_index(
    db.raw,
    store,
    index_name,
    key,
    fn(items) { Ok(items) },
    fn(e) { Error(e) },
  )
}

@external(javascript, "./idb.ffi.mjs", "ffi_count")
fn ffi_count(db: Dynamic, store: String) -> Promise(Result(Int, String))

/// Counts total records in `store`.
pub fn count(db: IdbDatabase, store: String) -> Promise(Result(Int, String)) {
  ffi_count(db.raw, store)
}

@external(javascript, "./idb.ffi.mjs", "ffi_clear")
fn ffi_clear(db: Dynamic, store: String) -> Promise(Result(Nil, String))

/// Clears all records in `store`.
pub fn clear(db: IdbDatabase, store: String) -> Promise(Result(Nil, String)) {
  ffi_clear(db.raw, store)
}

@external(javascript, "./idb.ffi.mjs", "ffi_close")
fn ffi_close(db: Dynamic) -> Nil

/// Closes the database connection.
pub fn close(db: IdbDatabase) -> Nil {
  ffi_close(db.raw)
}
