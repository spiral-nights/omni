//// JSON codecs for Nostr subscription filters (NIP-01).

import gleam/dict
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import omni/nostr/filter.{type Filter, Filter}
import omni/nostr/kind

fn dummy_filter() -> Filter {
  filter.new()
}

/// Dynamic decoder for a standard NIP-01 `Filter`.
pub fn decoder() -> decode.Decoder(Filter) {
  use ids <- decode.optional_field(
    "ids",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use authors <- decode.optional_field(
    "authors",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use kinds <- decode.optional_field(
    "kinds",
    None,
    decode.optional(decode.list(decode.map(decode.int, kind.from_int))),
  )
  use since <- decode.optional_field("since", None, decode.optional(decode.int))
  use until <- decode.optional_field("until", None, decode.optional(decode.int))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use search <- decode.optional_field(
    "search",
    None,
    decode.optional(decode.string),
  )
  use raw_dict <- decode.then(decode.dict(decode.string, decode.dynamic))

  let tag_entries =
    dict.to_list(raw_dict)
    |> list.filter(fn(pair) { string.starts_with(pair.0, "#") })

  let invalid_tags =
    list.filter_map(tag_entries, fn(pair) {
      let #(key, val_dyn) = pair
      case decode.run(val_dyn, decode.list(decode.string)) {
        Ok(_) -> Error(Nil)
        Error(_) -> Ok(key)
      }
    })

  case invalid_tags {
    [bad_key, ..] ->
      decode.failure(dummy_filter(), "List(String) for " <> bad_key)
    [] -> {
      let valid_tags =
        list.map(tag_entries, fn(pair) {
          let #(key, val_dyn) = pair
          let assert Ok(values) =
            decode.run(val_dyn, decode.list(decode.string))
          let tag_name = string.drop_start(key, 1)
          #(tag_name, values)
        })
      let tags = dict.from_list(valid_tags)

      decode.success(Filter(
        ids: ids,
        authors: authors,
        kinds: kinds,
        since: since,
        until: until,
        limit: limit,
        search: search,
        tags: tags,
      ))
    }
  }
}

/// Decode a `Filter` from a JSON string.
pub fn decode_json(json_str: String) -> Result(Filter, json.DecodeError) {
  json.parse(from: json_str, using: decoder())
}

/// Decode a `Filter` from dynamic data.
pub fn from_dynamic(data: Dynamic) -> Result(Filter, List(decode.DecodeError)) {
  decode.run(data, decoder())
}

/// Convert a `Filter` to `gleam/json.Json`.
pub fn to_json(filter: Filter) -> json.Json {
  let fields = []

  let fields = case filter.ids {
    Some(ids) -> [#("ids", json.array(ids, of: json.string)), ..fields]
    None -> fields
  }

  let fields = case filter.authors {
    Some(authors) -> [
      #("authors", json.array(authors, of: json.string)),
      ..fields
    ]
    None -> fields
  }

  let fields = case filter.kinds {
    Some(kinds) -> [
      #("kinds", json.array(kinds, of: fn(k) { json.int(kind.to_int(k)) })),
      ..fields
    ]
    None -> fields
  }

  let fields = case filter.since {
    Some(since) -> [#("since", json.int(since)), ..fields]
    None -> fields
  }

  let fields = case filter.until {
    Some(until) -> [#("until", json.int(until)), ..fields]
    None -> fields
  }

  let fields = case filter.limit {
    Some(limit) -> [#("limit", json.int(limit)), ..fields]
    None -> fields
  }

  let fields = case filter.search {
    Some(search) -> [#("search", json.string(search)), ..fields]
    None -> fields
  }

  let tag_fields =
    dict.to_list(filter.tags)
    |> list.map(fn(pair) {
      let #(tag_name, values) = pair
      let key = case string.starts_with(tag_name, "#") {
        True -> tag_name
        False -> "#" <> tag_name
      }
      #(key, json.array(values, of: json.string))
    })

  json.object(list.append(list.reverse(fields), tag_fields))
}

/// Encode a `Filter` to a compact JSON string.
pub fn encode(filter: Filter) -> String {
  to_json(filter) |> json.to_string
}
