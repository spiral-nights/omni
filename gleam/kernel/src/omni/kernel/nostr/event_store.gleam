//// Local 0ms event store backed by IndexedDB and an in-memory LRU cache.
////
//// Conforms to Nostr storage specifications:
//// - 0ms instant reads via in-memory LRU cache `Ref(Dict(String, Event))`.
//// - Ephemeral events (kind 20000..29999) stored exclusively in memory.
//// - Replaceable (NIP-01/16) and addressable (NIP-33) conflicts resolved via `omni_nostr/replaceable`.
//// - Event deletion handled via NIP-09 (kind 5).
//// - Query engine with indexing and `filter.matches` evaluation.
//// - Cache pruning of non-user transient public notes.

import gleam/dict.{type Dict}
import gleam/int
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import omni/kernel/nostr/event_store_index
import omni/nostr/event.{type Event}
import omni/nostr/event_codec
import omni/nostr/event_id.{type EventId}
import omni/nostr/filter.{type Filter, Filter}
import omni/nostr/kind
import omni/nostr/pubkey.{type Pubkey}
import omni/nostr/replaceable
import omni/platform/idb.{type IdbDatabase}
import omni/platform/ref.{type Ref}

/// Configuration options for initializing a `LocalEventStore`.
pub type LocalEventStoreOptions {
  LocalEventStoreOptions(
    db_name: Option(String),
    max_notes: Option(Int),
    max_memory_cache_size: Option(Int),
    user_pubkey: Option(Pubkey),
  )
}

/// A local Nostr event store backed by an IndexedDB connection and in-memory cache.
pub type LocalEventStore {
  LocalEventStore(
    db: IdbDatabase,
    memory_cache: Ref(Dict(String, Event)),
    max_notes: Int,
    max_memory_cache_size: Int,
    user_pubkey: Ref(Option(Pubkey)),
  )
}

/// Returns default options: db_name "omni_event_store", max_notes 100, max_memory_cache_size 500.
pub fn default_options() -> LocalEventStoreOptions {
  LocalEventStoreOptions(
    db_name: Some("omni_event_store"),
    max_notes: Some(100),
    max_memory_cache_size: Some(500),
    user_pubkey: None,
  )
}

/// Instantiates a `LocalEventStore` over an open `IdbDatabase` connection.
pub fn new(
  db: IdbDatabase,
  options: LocalEventStoreOptions,
) -> LocalEventStore {
  let max_notes = option.unwrap(options.max_notes, 100)
  let max_memory_cache_size = option.unwrap(options.max_memory_cache_size, 500)
  let user_pubkey = ref.new(options.user_pubkey)
  let memory_cache = ref.new(dict.new())
  LocalEventStore(
    db: db,
    memory_cache: memory_cache,
    max_notes: max_notes,
    max_memory_cache_size: max_memory_cache_size,
    user_pubkey: user_pubkey,
  )
}

/// Opens an in-memory mock database and initializes a `LocalEventStore`.
pub fn open_in_memory(
  options: LocalEventStoreOptions,
) -> Promise(Result(LocalEventStore, String)) {
  use db_res <- promise.map(
    idb.in_memory(fn(upgrade) {
      let _ = event_store_index.upgrade_schema(upgrade)
      Nil
    }),
  )
  case db_res {
    Ok(db) -> Ok(new(db, options))
    Error(err) -> Error(err)
  }
}

/// Sets the current user's public key (protecting authored notes from prune).
pub fn set_user_pubkey(store: LocalEventStore, pubkey: Pubkey) -> Nil {
  ref.set(store.user_pubkey, Some(pubkey))
}

/// Retrieves the configured user public key, if any.
pub fn get_user_pubkey(store: LocalEventStore) -> Option(Pubkey) {
  ref.get(store.user_pubkey)
}

/// Returns the current number of events cached in memory.
pub fn get_memory_cache_size(store: LocalEventStore) -> Int {
  dict.size(ref.get(store.memory_cache))
}

fn put_memory_cache(store: LocalEventStore, event: Event) -> Nil {
  case store.max_memory_cache_size <= 0 {
    True -> Nil
    False -> {
      let id_hex = event_id.to_hex(event.id)
      ref.update(store.memory_cache, fn(cache) {
        let cache = case dict.has_key(cache, id_hex) {
          True -> cache
          False ->
            case dict.size(cache) >= store.max_memory_cache_size {
              True ->
                case dict.keys(cache) {
                  [first_key, ..] -> dict.delete(cache, first_key)
                  [] -> cache
                }
              False -> cache
            }
        }
        dict.insert(cache, id_hex, event)
      })
    }
  }
}

fn delete_memory_cache(store: LocalEventStore, id_hex: String) -> Nil {
  ref.update(store.memory_cache, fn(cache) { dict.delete(cache, id_hex) })
}

fn decode_records(res: Result(List(String), String)) -> List(Event) {
  case res {
    Ok(records) ->
      list.filter_map(records, fn(raw) {
        event_codec.decode_json(raw)
        |> result.replace_error(Nil)
      })
    Error(_) -> []
  }
}

fn get_existing_by_pubkey(
  store: LocalEventStore,
  pubkey_hex: String,
) -> Promise(List(Event)) {
  use idb_res <- promise.map(idb.query_by_index(
    store.db,
    event_store_index.events_store_name,
    "pubkey",
    pubkey_hex,
  ))
  let idb_events = decode_records(idb_res)
  let memory_events =
    dict.values(ref.get(store.memory_cache))
    |> list.filter(fn(ev) { pubkey.to_hex(ev.pubkey) == pubkey_hex })
  list.append(idb_events, memory_events)
  |> event_store_index.deduplicate_by_id
}

fn delete_events_loop(
  store: LocalEventStore,
  events: List(Event),
  count: Int,
) -> Promise(Result(Int, String)) {
  case events {
    [] -> promise.resolve(Ok(count))
    [event, ..rest] -> {
      let id_hex = event_id.to_hex(event.id)
      delete_memory_cache(store, id_hex)
      use del_res <- promise.await(idb.delete(
        store.db,
        event_store_index.events_store_name,
        id_hex,
      ))
      case del_res {
        Ok(Nil) -> delete_events_loop(store, rest, count + 1)
        Error(err) -> promise.resolve(Error(err))
      }
    }
  }
}

/// Persists an event to the local store, enforcing replaceable/addressable and deletion rules.
///
/// Resolves with `Ok(True)` if stored, `Ok(False)` if ignored (e.g. superseded replaceable event),
/// or `Error(msg)` on failure.
pub fn save_event(
  store: LocalEventStore,
  event: Event,
) -> Promise(Result(Bool, String)) {
  case replaceable.is_ephemeral(event.kind) {
    True -> {
      put_memory_cache(store, event)
      promise.resolve(Ok(True))
    }
    False -> {
      case kind.to_int(event.kind) == 5 {
        True -> handle_save_deletion_event(store, event)
        False -> {
          let is_repl = replaceable.is_replaceable(event.kind)
          let is_addr = replaceable.is_addressable(event.kind)
          case is_repl || is_addr {
            True -> handle_save_replaceable_event(store, event)
            False -> commit_event(store, event)
          }
        }
      }
    }
  }
}

fn commit_event(
  store: LocalEventStore,
  event: Event,
) -> Promise(Result(Bool, String)) {
  use put_res <- promise.await(idb.put_record(
    store.db,
    event_store_index.events_store_name,
    event_codec.encode(event),
  ))
  case put_res {
    Ok(Nil) -> {
      put_memory_cache(store, event)
      promise.resolve(Ok(True))
    }
    Error(err) -> promise.resolve(Error(err))
  }
}

fn handle_save_deletion_event(
  store: LocalEventStore,
  event: Event,
) -> Promise(Result(Bool, String)) {
  let author_hex = pubkey.to_hex(event.pubkey)
  use existing_events <- promise.await(get_existing_by_pubkey(store, author_hex))
  let to_delete =
    list.filter(existing_events, fn(ex) {
      event_store_index.matches_deletion(ex, event)
    })
  use _ <- promise.await(delete_events_loop(store, to_delete, 0))
  commit_event(store, event)
}

fn handle_save_replaceable_event(
  store: LocalEventStore,
  event: Event,
) -> Promise(Result(Bool, String)) {
  let author_hex = pubkey.to_hex(event.pubkey)
  use existing_events <- promise.await(get_existing_by_pubkey(store, author_hex))
  let matching =
    list.filter(existing_events, fn(ex) {
      event_store_index.matches_replaceable_target(ex, event)
    })

  case list.find(matching, fn(ex) { ex.id == event.id }) {
    Ok(_) -> commit_event(store, event)
    Error(Nil) -> {
      let has_superseding =
        list.any(matching, fn(ex) {
          !replaceable.should_replace(existing: ex, incoming: event)
        })
      case has_superseding {
        True -> promise.resolve(Ok(False))
        False -> {
          use _ <- promise.await(delete_events_loop(store, matching, 0))
          commit_event(store, event)
        }
      }
    }
  }
}

/// Saves a batch of events sequentially, returning the total successfully saved count.
pub fn save_events(
  store: LocalEventStore,
  events: List(Event),
) -> Promise(Result(Int, String)) {
  save_events_loop(store, events, 0)
}

fn save_events_loop(
  store: LocalEventStore,
  events: List(Event),
  count: Int,
) -> Promise(Result(Int, String)) {
  case events {
    [] -> promise.resolve(Ok(count))
    [event, ..rest] -> {
      use res <- promise.await(save_event(store, event))
      case res {
        Ok(True) -> save_events_loop(store, rest, count + 1)
        Ok(False) -> save_events_loop(store, rest, count)
        Error(err) -> promise.resolve(Error(err))
      }
    }
  }
}

/// Retrieves a single event by its ID.
///
/// Checks in-memory cache first (0ms hit), falling back to IndexedDB.
pub fn get_event_by_id(
  store: LocalEventStore,
  id: EventId,
) -> Promise(Option(Event)) {
  fetch_event_by_id_string(store, event_id.to_hex(id))
}

fn fetch_event_by_id_string(
  store: LocalEventStore,
  id_hex: String,
) -> Promise(Option(Event)) {
  let cache = ref.get(store.memory_cache)
  case dict.get(cache, id_hex) {
    Ok(ev) -> promise.resolve(Some(ev))
    Error(Nil) -> {
      use get_res <- promise.await(idb.get(
        store.db,
        event_store_index.events_store_name,
        id_hex,
      ))
      case get_res {
        Ok(Some(raw)) ->
          case event_codec.decode_json(raw) {
            Ok(ev) -> {
              put_memory_cache(store, ev)
              promise.resolve(Some(ev))
            }
            Error(_) -> promise.resolve(None)
          }
        _ -> promise.resolve(None)
      }
    }
  }
}

fn fetch_events_by_ids(
  store: LocalEventStore,
  ids: List(String),
) -> Promise(List(Event)) {
  case ids {
    [] -> promise.resolve([])
    [id_str, ..rest] -> {
      use maybe_ev <- promise.await(fetch_event_by_id_string(store, id_str))
      use rest_events <- promise.await(fetch_events_by_ids(store, rest))
      case maybe_ev {
        Some(ev) -> promise.resolve([ev, ..rest_events])
        None -> promise.resolve(rest_events)
      }
    }
  }
}

/// Queries events matching `filter` across in-memory cache and IndexedDB.
///
/// Returns matching events deduplicated by ID and sorted newest first.
pub fn get_events(
  store: LocalEventStore,
  filter: Filter,
) -> Promise(List(Event)) {
  let plan = event_store_index.plan_query(filter)
  use idb_events <- promise.await(case plan {
    event_store_index.ByIds(ids) -> fetch_events_by_ids(store, ids)
    event_store_index.ByPubkey(author) -> {
      use res <- promise.map(idb.query_by_index(
        store.db,
        event_store_index.events_store_name,
        "pubkey",
        author,
      ))
      decode_records(res)
    }
    event_store_index.ByKind(k) -> {
      use res <- promise.map(idb.query_by_index(
        store.db,
        event_store_index.events_store_name,
        "kind",
        int.to_string(k),
      ))
      decode_records(res)
    }
    event_store_index.ByCreatedAt(lower, upper) -> {
      use res <- promise.map(idb.query_by_index_range(
        store.db,
        event_store_index.events_store_name,
        "created_at",
        lower,
        upper,
      ))
      decode_records(res)
    }
    event_store_index.ScanAll -> {
      use res <- promise.map(idb.all(
        store.db,
        event_store_index.events_store_name,
      ))
      decode_records(res)
    }
  })

  let memory_events = dict.values(ref.get(store.memory_cache))
  let combined = list.append(idb_events, memory_events)
  let deduped = event_store_index.deduplicate_by_id(combined)
  let matched = event_store_index.filter_events(deduped, filter)
  let sorted = event_store_index.sort_newest_first(matched)
  let result = case filter.limit {
    Some(limit) -> list.take(sorted, limit)
    None -> sorted
  }
  promise.resolve(result)
}

/// Counts total matching events for `filter` (ignoring any `limit` restriction).
pub fn count_events(store: LocalEventStore, filter: Filter) -> Promise(Int) {
  let count_filter = Filter(..filter, limit: None)
  use events <- promise.map(get_events(store, count_filter))
  list.length(events)
}

/// Prunes non-user transient public notes (kinds 1, 6, 7) exceeding `max_notes`.
///
/// Returns `Ok(deleted_count)` or `Error(msg)`.
pub fn prune(store: LocalEventStore) -> Promise(Result(Int, String)) {
  use all_res <- promise.await(idb.all(
    store.db,
    event_store_index.events_store_name,
  ))
  case all_res {
    Error(err) -> promise.resolve(Error(err))
    Ok(records) -> {
      let events =
        list.filter_map(records, fn(raw) {
          event_codec.decode_json(raw)
          |> result.replace_error(Nil)
        })
      let user_pubkey = ref.get(store.user_pubkey)
      let prunable =
        event_store_index.find_prunable_events(
          events,
          store.max_notes,
          user_pubkey,
        )
      delete_events_loop(store, prunable, 0)
    }
  }
}

/// Deletes a single event by ID from both memory cache and IndexedDB.
pub fn delete_event(
  store: LocalEventStore,
  id: EventId,
) -> Promise(Result(Nil, String)) {
  let id_hex = event_id.to_hex(id)
  delete_memory_cache(store, id_hex)
  idb.delete(store.db, event_store_index.events_store_name, id_hex)
}

/// Clears all events from both memory cache and IndexedDB.
pub fn clear(store: LocalEventStore) -> Promise(Result(Nil, String)) {
  ref.set(store.memory_cache, dict.new())
  idb.clear(store.db, event_store_index.events_store_name)
}
