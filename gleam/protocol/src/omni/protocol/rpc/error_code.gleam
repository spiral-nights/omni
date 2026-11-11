//// JSON-RPC 2.0 and Omni application-specific error codes.
////
//// Adheres to the JSON-RPC 2.0 specification for standard protocol errors
//// (-32700 to -32600) and defines structured application error codes
//// (-32001 to -32005) for capability permissions, signing, and rate limiting.

import gleam/dynamic/decode
import gleam/json

/// JSON-RPC 2.0 standard and Omni-specific error codes.
pub type ErrorCode {
  /// Invalid JSON was received by the server (-32700).
  ParseError
  /// The JSON sent is not a valid Request object (-32600).
  InvalidRequest
  /// The method does not exist / is not available (-32601).
  MethodNotFound
  /// Invalid method parameter(s) (-32602).
  InvalidParams
  /// Internal JSON-RPC error (-32603).
  InternalError
  /// Plugin requested a capability or action that was denied by policy (-32001).
  PermissionDenied
  /// Intent action could not be resolved to an active handler (-32002).
  IntentUnresolved
  /// User or keystore rejected a signature or cryptographic operation (-32003).
  SignerRejected
  /// Request rate limit exceeded for this plugin (-32004).
  RateLimitExceeded
  /// Storage or memory quota exceeded for this plugin (-32005).
  QuotaExceeded
  /// Custom integer error code outside the standard set.
  Custom(Int)
}

/// Convert an `ErrorCode` to its standard integer representation.
pub fn to_int(code: ErrorCode) -> Int {
  case code {
    ParseError -> -32_700
    InvalidRequest -> -32_600
    MethodNotFound -> -32_601
    InvalidParams -> -32_602
    InternalError -> -32_603
    PermissionDenied -> -32_001
    IntentUnresolved -> -32_002
    SignerRejected -> -32_003
    RateLimitExceeded -> -32_004
    QuotaExceeded -> -32_005
    Custom(n) -> n
  }
}

/// Map an integer code back to an `ErrorCode` ADT variant.
pub fn from_int(n: Int) -> ErrorCode {
  case n {
    -32_700 -> ParseError
    -32_600 -> InvalidRequest
    -32_601 -> MethodNotFound
    -32_602 -> InvalidParams
    -32_603 -> InternalError
    -32_001 -> PermissionDenied
    -32_002 -> IntentUnresolved
    -32_003 -> SignerRejected
    -32_004 -> RateLimitExceeded
    -32_005 -> QuotaExceeded
    other -> Custom(other)
  }
}

/// Standard canonical error message for an `ErrorCode`.
pub fn default_message(code: ErrorCode) -> String {
  case code {
    ParseError -> "Parse error"
    InvalidRequest -> "Invalid Request"
    MethodNotFound -> "Method not found"
    InvalidParams -> "Invalid params"
    InternalError -> "Internal error"
    PermissionDenied -> "Permission denied"
    IntentUnresolved -> "Intent unresolved"
    SignerRejected -> "Signer rejected"
    RateLimitExceeded -> "Rate limit exceeded"
    QuotaExceeded -> "Quota exceeded"
    Custom(_) -> "Custom error"
  }
}

/// Convert an `ErrorCode` to a `gleam/json.Json` integer.
pub fn to_json(code: ErrorCode) -> json.Json {
  json.int(to_int(code))
}

/// Dynamic decoder for an `ErrorCode`.
pub fn decoder() -> decode.Decoder(ErrorCode) {
  decode.map(decode.int, from_int)
}
