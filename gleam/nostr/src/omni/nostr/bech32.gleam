//// Pure Gleam implementation of Bech32 (BIP-173) and Bech32m (BIP-350).
//// Zero FFI.

import gleam/bit_array
import gleam/int
import gleam/list
import gleam/result
import gleam/string

/// Bech32 checksum encoding variant.
pub type Encoding {
  Bech32
  Bech32m
}

/// Errors that can occur during Bech32 encoding or decoding.
pub type Bech32Error {
  InvalidLength
  InvalidCharacter(String)
  MixedCase
  MissingHrp
  InvalidHrp
  InvalidChecksum
  InvalidWord(Int)
  BitConversionFailed
}

const bech32_const = 1

const bech32m_const = 734_539_939

/// Compute the Bech32 polymod checksum over a list of 5-bit integers.
pub fn polymod(values: List(Int)) -> Int {
  list.fold(values, 1, fn(chk, val) {
    let top = int.bitwise_shift_right(chk, 25)
    let chk0 =
      int.bitwise_exclusive_or(
        int.bitwise_shift_left(int.bitwise_and(chk, 0x1ffffff), 5),
        val,
      )
    let chk1 = case int.bitwise_and(int.bitwise_shift_right(top, 0), 1) != 0 {
      True -> int.bitwise_exclusive_or(chk0, 0x3b6a57b2)
      False -> chk0
    }
    let chk2 = case int.bitwise_and(int.bitwise_shift_right(top, 1), 1) != 0 {
      True -> int.bitwise_exclusive_or(chk1, 0x26508e6d)
      False -> chk1
    }
    let chk3 = case int.bitwise_and(int.bitwise_shift_right(top, 2), 1) != 0 {
      True -> int.bitwise_exclusive_or(chk2, 0x1ea119fa)
      False -> chk2
    }
    let chk4 = case int.bitwise_and(int.bitwise_shift_right(top, 3), 1) != 0 {
      True -> int.bitwise_exclusive_or(chk3, 0x3d4233dd)
      False -> chk3
    }
    case int.bitwise_and(int.bitwise_shift_right(top, 4), 1) != 0 {
      True -> int.bitwise_exclusive_or(chk4, 0x2a1462b3)
      False -> chk4
    }
  })
}

/// Expand the human-readable part (HRP) into 5-bit values for checksum computation.
pub fn expand_hrp(hrp: String) -> List(Int) {
  let chars = string.to_utf_codepoints(hrp)
  let high =
    list.map(chars, fn(cp) {
      let code = string.utf_codepoint_to_int(cp)
      int.bitwise_shift_right(code, 5)
    })
  let low =
    list.map(chars, fn(cp) {
      let code = string.utf_codepoint_to_int(cp)
      int.bitwise_and(code, 31)
    })
  list.flatten([high, [0], low])
}

/// Convert a list of integers from one bit width to another (e.g. 8-bit bytes to 5-bit words).
pub fn convert_bits(
  data: List(Int),
  from_bits: Int,
  to_bits: Int,
  pad: Bool,
) -> Result(List(Int), Nil) {
  let maxv = int.bitwise_shift_left(1, to_bits) - 1
  do_convert_bits(data, from_bits, to_bits, pad, maxv, 0, 0, [])
}

fn do_convert_bits(
  data: List(Int),
  from_bits: Int,
  to_bits: Int,
  pad: Bool,
  maxv: Int,
  acc: Int,
  bits: Int,
  out: List(Int),
) -> Result(List(Int), Nil) {
  case data {
    [val, ..rest] -> {
      case val < 0 || int.bitwise_shift_right(val, from_bits) != 0 {
        True -> Error(Nil)
        False -> {
          let new_acc =
            int.bitwise_or(int.bitwise_shift_left(acc, from_bits), val)
          let new_bits = bits + from_bits
          let #(final_acc, final_bits, new_out) =
            drain_bits(new_acc, new_bits, to_bits, maxv, out)
          do_convert_bits(
            rest,
            from_bits,
            to_bits,
            pad,
            maxv,
            final_acc,
            final_bits,
            new_out,
          )
        }
      }
    }
    [] -> {
      case pad {
        True -> {
          case bits > 0 {
            True -> {
              let padded =
                int.bitwise_and(
                  int.bitwise_shift_left(acc, to_bits - bits),
                  maxv,
                )
              Ok(list.reverse([padded, ..out]))
            }
            False -> Ok(list.reverse(out))
          }
        }
        False -> {
          case
            bits >= from_bits
            || int.bitwise_and(
              int.bitwise_shift_left(acc, to_bits - bits),
              maxv,
            )
            != 0
          {
            True -> Error(Nil)
            False -> Ok(list.reverse(out))
          }
        }
      }
    }
  }
}

fn drain_bits(
  acc: Int,
  bits: Int,
  to_bits: Int,
  maxv: Int,
  out: List(Int),
) -> #(Int, Int, List(Int)) {
  case bits >= to_bits {
    True -> {
      let remaining_bits = bits - to_bits
      let chunk =
        int.bitwise_and(int.bitwise_shift_right(acc, remaining_bits), maxv)
      let masked_acc =
        int.bitwise_and(acc, int.bitwise_shift_left(1, remaining_bits) - 1)
      drain_bits(masked_acc, remaining_bits, to_bits, maxv, [chunk, ..out])
    }
    False -> #(acc, bits, out)
  }
}

/// Convert a 5-bit word (0..31) to its corresponding Bech32 character.
pub fn word_to_char(word: Int) -> Result(String, Bech32Error) {
  case word {
    0 -> Ok("q")
    1 -> Ok("p")
    2 -> Ok("z")
    3 -> Ok("r")
    4 -> Ok("y")
    5 -> Ok("9")
    6 -> Ok("x")
    7 -> Ok("8")
    8 -> Ok("g")
    9 -> Ok("f")
    10 -> Ok("2")
    11 -> Ok("t")
    12 -> Ok("v")
    13 -> Ok("d")
    14 -> Ok("w")
    15 -> Ok("0")
    16 -> Ok("s")
    17 -> Ok("3")
    18 -> Ok("j")
    19 -> Ok("n")
    20 -> Ok("5")
    21 -> Ok("4")
    22 -> Ok("k")
    23 -> Ok("h")
    24 -> Ok("c")
    25 -> Ok("e")
    26 -> Ok("6")
    27 -> Ok("m")
    28 -> Ok("u")
    29 -> Ok("a")
    30 -> Ok("7")
    31 -> Ok("l")
    invalid -> Error(InvalidWord(invalid))
  }
}

/// Convert a Bech32 character to its 5-bit word value (0..31).
pub fn char_to_word(ch: String) -> Result(Int, Bech32Error) {
  case ch {
    "q" -> Ok(0)
    "p" -> Ok(1)
    "z" -> Ok(2)
    "r" -> Ok(3)
    "y" -> Ok(4)
    "9" -> Ok(5)
    "x" -> Ok(6)
    "8" -> Ok(7)
    "g" -> Ok(8)
    "f" -> Ok(9)
    "2" -> Ok(10)
    "t" -> Ok(11)
    "v" -> Ok(12)
    "d" -> Ok(13)
    "w" -> Ok(14)
    "0" -> Ok(15)
    "s" -> Ok(16)
    "3" -> Ok(17)
    "j" -> Ok(18)
    "n" -> Ok(19)
    "5" -> Ok(20)
    "4" -> Ok(21)
    "k" -> Ok(22)
    "h" -> Ok(23)
    "c" -> Ok(24)
    "e" -> Ok(25)
    "6" -> Ok(26)
    "m" -> Ok(27)
    "u" -> Ok(28)
    "a" -> Ok(29)
    "7" -> Ok(30)
    "l" -> Ok(31)
    invalid -> Error(InvalidCharacter(invalid))
  }
}

/// Encode 5-bit words with an HRP into a Bech32 or Bech32m string.
pub fn encode(
  hrp: String,
  data: List(Int),
  encoding: Encoding,
) -> Result(String, Bech32Error) {
  let clean_hrp = string.lowercase(string.trim(hrp))
  case string.length(clean_hrp) < 1 {
    True -> Error(InvalidHrp)
    False -> {
      use _ <- result.try(validate_hrp(clean_hrp))
      let const_val = case encoding {
        Bech32 -> bech32_const
        Bech32m -> bech32m_const
      }
      let values =
        list.flatten([expand_hrp(clean_hrp), data, [0, 0, 0, 0, 0, 0]])
      let mod = polymod(values)
      let chk = int.bitwise_exclusive_or(mod, const_val)
      let checksum_words =
        list.map([5, 4, 3, 2, 1, 0], fn(i) {
          int.bitwise_and(int.bitwise_shift_right(chk, 5 * i), 31)
        })
      let all_words = list.append(data, checksum_words)
      use chars <- result.try(list.try_map(all_words, word_to_char))
      Ok(clean_hrp <> "1" <> string.join(chars, ""))
    }
  }
}

fn validate_hrp(hrp: String) -> Result(Nil, Bech32Error) {
  let valid =
    string.to_utf_codepoints(hrp)
    |> list.all(fn(cp) {
      let code = string.utf_codepoint_to_int(cp)
      code >= 33 && code <= 126
    })
  case valid {
    True -> Ok(Nil)
    False -> Error(InvalidHrp)
  }
}

/// Decode a Bech32 or Bech32m string into its HRP, 5-bit data words, and encoding variant.
pub fn decode(
  str: String,
) -> Result(#(String, List(Int), Encoding), Bech32Error) {
  let trimmed = string.trim(str)
  let len = string.length(trimmed)
  case len < 8 || len > 5000 {
    True -> Error(InvalidLength)
    False -> {
      use _ <- result.try(check_casing(trimmed))
      let lower = string.lowercase(trimmed)
      use #(hrp, data_part) <- result.try(find_last_separator(lower))
      use _ <- result.try(validate_hrp(hrp))
      let char_list = string.split(data_part, "")
      use all_words <- result.try(list.try_map(char_list, char_to_word))
      case list.length(all_words) < 6 {
        True -> Error(InvalidLength)
        False -> {
          let chk = polymod(list.flatten([expand_hrp(hrp), all_words]))
          use encoding <- result.try(case chk {
            c if c == bech32_const -> Ok(Bech32)
            c if c == bech32m_const -> Ok(Bech32m)
            _ -> Error(InvalidChecksum)
          })
          let payload_words = list.take(all_words, list.length(all_words) - 6)
          Ok(#(hrp, payload_words, encoding))
        }
      }
    }
  }
}

fn check_casing(str: String) -> Result(Nil, Bech32Error) {
  let lower = string.lowercase(str)
  let upper = string.uppercase(str)
  case str != lower && str != upper {
    True -> Error(MixedCase)
    False -> Ok(Nil)
  }
}

fn find_last_separator(s: String) -> Result(#(String, String), Bech32Error) {
  case list.reverse(string.split(s, on: "1")) {
    [data_part, first_hrp_part, ..rest_hrp_parts] -> {
      let hrp =
        list.reverse([first_hrp_part, ..rest_hrp_parts])
        |> string.join(with: "1")
      case string.length(hrp) >= 1 && string.length(data_part) >= 6 {
        True -> Ok(#(hrp, data_part))
        False -> Error(InvalidLength)
      }
    }
    _ -> Error(MissingHrp)
  }
}

/// Convert 8-bit bytes to 5-bit words.
pub fn bytes_to_words(bytes: List(Int)) -> Result(List(Int), Bech32Error) {
  case convert_bits(bytes, 8, 5, True) {
    Ok(words) -> Ok(words)
    Error(Nil) -> Error(BitConversionFailed)
  }
}

/// Convert 5-bit words to 8-bit bytes.
pub fn words_to_bytes(words: List(Int)) -> Result(List(Int), Bech32Error) {
  case convert_bits(words, 5, 8, False) {
    Ok(bytes) -> Ok(bytes)
    Error(Nil) -> Error(BitConversionFailed)
  }
}

/// Encode 8-bit bytes into a Bech32 or Bech32m string.
pub fn encode_bytes(
  hrp: String,
  bytes: List(Int),
  encoding: Encoding,
) -> Result(String, Bech32Error) {
  use words <- result.try(bytes_to_words(bytes))
  encode(hrp, words, encoding)
}

/// Decode a Bech32 or Bech32m string into its HRP, 8-bit bytes, and encoding variant.
pub fn decode_bytes(
  str: String,
) -> Result(#(String, List(Int), Encoding), Bech32Error) {
  use #(hrp, words, encoding) <- result.try(decode(str))
  use bytes <- result.try(words_to_bytes(words))
  Ok(#(hrp, bytes, encoding))
}

/// Convert a `BitArray` to a `List(Int)` of byte values.
pub fn bit_array_to_bytes(bits: BitArray) -> List(Int) {
  do_bit_array_to_bytes(bits, [])
}

fn do_bit_array_to_bytes(bits: BitArray, acc: List(Int)) -> List(Int) {
  case bits {
    <<b:int-size(8), rest:bits>> -> do_bit_array_to_bytes(rest, [b, ..acc])
    _ -> list.reverse(acc)
  }
}

/// Convert a `List(Int)` of byte values to a `BitArray`.
pub fn bytes_to_bit_array(bytes: List(Int)) -> BitArray {
  do_bytes_to_bit_array(bytes, <<>>)
}

fn do_bytes_to_bit_array(bytes: List(Int), acc: BitArray) -> BitArray {
  case bytes {
    [b, ..rest] -> do_bytes_to_bit_array(rest, <<acc:bits, b:int-size(8)>>)
    [] -> acc
  }
}

/// Helper: encode a hex string to standard Bech32 with the given HRP.
pub fn to_bech32(hrp: String, hex: String) -> Result(String, Bech32Error) {
  case bit_array.base16_decode(string.lowercase(string.trim(hex))) {
    Ok(bits) -> encode_bytes(hrp, bit_array_to_bytes(bits), Bech32)
    Error(Nil) -> Error(BitConversionFailed)
  }
}

/// Helper: decode a standard Bech32 string to its HRP and lowercase hex string.
pub fn from_bech32(str: String) -> Result(#(String, String), Bech32Error) {
  use #(hrp, bytes, _encoding) <- result.try(decode_bytes(str))
  let hex = string.lowercase(bit_array.base16_encode(bytes_to_bit_array(bytes)))
  Ok(#(hrp, hex))
}
