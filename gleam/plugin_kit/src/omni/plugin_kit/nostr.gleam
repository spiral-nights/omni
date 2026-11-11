//// Typed Gleam client interface for standard `window.nostr` (NIP-07 + extended
//// `fetch`, `subscribe`, `publish`, `doc`).
////
//// Uses an injectable `NostrClient` dependency record so plugins can be 100%
//// unit-tested in Node with an in-memory reactive `mock_client` or run in browser
//// against `window.nostr`.

import gleam/bit_array
import gleam/dict.{type Dict}
import gleam/dynamic/decode.{type Decoder}
import gleam/int
import gleam/javascript/promise.{type Promise}
import gleam/json.{type Json}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/order
import gleam/string
import omni/nostr/event.{type Event, Event}
import omni/nostr/event_id.{type EventId}
import omni/nostr/filter.{type Filter}
import omni/nostr/kind.{type Kind}
import omni/nostr/pubkey.{type Pubkey}
import omni/nostr/replaceable
import omni/platform/ref.{type Ref}

/// Unsigned Nostr event draft prior to signing and publishing.
pub type DraftEvent {
  DraftEvent(
    kind: Kind,
    content: String,
    tags: List(List(String)),
    created_at: Option(Int),
  )
}

/// Options for `nostr.fetch(filters, options)`.
pub type FetchOptions {
  FetchOptions(timeout_ms: Option(Int), relay_urls: Option(List(String)))
}

/// Default empty `FetchOptions`.
pub fn default_fetch_options() -> FetchOptions {
  FetchOptions(timeout_ms: None, relay_urls: None)
}

/// Handle returned by `subscribe` / `subscribe_once` to cancel an active subscription.
pub type SubscriptionHandle {
  SubscriptionHandle(sub_id: String, unsubscribe: fn() -> Nil)
}

/// Specification for a local-first reactive replaceable Nostr document (`nostr.doc`).
pub type DocSpec(a) {
  DocSpec(
    kind: Kind,
    d_tag: String,
    encrypted: Bool,
    default: a,
    encode: fn(a) -> Json,
    decoder: Decoder(a),
  )
}

/// Reactive handle to a replaceable Nostr document (`nostr.doc`).
pub type DocHandle(a) {
  DocHandle(
    read: fn() -> a,
    write: fn(a) -> Promise(Result(Event, String)),
    update: fn(fn(a) -> a) -> Promise(Result(Event, String)),
    on_update: fn(fn(a) -> Nil) -> fn() -> Nil,
  )
}

/// Injectable Nostr client port exposing NIP-07 signing, NIP-44 encryption,
/// and extended `fetch`, `subscribe`, and `publish` primitives.
pub type NostrClient {
  NostrClient(
    get_public_key: fn() -> Promise(Result(Pubkey, String)),
    sign_event: fn(DraftEvent) -> Promise(Result(Event, String)),
    fetch: fn(List(Filter), FetchOptions) ->
      Promise(Result(List(Event), String)),
    subscribe: fn(List(Filter), fn(Event) -> Nil, fn() -> Nil) ->
      SubscriptionHandle,
    publish: fn(DraftEvent) -> Promise(Result(Event, String)),
    nip44_encrypt: fn(Pubkey, String) -> Promise(Result(String, String)),
    nip44_decrypt: fn(Pubkey, String) -> Promise(Result(String, String)),
  )
}

/// Subscribes to `filters`, invokes `on_event` for each matching event, and
/// automatically unsubscribes as soon as EOSE arrives (invoking `on_complete`).
pub fn subscribe_once(
  client: NostrClient,
  filters: List(Filter),
  on_event: fn(Event) -> Nil,
  on_complete: fn() -> Nil,
) -> SubscriptionHandle {
  let unsub_ref: Ref(Option(fn() -> Nil)) = ref.new(None)
  let completed_ref = ref.new(False)

  let handle =
    client.subscribe(
      filters,
      fn(ev) {
        case ref.get(completed_ref) {
          True -> Nil
          False -> on_event(ev)
        }
      },
      fn() {
        case ref.get(completed_ref) {
          True -> Nil
          False -> {
            ref.set(completed_ref, True)
            case ref.get(unsub_ref) {
              Some(unsub) -> unsub()
              None -> Nil
            }
            on_complete()
          }
        }
      },
    )

  ref.set(unsub_ref, Some(handle.unsubscribe))
  case ref.get(completed_ref) {
    True -> handle.unsubscribe()
    False -> Nil
  }

  handle
}

/// Opens a reactive replaceable Nostr document backed by `client`.
///
/// Immediately seeds the document state with `spec.default`, subscribes to matching
/// replaceable/addressable events from the user's pubkey, and provides `read`, `write`,
/// `update`, and `on_update` hooks.
pub fn open_doc(client: NostrClient, spec: DocSpec(a)) -> DocHandle(a) {
  let state_ref = ref.new(spec.default)
  let listeners_ref: Ref(List(#(Int, fn(a) -> Nil))) = ref.new([])
  let next_listener_id = ref.new(1)

  let notify_all = fn(val: a) {
    list.each(ref.get(listeners_ref), fn(pair) {
      let #(_id, cb) = pair
      cb(val)
    })
  }

  let apply_event = fn(pk: Pubkey, ev: Event) {
    let raw_promise = case spec.encrypted {
      True -> client.nip44_decrypt(pk, ev.content)
      False -> promise.resolve(Ok(ev.content))
    }
    let _ =
      promise.map(raw_promise, fn(res) {
        case res {
          Ok(json_str) ->
            case json.parse(from: json_str, using: spec.decoder) {
              Ok(decoded) -> {
                ref.set(state_ref, decoded)
                notify_all(decoded)
              }
              Error(_) -> Nil
            }
          Error(_) -> Nil
        }
      })
    Nil
  }

  // Subscribe once we resolve the user's pubkey
  let _ =
    promise.map(client.get_public_key(), fn(pk_res) {
      case pk_res {
        Ok(pk) -> {
          let base_filter =
            filter.new()
            |> filter.with_pubkeys([pk])
            |> filter.with_kinds([spec.kind])
          let doc_filter = case spec.d_tag {
            "" -> base_filter
            d -> filter.with_d_tag(base_filter, d)
          }
          let _sub =
            client.subscribe([doc_filter], fn(ev) { apply_event(pk, ev) }, fn() {
              Nil
            })
          Nil
        }
        Error(_) -> Nil
      }
    })

  let write_fn = fn(next_val: a) -> Promise(Result(Event, String)) {
    ref.set(state_ref, next_val)
    notify_all(next_val)
    let encoded_str = json.to_string(spec.encode(next_val))
    let tags = case spec.d_tag {
      "" -> []
      d -> [["d", d]]
    }

    case spec.encrypted {
      False ->
        client.publish(DraftEvent(
          kind: spec.kind,
          content: encoded_str,
          tags: tags,
          created_at: None,
        ))
      True ->
        promise.await(client.get_public_key(), fn(pk_res) {
          case pk_res {
            Error(err) -> promise.resolve(Error(err))
            Ok(pk) ->
              promise.await(
                client.nip44_encrypt(pk, encoded_str),
                fn(cipher_res) {
                  case cipher_res {
                    Error(err) -> promise.resolve(Error(err))
                    Ok(ciphertext) ->
                      client.publish(DraftEvent(
                        kind: spec.kind,
                        content: ciphertext,
                        tags: tags,
                        created_at: None,
                      ))
                  }
                },
              )
          }
        })
    }
  }

  DocHandle(
    read: fn() { ref.get(state_ref) },
    write: write_fn,
    update: fn(updater) {
      let updated = updater(ref.get(state_ref))
      write_fn(updated)
    },
    on_update: fn(listener) {
      let id = ref.modify(next_listener_id, fn(n) { n + 1 })
      ref.update(listeners_ref, fn(existing) {
        list.append(existing, [#(id, listener)])
      })
      fn() {
        ref.update(listeners_ref, fn(existing) {
          list.filter(existing, fn(pair) { pair.0 != id })
        })
      }
    },
  )
}

// -----------------------------------------------------------------------------
// In-Memory Reactive Mock Client for Testing
// -----------------------------------------------------------------------------

type ActiveSub {
  ActiveSub(sub_id: String, filters: List(Filter), on_event: fn(Event) -> Nil)
}

/// Constructs an in-memory reactive `NostrClient` seeded with `pubkey` and `initial_events`.
///
/// Supports:
/// - `get_public_key` returning `Ok(pubkey)`
/// - `sign_event` generating deterministic 64-char hex IDs and signatures
/// - `fetch` matching against stored events (sorted newest-first, deduplicated, respecting filter `limit`)
/// - `subscribe` delivering stored matching events immediately, invoking `on_eose`, and streaming future `publish` events
/// - `publish` signing, storing (with replaceable/addressable conflict resolution), and broadcasting to active subscribers
/// - `nip44_encrypt` / `nip44_decrypt` deterministic reversible mock cipher
pub fn mock_client(pubkey: Pubkey, initial_events: List(Event)) -> NostrClient {
  let events_ref: Ref(List(Event)) =
    ref.new(dedup_and_sort_events(initial_events))
  let subs_ref: Ref(Dict(String, ActiveSub)) = ref.new(dict.new())
  let seq_ref = ref.new(1)
  let clock_ref = ref.new(1_700_000_000)

  let sign_draft = fn(draft: DraftEvent) -> Event {
    let seq = ref.modify(seq_ref, fn(n) { n + 1 })
    let ts = case draft.created_at {
      Some(t) -> t
      None -> ref.modify(clock_ref, fn(t) { t + 1 })
    }
    let id = deterministic_event_id(seq, ts, pubkey, draft.kind, draft.content)
    let sig = deterministic_sig_hex(seq)
    Event(
      id: id,
      pubkey: pubkey,
      created_at: ts,
      kind: draft.kind,
      tags: draft.tags,
      content: draft.content,
      sig: sig,
    )
  }

  NostrClient(
    get_public_key: fn() { promise.resolve(Ok(pubkey)) },
    sign_event: fn(draft) { promise.resolve(Ok(sign_draft(draft))) },
    fetch: fn(filters, _options) {
      let current = ref.get(events_ref)
      let matched = query_events_by_filters(current, filters)
      promise.resolve(Ok(matched))
    },
    subscribe: fn(filters, on_event, on_eose) {
      let seq = ref.modify(seq_ref, fn(n) { n + 1 })
      let sub_id = "mock_sub_" <> int.to_string(seq)
      let sub = ActiveSub(sub_id: sub_id, filters: filters, on_event: on_event)
      ref.update(subs_ref, fn(d) { dict.insert(d, sub_id, sub) })

      // Deliver existing matching events synchronously, then EOSE
      let existing = query_events_by_filters(ref.get(events_ref), filters)
      list.each(existing, fn(ev) {
        case dict.has_key(ref.get(subs_ref), sub_id) {
          True -> on_event(ev)
          False -> Nil
        }
      })
      case dict.has_key(ref.get(subs_ref), sub_id) {
        True -> on_eose()
        False -> Nil
      }

      SubscriptionHandle(sub_id: sub_id, unsubscribe: fn() {
        ref.update(subs_ref, fn(d) { dict.delete(d, sub_id) })
      })
    },
    publish: fn(draft) {
      let signed = sign_draft(draft)
      ref.update(events_ref, fn(existing) { insert_event(existing, signed) })

      // Broadcast to active matching subscriptions
      let active_subs = dict.values(ref.get(subs_ref))
      list.each(active_subs, fn(sub) {
        case filter.matches_any(signed, sub.filters) {
          True -> sub.on_event(signed)
          False -> Nil
        }
      })

      promise.resolve(Ok(signed))
    },
    nip44_encrypt: fn(recipient, plaintext) {
      let hex_payload =
        string.lowercase(
          bit_array.base16_encode(bit_array.from_string(plaintext)),
        )
      let prefix = "nip44:" <> pubkey.to_hex(recipient) <> ":"
      promise.resolve(Ok(prefix <> hex_payload))
    },
    nip44_decrypt: fn(sender, ciphertext) {
      let prefix = "nip44:" <> pubkey.to_hex(sender) <> ":"
      case string.starts_with(ciphertext, prefix) {
        False -> promise.resolve(Error("Invalid mock NIP-44 ciphertext prefix"))
        True -> {
          let hex_payload = string.drop_start(ciphertext, string.length(prefix))
          case bit_array.base16_decode(hex_payload) {
            Error(Nil) ->
              promise.resolve(Error("Invalid hex in mock NIP-44 ciphertext"))
            Ok(bytes) ->
              case bit_array.to_string(bytes) {
                Ok(plain) -> promise.resolve(Ok(plain))
                Error(Nil) ->
                  promise.resolve(Error("Invalid UTF-8 in mock NIP-44 payload"))
              }
          }
        }
      }
    },
  )
}

fn deterministic_event_id(
  seq: Int,
  ts: Int,
  pk: Pubkey,
  k: Kind,
  content: String,
) -> EventId {
  let seed =
    int.to_string(seq)
    <> "_"
    <> int.to_string(ts)
    <> "_"
    <> int.to_string(kind.to_int(k))
    <> "_"
    <> pubkey.to_hex(pk)
    <> "_"
    <> content
  let hex_raw =
    string.lowercase(bit_array.base16_encode(bit_array.from_string(seed)))
  let padded = string.pad_end(hex_raw, to: 64, with: "0")
  let hex64 = string.slice(padded, at_index: 0, length: 64)
  let assert Ok(id) = event_id.parse(hex64)
  id
}

fn deterministic_sig_hex(seq: Int) -> String {
  let prefix =
    string.lowercase(
      bit_array.base16_encode(bit_array.from_string(
        "sig_" <> int.to_string(seq),
      )),
    )
  let padded = string.pad_end(prefix, to: 128, with: "a")
  string.slice(padded, at_index: 0, length: 128)
}

fn insert_event(existing: List(Event), incoming: Event) -> List(Event) {
  let incoming_id = event_id.to_hex(incoming.id)
  case list.any(existing, fn(e) { event_id.to_hex(e.id) == incoming_id }) {
    True -> existing
    False -> {
      case
        replaceable.is_replaceable(incoming.kind)
        || replaceable.is_addressable(incoming.kind)
      {
        False -> sort_events([incoming, ..existing])
        True -> {
          let is_same_slot = fn(e: Event) -> Bool {
            let same_author =
              pubkey.to_hex(e.pubkey) == pubkey.to_hex(incoming.pubkey)
            let same_kind = kind.to_int(e.kind) == kind.to_int(incoming.kind)
            case same_author && same_kind {
              False -> False
              True ->
                case replaceable.is_addressable(incoming.kind) {
                  True ->
                    replaceable.get_d_tag(e) == replaceable.get_d_tag(incoming)
                  False -> True
                }
            }
          }

          let conflicting = list.filter(existing, is_same_slot)
          let dominated =
            list.any(conflicting, fn(old) {
              !replaceable.should_replace(existing: old, incoming: incoming)
            })

          case dominated {
            True -> existing
            False -> {
              let kept = list.filter(existing, fn(e) { !is_same_slot(e) })
              sort_events([incoming, ..kept])
            }
          }
        }
      }
    }
  }
}

fn dedup_and_sort_events(events: List(Event)) -> List(Event) {
  list.fold(events, [], insert_event)
}

fn sort_events(events: List(Event)) -> List(Event) {
  list.sort(events, fn(a, b) {
    case int.compare(b.created_at, a.created_at) {
      order.Eq -> string.compare(event_id.to_hex(a.id), event_id.to_hex(b.id))
      other -> other
    }
  })
}

fn query_events_by_filters(
  events: List(Event),
  filters: List(Filter),
) -> List(Event) {
  case filters {
    [] -> []
    _ -> {
      let per_filter =
        list.flat_map(filters, fn(f) {
          let matched =
            list.filter(events, fn(ev) { filter.matches(ev, f) })
            |> sort_events
          case f.limit {
            Some(lim) if lim >= 0 -> list.take(matched, lim)
            _ -> matched
          }
        })
      dedup_and_sort_events(per_filter)
    }
  }
}
