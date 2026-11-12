//// HTTP fetch port for the host (FFI-quarantined).

import gleam/javascript/promise.{type Promise}

/// Fetch a URL as text. Used for nsite bundle installation and Blossom blobs.
@external(javascript, "./http.ffi.mjs", "fetch_text")
pub fn fetch_text(url: String) -> Promise(Result(String, String))

/// Fetch a URL as raw bytes.
@external(javascript, "./http.ffi.mjs", "fetch_bytes")
pub fn fetch_bytes(url: String) -> Promise(Result(BitArray, String))

/// PUT raw bytes to `url` with `headers`, returning the HTTP status.
@external(javascript, "./http.ffi.mjs", "put_bytes")
pub fn put_bytes(
  url: String,
  body: BitArray,
  headers: List(#(String, String)),
) -> Promise(Result(Int, String))
