import { OmniKernel } from "@omni/core";
import { InstalledPluginEntry } from "./shell.js";
import { icon } from "./icons.js";

export interface StandardKindDef {
  kind: number;
  name: string;
  desc: string;
}

export const STANDARD_NOSTR_KINDS: StandardKindDef[] = [
  { kind: 1, name: "Short Notes", desc: "Kind 1 — Short Text Notes & Posts" },
  { kind: 6, name: "Reposts", desc: "Kind 6 — Generic Reposts" },
  { kind: 7, name: "Reactions", desc: "Kind 7 — Reactions & Likes" },
  { kind: 0, name: "Metadata", desc: "Kind 0 — User Profile / Metadata" },
  { kind: 30023, name: "Articles", desc: "Kind 30023 — Long-form Articles" },
  { kind: 10002, name: "Relay List", desc: "Kind 10002 — Relay List Metadata" },
  { kind: 4, name: "Direct Messages", desc: "Kind 4 / 1059 — Encrypted Direct Messages" }
];

export const INTENT_FRIENDLY_NAMES: Record<string, { label: string; desc: string }> = {
  compose_note: { label: "Compose Note", desc: "Compose and draft Nostr notes" },
  create_note: { label: "Create Note", desc: "Compose and draft Nostr notes" },
  view_note: { label: "View Note", desc: "Display note threads and events" },
  share: { label: "Web Share", desc: "Target for navigator.share() drafts" },
  view_profile: { label: "View Profile", desc: "Display user profile and metadata" },
  edit_profile: { label: "Edit Profile", desc: "Edit account metadata and keys" },
  create_task: { label: "Create Task", desc: "Add tasks and daily checklist items" },
  pay_invoice: { label: "Lightning Payment", desc: "Pay Lightning / Cashu invoices" }
};

export interface NostrWriteSectionOptions {
  kernel: OmniKernel;
  pluginId: string;
  theme?: "classic" | "panorama";
  onUpdate?: () => void;
}

/**
 * Renders a collapsible Nostr write permissions UI with kind-level granular controls,
 * wildcard toggle, standard kinds checkboxes, and custom kind numeric input.
 */
export function renderNostrWritePermissionsSection(options: NostrWriteSectionOptions): HTMLElement {
  const { kernel, pluginId, theme = "classic", onUpdate } = options;
  const isPanorama = theme === "panorama";

  const container = document.createElement("div");
  container.className = isPanorama
    ? "panorama-config-section plugin-write-permissions-section"
    : "plugin-write-permissions-section";
  container.style.cssText = isPanorama
    ? "display: flex; flex-direction: column; gap: 8px; background: #141414; padding: 10px 12px; border: 1px solid #222;"
    : "display: flex; flex-direction: column; gap: 8px; background: var(--omni-bg-surface); padding: 12px 14px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);";

  // Header / Collapsible trigger
  const header = document.createElement("div");
  header.className = "write-permissions-header";
  header.style.cssText =
    "display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; gap: 8px;";

  const headerLeft = document.createElement("div");
  headerLeft.style.cssText = "display: flex; align-items: center; gap: 8px;";

  const chevron = document.createElement("span");
  chevron.className = "write-permissions-chevron";
  chevron.style.cssText =
    "display: inline-flex; align-items: center; transition: transform 0.2s ease; color: " +
    (isPanorama ? "#888" : "var(--omni-text-muted)");
  chevron.innerHTML = icon("chevron-down", 14);

  const title = document.createElement("strong");
  title.style.cssText = isPanorama
    ? "font-size: 0.78rem; font-weight: 600; color: #fff;"
    : "font-weight: 600; font-size: 0.82rem; color: var(--omni-text-primary);";
  title.textContent = "Nostr Publishing Permissions";

  headerLeft.appendChild(chevron);
  headerLeft.appendChild(title);

  const summaryBadge = document.createElement("span");
  summaryBadge.className = "write-permissions-summary-badge";
  summaryBadge.style.cssText = isPanorama
    ? "font-size: 0.68rem; padding: 1px 6px; background: #222; color: var(--omni-accent-primary, #00a4ef);"
    : "font-size: 0.68rem; padding: 1px 6px; border-radius: var(--omni-radius-pill); background: var(--omni-bg-subtle); color: var(--omni-accent-primary);";

  const updateBadge = () => {
    const { allKinds, kinds } = kernel.getPluginKindPermissions(pluginId);
    if (allKinds) {
      summaryBadge.textContent = "All Kinds (*)";
    } else if (kinds.length > 0) {
      summaryBadge.textContent = `${kinds.length} kind${kinds.length === 1 ? "" : "s"} allowed`;
    } else {
      summaryBadge.textContent = "None (Revoked)";
    }
  };
  updateBadge();

  header.appendChild(headerLeft);
  header.appendChild(summaryBadge);
  container.appendChild(header);

  // Collapsible Body
  const body = document.createElement("div");
  body.className = "write-permissions-body";
  body.style.cssText = "display: none; flex-direction: column; gap: 10px; margin-top: 4px;";

  let isOpen = false;
  header.addEventListener("click", () => {
    isOpen = !isOpen;
    body.style.display = isOpen ? "flex" : "none";
    chevron.style.transform = isOpen ? "rotate(180deg)" : "rotate(0deg)";
  });

  const desc = document.createElement("div");
  desc.style.cssText = isPanorama ? "font-size: 0.72rem; color: #888;" : "font-size: 0.72rem; color: var(--omni-text-muted);";
  desc.textContent = "Control which Nostr event kinds this application is permitted to sign and publish.";
  body.appendChild(desc);

  // 1. Wildcard Checkbox (* All Kinds)
  const wildcardRow = document.createElement("label");
  wildcardRow.style.cssText = isPanorama
    ? "display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: #1c1c1c; border: 1px solid #333; cursor: pointer;"
    : "display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--omni-bg-canvas); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); cursor: pointer;";

  const wildcardText = document.createElement("div");
  wildcardText.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
  wildcardText.innerHTML = `
    <span style="font-size: 0.78rem; font-weight: 600; color: ${isPanorama ? "#fff" : "var(--omni-text-primary)"};">Allow All Event Kinds (* wildcard)</span>
    <span style="font-size: 0.7rem; color: ${isPanorama ? "#888" : "var(--omni-text-muted)"};">Grants blanket publishing rights across all past and future NIPs</span>
  `;

  const wildcardCheckbox = document.createElement("input");
  wildcardCheckbox.type = "checkbox";
  wildcardCheckbox.style.cursor = "pointer";
  const { allKinds: initialAllKinds } = kernel.getPluginKindPermissions(pluginId);
  wildcardCheckbox.checked = initialAllKinds;

  wildcardRow.appendChild(wildcardText);
  wildcardRow.appendChild(wildcardCheckbox);
  body.appendChild(wildcardRow);

  // 2. Standard Kinds Sub-List
  const standardKindsBox = document.createElement("div");
  standardKindsBox.style.cssText = "display: flex; flex-direction: column; gap: 6px;";

  const standardKindsHeader = document.createElement("span");
  standardKindsHeader.style.cssText = isPanorama
    ? "font-size: 0.72rem; font-weight: 600; color: #aaa; text-transform: uppercase;"
    : "font-size: 0.72rem; font-weight: 600; color: var(--omni-text-secondary); text-transform: uppercase; letter-spacing: 0.04em;";
  standardKindsHeader.textContent = "Standard Event Kinds";
  standardKindsBox.appendChild(standardKindsHeader);

  const standardCheckboxes: Record<number, HTMLInputElement> = {};

  for (const sk of STANDARD_NOSTR_KINDS) {
    const row = document.createElement("label");
    row.style.cssText =
      "display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; cursor: pointer;";

    const labelWrap = document.createElement("div");
    labelWrap.style.cssText = "display: flex; flex-direction: column; gap: 1px;";
    labelWrap.innerHTML = `
      <span style="font-size: 0.75rem; color: ${isPanorama ? "#fff" : "var(--omni-text-primary)"}; font-weight: 500;">${sk.name}</span>
      <span style="font-size: 0.68rem; color: ${isPanorama ? "#888" : "var(--omni-text-muted)"}; font-family: var(--omni-font-mono);">${sk.desc}</span>
    `;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.style.cursor = "pointer";
    cb.checked = kernel.getPluginPermission(pluginId, "nostr:write", String(sk.kind));
    standardCheckboxes[sk.kind] = cb;

    cb.addEventListener("change", () => {
      kernel.setPluginKindPermission(pluginId, sk.kind, cb.checked);
      if (sk.kind === 4) {
        kernel.setPluginKindPermission(pluginId, 1059, cb.checked);
      }
      updateBadge();
      onUpdate?.();
    });

    row.appendChild(labelWrap);
    row.appendChild(cb);
    standardKindsBox.appendChild(row);
  }
  body.appendChild(standardKindsBox);

  // Wildcard toggle listener
  wildcardCheckbox.addEventListener("change", () => {
    kernel.setPluginPermission(pluginId, "nostr:write", wildcardCheckbox.checked, "*");
    updateBadge();
    onUpdate?.();
  });

  // 3. Custom Numeric Kind Input
  const customKindsSection = document.createElement("div");
  customKindsSection.style.cssText = "display: flex; flex-direction: column; gap: 6px; margin-top: 4px;";

  const customHeader = document.createElement("span");
  customHeader.style.cssText = isPanorama
    ? "font-size: 0.72rem; font-weight: 600; color: #aaa; text-transform: uppercase;"
    : "font-size: 0.72rem; font-weight: 600; color: var(--omni-text-secondary); text-transform: uppercase; letter-spacing: 0.04em;";
  customHeader.textContent = "Custom Numeric Kinds";
  customKindsSection.appendChild(customHeader);

  const customInputRow = document.createElement("div");
  customInputRow.style.cssText = "display: flex; gap: 6px; align-items: center;";

  const inputKind = document.createElement("input");
  inputKind.type = "number";
  inputKind.min = "0";
  inputKind.placeholder = "e.g. 30078, 1984";
  inputKind.style.cssText = isPanorama
    ? "background: #000; border: 1px solid #444; color: #fff; padding: 4px 8px; font-size: 0.75rem; flex: 1; outline: none;"
    : "background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 4px 8px; font-size: 0.75rem; border-radius: var(--omni-radius-sm); flex: 1; outline: none;";

  const btnAddKind = document.createElement("button");
  btnAddKind.type = "button";
  btnAddKind.textContent = "+ Add";
  btnAddKind.style.cssText = isPanorama
    ? "background: #222; border: 1px solid #444; color: var(--omni-accent-primary, #00a4ef); padding: 4px 10px; font-size: 0.72rem; cursor: pointer;"
    : "background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-subtle); color: var(--omni-accent-primary); padding: 4px 10px; font-size: 0.72rem; border-radius: var(--omni-radius-sm); cursor: pointer;";

  customInputRow.appendChild(inputKind);
  customInputRow.appendChild(btnAddKind);
  customKindsSection.appendChild(customInputRow);

  // Pills list for currently granted custom kinds
  const customPillsWrap = document.createElement("div");
  customPillsWrap.style.cssText = "display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px;";

  const renderCustomPills = () => {
    customPillsWrap.innerHTML = "";
    const { kinds } = kernel.getPluginKindPermissions(pluginId);
    const standardSet = new Set([0, 1, 4, 6, 7, 1059, 10002, 30023]);
    const customKinds = kinds.filter((k) => !standardSet.has(k)).sort((a, b) => a - b);

    if (customKinds.length === 0) {
      const noneText = document.createElement("span");
      noneText.style.cssText = isPanorama
        ? "font-size: 0.68rem; color: #666;"
        : "font-size: 0.68rem; color: var(--omni-text-muted);";
      noneText.textContent = "No custom event kinds configured";
      customPillsWrap.appendChild(noneText);
      return;
    }

    for (const ck of customKinds) {
      const pill = document.createElement("span");
      pill.style.cssText = isPanorama
        ? "display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; background: #222; border: 1px solid #333; font-size: 0.7rem; color: #ddd; font-family: var(--omni-font-mono);"
        : "display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-pill); font-size: 0.7rem; color: var(--omni-text-primary); font-family: var(--omni-font-mono);";

      pill.textContent = `Kind ${ck}`;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.innerHTML = "×";
      removeBtn.title = `Revoke Kind ${ck}`;
      removeBtn.style.cssText =
        "background: none; border: none; color: #f87171; cursor: pointer; font-size: 0.85rem; line-height: 1; padding: 0 2px;";
      removeBtn.addEventListener("click", () => {
        kernel.setPluginKindPermission(pluginId, ck, false);
        renderCustomPills();
        updateBadge();
        onUpdate?.();
      });

      pill.appendChild(removeBtn);
      customPillsWrap.appendChild(pill);
    }
  };

  btnAddKind.addEventListener("click", () => {
    const rawVal = inputKind.value.trim();
    if (!rawVal) return;
    const kindNum = parseInt(rawVal, 10);
    if (isNaN(kindNum) || kindNum < 0) return;

    kernel.setPluginKindPermission(pluginId, kindNum, true);
    inputKind.value = "";
    if (standardCheckboxes[kindNum]) {
      standardCheckboxes[kindNum].checked = true;
    }
    renderCustomPills();
    updateBadge();
    onUpdate?.();
  });

  renderCustomPills();
  customKindsSection.appendChild(customPillsWrap);
  body.appendChild(customKindsSection);

  container.appendChild(body);
  return container;
}

export interface HandledIntentsSectionOptions {
  kernel: OmniKernel;
  plugin: InstalledPluginEntry;
  theme?: "classic" | "panorama";
  onUpdate?: () => void;
}

/**
 * Renders a per-plugin Handled Intents & Capabilities configuration box,
 * allowing users to enable or disable specific intents that the plugin advertises.
 */
export function renderHandledIntentsSection(options: HandledIntentsSectionOptions): HTMLElement {
  const { kernel, plugin, theme = "classic", onUpdate } = options;
  const isPanorama = theme === "panorama";

  const container = document.createElement("div");
  container.className = isPanorama
    ? "panorama-config-section plugin-handled-intents-section"
    : "plugin-handled-intents-section";
  container.style.cssText = isPanorama
    ? "display: flex; flex-direction: column; gap: 8px; background: #141414; padding: 10px 12px; border: 1px solid #222;"
    : "display: flex; flex-direction: column; gap: 8px; background: var(--omni-bg-surface); padding: 12px 14px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);";

  const header = document.createElement("div");
  header.style.cssText = "display: flex; align-items: center; justify-content: space-between;";

  const title = document.createElement("strong");
  title.style.cssText = isPanorama
    ? "font-size: 0.78rem; font-weight: 600; color: #fff;"
    : "font-weight: 600; font-size: 0.82rem; color: var(--omni-text-primary);";
  title.textContent = "Handled Intents & Capabilities";
  header.appendChild(title);

  container.appendChild(header);

  const desc = document.createElement("div");
  desc.style.cssText = isPanorama ? "font-size: 0.72rem; color: #888;" : "font-size: 0.72rem; color: var(--omni-text-muted);";
  desc.textContent = "Enable or disable which cross-application actions this app is permitted to handle.";
  container.appendChild(desc);

  const intentsListWrap = document.createElement("div");
  intentsListWrap.style.cssText = "display: flex; flex-direction: column; gap: 6px; margin-top: 4px;";

  const declaredIntents = new Set<string>(plugin.handledIntents || []);
  // Include any intents currently registered in broker for this plugin
  for (const action of kernel.intentBroker.getRegisteredActions()) {
    const handlers = kernel.intentBroker.getHandlers(action);
    if (handlers.some((h) => h.pluginId === plugin.id)) {
      declaredIntents.add(action);
    }
  }

  const allIntents = Array.from(declaredIntents);

  if (allIntents.length === 0) {
    const emptyRow = document.createElement("div");
    emptyRow.style.cssText = isPanorama
      ? "font-size: 0.72rem; color: #666; font-style: italic;"
      : "font-size: 0.72rem; color: var(--omni-text-muted); font-style: italic;";
    emptyRow.textContent = "No declared intent handlers for this application.";
    intentsListWrap.appendChild(emptyRow);
  } else {
    for (const action of allIntents) {
      const info = INTENT_FRIENDLY_NAMES[action] || { label: action, desc: `Handler for "${action}" intent` };

      const row = document.createElement("label");
      row.style.cssText = isPanorama
        ? "display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: #1a1a1a; border: 1px solid #2a2a2a; cursor: pointer;"
        : "display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--omni-bg-canvas); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); cursor: pointer;";

      const left = document.createElement("div");
      left.style.cssText = "display: flex; flex-direction: column; gap: 2px;";
      left.innerHTML = `
        <span style="font-size: 0.78rem; font-weight: 500; color: ${isPanorama ? "#fff" : "var(--omni-text-primary)"};">${info.label} <code style="font-size: 0.68rem; color: ${isPanorama ? "var(--omni-accent-primary, #00a4ef)" : "var(--omni-accent-primary)"};">(${action})</code></span>
        <span style="font-size: 0.7rem; color: ${isPanorama ? "#888" : "var(--omni-text-muted)"};">${info.desc}</span>
      `;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.style.cursor = "pointer";
      cb.checked = kernel.intentBroker.isPluginIntentEnabled(plugin.id, action);

      cb.addEventListener("change", () => {
        kernel.intentBroker.setPluginIntentEnabled(plugin.id, action, cb.checked);
        if (!plugin.disabledIntents) plugin.disabledIntents = [];
        if (cb.checked) {
          plugin.disabledIntents = plugin.disabledIntents.filter((a) => a !== action);
        } else {
          if (!plugin.disabledIntents.includes(action)) {
            plugin.disabledIntents.push(action);
          }
        }
        onUpdate?.();
      });

      row.appendChild(left);
      row.appendChild(cb);
      intentsListWrap.appendChild(row);
    }
  }

  container.appendChild(intentsListWrap);
  return container;
}

export interface IntentToastOptions {
  container?: HTMLElement;
  action: string;
  candidateName: string;
  onEnable: () => void;
  onDismiss: () => void;
  theme?: "classic" | "panorama";
  timeoutMs?: number;
}

/**
 * Displays an interactive Toast notification when 0 active handlers exist for an intent,
 * but 1 disabled candidate exists: "Enable {App} to handle {action}? [Enable & Open] [Dismiss]"
 */
export function showIntentEnableToast(options: IntentToastOptions): () => void {
  const {
    container = document.body,
    action,
    candidateName,
    onEnable,
    onDismiss,
    theme = "classic",
    timeoutMs = 10000
  } = options;
  const isPanorama = theme === "panorama";

  // Existing toast remove
  const existing = document.getElementById("omni-intent-enable-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "omni-intent-enable-toast";
  toast.style.cssText = isPanorama
    ? "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 100000; display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #000; border: 1px solid var(--omni-accent-primary, #00a4ef); box-shadow: 0 8px 30px rgba(0,0,0,0.8); color: #fff; font-size: 0.82rem; font-family: var(--omni-font-sans, sans-serif); animation: omni-toast-slide-down 0.2s ease;"
    : "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 100000; display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: var(--omni-bg-surface); border: 1px solid var(--omni-accent-primary); box-shadow: 0 8px 30px rgba(0,0,0,0.5); border-radius: var(--omni-radius-sm); color: var(--omni-text-primary); font-size: 0.82rem; font-family: var(--omni-font-sans, sans-serif); animation: omni-toast-slide-down 0.2s ease;";

  const label = document.createElement("div");
  label.style.cssText = "display: flex; align-items: center; gap: 6px;";
  label.innerHTML = `
    <span style="color: ${isPanorama ? "var(--omni-accent-primary, #00a4ef)" : "var(--omni-accent-primary)"}; font-weight: 700;">✦</span>
    <span>No active handler for <strong>"${action}"</strong>. Enable <strong>${candidateName}</strong>?</span>
  `;

  const btnWrap = document.createElement("div");
  btnWrap.style.cssText = "display: flex; gap: 6px; align-items: center;";

  const btnEnable = document.createElement("button");
  btnEnable.textContent = "Enable & Open";
  btnEnable.style.cssText = isPanorama
    ? "background: var(--omni-accent-primary, #00a4ef); color: #000; border: none; font-weight: 600; padding: 4px 10px; font-size: 0.75rem; cursor: pointer;"
    : "background: var(--omni-accent-primary); color: #141312; border: none; font-weight: 600; padding: 4px 10px; border-radius: var(--omni-radius-xs); font-size: 0.75rem; cursor: pointer;";

  const btnDismiss = document.createElement("button");
  btnDismiss.textContent = "Dismiss";
  btnDismiss.style.cssText = isPanorama
    ? "background: transparent; color: #888; border: 1px solid #444; padding: 4px 8px; font-size: 0.75rem; cursor: pointer;"
    : "background: transparent; color: var(--omni-text-muted); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-xs); padding: 4px 8px; font-size: 0.75rem; cursor: pointer;";

  btnWrap.appendChild(btnEnable);
  btnWrap.appendChild(btnDismiss);
  toast.appendChild(label);
  toast.appendChild(btnWrap);
  container.appendChild(toast);

  let dismissed = false;
  let timer: any = null;

  const cleanup = () => {
    if (dismissed) return;
    dismissed = true;
    if (timer) clearTimeout(timer);
    toast.remove();
  };

  btnEnable.addEventListener("click", () => {
    cleanup();
    onEnable();
  });

  btnDismiss.addEventListener("click", () => {
    cleanup();
    onDismiss();
  });

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      cleanup();
      onDismiss();
    }, timeoutMs);
  }

  return cleanup;
}
