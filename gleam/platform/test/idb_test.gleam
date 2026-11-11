import gleam/javascript/promise.{type Promise}
import gleam/option.{None, Some}
import omni/platform/idb

pub fn idb_in_memory_crud_test() -> Promise(Nil) {
  use db_res <- promise.await(
    idb.in_memory(fn(upgrade) {
      let _ =
        upgrade.create_store(
          idb.StoreDef(
            name: "settings",
            key_path: None,
            auto_increment: False,
            indexes: [],
          ),
        )
      Nil
    }),
  )
  let assert Ok(db) = db_res

  // Initial read should be None
  use get_initial <- promise.await(idb.get(db, "settings", "theme"))
  assert get_initial == Ok(None)

  // Put a value
  use put_res <- promise.await(idb.put_kv(db, "settings", "theme", "warm-paper"))
  assert put_res == Ok(Nil)

  // Get the value back
  use get_after <- promise.await(idb.get(db, "settings", "theme"))
  assert get_after == Ok(Some("warm-paper"))

  // Count should be 1
  use count_res <- promise.await(idb.count(db, "settings"))
  assert count_res == Ok(1)

  // Put another item
  use _ <- promise.await(idb.put_kv(db, "settings", "language", "en"))
  use all_items <- promise.await(idb.all(db, "settings"))
  let assert Ok(items) = all_items
  assert items == ["warm-paper", "en"]

  // Delete an item
  use del_res <- promise.await(idb.delete(db, "settings", "theme"))
  assert del_res == Ok(Nil)
  use get_del <- promise.await(idb.get(db, "settings", "theme"))
  assert get_del == Ok(None)

  // Clear store
  use clr_res <- promise.await(idb.clear(db, "settings"))
  assert clr_res == Ok(Nil)
  use count_empty <- promise.await(idb.count(db, "settings"))
  assert count_empty == Ok(0)

  idb.close(db)
  promise.resolve(Nil)
}

pub fn idb_in_memory_index_query_test() -> Promise(Nil) {
  use db_res <- promise.await(
    idb.in_memory(fn(upgrade) {
      let _ =
        upgrade.create_store(
          idb.StoreDef(
            name: "events",
            key_path: Some("id"),
            auto_increment: False,
            indexes: [
              idb.IndexDef(name: "kind", key_path: "kind", unique: False),
              idb.IndexDef(name: "pubkey", key_path: "pubkey", unique: False),
            ],
          ),
        )
      Nil
    }),
  )
  let assert Ok(db) = db_res

  let evt1 =
    "{\"id\":\"evt1\",\"pubkey\":\"alice\",\"kind\":1,\"content\":\"first note\"}"
  let evt2 =
    "{\"id\":\"evt2\",\"pubkey\":\"bob\",\"kind\":0,\"content\":\"profile metadata\"}"
  let evt3 =
    "{\"id\":\"evt3\",\"pubkey\":\"alice\",\"kind\":1,\"content\":\"second note\"}"

  use _ <- promise.await(idb.put_record(db, "events", evt1))
  use _ <- promise.await(idb.put_record(db, "events", evt2))
  use _ <- promise.await(idb.put_record(db, "events", evt3))

  // Query events by kind == 1
  use kind_query <- promise.await(idb.query_by_index(db, "events", "kind", "1"))
  let assert Ok(kind1_events) = kind_query
  assert kind1_events == [evt1, evt3]

  // Query events by pubkey == bob
  use bob_query <- promise.await(idb.query_by_index(
    db,
    "events",
    "pubkey",
    "bob",
  ))
  let assert Ok(bob_events) = bob_query
  assert bob_events == [evt2]

  idb.close(db)
  promise.resolve(Nil)
}

@external(javascript, "./idb_test.ffi.mjs", "init_fake_indexeddb")
fn init_fake_indexeddb() -> Nil

pub fn idb_real_indexeddb_test() -> Promise(Nil) {
  init_fake_indexeddb()
  use db_res <- promise.await(
    idb.open("omni_test_suite_db", 1, fn(upgrade) {
      let _ =
        upgrade.create_store(
          idb.StoreDef(
            name: "profiles",
            key_path: Some("pubkey"),
            auto_increment: False,
            indexes: [
              idb.IndexDef(name: "name", key_path: "name", unique: False),
            ],
          ),
        )
      Nil
    }),
  )
  let assert Ok(db) = db_res

  let profile = "{\"pubkey\":\"npub123\",\"name\":\"Alice\"}"
  use put_res <- promise.await(idb.put_record(db, "profiles", profile))
  assert put_res == Ok(Nil)

  use get_res <- promise.await(idb.get(db, "profiles", "npub123"))
  assert get_res == Ok(Some(profile))

  use idx_res <- promise.await(idb.query_by_index(
    db,
    "profiles",
    "name",
    "Alice",
  ))
  let assert Ok(alice_records) = idx_res
  assert alice_records == [profile]

  use cnt_res <- promise.await(idb.count(db, "profiles"))
  assert cnt_res == Ok(1)

  idb.close(db)
  promise.resolve(Nil)
}
