//// Message types for `plugin_publisher`.

import plugin/publisher/model.{type StudioTab}

/// Messages handled by the `plugin_publisher` state machine.
pub type Msg {
  SelectTab(StudioTab)
  SetDraftId(String)
  SetDraftName(String)
  SetDraftVersion(String)
  SetDraftDescription(String)
  SetDraftIcon(String)
  SetBundleMetadata(sha256: String, size_bytes: Int)
  PublishPackage
  AddServer
  RemoveServer(url: String)
  ToggleServer(url: String)
  SetDraftServerUrl(String)
  SetBundleUrl(String)
  LoadBundle
  ChooseLocalZip
  UseTemplate
  DeletePublished(String)
  PublishServerList
  BundleLoaded(Result(String, String))
  DismissBanner
}
