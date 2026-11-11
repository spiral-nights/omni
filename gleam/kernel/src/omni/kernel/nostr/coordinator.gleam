//// Namespaced subscription coordinator across local event store and relay pool.
////
//// Coordinates:
//// - 0ms immediate cache hits from `LocalEventStore`.
//// - Live multiplexed relay streaming from `RelayPool`.
//// - Granular ACL read filtering per requesting plugin ID.
//// - Global event deduplication and automatic background ingestion into the local store.

import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/set
import gleam/string
import omni/kernel/acl/engine.{type AclEngine} as acl_engine
import omni/kernel/nostr/event_store.{type LocalEventStore}
import omni/kernel/nostr/relay_pool.{type RelayPool}
import omni/nostr/event.{type Event}
import omni/nostr/event_id
import omni/nostr/filter.{type Filter}
import omni/nostr/relay_frame
import omni/platform/promise_ext
import omni/platform/ref
import omni/protocol/plugin_id

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

  // 2. Start live multiplexed relay subscription
  let unsubscribe_relays =
    relay_pool.subscribe(coord.relay_pool, sub_id, filters, fn(frame) {
      case frame {
        relay_frame.EventFrame(_sid, ev) -> {
          let eid = event_id.to_hex(ev.id)
          let is_new = !set.contains(ref.get(seen_ids), eid)
          ref.update(seen_ids, fn(s) { set.insert(s, eid) })

          // Ingest into local store in background
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
          case on_eose {
            Some(cb) -> cb()
            None -> Nil
          }
        }
        _ -> Nil
      }
    })

  let closer = fn() {
    unsubscribe_relays()
    ref.set(seen_ids, set.new())
    Nil
  }

  promise.resolve(closer)
}
