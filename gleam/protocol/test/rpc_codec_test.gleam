import gleam/list
import gleam/option.{None, Some}
import omni/nostr/event.{Event, UnsignedEvent}
import omni/nostr/event_id
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/pubkey
import omni/nostr/relay_url
import omni/platform/json as platform_json
import omni/protocol/rpc/codec.{DecodeRpcError}
import omni/protocol/rpc/envelope.{IntId, StringId}
import omni/protocol/rpc/error_code
import omni/protocol/rpc/method.{
  AuthSwitchKey, FetchOptions, IntentsDispatch, NavigationOpen, Nip04, Nip44,
  NostrDecrypt, NostrEncrypt, NostrFetch, NostrGetPublicKey, NostrGetRelays,
  NostrPublish, NostrSignEvent, NostrSubscribe, NostrUnsubscribe, ProfileGet,
  RelaysAdd, RelaysList, RelaysRemove, Share, StorageClear, StorageGet,
  StorageKeys, StorageRemove, StorageSet, UnknownMethod,
}

fn sample_pubkey() {
  let assert Ok(pk) =
    pubkey.parse(
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    )
  pk
}

fn sample_event_id() {
  let assert Ok(id) =
    event_id.parse(
      "0000000000000000000000000000000000000000000000000000000000000001",
    )
  id
}

fn sample_relay_url() {
  let assert Ok(u) = relay_url.parse("wss://relay.damus.io")
  u
}

fn sample_draft() {
  UnsignedEvent(
    pubkey: Some(sample_pubkey()),
    created_at: 1_700_000_000,
    kind: kind.Note,
    tags: [["t", "omni"]],
    content: "Hello from Omni Gleam!",
  )
}

fn sample_event() {
  Event(
    id: sample_event_id(),
    pubkey: sample_pubkey(),
    created_at: 1_700_000_000,
    kind: kind.Note,
    tags: [["t", "omni"]],
    content: "Hello from Omni Gleam!",
    sig: "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  )
}

pub fn decode_nostr_get_public_key_test() {
  let json_str =
    "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"nostr.getPublicKey\"}"
  let assert Ok(#(id, req)) = codec.decode_request(json_str)
  assert id == IntId(1)
  assert req == NostrGetPublicKey

  // Roundtrip
  let encoded = codec.encode_request(id, req)
  let assert Ok(#(id2, req2)) = codec.decode_request(encoded)
  assert id2 == id
  assert req2 == req
}

pub fn decode_nostr_sign_event_test() {
  let draft = sample_draft()
  let encoded = codec.encode_request(IntId(2), NostrSignEvent(draft))

  let assert Ok(#(id, req)) = codec.decode_request(encoded)
  assert id == IntId(2)
  case req {
    NostrSignEvent(d) -> {
      assert d.content == "Hello from Omni Gleam!"
      assert d.kind == kind.Note
    }
    _ -> panic as "Expected NostrSignEvent"
  }
}

pub fn decode_nostr_fetch_test() {
  let f = filter.new() |> filter.with_kinds([kind.Note])
  let opts =
    FetchOptions(
      timeout_ms: Some(5000),
      relays: Some([sample_relay_url()]),
      local_only: Some(False),
    )
  let encoded =
    codec.encode_request(StringId("fetch-1"), NostrFetch([f], Some(opts)))

  let assert Ok(#(id, req)) = codec.decode_request(encoded)
  assert id == StringId("fetch-1")
  case req {
    NostrFetch(filters, options) -> {
      assert filters == [f]
      assert options == Some(opts)
    }
    _ -> panic as "Expected NostrFetch"
  }
}

pub fn decode_nostr_publish_test() {
  let ev = sample_event()
  let encoded = codec.encode_request(IntId(3), NostrPublish(ev))

  let assert Ok(#(id, req)) = codec.decode_request(encoded)
  assert id == IntId(3)
  case req {
    NostrPublish(e) -> {
      assert e.content == "Hello from Omni Gleam!"
      assert e.id == sample_event_id()
    }
    _ -> panic as "Expected NostrPublish"
  }
}

pub fn decode_nostr_encrypt_decrypt_test() {
  let pk = sample_pubkey()
  let enc_req = NostrEncrypt(Nip04, pk, "secret message")
  let enc_str = codec.encode_request(IntId(4), enc_req)
  let assert Ok(#(_, req1)) = codec.decode_request(enc_str)
  assert req1 == enc_req

  let dec_req = NostrDecrypt(Nip04, pk, "encrypted?iv=123")
  let dec_str = codec.encode_request(IntId(5), dec_req)
  let assert Ok(#(_, req2)) = codec.decode_request(dec_str)
  assert req2 == dec_req
}

pub fn decode_nip44_scheme_test() {
  let pk = sample_pubkey()
  let raw =
    "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"nostr.nip44.encrypt\",\"params\":{\"pubkey\":\"79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798\",\"plaintext\":\"hi\"}}"
  let assert Ok(#(_, req)) = codec.decode_request(raw)
  assert req == NostrEncrypt(Nip44, pk, "hi")
}

pub fn decode_subscription_test() {
  let raw =
    "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"nostr.subscribe\",\"params\":{\"subscriptionId\":\"sub1\",\"filters\":[{\"kinds\":[1]}]}}"
  let assert Ok(#(_, req)) = codec.decode_request(raw)
  case req {
    NostrSubscribe(sub_id, filters) -> {
      assert sub_id == "sub1"
      assert list.length(filters) == 1
    }
    _ -> panic as "Expected NostrSubscribe"
  }
}

pub fn decode_get_relays_test() {
  let raw = "{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"nostr.getRelays\"}"
  let assert Ok(#(_, req)) = codec.decode_request(raw)
  assert req == NostrGetRelays
}

pub fn decode_unsubscribe_test() {
  let raw =
    "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"nostr.unsubscribe\",\"params\":{\"subscriptionId\":\"sub1\"}}"
  let assert Ok(#(_, req)) = codec.decode_request(raw)
  assert req == NostrUnsubscribe("sub1")
}

pub fn decode_profile_get_test() {
  let pk = sample_pubkey()
  let raw =
    "{\"jsonrpc\":\"2.0\",\"id\":10,\"method\":\"profile.get\",\"params\":{\"pubkey\":\"79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798\"}}"
  let assert Ok(#(_, req)) = codec.decode_request(raw)
  assert req == ProfileGet(pk)
}

pub fn decode_storage_methods_test() {
  let get_req = StorageGet("theme")
  let get_str = codec.encode_request(IntId(10), get_req)
  let assert Ok(#(_, r1)) = codec.decode_request(get_str)
  assert r1 == get_req

  let set_req = StorageSet("theme", "warm-paper")
  let set_str = codec.encode_request(IntId(11), set_req)
  let assert Ok(#(_, r2)) = codec.decode_request(set_str)
  assert r2 == set_req

  let del_req = StorageRemove("theme")
  let del_str = codec.encode_request(IntId(12), del_req)
  let assert Ok(#(_, r3)) = codec.decode_request(del_str)
  assert r3 == del_req

  let keys_req = StorageKeys
  let keys_str = codec.encode_request(IntId(13), keys_req)
  let assert Ok(#(_, r4)) = codec.decode_request(keys_str)
  assert r4 == keys_req

  let clear_req = StorageClear
  let clear_str = codec.encode_request(IntId(14), clear_req)
  let assert Ok(#(_, r5)) = codec.decode_request(clear_str)
  assert r5 == clear_req
}

pub fn decode_relays_methods_test() {
  let list_req = RelaysList
  let list_str = codec.encode_request(IntId(20), list_req)
  let assert Ok(#(_, r1)) = codec.decode_request(list_str)
  assert r1 == list_req

  let add_req = RelaysAdd(sample_relay_url())
  let add_str = codec.encode_request(IntId(21), add_req)
  let assert Ok(#(_, r2)) = codec.decode_request(add_str)
  assert r2 == add_req

  let rem_req = RelaysRemove(sample_relay_url())
  let rem_str = codec.encode_request(IntId(22), rem_req)
  let assert Ok(#(_, r3)) = codec.decode_request(rem_str)
  assert r3 == rem_req
}

pub fn decode_intents_navigation_share_auth_test() {
  let assert Ok(dyn_payload) =
    platform_json.parse_dynamic("{\"noteId\":\"123\"}")
  let intent_req = IntentsDispatch("open-note", Some(dyn_payload))
  let intent_str = codec.encode_request(IntId(30), intent_req)
  let assert Ok(#(_, r1)) = codec.decode_request(intent_str)
  case r1 {
    IntentsDispatch(act, _) -> {
      assert act == "open-note"
      Nil
    }
    _ -> panic as "Expected IntentsDispatch"
  }

  let nav_req = NavigationOpen("settings", Some("plugins"))
  let nav_str = codec.encode_request(IntId(31), nav_req)
  let assert Ok(#(_, r2)) = codec.decode_request(nav_str)
  assert r2 == nav_req

  let share_req =
    Share(Some("Omni"), Some("Decentralized client"), Some("https://omni.site"))
  let share_str = codec.encode_request(IntId(32), share_req)
  let assert Ok(#(_, r3)) = codec.decode_request(share_str)
  assert r3 == share_req

  let auth_req =
    AuthSwitchKey(
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    )
  let auth_str = codec.encode_request(IntId(33), auth_req)
  let assert Ok(#(_, r4)) = codec.decode_request(auth_str)
  assert r4 == auth_req
}

pub fn decode_unknown_method_test() {
  let custom_json =
    "{\"jsonrpc\":\"2.0\",\"id\":99,\"method\":\"custom.compute\",\"params\":{\"x\":10}}"
  let assert Ok(#(id, req)) = codec.decode_request(custom_json)
  assert id == IntId(99)
  case req {
    UnknownMethod(name, _) -> {
      assert name == "custom.compute"
      Nil
    }
    _ -> panic as "Expected UnknownMethod"
  }
}

pub fn decode_error_scenarios_test() {
  // 1. Parse error (bad json)
  case codec.decode_request("{malformed json") {
    Error(DecodeRpcError(id, code, _)) -> {
      assert id == None
      assert code == error_code.ParseError
    }
    Ok(_) -> panic as "Expected ParseError"
  }

  // 2. Invalid Request (wrong version)
  case
    codec.decode_request(
      "{\"jsonrpc\":\"1.0\",\"id\":1,\"method\":\"nostr.getPublicKey\"}",
    )
  {
    Error(DecodeRpcError(id, code, _)) -> {
      assert id == None
      assert code == error_code.InvalidRequest
    }
    Ok(_) -> panic as "Expected InvalidRequest"
  }

  // 3. Invalid Request (missing id)
  case
    codec.decode_request(
      "{\"jsonrpc\":\"2.0\",\"method\":\"nostr.getPublicKey\"}",
    )
  {
    Error(DecodeRpcError(id, code, _)) -> {
      assert id == None
      assert code == error_code.InvalidRequest
    }
    Ok(_) -> panic as "Expected InvalidRequest"
  }

  // 4. Invalid Request (missing method)
  case codec.decode_request("{\"jsonrpc\":\"2.0\",\"id\":5}") {
    Error(DecodeRpcError(id, code, _)) -> {
      assert id == Some(IntId(5))
      assert code == error_code.InvalidRequest
    }
    Ok(_) -> panic as "Expected InvalidRequest"
  }

  // 5. Invalid Params (relays.add missing or malformed url)
  case
    codec.decode_request(
      "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"relays.add\",\"params\":{\"url\":\"not a valid url with spaces\"}}",
    )
  {
    Error(DecodeRpcError(id, code, _)) -> {
      assert id == Some(IntId(6))
      assert code == error_code.InvalidParams
    }
    Ok(_) -> panic as "Expected InvalidParams"
  }

  // 6. Invalid Params (nostr.signEvent missing draft)
  case
    codec.decode_request(
      "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"nostr.signEvent\"}",
    )
  {
    Error(DecodeRpcError(id, code, _)) -> {
      assert id == Some(IntId(7))
      assert code == error_code.InvalidParams
    }
    Ok(_) -> panic as "Expected InvalidParams"
  }
}
