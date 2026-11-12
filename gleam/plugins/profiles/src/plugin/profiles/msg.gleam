//// Message ADT for the Omni Profiles plugin (`plugin_profiles`).

import omni/nostr/event.{type Event}
import plugin/profiles/model.{type ProfilesView}

/// All messages handled by `plugin/profiles/update.update`.
pub type Msg {
  SelectView(ProfilesView)
  SelectProfile(pubkey: String)
  SetSearchQuery(String)
  ToggleFollow(pubkey: String)
  SetMetadataName(String)
  SetMetadataAbout(String)
  SetMetadataPicture(String)
  SaveMetadata
  RefreshSigner
  SetPubkey(String)
  IngestEvent(Event)
  IngestEvents(List(Event))
}
