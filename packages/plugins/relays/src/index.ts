/// <reference types="@omni/types" />

function mountRelays(root: any) {
  const isRemote = typeof root.createElement === "function";
  const createElement = (tag: string) => isRemote ? root.createElement(tag) : document.createElement(tag);

  const card = createElement("div");
  card.className = "checklist-widget-card";

  // Header
  const header = createElement("div");
  header.className = "widget-header";
  const title = createElement("h3");
  title.textContent = "✦ Connected Relays";
  header.appendChild(title);
  card.appendChild(header);

  const desc = createElement("p");
  desc.setAttribute("style", "font-size: 0.78rem; color: var(--omni-text-muted); margin-bottom: 8px;");
  desc.textContent = "Live WebSocket connections to decentralized Nostr relays.";
  card.appendChild(desc);

  // Relay list container
  const listContainer = createElement("div");
  listContainer.setAttribute("style", "display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;");
  card.appendChild(listContainer);

  // Add relay form
  const addRow = createElement("div");
  addRow.setAttribute("style", "display: flex; gap: 6px; margin-bottom: 10px;");

  const input = createElement("input");
  input.setAttribute("type", "text");
  input.setAttribute("placeholder", "wss://relay.example.com");
  input.setAttribute("style", "flex: 1; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); border-radius: var(--omni-radius-sm); color: var(--omni-text-primary); padding: 6px 10px; font-size: 0.8rem; outline: none;");

  const btnAdd = createElement("button");
  btnAdd.className = "btn-secondary";
  btnAdd.textContent = "+ Add";
  btnAdd.setAttribute("style", "font-size: 0.75rem; padding: 4px 10px;");

  addRow.appendChild(input);
  addRow.appendChild(btnAdd);
  card.appendChild(addRow);

  // Quick add presets
  const presetLabel = createElement("div");
  presetLabel.setAttribute("style", "font-size: 0.72rem; color: var(--omni-text-muted); margin-bottom: 4px;");
  presetLabel.textContent = "Quick Add Popular Relays:";
  card.appendChild(presetLabel);

  const presetRow = createElement("div");
  presetRow.setAttribute("style", "display: flex; flex-wrap: wrap; gap: 4px;");

  const presets = [
    { name: "Ditto", url: "wss://relay.ditto.pub" },
    { name: "Damus", url: "wss://relay.damus.io" },
    { name: "Nos.lol", url: "wss://nos.lol" },
    { name: "Primal", url: "wss://relay.primal.net" },
    { name: "Nostr.band", url: "wss://relay.nostr.band" }
  ];

  for (const p of presets) {
    const pBtn = createElement("button");
    pBtn.className = "btn-secondary";
    pBtn.textContent = `+ ${p.name}`;
    pBtn.setAttribute("style", "font-size: 0.7rem; padding: 2px 8px;");
    pBtn.addEventListener("click", async () => {
      if (typeof omni !== "undefined" && omni.relays) {
        await omni.relays.add(p.url);
      }
      renderRelays();
    });
    presetRow.appendChild(pBtn);
  }
  card.appendChild(presetRow);

  async function renderRelays() {
    while (listContainer.firstChild) {
      listContainer.removeChild(listContainer.firstChild);
    }
    listContainer.innerHTML = "";
    try {
      let relays: any[] = [];
      if (typeof omni !== "undefined" && omni.relays) {
        relays = await omni.relays.list();
      }
      if (!relays || relays.length === 0) {
        const empty = createElement("div");
        empty.setAttribute("style", "font-size: 0.75rem; color: var(--omni-text-muted); padding: 8px 0; text-align: center;");
        empty.textContent = "No relays connected. Operating in 0ms local offline mode.";
        listContainer.appendChild(empty);
        return;
      }

      for (const r of relays) {
        const row = createElement("div");
        row.setAttribute("style", "display: flex; justify-content: space-between; align-items: center; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); padding: 6px 10px; font-size: 0.78rem;");

        const left = createElement("div");
        left.setAttribute("style", "display: flex; align-items: center; gap: 6px; overflow: hidden;");

        const dot = createElement("span");
        const isConn = r.status === "connected" || r.connected;
        dot.setAttribute("style", `width: 7px; height: 7px; border-radius: 50%; background: ${isConn ? "#34d399" : "#f87171"}; flex-shrink: 0;`);

        const urlSpan = createElement("span");
        urlSpan.setAttribute("style", "font-family: var(--omni-font-mono); font-size: 0.72rem; color: var(--omni-text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 170px;");
        urlSpan.textContent = r.url;

        left.appendChild(dot);
        left.appendChild(urlSpan);

        const btnDel = createElement("button");
        btnDel.setAttribute("style", "background: transparent; border: none; color: var(--omni-text-muted); font-size: 0.75rem; cursor: pointer; padding: 2px 6px;");
        btnDel.textContent = "✕";
        btnDel.title = "Disconnect & Remove Relay";
        btnDel.addEventListener("click", async () => {
          if (typeof omni !== "undefined" && omni.relays) {
            await omni.relays.remove(r.url);
          }
          renderRelays();
        });

        row.appendChild(left);
        row.appendChild(btnDel);
        listContainer.appendChild(row);
      }
    } catch (err) {
      console.error("Failed to load relays in widget:", err);
    }
  }

  btnAdd.addEventListener("click", async () => {
    const val = input.value?.trim();
    if (!val || !val.startsWith("ws")) {
      return;
    }
    if (typeof omni !== "undefined" && omni.relays) {
      await omni.relays.add(val);
    }
    input.value = "";
    renderRelays();
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
