//// Host relay-pool mutations requested by a plugin application.

pub type RelayCommand {
  AddRelay(url: String)
  RemoveRelay(url: String)
  SetRelayScope(url: String, read: Bool, write: Bool)
  ReconnectRelay(url: String)
}
