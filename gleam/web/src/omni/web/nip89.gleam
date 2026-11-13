//// NIP-89 handler discovery over the local cache and relay pool.
////
//// Queries `31989` recommendations for an event kind, then resolves the
//// referenced `31990` handler-info documents, preferring cached events and
//// falling back to the network once.

import gleam/dict
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{type Option, None, Some}
import omni/kernel/kernel.{type OmniKernel}
import omni/kernel/nostr/coordinator
import omni/nostr/event.{type Event}
import omni/nostr/filter.{type Filter}
import omni/nostr/nip89
import omni/platform/promise_ext
import omni/protocol/rpc/method.{FetchOptions}

/// Discover handler-info documents that claim to handle `handled_kind`.
pub fn discover_handlers(
  kernel: OmniKernel,
  handled_kind: Int,
) -> Promise(List(nip89.HandlerInfo)) {
  use events <- promise.await(
    fetch_local_then_network(kernel, [nip89.recommendation_filter(handled_kind)]),
  )
  let references =
    list.filter_map(events, fn(event) {
      option_to_result(nip89.parse_recommendation(event))
    })
    |> list.flat_map(fn(recommendation) { recommendation.handlers })
    |> dedupe_references

  let fetches =
    list.map(references, fn(reference) {
      use info_events <- promise.map(
        fetch_local_then_network(kernel, [
          nip89.handler_info_filter(reference.pubkey, reference.identifier),
        ]),
      )
      list.filter_map(info_events, fn(event) {
        option_to_result(nip89.parse_handler_info(event))
      })
    })

  use results <- promise.map(promise_ext.all(fetches))
  list.flatten(results)
  |> dedupe_infos
}

fn fetch_local_then_network(
  kernel: OmniKernel,
  filters: List(Filter),
) -> Promise(List(Event)) {
  use cached <- promise.await(coordinator.fetch(
    kernel.coordinator,
    "nip89_discovery",
    filters,
    Some(FetchOptions(
      timeout_ms: Some(250),
      relays: None,
      local_only: Some(True),
    )),
  ))
  case cached {
    [] ->
      coordinator.fetch(
        kernel.coordinator,
        "nip89_discovery",
        filters,
        Some(FetchOptions(
          timeout_ms: Some(2000),
          relays: None,
          local_only: None,
        )),
      )
    events -> promise.resolve(events)
  }
}

fn option_to_result(value: option.Option(a)) -> Result(a, Nil) {
  case value {
    option.Some(item) -> Ok(item)
    option.None -> Error(Nil)
  }
}

fn dedupe_references(
  references: List(nip89.HandlerRef),
) -> List(nip89.HandlerRef) {
  let seen = dict.new()
  references
  |> list.fold(#([], seen), fn(acc, reference) {
    let #(kept, seen) = acc
    case dict.has_key(seen, reference.coordinate) {
      True -> #(kept, seen)
      False -> #(
        [reference, ..kept],
        dict.insert(seen, reference.coordinate, True),
      )
    }
  })
  |> fn(pair) { list.reverse(pair.0) }
}

fn dedupe_infos(infos: List(nip89.HandlerInfo)) -> List(nip89.HandlerInfo) {
  let seen = dict.new()
  infos
  |> list.fold(#([], seen), fn(acc, info) {
    let #(kept, seen) = acc
    case dict.has_key(seen, info.coordinate) {
      True -> #(kept, seen)
      False -> #([info, ..kept], dict.insert(seen, info.coordinate, True))
    }
  })
  |> fn(pair) { list.reverse(pair.0) }
}
