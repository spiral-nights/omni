import gleam/bit_array
import omni/platform/webcrypto

pub fn random_bytes_size_test() {
  let bytes = webcrypto.random_bytes(32)
  assert bit_array.byte_size(bytes) == 32

  let zero = webcrypto.random_bytes(0)
  assert bit_array.byte_size(zero) == 0
}

pub fn random_bytes_distinct_test() {
  let a = webcrypto.random_bytes(16)
  let b = webcrypto.random_bytes(16)
  assert a != b
}

pub fn random_bytes_opaque_test() {
  let opaque_bytes = webcrypto.random_bytes_opaque(16)
  let raw = webcrypto.to_bit_array(opaque_bytes)
  assert bit_array.byte_size(raw) == 16
  assert webcrypto.to_bit_array(webcrypto.from_bit_array(raw)) == raw
}

pub fn sha256_hex_empty_string_test() {
  // Known SHA-256 hash of empty string
  let hash = webcrypto.sha256_hex("")
  assert hash
    == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}

pub fn sha256_hex_hello_test() {
  // Known SHA-256 hash of "hello"
  let hash = webcrypto.sha256_hex("hello")
  assert hash
    == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
}

pub fn sha256_bit_array_test() {
  let input = <<"hello":utf8>>
  let digest = webcrypto.sha256(input)
  assert bit_array.byte_size(digest) == 32
}
