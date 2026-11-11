//// The level at which a user answered a permission prompt.

/// A stored or prompted permission answer.
pub type Grant {
  /// Persisted across sessions.
  Always
  /// Valid until the page is closed.
  Session
  /// Persisted refusal.
  Deny
}

/// Parse the wire/storage name of a grant.
pub fn parse(name: String) -> Result(Grant, Nil) {
  case name {
    "always" -> Ok(Always)
    "session" -> Ok(Session)
    "deny" -> Ok(Deny)
    _ -> Error(Nil)
  }
}

/// The wire/storage name of a grant.
pub fn to_string(grant: Grant) -> String {
  case grant {
    Always -> "always"
    Session -> "session"
    Deny -> "deny"
  }
}

/// True when the grant lets the action proceed.
pub fn permits(grant: Grant) -> Bool {
  case grant {
    Always | Session -> True
    Deny -> False
  }
}
