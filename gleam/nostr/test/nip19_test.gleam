import gleam/option.{Some}
import gleam/result
import omni/nostr/event_id
import omni/nostr/kind
import omni/nostr/nip19.{
  AddressData, EventData, Naddr, Nevent, Note, Nprofile, Npub, Nsec, ProfileData,
}
import omni/nostr/pubkey
import qcheck

pub fn official_npub_test() {
  let pub_hex =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let expected_npub =
    "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6"

  let assert Ok(pk) = pubkey.parse(pub_hex)
  assert nip19.encode_npub(pk) == expected_npub
  assert nip19.encode(Npub(pk)) == expected_npub

  let assert Ok(Npub(decoded_pk)) = nip19.decode(expected_npub)
  assert pubkey.to_hex(decoded_pk) == pub_hex

  let assert Ok(direct_pk) = nip19.decode_npub(expected_npub)
  assert pubkey.to_hex(direct_pk) == pub_hex
}

pub fn official_nsec_test() {
  let priv_hex =
    "ba46c053d87948f076895950ef09286723dbe84e906fbb01f2aeae6fff374058"
  let expected_nsec =
    "nsec1hfrvq57c09y0qa5ft9gw7zfgvu3ah6zwjphmkq0j46hxllehgpvqnfu36w"

  let assert Ok(nsec) = nip19.encode_nsec(priv_hex)
  assert nsec == expected_nsec
  assert nip19.encode(Nsec(priv_hex)) == expected_nsec

  let assert Ok(Nsec(decoded_hex)) = nip19.decode(expected_nsec)
  assert decoded_hex == priv_hex

  let assert Ok(direct_hex) = nip19.decode_nsec(expected_nsec)
  assert direct_hex == priv_hex
}

pub fn official_note_test() {
  let note_hex =
    "2222222222222222222222222222222222222222222222222222222222222222"
  let expected_note =
    "note1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qmtdh3n"

  let assert Ok(id) = event_id.parse(note_hex)
  assert nip19.encode_note(id) == expected_note
  assert nip19.encode(Note(id)) == expected_note

  let assert Ok(Note(decoded_id)) = nip19.decode(expected_note)
  assert event_id.to_hex(decoded_id) == note_hex

  let assert Ok(direct_id) = nip19.decode_note(expected_note)
  assert event_id.to_hex(direct_id) == note_hex
}

pub fn nostr_uri_prefix_test() {
  let uri =
    "nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6"
  let assert Ok(Npub(pk)) = nip19.decode(uri)
  assert pubkey.to_hex(pk)
    == "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
}

pub fn nprofile_round_trip_test() {
  let pub_hex =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let assert Ok(pk) = pubkey.parse(pub_hex)
  let relays = ["wss://relay.damus.io", "wss://nos.lol"]
  let profile = ProfileData(pubkey: pk, relays: relays)

  let encoded = nip19.encode_nprofile(profile)
  assert nip19.encode(Nprofile(profile)) == encoded

  let assert Ok(Nprofile(decoded)) = nip19.decode(encoded)
  assert pubkey.to_hex(decoded.pubkey) == pub_hex
  assert decoded.relays == relays

  let assert Ok(direct) = nip19.decode_nprofile(encoded)
  assert direct == profile
}

pub fn nevent_round_trip_test() {
  let id_hex =
    "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770"
  let pub_hex =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let assert Ok(id) = event_id.parse(id_hex)
  let assert Ok(pk) = pubkey.parse(pub_hex)

  let event_data =
    EventData(
      id: id,
      relays: ["wss://relay.damus.io"],
      author: Some(pk),
      kind: Some(kind.Note),
    )

  let encoded = nip19.encode_nevent(event_data)
  assert nip19.encode(Nevent(event_data)) == encoded

  let assert Ok(Nevent(decoded)) = nip19.decode(encoded)
  assert decoded == event_data

  let assert Ok(direct) = nip19.decode_nevent(encoded)
  assert direct == event_data
}

pub fn naddr_round_trip_test() {
  let pub_hex =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let assert Ok(pk) = pubkey.parse(pub_hex)

  let addr =
    AddressData(
      identifier: "omni/workspace/v1",
      pubkey: pk,
      kind: kind.AppData,
      relays: ["wss://relay.damus.io"],
    )

  let encoded = nip19.encode_naddr(addr)
  assert nip19.encode(Naddr(addr)) == encoded

  let assert Ok(Naddr(decoded)) = nip19.decode(encoded)
  assert decoded == addr

  let assert Ok(direct) = nip19.decode_naddr(encoded)
  assert direct == addr
}

pub fn nprofile_property_round_trip_test() {
  let pub_hex =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let assert Ok(pk) = pubkey.parse(pub_hex)

  let relay_gen =
    qcheck.generic_string(
      qcheck.alphanumeric_ascii_codepoint(),
      qcheck.bounded_int(5, 40),
    )
  let relays_gen = qcheck.list_from(relay_gen)

  qcheck.run(qcheck.default_config(), relays_gen, fn(relays) {
    let profile = ProfileData(pubkey: pk, relays: relays)
    let encoded = nip19.encode_nprofile(profile)
    let assert Ok(decoded) = nip19.decode_nprofile(encoded)
    assert decoded.pubkey == profile.pubkey
    assert decoded.relays == profile.relays
  })
}

pub fn nevent_property_round_trip_test() {
  let id_hex =
    "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770"
  let pub_hex =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let assert Ok(id) = event_id.parse(id_hex)
  let assert Ok(pk) = pubkey.parse(pub_hex)

  let relay_gen =
    qcheck.generic_string(
      qcheck.alphanumeric_ascii_codepoint(),
      qcheck.bounded_int(5, 40),
    )
  let gen =
    qcheck.tuple2(qcheck.list_from(relay_gen), qcheck.bounded_int(0, 65_535))

  qcheck.run(qcheck.default_config(), gen, fn(tuple) {
    let #(relays, kind_int) = tuple
    let ev =
      EventData(
        id: id,
        relays: relays,
        author: Some(pk),
        kind: Some(kind.from_int(kind_int)),
      )
    let encoded = nip19.encode_nevent(ev)
    let assert Ok(decoded) = nip19.decode_nevent(encoded)
    assert decoded.id == ev.id
    assert decoded.relays == ev.relays
    assert decoded.author == ev.author
    assert decoded.kind == ev.kind
  })
}

pub fn naddr_property_round_trip_test() {
  let pub_hex =
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  let assert Ok(pk) = pubkey.parse(pub_hex)

  let id_gen =
    qcheck.generic_string(
      qcheck.alphanumeric_ascii_codepoint(),
      qcheck.bounded_int(1, 30),
    )
  let relay_gen =
    qcheck.generic_string(
      qcheck.alphanumeric_ascii_codepoint(),
      qcheck.bounded_int(5, 40),
    )
  let relays_gen = qcheck.list_from(relay_gen)

  let gen = qcheck.tuple3(id_gen, qcheck.bounded_int(0, 65_535), relays_gen)

  qcheck.run(qcheck.default_config(), gen, fn(tuple) {
    let #(identifier, kind_int, relays) = tuple
    let addr =
      AddressData(
        identifier: identifier,
        pubkey: pk,
        kind: kind.from_int(kind_int),
        relays: relays,
      )

    let encoded = nip19.encode_naddr(addr)
    let assert Ok(decoded) = nip19.decode_naddr(encoded)
    assert decoded.identifier == addr.identifier
    assert decoded.pubkey == addr.pubkey
    assert decoded.kind == addr.kind
    assert decoded.relays == addr.relays
  })
}

pub fn reject_invalid_entities_test() {
  assert nip19.decode("invalid1qqqqqqqq") |> result.is_error
  assert nip19.decode_npub(
      "nsec1hfrvq57c09y0qa5ft9gw7zfgvu3ah6zwjphmkq0j46hxllehgpvqnfu36w",
    )
    |> result.is_error
  assert nip19.decode_note(
      "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
    )
    |> result.is_error
  assert nip19.decode_nsec("not an nsec") |> result.is_error
}
