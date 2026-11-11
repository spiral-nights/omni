//// Namespaced subscription coordinator across local event store and relay pool.
////
//// Coordinates:
//// - 0ms immediate cache hits from `LocalEventStore`.
//// - Live multiplexed relay streaming from `RelayPool`.
//// - Granular ACL read filtering per requesting plugin ID.
//// - Global event deduplication and automatic background ingestion into the local store.

import gleam/dict
import gleam/int
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/set
import gleam/string
import omni/kernel/acl/engine.{type AclEngine} as acl_engine
import omni/kernel/nostr/event_store.{type LocalEventStore}
import omni/kernel/nostr/event_store_index
import omni/kernel/nostr/relay_pool.{type RelayPool}
import omni/nostr/event.{type Event}
import omni/nostr/event_id
import omni/nostr/filter.{type Filter}
import omni/nostr/relay_frame
import omni/platform/promise_ext
import omni/platform/ref
import omni/protocol/plugin_id
import omni/protocol/rpc/method.{type FetchOptions}

/// The coordinator mediating subscriptions between local storage, relays, and ACL policies.
pub type SubscriptionCoordinator {
  SubscriptionCoordinator(
    event_store: LocalEventStore,
    relay_pool: RelayPool,
    acl_engine: Option(AclEngine),
  )
}

/// Creates a new `SubscriptionCoordinator`.
pub fn new(
  event_store: LocalEventStore,
  relay_pool: RelayPool,
  acl_engine: Option(AclEngine),
) -> SubscriptionCoordinator {
  SubscriptionCoordinator(
    event_store: event_store,
    relay_pool: relay_pool,
    acl_engine: acl_engine,
  )
}

/// Subscribes to events matching `filters` under `sub_id`.
///
/// 1. Queries `LocalEventStore` first for immediate 0ms cached events.
/// 2. Applies ACL read filtering if an engine is configured and `sub_id` is namespaced (`plugin_id:sub_name`).
/// 3. Subscribes to `RelayPool` for live streaming events, deduplicating incoming events.
/// 4. Automatically saves newly discovered relay events into `LocalEventStore`.
/// 5. Returns a promise resolving with an unsubscription closure.
pub fn subscribe(
  coord: SubscriptionCoordinator,
  sub_id: String,
  filters: List(Filter),
  on_event: fn(Event) -> Nil,
  on_eose: Option(fn() -> Nil),
) -> Promise(fn() -> Nil) {
  subscribe_impl(coord, sub_id, filters, None, on_event, on_eose)
}

/// Subscribe but route `REQ` only to the given relays (NIP-65 outbox routing).
pub fn subscribe_targeted(
  coord: SubscriptionCoordinator,
  sub_id: String,
  filters: List(Filter),
  targets: List(String),
  on_event: fn(Event) -> Nil,
  on_eose: Option(fn() -> Nil),
) -> Promise(fn() -> Nil) {
  subscribe_impl(coord, sub_id, filters, Some(targets), on_event, on_eose)
}

fn subscribe_impl(
  coord: SubscriptionCoordinator,
  sub_id: String,
  filters: List(Filter),
  targets: Option(List(String)),
  on_event: fn(Event) -> Nil,
  on_eose: Option(fn() -> Nil),
) -> Promise(fn() -> Nil) {
  let seen_ids = ref.new(set.new())
  let maybe_plugin_id = case string.split_once(sub_id, ":") {
    Ok(#(prefix, _)) -> plugin_id.parse(prefix) |> option.from_result
    Error(Nil) -> None
  }

  // 1. Immediate 0ms local event store query for each filter
  let query_promises =
    list.map(filters, fn(filter) {
      event_store.get_events(coord.event_store, filter)
    })

  use results_list <- promise.await(promise_ext.all(query_promises))
  let cached_events = list.flatten(results_list)

  // Dispatch cached events with ACL check
  use _ <- promise.await(
    promise_ext.all(
      list.map(cached_events, fn(ev) {
        let eid = event_id.to_hex(ev.id)
        case set.contains(ref.get(seen_ids), eid) {
          True -> promise.resolve(Nil)
          False -> {
            ref.update(seen_ids, fn(s) { set.insert(s, eid) })
            case coord.acl_engine, maybe_plugin_id {
              Some(engine), Some(pid) -> {
                use allowed <- promise.map(acl_engine.can_read_event(
                  engine,
                  pid,
                  ev.kind,
                ))
                case allowed {
                  True -> on_event(ev)
                  False -> Nil
                }
              }
              _, _ -> {
                on_event(ev)
                promise.resolve(Nil)
              }
            }
          }
        }
      }),
    ),
  )

  // If there are no configured relays, fire on_eose immediately
  case
    on_eose,
    list.is_empty(relay_pool.get_configured_relays(coord.relay_pool))
  {
    Some(cb), True -> cb()
    _, _ -> Nil
  }

  // Track EOSE per relay so a fetch only completes when every configured
  // relay has answered (or the caller's timeout fires).
  let eose_relays = ref.new(set.new())
  let eose_fired = ref.new(False)
  let expected_relays =
    list.length(relay_pool.get_configured_relays(coord.relay_pool))
    |> int.max(1)

  let maybe_fire_eose = fn() {
    case ref.get(eose_fired) {
      True -> Nil
      False -> {
        let seen = set.size(ref.get(eose_relays))
        case seen >= expected_relays {
          True -> {
            ref.set(eose_fired, True)
            case on_eose {
              Some(cb) -> cb()
              None -> Nil
            }
          }
          False -> Nil
        }
      }
    }
  }

  // 2. Start live multiplexed relay subscription
  let unsubscribe_relays =
    relay_pool.subscribe_targeted(
      coord.relay_pool,
      sub_id,
      filters,
      targets,
      fn(source, frame) {
        case frame {
          relay_frame.EventFrame(_sid, ev) -> {
            let eid = event_id.to_hex(ev.id)
            let is_new = !set.contains(ref.get(seen_ids), eid)
            ref.update(seen_ids, fn(s) { set.insert(s, eid) })

            // Ingest into local store after notifying the subscriber.
            let _ = event_store.save_event(coord.event_store, ev)

            case is_new {
              True -> {
                case coord.acl_engine, maybe_plugin_id {
                  Some(engine), Some(pid) -> {
                    let _ =
                      promise.map(
                        acl_engine.can_read_event(engine, pid, ev.kind),
                        fn(allowed) {
                          case allowed {
                            True -> on_event(ev)
                            False -> Nil
                          }
                        },
                      )
                    Nil
                  }
                  _, _ -> on_event(ev)
                }
              }
              False -> Nil
            }
          }
          relay_frame.Eose(_sid) -> {
            ref.update(eose_relays, fn(s) { set.insert(s, source) })
            maybe_fire_eose()
          }
          relay_frame.Closed(_sid, _reason) -> {
            ref.update(eose_relays, fn(s) { set.insert(s, source) })
            maybe_fire_eose()
          }
          _ -> Nil
        }
      },
    )

  let closer = fn() {
    unsubscribe_relays()
    ref.set(seen_ids, set.new())
    Nil
  }

  promise.resolve(closer)
}

/// Fetches events matching `filters` once across local event store and relay pool.
///
/// If `options.local_only` is `Some(True)`, queries `LocalEventStore` exclusively.
/// Otherwise, queries local cache immediately and streams from `RelayPool` until
/// `EOSE` is received or `timeout_ms` expires.
pub fn fetch(
  coord: SubscriptionCoordinator,
  sub_id: String,
  filters: List(Filter),
  options: Option(FetchOptions),
) -> Promise(List(Event)) {
  let is_local_only = case options {
    Some(opts) -> option.unwrap(opts.local_only, False)
    None -> False
  }
  let timeout_ms = case options {
    Some(opts) ->
      option.unwrap(opts.timeout_ms, 3000)
      |> int.clamp(100, 15_000)
    None -> 3000
  }

  case is_local_only {
    True -> {
      let query_promises =
        list.map(filters, fn(filter) {
          event_store.get_events(coord.event_store, filter)
        })
      use results_list <- promise.await(promise_ext.all(query_promises))
      let cached_events =
        list.flatten(results_list)
        |> event_store_index.deduplicate_by_id

      let maybe_plugin_id = case string.split_once(sub_id, ":") {
        Ok(#(prefix, _)) -> plugin_id.parse(prefix) |> option.from_result
        Error(Nil) -> None
      }

      use filtered_events <- promise.map(
        case coord.acl_engine, maybe_plugin_id {
          Some(engine), Some(pid) -> {
            let check_promises =
              list.map(cached_events, fn(ev) {
                use allowed <- promise.map(acl_engine.can_read_event(
                  engine,
                  pid,
                  ev.kind,
                ))
                case allowed {
                  True -> Some(ev)
                  False -> None
                }
              })
            use checked_opts <- promise.map(promise_ext.all(check_promises))
            option.values(checked_opts)
          }
          _, _ -> promise.resolve(cached_events)
        },
      )

      list.sort(filtered_events, fn(a, b) {
        int.compare(b.created_at, a.created_at)
      })
    }
    False -> {
      let events_map = ref.new(dict.new())
      let is_done = ref.new(False)
      let #(done_promise, resolve_done) = promise.start()

      let finish = fn() {
        case ref.get(is_done) {
          True -> Nil
          False -> {
            ref.set(is_done, True)
            let evs =
              dict.values(ref.get(events_map))
              |> list.sort(fn(a: Event, b: Event) {
                int.compare(b.created_at, a.created_at)
              })
            resolve_done(evs)
          }
        }
      }

      use unsub <- promise.await(subscribe(
        coord,
        sub_id,
        filters,
        fn(ev) {
          let id_str = event_id.to_hex(ev.id)
          ref.update(events_map, fn(m) { dict.insert(m, id_str, ev) })
        },
        Some(fn() { finish() }),
      ))

      // Race against timeout
      let _ =
        promise.map(promise_ext.delay(timeout_ms, Nil), fn(_) { finish() })

      use results <- promise.map(done_promise)
      unsub()
      results
    }
  }
}
