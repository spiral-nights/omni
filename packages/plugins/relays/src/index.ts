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
      <div class="widget-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--text-primary, #ede8df);">✦ Connected Relays</h3>
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

  card.querySelectorAll<HTMLButtonElement>(".btn-preset-relay").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.getAttribute("data-url");
      if (url && typeof omni !== "undefined" && omni.relays) {
        await omni.relays.add(url);
        renderRelays();
      }
    });
  });

  async function renderRelays() {
    listContainer.replaceChildren();
    try {
      let relays: any[] = [];
      if (typeof omni !== "undefined" && omni.relays) {
        relays = await omni.relays.list();
      }
      if (!relays || relays.length === 0) {
        const empty = html<HTMLDivElement>`
          <div style="font-size: 0.75rem; color: var(--text-muted, #78716c); padding: 8px 0; text-align: center;">
            No relays connected. Operating in 0ms local offline mode.
          </div>
        `;
        listContainer.appendChild(empty);
        return;
      }

      for (const r of relays) {
        const isConn = r.status === "connected" || r.connected;
        const row = html<HTMLDivElement>`
          <div class="relay-row" style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-subtle, #272522); border-radius: var(--radius-sm, 6px); padding: 6px 10px; font-size: 0.78rem;">
            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: ${isConn ? "var(--status-online, #34d399)" : "#f87171"}; flex-shrink: 0;"></span>
              <span style="font-family: var(--font-mono, monospace); font-size: 0.72rem; color: var(--text-primary, #ede8df); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 170px;">${escapeHtml(r.url)}</span>
            </div>
            <button class="btn-remove-relay" title="Disconnect & Remove Relay" style="background: transparent; border: none; color: var(--text-muted, #78716c); font-size: 0.75rem; cursor: pointer; padding: 2px 6px;">✕</button>
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

  btnAdd.addEventListener("click", async () => {
    const val = input.value?.trim();
    if (!val || !val.startsWith("ws")) return;
    if (typeof omni !== "undefined" && omni.relays) {
      await omni.relays.add(val);
    }
    input.value = "";
    renderRelays();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      btnAdd.click();
    }
  });

  root.appendChild(card);
  renderRelays();
}

function init() {
  if (typeof document !== "undefined") {
    mountRelays(document.body);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
