//// Nostr relay wire protocol message frames and codecs (NIP-01, NIP-42).

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/result
import omni/nostr/event.{type Event}
import omni/nostr/event_codec
import omni/nostr/event_id.{type EventId}
import omni/nostr/filter.{type Filter}
import omni/nostr/filter_codec
import omni/nostr/internal/res

/// Frames sent from client to relay.
pub type ClientFrame {
  /// Request events matching filters under a subscription ID.
  Req(sub_id: String, filters: List(Filter))
  /// Close an active subscription.
  Close(sub_id: String)
  /// Publish a signed event.
  Event(event: Event)
  /// Authenticate to the relay (NIP-42).
  Auth(event: Event)
}

/// Frames sent from relay to client.
pub type RelayFrame {
  /// An event matching an active subscription.
  EventFrame(sub_id: String, event: Event)
  /// End of stored events marker for a subscription.
  Eose(sub_id: String)
  /// Relay acceptance or rejection of a published event.
  Ok(event_id: EventId, accepted: Bool, message: String)
  /// Human-readable administrative notice or warning.
  Notice(message: String)
  /// Authentication challenge string from relay (NIP-42).
  AuthChallenge(challenge: String)
  /// Subscription closed by relay with reason.
  Closed(sub_id: String, message: String)
}

/// Errors that can occur when parsing relay or client frames.
pub type DecodeError {
  /// Invalid JSON syntax.
  JsonError(json.DecodeError)
  /// Frame array structure did not match expected layout for the verb.
  InvalidFrameStructure(message: String)
  /// Unknown or unsupported wire verb.
  UnknownFrameType(verb: String)
  /// An event ID string could not be parsed as a 64-character hex ID.
  InvalidEventId(raw: String)
}

/// Serialize a `ClientFrame` to a JSON array string.
pub fn client_frame_to_json(frame: ClientFrame) -> String {
  case frame {
    Req(sub_id, filters) -> {
      let parts = [
        json.string("REQ"),
        json.string(sub_id),
        ..list.map(filters, filter_codec.to_json)
      ]
      json.preprocessed_array(parts) |> json.to_string
    }
    Close(sub_id) -> {
      json.preprocessed_array([json.string("CLOSE"), json.string(sub_id)])
      |> json.to_string
    }
    Event(ev) -> {
      json.preprocessed_array([
        json.string("EVENT"),
        event_codec.to_json(ev),
      ])
      |> json.to_string
    }
    Auth(ev) -> {
      json.preprocessed_array([json.string("AUTH"), event_codec.to_json(ev)])
      |> json.to_string
    }
  }
}

/// Serialize a `RelayFrame` to a JSON array string.
pub fn relay_frame_to_json(frame: RelayFrame) -> String {
  case frame {
    EventFrame(sub_id, ev) -> {
      json.preprocessed_array([
        json.string("EVENT"),
        json.string(sub_id),
        event_codec.to_json(ev),
      ])
      |> json.to_string
    }
    Eose(sub_id) -> {
      json.preprocessed_array([json.string("EOSE"), json.string(sub_id)])
      |> json.to_string
    }
    Ok(id, accepted, msg) -> {
      json.preprocessed_array([
        json.string("OK"),
        json.string(event_id.to_hex(id)),
        json.bool(accepted),
        json.string(msg),
      ])
      |> json.to_string
    }
    Notice(msg) -> {
      json.preprocessed_array([json.string("NOTICE"), json.string(msg)])
      |> json.to_string
    }
    AuthChallenge(challenge) -> {
      json.preprocessed_array([
        json.string("AUTH"),
        json.string(challenge),
      ])
      |> json.to_string
    }
    Closed(sub_id, msg) -> {
      json.preprocessed_array([
        json.string("CLOSED"),
        json.string(sub_id),
        json.string(msg),
      ])
      |> json.to_string
    }
  }
}

/// Parse a relay-to-client JSON frame string into a typed `RelayFrame`.
pub fn parse_relay_frame(raw_json: String) -> Result(RelayFrame, DecodeError) {
  use items <- result.try(result.map_error(
    json.parse(from: raw_json, using: decode.list(of: decode.dynamic)),
    JsonError,
  ))

  case items {
    [verb_dyn, ..rest] -> {
      use verb <- result.try(result.replace_error(
        decode.run(verb_dyn, decode.string),
        InvalidFrameStructure("First element of frame must be string verb"),
      ))
      parse_relay_verb(verb, rest)
    }
    [] -> Error(InvalidFrameStructure("Empty frame array"))
  }
}

fn parse_relay_verb(
  verb: String,
  rest: List(Dynamic),
) -> Result(RelayFrame, DecodeError) {
  case verb {
    "EVENT" ->
      case rest {
        [sub_id_dyn, event_dyn] -> {
          use sub_id <- result.try(result.replace_error(
            decode.run(sub_id_dyn, decode.string),
            InvalidFrameStructure("EVENT subscription ID must be string"),
          ))
          use ev <- result.try(result.replace_error(
            decode.run(event_dyn, event_codec.decoder()),
            InvalidFrameStructure("EVENT payload is not a valid Nostr Event"),
          ))
          res.ok(EventFrame(sub_id: sub_id, event: ev))
        }
        _ ->
          Error(InvalidFrameStructure("EVENT frame must have [sub_id, event]"))
      }

    "EOSE" ->
      case rest {
        [sub_id_dyn] -> {
          use sub_id <- result.try(result.replace_error(
            decode.run(sub_id_dyn, decode.string),
            InvalidFrameStructure("EOSE subscription ID must be string"),
          ))
          res.ok(Eose(sub_id: sub_id))
        }
        _ -> Error(InvalidFrameStructure("EOSE frame must have [sub_id]"))
      }

    "OK" ->
      case rest {
        [id_dyn, accepted_dyn, message_dyn] -> {
          use id_str <- result.try(result.replace_error(
            decode.run(id_dyn, decode.string),
            InvalidFrameStructure("OK event_id must be string"),
          ))
          use id <- result.try(result.replace_error(
            event_id.parse(id_str),
            InvalidEventId(id_str),
          ))
          use accepted <- result.try(result.replace_error(
            decode.run(accepted_dyn, decode.bool),
            InvalidFrameStructure("OK accepted must be bool"),
          ))
          use message <- result.try(result.replace_error(
            decode.run(message_dyn, decode.string),
            InvalidFrameStructure("OK message must be string"),
          ))
          res.ok(Ok(event_id: id, accepted: accepted, message: message))
        }
        _ ->
          Error(InvalidFrameStructure(
            "OK frame must have [event_id, accepted, message]",
          ))
      }

    "NOTICE" ->
      case rest {
        [msg_dyn] -> {
          use msg <- result.try(result.replace_error(
            decode.run(msg_dyn, decode.string),
            InvalidFrameStructure("NOTICE message must be string"),
          ))
          res.ok(Notice(message: msg))
        }
        _ -> Error(InvalidFrameStructure("NOTICE frame must have [message]"))
      }

    "AUTH" ->
      case rest {
        [challenge_dyn] -> {
          use challenge <- result.try(result.replace_error(
            decode.run(challenge_dyn, decode.string),
            InvalidFrameStructure("AUTH challenge must be string"),
          ))
          res.ok(AuthChallenge(challenge: challenge))
        }
        _ -> Error(InvalidFrameStructure("AUTH frame must have [challenge]"))
      }

    "CLOSED" ->
      case rest {
        [sub_id_dyn, msg_dyn] -> {
          use sub_id <- result.try(result.replace_error(
            decode.run(sub_id_dyn, decode.string),
            InvalidFrameStructure("CLOSED sub_id must be string"),
          ))
          use msg <- result.try(result.replace_error(
            decode.run(msg_dyn, decode.string),
            InvalidFrameStructure("CLOSED message must be string"),
          ))
          res.ok(Closed(sub_id: sub_id, message: msg))
        }
        _ ->
          Error(InvalidFrameStructure(
            "CLOSED frame must have [sub_id, message]",
          ))
      }

    other -> Error(UnknownFrameType(other))
  }
}

/// Parse a client-to-relay JSON frame string into a typed `ClientFrame`.
pub fn parse_client_frame(
  raw_json: String,
) -> Result(ClientFrame, DecodeError) {
  use items <- result.try(result.map_error(
    json.parse(from: raw_json, using: decode.list(of: decode.dynamic)),
    JsonError,
  ))

  case items {
    [verb_dyn, ..rest] -> {
      use verb <- result.try(result.replace_error(
        decode.run(verb_dyn, decode.string),
        InvalidFrameStructure("First element of frame must be string verb"),
      ))
      parse_client_verb(verb, rest)
    }
    [] -> Error(InvalidFrameStructure("Empty frame array"))
  }
}

fn parse_client_verb(
  verb: String,
  rest: List(Dynamic),
) -> Result(ClientFrame, DecodeError) {
  case verb {
    "REQ" ->
      case rest {
        [sub_id_dyn, ..filter_dyns] -> {
          use sub_id <- result.try(result.replace_error(
            decode.run(sub_id_dyn, decode.string),
            InvalidFrameStructure("REQ subscription ID must be string"),
          ))
          use filters <- result.try(
            list.try_map(filter_dyns, fn(f_dyn) {
              result.replace_error(
                decode.run(f_dyn, filter_codec.decoder()),
                InvalidFrameStructure("Invalid Filter in REQ frame"),
              )
            }),
          )
          res.ok(Req(sub_id: sub_id, filters: filters))
        }
        [] ->
          Error(InvalidFrameStructure(
            "REQ frame must have at least subscription ID",
          ))
      }

    "CLOSE" ->
      case rest {
        [sub_id_dyn] -> {
          use sub_id <- result.try(result.replace_error(
            decode.run(sub_id_dyn, decode.string),
            InvalidFrameStructure("CLOSE subscription ID must be string"),
          ))
          res.ok(Close(sub_id: sub_id))
        }
        _ -> Error(InvalidFrameStructure("CLOSE frame must have [sub_id]"))
      }

    "EVENT" ->
      case rest {
        [event_dyn] -> {
          use ev <- result.try(result.replace_error(
            decode.run(event_dyn, event_codec.decoder()),
            InvalidFrameStructure("EVENT payload is not a valid Nostr Event"),
          ))
          res.ok(Event(event: ev))
        }
        _ -> Error(InvalidFrameStructure("EVENT frame must have [event]"))
      }

    "AUTH" ->
      case rest {
        [event_dyn] -> {
          use ev <- result.try(result.replace_error(
            decode.run(event_dyn, event_codec.decoder()),
            InvalidFrameStructure("AUTH payload is not a valid Nostr Event"),
          ))
          res.ok(Auth(event: ev))
        }
        _ -> Error(InvalidFrameStructure("AUTH frame must have [event]"))
      }

    other -> Error(UnknownFrameType(other))
  }
}
