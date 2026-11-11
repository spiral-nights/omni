import gleam/dynamic/decode
import gleam/json
import gleam/option.{None, Some}
import gleam/result
import omni/platform/json as platform_json
import omni/protocol/rpc/envelope.{Error, IntId, Notification, StringId, Success}
import omni/protocol/rpc/error_code.{PermissionDenied}

pub fn id_variants_test() {
  let int_id = IntId(42)
  assert envelope.id_to_string(int_id) == "42"
  let int_json = envelope.id_to_json(int_id) |> json.to_string
  assert int_json == "42"

  let str_id = StringId("req_abc")
  assert envelope.id_to_string(str_id) == "req_abc"
  let str_json = envelope.id_to_json(str_id) |> json.to_string
  assert str_json == "\"req_abc\""

  let assert Ok(decoded_int) = json.parse("42", envelope.id_decoder())
  assert decoded_int == int_id

  let assert Ok(decoded_str) = json.parse("\"req_abc\"", envelope.id_decoder())
  assert decoded_str == str_id
}

pub fn success_response_roundtrip_test() {
  let assert Ok(result_dyn) =
    platform_json.parse_dynamic("{\"user\":\"alice\",\"count\":10}")
  let res = Success(id: IntId(1), result: result_dyn)
  let encoded = envelope.encode_response(res)

  let assert Ok(decoded) = envelope.decode_response(encoded)
  case decoded {
    Success(id, res_dyn) -> {
      assert id == IntId(1)
      let assert Ok(user) =
        decode.run(res_dyn, {
          use u <- decode.field("user", decode.string)
          decode.success(u)
        })
      assert user == "alice"
    }
    Error(..) -> panic as "Expected Success"
  }
}

pub fn success_response_string_id_test() {
  let assert Ok(result_dyn) = platform_json.parse_dynamic("[1, 2, 3]")
  let res = Success(id: StringId("sub-456"), result: result_dyn)
  let encoded = envelope.encode_response(res)

  let assert Ok(decoded) = envelope.decode_response(encoded)
  case decoded {
    Success(id, res_dyn) -> {
      assert id == StringId("sub-456")
      let assert Ok(list_val) = decode.run(res_dyn, decode.list(decode.int))
      assert list_val == [1, 2, 3]
    }
    Error(..) -> panic as "Expected Success"
  }
}

pub fn error_response_with_data_test() {
  let assert Ok(data_dyn) =
    platform_json.parse_dynamic("{\"reason\":\"policy\",\"kind\":4}")
  let res =
    Error(
      id: Some(IntId(7)),
      code: PermissionDenied,
      message: "Denied access to Kind 4",
      data: Some(data_dyn),
    )
  let encoded = envelope.encode_response(res)

  let assert Ok(decoded) = envelope.decode_response(encoded)
  case decoded {
    Error(id, code, message, data) -> {
      assert id == Some(IntId(7))
      assert code == PermissionDenied
      assert message == "Denied access to Kind 4"
      case data {
        Some(d) -> {
          let assert Ok(reason) =
            decode.run(d, {
              use r <- decode.field("reason", decode.string)
              decode.success(r)
            })
          assert reason == "policy"
        }
        None -> panic as "Expected Some(data)"
      }
    }
    Success(..) -> panic as "Expected Error"
  }
}

pub fn error_response_null_id_test() {
  let res =
    Error(
      id: None,
      code: error_code.ParseError,
      message: "Parse error",
      data: None,
    )
  let encoded = envelope.encode_response(res)
  assert encoded
    == "{\"jsonrpc\":\"2.0\",\"id\":null,\"error\":{\"code\":-32700,\"message\":\"Parse error\"}}"

  let assert Ok(decoded) = envelope.decode_response(encoded)
  case decoded {
    Error(id, code, message, data) -> {
      assert id == None
      assert code == error_code.ParseError
      assert message == "Parse error"
      assert data == None
    }
    Success(..) -> panic as "Expected Error"
  }
}

pub fn notification_roundtrip_test() {
  let assert Ok(params_dyn) =
    platform_json.parse_dynamic("{\"action\":\"publish\",\"id\":\"note-1\"}")
  let n = Notification(method: "intent.invoke", params: Some(params_dyn))
  let encoded = envelope.encode_notification(n)

  let assert Ok(decoded) = envelope.decode_notification(encoded)
  assert decoded.method == "intent.invoke"
  case decoded.params {
    Some(p) -> {
      let assert Ok(action) =
        decode.run(p, {
          use a <- decode.field("action", decode.string)
          decode.success(a)
        })
      assert action == "publish"
    }
    None -> panic as "Expected params"
  }

  // Notification without params
  let n2 = Notification(method: "auth.logout", params: None)
  let encoded2 = envelope.encode_notification(n2)
  let assert Ok(decoded2) = envelope.decode_notification(encoded2)
  assert decoded2.method == "auth.logout"
  assert decoded2.params == None
}

pub fn response_rejects_invalid_jsonrpc_test() {
  let bad_json = "{\"jsonrpc\":\"1.0\",\"id\":1,\"result\":true}"
  assert result.is_error(envelope.decode_response(bad_json))

  let missing_jsonrpc = "{\"id\":1,\"result\":true}"
  assert result.is_error(envelope.decode_response(missing_jsonrpc))
}
