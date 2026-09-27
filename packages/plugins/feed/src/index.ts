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

if (typeof omni !== "undefined") {
  // 1. Register Feed Dock Icon
  omni.registerComponent("feed-dock-icon", ({ root }) => {
    const btn = root.createElement("button");
    btn.className = "dock-item active";
    btn.title = "Timeline Feed";

    const iconWrapper = root.createElement("div");
    iconWrapper.className = "dock-icon-wrapper";

    const svg = root.createElement("svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.75");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    const path = root.createElement("path");
    path.setAttribute("d", "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z");

    const line1 = root.createElement("line");
    line1.setAttribute("x1", "8");
    line1.setAttribute("y1", "9");
    line1.setAttribute("x2", "16");
    line1.setAttribute("y2", "9");

    const line2 = root.createElement("line");
    line2.setAttribute("x1", "8");
    line2.setAttribute("y1", "13");
    line2.setAttribute("x2", "13");
    line2.setAttribute("y2", "13");

    svg.appendChild(path);
    svg.appendChild(line1);
    svg.appendChild(line2);
    iconWrapper.appendChild(svg);
    btn.appendChild(iconWrapper);

    const span = root.createElement("span");
    span.textContent = "Feed";
    btn.appendChild(span);

    btn.addEventListener("click", () => {
      omni.ui.closeSlot("sidebar");
    });

    root.appendChild(btn);
  });

  // 2. Register Main Feed Viewport
  omni.registerComponent("feed-main", async ({ root }) => {
    const container = root.createElement("div");
    container.className = "feed-container";

    // A. Note Composer Card
    const composerCard = root.createElement("div");
    composerCard.className = "composer-card";

    const textarea = root.createElement("textarea");
    textarea.className = "composer-input";
    textarea.setAttribute("placeholder", "What's happening? (Note will be signed with Schnorr/secp256k1)");
    textarea.setAttribute("rows", "2");

    const composerFooter = root.createElement("div");
    composerFooter.className = "composer-footer";

    const btnPublish = root.createElement("button");
    btnPublish.className = "btn-publish";
    btnPublish.textContent = "Publish Note";

    composerFooter.appendChild(btnPublish);
    composerCard.appendChild(textarea);
    composerCard.appendChild(composerFooter);
    container.appendChild(composerCard);

    // B. Header Row
    const headerRow = root.createElement("div");
    headerRow.setAttribute("style", "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;");

    const heading = root.createElement("h2");
    heading.setAttribute("style", "font-size: 0.95rem; font-weight: 600; color: var(--omni-text-secondary); text-transform: uppercase; letter-spacing: 0.05em;");
    heading.textContent = "Timeline Feed";

    const cacheIndicator = root.createElement("span");
    cacheIndicator.setAttribute("style", "font-size: 0.75rem; color: var(--omni-accent-primary); display: flex; align-items: center; gap: 4px;");
    cacheIndicator.textContent = "✦ 0ms Local Cache";

    headerRow.appendChild(heading);
    headerRow.appendChild(cacheIndicator);
    container.appendChild(headerRow);

    // C. Notes List
    const notesList = root.createElement("div");
    notesList.className = "notes-list";

    const loadingText = root.createElement("div");
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

      const card = root.createElement("article");
      card.className = "note-card";

      // Note Header
      const noteHeader = root.createElement("div");
      noteHeader.className = "note-header";

      const authorSpan = root.createElement("span");
      authorSpan.className = "note-author";
      const shortAuthor = `npub:${event.pubkey.slice(0, 6)}...${event.pubkey.slice(-4)}`;
      authorSpan.textContent = shortAuthor;

      const metaSpan = root.createElement("span");
      metaSpan.className = "note-meta";
      metaSpan.textContent = formatTime(event.created_at);

      noteHeader.appendChild(authorSpan);
      noteHeader.appendChild(metaSpan);

      // Note Content
      const noteContent = root.createElement("div");
      noteContent.className = "note-content";
      noteContent.textContent = event.content;

      // Note Actions
      const actions = root.createElement("div");
      actions.className = "note-actions";

      const btnReply = root.createElement("button");
      btnReply.className = "note-action-btn";
      btnReply.textContent = "Reply";

      const btnLike = root.createElement("button");
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
        const published = await omni.nostr.publish({
          kind: 1,
          content: text,
          tags: [["client", "omni"]],
          created_at: Math.floor(Date.now() / 1000)
        });

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
      } catch (err: any) {
        console.error("Failed to publish note from plugin:", err);
      } finally {
        btnPublish.removeAttribute("disabled");
        btnPublish.textContent = "Publish Note";
      }
    });

    // Subscribe to Timeline Notes
    try {
      omni.nostr.subscribe(
        [{ kinds: [1], limit: 50 }],
        (ev) => {
          renderNote(ev, true);
        },
        () => {
          cacheIndicator.textContent = "✦ Connected Relays";
        }
      );
    } catch (err) {
      console.error("Feed subscription failed:", err);
    }
  });
}
