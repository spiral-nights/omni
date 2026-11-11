//// HTTP fetch port for the host (FFI-quarantined).

import gleam/javascript/promise.{type Promise}

/// Fetch a URL as text. Used for nsite bundle installation and Blossom blobs.
@external(javascript, "./http.ffi.mjs", "fetch_text")
pub fn fetch_text(url: String) -> Promise(Result(String, String))
