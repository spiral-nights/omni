//// Permission categories a plugin can be granted.
////
//// Replaces the stringly-typed categories ("nostr:sign", "storage:kv", ...)
//// so that every permission decision is an exhaustive `case`.

/// A capability a plugin may request from the kernel.
pub type Capability {
  NostrRead
  NostrWrite
  NostrSign
  NostrEncrypt
  StorageKv
  IntentsDispatch
  IntentsHandle
  RelaysManage
  IdentityManageKeys
  SystemGeolocation
}

/// Parse the wire name of a capability (e.g. `"nostr:sign"`).
pub fn parse(name: String) -> Result(Capability, Nil) {
  case name {
    "nostr:read" -> Ok(NostrRead)
    "nostr:write" -> Ok(NostrWrite)
    "nostr:sign" -> Ok(NostrSign)
    "nostr:encrypt" -> Ok(NostrEncrypt)
    "storage:kv" -> Ok(StorageKv)
    "intents:dispatch" -> Ok(IntentsDispatch)
    "intents:handle" -> Ok(IntentsHandle)
    "relays:manage" -> Ok(RelaysManage)
    "identity:manage_keys" -> Ok(IdentityManageKeys)
    "system:geolocation" -> Ok(SystemGeolocation)
    _ -> Error(Nil)
  }
}

/// The wire name of a capability.
pub fn to_string(capability: Capability) -> String {
  case capability {
    NostrRead -> "nostr:read"
    NostrWrite -> "nostr:write"
    NostrSign -> "nostr:sign"
    NostrEncrypt -> "nostr:encrypt"
    StorageKv -> "storage:kv"
    IntentsDispatch -> "intents:dispatch"
    IntentsHandle -> "intents:handle"
    RelaysManage -> "relays:manage"
    IdentityManageKeys -> "identity:manage_keys"
    SystemGeolocation -> "system:geolocation"
  }
}
