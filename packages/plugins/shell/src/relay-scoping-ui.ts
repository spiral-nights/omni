import { OmniKernel } from "@omni/core";
import { InstalledPluginEntry } from "./base-shell.js";

export interface RelayScopingSectionOptions {
  kernel: OmniKernel;
  plugin: InstalledPluginEntry;
  theme?: "classic" | "panorama";
  onUpdate?: () => void;
  onRemount?: () => Promise<void> | void;
}

/**
 * Shared 3-option Relay Access & Scoping box for Editorial, Panorama, and swappable shells.
 * Supports:
 *  1. All Configured Relays (Default) -> plugin.relays = undefined
 *  2. Custom Relays -> plugin.relays = ["wss://..."]
 *  3. Local Only / Offline (Disable All Relays) -> plugin.relays = []
 */
export function renderRelayScopingSection(options: RelayScopingSectionOptions): HTMLElement {
  const { kernel, plugin, theme = "classic", onUpdate, onRemount } = options;
  const isPanorama = theme === "panorama";
  const safeId = plugin.id.replace(/[^a-zA-Z0-9_-]/g, "-");

  const relayAccessBox = document.createElement("div");
  relayAccessBox.className = isPanorama
    ? "panorama-config-section plugin-relay-access-box"
    : "plugin-relay-access-box";
  relayAccessBox.style.cssText = isPanorama
    ? "display: flex; flex-direction: column; gap: 8px; background: #141414; padding: 10px 12px; border: 1px solid #222;"
    : "display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--omni-border-subtle); padding-top: 10px;";

  const relayHeader = document.createElement("div");
  relayHeader.className = isPanorama ? "panorama-config-section-title" : "";
  relayHeader.style.cssText = isPanorama
    ? "display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; font-weight: 600; color: #fff;"
    : "display: flex; justify-content: space-between; align-items: center;";

  const relayTitle = document.createElement("span");
  relayTitle.style.cssText = isPanorama
    ? ""
    : "font-family: var(--omni-font-mono); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--omni-text-primary);";
  relayTitle.textContent = "Relay Access";

  const allRelays = kernel.relayPool.getAllRelays().map((r) => r.url);
  const isLocalOnly = Array.isArray(plugin.relays) && plugin.relays.length === 0;
  const isCustomRelays = Array.isArray(plugin.relays) && plugin.relays.length > 0;
  const isAllRelays = !isLocalOnly && !isCustomRelays;

  const relayModePill = document.createElement("span");
  relayModePill.style.cssText = isPanorama
    ? "font-size: 0.68rem; padding: 1px 6px; background: #222; color: #aaa;"
    : "font-family: var(--omni-font-mono); font-size: 0.65rem; padding: 1px 6px; background: var(--omni-bg-elevated); color: var(--omni-accent-primary); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm);";
  relayModePill.textContent = isLocalOnly
    ? "Local Only (No Relays)"
    : isCustomRelays
    ? `Custom (${plugin.relays!.length} relay${plugin.relays!.length === 1 ? "" : "s"})`
    : "All Relays (Default)";

  relayHeader.appendChild(relayTitle);
  relayHeader.appendChild(relayModePill);
  relayAccessBox.appendChild(relayHeader);

  const relayDesc = document.createElement("p");
  relayDesc.style.cssText = isPanorama
    ? "font-size: 0.72rem; color: #888; margin: 0; line-height: 1.35;"
    : "font-family: var(--omni-font-sans); font-size: 0.75rem; color: var(--omni-text-muted); margin: 0; line-height: 1.35;";
  relayDesc.textContent = "Restrict this plugin to specific relays, allow all configured relays, or run in offline local-only mode.";
  relayAccessBox.appendChild(relayDesc);

  const relayOptionsWrap = document.createElement("div");
  relayOptionsWrap.style.cssText = "display: flex; flex-direction: column; gap: 6px; margin-top: 4px;";

  const radioName = `${isPanorama ? "panorama" : "editorial"}-relay-scope-${safeId}`;

  // Option 1: All Relays
  const radAllLabel = document.createElement("label");
  radAllLabel.style.cssText = isPanorama
    ? "display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #fff; cursor: pointer;"
    : "display: flex; align-items: center; gap: 6px; font-family: var(--omni-font-sans); font-size: 0.78rem; color: var(--omni-text-primary); cursor: pointer;";
  const radAll = document.createElement("input");
  radAll.type = "radio";
  radAll.name = radioName;
  radAll.checked = isAllRelays;
  radAllLabel.appendChild(radAll);
  radAllLabel.appendChild(document.createTextNode("All Configured Relays (Default)"));
  relayOptionsWrap.appendChild(radAllLabel);

  // Option 2: Custom Relays
  const radCustomLabel = document.createElement("label");
  radCustomLabel.style.cssText = isPanorama
    ? "display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #fff; cursor: pointer;"
    : "display: flex; align-items: center; gap: 6px; font-family: var(--omni-font-sans); font-size: 0.78rem; color: var(--omni-text-primary); cursor: pointer;";
  const radCustom = document.createElement("input");
  radCustom.type = "radio";
  radCustom.name = radioName;
  radCustom.checked = isCustomRelays;
  radCustomLabel.appendChild(radCustom);
  radCustomLabel.appendChild(document.createTextNode("Custom Relays"));
  relayOptionsWrap.appendChild(radCustomLabel);

  const customCheckboxesContainer = document.createElement("div");
  customCheckboxesContainer.style.cssText = `display: ${isCustomRelays ? "flex" : "none"}; flex-direction: column; gap: 5px; margin-left: ${isPanorama ? "18px" : "20px"}; padding-top: 4px;`;

  const selectedCustomRelays = new Set<string>(plugin.relays && plugin.relays.length > 0 ? plugin.relays : []);

  for (const rUrl of allRelays) {
    const cbLabel = document.createElement("label");
    cbLabel.style.cssText = isPanorama
      ? "display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: #aaa; cursor: pointer;"
      : "display: flex; align-items: center; gap: 6px; font-family: var(--omni-font-sans); font-size: 0.75rem; color: var(--omni-text-secondary); cursor: pointer;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedCustomRelays.has(rUrl);
    cb.addEventListener("change", async () => {
      if (cb.checked) {
        selectedCustomRelays.add(rUrl);
      } else {
        selectedCustomRelays.delete(rUrl);
      }
      plugin.relays = Array.from(selectedCustomRelays);
      relayModePill.textContent = `Custom (${plugin.relays.length} relay${plugin.relays.length === 1 ? "" : "s"})`;
      onUpdate?.();
      await onRemount?.();
    });
    cbLabel.appendChild(cb);
    const codeSpan = document.createElement("code");
    codeSpan.style.cssText = isPanorama
      ? "font-family: var(--omni-font-mono); font-size: 0.7rem; color: #ddd;"
      : "font-family: var(--omni-font-mono); font-size: 0.72rem; color: var(--omni-text-primary);";
    codeSpan.textContent = rUrl;
    cbLabel.appendChild(codeSpan);
    customCheckboxesContainer.appendChild(cbLabel);
  }

  // Option 3: Local Only / Offline
  const radLocalLabel = document.createElement("label");
  radLocalLabel.style.cssText = isPanorama
    ? "display: flex; align-items: flex-start; gap: 6px; font-size: 0.75rem; color: #fff; cursor: pointer;"
    : "display: flex; align-items: flex-start; gap: 6px; font-family: var(--omni-font-sans); font-size: 0.78rem; color: var(--omni-text-primary); cursor: pointer;";
  const radLocal = document.createElement("input");
  radLocal.type = "radio";
  radLocal.name = radioName;
  radLocal.checked = isLocalOnly;
  radLocal.style.marginTop = isPanorama ? "2px" : "3px";
  const radLocalTextWrap = document.createElement("div");
  radLocalTextWrap.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
  const radLocalTitle = document.createElement("span");
  radLocalTitle.style.fontWeight = "600";
  radLocalTitle.textContent = "Local Only / Offline (Disable All Relays)";
  const radLocalDesc = document.createElement("span");
  radLocalDesc.style.cssText = isPanorama
    ? "font-size: 0.68rem; color: #888; line-height: 1.3;"
    : "font-size: 0.7rem; color: var(--omni-text-muted); line-height: 1.3;";
  radLocalDesc.textContent = "Disconnects this plugin from the network. Notes and state will only be saved and loaded from local browser storage / IndexedDB.";
  radLocalTextWrap.appendChild(radLocalTitle);
  radLocalTextWrap.appendChild(radLocalDesc);
  radLocalLabel.appendChild(radLocal);
  radLocalLabel.appendChild(radLocalTextWrap);
  relayOptionsWrap.appendChild(radLocalLabel);

  radAll.addEventListener("change", async () => {
    if (radAll.checked) {
      customCheckboxesContainer.style.display = "none";
      plugin.relays = undefined;
      relayModePill.textContent = "All Relays (Default)";
      onUpdate?.();
      await onRemount?.();
    }
  });

  radCustom.addEventListener("change", async () => {
    if (radCustom.checked) {
      customCheckboxesContainer.style.display = "flex";
      if (selectedCustomRelays.size === 0 && allRelays.length > 0) {
        selectedCustomRelays.add(allRelays[0]);
        const firstCb = customCheckboxesContainer.querySelector("input[type=checkbox]") as HTMLInputElement | null;
        if (firstCb) firstCb.checked = true;
      }
      plugin.relays = Array.from(selectedCustomRelays);
      relayModePill.textContent = `Custom (${plugin.relays.length} relay${plugin.relays.length === 1 ? "" : "s"})`;
      onUpdate?.();
      await onRemount?.();
    }
  });

  radLocal.addEventListener("change", async () => {
    if (radLocal.checked) {
      customCheckboxesContainer.style.display = "none";
      plugin.relays = [];
      relayModePill.textContent = "Local Only (No Relays)";
      onUpdate?.();
      await onRemount?.();
    }
  });

  relayOptionsWrap.appendChild(customCheckboxesContainer);
  relayAccessBox.appendChild(relayOptionsWrap);
  return relayAccessBox;
}
