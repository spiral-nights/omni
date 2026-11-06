import type { OmniComponentNode } from "@omni/types";
import type { FeedNoteItem, FeedSchemaState } from "../types.js";
import { schemaThreadReplies, allKnownNotes } from "../state.js";
import { profileCache, extractDisplayName } from "../net/profiles.js";
import { loadInlineImagesPreference } from "../filter/filter-settings.js";

function resolveFeedNoteItem(id: string, notes: FeedNoteItem[]): FeedNoteItem | null {
  if (!id) return null;
  const inNotes = notes.find((n) => n.id === id);
  if (inNotes) return inNotes;

  for (const list of schemaThreadReplies.values()) {
    const found = list.find((r) => r.id === id);
    if (found) return found;
  }

  const ev = allKnownNotes.get(id);
  if (ev) {
    const author = profileCache.get(ev.pubkey);
    const authorName = extractDisplayName(author) || (ev.pubkey ? `nostr:${ev.pubkey.slice(0, 8)}` : "Nostr User");
    const eTags = (ev.tags || []).filter((t: any[]) => t[0] === "e" && t[1]);
    const markedRoot = eTags.find((t: any[]) => t[3] === "root")?.[1];
    const markedReply = eTags.find((t: any[]) => t[3] === "reply")?.[1];
    const rootId = markedRoot || (eTags.length > 0 ? eTags[0][1] : undefined);
    const replyToId = markedReply || (eTags.length > 0 ? eTags[eTags.length - 1][1] : undefined);
    const pTags = (ev.tags || []).filter((t: any[]) => t[0] === "p" && t[1]);
    const replyToPubkey = pTags.length > 0 ? pTags[0][1] : undefined;
    let replyToAuthor = "";
    if (replyToPubkey) {
      const repAuthor = profileCache.get(replyToPubkey);
      replyToAuthor = extractDisplayName(repAuthor) || "";
    }

    const createdTime = typeof ev.created_at === "number"
      ? (ev.created_at > 1e11 ? ev.created_at : ev.created_at * 1000)
      : Date.now();

    return {
      id: ev.id,
      pubkey: ev.pubkey || "",
      authorName,
      npub: ev.pubkey ? `npub1${ev.pubkey.slice(0, 8)}...` : "npub1...",
      avatar: author?.picture,
      content: ev.content || "",
      created_at: createdTime,
      likes: ev.likes || 0,
      reposts: ev.reposts || 0,
      replies: schemaThreadReplies.get(ev.id)?.length || 0,
      zaps: ev.zaps || 0,
      replyToId,
      replyToPubkey,
      replyToAuthor: replyToAuthor || undefined,
      rootId
    };
  }

  return null;
}

export function renderSchemaThreadView(state: FeedSchemaState): OmniComponentNode {
  const activeTid = state.activeThreadNoteId!;
  const focused = resolveFeedNoteItem(activeTid, state.notes);

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
          action: { name: "close-thread", payload: { isBack: true }, navigate: { back: true } }
        }
      ]
    }
  ];

  if (focused) {
    // 1. Resolve full ancestor chain (notes that come before focused note)
    const ancestors: FeedNoteItem[] = [];
    const ancestorIdsSeen = new Set<string>([focused.id]);

    let currentParentId = focused.replyToId;
    while (currentParentId && !ancestorIdsSeen.has(currentParentId)) {
      ancestorIdsSeen.add(currentParentId);
      const parentItem = resolveFeedNoteItem(currentParentId, state.notes);
      if (parentItem) {
        ancestors.unshift(parentItem);
        currentParentId = parentItem.replyToId;
      } else {
        break;
      }
    }

    if (focused.rootId && !ancestorIdsSeen.has(focused.rootId)) {
      ancestorIdsSeen.add(focused.rootId);
      const rootItem = resolveFeedNoteItem(focused.rootId, state.notes);
      if (rootItem) {
        ancestors.unshift(rootItem);
      }
    }

    const focusedEv = allKnownNotes.get(focused.id);
    const extraETags = (focusedEv?.tags || []).filter((t: any[]) => t[0] === "e" && t[1]);
    for (const t of extraETags) {
      const eid = t[1];
      if (!ancestorIdsSeen.has(eid)) {
        ancestorIdsSeen.add(eid);
        const item = resolveFeedNoteItem(eid, state.notes);
        if (item) {
          ancestors.push(item);
        }
      }
    }
    ancestors.sort((a, b) => a.created_at - b.created_at);

    // Render Ancestor Notes (notes before the focused note)
    if (ancestors.length > 0) {
      threadChildren.push({
        type: "box",
        direction: "column",
        gap: "xs",
        padding: "xs",
        children: [
          {
            type: "text",
            content: `Thread Conversation (${ancestors.length + 1} notes)`,
            variant: "caption",
            tone: "muted"
          }
        ]
      });

      for (let i = 0; i < ancestors.length; i++) {
        const anc = ancestors[i];
        const isRoot = i === 0 && (anc.id === focused.rootId || ancestors.length > 1);
        const ancAuthor = profileCache.get(anc.pubkey);
        const ancResolvedName = extractDisplayName(ancAuthor);
        const ancDisplayName = (anc.authorName && !anc.authorName.startsWith("nostr:"))
          ? anc.authorName
          : (ancResolvedName || anc.authorName);

        threadChildren.push({
          type: "card",
          action: { name: "view-thread", payload: { id: anc.id } },
          style: "border-left: 3px solid var(--omni-border-subtle, #33312c); margin-bottom: 2px;",
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
                  action: { name: "view-profile", payload: { pubkey: anc.pubkey } },
                  children: [
                    {
                      type: "avatar",
                      pubkey: anc.pubkey,
                      name: ancDisplayName,
                      size: "sm",
                      action: { name: "view-profile", payload: { pubkey: anc.pubkey } }
                    },
                    {
                      type: "box",
                      direction: "column",
                      gap: "xs",
                      children: [
                        {
                          type: "box",
                          direction: "row",
                          align: "center",
                          gap: "xs",
                          children: [
                            { type: "text", content: ancDisplayName, variant: "body", tone: "primary" },
                            {
                              type: "badge",
                              label: isRoot ? "Root Note" : "In Thread",
                              variant: isRoot ? "solid" : "subtle",
                              tone: isRoot ? "accent" : "neutral"
                            }
                          ]
                        },
                        {
                          type: "text",
                          content: `${new Date(anc.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} · ${anc.npub.slice(0, 12)}...`,
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
              content: anc.content,
              variant: "body",
              showInlineImages: loadInlineImagesPreference(),
              action: { name: "view-thread", payload: { id: anc.id } }
            },
            {
              type: "box",
              direction: "row",
              justify: "between",
              align: "center",
              style: "opacity: 0.75; font-size: 0.85em;",
              children: [
                {
                  type: "button",
                  variant: "ghost",
                  size: "sm",
                  icon: "reply",
                  label: String(anc.replies || schemaThreadReplies.get(anc.id)?.length || "0"),
                  action: { name: "view-thread", payload: { id: anc.id } }
                },
                {
                  type: "button",
                  variant: anc.liked ? "secondary" : "ghost",
                  size: "sm",
                  icon: "heart",
                  label: String(anc.likes || "0"),
                  action: { name: "like-note", payload: { id: anc.id } }
                }
              ]
            }
          ]
        });

        // Connector line between notes
        threadChildren.push({
          type: "box",
          align: "start",
          style: "padding-left: 24px; margin: -4px 0;",
          children: [
            {
              type: "box",
              style: "width: 2px; height: 12px; background: var(--omni-border-subtle, #33312c); border-radius: 1px;",
              children: []
            }
          ]
        });
      }
    }

    // 2. Focused Note Card (prominently styled active focal point)
    const focusedAuthor = profileCache.get(focused.pubkey);
    const focusedResolvedName = extractDisplayName(focusedAuthor);
    const focusedDisplayName = (focused.authorName && !focused.authorName.startsWith("nostr:"))
      ? focused.authorName
      : (focusedResolvedName || focused.authorName);

    // Direct replies list
    const directReplies = schemaThreadReplies.get(focused.id) || [];
    const allDescendantIds = new Set<string>();
    const descendantList: FeedNoteItem[] = [];

    const collectDescendants = (parentId: string) => {
      const reps = schemaThreadReplies.get(parentId) || [];
      for (const r of reps) {
        if (!allDescendantIds.has(r.id) && r.id !== focused.id && !ancestorIdsSeen.has(r.id)) {
          allDescendantIds.add(r.id);
          descendantList.push(r);
          collectDescendants(r.id);
        }
      }
    };
    collectDescendants(focused.id);
    descendantList.sort((a, b) => a.created_at - b.created_at);

    threadChildren.push({
      type: "card",
      style: "border: 1px solid var(--omni-accent-primary, #d4a373); box-shadow: 0 0 12px rgba(212, 163, 115, 0.08);",
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
              label: String(focused.replies || descendantList.length),
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

    // 3. Reply Composer
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

    // 4. Replies Section (notes that come after focused note)
    threadChildren.push({
      type: "box",
      padding: "sm",
      children: [
        {
          type: "text",
          content: `Replies (${descendantList.length})`,
          variant: "title"
        }
      ]
    });

    if (descendantList.length === 0) {
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
      for (const rep of descendantList) {
        const repAuthor = profileCache.get(rep.pubkey);
        const repResolvedName = extractDisplayName(repAuthor);
        const repDisplayName = (rep.authorName && !rep.authorName.startsWith("nostr:"))
          ? rep.authorName
          : (repResolvedName || rep.authorName);

        threadChildren.push({
          type: "card",
          action: { name: "view-thread", payload: { id: rep.id } },
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
              showInlineImages: loadInlineImagesPreference(),
              action: { name: "view-thread", payload: { id: rep.id } }
            },
            {
              type: "box",
              direction: "row",
              justify: "between",
              align: "center",
              style: "opacity: 0.75; font-size: 0.85em;",
              children: [
                {
                  type: "button",
                  variant: "ghost",
                  size: "sm",
                  icon: "reply",
                  label: String(rep.replies || schemaThreadReplies.get(rep.id)?.length || "0"),
                  action: { name: "view-thread", payload: { id: rep.id } }
                },
                {
                  type: "button",
                  variant: rep.liked ? "secondary" : "ghost",
                  size: "sm",
                  icon: "heart",
                  label: String(rep.likes || "0"),
                  action: { name: "like-note", payload: { id: rep.id } }
                }
              ]
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
    page: {
      id: `thread:${activeTid}`,
      title: "Note Conversation",
      url: `?note=${activeTid}`,
      state: { view: "thread", id: activeTid }
    },
    children: threadChildren
  };
}
