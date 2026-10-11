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
  headerRow.setAttribute("style", "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;");

  const heading = createElement("h2");
  heading.setAttribute("style", "font-size: 0.95rem; font-weight: 600; color: var(--omni-text-secondary); text-transform: uppercase; letter-spacing: 0.05em;");
  heading.textContent = "Timeline Feed";

  const cacheIndicator = createElement("span");
  cacheIndicator.setAttribute("style", "font-size: 0.75rem; color: var(--omni-accent-primary); display: flex; align-items: center; gap: 4px;");
  cacheIndicator.textContent = "✦ 0ms Local Cache";

  headerRow.appendChild(heading);
  headerRow.appendChild(cacheIndicator);
  container.appendChild(headerRow);

  // C. Notes List
  const notesList = createElement("div");
  notesList.className = "notes-list";

  const loadingText = createElement("div");
  loadingText.setAttribute("style", "text-align: center; color: var(--omni-text-muted); padding: 24px 0; font-size: 0.85rem;");
  loadingText.textContent = "Loading timeline notes...";
  notesList.appendChild(loadingText);
  container.appendChild(notesList);

  root.appendChild(container);

  const renderedIds = new Set<string>();

  function renderNote(event: any, prepend = false) {
    if (renderedIds.has(event.id)) return;
    renderedIds.add(event.id);

    if (loadingText.parentElement) {
      loadingText.remove();
    }

    const card = createElement("article");
    card.className = "note-card";

    // Note Header
    const noteHeader = createElement("div");
    noteHeader.className = "note-header";

    const authorSpan = createElement("span");
    authorSpan.className = "note-author";
    const shortAuthor = `npub:${event.pubkey.slice(0, 6)}...${event.pubkey.slice(-4)}`;
    authorSpan.textContent = shortAuthor;

    const metaSpan = createElement("span");
    metaSpan.className = "note-meta";
    metaSpan.textContent = formatTime(event.created_at);

    noteHeader.appendChild(authorSpan);
    noteHeader.appendChild(metaSpan);

    // Note Content
    const noteContent = createElement("div");
    noteContent.className = "note-content";
    noteContent.textContent = event.content;

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
          try {
            const ws = new WebSocket("wss://relay.damus.io");
            ws.onopen = () => {
              ws.send(JSON.stringify(["EVENT", published]));
            };
          } catch {}
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
      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "feed-sub", { kinds: [1], limit: 50 }]));
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data[0] === "EVENT" && data[2]) {
            renderNote(data[2], true);
          } else if (data[0] === "EOSE") {
            cacheIndicator.textContent = "✦ Connected Relays";
          }
        } catch {}
      };
    } else if (typeof omni !== "undefined" && (omni as any).nostr?.subscribe) {
      (omni as any).nostr.subscribe(
        [{ kinds: [1], limit: 50 }],
        (ev: any) => {
          renderNote(ev, true);
        },
        () => {
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
