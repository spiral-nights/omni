import gleam/bit_array
import omni/nostr/event_id

pub fn parse_valid_hex_test() {
  let hex = "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770"
  let assert Ok(id) = event_id.parse(hex)
  assert event_id.to_hex(id) == hex
  assert event_id.to_string(id) == hex
}

pub fn parse_uppercase_and_whitespace_test() {
  let lower = "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770"
  let upper =
    "  A2A0A221516E86AD09AD15BF73D6FE8E329EBC43F848CAEC0A383D46A815A770  \r\n"
  let assert Ok(id) = event_id.parse(upper)
  assert event_id.to_hex(id) == lower
}

pub fn reject_invalid_length_test() {
  assert event_id.parse("a2a0a221") == Error(Nil)
}

pub fn reject_non_hex_test() {
  let invalid =
    "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a77g"
  assert event_id.parse(invalid) == Error(Nil)
}

pub fn bytes_round_trip_test() {
  let hex = "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770"
  let assert Ok(id) = event_id.parse(hex)
  let bytes = event_id.to_bytes(id)
  assert bit_array.byte_size(bytes) == 32
  let assert Ok(reconstructed) = event_id.from_bytes(bytes)
  assert event_id.to_hex(reconstructed) == hex
}
