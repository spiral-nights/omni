import gleam/bit_array
import omni/nostr/pubkey

pub fn parse_valid_hex_test() {
  let hex = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let assert Ok(pk) = pubkey.parse(hex)
  assert pubkey.to_hex(pk) == hex
  assert pubkey.to_string(pk) == hex
}

pub fn parse_uppercase_and_whitespace_test() {
  let lower = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let upper =
    "  3BF0C63FCB93463407AF97A5E5EE64FA883D107EF9E558472C4EB9AAAEFA459D  \n"
  let assert Ok(pk) = pubkey.parse(upper)
  assert pubkey.to_hex(pk) == lower
}

pub fn reject_invalid_length_test() {
  assert pubkey.parse("3bf0c63f") == Error(Nil)
  assert pubkey.parse("00" |> fn(s) { s <> s <> s }) == Error(Nil)
}

pub fn reject_non_hex_test() {
  let invalid =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459z"
  assert pubkey.parse(invalid) == Error(Nil)
}

pub fn bytes_round_trip_test() {
  let hex = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let assert Ok(pk) = pubkey.parse(hex)
  let bytes = pubkey.to_bytes(pk)
  assert bit_array.byte_size(bytes) == 32
  let assert Ok(reconstructed) = pubkey.from_bytes(bytes)
  assert pubkey.to_hex(reconstructed) == hex
}

pub fn from_bytes_rejects_wrong_size_test() {
  assert pubkey.from_bytes(<<0:size(16)>>) == Error(Nil)
  assert pubkey.from_bytes(<<0:size(264)>>) == Error(Nil)
}
