//// Message ADT for `plugin_notes`.

import plugin/notes/model.{type NotebookFolder}

/// All user and system messages handled by `plugin_notes`.
pub type Msg {
  CreateNote
  SelectNote(id: String)
  DeleteNote(id: String)
  ToggleStar(id: String)
  ToggleArchive(id: String)
  SetDraftTitle(String)
  SetDraftContent(String)
  AddTag(String)
  RemoveTag(String)
  SetSearchQuery(String)
  SelectFolder(NotebookFolder)
  SaveActiveNote
  ToggleEncryptedSync
}
