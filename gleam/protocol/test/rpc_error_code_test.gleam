import gleam/json
import gleam/list
import omni/protocol/rpc/error_code.{
  Custom, InternalError, InvalidParams, InvalidRequest, MethodNotFound,
  ParseError, PermissionDenied, QuotaExceeded, RateLimitExceeded, SignerRejected,
}
import qcheck

const all_standard_codes = [
  #(ParseError, -32_700, "Parse error"),
  #(InvalidRequest, -32_600, "Invalid Request"),
  #(MethodNotFound, -32_601, "Method not found"),
  #(InvalidParams, -32_602, "Invalid params"),
  #(InternalError, -32_603, "Internal error"),
  #(PermissionDenied, -32_001, "Permission denied"),
  #(error_code.IntentUnresolved, -32_002, "Intent unresolved"),
  #(SignerRejected, -32_003, "Signer rejected"),
  #(RateLimitExceeded, -32_004, "Rate limit exceeded"),
  #(QuotaExceeded, -32_005, "Quota exceeded"),
]

pub fn error_code_to_int_and_from_int_test() {
  list.each(all_standard_codes, fn(entry) {
    let #(code, expected_int, expected_msg) = entry
    assert error_code.to_int(code) == expected_int
    assert error_code.from_int(expected_int) == code
    assert error_code.default_message(code) == expected_msg
  })

  // Custom codes
  assert error_code.to_int(Custom(999)) == 999
  assert error_code.from_int(999) == Custom(999)
  assert error_code.default_message(Custom(999)) == "Custom error"
}

pub fn error_code_codec_test() {
  list.each(all_standard_codes, fn(entry) {
    let #(code, expected_int, _) = entry
    let json_val = error_code.to_json(code)
    let json_str = json.to_string(json_val)

    let assert Ok(decoded) = json.parse(json_str, error_code.decoder())
    assert decoded == code
    assert error_code.to_int(decoded) == expected_int
  })
}

pub fn error_code_roundtrip_property_test() {
  qcheck.run(
    qcheck.default_config(),
    qcheck.bounded_int(-50_000, 50_000),
    fn(n) {
      let code = error_code.from_int(n)
      assert error_code.to_int(code) == n
    },
  )
}
