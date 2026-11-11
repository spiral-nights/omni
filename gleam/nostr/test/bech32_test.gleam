import gleam/list
import gleam/result
import omni/nostr/bech32.{Bech32, Bech32m}
import qcheck

pub fn bip173_valid_vectors_test() {
  let valid_bech32 = [
    "A12UEL5L",
    "a12uel5l",
    "an83characterlonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1tt5tgs",
    "abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw",
    "11qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqc8247j",
  ]

  list.each(valid_bech32, fn(vector) {
    let assert Ok(#(hrp, data, encoding)) = bech32.decode(vector)
    assert encoding == Bech32
    let assert Ok(reencoded) = bech32.encode(hrp, data, Bech32)
    let assert Ok(#(re_hrp, re_data, re_enc)) = bech32.decode(reencoded)
    assert re_hrp == hrp
    assert re_data == data
    assert re_enc == Bech32
  })
}

pub fn bip350_valid_vectors_test() {
  let valid_bech32m = [
    "A1LQFN3A",
    "a1lqfn3a",
    "an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6",
    "abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx",
    "11llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllludsr8",
    "?1v759aa",
  ]

  list.each(valid_bech32m, fn(vector) {
    let assert Ok(#(hrp, data, encoding)) = bech32.decode(vector)
    assert encoding == Bech32m
    let assert Ok(reencoded) = bech32.encode(hrp, data, Bech32m)
    let assert Ok(#(re_hrp, re_data, re_enc)) = bech32.decode(reencoded)
    assert re_hrp == hrp
    assert re_data == data
    assert re_enc == Bech32m
  })
}

pub fn invalid_strings_test() {
  // Missing HRP
  assert bech32.decode("pzry9x0s0muk") |> result.is_error
  // Empty HRP
  assert bech32.decode("1pzry9x0s0muk") |> result.is_error
  // Invalid data character 'b'
  assert bech32.decode("x1b4uxrh7jvm") |> result.is_error
  // Too short checksum
  assert bech32.decode("li1dgmt3") |> result.is_error
  // Mixed case
  assert bech32.decode("a12Uel5L") |> result.is_error
  // Invalid checksum
  assert bech32.decode("A1G7SGD8") |> result.is_error
}

pub fn hex_round_trip_test() {
  let hex = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let assert Ok(encoded) = bech32.to_bech32("npub", hex)
  assert encoded
    == "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6"

  let assert Ok(#(hrp, decoded_hex)) = bech32.from_bech32(encoded)
  assert hrp == "npub"
  assert decoded_hex == hex
}

pub fn bech32_property_round_trip_test() {
  let byte_gen = qcheck.bounded_int(0, 255)
  let bytes_gen = qcheck.list_from(byte_gen)

  qcheck.run(qcheck.default_config(), bytes_gen, fn(bytes) {
    let assert Ok(encoded_bech32) = bech32.encode_bytes("test", bytes, Bech32)
    let assert Ok(#(hrp1, decoded_bytes1, enc1)) =
      bech32.decode_bytes(encoded_bech32)
    assert hrp1 == "test"
    assert decoded_bytes1 == bytes
    assert enc1 == Bech32

    let assert Ok(encoded_bech32m) =
      bech32.encode_bytes("testm", bytes, Bech32m)
    let assert Ok(#(hrp2, decoded_bytes2, enc2)) =
      bech32.decode_bytes(encoded_bech32m)
    assert hrp2 == "testm"
    assert decoded_bytes2 == bytes
    assert enc2 == Bech32m
  })
}
