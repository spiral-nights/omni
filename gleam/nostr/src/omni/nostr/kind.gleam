//// Nostr event kinds (NIP-01 and standard extensions).
////
//// Maps well-known Nostr event kinds to typed constructors, with an `Other(Int)`
//// fallback for non-standard or unmodeled kinds.

/// Nostr event kinds.
pub type Kind {
  Metadata
  Note
  ContactList
  DirectMessage
  Repost
  Reaction
  Seal
  GiftWrap
  Zap
  RelayList
  Bookmark
  Longform
  AppData
  Other(Int)
}

/// Convert a `Kind` to its integer code.
pub fn to_int(kind: Kind) -> Int {
  case kind {
    Metadata -> 0
    Note -> 1
    ContactList -> 3
    DirectMessage -> 4
    Repost -> 6
    Reaction -> 7
    Seal -> 14
    GiftWrap -> 1059
    Zap -> 9735
    RelayList -> 10_002
    Bookmark -> 30_000
    Longform -> 30_023
    AppData -> 30_078
    Other(code) -> code
  }
}

/// Parse an integer kind code into a typed `Kind`.
pub fn from_int(code: Int) -> Kind {
  case code {
    0 -> Metadata
    1 -> Note
    3 -> ContactList
    4 -> DirectMessage
    6 -> Repost
    7 -> Reaction
    14 -> Seal
    1059 -> GiftWrap
    9735 -> Zap
    10_002 -> RelayList
    30_000 -> Bookmark
    30_023 -> Longform
    30_078 -> AppData
    other -> Other(other)
  }
}

/// Returns true if this kind carries private/encrypted messages:
/// - NIP-04 DirectMessage (4)
/// - NIP-17 Seal (14)
/// - NIP-17 GiftWrap (1059)
pub fn is_sensitive(kind: Kind) -> Bool {
  case to_int(kind) {
    4 | 14 | 1059 -> True
    _ -> False
  }
}
