import gleam/dynamic/decode
import omni/interop/bech32

pub fn bech32_roundtrip_test() {
  let hex = "0000000000000000000000000000000000000000000000000000000000000000"
  let npub = bech32.hex_to_npub(hex)
  assert bech32.npub_to_hex(npub) == hex

  let nsec = bech32.hex_to_nsec(hex)
  assert bech32.nsec_to_hex(nsec) == hex
}

pub fn decode_entity_npub_test() {
  let hex = "3bf0c63fcb93463407af97b5e0907075017e2840ceb62394982a928704099711"
  let npub = bech32.hex_to_npub(hex)
  let entity = bech32.decode_nostr_entity(npub)
  let assert Ok("npub") = decode.run(entity, decode.at(["type"], decode.string))
  let assert Ok(parsed_hex) =
    decode.run(entity, decode.at(["hex"], decode.string))
  assert parsed_hex == hex
}
