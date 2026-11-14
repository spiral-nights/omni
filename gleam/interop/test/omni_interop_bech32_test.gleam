import gleam/dynamic
import gleam/dynamic/decode
import gleam/result
import gleam/string
import omni/interop/bech32

pub fn bech32_roundtrip_test() {
  let hex = "0000000000000000000000000000000000000000000000000000000000000000"
  let assert Ok(npub) = bech32.hex_to_npub(hex)
  let assert Ok(got_hex1) = bech32.npub_to_hex(npub)
  assert got_hex1 == hex

  let assert Ok(nsec) = bech32.hex_to_nsec(hex)
  let assert Ok(got_hex2) = bech32.nsec_to_hex(nsec)
  assert got_hex2 == hex
}

pub fn decode_entity_npub_test() {
  let hex = "3bf0c63fcb93463407af97b5e0907075017e2840ceb62394982a928704099711"
  let assert Ok(npub) = bech32.hex_to_npub(hex)
  let entity = bech32.decode_nostr_entity(npub)
  let assert Ok("npub") = decode.run(entity, decode.at(["type"], decode.string))
  let assert Ok(parsed_hex) =
    decode.run(entity, decode.at(["hex"], decode.string))
  assert parsed_hex == hex
}

pub fn bech32_invalid_inputs_test() {
  let hex = "3bf0c63fcb93463407af97b5e0907075017e2840ceb62394982a928704099711"

  // Malformed npub
  assert bech32.npub_to_hex("bad_npub") |> result.is_error()

  // Malformed nsec
  assert bech32.nsec_to_hex("bad_nsec") |> result.is_error()

  // Cross-HRP rejection (strict HRP matching)
  let assert Ok(valid_npub) = bech32.hex_to_npub(hex)
  let assert Ok(valid_nsec) = bech32.hex_to_nsec(hex)
  assert bech32.npub_to_hex(valid_nsec) |> result.is_error()
  assert bech32.nsec_to_hex(valid_npub) |> result.is_error()
  assert bech32.npub_to_hex(valid_nsec)
    == Error("Invalid npub string: unexpected HRP")
  assert bech32.nsec_to_hex(valid_npub)
    == Error("Invalid nsec string: unexpected HRP")

  // Malformed bech32 string
  assert bech32.from_bech32("invalid1bech32") |> result.is_error()

  // Malformed hex to bech32 (invalid hex characters)
  assert bech32.to_bech32("npub", "not_a_hex_string!") |> result.is_error()

  // Malformed encode_naddr (invalid pubkey) returns Error without panicking
  let invalid_naddr =
    dynamic.properties([
      #(dynamic.string("identifier"), dynamic.string("test")),
      #(dynamic.string("pubkey"), dynamic.string("invalid_pubkey_hex")),
      #(dynamic.string("kind"), dynamic.int(30_023)),
    ])
  assert bech32.encode_naddr(invalid_naddr) |> result.is_error()

  // Valid encode_naddr returns Ok
  let valid_naddr =
    dynamic.properties([
      #(dynamic.string("identifier"), dynamic.string("test-post")),
      #(dynamic.string("pubkey"), dynamic.string(hex)),
      #(dynamic.string("kind"), dynamic.int(30_023)),
    ])
  let assert Ok(encoded) = bech32.encode_naddr(valid_naddr)
  assert string.starts_with(encoded, "naddr1")
}
