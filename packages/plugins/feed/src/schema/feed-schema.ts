import type { OmniComponentNode } from "@omni/types";
import type { FeedSchemaState } from "../types.js";
import { currentFeedState, schemaFollowingPubkeys, schemaMyUserPubkey } from "../state.js";
import { profileCache, extractDisplayName } from "../net/profiles.js";
import { loadInlineImagesPreference } from "../filter/filter-settings.js";
import { renderSchemaThreadView } from "./thread-schema.js";

export function getFeedSchema(
  view = "main",
  state: FeedSchemaState = currentFeedState
): OmniComponentNode {
  if (view === "compact") {
    const latest = state.notes[0];
    return {
      type: "metric",
      label: "Timeline Notes",
      value: `${state.notes.length} notes`,
      subtext: latest
        ? `Latest: ${latest.authorName}: "${latest.content.slice(0, 24)}..."`
        : "No notes yet"
    };
  }

  if (view === "widget") {
    const recentItems: any[] = state.notes.slice(0, 3).map((n) => ({
      type: "list-item" as const,
      id: n.id,
      title: n.authorName,
      subtitle: n.content,
      actions: [
        {
          type: "icon-button" as const,
          icon: "heart",
          variant: n.liked ? ("secondary" as const) : ("ghost" as const),
          tooltip: "Like note",
          action: { name: "like-note", payload: { id: n.id } }
        }
      ]
    }));

    if (recentItems.length === 0) {
      recentItems.push({
        type: "list-item" as const,
        id: "empty",
        title: "No recent notes",
        subtitle: "Broadcast a note or connect to relays",
        actions: []
      });
    }

    return {
      type: "card",
      title: "Recent Notes",
      icon: "message",
      children: [
        {
          type: "box",
          direction: "row",
          gap: "sm",
          children: [
            {
              type: "input",
              name: "noteText",
              placeholder: "Quick note...",
              actionOnEnter: { name: "publish-note" }
            },
            {
              type: "button",
              label: "Post",
              variant: "primary",
              size: "sm",
              action: { name: "publish-note" }
            }
          ]
        },
        {
          type: "list",
          items: recentItems
        }
      ]
    };
  }

  // Thread Conversation View
  if (state.activeThreadNoteId) {
    return renderSchemaThreadView(state);
  }

  // Full-page / Main View (100% Declarative Schema Feed)
  const isFollowing = state.activeTab === "following";
  const displayedNotes = state.notes.filter((note) => {
    if (isFollowing) {
      const hasFollows = Array.from(schemaFollowingPubkeys).some((pk) => pk !== schemaMyUserPubkey);
      if (hasFollows) {
        return schemaFollowingPubkeys.has(note.pubkey) || note.id?.startsWith("note_");
      }
      return true;
    }
    return true;
  });

  const noteNodes: OmniComponentNode[] = displayedNotes.map((n) => {
    const cachedAuthor = profileCache.get(n.pubkey);
    const resolvedName = extractDisplayName(cachedAuthor);
    const authorDisplayName = (n.authorName && !n.authorName.startsWith("nostr:"))
      ? n.authorName
      : (resolvedName || n.authorName);

    return {
      type: "card",
      action: { name: "view-thread", payload: { id: n.id } },
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
              action: {
                name: "view-profile",
                payload: { pubkey: n.pubkey }
              },
              children: [
                {
                  type: "avatar",
                  pubkey: n.pubkey,
                  name: authorDisplayName,
                  size: "md",
                  action: {
                    name: "view-profile",
                    payload: { pubkey: n.pubkey }
                  }
                },
                {
                  type: "box",
                  direction: "column",
                  gap: "xs",
                  children: [
                    {
                      type: "text",
                      content: authorDisplayName,
                      variant: "body",
                      tone: "primary"
                    },
                    {
                      type: "text",
                      content: `${new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${n.npub.slice(0, 12)}...`,
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
          content: n.content,
          variant: "body",
          showInlineImages: loadInlineImagesPreference(),
          action: { name: "view-thread", payload: { id: n.id } }
        },
        {
          type: "divider"
        },
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
              label: String(n.replies || "0"),
              action: { name: "view-thread", payload: { id: n.id } }
            },
            {
              type: "button",
              variant: n.reposted ? "secondary" : "ghost",
              size: "sm",
              icon: "repeat",
              label: String(n.reposts || "0"),
              action: { name: "repost-note", payload: { id: n.id } }
            },
            {
              type: "button",
              variant: n.liked ? "secondary" : "ghost",
              size: "sm",
              icon: "heart",
              label: String(n.likes || "0"),
              action: { name: "like-note", payload: { id: n.id } }
            },
            {
              type: "button",
              variant: "ghost",
              size: "sm",
              icon: "zap",
              label: String(n.zaps || "0"),
              action: { name: "zap-note", payload: { id: n.id } }
            }
          ]
        }
      ]
    };
  });

  const streamChildren: OmniComponentNode[] =
    noteNodes.length > 0
      ? noteNodes
      : [
          {
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
                    content: "No notes on this timeline yet",
                    variant: "body",
                    tone: "muted"
                  },
                  {
                    type: "text",
                    content: "Follow creators in Profiles or broadcast your first note above to populate the feed.",
                    variant: "caption",
                    tone: "muted"
                  }
                ]
              }
            ]
          }
        ];

  return {
    type: "box",
    direction: "column",
    gap: "md",
    children: [
      // Top timeline header
      {
        type: "box",
        direction: "row",
        justify: "between",
        align: "center",
        padding: "sm",
        children: [
          {
            type: "box",
            direction: "row",
            gap: "sm",
            align: "center",
            children: [
              {
                type: "text",
                content: "Feed",
                variant: "title"
              },
              {
                type: "button",
                size: "sm",
                variant: state.activeTab === "following" ? "primary" : "ghost",
                label: "Following",
                action: { name: "set-tab", payload: { tab: "following" } }
              },
              {
                type: "button",
                size: "sm",
                variant: state.activeTab === "global" ? "primary" : "ghost",
                label: "Global",
                action: { name: "set-tab", payload: { tab: "global" } }
              }
            ]
          },
          {
            type: "icon-button",
            icon: "refresh",
            tooltip: "Refresh Feed",
            variant: "ghost",
            action: { name: "refresh" }
          }
        ]
      },
      // Composer card
      {
        type: "card",
        children: [
          {
            type: "box",
            direction: "column",
            gap: "sm",
            children: [
              {
                type: "box",
                direction: "row",
                gap: "sm",
                align: "center",
                children: [
                  {
                    type: "avatar",
                    name: " ", // empty avatar
                    size: "sm"
                  },
                  {
                    type: "text",
                    content: "Publish to Nostr relays",
                    variant: "caption",
                    tone: "muted"
                  }
                ]
              },
              {
                type: "textarea",
                name: "noteText",
                placeholder: "What's happening? Compose note to broadcast...",
                value: state.composerText || "",
                rows: 3
              },
              {
                type: "box",
                direction: "row",
                justify: "between",
                align: "center",
                children: [
                  {
                    type: "text",
                    content: "NIP-07 signer connected",
                    variant: "caption",
                    tone: "muted"
                  },
                  {
                    type: "button",
                    label: "Publish Note",
                    variant: "primary",
                    size: "sm",
                    action: { name: "publish-note" }
                  }
                ]
              }
            ]
          }
        ]
      },
      // Stream
      ...streamChildren,
      // Load More Action
      {
        type: "box",
        direction: "row",
        justify: "center",
        padding: "md",
        children: [
          {
            type: "button",
            label: "Load More Notes",
            variant: "secondary",
            size: "sm",
            action: { name: "load-more" }
          }
        ]
      }
    ]
  };
}
