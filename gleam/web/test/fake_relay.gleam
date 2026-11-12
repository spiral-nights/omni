//// In-process fake relay for integration tests.
////
//// Attaches a recording fake socket to the pool and lets tests emit raw relay
//// frames (`EVENT`, `EOSE`, `OK`, `NOTICE`, `AUTH`) through the real dispatch
//// path.

import gleam/list
import omni/kernel/nostr/relay_pool.{type RelayPool, Connected, attach_socket}
import omni/nostr/relay_url
import omni/platform/ref
import omni/platform/websocket

pub type FakeRelay {
  FakeRelay(
    pool: RelayPool,
    url: relay_url.RelayUrl,
    sent: ref.Ref(List(String)),
    closed: ref.Ref(Bool),
  )
}

/// Start a fake relay connection at `url_string`, recording every client frame.
pub fn start(pool: RelayPool, url_string: String) -> FakeRelay {
  let assert Ok(url) = relay_url.parse(url_string)
  let sent = ref.new([])
  let closed = ref.new(False)
  let sock =
    websocket.fake(
      fn(frame) {
        ref.update(sent, fn(frames) { [frame, ..frames] })
        Ok(Nil)
      },
      fn(_code, _reason) { ref.set(closed, True) },
    )
  attach_socket(pool, url, sock, Connected)
  FakeRelay(pool: pool, url: url, sent: sent, closed: closed)
}

/// Emit a raw relay frame into the pool as if the relay sent it.
pub fn emit(relay: FakeRelay, raw_json: String) -> Nil {
  relay_pool.handle_incoming(
    relay.pool,
    relay_url.to_string(relay.url),
    raw_json,
  )
}

/// Client frames the relay received, oldest first.
pub fn sent_frames(relay: FakeRelay) -> List(String) {
  ref.get(relay.sent) |> list.reverse
}

pub fn was_closed(relay: FakeRelay) -> Bool {
  ref.get(relay.closed)
}
