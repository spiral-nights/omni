//// `qcheck` property-based testing generators for Omni core types and Nostr entities.

import gleam/bit_array
import gleam/dict.{type Dict}
import gleam/string
import omni/nostr/event.{type Event, type UnsignedEvent}
import omni/nostr/event_id.{type EventId}
import omni/nostr/filter.{type Filter}
import omni/nostr/kind.{type Kind}
import omni/nostr/pubkey.{type Pubkey}
import omni/protocol/capability.{type Capability}
import omni/protocol/grant.{type Grant}
import omni/protocol/viewport.{type Viewport}
import qcheck.{type Generator}

/// Generator producing valid 32-byte Nostr public keys.
pub fn pubkey() -> Generator(Pubkey) {
  use bytes <- qcheck.map(qcheck.fixed_size_byte_aligned_bit_array(32))
  let assert Ok(pk) = pubkey.from_bytes(bytes)
  pk
}

/// Alias for `pubkey`.
pub fn pubkey_generator() -> Generator(Pubkey) {
  pubkey()
}

/// Generator producing valid 32-byte Nostr event IDs.
pub fn event_id() -> Generator(EventId) {
  use bytes <- qcheck.map(qcheck.fixed_size_byte_aligned_bit_array(32))
  let assert Ok(id) = event_id.from_bytes(bytes)
  id
}

/// Alias for `event_id`.
pub fn event_id_generator() -> Generator(EventId) {
  event_id()
}

/// Generator producing Nostr event kinds (both well-known kinds and arbitrary integer kinds).
pub fn kind() -> Generator(Kind) {
  let standard_kinds = [
    qcheck.constant(kind.Metadata),
    qcheck.constant(kind.Note),
    qcheck.constant(kind.ContactList),
    qcheck.constant(kind.DirectMessage),
    qcheck.constant(kind.Repost),
    qcheck.constant(kind.Reaction),
    qcheck.constant(kind.Seal),
    qcheck.constant(kind.GiftWrap),
    qcheck.constant(kind.Zap),
    qcheck.constant(kind.RelayList),
    qcheck.constant(kind.Bookmark),
    qcheck.constant(kind.Longform),
    qcheck.constant(kind.AppData),
  ]
  let arbitrary_kind = qcheck.map(qcheck.bounded_int(0, 65_535), kind.from_int)
  qcheck.from_generators(arbitrary_kind, standard_kinds)
}

/// Alias for `kind`.
pub fn kind_generator() -> Generator(Kind) {
  kind()
}

fn tag_generator() -> Generator(List(String)) {
  let tag_name_gen =
    qcheck.generic_string(
      qcheck.alphanumeric_ascii_codepoint(),
      qcheck.bounded_int(1, 4),
    )
  let tag_value_gen =
    qcheck.generic_string(
      qcheck.alphanumeric_ascii_codepoint(),
      qcheck.bounded_int(1, 32),
    )
  qcheck.map2(tag_name_gen, qcheck.list_from(tag_value_gen), fn(name, values) {
    [name, ..values]
  })
}

/// Generator producing unsigned Nostr event drafts.
pub fn unsigned_event() -> Generator(UnsignedEvent) {
  use pk <- qcheck.bind(qcheck.option_from(pubkey()))
  use created_at <- qcheck.bind(qcheck.bounded_int(1_600_000_000, 2_000_000_000))
  use k <- qcheck.bind(kind())
  use tags <- qcheck.bind(qcheck.list_from(tag_generator()))
  use content <- qcheck.map(qcheck.generic_string(
    qcheck.printable_ascii_codepoint(),
    qcheck.bounded_int(0, 140),
  ))

  event.UnsignedEvent(
    pubkey: pk,
    created_at: created_at,
    kind: k,
    tags: tags,
    content: content,
  )
}

/// Alias for `unsigned_event`.
pub fn unsigned_event_generator() -> Generator(UnsignedEvent) {
  unsigned_event()
}

fn schnorr_sig_generator() -> Generator(String) {
  use bytes <- qcheck.map(qcheck.fixed_size_byte_aligned_bit_array(64))
  string.lowercase(bit_array.base16_encode(bytes))
}

/// Generator producing signed Nostr events.
pub fn event() -> Generator(Event) {
  use id <- qcheck.bind(event_id())
  use pk <- qcheck.bind(pubkey())
  use created_at <- qcheck.bind(qcheck.bounded_int(1_600_000_000, 2_000_000_000))
  use k <- qcheck.bind(kind())
  use tags <- qcheck.bind(qcheck.list_from(tag_generator()))
  use content <- qcheck.bind(qcheck.generic_string(
    qcheck.printable_ascii_codepoint(),
    qcheck.bounded_int(0, 140),
  ))
  use sig <- qcheck.map(schnorr_sig_generator())

  event.Event(
    id: id,
    pubkey: pk,
    created_at: created_at,
    kind: k,
    tags: tags,
    content: content,
    sig: sig,
  )
}

/// Alias for `event`.
pub fn event_generator() -> Generator(Event) {
  event()
}

fn tag_dict_generator() -> Generator(Dict(String, List(String))) {
  let tag_entry = {
    use name <- qcheck.bind(
      qcheck.from_generators(qcheck.constant("e"), [
        qcheck.constant("p"),
        qcheck.constant("d"),
        qcheck.constant("t"),
      ]),
    )
    use vals <- qcheck.map(
      qcheck.list_from(qcheck.generic_string(
        qcheck.alphanumeric_ascii_codepoint(),
        qcheck.bounded_int(1, 16),
      )),
    )
    #(name, vals)
  }
  use entries <- qcheck.map(qcheck.list_from(tag_entry))
  dict.from_list(entries)
}

/// Generator producing Nostr subscription filters.
pub fn filter() -> Generator(Filter) {
  let id_hex_gen = qcheck.map(event_id(), event_id.to_hex)
  let author_hex_gen = qcheck.map(pubkey(), pubkey.to_hex)

  use ids <- qcheck.bind(qcheck.option_from(qcheck.list_from(id_hex_gen)))
  use authors <- qcheck.bind(
    qcheck.option_from(qcheck.list_from(author_hex_gen)),
  )
  use kinds <- qcheck.bind(qcheck.option_from(qcheck.list_from(kind())))
  use since <- qcheck.bind(
    qcheck.option_from(qcheck.bounded_int(1_600_000_000, 1_800_000_000)),
  )
  use until <- qcheck.bind(
    qcheck.option_from(qcheck.bounded_int(1_800_000_000, 2_000_000_000)),
  )
  use limit <- qcheck.bind(qcheck.option_from(qcheck.bounded_int(1, 200)))
  use search <- qcheck.bind(
    qcheck.option_from(qcheck.generic_string(
      qcheck.alphanumeric_ascii_codepoint(),
      qcheck.bounded_int(3, 20),
    )),
  )
  use tags <- qcheck.map(tag_dict_generator())

  filter.Filter(
    ids: ids,
    authors: authors,
    kinds: kinds,
    since: since,
    until: until,
    limit: limit,
    search: search,
    tags: tags,
  )
}

/// Alias for `filter`.
pub fn filter_generator() -> Generator(Filter) {
  filter()
}

/// Generator producing kernel Capabilities.
pub fn capability() -> Generator(Capability) {
  qcheck.from_generators(qcheck.constant(capability.NostrRead), [
    qcheck.constant(capability.NostrWrite),
    qcheck.constant(capability.NostrSign),
    qcheck.constant(capability.NostrEncrypt),
    qcheck.constant(capability.StorageKv),
    qcheck.constant(capability.IntentsDispatch),
    qcheck.constant(capability.IntentsHandle),
    qcheck.constant(capability.RelaysManage),
    qcheck.constant(capability.IdentityManageKeys),
    qcheck.constant(capability.SystemGeolocation),
  ])
}

/// Alias for `capability`.
pub fn capability_generator() -> Generator(Capability) {
  capability()
}

/// Generator producing user Grants.
pub fn grant() -> Generator(Grant) {
  qcheck.from_generators(qcheck.constant(grant.Always), [
    qcheck.constant(grant.Session),
    qcheck.constant(grant.Deny),
  ])
}

/// Alias for `grant`.
pub fn grant_generator() -> Generator(Grant) {
  grant()
}

/// Generator producing companion Viewport slots.
pub fn viewport() -> Generator(Viewport) {
  qcheck.from_generators(qcheck.constant(viewport.Main), [
    qcheck.constant(viewport.Dock),
    qcheck.constant(viewport.Sidebar),
    qcheck.constant(viewport.HeaderStatus),
    qcheck.constant(viewport.HeaderActions),
  ])
}

/// Alias for `viewport`.
pub fn viewport_generator() -> Generator(Viewport) {
  viewport()
}
