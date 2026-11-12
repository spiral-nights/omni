//// Browser navigation port (FFI-quarantined).

/// Open `url` in a new browser tab or the current one.
@external(javascript, "./browser.ffi.mjs", "open_external")
pub fn open_external(url: String) -> Nil
