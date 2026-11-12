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
  StartZap(note_id: String)
  SetZapAmount(String)
  SetZapComment(String)
  SendZap
  CancelZap
  /// Host returned the Lightning invoice (`Ok`) or an error message (`Error`).
  ZapInvoiceResult(Result(String, String))
  PayInvoice(String)
  SetSearchQuery(String)
  SubmitSearch
  LoadMore
  ToggleShowReplies
  ToggleInlineMedia
  IngestEvent(Event)
  IngestEvents(List(Event))
}
