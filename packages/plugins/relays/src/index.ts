/// <reference types="@omni/types" />

if (typeof omni !== "undefined") {
  // 1. Header Status Pill Component
  omni.registerComponent("relay-status-pill", async ({ root }) => {
    const pill = root.createElement("div");
    pill.className = "header-status-indicator";
    pill.setAttribute("style", "display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 10px; border-radius: var(--omni-radius-pill); background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); font-size: 0.75rem; color: var(--omni-accent-primary); transition: background 0.15s ease;");
    pill.title = "Click to inspect & manage Nostr relay connections";

    const svg = root.createElement("svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    const circle = root.createElement("circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "2");

    const path1 = root.createElement("path");
    path1.setAttribute("d", "M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14");

    svg.appendChild(circle);
    svg.appendChild(path1);
    pill.appendChild(svg);

    const span = root.createElement("span");
    span.textContent = "Relays: 0ms Cache";
    pill.appendChild(span);

    async function updateCount() {
      try {
        const list = await omni.relays.list();
        const connectedCount = list.filter((r: any) => r.status === "connected" || r.connected).length;
        span.textContent = connectedCount > 0 ? `Relays: ${connectedCount} Active` : "Relays: 0ms Cache";
      } catch {
        // Fallback
      }
    }

    pill.addEventListener("click", () => {
      omni.ui.toggleSlot("sidebar");
    });

    root.appendChild(pill);
    updateCount();
    setInterval(updateCount, 4000);
  });

  // 2. Sidebar Relay Pool Manager Widget
  omni.registerComponent("relay-sidebar-widget", async ({ root }) => {
    const card = root.createElement("div");
    card.className = "checklist-widget-card";

    // Header
    const header = root.createElement("div");
    header.className = "widget-header";
    const title = root.createElement("h3");
    title.textContent = "✦ Connected Relays";
    header.appendChild(title);
    card.appendChild(header);

    const desc = root.createElement("p");
    desc.setAttribute("style", "font-size: 0.78rem; color: var(--omni-text-muted); margin-bottom: 8px;");
    desc.textContent = "Live WebSocket connections to decentralized Nostr relays.";
    card.appendChild(desc);

    // Relay list container
    const listContainer = root.createElement("div");
    listContainer.setAttribute("style", "display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;");
    card.appendChild(listContainer);

    // Add relay form
    const addRow = root.createElement("div");
    addRow.setAttribute("style", "display: flex; gap: 6px; margin-bottom: 10px;");

    const input = root.createElement("input");
    input.setAttribute("type", "text");
    input.setAttribute("placeholder", "wss://relay.example.com");
    input.setAttribute("style", "flex: 1; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); border-radius: var(--omni-radius-sm); color: var(--omni-text-primary); padding: 6px 10px; font-size: 0.8rem; outline: none;");

    const btnAdd = root.createElement("button");
    btnAdd.className = "btn-secondary";
    btnAdd.textContent = "+ Add";
    btnAdd.setAttribute("style", "font-size: 0.75rem; padding: 4px 10px;");

    addRow.appendChild(input);
    addRow.appendChild(btnAdd);
    card.appendChild(addRow);

    // Quick add presets
    const presetLabel = root.createElement("div");
    presetLabel.setAttribute("style", "font-size: 0.72rem; color: var(--omni-text-muted); margin-bottom: 4px;");
    presetLabel.textContent = "Quick Add Popular Relays:";
    card.appendChild(presetLabel);

    const presetRow = root.createElement("div");
    presetRow.setAttribute("style", "display: flex; flex-wrap: wrap; gap: 4px;");

    const presets = [
      { name: "Damus", url: "wss://relay.damus.io" },
      { name: "Nos.lol", url: "wss://nos.lol" },
      { name: "Primal", url: "wss://relay.primal.net" },
      { name: "Nostr.band", url: "wss://relay.nostr.band" }
    ];

    for (const p of presets) {
      const pBtn = root.createElement("button");
      pBtn.className = "btn-secondary";
      pBtn.textContent = `+ ${p.name}`;
      pBtn.setAttribute("style", "font-size: 0.7rem; padding: 2px 8px;");
      pBtn.addEventListener("click", async () => {
        await omni.relays.add(p.url);
        renderRelays();
      });
      presetRow.appendChild(pBtn);
    }
    card.appendChild(presetRow);

    async function renderRelays() {
      listContainer.innerHTML = "";
      try {
        const relays = await omni.relays.list();
        if (!relays || relays.length === 0) {
          const empty = root.createElement("div");
          empty.setAttribute("style", "font-size: 0.75rem; color: var(--omni-text-muted); padding: 8px 0; text-align: center;");
          empty.textContent = "No relays connected. Operating in 0ms local offline mode.";
          listContainer.appendChild(empty);
          return;
        }

        for (const r of relays) {
          const row = root.createElement("div");
          row.setAttribute("style", "display: flex; justify-content: space-between; align-items: center; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); padding: 6px 10px; font-size: 0.78rem;");

          const left = root.createElement("div");
          left.setAttribute("style", "display: flex; align-items: center; gap: 6px; overflow: hidden;");

          const dot = root.createElement("span");
          const isConn = r.status === "connected";
          dot.setAttribute("style", `width: 7px; height: 7px; border-radius: 50%; background: ${isConn ? "#34d399" : "#f87171"}; flex-shrink: 0;`);

          const urlSpan = root.createElement("span");
          urlSpan.setAttribute("style", "font-family: var(--omni-font-mono); font-size: 0.72rem; color: var(--omni-text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 170px;");
          urlSpan.textContent = r.url;

          left.appendChild(dot);
          left.appendChild(urlSpan);

          const btnDel = root.createElement("button");
          btnDel.setAttribute("style", "background: transparent; border: none; color: var(--omni-text-muted); font-size: 0.75rem; cursor: pointer; padding: 2px 6px;");
          btnDel.textContent = "✕";
          btnDel.title = "Disconnect & Remove Relay";
          btnDel.addEventListener("click", async () => {
            await omni.relays.remove(r.url);
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
      await omni.relays.add(val);
      input.value = "";
      renderRelays();
    });

    root.appendChild(card);
    renderRelays();
  });
}
