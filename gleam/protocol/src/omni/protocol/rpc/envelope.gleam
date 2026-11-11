//// Standard JSON-RPC 2.0 envelopes (Response and Notification).
////
//// Adheres to the JSON-RPC 2.0 specification for request IDs, success responses,
//// error responses, and unilateral notifications emitted between host and sandboxes.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/option.{type Option, None, Some}
import omni/platform/json as platform_json
import omni/protocol/rpc/error_code.{type ErrorCode}

/// A JSON-RPC 2.0 request or response identifier (integer or string).
pub type Id {
  IntId(Int)
  StringId(String)
}

/// Convert an `Id` to its string representation.
pub fn id_to_string(id: Id) -> String {
  case id {
    IntId(i) -> int.to_string(i)
    StringId(s) -> s
  }
}

/// Convert an `Id` to a `gleam/json.Json` primitive.
pub fn id_to_json(id: Id) -> json.Json {
  case id {
    IntId(i) -> json.int(i)
    StringId(s) -> json.string(s)
  }
}

/// Dynamic decoder for a valid JSON-RPC `Id` (integer or string).
pub fn id_decoder() -> decode.Decoder(Id) {
  decode.one_of(decode.map(decode.int, IntId), [
    decode.map(decode.string, StringId),
  ])
}

/// A standard JSON-RPC 2.0 Response.
pub type Response {
  /// Successful response returning the matched request `id` and `result` payload.
  Success(id: Id, result: Dynamic)
  /// Error response with code, message, and optional extra structured details.
  /// If the request ID could not be determined, `id` is `None` (serialized as `null`).
  Error(id: Option(Id), code: ErrorCode, message: String, data: Option(Dynamic))
}

/// A standard JSON-RPC 2.0 Notification (unidirectional message without an `id`).
pub type Notification {
  Notification(method: String, params: Option(Dynamic))
}

fn serialize_dynamic(dyn: Dynamic) -> String {
  case platform_json.stringify(dyn) {
    Ok(s) -> s
    _ -> "null"
  }
}

fn id_to_json_string(id: Id) -> String {
  case id {
    IntId(i) -> int.to_string(i)
    StringId(s) -> json.string(s) |> json.to_string
  }
}

/// Serialize a `Response` to a canonical JSON-RPC 2.0 JSON string.
pub fn encode_response(response: Response) -> String {
  case response {
    Success(id, result) -> {
      let id_str = id_to_json_string(id)
      let res_str = serialize_dynamic(result)
      "{\"jsonrpc\":\"2.0\",\"id\":"
      <> id_str
      <> ",\"result\":"
      <> res_str
      <> "}"
    }
    Error(id, code, message, data) -> {
      let id_str = case id {
        Some(i) -> id_to_json_string(i)
        None -> "null"
      }
      let code_int = int.to_string(error_code.to_int(code))
      let msg_str = json.string(message) |> json.to_string
      let data_field = case data {
        Some(d) -> ",\"data\":" <> serialize_dynamic(d)
        None -> ""
      }
      "{\"jsonrpc\":\"2.0\",\"id\":"
      <> id_str
      <> ",\"error\":{\"code\":"
      <> code_int
      <> ",\"message\":"
      <> msg_str
      <> data_field
      <> "}}"
    }
  }
}

/// Alias for `encode_response`.
pub const response_to_string = encode_response

/// Serialize a `Notification` to a canonical JSON-RPC 2.0 JSON string.
pub fn encode_notification(notification: Notification) -> String {
  let method_str = json.string(notification.method) |> json.to_string
  let params_field = case notification.params {
    Some(p) -> ",\"params\":" <> serialize_dynamic(p)
    None -> ""
  }
  "{\"jsonrpc\":\"2.0\",\"method\":" <> method_str <> params_field <> "}"
}

/// Alias for `encode_notification`.
pub const notification_to_string = encode_notification

fn error_payload_decoder() -> decode.Decoder(
  #(ErrorCode, String, Option(Dynamic)),
) {
  use code <- decode.field("code", error_code.decoder())
  use message <- decode.field("message", decode.string)
  use data <- decode.optional_field(
    "data",
    None,
    decode.optional(decode.dynamic),
  )
  decode.success(#(code, message, data))
}

fn error_response_decoder() -> decode.Decoder(Response) {
  use err_obj <- decode.field("error", error_payload_decoder())
  use id <- decode.optional_field("id", None, decode.optional(id_decoder()))
  decode.success(Error(
    id: id,
    code: err_obj.0,
    message: err_obj.1,
    data: err_obj.2,
  ))
}

fn success_response_decoder() -> decode.Decoder(Response) {
  use id <- decode.field("id", id_decoder())
  use result <- decode.field("result", decode.dynamic)
  decode.success(Success(id: id, result: result))
}

/// Dynamic decoder for any JSON-RPC 2.0 `Response` (Success or Error).
pub fn response_decoder() -> decode.Decoder(Response) {
  use jsonrpc <- decode.field("jsonrpc", decode.string)
  case jsonrpc == "2.0" {
    False ->
      decode.failure(
        Error(
          id: None,
          code: error_code.InvalidRequest,
          message: "jsonrpc must be '2.0'",
          data: None,
        ),
        "jsonrpc == '2.0'",
      )
    True ->
      decode.one_of(error_response_decoder(), [success_response_decoder()])
  }
}

/// Decode a JSON-RPC 2.0 `Response` from a JSON string.
pub fn decode_response(
  json_string: String,
) -> Result(Response, json.DecodeError) {
  json.parse(json_string, response_decoder())
}

/// Dynamic decoder for a JSON-RPC 2.0 `Notification`.
pub fn notification_decoder() -> decode.Decoder(Notification) {
  use jsonrpc <- decode.field("jsonrpc", decode.string)
  case jsonrpc == "2.0" {
    False -> decode.failure(Notification("", None), "jsonrpc == '2.0'")
    True -> {
      use method <- decode.field("method", decode.string)
      use params <- decode.optional_field(
        "params",
        None,
        decode.optional(decode.dynamic),
      )
      decode.success(Notification(method: method, params: params))
    }
  }
}

/// Decode a JSON-RPC 2.0 `Notification` from a JSON string.
pub fn decode_notification(
  json_string: String,
) -> Result(Notification, json.DecodeError) {
  json.parse(json_string, notification_decoder())
}
