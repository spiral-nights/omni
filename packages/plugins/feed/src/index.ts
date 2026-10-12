/// <reference types="@omni/types" />

function formatTime(unixSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function mountFeed(root: any) {
  const isRemote = typeof root.createElement === "function";
  const createElement = (tag: string) => isRemote ? root.createElement(tag) : document.createElement(tag);

  const container = createElement("div");
  container.className = "feed-container";

  // A. Note Composer Card
  const composerCard = createElement("div");
  composerCard.className = "composer-card";

  const textarea = createElement("textarea");
  textarea.className = "composer-input";
  textarea.setAttribute("placeholder", "What's happening?");
  textarea.setAttribute("rows", "2");

  const composerFooter = createElement("div");
  composerFooter.className = "composer-footer";

  const btnPublish = createElement("button");
  btnPublish.className = "btn-publish";
  btnPublish.textContent = "Publish Note";

  composerFooter.appendChild(btnPublish);
  composerCard.appendChild(textarea);
  composerCard.appendChild(composerFooter);
  container.appendChild(composerCard);

  // B. Header Row
  const headerRow = createElement("div");
  headerRow.setAttribute("style", "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; flex-wrap: wrap;");

  const heading = createElement("h2");
  heading.setAttribute("style", "font-size: 0.95rem; font-weight: 600; color: var(--omni-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 0;");
  heading.textContent = "Timeline Feed";

  const headerRight = createElement("div");
  headerRight.setAttribute("style", "display: flex; align-items: center; gap: 8px;");

  const cacheIndicator = createElement("span");
  cacheIndicator.setAttribute("style", "font-size: 0.72rem; color: var(--omni-accent-primary); display: flex; align-items: center; gap: 4px;");
  cacheIndicator.textContent = "✦ 0ms Local Cache";

  const btnRefresh = createElement("button");
  btnRefresh.className = "btn-refresh-feed";
  btnRefresh.textContent = "↻ Refresh";

  headerRight.appendChild(cacheIndicator);
  headerRight.appendChild(btnRefresh);
  headerRow.appendChild(heading);
  headerRow.appendChild(headerRight);
  container.appendChild(headerRow);

  // C. New Posts Pill (Bluesky-style)
  const newPostsPill = createElement("button");
  newPostsPill.className = "new-posts-pill";
  newPostsPill.setAttribute("style", "display: none;");
  container.appendChild(newPostsPill);

  // D. Notes List
  const notesList = createElement("div");
  notesList.className = "notes-list";

  const loadingText = createElement("div");
  loadingText.setAttribute("style", "text-align: center; color: var(--omni-text-muted); padding: 24px 0; font-size: 0.85rem;");
  loadingText.textContent = "Loading timeline notes...";
  notesList.appendChild(loadingText);
  container.appendChild(notesList);

  // E. Load Older Notes Button (Pagination)
  const btnLoadMore = createElement("button");
  btnLoadMore.className = "btn-load-more";
  btnLoadMore.textContent = "Load Older Notes";
  btnLoadMore.setAttribute("style", "display: none;");
  container.appendChild(btnLoadMore);

  root.appendChild(container);

  const renderedIds = new Set<string>();
  let oldestTimestamp = Infinity;
  let latestTimestamp = 0;
  const pendingNewNotes: any[] = [];
  let isInitialBatchComplete = false;
  let activeWs: any = null;

  function updateNewPostsPill() {
    const count = pendingNewNotes.length;
    if (count > 0) {
      newPostsPill.textContent = `✦ ${count} New Note${count > 1 ? "s" : ""} · Click to view`;
      newPostsPill.setAttribute("style", "display: flex;");
    } else {
      newPostsPill.setAttribute("style", "display: none;");
    }
  }

  function renderNote(event: any, prepend = false) {
    if (renderedIds.has(event.id)) return;
    renderedIds.add(event.id);

    if (loadingText.parentElement) {
      loadingText.remove();
    }
    btnLoadMore.setAttribute("style", "display: block;");

    if (event.created_at && event.created_at < oldestTimestamp) {
      oldestTimestamp = event.created_at;
    }
    if (event.created_at && event.created_at > latestTimestamp) {
      latestTimestamp = event.created_at;
    }

    const card = createElement("article");
    card.className = "note-card";

    // Note Header
    const noteHeader = createElement("div");
    noteHeader.className = "note-header";

    const authorSpan = createElement("span");
    authorSpan.className = "note-author";
    const shortAuthor = event.pubkey ? `npub:${event.pubkey.slice(0, 6)}...${event.pubkey.slice(-4)}` : "anonymous";
    authorSpan.textContent = shortAuthor;

    const metaSpan = createElement("span");
    metaSpan.className = "note-meta";
    metaSpan.textContent = event.created_at ? formatTime(event.created_at) : "just now";

    noteHeader.appendChild(authorSpan);
    noteHeader.appendChild(metaSpan);

    // Note Content
    const noteContent = createElement("div");
    noteContent.className = "note-content";
    noteContent.textContent = event.content || "";

    // Note Actions
    const actions = createElement("div");
    actions.className = "note-actions";

    const btnReply = createElement("button");
    btnReply.className = "note-action-btn";
    btnReply.textContent = "Reply";

    const btnLike = createElement("button");
    btnLike.className = "note-action-btn";
    let likes = 0;
    btnLike.textContent = "Like";
    btnLike.addEventListener("click", () => {
      likes++;
      btnLike.textContent = `Liked (${likes})`;
      btnLike.setAttribute("style", "color: var(--omni-accent-primary);");
    });

    actions.appendChild(btnReply);
    actions.appendChild(btnLike);

    card.appendChild(noteHeader);
    card.appendChild(noteContent);
    card.appendChild(actions);

    if (prepend && notesList.firstChild) {
      notesList.insertBefore(card, notesList.firstChild);
    } else {
      notesList.appendChild(card);
    }
  }

  function handleIncomingEvent(event: any, fromCache = false) {
    if (renderedIds.has(event.id)) return;

    if (!isInitialBatchComplete || fromCache) {
      // Initial chronological notes appended cleanly
      renderNote(event, false);
    } else {
      // Like Bluesky: buffer live notes so reading isn't interrupted by jumping DOM
      if (!pendingNewNotes.some((n) => n.id === event.id)) {
        pendingNewNotes.unshift(event);
        updateNewPostsPill();
      }
    }
  }

  newPostsPill.addEventListener("click", () => {
    while (pendingNewNotes.length > 0) {
      const note = pendingNewNotes.pop();
      renderNote(note, true);
    }
    updateNewPostsPill();
  });

  // Refresh Feed button handler
  btnRefresh.addEventListener("click", () => {
    // 1. Reveal any buffered notes
    while (pendingNewNotes.length > 0) {
      const note = pendingNewNotes.pop();
      renderNote(note, true);
    }
    updateNewPostsPill();

    // 2. Query for new events since latestTimestamp
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      const refreshSubId = `refresh-${Date.now()}`;
      const sinceTime = latestTimestamp > 0 ? latestTimestamp : Math.floor(Date.now() / 1000) - 120;
      activeWs.send(JSON.stringify(["REQ", refreshSubId, { kinds: [1], since: sinceTime, limit: 30 }]));
      btnRefresh.textContent = "↻ Fetching...";
      setTimeout(() => {
        btnRefresh.textContent = "↻ Refresh";
      }, 1500);
    }
  });

  // Load More Notes (Bottom pagination)
  btnLoadMore.addEventListener("click", () => {
    if (oldestTimestamp === Infinity) return;
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      btnLoadMore.textContent = "Loading older notes...";
      btnLoadMore.setAttribute("disabled", "true");
      const olderSubId = `older-${Date.now()}`;
      activeWs.send(JSON.stringify(["REQ", olderSubId, { kinds: [1], until: oldestTimestamp - 1, limit: 25 }]));
    }
  });

  // Publish Note Handler
  btnPublish.addEventListener("click", async () => {
    const text = textarea.value?.trim();
    if (!text) return;

    btnPublish.setAttribute("disabled", "true");
    btnPublish.textContent = "Signing...";

    try {
      const nostr = (window as any).nostr || (typeof omni !== "undefined" ? (omni as any).nostr : null);
      if (nostr) {
        let published: any;
        if (typeof nostr.publish === "function") {
          published = await nostr.publish({
            kind: 1,
            content: text,
            tags: [["client", "omni"]],
            created_at: Math.floor(Date.now() / 1000)
          });
        } else if (typeof nostr.signEvent === "function") {
          published = await nostr.signEvent({
            kind: 1,
            content: text,
            tags: [["client", "omni"]],
            created_at: Math.floor(Date.now() / 1000)
          });
          if (activeWs && activeWs.readyState === WebSocket.OPEN) {
            activeWs.send(JSON.stringify(["EVENT", published]));
          }
        }

        if (published) {
          textarea.value = "";
          renderNote(
            {
              id: published.id,
              pubkey: published.pubkey,
              content: text,
              created_at: Math.floor(Date.now() / 1000)
            },
            true
          );
        }
      }
    } catch (err: any) {
      console.error("Failed to publish note from plugin:", err);
    } finally {
      btnPublish.removeAttribute("disabled");
      btnPublish.textContent = "Publish Note";
    }
  });

  // Subscribe to Timeline Notes via standard WebSocket
  try {
    if (typeof WebSocket !== "undefined") {
      const ws = new WebSocket("wss://relay.damus.io");
      activeWs = ws;

      ws.onopen = () => {
        // 1. Bounded initial query: fetch the latest 30 notes
        ws.send(JSON.stringify(["REQ", "feed-initial", { kinds: [1], limit: 30 }]));
        setTimeout(() => {
          if (!isInitialBatchComplete) {
            isInitialBatchComplete = true;
          }
        }, 500);
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          const type = data[0];
          const subId = data[1];

          if (type === "EVENT" && data[2]) {
            handleIncomingEvent(data[2]);
          } else if (type === "EOSE") {
            if (subId === "feed-initial") {
              isInitialBatchComplete = true;
              cacheIndicator.textContent = "✦ Connected Relays";
              // Close the initial backfill query
              ws.send(JSON.stringify(["CLOSE", "feed-initial"]));
              // Subscribe to live new notes going forward with a bounded timestamp
              ws.send(JSON.stringify(["REQ", "feed-live", { kinds: [1], since: Math.floor(Date.now() / 1000) }]));
            } else if (subId?.startsWith("older-")) {
              btnLoadMore.textContent = "Load Older Notes";
              btnLoadMore.removeAttribute("disabled");
              ws.send(JSON.stringify(["CLOSE", subId]));
            } else if (subId?.startsWith("refresh-")) {
              btnRefresh.textContent = "↻ Refresh";
              ws.send(JSON.stringify(["CLOSE", subId]));
            }
          }
        } catch {}
      };
    } else if (typeof omni !== "undefined" && (omni as any).nostr?.subscribe) {
      (omni as any).nostr.subscribe(
        [{ kinds: [1], limit: 30 }],
        (ev: any) => {
          handleIncomingEvent(ev);
        },
        () => {
          isInitialBatchComplete = true;
          cacheIndicator.textContent = "✦ Connected Relays";
        }
      );
    }
  } catch (err) {
    console.error("Feed subscription failed:", err);
  }
}

function init() {
  if (typeof document !== "undefined") {
    mountFeed(document.body);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
