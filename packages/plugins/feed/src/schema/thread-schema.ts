import type { OmniComponentNode } from "@omni/types";
import type { FeedNoteItem, FeedSchemaState } from "../types.js";
import { schemaThreadReplies, allKnownNotes } from "../state.js";
import { profileCache, extractDisplayName } from "../net/profiles.js";
import { loadInlineImagesPreference } from "../filter/filter-settings.js";

export function renderSchemaThreadView(state: FeedSchemaState): OmniComponentNode {
  const activeTid = state.activeThreadNoteId!;
  let focused = state.notes.find((n) => n.id === activeTid);
  if (!focused) {
    for (const repList of schemaThreadReplies.values()) {
      const found = repList.find((r) => r.id === activeTid);
      if (found) {
        focused = found;
        break;
      }
    }
  }
  if (!focused) {
    const ev = allKnownNotes.get(activeTid);
    if (ev) {
      const author = profileCache.get(ev.pubkey);
      focused = {
        id: ev.id,
        pubkey: ev.pubkey,
        authorName: author?.display_name || author?.name || (ev.pubkey ? `nostr:${ev.pubkey.slice(0, 8)}` : "Nostr User"),
        npub: ev.pubkey ? `npub1${ev.pubkey.slice(0, 8)}...` : "npub1...",
        avatar: author?.picture,
        content: ev.content || "",
        created_at: (ev.created_at || Math.floor(Date.now() / 1000)) * 1000,
        likes: 0,
        reposts: 0,
        replies: schemaThreadReplies.get(ev.id)?.length || 0,
        zaps: 0
      };
    }
  }
  const replies = (focused ? schemaThreadReplies.get(focused.id) : schemaThreadReplies.get(activeTid)) || [];

  const threadChildren: OmniComponentNode[] = [
    {
      type: "box",
      direction: "row",
      align: "center",
      justify: "between",
      padding: "sm",
      children: [
        {
          type: "button",
          label: "← Back to Feed",
          variant: "secondary",
          size: "sm",
          action: { name: "close-thread" }
        }
      ]
    }
  ];

  if (focused) {
    const focusedAuthor = profileCache.get(focused.pubkey);
    const focusedResolvedName = extractDisplayName(focusedAuthor);
    const focusedDisplayName = (focused.authorName && !focused.authorName.startsWith("nostr:"))
      ? focused.authorName
      : (focusedResolvedName || focused.authorName);

    threadChildren.push({
      type: "card",
      children: [
        {
          type: "box",
          direction: "row",
          justify: "between",
          align: "center",
          children: [
            {
              type: "box",
              direction: "row",
              gap: "sm",
              align: "center",
              action: { name: "view-profile", payload: { pubkey: focused.pubkey } },
              children: [
                {
                  type: "avatar",
                  pubkey: focused.pubkey,
                  name: focusedDisplayName,
                  size: "md",
                  action: { name: "view-profile", payload: { pubkey: focused.pubkey } }
                },
                {
                  type: "box",
                  direction: "column",
                  gap: "xs",
                  children: [
                    { type: "text", content: focusedDisplayName, variant: "title" },
                    {
                      type: "text",
                      content: `${new Date(focused.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} · ${focused.npub}`,
                      variant: "caption",
                      tone: "muted"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "text",
          content: focused.content,
          variant: "body",
          showInlineImages: loadInlineImagesPreference()
        },
        { type: "divider" },
        {
          type: "box",
          direction: "row",
          justify: "between",
          align: "center",
          children: [
            {
              type: "button",
              variant: "ghost",
              size: "sm",
              icon: "reply",
              label: String(focused.replies || replies.length),
              action: { name: "view-thread", payload: { id: focused.id } }
            },
            {
              type: "button",
              variant: focused.reposted ? "secondary" : "ghost",
              size: "sm",
              icon: "repeat",
              label: String(focused.reposts || "0"),
              action: { name: "repost-note", payload: { id: focused.id } }
            },
            {
              type: "button",
              variant: focused.liked ? "secondary" : "ghost",
              size: "sm",
              icon: "heart",
              label: String(focused.likes || "0"),
              action: { name: "like-note", payload: { id: focused.id } }
            },
            {
              type: "button",
              variant: "ghost",
              size: "sm",
              icon: "zap",
              label: String(focused.zaps || "0"),
              action: { name: "zap-note", payload: { id: focused.id } }
            }
          ]
        }
      ]
    });

    // Reply Composer
    threadChildren.push({
      type: "card",
      children: [
        {
          type: "box",
          direction: "column",
          gap: "sm",
          children: [
            {
              type: "textarea",
              name: "replyText",
              placeholder: `Post your reply to ${focused.authorName}...`,
              rows: 2
            },
            {
              type: "box",
              direction: "row",
              justify: "end",
              children: [
                {
                  type: "button",
                  label: "Reply",
                  variant: "primary",
                  size: "sm",
                  action: { name: "publish-reply", payload: { replyToId: focused.id } }
                }
              ]
            }
          ]
        }
      ]
    });

    // Replies Section
    threadChildren.push({
      type: "box",
      padding: "sm",
      children: [
        {
          type: "text",
          content: `Replies (${replies.length})`,
          variant: "title"
        }
      ]
    });

    if (replies.length === 0) {
      threadChildren.push({
        type: "card",
        children: [
          {
            type: "box",
            direction: "column",
            align: "center",
            gap: "xs",
            children: [
              { type: "text", content: "No replies to this note yet.", variant: "body", tone: "muted" },
              { type: "text", content: "Write a reply above to start the conversation.", variant: "caption", tone: "muted" }
            ]
          }
        ]
      });
    } else {
      for (const rep of replies) {
        const repAuthor = profileCache.get(rep.pubkey);
        const repResolvedName = extractDisplayName(repAuthor);
        const repDisplayName = (rep.authorName && !rep.authorName.startsWith("nostr:"))
          ? rep.authorName
          : (repResolvedName || rep.authorName);

        threadChildren.push({
          type: "card",
          children: [
            {
              type: "box",
              direction: "row",
              justify: "between",
              align: "center",
              children: [
                {
                  type: "box",
                  direction: "row",
                  gap: "sm",
                  align: "center",
                  action: { name: "view-profile", payload: { pubkey: rep.pubkey } },
                  children: [
                    {
                      type: "avatar",
                      pubkey: rep.pubkey,
                      name: repDisplayName,
                      size: "sm",
                      action: { name: "view-profile", payload: { pubkey: rep.pubkey } }
                    },
                    {
                      type: "box",
                      direction: "column",
                      gap: "xs",
                      children: [
                        { type: "text", content: repDisplayName, variant: "body", tone: "primary" },
                        {
                          type: "text",
                          content: `${new Date(rep.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${rep.npub.slice(0, 12)}...`,
                          variant: "caption",
                          tone: "muted"
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              type: "text",
              content: rep.content,
              variant: "body",
              showInlineImages: loadInlineImagesPreference()
            }
          ]
        });
      }
    }
  } else {
    threadChildren.push({
      type: "card",
      children: [
        {
          type: "box",
          direction: "column",
          align: "center",
          gap: "sm",
          padding: "md",
          children: [
            {
              type: "text",
              content: "Loading conversation thread...",
              variant: "body",
              tone: "muted"
            },
            {
              type: "text",
              content: `Fetching note ${activeTid.slice(0, 16)}...`,
              variant: "caption",
              tone: "muted"
            }
          ]
        }
      ]
    });
  }

  return {
    type: "box",
    direction: "column",
    gap: "md",
    children: threadChildren
  };
}
