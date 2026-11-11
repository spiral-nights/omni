import gleam/option.{None, Some}
import gleam/result
import omni/nostr/filter
import omni/nostr/filter_codec
import omni/nostr/kind

pub fn empty_filter_round_trip_test() {
  let json_str = "{}"
  let assert Ok(decoded) = filter_codec.decode_json(json_str)
  assert decoded.ids == None
  assert decoded.authors == None
  assert decoded.kinds == None
  assert decoded.since == None
  assert decoded.until == None
  assert decoded.limit == None
  assert decoded.search == None
  assert filter.get_tag(decoded, "e") == []

  let encoded = filter_codec.encode(decoded)
  assert encoded == "{}"
}

pub fn full_filter_round_trip_test() {
  let f =
    filter.new()
    |> filter.with_ids(["a2a0a221"])
    |> filter.with_authors(["3bf0c63f"])
    |> filter.with_kinds([kind.Note, kind.Metadata])
    |> filter.with_since(1000)
    |> filter.with_until(2000)
    |> filter.with_limit(50)
    |> filter.with_search("nostr client")
    |> filter.with_e_tags(["ev123"])
    |> filter.with_p_tags(["pk456"])
    |> filter.with_d_tag("my-slug")

  let json_str = filter_codec.encode(f)
  let assert Ok(decoded) = filter_codec.decode_json(json_str)

  assert decoded.ids == Some(["a2a0a221"])
  assert decoded.authors == Some(["3bf0c63f"])
  assert decoded.kinds == Some([kind.Note, kind.Metadata])
  assert decoded.since == Some(1000)
  assert decoded.until == Some(2000)
  assert decoded.limit == Some(50)
  assert decoded.search == Some("nostr client")
  assert filter.get_tag(decoded, "e") == ["ev123"]
  assert filter.get_tag(decoded, "p") == ["pk456"]
  assert filter.get_tag(decoded, "d") == ["my-slug"]
}

pub fn decode_raw_nip01_filter_test() {
  let raw =
    "{\"ids\":[\"id1\"],\"authors\":[\"pk1\"],\"kinds\":[1,30078],\"#e\":[\"e1\"],\"#d\":[\"app\"],\"since\":1234,\"limit\":20}"

  let assert Ok(f) = filter_codec.decode_json(raw)
  assert f.ids == Some(["id1"])
  assert f.authors == Some(["pk1"])
  assert f.kinds == Some([kind.Note, kind.AppData])
  assert f.since == Some(1234)
  assert f.limit == Some(20)
  assert filter.get_tag(f, "e") == ["e1"]
  assert filter.get_tag(f, "d") == ["app"]
}

pub fn reject_invalid_tag_structure_test() {
  let bad_json = "{\"#e\": 12345}"
  assert filter_codec.decode_json(bad_json) |> result.is_error
}
