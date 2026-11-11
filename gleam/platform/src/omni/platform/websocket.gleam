//// WebSocket network transport port.
////
//// Provides a typed, event-driven interface over browser and Node.js
//// `WebSocket` connections, supporting bidirectional text frame transport
//// and test fakes.

import gleam/dynamic.{type Dynamic}

/// Events emitted during the WebSocket lifecycle.
pub type WebSocketEvent {
  Open
  Message(text: String)
  Close(code: Int, reason: String)
  Error(String)
}

@external(javascript, "./websocket.ffi.mjs", "error_nil")
fn error_nil() -> Result(a, Nil)

/// An opaque handle representing an active WebSocket connection.
pub opaque type WebSocketConnection {
  WebSocketConnection(raw: Dynamic)
}

@external(javascript, "./websocket.ffi.mjs", "connect")
fn ffi_connect(
  url: String,
  on_open: fn() -> Nil,
  on_message: fn(String) -> Nil,
  on_close: fn(Int, String) -> Nil,
  on_error: fn(String) -> Nil,
) -> Dynamic

/// Establishes a WebSocket connection to `url`, dispatching events to `on_event`.
pub fn connect(
  url: String,
  on_event: fn(WebSocketEvent) -> Nil,
) -> WebSocketConnection {
  let raw =
    ffi_connect(
      url,
      fn() { on_event(Open) },
      fn(text) { on_event(Message(text)) },
      fn(code, reason) { on_event(Close(code, reason)) },
      fn(err) { on_event(Error(err)) },
    )
  WebSocketConnection(raw)
}

@external(javascript, "./websocket.ffi.mjs", "send")
fn ffi_send(conn: Dynamic, text: String) -> Bool

/// Transmits a text frame across the connection. Returns `Ok(Nil)` if sent,
/// or `Error(Nil)` if the socket is not currently in an open state.
pub fn send(conn: WebSocketConnection, text: String) -> Result(Nil, Nil) {
  case ffi_send(conn.raw, text) {
    True -> Ok(Nil)
    False -> error_nil()
  }
}

@external(javascript, "./websocket.ffi.mjs", "close")
fn ffi_close(conn: Dynamic, code: Int, reason: String) -> Nil

/// Gracefully closes the connection with a status code and human-readable reason.
pub fn close(conn: WebSocketConnection, code: Int, reason: String) -> Nil {
  ffi_close(conn.raw, code, reason)
}

@external(javascript, "./websocket.ffi.mjs", "make_fake")
fn ffi_make_fake(
  on_send: fn(String) -> Bool,
  on_close: fn(Int, String) -> Nil,
) -> Dynamic

/// Creates an in-memory fake WebSocket connection for isolated unit testing.
pub fn fake(
  on_send: fn(String) -> Result(Nil, Nil),
  on_close: fn(Int, String) -> Nil,
) -> WebSocketConnection {
  let raw =
    ffi_make_fake(
      fn(text) {
        case on_send(text) {
          Ok(Nil) -> True
          _ -> False
        }
      },
      on_close,
    )
  WebSocketConnection(raw)
}
