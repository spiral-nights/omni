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
  const diff = Math.max(0, now - unixSec);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d`;
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #0284c7, #0369a1)",
  "linear-gradient(135deg, #2563eb, #1d4ed8)",
  "linear-gradient(135deg, #7c3aed, #6d28d9)",
  "linear-gradient(135deg, #db2777, #be185d)",
  "linear-gradient(135deg, #059669, #047857)",
  "linear-gradient(135deg, #d97706, #b45309)",
  "linear-gradient(135deg, #4f46e5, #4338ca)",
  "linear-gradient(135deg, #e11d48, #be123c)"
];

function getAvatarGradient(pubkey: string): string {
  let hash = 0;
  for (let i = 0; i < (pubkey || "").length; i++) {
    hash = (hash << 5) - hash + pubkey.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

function getAuthorMeta(pubkey: string) {
  if (!pubkey) return { name: "anonymous", handle: "@anon", initial: "?" };
  const shortPub = `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
  const initial = (pubkey[0] || "?").toUpperCase();
  return {
    name: `nostr:${pubkey.slice(0, 6)}`,
    handle: `@npub1${pubkey.slice(0, 6)}`,
    initial
  };
}

function formatContent(text: string): string {
  const escaped = escapeHtml(text || "");
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return escaped.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="feed-link">${url}</a>`;
  });
}

// Crisp geometric monochrome SVG line icons (Bluesky style)
const ICONS = {
  reply: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`,
  repost: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>`,
  heartOutline: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  heartFilled: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  share: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>`,
  refresh: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>`
};

function mountFeed(root: any) {
  const container = html<HTMLDivElement>`
    <div class="feed-container">
      <!-- Top Timeline Navigation Header (Bluesky Explore Style) -->
      <div class="feed-top-header">
        <div class="feed-tabs">
          <button class="feed-tab active">Latest</button>
          <button class="feed-tab">Discover</button>
        </div>
        <div class="feed-header-controls">
          <span class="cache-indicator">✦ Relays Connected</span>
          <button class="btn-refresh-feed" title="Refresh Feed">
            ${ICONS.refresh}
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <!-- Note Composer (Seamless Bluesky Post Box) -->
      <div class="feed-composer composer-card">
        <div class="composer-avatar-col">
          <div class="composer-avatar" id="my-composer-avatar">
            <span>U</span>
          </div>
        </div>
        <div class="composer-main-col">
          <textarea class="composer-input" placeholder="What's happening?" rows="2"></textarea>
          <div class="composer-toolbar">
            <div class="composer-tools"></div>
            <button class="btn-publish">Post</button>
          </div>
        </div>
      </div>

      <!-- Timeline Notes Stream -->
      <div class="notes-list">
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <span>Loading timeline notes...</span>
        </div>
      </div>

      <!-- Infinite Scroll Sentinel -->
      <div class="feed-sentinel" id="feed-sentinel"></div>
    </div>
  `;

  const textarea = container.querySelector<HTMLTextAreaElement>(".composer-input")!;
  const btnPublish = container.querySelector<HTMLButtonElement>(".btn-publish")!;
  const cacheIndicator = container.querySelector<HTMLElement>(".cache-indicator")!;
  const btnRefresh = container.querySelector<HTMLButtonElement>(".btn-refresh-feed")!;
  const notesList = container.querySelector<HTMLDivElement>(".notes-list")!;
  const loadingState = container.querySelector<HTMLDivElement>(".loading-state")!;
  const myAvatarEl = container.querySelector<HTMLElement>("#my-composer-avatar")!;
  const sentinelEl = container.querySelector<HTMLElement>("#feed-sentinel")!;

  root.appendChild(container);

  // Initialize composer avatar with user pubkey if available
  try {
    const nostr = (window as any).nostr;
    if (nostr?.getPublicKey) {
      nostr.getPublicKey().then((pk: string) => {
        if (pk && myAvatarEl) {
          myAvatarEl.style.background = getAvatarGradient(pk);
          myAvatarEl.textContent = (pk[0] || "U").toUpperCase();
        }
      }).catch(() => {});
    }
  } catch {}

  const renderedIds = new Set<string>();
  let oldestTimestamp = Infinity;
  let latestTimestamp = 0;
  let isLoadingOlder = false;
  let activeWs: any = null;

  function renderNote(event: any, prepend = false) {
    if (renderedIds.has(event.id)) return;
    renderedIds.add(event.id);

    if (loadingState.parentElement) {
      loadingState.remove();
    }

    if (event.created_at && event.created_at < oldestTimestamp) {
      oldestTimestamp = event.created_at;
    }
    if (event.created_at && event.created_at > latestTimestamp) {
      latestTimestamp = event.created_at;
    }

    const { name, handle, initial } = getAuthorMeta(event.pubkey);
    const avatarGradient = getAvatarGradient(event.pubkey || "");
    const timeStr = event.created_at ? formatTime(event.created_at) : "just now";
    const isReply = (event.tags || []).some((t: any[]) => t[0] === "e");

    // Deterministic counts based on note id to give authentic social feed feel
    const pseudoRand = (event.id || "").split("").reduce((acc: number, ch: string) => acc + ch.charCodeAt(0), 0);
    const initLikes = pseudoRand % 19;
    const initReposts = pseudoRand % 7;
    const initReplies = pseudoRand % 5;

    const card = html<HTMLElement>`
      <article class="feed-post note-card" data-note-id="${escapeHtml(event.id || "")}">
        <div class="feed-post-avatar-col">
          <div class="feed-avatar" style="background: ${avatarGradient};">
            <span>${escapeHtml(initial)}</span>
          </div>
        </div>
        <div class="feed-post-body">
          <div class="feed-post-header note-header">
            <div class="feed-post-author-info">
              <strong class="feed-author-name note-author">${escapeHtml(name)}</strong>
              <span class="feed-author-handle">${escapeHtml(handle)}</span>
              <span class="feed-dot">·</span>
              <span class="feed-time note-meta">${escapeHtml(timeStr)}</span>
            </div>
          </div>
          ${isReply ? `<div class="feed-reply-badge">↳ Replying to thread</div>` : ""}
          <div class="feed-post-content note-content">${formatContent(event.content || "")}</div>
          <div class="feed-post-actions note-actions">
            <button class="feed-action-btn note-action-btn action-reply btn-reply" title="Reply">
              ${ICONS.reply}
              <span class="action-count">${initReplies > 0 ? initReplies : ""}</span>
            </button>
            <button class="feed-action-btn note-action-btn action-repost" title="Repost">
              ${ICONS.repost}
              <span class="action-count">${initReposts > 0 ? initReposts : ""}</span>
            </button>
            <button class="feed-action-btn note-action-btn action-like btn-like" title="Like">
              <span class="icon-heart-wrap">${ICONS.heartOutline}</span>
              <span class="action-count">${initLikes > 0 ? initLikes : ""}</span>
            </button>
            <button class="feed-action-btn note-action-btn action-share" title="Share & Copy Note ID">
              ${ICONS.share}
            </button>
          </div>
        </div>
      </article>
    `;

    // Interactive Action Buttons
    const btnLike = card.querySelector<HTMLButtonElement>(".action-like")!;
    const heartWrap = card.querySelector<HTMLElement>(".icon-heart-wrap")!;
    const likeCountSpan = card.querySelector<HTMLElement>(".action-like .action-count")!;
    let isLiked = false;
    let currentLikes = initLikes;

    btnLike.addEventListener("click", () => {
      isLiked = !isLiked;
      if (isLiked) {
        currentLikes++;
        heartWrap.innerHTML = ICONS.heartFilled;
        btnLike.classList.add("active-liked");
      } else {
        currentLikes = Math.max(0, currentLikes - 1);
        heartWrap.innerHTML = ICONS.heartOutline;
        btnLike.classList.remove("active-liked");
      }
      likeCountSpan.textContent = currentLikes > 0 ? String(currentLikes) : "";
    });

    const btnRepost = card.querySelector<HTMLButtonElement>(".action-repost")!;
    const repostCountSpan = card.querySelector<HTMLElement>(".action-repost .action-count")!;
    let isReposted = false;
    let currentReposts = initReposts;
    btnRepost.addEventListener("click", () => {
      isReposted = !isReposted;
      currentReposts = isReposted ? currentReposts + 1 : Math.max(0, currentReposts - 1);
      btnRepost.classList.toggle("active-reposted", isReposted);
      repostCountSpan.textContent = currentReposts > 0 ? String(currentReposts) : "";
    });

    const btnShare = card.querySelector<HTMLButtonElement>(".action-share")!;
    btnShare.addEventListener("click", async () => {
      try {
        const textToCopy = event.id ? `nostr:${event.id}` : window.location.href;
        await navigator.clipboard.writeText(textToCopy);
        const originalTitle = btnShare.title;
        btnShare.title = "Copied to clipboard!";
        btnShare.style.color = "var(--accent-primary, #00a4ef)";
        setTimeout(() => {
          btnShare.title = originalTitle;
          btnShare.style.color = "";
        }, 1500);
      } catch {}
    });

    const btnReply = card.querySelector<HTMLButtonElement>(".action-reply")!;
    btnReply.addEventListener("click", () => {
      if (textarea) {
        textarea.value = `@${event.pubkey?.slice(0, 8)}... `;
        textarea.focus();
        textarea.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    if (prepend && notesList.firstChild) {
      notesList.insertBefore(card, notesList.firstChild);
    } else {
      notesList.appendChild(card);
    }
  }

  function handleIncomingEvent(event: any, prepend = false) {
    if (renderedIds.has(event.id)) return;
    renderNote(event, prepend);
  }

  // Refresh Feed
  function refreshFeed() {
    if (!activeWs || activeWs.readyState !== WebSocket.OPEN) return;
    btnRefresh.classList.add("spinning");
    const refreshSubId = `refresh-${Date.now()}`;
    const sinceTime = latestTimestamp > 0 ? latestTimestamp : Math.floor(Date.now() / 1000) - 120;
    activeWs.send(JSON.stringify(["REQ", refreshSubId, { kinds: [1], since: sinceTime, limit: 30 }]));
    setTimeout(() => {
      btnRefresh.classList.remove("spinning");
    }, 1500);
  }

  btnRefresh.addEventListener("click", refreshFeed);

  // Seamless Infinite Scrolling (Load Older Notes)
  function loadOlderNotes() {
    if (isLoadingOlder || oldestTimestamp === Infinity || !activeWs || activeWs.readyState !== WebSocket.OPEN) return;
    isLoadingOlder = true;
    const olderSubId = `older-${Date.now()}`;
    activeWs.send(JSON.stringify(["REQ", olderSubId, { kinds: [1], until: oldestTimestamp - 1, limit: 25 }]));
  }

  if (sentinelEl && typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingOlder && oldestTimestamp !== Infinity) {
          loadOlderNotes();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinelEl);
  }

  // Publish Note Handler
  btnPublish.addEventListener("click", async () => {
    const text = textarea.value?.trim();
    if (!text) return;

    btnPublish.disabled = true;
    btnPublish.textContent = "Posting...";

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
      btnPublish.textContent = "Post";
    }
  });

  // Subscribe to Timeline Notes via standard WebSocket
  try {
    if (typeof WebSocket !== "undefined") {
      const ws = new WebSocket("wss://relay.damus.io");
      activeWs = ws;

      ws.onopen = () => {
        // Fetch generous initial batch of timeline notes
        ws.send(JSON.stringify(["REQ", "feed-initial", { kinds: [1], limit: 40 }]));
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          const type = data[0];
          const subId = data[1];

          if (type === "EVENT" && data[2]) {
            const isRefresh = subId?.startsWith("refresh-");
            handleIncomingEvent(data[2], isRefresh);
          } else if (type === "EOSE") {
            if (subId === "feed-initial") {
              cacheIndicator.textContent = "✦ Relays Connected";
              // Close initial subscription to prevent continuous noisy background firehose
              ws.send(JSON.stringify(["CLOSE", "feed-initial"]));
            } else if (subId?.startsWith("older-")) {
              isLoadingOlder = false;
              ws.send(JSON.stringify(["CLOSE", subId]));
            } else if (subId?.startsWith("refresh-")) {
              btnRefresh.classList.remove("spinning");
              ws.send(JSON.stringify(["CLOSE", subId]));
            }
          }
        } catch {}
      };
    } else if (typeof omni !== "undefined" && (omni as any).nostr?.subscribe) {
      (omni as any).nostr.subscribe(
        [{ kinds: [1], limit: 40 }],
        (ev: any) => {
          handleIncomingEvent(ev);
        },
        () => {
          cacheIndicator.textContent = "✦ Relays Connected";
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
