//// NIP-19 Bech32-encoded Nostr entities: npub, nsec, note, nprofile, nevent, and naddr.
//// Zero FFI.

import gleam/bit_array
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import omni/nostr/bech32
import omni/nostr/event_id.{type EventId}
import omni/nostr/kind.{type Kind}
import omni/nostr/pubkey.{type Pubkey}

/// Profile metadata for `nprofile` entities.
pub type ProfileData {
  ProfileData(pubkey: Pubkey, relays: List(String))
}

/// Event metadata for `nevent` entities.
pub type EventData {
  EventData(
    id: EventId,
    relays: List(String),
    author: Option(Pubkey),
    kind: Option(Kind),
  )
}

/// Address metadata for parameterized replaceable events (`naddr`).
pub type AddressData {
  AddressData(
    identifier: String,
    pubkey: Pubkey,
    kind: Kind,
    relays: List(String),
  )
}

/// A decoded NIP-19 entity.
pub type Nip19Entity {
  Npub(Pubkey)
  Nsec(String)
  Note(EventId)
  Nprofile(ProfileData)
  Nevent(EventData)
  Naddr(AddressData)
}

/// Errors that can occur during NIP-19 encoding or decoding.
pub type Nip19Error {
  InvalidPrefix(String)
  Bech32DecodeFailed(bech32.Bech32Error)
  InvalidLength(expected: Int, actual: Int)
  InvalidHex
  InvalidUtf8
  InvalidTlv
  MissingField(String)
}

type TlvEntry {
  TlvEntry(tag: Int, value: BitArray)
}

/// Encode any `Nip19Entity` into its canonical Bech32 string.
pub fn encode(entity: Nip19Entity) -> String {
  case entity {
    Npub(pk) -> encode_npub(pk)
    Nsec(hex) -> {
      let assert Ok(encoded) = encode_nsec(hex)
      encoded
    }
    Note(id) -> encode_note(id)
    Nprofile(data) -> encode_nprofile(data)
    Nevent(data) -> encode_nevent(data)
    Naddr(data) -> encode_naddr(data)
  }
}

/// Encode a `Pubkey` as `npub1...`.
pub fn encode_npub(pk: Pubkey) -> String {
  let bytes = pubkey.to_bytes(pk) |> bech32.bit_array_to_bytes
  let assert Ok(s) = bech32.encode_bytes("npub", bytes, bech32.Bech32)
  s
}

/// Encode a 64-character lowercase hex secret key as `nsec1...`.
pub fn encode_nsec(hex: String) -> Result(String, Nip19Error) {
  let clean = string.lowercase(string.trim(hex))
  case string.length(clean) == 64 {
    False -> Error(InvalidLength(expected: 64, actual: string.length(clean)))
    True ->
      case bit_array.base16_decode(clean) {
        Error(Nil) -> Error(InvalidHex)
        Ok(bits) -> {
          let bytes = bech32.bit_array_to_bytes(bits)
          case bech32.encode_bytes("nsec", bytes, bech32.Bech32) {
            Ok(s) -> Ok(s)
            Error(err) -> Error(Bech32DecodeFailed(err))
          }
        }
      }
  }
}

/// Encode an `EventId` as `note1...`.
pub fn encode_note(id: EventId) -> String {
  let bytes = event_id.to_bytes(id) |> bech32.bit_array_to_bytes
  let assert Ok(s) = bech32.encode_bytes("note", bytes, bech32.Bech32)
  s
}

/// Encode a `ProfileData` as `nprofile1...`.
pub fn encode_nprofile(profile: ProfileData) -> String {
  let pk_entry = encode_tlv_entry(0, pubkey.to_bytes(profile.pubkey))
  let relay_entries =
    list.map(profile.relays, fn(relay) {
      encode_tlv_entry(1, bit_array.from_string(relay))
    })
  let all_bits = bit_array.concat([pk_entry, ..relay_entries])
  let bytes = bech32.bit_array_to_bytes(all_bits)
  let assert Ok(s) = bech32.encode_bytes("nprofile", bytes, bech32.Bech32)
  s
}

/// Encode an `EventData` as `nevent1...`.
pub fn encode_nevent(event: EventData) -> String {
  let id_entry = encode_tlv_entry(0, event_id.to_bytes(event.id))
  let relay_entries =
    list.map(event.relays, fn(relay) {
      encode_tlv_entry(1, bit_array.from_string(relay))
    })
  let author_entry = case event.author {
    Some(pk) -> [encode_tlv_entry(2, pubkey.to_bytes(pk))]
    None -> []
  }
  let kind_entry = case event.kind {
    Some(k) -> {
      let code = kind.to_int(k)
      [encode_tlv_entry(3, <<code:int-size(32)-big>>)]
    }
    None -> []
  }
  let all_bits =
    bit_array.concat(
      list.flatten([[id_entry], relay_entries, author_entry, kind_entry]),
    )
  let bytes = bech32.bit_array_to_bytes(all_bits)
  let assert Ok(s) = bech32.encode_bytes("nevent", bytes, bech32.Bech32)
  s
}

/// Encode an `AddressData` as `naddr1...`.
pub fn encode_naddr(address: AddressData) -> String {
  let id_entry = encode_tlv_entry(0, bit_array.from_string(address.identifier))
  let relay_entries =
    list.map(address.relays, fn(relay) {
      encode_tlv_entry(1, bit_array.from_string(relay))
    })
  let author_entry = encode_tlv_entry(2, pubkey.to_bytes(address.pubkey))
  let kind_code = kind.to_int(address.kind)
  let kind_entry = encode_tlv_entry(3, <<kind_code:int-size(32)-big>>)
  let all_bits =
    bit_array.concat(
      list.flatten([[id_entry], relay_entries, [author_entry, kind_entry]]),
    )
  let bytes = bech32.bit_array_to_bytes(all_bits)
  let assert Ok(s) = bech32.encode_bytes("naddr", bytes, bech32.Bech32)
  s
}

fn encode_tlv_entry(tag: Int, val: BitArray) -> BitArray {
  let len = bit_array.byte_size(val)
  <<tag:int-size(8), len:int-size(8), val:bits>>
}

/// Decode a NIP-19 Bech32 string (or `nostr:` URI) into its corresponding `Nip19Entity`.
pub fn decode(raw: String) -> Result(Nip19Entity, Nip19Error) {
  let trimmed = string.trim(raw)
  let s = case string.starts_with(string.lowercase(trimmed), "nostr:") {
    True -> string.drop_start(trimmed, 6)
    False -> trimmed
  }

  use #(hrp, bytes, _encoding) <- result.try(
    bech32.decode_bytes(s) |> result.map_error(Bech32DecodeFailed),
  )
  let bits = bech32.bytes_to_bit_array(bytes)
  let byte_count = bit_array.byte_size(bits)

  case hrp {
    "npub" -> {
      case byte_count == 32 {
        True -> {
          let assert Ok(pk) = pubkey.from_bytes(bits)
          Ok(Npub(pk))
        }
        False -> Error(InvalidLength(expected: 32, actual: byte_count))
      }
    }
    "nsec" -> {
      case byte_count == 32 {
        True -> {
          let hex = string.lowercase(bit_array.base16_encode(bits))
          Ok(Nsec(hex))
        }
        False -> Error(InvalidLength(expected: 32, actual: byte_count))
      }
    }
    "note" -> {
      case byte_count == 32 {
        True -> {
          let assert Ok(id) = event_id.from_bytes(bits)
          Ok(Note(id))
        }
        False -> Error(InvalidLength(expected: 32, actual: byte_count))
      }
    }
    "nprofile" -> decode_nprofile_tlv(bits)
    "nevent" -> decode_nevent_tlv(bits)
    "naddr" -> decode_naddr_tlv(bits)
    other -> Error(InvalidPrefix(other))
  }
}

fn parse_tlv(
  bits: BitArray,
  acc: List(TlvEntry),
) -> Result(List(TlvEntry), Nip19Error) {
  case bits {
    <<>> -> Ok(list.reverse(acc))
    <<tag:int-size(8), len:int-size(8), rest:bits>> -> {
      case bit_array.byte_size(rest) >= len {
        True -> {
          let assert <<val:bytes-size(len), remaining:bits>> = rest
          parse_tlv(remaining, [TlvEntry(tag, val), ..acc])
        }
        False -> Error(InvalidTlv)
      }
    }
    _ -> Error(InvalidTlv)
  }
}

fn decode_nprofile_tlv(bits: BitArray) -> Result(Nip19Entity, Nip19Error) {
  use entries <- result.try(parse_tlv(bits, []))
  let maybe_pk =
    list.find_map(entries, fn(e) {
      case e.tag == 0 && bit_array.byte_size(e.value) == 32 {
        True -> pubkey.from_bytes(e.value)
        False -> Error(Nil)
      }
    })
  let relays =
    list.filter_map(entries, fn(e) {
      case e.tag == 1 {
        True -> bit_array.to_string(e.value)
        False -> Error(Nil)
      }
    })
  case maybe_pk {
    Ok(pk) -> Ok(Nprofile(ProfileData(pubkey: pk, relays: relays)))
    Error(Nil) -> Error(MissingField("pubkey"))
  }
}

fn decode_nevent_tlv(bits: BitArray) -> Result(Nip19Entity, Nip19Error) {
  use entries <- result.try(parse_tlv(bits, []))
  let maybe_id =
    list.find_map(entries, fn(e) {
      case e.tag == 0 && bit_array.byte_size(e.value) == 32 {
        True -> event_id.from_bytes(e.value)
        False -> Error(Nil)
      }
    })
  let relays =
    list.filter_map(entries, fn(e) {
      case e.tag == 1 {
        True -> bit_array.to_string(e.value)
        False -> Error(Nil)
      }
    })
  let maybe_author =
    list.find_map(entries, fn(e) {
      case e.tag == 2 && bit_array.byte_size(e.value) == 32 {
        True -> pubkey.from_bytes(e.value)
        False -> Error(Nil)
      }
    })
    |> option.from_result
  let maybe_kind =
    list.find_map(entries, fn(e) {
      case e.tag == 3 && bit_array.byte_size(e.value) == 4 {
        True -> {
          let assert <<code:int-size(32)-big>> = e.value
          Ok(kind.from_int(code))
        }
        False -> Error(Nil)
      }
    })
    |> option.from_result

  case maybe_id {
    Ok(id) ->
      Ok(
        Nevent(EventData(
          id: id,
          relays: relays,
          author: maybe_author,
          kind: maybe_kind,
        )),
      )
    Error(Nil) -> Error(MissingField("id"))
  }
}

fn decode_naddr_tlv(bits: BitArray) -> Result(Nip19Entity, Nip19Error) {
  use entries <- result.try(parse_tlv(bits, []))

  // In NIP-19:
  // tag 0: identifier (string)
  // tag 1: relay (string)
  // tag 2: pubkey (32 bytes)
  // tag 3: kind (4 bytes)
  let maybe_identifier = case
    list.find_map(entries, fn(e) {
      case e.tag == 0 {
        True -> bit_array.to_string(e.value)
        False -> Error(Nil)
      }
    })
  {
    Ok(id) -> Ok(id)
    Error(Nil) ->
      list.find_map(entries, fn(e) {
        case e.tag == 2 && bit_array.byte_size(e.value) != 32 {
          True -> bit_array.to_string(e.value)
          False -> Error(Nil)
        }
      })
  }

  let relays =
    list.filter_map(entries, fn(e) {
      case e.tag == 1 {
        True -> bit_array.to_string(e.value)
        False -> Error(Nil)
      }
    })

  let maybe_pubkey = case
    list.find_map(entries, fn(e) {
      case e.tag == 2 && bit_array.byte_size(e.value) == 32 {
        True -> pubkey.from_bytes(e.value)
        False -> Error(Nil)
      }
    })
  {
    Ok(pk) -> Ok(pk)
    Error(Nil) ->
      list.find_map(entries, fn(e) {
        case e.tag == 1 && bit_array.byte_size(e.value) == 32 {
          True -> pubkey.from_bytes(e.value)
          False -> Error(Nil)
        }
      })
  }

  let maybe_kind = case
    list.find_map(entries, fn(e) {
      case e.tag == 3 && bit_array.byte_size(e.value) == 4 {
        True -> {
          let assert <<code:int-size(32)-big>> = e.value
          Ok(kind.from_int(code))
        }
        False -> Error(Nil)
      }
    })
  {
    Ok(k) -> Ok(k)
    Error(Nil) ->
      list.find_map(entries, fn(e) {
        case e.tag == 0 && bit_array.byte_size(e.value) == 4 {
          True -> {
            let assert <<code:int-size(32)-big>> = e.value
            Ok(kind.from_int(code))
          }
          False -> Error(Nil)
        }
      })
  }

  case maybe_identifier, maybe_pubkey, maybe_kind {
    Ok(identifier), Ok(pk), Ok(k) ->
      Ok(
        Naddr(AddressData(
          identifier: identifier,
          pubkey: pk,
          kind: k,
          relays: relays,
        )),
      )
    Error(Nil), _, _ -> Error(MissingField("identifier"))
    _, Error(Nil), _ -> Error(MissingField("pubkey"))
    _, _, Error(Nil) -> Error(MissingField("kind"))
  }
}

/// Helper: decode specifically an `npub` string into a `Pubkey`.
pub fn decode_npub(str: String) -> Result(Pubkey, Nip19Error) {
  case decode(str) {
    Ok(Npub(pk)) -> Ok(pk)
    Ok(_) -> Error(InvalidPrefix("expected npub"))
    Error(err) -> Error(err)
  }
}

/// Helper: decode specifically an `nsec` string into a 64-char hex string.
pub fn decode_nsec(str: String) -> Result(String, Nip19Error) {
  case decode(str) {
    Ok(Nsec(hex)) -> Ok(hex)
    Ok(_) -> Error(InvalidPrefix("expected nsec"))
    Error(err) -> Error(err)
  }
}

/// Helper: decode specifically a `note` string into an `EventId`.
pub fn decode_note(str: String) -> Result(EventId, Nip19Error) {
  case decode(str) {
    Ok(Note(id)) -> Ok(id)
    Ok(_) -> Error(InvalidPrefix("expected note"))
    Error(err) -> Error(err)
  }
}

/// Helper: decode specifically an `nprofile` string into `ProfileData`.
pub fn decode_nprofile(str: String) -> Result(ProfileData, Nip19Error) {
  case decode(str) {
    Ok(Nprofile(p)) -> Ok(p)
    Ok(_) -> Error(InvalidPrefix("expected nprofile"))
    Error(err) -> Error(err)
  }
}

/// Helper: decode specifically an `nevent` string into `EventData`.
pub fn decode_nevent(str: String) -> Result(EventData, Nip19Error) {
  case decode(str) {
    Ok(Nevent(e)) -> Ok(e)
    Ok(_) -> Error(InvalidPrefix("expected nevent"))
    Error(err) -> Error(err)
  }
}

/// Helper: decode specifically an `naddr` string into `AddressData`.
pub fn decode_naddr(str: String) -> Result(AddressData, Nip19Error) {
  case decode(str) {
    Ok(Naddr(a)) -> Ok(a)
    Ok(_) -> Error(InvalidPrefix("expected naddr"))
    Error(err) -> Error(err)
  }
}
