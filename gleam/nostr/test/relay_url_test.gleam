import gleam/result
import omni/nostr/relay_url

pub fn parse_valid_urls_test() {
  let assert Ok(u1) = relay_url.parse("wss://relay.damus.io")
  assert relay_url.to_string(u1) == "wss://relay.damus.io"

  let assert Ok(u2) = relay_url.parse("ws://localhost:8080")
  assert relay_url.to_string(u2) == "ws://localhost:8080"
}

pub fn host_lowercase_normalization_test() {
  let assert Ok(u1) = relay_url.parse("WSS://Relay.Damus.IO")
  assert relay_url.to_string(u1) == "wss://relay.damus.io"

  let assert Ok(u2) = relay_url.parse("ws://LocalHost:7777")
  assert relay_url.to_string(u2) == "ws://localhost:7777"
}

pub fn trailing_slashes_stripped_test() {
  let assert Ok(u1) = relay_url.parse("wss://relay.damus.io/")
  assert relay_url.to_string(u1) == "wss://relay.damus.io"

  let assert Ok(u2) = relay_url.parse("wss://relay.damus.io///")
  assert relay_url.to_string(u2) == "wss://relay.damus.io"

  let assert Ok(u3) = relay_url.parse("wss://relay.damus.io/chat/")
  assert relay_url.to_string(u3) == "wss://relay.damus.io/chat"

  let assert Ok(u4) = relay_url.parse("wss://relay.damus.io/chat///")
  assert relay_url.to_string(u4) == "wss://relay.damus.io/chat"
}

pub fn whitespace_trimmed_test() {
  let assert Ok(u) = relay_url.parse("   wss://relay.damus.io/   ")
  assert relay_url.to_string(u) == "wss://relay.damus.io"
}

pub fn reject_invalid_schemes_and_hosts_test() {
  assert relay_url.parse("http://relay.damus.io") |> result.is_error
  assert relay_url.parse("https://relay.damus.io") |> result.is_error
  assert relay_url.parse("") |> result.is_error
  assert relay_url.parse("wss://") |> result.is_error
  assert relay_url.parse("ws://") |> result.is_error
  assert relay_url.parse("wss:///") |> result.is_error
  assert relay_url.parse("wss://relay damus.io") |> result.is_error
  assert relay_url.parse("not-a-url") |> result.is_error
}
