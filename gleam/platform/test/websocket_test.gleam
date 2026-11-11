import gleam/option.{None, Some}
import omni/platform/ref
import omni/platform/websocket

pub fn websocket_fake_lifecycle_test() {
  let sent_messages = ref.new([])
  let closed_status = ref.new(None)

  let conn =
    websocket.fake(
      fn(msg) {
        ref.update(sent_messages, fn(list) { [msg, ..list] })
        Ok(Nil)
      },
      fn(code, reason) {
        ref.set(closed_status, Some(#(code, reason)))
        Nil
      },
    )

  // Send frames
  let res1 = websocket.send(conn, "REQ")
  let res2 = websocket.send(conn, "EVENT")
  assert res1 == Ok(Nil)
  assert res2 == Ok(Nil)

  assert ref.get(sent_messages) == ["EVENT", "REQ"]

  // Close connection
  websocket.close(conn, 1000, "Normal closure")
  assert ref.get(closed_status) == Some(#(1000, "Normal closure"))
}

pub fn websocket_event_variants_test() {
  let ev1 = websocket.Open
  let ev2 = websocket.Message("test-frame")
  let ev3 = websocket.Close(1000, "bye")
  let ev4 = websocket.Error("connection timeout")

  let describe = fn(ev: websocket.WebSocketEvent) {
    case ev {
      websocket.Open -> "open"
      websocket.Message(txt) -> "msg:" <> txt
      websocket.Close(_code, _) -> "close"
      websocket.Error(err) -> "err:" <> err
    }
  }

  assert describe(ev1) == "open"
  assert describe(ev2) == "msg:test-frame"
  assert describe(ev3) == "close"
  assert describe(ev4) == "err:connection timeout"
}
