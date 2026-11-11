//// Message ADT for the Omni Feed plugin (`plugin_feed`).

import omni/nostr/event.{type Event}
import plugin/feed/model.{type FeedTab, type FeedView}

/// All messages handled by `plugin/feed/update.update`.
pub type Msg {
  SelectTab(FeedTab)
  SelectView(FeedView)
  OpenThread(note_id: String)
  NavigateBack
  SetComposerDraft(String)
  SetComposerDraftAndPublish(text: String)
  PublishNote
  StartReply(note_id: String)
  SetReplyDraft(String)
  PublishReply(parent_id: String)
  LikeNote(note_id: String)
  RepostNote(note_id: String)
  ZapNote(note_id: String)
  SetSearchQuery(String)
  LoadMore
  ToggleShowReplies
  ToggleInlineMedia
  IngestEvent(Event)
  IngestEvents(List(Event))
}
