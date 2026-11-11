//// Golden fixture snapshot tests for canonical JSON-RPC 2.0 messages.
////
//// Validates exact wire compatibility of Request, Response, and Notification
//// envelopes against immutable golden snapshot files.

import gleam/option.{None, Some}
import omni/nostr/event.{UnsignedEvent}
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/pubkey
import omni/nostr/relay_url
import omni/platform/json as platform_json
import omni/protocol/rpc/codec
import omni/protocol/rpc/envelope.{Error, IntId, Notification, StringId, Success}
import omni/protocol/rpc/error_code.{PermissionDenied}
import omni/protocol/rpc/method.{
  FetchOptions, NostrFetch, NostrGetPublicKey, NostrSignEvent, RelaysAdd,
  StorageSet,
}
import omni/testkit/golden

fn golden_dir() -> String {
  "test/golden/rpc"
}

fn sample_pubkey() {
  let assert Ok(pk) =
    pubkey.parse(
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    )
  pk
}

fn sample_relay_url() {
  let assert Ok(u) = relay_url.parse("wss://relay.damus.io")
  u
}

pub fn golden_rpc_request_get_public_key_test() {
  let req = NostrGetPublicKey
  let actual = codec.encode_request(IntId(1), req)
  golden.assert_match_in(
    golden_dir(),
    "rpc_request_nostr_get_public_key.json",
    actual,
  )

  // Verify roundtrip decode from golden snapshot
  let assert Ok(content) =
    golden.read_from(golden_dir(), "rpc_request_nostr_get_public_key.json")
  let assert Ok(#(id, decoded_req)) = codec.decode_request(content)
  assert id == IntId(1)
  assert decoded_req == req
}

pub fn golden_rpc_request_sign_event_test() {
  let draft =
    UnsignedEvent(
      pubkey: Some(sample_pubkey()),
      created_at: 1_700_000_000,
      kind: kind.Note,
      tags: [["t", "omni"], ["p", pubkey.to_hex(sample_pubkey())]],
      content: "Hello from Omni!",
    )
  let actual = codec.encode_request(IntId(2), NostrSignEvent(draft))
  golden.assert_match_in(
    golden_dir(),
    "rpc_request_nostr_sign_event.json",
    actual,
  )

  let assert Ok(content) =
    golden.read_from(golden_dir(), "rpc_request_nostr_sign_event.json")
  let assert Ok(#(id, decoded_req)) = codec.decode_request(content)
  assert id == IntId(2)
  case decoded_req {
    NostrSignEvent(d) -> {
      assert d.content == "Hello from Omni!"
      assert d.kind == kind.Note
    }
    _ -> panic as "Expected NostrSignEvent"
  }
}

pub fn golden_rpc_request_fetch_test() {
  let f = filter.new() |> filter.with_kinds([kind.Note, kind.Metadata])
  let opts =
    FetchOptions(
      timeout_ms: Some(3000),
      relays: Some([sample_relay_url()]),
      local_only: Some(False),
    )
  let actual =
    codec.encode_request(StringId("fetch-42"), NostrFetch([f], Some(opts)))
  golden.assert_match_in(golden_dir(), "rpc_request_nostr_fetch.json", actual)

  let assert Ok(content) =
    golden.read_from(golden_dir(), "rpc_request_nostr_fetch.json")
  let assert Ok(#(id, decoded_req)) = codec.decode_request(content)
  assert id == StringId("fetch-42")
  case decoded_req {
    NostrFetch(filters, _) -> {
      assert filters == [f]
      Nil
    }
    _ -> panic as "Expected NostrFetch"
  }
}

pub fn golden_rpc_request_storage_set_test() {
  let actual =
    codec.encode_request(
      IntId(3),
      StorageSet("workspace_theme", "warm-paper-dark"),
    )
  golden.assert_match_in(golden_dir(), "rpc_request_storage_set.json", actual)

  let assert Ok(content) =
    golden.read_from(golden_dir(), "rpc_request_storage_set.json")
  let assert Ok(#(id, decoded_req)) = codec.decode_request(content)
  assert id == IntId(3)
  assert decoded_req == StorageSet("workspace_theme", "warm-paper-dark")
}

pub fn golden_rpc_request_relays_add_test() {
  let actual = codec.encode_request(IntId(4), RelaysAdd(sample_relay_url()))
  golden.assert_match_in(golden_dir(), "rpc_request_relays_add.json", actual)

  let assert Ok(content) =
    golden.read_from(golden_dir(), "rpc_request_relays_add.json")
  let assert Ok(#(id, decoded_req)) = codec.decode_request(content)
  assert id == IntId(4)
  assert decoded_req == RelaysAdd(sample_relay_url())
}

pub fn golden_rpc_response_success_test() {
  let assert Ok(res_dyn) =
    platform_json.parse_dynamic(
      "{\"pubkey\":\""
      <> pubkey.to_hex(sample_pubkey())
      <> "\",\"status\":\"active\"}",
    )
  let resp = Success(id: IntId(1), result: res_dyn)
  let actual = envelope.encode_response(resp)
  golden.assert_match_in(golden_dir(), "rpc_response_success.json", actual)

  let assert Ok(content) =
    golden.read_from(golden_dir(), "rpc_response_success.json")
  let assert Ok(decoded) = envelope.decode_response(content)
  case decoded {
    Success(id, _) -> {
      assert id == IntId(1)
      Nil
    }
    _ -> panic as "Expected Success"
  }
}

pub fn golden_rpc_response_error_test() {
  let assert Ok(details_dyn) =
    platform_json.parse_dynamic(
      "{\"requiredKind\":4,\"pluginId\":\"org.omni.plugin.test\"}",
    )
  let resp =
    Error(
      id: Some(IntId(2)),
      code: PermissionDenied,
      message: "Permission denied for nostr:sign on kind 4",
      data: Some(details_dyn),
    )
  let actual = envelope.encode_response(resp)
  golden.assert_match_in(golden_dir(), "rpc_response_error.json", actual)

  let assert Ok(content) =
    golden.read_from(golden_dir(), "rpc_response_error.json")
  let assert Ok(decoded) = envelope.decode_response(content)
  case decoded {
    Error(id, code, msg, _) -> {
      assert id == Some(IntId(2))
      assert code == PermissionDenied
      assert msg == "Permission denied for nostr:sign on kind 4"
    }
    _ -> panic as "Expected Error"
  }
}

pub fn golden_rpc_notification_test() {
  let assert Ok(params_dyn) =
    platform_json.parse_dynamic(
      "{\"action\":\"reply-thread\",\"rootEventId\":\"abc123\"}",
    )
  let notif = Notification(method: "intent.invoke", params: Some(params_dyn))
  let actual = envelope.encode_notification(notif)
  golden.assert_match_in(golden_dir(), "rpc_notification.json", actual)

  let assert Ok(content) =
    golden.read_from(golden_dir(), "rpc_notification.json")
  let assert Ok(decoded) = envelope.decode_notification(content)
  assert decoded.method == "intent.invoke"
  case decoded.params {
    Some(_) -> Nil
    None -> panic as "Expected Some(params)"
  }
}
