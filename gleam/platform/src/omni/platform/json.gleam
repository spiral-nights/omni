//// JSON parsing, serialization, and bridging between `gleam_json` and native JS objects.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/option.{type Option}

/// Opaque JSON AST type re-exported from `gleam_json`.
pub type Json =
  json.Json

/// JSON error categories covering syntax, serialization, and schema decoding failures.
pub type JsonError {
  SyntaxError(String)
  SerializationError(String)
  DecodeError(List(decode.DecodeError))
}

@external(javascript, "./json.ffi.mjs", "raw_parse")
fn ffi_raw_parse(
  str: String,
  on_ok: fn(Dynamic) -> Result(Dynamic, JsonError),
  on_err: fn(String) -> Result(Dynamic, JsonError),
) -> Result(Dynamic, JsonError)

@external(javascript, "./json.ffi.mjs", "raw_stringify")
fn ffi_raw_stringify(
  val: Dynamic,
  indent: Int,
  on_ok: fn(String) -> Result(String, JsonError),
  on_err: fn(String) -> Result(String, JsonError),
) -> Result(String, JsonError)

/// Parses a JSON string directly into a raw `Dynamic` value via native `JSON.parse`.
pub fn parse_dynamic(json_string: String) -> Result(Dynamic, JsonError) {
  ffi_raw_parse(json_string, fn(val) { Ok(val) }, fn(err) {
    Error(SyntaxError(err))
  })
}

/// Parses a JSON string and decodes it using the provided `decode.Decoder`.
pub fn parse(
  json_string: String,
  decoder: decode.Decoder(t),
) -> Result(t, JsonError) {
  case json.parse(json_string, decoder) {
    Ok(val) -> Ok(val)
    Error(json.UnexpectedEndOfInput) ->
      Error(SyntaxError("Unexpected end of input"))
    Error(json.UnexpectedByte(b)) ->
      Error(SyntaxError("Unexpected byte: " <> b))
    Error(json.UnexpectedSequence(s)) ->
      Error(SyntaxError("Unexpected sequence: " <> s))
    Error(json.UnableToDecode(errors)) -> Error(DecodeError(errors))
  }
}

/// Decodes an existing `Dynamic` value using the provided `decode.Decoder`.
pub fn decode_dynamic(
  data: Dynamic,
  decoder: decode.Decoder(t),
) -> Result(t, JsonError) {
  case decode.run(data, decoder) {
    Ok(val) -> Ok(val)
    Error(errors) -> Error(DecodeError(errors))
  }
}

/// Serializes any `Dynamic` value to a compact JSON string.
pub fn stringify(data: Dynamic) -> Result(String, JsonError) {
  ffi_raw_stringify(data, 0, fn(s) { Ok(s) }, fn(err) {
    Error(SerializationError(err))
  })
}

/// Serializes any `Dynamic` value to an indented (pretty-printed) JSON string.
pub fn stringify_pretty(
  data: Dynamic,
  indent: Int,
) -> Result(String, JsonError) {
  ffi_raw_stringify(data, indent, fn(s) { Ok(s) }, fn(err) {
    Error(SerializationError(err))
  })
}

/// Converts a typed `Json` AST into a JSON string. Bridge to `gleam/json.to_string`.
pub fn to_string(json_val: Json) -> String {
  json.to_string(json_val)
}

/// Builds a JSON object AST node. Bridge to `gleam/json.object`.
pub fn object(fields: List(#(String, Json))) -> Json {
  json.object(fields)
}

/// Builds a JSON string AST node. Bridge to `gleam/json.string`.
pub fn string(val: String) -> Json {
  json.string(val)
}

/// Builds a JSON integer AST node. Bridge to `gleam/json.int`.
pub fn int(val: Int) -> Json {
  json.int(val)
}

/// Builds a JSON float AST node. Bridge to `gleam/json.float`.
pub fn float(val: Float) -> Json {
  json.float(val)
}

/// Builds a JSON boolean AST node. Bridge to `gleam/json.bool`.
pub fn bool(val: Bool) -> Json {
  json.bool(val)
}

/// Builds a JSON null AST node. Bridge to `gleam/json.null`.
pub fn null() -> Json {
  json.null()
}

/// Builds a JSON array AST node from a list of elements. Bridge to `gleam/json.array`.
pub fn array(items: List(a), of: fn(a) -> Json) -> Json {
  json.array(items, of)
}

/// Builds an optional / nullable JSON AST node. Bridge to `gleam/json.nullable`.
pub fn nullable(val: Option(a), of: fn(a) -> Json) -> Json {
  json.nullable(val, of)
}
