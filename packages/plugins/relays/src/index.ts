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

function normalizeRelayUrl(input: string): string {
  let url = input.trim();
  if (!url) return "";
  if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    url = `wss://${url}`;
  }
  return url.replace(/\/+$/, "");
}

function mountRelays(root: any) {
  const presets = [
    { name: "Ditto", url: "wss://relay.ditto.pub" },
    { name: "Damus", url: "wss://relay.damus.io" },
    { name: "Nos.lol", url: "wss://nos.lol" },
    { name: "Primal", url: "wss://relay.primal.net" },
    { name: "Nostr.band", url: "wss://relay.nostr.band" }
  ];

  const card = html<HTMLDivElement>`
    <div class="checklist-widget-card" style="background: var(--bg-surface, #191816); border: 1px solid var(--border-strong, #383530); border-radius: var(--radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 10px; color: var(--text-primary, #ede8df);">
      <style>
        @keyframes omni-relay-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.8); }
        }
        .relay-row:hover {
          border-color: var(--border-strong, #383530) !important;
        }
        .btn-remove-relay:hover {
          color: #ef4444 !important;
          background: rgba(239, 68, 68, 0.12) !important;
        }
      </style>
      <div class="widget-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--text-primary, #ede8df);">✦ Relays</h3>
      </div>
      <p style="font-size: 0.78rem; color: var(--text-muted, #78716c); margin: 0 0 4px 0;">Live WebSocket connections to decentralized Nostr relays.</p>
      
      <div class="relays-list-container" style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;"></div>

      <div class="add-relay-row" style="display: flex; gap: 6px; margin-bottom: 8px;">
        <input class="input-relay-url" type="text" placeholder="wss://relay.example.com" style="flex: 1; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); border-radius: var(--radius-sm, 6px); color: var(--text-primary, #ede8df); padding: 6px 10px; font-size: 0.8rem; outline: none;" />
        <button class="btn-add-relay btn-secondary" style="font-size: 0.75rem; padding: 4px 12px; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); cursor: pointer;">+ Add</button>
      </div>

      <div style="font-size: 0.72rem; color: var(--text-muted, #78716c); margin-bottom: 2px;">Quick Add Popular Relays:</div>
      <div class="relay-presets-row" style="display: flex; flex-wrap: wrap; gap: 4px;">
        ${presets.map((p) => `<button class="btn-preset-relay btn-secondary" data-url="${escapeHtml(p.url)}" style="font-size: 0.7rem; padding: 3px 8px; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-subtle, #272522); color: var(--text-secondary, #a8a29e); border-radius: var(--radius-sm, 6px); cursor: pointer;">+ ${escapeHtml(p.name)}</button>`).join("")}
      </div>
    </div>
  `;

  const listContainer = card.querySelector<HTMLDivElement>(".relays-list-container")!;
  const input = card.querySelector<HTMLInputElement>(".input-relay-url")!;
  const btnAdd = card.querySelector<HTMLButtonElement>(".btn-add-relay")!;

  let currentRelayUrls: Set<string> = new Set();

  async function addRelayUrl(rawUrl: string) {
    const url = normalizeRelayUrl(rawUrl);
    if (!url) return;
    if (typeof omni !== "undefined" && omni.relays) {
      await omni.relays.add(url);
    }
    renderRelays();
    setTimeout(renderRelays, 600);
    setTimeout(renderRelays, 1500);
  }

  card.querySelectorAll<HTMLButtonElement>(".btn-preset-relay").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.getAttribute("data-url");
      if (url) {
        await addRelayUrl(url);
      }
    });
  });

  async function renderRelays() {
    try {
      let relays: any[] = [];
      if (typeof omni !== "undefined" && omni.relays) {
        relays = await omni.relays.list();
      } else if (typeof window !== "undefined" && (window as any).nostr?.getRelays) {
        const relayMap = await (window as any).nostr.getRelays();
        relays = Object.keys(relayMap || {}).map((url) => ({ url, connected: true }));
      }

      listContainer.replaceChildren();

      if (!relays || relays.length === 0) {
        currentRelayUrls.clear();
        const empty = html<HTMLDivElement>`
          <div style="font-size: 0.75rem; color: var(--text-muted, #78716c); padding: 8px 0; text-align: center;">
            No relays connected. Operating in 0ms local offline mode.
          </div>
        `;
        listContainer.appendChild(empty);
        return;
      }

      currentRelayUrls = new Set(relays.map((r) => normalizeRelayUrl(r.url)));

      for (const r of relays) {
        const isConnected = r.status === "connected" || (!r.status && r.connected);
        const isConnecting = r.status === "connecting";

        let statusColor = "#ef4444";
        let statusLabel = "Offline";
        let pulseStyle = "";

        if (isConnected) {
          statusColor = "var(--status-online, #00a4ef)";
          statusLabel = "Connected";
        } else if (isConnecting) {
          statusColor = "#f59e0b";
          statusLabel = "Connecting...";
          pulseStyle = "animation: omni-relay-pulse 1.2s infinite ease-in-out;";
        }

        const row = html<HTMLDivElement>`
          <div class="relay-row" style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-subtle, #272522); border-radius: var(--radius-sm, 6px); padding: 6px 10px; font-size: 0.78rem; transition: border-color 0.15s ease;">
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1; min-width: 0;">
              <span class="relay-dot" style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; flex-shrink: 0; ${pulseStyle}" title="${statusLabel}"></span>
              <div style="display: flex; flex-direction: column; overflow: hidden; min-width: 0; flex: 1;">
                <span style="font-family: var(--font-mono, monospace); font-size: 0.75rem; color: var(--text-primary, #ede8df); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(r.url)}</span>
                <span style="font-size: 0.68rem; color: ${statusColor}; margin-top: 1px; line-height: 1;">${statusLabel}</span>
              </div>
            </div>
            <button class="btn-remove-relay" title="Disconnect & Remove Relay" style="background: transparent; border: none; color: var(--text-muted, #78716c); font-size: 0.85rem; cursor: pointer; padding: 2px 6px; line-height: 1; border-radius: 4px; transition: color 0.15s ease, background 0.15s ease;">✕</button>
          </div>
        `;

        const btnDel = row.querySelector<HTMLButtonElement>(".btn-remove-relay")!;
        btnDel.addEventListener("click", async () => {
          if (typeof omni !== "undefined" && omni.relays) {
            await omni.relays.remove(r.url);
          }
          renderRelays();
        });

        listContainer.appendChild(row);
      }
    } catch (err) {
      console.error("Failed to load relays in widget:", err);
    }
  }

  async function handleAdd() {
    const val = input.value?.trim();
    if (!val) return;
    input.value = "";
    await addRelayUrl(val);
  }

  btnAdd.addEventListener("click", handleAdd);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleAdd();
    }
  });

  root.appendChild(card);
  renderRelays();

  // Periodic live status check so connections transition to Connected automatically
  const intervalId = setInterval(renderRelays, 2000);

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      clearInterval(intervalId);
    });
  }
}

function isCompactRoute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const search = window.location.search || "";
    if (new URLSearchParams(search).get("view") === "compact") return true;
    if (window.location.hash.includes("compact")) return true;
    if ((window as any).__OMNI_ROUTE__?.includes("compact")) return true;
    if ((window as any).__OMNI_VIEW__ === "compact") return true;
  } catch (_) {}
  return false;
}

function mountRelaysCompact(root: any) {
  const container = html<HTMLDivElement>`
    <div class="relays-compact-card" style="display: flex; flex-direction: column; justify-content: center; height: 100%; width: 100%; gap: 6px; padding: 4px; box-sizing: border-box; color: #ffffff; font-family: inherit;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #2ecc71; display: inline-block;"></span>
        <span class="relays-compact-status" style="font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.85;">Connected</span>
      </div>
      <div class="relays-compact-count" style="font-size: 1.6rem; font-weight: 700; line-height: 1;">Pool Active</div>
    </div>
  `;

  async function updateStatus() {
    try {
      if ((window as any).nostr?.getRelays) {
        const relaysObj = await (window as any).nostr.getRelays();
        const count = Object.keys(relaysObj || {}).length;
        if (count > 0) {
          const countEl = container.querySelector(".relays-compact-count");
          if (countEl) countEl.textContent = `${count} Online`;
        }
      }
    } catch (_) {}
  }

  updateStatus();
  root.appendChild(container);
}

function init() {
  if (typeof document !== "undefined") {
    if (isCompactRoute()) {
      mountRelaysCompact(document.body);
    } else {
      mountRelays(document.body);
    }
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
