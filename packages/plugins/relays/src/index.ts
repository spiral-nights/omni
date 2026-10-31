/// <reference types="@omni/types" />
import {
  OmniCardPrimitive,
  OmniComponentNode,
  OmniAction,
  OmniMetricPrimitive,
  OmniBoxPrimitive
} from "@omni/types";

let currentRelayList: string[] = [
  "wss://relay.damus.io",
  "wss://relay.ditto.pub",
  "wss://nos.lol"
];

function loadStoredRelays(): string[] {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("omni_configured_relays");
      if (stored) currentRelayList = JSON.parse(stored);
    }
  } catch {}
  return currentRelayList;
}

function persistStoredRelays(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("omni_configured_relays", JSON.stringify(currentRelayList));
    }
  } catch {}
}

export function getRelaysSchema(view = "widget", customRelays?: string[]): OmniComponentNode {
  const relays = customRelays && customRelays.length > 0 ? customRelays : loadStoredRelays();

  if (view === "compact") {
    return {
      type: "metric",
      label: "Relays",
      value: relays.length,
      subtext: "Connected"
    };
  }

  return {
    type: "card",
    title: "Relay Pool",
    subtitle: "Active WebSocket connections to decentralized relays",
    icon: "server",
    children: [
      {
        type: "box",
        direction: "row",
        align: "center",
        justify: "between",
        children: [
          {
            type: "metric",
            label: "Connected Relays",
            value: relays.length
          },
          {
            type: "badge",
            label: "Connected",
            tone: "success",
            dot: true
          }
        ]
      },
      {
        type: "box",
        direction: "row",
        gap: "sm",
        children: [
          {
            type: "input",
            name: "relayUrl",
            placeholder: "wss://relay.example.com",
            actionOnEnter: { name: "add-relay" }
          },
          {
            type: "button",
            label: "+ Add",
            action: { name: "add-relay" },
            size: "sm"
          }
        ]
      },
      {
        type: "list",
        items: relays.map((url) => ({
          type: "list-item",
          id: url,
          title: url,
          icon: "relay",
          actions: [
            {
              type: "icon-button",
              icon: "trash",
              tooltip: "Remove relay",
              variant: "danger",
              action: { name: "remove-relay", payload: { url } }
            }
          ]
        }))
      }
    ]
  };
}

export function handleRelaysAction(
  action: OmniAction,
  payload?: Record<string, unknown>
): OmniComponentNode {
  loadStoredRelays();
  const actName = action.name;
  if (actName === "add-relay") {
    const raw = String(payload?.relayUrl || payload?.value || "").trim();
    if (raw) {
      let url = raw;
      if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
        url = `wss://${url}`;
      }
      url = url.replace(/\/+$/, "");
      if (!currentRelayList.includes(url)) {
        currentRelayList.push(url);
        persistStoredRelays();
      }
    }
  } else if (actName === "remove-relay") {
    const url = String(payload?.url || action.payload?.url || "");
    if (url) {
      currentRelayList = currentRelayList.filter((r) => r !== url);
      persistStoredRelays();
    }
  }
  return getRelaysSchema("widget");
}

const RELAYS_CSS = /* css */ `
html, body {
  background: transparent !important;
  margin: 0;
  padding: 16px 20px;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100%;
}

@keyframes omni-relay-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.8); }
}

.relays-widget-card,
.relays-container {
  background: var(--omni-bg-elevated, var(--bg-elevated, #2a2930));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 10px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  max-width: 660px;
  width: 100%;
  margin: 0 auto;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  box-sizing: border-box;
}

.relays-widget-card .widget-header h3,
.relays-container .widget-header h3 {
  font-family: var(--omni-font-serif, inherit);
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  margin: 0;
}

.relay-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  border-radius: var(--omni-radius-sm, 6px);
  padding: 8px 12px;
  font-size: 0.78rem;
  margin-bottom: 6px;
  transition: border-color 0.15s ease;
}

.relay-row:hover {
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
}

.btn-remove-relay {
  background: transparent;
  border: none;
  color: var(--omni-text-muted, var(--text-muted, #8c909f));
  font-size: 0.85rem;
  cursor: pointer;
  padding: 2px 6px;
  line-height: 1;
  border-radius: var(--omni-radius-sm, 4px);
  transition: color 0.15s ease, background 0.15s ease;
}

.btn-remove-relay:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}

.btn-preset-relay {
  font-size: 0.7rem;
  padding: 4px 10px;
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038));
  color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6));
  border-radius: var(--omni-radius-sm, 6px);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-preset-relay:hover {
  border-color: var(--omni-border-strong, var(--border-strong, #42404b));
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
}

.input-relay-url {
  flex: 1;
  background: var(--omni-bg-surface, var(--bg-surface, #232227));
  border: 1px solid var(--omni-border-subtle, var(--border-strong, #42404b));
  border-radius: var(--omni-radius-sm, 6px);
  color: var(--omni-text-primary, var(--text-primary, #e5e1e4));
  padding: 7px 12px;
  font-size: 0.82rem;
  outline: none;
}

.input-relay-url:focus {
  border-color: var(--omni-accent-primary, var(--accent-primary, #4d8eff));
}

.btn-add-relay {
  font-size: 0.75rem;
  padding: 6px 14px;
  background: var(--omni-accent-primary, var(--accent-primary, #4d8eff));
  border: 1px solid var(--omni-accent-primary, var(--accent-primary, #4d8eff));
  color: var(--omni-accent-contrast, var(--accent-contrast, #ffffff));
  border-radius: var(--omni-radius-sm, 6px);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn-add-relay:hover {
  opacity: 0.9;
}
`;

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
    <div class="relays-widget-card relays-container" style="background: var(--omni-bg-surface, var(--bg-surface, #232227)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); border-radius: var(--omni-radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 10px; color: var(--omni-text-primary, var(--text-primary, #e5e1e4));">
      <style>${RELAYS_CSS}</style>
      <div class="widget-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--omni-text-primary, var(--text-primary, #e5e1e4));">✦ Relays</h3>
      </div>
      <p style="font-size: 0.78rem; color: var(--omni-text-muted, var(--text-muted, #8c909f)); margin: 0 0 4px 0;">Live WebSocket connections to decentralized Nostr relays.</p>
      
      <div class="relays-list-container" style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;"></div>

      <div class="add-relay-row" style="display: flex; gap: 6px; margin-bottom: 8px;">
        <input class="input-relay-url" type="text" placeholder="wss://relay.example.com" style="flex: 1; background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); border-radius: var(--omni-radius-sm, 6px); color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); padding: 6px 10px; font-size: 0.8rem; outline: none;" />
        <button class="btn-add-relay btn-secondary" style="font-size: 0.75rem; padding: 4px 12px; background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-strong, var(--border-strong, #42404b)); color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); border-radius: var(--omni-radius-sm, 6px); cursor: pointer;">+ Add</button>
      </div>

      <div style="font-size: 0.72rem; color: var(--omni-text-muted, var(--text-muted, #8c909f)); margin-bottom: 2px;">Quick Add Popular Relays:</div>
      <div class="relay-presets-row" style="display: flex; flex-wrap: wrap; gap: 4px;">
        ${presets.map((p) => `<button class="btn-preset-relay btn-secondary" data-url="${escapeHtml(p.url)}" style="font-size: 0.7rem; padding: 3px 8px; background: var(--omni-bg-subtle, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); color: var(--omni-text-secondary, var(--text-secondary, #c2c6d6)); border-radius: var(--omni-radius-sm, 6px); cursor: pointer;">+ ${escapeHtml(p.name)}</button>`).join("")}
      </div>
    </div>
  `;

  const listContainer = card.querySelector<HTMLDivElement>(".relays-list-container")!;
  const input = card.querySelector<HTMLInputElement>(".input-relay-url")!;
  const btnAdd = card.querySelector<HTMLButtonElement>(".btn-add-relay")!;

  let currentRelayUrls: Set<string> = new Set();

  function getOmniRelays() {
    if (typeof omni !== "undefined" && (omni as any)?.relays) return (omni as any).relays;
    if (typeof window !== "undefined" && (window as any).omni?.relays) return (window as any).omni.relays;
    return null;
  }

  async function addRelayUrl(rawUrl: string) {
    const url = normalizeRelayUrl(rawUrl);
    if (!url) return;
    const relaysApi = getOmniRelays();
    if (relaysApi) {
      await relaysApi.add(url);
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
      const relaysApi = getOmniRelays();
      if (relaysApi) {
        relays = await relaysApi.list();
      } else if (typeof window !== "undefined" && (window as any).nostr?.getRelays) {
        const relayMap = await (window as any).nostr.getRelays();
        relays = Object.keys(relayMap || {}).map((url) => ({ url, connected: true }));
      }

      listContainer.replaceChildren();

      if (!relays || relays.length === 0) {
        currentRelayUrls.clear();
        const empty = html<HTMLDivElement>`
          <div style="font-size: 0.75rem; color: var(--omni-text-muted, var(--text-muted, #8c909f)); padding: 8px 0; text-align: center;">
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
          statusColor = "var(--omni-status-online, var(--status-online, #4d8eff))";
          statusLabel = "Connected";
        } else if (isConnecting) {
          statusColor = "#f59e0b";
          statusLabel = "Connecting...";
          pulseStyle = "animation: omni-relay-pulse 1.2s infinite ease-in-out;";
        }

        const row = html<HTMLDivElement>`
          <div class="relay-row" style="display: flex; justify-content: space-between; align-items: center; background: var(--omni-bg-surface, var(--bg-subtle, #33323b)); border: 1px solid var(--omni-border-subtle, var(--border-subtle, #313038)); border-radius: var(--omni-radius-sm, 6px); padding: 6px 10px; font-size: 0.78rem; transition: border-color 0.15s ease;">
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1; min-width: 0;">
              <span class="relay-dot" style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; flex-shrink: 0; ${pulseStyle}" title="${statusLabel}"></span>
              <div style="display: flex; flex-direction: column; overflow: hidden; min-width: 0; flex: 1;">
                <span style="font-family: var(--omni-font-mono, monospace); font-size: 0.75rem; color: var(--omni-text-primary, var(--text-primary, #e5e1e4)); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(r.url)}</span>
                <span style="font-size: 0.68rem; color: ${statusColor}; margin-top: 1px; line-height: 1;">${statusLabel}</span>
              </div>
            </div>
            <button class="btn-remove-relay" title="Disconnect & Remove Relay" style="background: transparent; border: none; color: var(--omni-text-muted, var(--text-muted, #8c909f)); font-size: 0.85rem; cursor: pointer; padding: 2px 6px; line-height: 1; border-radius: 4px; transition: color 0.15s ease, background 0.15s ease;">✕</button>
          </div>
        `;

        const btnDel = row.querySelector<HTMLButtonElement>(".btn-remove-relay")!;
        btnDel.addEventListener("click", async () => {
          const relaysApi = getOmniRelays();
          if (relaysApi) {
            await relaysApi.remove(r.url);
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

function isSchemaRoute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const search = window.location.search || "";
    if (search.includes("format=schema") || search.includes("view=schema")) return true;
    if ((window as any).__OMNI_ROUTE__?.includes("format=schema")) return true;
    if ((window as any).__OMNI_FORMAT__ === "schema") return true;
  } catch (_) {}
  return false;
}

if (typeof window !== "undefined") {
  if (isSchemaRoute()) {
    const getActiveView = () => (isCompactRoute() ? "compact" : "widget");

    const dispatchSchema = (schema: OmniComponentNode | null) => {
      if (!schema) return;
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "omni:schema", schema }, "*");
      } else {
        window.postMessage({ type: "omni:schema", schema }, "*");
      }
    };

    // Dispatch initial schema for widget / compact views
    dispatchSchema(getRelaysSchema(getActiveView()));

    // Listen for actions over standard Web messaging
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (
        data &&
        (data.type === "omni:action" || data.type === "action") &&
        data.action
      ) {
        const nextSchema = handleRelaysAction(data.action, data.payload);
        dispatchSchema(nextSchema);
      }
    });
  }
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
