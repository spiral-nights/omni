import gleam/result
import omni/nostr/event.{Event}
import omni/nostr/event_id
import omni/nostr/filter
import omni/nostr/kind
import omni/nostr/pubkey
import omni/nostr/relay_frame

fn sample_event() {
  let assert Ok(id) =
    event_id.parse(
      "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770",
    )
  let assert Ok(pk) =
    pubkey.parse(
      "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
    )
  Event(
    id: id,
    pubkey: pk,
    created_at: 1_672_531_200,
    kind: kind.Note,
    tags: [["e", "ref1"]],
    content: "Wire frame test note",
    sig: "sigbytes",
  )
}

pub fn client_req_frame_test() {
  let f1 = filter.new() |> filter.with_kinds([kind.Note])
  let frame = relay_frame.Req(sub_id: "feed-sub", filters: [f1])
  let json_str = relay_frame.client_frame_to_json(frame)

  let assert Ok(relay_frame.Req(sub_id, filters)) =
    relay_frame.parse_client_frame(json_str)
  assert sub_id == "feed-sub"
  assert filters == [f1]
}

pub fn client_close_frame_test() {
  let frame = relay_frame.Close(sub_id: "feed-sub")
  let json_str = relay_frame.client_frame_to_json(frame)
  assert json_str == "[\"CLOSE\",\"feed-sub\"]"

  let assert Ok(relay_frame.Close(sub_id)) =
    relay_frame.parse_client_frame(json_str)
  assert sub_id == "feed-sub"
}

pub fn client_event_and_auth_frame_test() {
  let ev = sample_event()
  let frame_ev = relay_frame.Event(event: ev)
  let json_ev = relay_frame.client_frame_to_json(frame_ev)
  let assert Ok(relay_frame.Event(parsed_ev)) =
    relay_frame.parse_client_frame(json_ev)
  assert parsed_ev == ev

  let frame_auth = relay_frame.Auth(event: ev)
  let json_auth = relay_frame.client_frame_to_json(frame_auth)
  let assert Ok(relay_frame.Auth(parsed_auth)) =
    relay_frame.parse_client_frame(json_auth)
  assert parsed_auth == ev
}

pub fn relay_event_frame_test() {
  let ev = sample_event()
  let frame = relay_frame.EventFrame(sub_id: "sub-1", event: ev)
  let json_str = relay_frame.relay_frame_to_json(frame)

  let assert Ok(relay_frame.EventFrame(sub_id, parsed_ev)) =
    relay_frame.parse_relay_frame(json_str)
  assert sub_id == "sub-1"
  assert parsed_ev == ev
}

pub fn relay_eose_frame_test() {
  let frame = relay_frame.Eose(sub_id: "sub-1")
  let json_str = relay_frame.relay_frame_to_json(frame)
  assert json_str == "[\"EOSE\",\"sub-1\"]"

  let assert Ok(relay_frame.Eose(sub_id)) =
    relay_frame.parse_relay_frame(json_str)
  assert sub_id == "sub-1"
}

pub fn relay_ok_frame_test() {
  let assert Ok(id) =
    event_id.parse(
      "a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770",
    )
  let frame =
    relay_frame.Ok(
      event_id: id,
      accepted: True,
      message: "saved: event accepted",
    )
  let json_str = relay_frame.relay_frame_to_json(frame)
  assert json_str
    == "[\"OK\",\"a2a0a221516e86ad09ad15bf73d6fe8e329ebc43f848caec0a383d46a815a770\",true,\"saved: event accepted\"]"

  let assert Ok(relay_frame.Ok(parsed_id, accepted, msg)) =
    relay_frame.parse_relay_frame(json_str)
  assert parsed_id == id
  assert accepted == True
  assert msg == "saved: event accepted"
}

pub fn relay_notice_auth_closed_frames_test() {
  let notice = relay_frame.Notice("rate limited: slow down")
  let json_notice = relay_frame.relay_frame_to_json(notice)
  let assert Ok(relay_frame.Notice(msg)) =
    relay_frame.parse_relay_frame(json_notice)
  assert msg == "rate limited: slow down"

  let auth = relay_frame.AuthChallenge("challenge-token-xyz")
  let json_auth = relay_frame.relay_frame_to_json(auth)
  let assert Ok(relay_frame.AuthChallenge(token)) =
    relay_frame.parse_relay_frame(json_auth)
  assert token == "challenge-token-xyz"

  let closed =
    relay_frame.Closed(sub_id: "sub-1", message: "duplicate subscription")
  let json_closed = relay_frame.relay_frame_to_json(closed)
  let assert Ok(relay_frame.Closed(sub_id, reason)) =
    relay_frame.parse_relay_frame(json_closed)
  assert sub_id == "sub-1"
  assert reason == "duplicate subscription"
}

pub fn relay_frame_error_handling_test() {
  assert relay_frame.parse_relay_frame("[\"UNKNOWN\", 123]") |> result.is_error
  assert relay_frame.parse_relay_frame(
      "[\"OK\", \"invalid-id\", true, \"msg\"]",
    )
    |> result.is_error
  assert relay_frame.parse_relay_frame("not json") |> result.is_error
  assert relay_frame.parse_relay_frame("[]") |> result.is_error
}
