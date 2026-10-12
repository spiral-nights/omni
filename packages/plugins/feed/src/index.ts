/// <reference types="@omni/types" />

/**
 * Native zero-dependency HTML template helper using standard <template>.
 */
function html<T extends HTMLElement = HTMLElement>(
  strings: TemplateStringsArray,
  ...values: any[]
): T {
  const template = document.createElement("template");
  template.innerHTML = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "").trim();
  return template.content.firstElementChild as T;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  const container = html<HTMLDivElement>`
    <div class="feed-container" style="color: var(--text-primary, #ede8df);">
      <!-- Note Composer Card -->
      <div class="composer-card" style="background: var(--bg-surface, #191816); border: 1px solid var(--border-strong, #383530); border-radius: var(--radius-md, 10px); padding: 14px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px;">
        <textarea class="composer-input" placeholder="What's happening?" rows="2" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-subtle, #272522); color: var(--text-primary, #ede8df); padding: 10px 12px; border-radius: var(--radius-sm, 6px); font-family: inherit; font-size: 0.88rem; outline: none; resize: vertical;"></textarea>
        <div class="composer-footer" style="display: flex; justify-content: flex-end;">
          <button class="btn-publish" style="background: var(--accent-primary, #d4a373); color: var(--accent-contrast, #141312); border: none; border-radius: var(--radius-sm, 6px); padding: 7px 16px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">Publish Note</button>
        </div>
      </div>

      <!-- Header Row -->
      <div class="feed-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; flex-wrap: wrap;">
        <h2 style="font-size: 0.95rem; font-weight: 600; color: var(--text-secondary, #a8a29e); text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">Timeline Feed</h2>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="cache-indicator" style="font-size: 0.72rem; color: var(--accent-primary, #d4a373); display: flex; align-items: center; gap: 4px;">✦ 0ms Local Cache</span>
          <button class="btn-refresh-feed" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-subtle, #272522); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">↻ Refresh</button>
        </div>
      </div>

      <!-- New Posts Pill (Bluesky-style) -->
      <button class="new-posts-pill" style="display: none; align-self: center; margin: 0 auto 12px auto; background: var(--accent-primary, #d4a373); color: var(--accent-contrast, #141312); border: none; border-radius: var(--radius-pill, 9999px); padding: 6px 16px; font-size: 0.78rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3);"></button>

      <!-- Notes List -->
      <div class="notes-list" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="loading-text" style="text-align: center; color: var(--text-muted, #78716c); padding: 24px 0; font-size: 0.85rem;">Loading timeline notes...</div>
      </div>

      <!-- Load Older Notes Button (Pagination) -->
      <button class="btn-load-more" style="display: none; margin: 16px auto 0 auto; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-secondary, #a8a29e); border-radius: var(--radius-sm, 6px); padding: 8px 18px; font-size: 0.8rem; cursor: pointer;">Load Older Notes</button>
    </div>
  `;

  const textarea = container.querySelector<HTMLTextAreaElement>(".composer-input")!;
  const btnPublish = container.querySelector<HTMLButtonElement>(".btn-publish")!;
  const cacheIndicator = container.querySelector<HTMLElement>(".cache-indicator")!;
  const btnRefresh = container.querySelector<HTMLButtonElement>(".btn-refresh-feed")!;
  const newPostsPill = container.querySelector<HTMLButtonElement>(".new-posts-pill")!;
  const notesList = container.querySelector<HTMLDivElement>(".notes-list")!;
  const loadingText = container.querySelector<HTMLDivElement>(".loading-text")!;
  const btnLoadMore = container.querySelector<HTMLButtonElement>(".btn-load-more")!;

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
      newPostsPill.style.display = "flex";
    } else {
      newPostsPill.style.display = "none";
    }
  }

  function renderNote(event: any, prepend = false) {
    if (renderedIds.has(event.id)) return;
    renderedIds.add(event.id);

    if (loadingText.parentElement) {
      loadingText.remove();
    }
    btnLoadMore.style.display = "block";

    if (event.created_at && event.created_at < oldestTimestamp) {
      oldestTimestamp = event.created_at;
    }
    if (event.created_at && event.created_at > latestTimestamp) {
      latestTimestamp = event.created_at;
    }

    const shortAuthor = event.pubkey ? `npub:${event.pubkey.slice(0, 6)}...${event.pubkey.slice(-4)}` : "anonymous";
    const timeStr = event.created_at ? formatTime(event.created_at) : "just now";

    const card = html<HTMLElement>`
      <article class="note-card" style="background: var(--bg-surface, #191816); border: 1px solid var(--border-subtle, #272522); border-radius: var(--radius-md, 10px); padding: 14px; display: flex; flex-direction: column; gap: 8px; color: var(--text-primary, #ede8df);">
        <div class="note-header" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
          <span class="note-author" style="font-family: var(--font-mono, monospace); font-weight: 600; color: var(--accent-primary, #d4a373);">${escapeHtml(shortAuthor)}</span>
          <span class="note-meta" style="color: var(--text-muted, #78716c);">${escapeHtml(timeStr)}</span>
        </div>
        <div class="note-content" style="font-size: 0.88rem; line-height: 1.45; word-break: break-word; white-space: pre-wrap;">${escapeHtml(event.content || "")}</div>
        <div class="note-actions" style="display: flex; gap: 12px; margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--border-subtle, #272522);">
          <button class="note-action-btn btn-reply" style="background: transparent; border: none; color: var(--text-muted, #78716c); font-size: 0.75rem; cursor: pointer; padding: 2px 4px;">Reply</button>
          <button class="note-action-btn btn-like" style="background: transparent; border: none; color: var(--text-muted, #78716c); font-size: 0.75rem; cursor: pointer; padding: 2px 4px;">Like</button>
        </div>
      </article>
    `;

    const btnLike = card.querySelector<HTMLButtonElement>(".btn-like")!;
    let likes = 0;
    btnLike.addEventListener("click", () => {
      likes++;
      btnLike.textContent = `Liked (${likes})`;
      btnLike.style.color = "var(--accent-primary, #d4a373)";
    });

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
      // Buffer live notes so reading isn't interrupted by jumping DOM
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
    while (pendingNewNotes.length > 0) {
      const note = pendingNewNotes.pop();
      renderNote(note, true);
    }
    updateNewPostsPill();

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
      btnLoadMore.disabled = true;
      const olderSubId = `older-${Date.now()}`;
      activeWs.send(JSON.stringify(["REQ", olderSubId, { kinds: [1], until: oldestTimestamp - 1, limit: 25 }]));
    }
  });

  // Publish Note Handler
  btnPublish.addEventListener("click", async () => {
    const text = textarea.value?.trim();
    if (!text) return;

    btnPublish.disabled = true;
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
      btnPublish.disabled = false;
      btnPublish.textContent = "Publish Note";
    }
  });

  // Subscribe to Timeline Notes via standard WebSocket
  try {
    if (typeof WebSocket !== "undefined") {
      const ws = new WebSocket("wss://relay.damus.io");
      activeWs = ws;

      ws.onopen = () => {
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
              ws.send(JSON.stringify(["CLOSE", "feed-initial"]));
              ws.send(JSON.stringify(["REQ", "feed-live", { kinds: [1], since: Math.floor(Date.now() / 1000) }]));
            } else if (subId?.startsWith("older-")) {
              btnLoadMore.textContent = "Load Older Notes";
              btnLoadMore.disabled = false;
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
