import gleam/bit_array
import gleam/list
import gleam/option.{Some}
import gleam/string
import omni/nostr/event_id
import omni/nostr/kind
import omni/nostr/pubkey
import omni/protocol/capability
import omni/protocol/grant
import omni/protocol/viewport
import omni/testkit/generators
import qcheck

pub fn pubkey_generator_test() {
  let config = qcheck.default_config() |> qcheck.with_test_count(50)
  qcheck.run(config, generators.pubkey(), fn(pk) {
    let hex = pubkey.to_hex(pk)
    assert string.length(hex) == 64
    let assert Ok(parsed) = pubkey.parse(hex)
    assert pubkey.to_hex(parsed) == hex

    let bytes = pubkey.to_bytes(pk)
    assert bit_array.byte_size(bytes) == 32
  })
}

pub fn event_id_generator_test() {
  let config = qcheck.default_config() |> qcheck.with_test_count(50)
  qcheck.run(config, generators.event_id(), fn(id) {
    let hex = event_id.to_hex(id)
    assert string.length(hex) == 64
    let assert Ok(parsed) = event_id.parse(hex)
    assert event_id.to_hex(parsed) == hex

    let bytes = event_id.to_bytes(id)
    assert bit_array.byte_size(bytes) == 32
  })
}

pub fn kind_generator_test() {
  let config = qcheck.default_config() |> qcheck.with_test_count(50)
  qcheck.run(config, generators.kind(), fn(k) {
    let code = kind.to_int(k)
    assert code >= 0
    assert kind.from_int(code) == k
  })
}

pub fn unsigned_event_generator_test() {
  let config = qcheck.default_config() |> qcheck.with_test_count(30)
  qcheck.run(config, generators.unsigned_event(), fn(draft) {
    assert draft.created_at >= 1_600_000_000
    assert draft.created_at <= 2_000_000_000
    case draft.pubkey {
      Some(pk) -> {
        assert string.length(pubkey.to_hex(pk)) == 64
        Nil
      }
      _ -> Nil
    }
  })
}

pub fn event_generator_test() {
  let config = qcheck.default_config() |> qcheck.with_test_count(30)
  qcheck.run(config, generators.event(), fn(ev) {
    assert string.length(event_id.to_hex(ev.id)) == 64
    assert string.length(pubkey.to_hex(ev.pubkey)) == 64
    assert string.length(ev.sig) == 128
    assert ev.created_at >= 1_600_000_000
  })
}

pub fn filter_generator_test() {
  let config = qcheck.default_config() |> qcheck.with_test_count(30)
  qcheck.run(config, generators.filter(), fn(f) {
    case f.ids {
      Some(ids) -> {
        list.each(ids, fn(id) {
          assert string.length(id) == 64
        })
        Nil
      }
      _ -> Nil
    }
    case f.authors {
      Some(authors) -> {
        list.each(authors, fn(a) {
          assert string.length(a) == 64
        })
        Nil
      }
      _ -> Nil
    }
    case f.limit {
      Some(limit) -> {
        assert limit > 0
        Nil
      }
      _ -> Nil
    }
  })
}

pub fn capability_generator_test() {
  let config = qcheck.default_config() |> qcheck.with_test_count(20)
  qcheck.run(config, generators.capability(), fn(cap) {
    let wire = capability.to_string(cap)
    let assert Ok(parsed) = capability.parse(wire)
    assert parsed == cap
  })
}

pub fn grant_generator_test() {
  let config = qcheck.default_config() |> qcheck.with_test_count(20)
  qcheck.run(config, generators.grant(), fn(g) {
    let wire = grant.to_string(g)
    let assert Ok(parsed) = grant.parse(wire)
    assert parsed == g
  })
}

pub fn viewport_generator_test() {
  let config = qcheck.default_config() |> qcheck.with_test_count(20)
  qcheck.run(config, generators.viewport(), fn(vp) {
    let wire = viewport.to_string(vp)
    let assert Ok(parsed) = viewport.parse(wire)
    assert parsed == vp
  })
}
