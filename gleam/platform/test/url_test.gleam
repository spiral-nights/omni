import gleam/option.{None, Some}
import gleam/result
import omni/platform/url

pub fn url_parse_https_test() {
  let assert Ok(parsed) =
    url.parse("https://example.com/api/v1/users?limit=10&page=2#heading")

  assert parsed.scheme == "https"
  assert parsed.host == "example.com"
  assert parsed.port == None
  assert parsed.path == "/api/v1/users"
  assert parsed.query == Some("limit=10&page=2")
  assert parsed.fragment == Some("heading")
}

pub fn url_parse_wss_with_port_test() {
  let assert Ok(parsed) = url.parse("wss://relay.damus.io:8080/ws")

  assert parsed.scheme == "wss"
  assert parsed.host == "relay.damus.io"
  assert parsed.port == Some(8080)
  assert parsed.path == "/ws"
  assert parsed.query == None
  assert parsed.fragment == None
}

pub fn url_parse_nostr_scheme_test() {
  let assert Ok(parsed) =
    url.parse(
      "nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
    )

  assert parsed.scheme == "nostr"
  assert parsed.path
    == "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6"
}

pub fn url_to_string_roundtrip_test() {
  let raw = "https://example.com:8443/feed?filter=recent#top"
  let assert Ok(parsed) = url.parse(raw)
  let serialized = url.to_string(parsed)
  assert serialized == raw
}

pub fn url_parse_invalid_test() {
  let res = url.parse("not a valid url at all")
  assert result.is_error(res) == True
}
