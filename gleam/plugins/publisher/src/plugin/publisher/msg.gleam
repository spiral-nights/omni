//// Message types for `plugin_publisher`.

import plugin/publisher/model.{
  type PackagingMode, type PublishedPlugin, type StudioTab,
}

/// Messages handled by the `plugin_publisher` state machine.
pub type Msg {
  SelectTab(StudioTab)
  SetDraftId(String)
  SetDraftName(String)
  SetDraftVersion(String)
  SetDraftDescription(String)
  SetDraftIcon(String)
  SetBundleMetadata(sha256: String, size_bytes: Int)
  SetPackagingMode(PackagingMode)
  PublishPackage
  InstallLocal
  AddServer
  RemoveServer(url: String)
  ToggleServer(url: String)
  SetDraftServerUrl(String)
  SetBundleUrl(String)
  LoadBundle
  FetchUrl
  InstallFromUrl
  ChooseLocalZip
  ChooseLocalFile
  SingleFileLoaded(filename: String, content: String)
  UseTemplate
  DeletePublished(String)
  QueryRelays
  RelaysQueried(Result(List(PublishedPlugin), String))
  OpenNaddr(String)
  PrepareUpdate(String)
  PublishServerList
  BundleLoaded(Result(String, String))
  UploadReported(path: String, servers: List(#(String, Bool)))
  DismissBanner
}
