//// Structured console logging for boundaries that otherwise swallow errors.
////
//// Host-only; plugins never import the platform directly.

@external(javascript, "./log.ffi.mjs", "warn")
pub fn warn(context: String, message: String) -> Nil

@external(javascript, "./log.ffi.mjs", "error")
pub fn error(context: String, message: String) -> Nil

@external(javascript, "./log.ffi.mjs", "info")
pub fn info(context: String, message: String) -> Nil
