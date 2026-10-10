import { OmniKernel, WebCryptoKeystore, STANDARD_SLOTS } from "@omni/core";
import { NostrEvent } from "@omni/types";

// Import manifests and compiled plugin bundles (using Vite ?raw import)
import feedManifest from "../../../packages/plugins/feed/omni.manifest.json";
import feedScript from "../../../packages/plugins/feed/dist/index.js?raw";
import relaysManifest from "../../../packages/plugins/relays/omni.manifest.json";
import relaysScript from "../../../packages/plugins/relays/dist/index.js?raw";
import profileManifest from "../../../packages/plugins/profile/omni.manifest.json";
import profileScript from "../../../packages/plugins/profile/dist/index.js?raw";
import checklistManifest from "../../../packages/plugins/checklist/omni.manifest.json";
import checklistScript from "../../../packages/plugins/checklist/dist/index.js?raw";
import timerManifest from "../../../packages/plugins/timer/omni.manifest.json";
import timerScript from "../../../packages/plugins/timer/dist/index.js?raw";
import omniRuntimeScript from "../public/omni-runtime.js?raw";
import { icon } from "./icons.js";

// DOM Element references
const headerActionsSlot = document.getElementById("header-actions-slot")!;
const mainSlot = document.getElementById("main-slot")!;
const widgetsSlot = document.getElementById("widgets-slot")!;
const dockSlot = document.getElementById("dock-slot")!;
const pageFeed = document.getElementById("page-feed")!;
const pageWidgets = document.getElementById("page-widgets")!;
const dockBtnWidgets = document.getElementById("dock-btn-widgets")!;
const dockBtnFeed = document.getElementById("dock-btn-feed")!;
const dockBtnSettings = document.getElementById("dock-btn-settings")!;
const pluginsListContainer = document.getElementById("plugins-list")!;

// Unified Settings Modal Element references
const settingsModal = document.getElementById("settings-modal")!;
const btnCloseSettingsModal = document.getElementById("btn-close-settings-modal")!;

type SettingsTab = "profile" | "relays" | "layout" | "plugins" | "config";

const settingsNavBtns: Record<SettingsTab, HTMLElement | null> = {
  profile: document.getElementById("settings-tab-btn-profile"),
  relays: document.getElementById("settings-tab-btn-relays"),
  layout: document.getElementById("settings-tab-btn-layout"),
  plugins: document.getElementById("settings-tab-btn-plugins"),
  config: document.getElementById("settings-tab-btn-config")
};

const settingsPanes: Record<SettingsTab, HTMLElement | null> = {
  profile: document.getElementById("settings-pane-profile"),
  relays: document.getElementById("settings-pane-relays"),
  layout: document.getElementById("settings-pane-layout"),
  plugins: document.getElementById("settings-pane-plugins"),
  config: document.getElementById("settings-pane-config")
};

// Visual Layout Diagram Slot references
const visualListHeaderActions = document.getElementById("visual-list-header-actions");
const visualListDock = document.getElementById("visual-list-dock");
const visualListMain = document.getElementById("visual-list-main");
const visualListSidebar = document.getElementById("visual-list-sidebar");
const btnResetLayout = document.getElementById("btn-reset-layout");

// Relays Manager Element references
const inputAddRelay = document.getElementById("input-add-relay") as HTMLInputElement | null;
const btnAddRelay = document.getElementById("btn-add-relay") as HTMLButtonElement | null;
const settingsRelaysList = document.getElementById("settings-relays-list");
const relaysStatusBadge = document.getElementById("relays-status-badge");

// Plugin Config Element references
const cfgTimerWork = document.getElementById("cfg-timer-work") as HTMLInputElement | null;
const cfgTimerBreak = document.getElementById("cfg-timer-break") as HTMLInputElement | null;
const cfgTimerLongBreak = document.getElementById("cfg-timer-long-break") as HTMLInputElement | null;
const btnSaveTimerCfg = document.getElementById("btn-save-timer-cfg") as HTMLButtonElement | null;
const btnClearCompletedTasks = document.getElementById("btn-clear-completed-tasks") as HTMLButtonElement | null;
const cfgFeedLimit = document.getElementById("cfg-feed-limit") as HTMLInputElement | null;

// Profile Elements
const userBadge = document.getElementById("user-badge");
const tabBtnProfileInfo = document.getElementById("tab-btn-profile-info");
const tabBtnProfileKeys = document.getElementById("tab-btn-profile-keys");
const profilePaneInfo = document.getElementById("profile-pane-info");
const profilePaneKeys = document.getElementById("profile-pane-keys");
const profileAvatarPreview = document.getElementById("profile-avatar-preview");
const profilePreviewName = document.getElementById("profile-preview-name");
const profilePreviewNpub = document.getElementById("profile-preview-npub");
const inputProfileDisplayName = document.getElementById("input-profile-display-name") as HTMLInputElement | null;
const inputProfileName = document.getElementById("input-profile-name") as HTMLInputElement | null;
const inputProfileAbout = document.getElementById("input-profile-about") as HTMLTextAreaElement | null;
const inputProfilePicture = document.getElementById("input-profile-picture") as HTMLInputElement | null;
const inputProfileNip05 = document.getElementById("input-profile-nip05") as HTMLInputElement | null;
const inputProfileLud16 = document.getElementById("input-profile-lud16") as HTMLInputElement | null;
const btnSaveProfile = document.getElementById("btn-save-profile") as HTMLButtonElement | null;
const profileKeysNpub = document.getElementById("profile-keys-npub") as HTMLInputElement | null;
const btnCopyNpub = document.getElementById("btn-copy-npub") as HTMLButtonElement | null;
const profileKeysHex = document.getElementById("profile-keys-hex") as HTMLInputElement | null;
const btnCopyHex = document.getElementById("btn-copy-hex") as HTMLButtonElement | null;
const btnRevealNsec = document.getElementById("btn-reveal-nsec") as HTMLButtonElement | null;
const privateKeyDisplayWrapper = document.getElementById("private-key-display-wrapper");
const profileKeysNsec = document.getElementById("profile-keys-nsec") as HTMLInputElement | null;
const btnCopyNsec = document.getElementById("btn-copy-nsec") as HTMLButtonElement | null;
const inputImportNsec = document.getElementById("input-import-nsec") as HTMLInputElement | null;
const btnGenerateNewKey = document.getElementById("btn-generate-new-key") as HTMLButtonElement | null;
const btnConfirmImportKey = document.getElementById("btn-confirm-import-key") as HTMLButtonElement | null;

// 1. Full-Page Multi-View Routing (Feed Page vs Full Widgets Page)
type AppPage = "feed" | "widgets";

function showPage(page: AppPage) {
  if (page === "feed") {
    pageFeed.classList.add("active");
    pageWidgets.classList.remove("active");
    dockBtnFeed?.classList.add("active");
    dockBtnWidgets?.classList.remove("active");

    // Also highlight plugin-registered dock icons
    document.querySelectorAll(".dock-item").forEach((btn) => {
      const title = btn.getAttribute("title") || "";
      if (title.toLowerCase().includes("feed")) {
        btn.classList.add("active");
      } else if (title.toLowerCase().includes("timer") || title.toLowerCase().includes("tasks") || title.toLowerCase().includes("widget")) {
        btn.classList.remove("active");
      }
    });

    mainSlot.scrollIntoView({ behavior: "smooth" });
  } else {
    pageWidgets.classList.add("active");
    pageFeed.classList.remove("active");
    dockBtnWidgets?.classList.add("active");
    dockBtnFeed?.classList.remove("active");

    document.querySelectorAll(".dock-item").forEach((btn) => {
      const title = btn.getAttribute("title") || "";
      if (title.toLowerCase().includes("feed")) {
        btn.classList.remove("active");
      } else if (title.toLowerCase().includes("timer") || title.toLowerCase().includes("tasks") || title.toLowerCase().includes("widget")) {
        btn.classList.add("active");
      }
    });

    widgetsSlot.scrollIntoView({ behavior: "smooth" });
  }
}

dockBtnWidgets?.addEventListener("click", () => showPage("widgets"));
dockBtnFeed?.addEventListener("click", () => showPage("feed"));

// 2. Initialize OmniKernel
const STORAGE_KEY_NSEC = "omni_privkey";
const savedPrivkey = localStorage.getItem(STORAGE_KEY_NSEC) || undefined;

const kernel = new OmniKernel({
  privateKeyHex: savedPrivkey,
  bootstrapRelays: ["wss://relay.damus.io"],
  runtimeScript: omniRuntimeScript,
  onSlotAction: (action, slot) => {
    if (slot === "sidebar" || slot === "widgets") {
      if (action === "toggle") {
        const isWidgets = pageWidgets.classList.contains("active");
        showPage(isWidgets ? "feed" : "widgets");
      } else if (action === "open") {
        showPage("widgets");
      } else if (action === "close") {
        showPage("feed");
      }
    } else if (slot === "main" || slot === "feed") {
      showPage("feed");
    }
  }
});

// Map of slot names to host containers
const slotContainers = new Map<string, Element>();
slotContainers.set("header-actions", headerActionsSlot);
slotContainers.set("main", mainSlot);
slotContainers.set("dock", dockSlot);
slotContainers.set("icon", dockSlot);
slotContainers.set("sidebar", widgetsSlot);
slotContainers.set("widgets", widgetsSlot);

// 4. Plugin Registry & Installed Plugins Model
interface InstalledPluginEntry {
  id: string;
  manifest: any;
  scriptContent: string;
  sourceUrl: string;
  enabled: boolean;
  naddr?: string;
  authorNpub?: string;
  event?: any;
}

const installedPlugins: InstalledPluginEntry[] = [
  {
    id: feedManifest.id,
    manifest: feedManifest,
    scriptContent: feedScript,
    sourceUrl: "local:@omni/plugin-feed",
    enabled: true
  },
  {
    id: relaysManifest.id,
    manifest: relaysManifest,
    scriptContent: relaysScript,
    sourceUrl: "local:@omni/plugin-relays",
    enabled: true
  },
  {
    id: profileManifest.id,
    manifest: profileManifest,
    scriptContent: profileScript,
    sourceUrl: "local:@omni/plugin-profile",
    enabled: true
  },
  {
    id: checklistManifest.id,
    manifest: checklistManifest,
    scriptContent: checklistScript,
    sourceUrl: "local:@omni/plugin-checklist",
    enabled: true
  },
  {
    id: timerManifest.id,
    manifest: timerManifest,
    scriptContent: timerScript,
    sourceUrl: "local:@omni/plugin-timer",
    enabled: true
  }
];

// 5. Unified Settings Modal Navigation & Controls
function openSettingsModal(tab: SettingsTab = "profile") {
  switchSettingsTab(tab);
  settingsModal.classList.add("open");
}

function closeSettingsModal() {
  settingsModal.classList.remove("open");
}

function switchSettingsTab(tab: SettingsTab) {
  for (const [key, btn] of Object.entries(settingsNavBtns)) {
    if (btn) btn.classList.toggle("active", key === tab);
  }
  for (const [key, pane] of Object.entries(settingsPanes)) {
    if (pane) pane.classList.toggle("active", key === tab);
  }

  if (tab === "profile") {
    updateProfileUi();
  } else if (tab === "relays") {
    renderSettingsRelays();
  } else if (tab === "layout") {
    renderVisualLayoutConfigurator();
  } else if (tab === "plugins") {
    renderPluginManager();
  } else if (tab === "config") {
    renderPluginConfig();
  }
}

for (const [tab, btn] of Object.entries(settingsNavBtns)) {
  btn?.addEventListener("click", () => switchSettingsTab(tab as SettingsTab));
}

btnCloseSettingsModal?.addEventListener("click", closeSettingsModal);
settingsModal?.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettingsModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && settingsModal?.classList.contains("open")) {
    closeSettingsModal();
  }
});

// 6. Visual Layout Configurator
function renderVisualLayoutConfigurator() {
  const visualSlotMap: Record<string, HTMLElement | null> = {
    "header-actions": visualListHeaderActions,
    "dock": visualListDock,
    "main": visualListMain,
    "sidebar": visualListSidebar
  };

  const mappings = kernel.layoutManager.getMappings();

  for (const [slotId, container] of Object.entries(visualSlotMap)) {
    if (!container) continue;
    container.innerHTML = "";

    const slotItems = mappings.filter((m) => m.slotId === slotId);

    if (slotItems.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText =
        "font-size: 0.7rem; color: var(--omni-text-muted); font-style: italic; padding: 8px 4px; text-align: center; border: 1px dashed var(--omni-border-subtle); border-radius: var(--omni-radius-sm);";
      empty.textContent = "Empty slot";
      container.appendChild(empty);
      continue;
    }

    for (const item of slotItems) {
      const plugin = installedPlugins.find((p) => p.id === item.pluginId);
      const comp = plugin?.manifest?.components?.find((c: any) => c.id === item.componentId);
      const compTitle = comp?.title || item.componentId;
      const pluginName = plugin?.manifest?.name || item.pluginId;

      const chip = document.createElement("div");
      chip.className = "visual-comp-chip";

      // Chip Header: Title + Subtitle
      const infoDiv = document.createElement("div");
      infoDiv.style.cssText = "display: flex; flex-direction: column; gap: 2px; overflow: hidden;";
      infoDiv.innerHTML = `<span style="font-weight: 600; font-size: 0.78rem; color: var(--omni-text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${compTitle}</span><span style="font-size: 0.65rem; color: var(--omni-text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${pluginName}</span>`;

      // Chip Controls: Move slot selector + Visibility checkbox
      const controlsDiv = document.createElement("div");
      controlsDiv.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 4px;";

      // Slot move dropdown
      const select = document.createElement("select");
      select.style.cssText =
        "background: var(--omni-bg-surface); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); font-size: 0.68rem; padding: 2px 4px; border-radius: var(--omni-radius-sm); outline: none; flex: 1; min-width: 0;";
      for (const s of STANDARD_SLOTS) {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `→ ${s.name}`;
        if (s.id === slotId) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => {
        const targetSlotId = select.value;
        const targetContainer = slotContainers.get(targetSlotId);
        if (targetContainer) {
          kernel.reparentPluginComponent(item.pluginId, item.componentId, targetSlotId, targetContainer);
          renderVisualLayoutConfigurator();
        }
      });

      // Visible toggle checkbox
      const toggleLabel = document.createElement("label");
      toggleLabel.style.cssText =
        "display: flex; align-items: center; gap: 3px; font-size: 0.68rem; color: var(--omni-text-secondary); cursor: pointer; flex-shrink: 0;";
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = item.enabled;
      chk.addEventListener("change", () => {
        kernel.layoutManager.setComponentEnabled(item.pluginId, item.componentId, chk.checked);
        kernel.getSandbox(item.pluginId)?.setComponentVisible(item.componentId, chk.checked);
      });
      toggleLabel.appendChild(chk);
      toggleLabel.appendChild(document.createTextNode("Show"));

      controlsDiv.appendChild(select);
      controlsDiv.appendChild(toggleLabel);

      chip.appendChild(infoDiv);
      chip.appendChild(controlsDiv);
      container.appendChild(chip);
    }
  }
}

btnResetLayout?.addEventListener("click", () => {
  if (!confirm("Reset all plugin component slots back to defaults?")) return;
  const manifests = installedPlugins.map((p) => p.manifest);
  kernel.layoutManager.resetToDefaults(manifests);
  for (const p of installedPlugins) {
    for (const comp of p.manifest.components) {
      const container = slotContainers.get(comp.slot);
      if (container) {
        kernel.getSandbox(p.id)?.reparentComponent(comp.id, container);
      }
    }
  }
  renderVisualLayoutConfigurator();
});

// 7. Relays Pool Manager Settings UI
function renderSettingsRelays() {
  if (!settingsRelaysList) return;
  settingsRelaysList.innerHTML = "";

  const relays = kernel.relayPool.getAllRelays();
  const connectedCount = relays.filter((r) => r.status === "connected").length;

  if (relaysStatusBadge) {
    relaysStatusBadge.textContent = `${connectedCount} / ${relays.length} Connected`;
    relaysStatusBadge.style.color = connectedCount > 0 ? "var(--omni-status-online)" : "var(--omni-text-muted)";
  }

  if (relays.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText =
      "font-size: 0.78rem; color: var(--omni-text-muted); font-style: italic; padding: 16px; text-align: center;";
    empty.textContent = "No relays connected. Add one above or select a preset.";
    settingsRelaysList.appendChild(empty);
    return;
  }

  for (const r of relays) {
    const row = document.createElement("div");
    row.style.cssText =
      "display: flex; justify-content: space-between; align-items: center; background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); padding: 8px 12px; gap: 10px;";

    const left = document.createElement("div");
    left.style.cssText = "display: flex; align-items: center; gap: 8px; overflow: hidden; min-width: 0;";

    const dot = document.createElement("span");
    const dotColor =
      r.status === "connected"
        ? "var(--omni-status-online)"
        : r.status === "connecting"
        ? "#f59e0b"
        : "var(--omni-status-offline)";
    dot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0;`;

    const urlSpan = document.createElement("span");
    urlSpan.style.cssText =
      "font-family: var(--omni-font-mono); font-size: 0.78rem; color: var(--omni-text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;";
    urlSpan.textContent = r.url;

    const statusPill = document.createElement("span");
    statusPill.style.cssText =
      "font-size: 0.68rem; color: var(--omni-text-muted); text-transform: capitalize; flex-shrink: 0;";
    statusPill.textContent = r.status;

    left.appendChild(dot);
    left.appendChild(urlSpan);
    left.appendChild(statusPill);

    const btnRemove = document.createElement("button");
    btnRemove.className = "btn-secondary";
    btnRemove.style.cssText = "font-size: 0.72rem; padding: 3px 8px; color: #f87171; flex-shrink: 0;";
    btnRemove.textContent = "Disconnect";
    btnRemove.addEventListener("click", () => {
      kernel.relayPool.removeRelay(r.url);
      renderSettingsRelays();
    });

    row.appendChild(left);
    row.appendChild(btnRemove);
    settingsRelaysList.appendChild(row);
  }
}

btnAddRelay?.addEventListener("click", () => {
  let url = inputAddRelay?.value.trim();
  if (!url) return;
  if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
    url = `wss://${url}`;
  }
  kernel.relayPool.addRelay(url);
  if (inputAddRelay) inputAddRelay.value = "";
  renderSettingsRelays();
});

inputAddRelay?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    btnAddRelay?.click();
  }
});

document.querySelectorAll(".relay-preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const url = btn.getAttribute("data-url");
    if (url) {
      kernel.relayPool.addRelay(url);
      renderSettingsRelays();
    }
  });
});

// 8. Plugin Preferences / Dedicated Config
function renderPluginConfig() {
  const savedTimer = localStorage.getItem("omni_timer_config");
  if (savedTimer) {
    try {
      const parsed = JSON.parse(savedTimer);
      if (cfgTimerWork && parsed.work) cfgTimerWork.value = String(parsed.work);
      if (cfgTimerBreak && parsed.shortBreak) cfgTimerBreak.value = String(parsed.shortBreak);
      if (cfgTimerLongBreak && parsed.longBreak) cfgTimerLongBreak.value = String(parsed.longBreak);
    } catch {}
  }

  const savedLimit = localStorage.getItem("omni_feed_limit");
  if (savedLimit && cfgFeedLimit) {
    cfgFeedLimit.value = savedLimit;
  }
}

btnSaveTimerCfg?.addEventListener("click", async () => {
  const work = parseInt(cfgTimerWork?.value || "25", 10);
  const shortBreak = parseInt(cfgTimerBreak?.value || "5", 10);
  const longBreak = parseInt(cfgTimerLongBreak?.value || "15", 10);
  const cfg = { work, shortBreak, longBreak };

  localStorage.setItem("omni_timer_config", JSON.stringify(cfg));
  await kernel.storageManager.set("org.omni.plugin.timer", "timer_config", cfg);

  if (btnSaveTimerCfg) {
    btnSaveTimerCfg.textContent = "Saved!";
    setTimeout(() => {
      btnSaveTimerCfg.textContent = "Save Timer Settings";
    }, 1500);
  }
});

btnClearCompletedTasks?.addEventListener("click", async () => {
  try {
    const tasksRaw = await kernel.storageManager.get("org.omni.plugin.checklist", "checklist_tasks");
    if (Array.isArray(tasksRaw)) {
      const active = (tasksRaw as any[]).filter((t: any) => !t.done);
      await kernel.storageManager.set("org.omni.plugin.checklist", "checklist_tasks", active);
    }
    if (btnClearCompletedTasks) {
      btnClearCompletedTasks.textContent = "Completed Tasks Cleared!";
      setTimeout(() => {
        btnClearCompletedTasks.textContent = "Clear Completed Tasks";
      }, 1500);
    }
  } catch (err) {
    console.error("Failed to clear tasks:", err);
  }
});

cfgFeedLimit?.addEventListener("change", () => {
  if (cfgFeedLimit) {
    localStorage.setItem("omni_feed_limit", cfgFeedLimit.value);
  }
});


// Additional Modal References
const pluginsCountBadge = document.getElementById("plugins-count-badge")!;
const btnShowInstallModal = document.getElementById("btn-show-install-modal")!;
const installPluginModal = document.getElementById("install-plugin-modal")!;
const btnCloseInstallModal = document.getElementById("btn-close-install-modal")!;
const installManifestUrl = document.getElementById("install-manifest-url") as HTMLInputElement;
const installManifestJson = document.getElementById("install-manifest-json") as HTMLTextAreaElement;
const btnQuickSampleNostr = document.getElementById("btn-quick-sample-nostr") as HTMLButtonElement;
const btnQuickSamplePlugin = document.getElementById("btn-quick-sample-plugin") as HTMLButtonElement;
const btnConfirmInstall = document.getElementById("btn-confirm-install") as HTMLButtonElement;

const pluginInspectorModal = document.getElementById("plugin-inspector-modal")!;
const btnCloseInspector = document.getElementById("btn-close-inspector")!;
const inspectorPluginName = document.getElementById("inspector-plugin-name")!;
const inspectorPluginId = document.getElementById("inspector-plugin-id")!;
const inspectorSourceUrl = document.getElementById("inspector-source-url")!;
const inspectorNostrProvenance = document.getElementById("inspector-nostr-provenance")!;
const inspectorAuthorNpub = document.getElementById("inspector-author-npub")!;
const inspectorNaddr = document.getElementById("inspector-naddr")!;
const btnPublishPluginNostr = document.getElementById("btn-publish-plugin-nostr") as HTMLButtonElement;
const inspectorComponentsList = document.getElementById("inspector-components-list")!;
const inspectorPermissionsList = document.getElementById("inspector-permissions-list")!;
const inspectorManifestRaw = document.getElementById("inspector-manifest-raw")!;
const btnCopyManifest = document.getElementById("btn-copy-manifest")!;

const tabBtnOverview = document.getElementById("tab-btn-overview")!;
const tabBtnPermissions = document.getElementById("tab-btn-permissions")!;
const tabBtnManifest = document.getElementById("tab-btn-manifest")!;
const inspectorPaneOverview = document.getElementById("inspector-pane-overview")!;
const inspectorPanePermissions = document.getElementById("inspector-pane-permissions")!;
const inspectorPaneManifest = document.getElementById("inspector-pane-manifest")!;

let activeInspectedPlugin: InstalledPluginEntry | null = null;

function renderPluginManager() {
  pluginsListContainer.innerHTML = "";
  pluginsCountBadge.textContent = String(installedPlugins.length);

  for (const p of installedPlugins) {
    const card = document.createElement("div");
    card.className = "plugin-item-row";

    // Header row inside card: Title + Version + Source URL + Enable Toggle
    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.justifyContent = "space-between";
    topRow.style.alignItems = "flex-start";

    const titleGroup = document.createElement("div");
    titleGroup.style.display = "flex";
    titleGroup.style.flexDirection = "column";
    titleGroup.style.gap = "4px";

    const titleLine = document.createElement("div");
    titleLine.style.display = "flex";
    titleLine.style.alignItems = "center";
    titleLine.style.gap = "8px";

    const title = document.createElement("strong");
    title.style.fontSize = "0.95rem";
    title.textContent = p.manifest.name;

    const version = document.createElement("span");
    version.style.fontSize = "0.72rem";
    version.style.color = "var(--omni-text-muted)";
    version.textContent = `v${p.manifest.version}`;

    const statusBadge = document.createElement("span");
    statusBadge.style.fontSize = "0.7rem";
    statusBadge.style.color = p.enabled ? "var(--omni-status-online)" : "var(--omni-text-muted)";
    statusBadge.style.background = "var(--omni-bg-subtle)";
    statusBadge.style.padding = "1px 6px";
    statusBadge.style.borderRadius = "var(--omni-radius-pill)";
    statusBadge.textContent = p.enabled ? "Active" : "Disabled";

    titleLine.appendChild(title);
    titleLine.appendChild(version);
    titleLine.appendChild(statusBadge);

    const sourcePill = document.createElement("div");
    sourcePill.style.fontSize = "0.72rem";
    sourcePill.style.fontFamily = "var(--omni-font-mono)";
    sourcePill.style.color = "var(--omni-text-muted)";
    sourcePill.textContent = p.sourceUrl;

    titleGroup.appendChild(titleLine);
    titleGroup.appendChild(sourcePill);

    // Toggle switch for Enable / Disable
    const toggleLabel = document.createElement("label");
    toggleLabel.className = "omni-toggle";
    toggleLabel.title = p.enabled ? "Click to disable plugin" : "Click to enable plugin";

    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = p.enabled;
    toggleInput.addEventListener("change", async () => {
      if (toggleInput.checked) {
        await kernel.enablePlugin(p.manifest, p.scriptContent, slotContainers);
        p.enabled = true;
      } else {
        kernel.disablePlugin(p.id);
        p.enabled = false;
      }
      renderPluginManager();
    });

    const toggleSlider = document.createElement("span");
    toggleSlider.className = "toggle-slider";
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);

    topRow.appendChild(titleGroup);
    topRow.appendChild(toggleLabel);

    // Description
    const desc = document.createElement("div");
    desc.style.fontSize = "0.82rem";
    desc.style.color = "var(--omni-text-secondary)";
    desc.textContent = p.manifest.description || "No description provided.";

    // Action buttons row
    const actionsRow = document.createElement("div");
    actionsRow.style.display = "flex";
    actionsRow.style.gap = "8px";
    actionsRow.style.marginTop = "4px";

    const btnInspect = document.createElement("button");
    btnInspect.className = "btn-secondary";
    btnInspect.textContent = "Inspect Manifest";
    btnInspect.addEventListener("click", () => {
      openPluginInspector(p);
    });

    const btnClearDb = document.createElement("button");
    btnClearDb.className = "btn-secondary";
    btnClearDb.textContent = "Clear DB";
    btnClearDb.addEventListener("click", async () => {
      await kernel.storageManager.clear(p.id);
      btnClearDb.textContent = "Cleared!";
      setTimeout(() => {
        btnClearDb.textContent = "Clear DB";
      }, 1500);
    });

    const btnUninstall = document.createElement("button");
    btnUninstall.className = "btn-danger";
    btnUninstall.textContent = "Uninstall";
    btnUninstall.addEventListener("click", () => {
      if (confirm(`Uninstall ${p.manifest.name}? Its components and storage will be removed.`)) {
        uninstallPlugin(p.id);
      }
    });

    actionsRow.appendChild(btnInspect);
    actionsRow.appendChild(btnClearDb);
    actionsRow.appendChild(btnUninstall);

    card.appendChild(topRow);
    card.appendChild(desc);
    card.appendChild(actionsRow);

    pluginsListContainer.appendChild(card);
  }
}

function openPluginModal() {
  openSettingsModal("plugins");
}

function closePluginModal() {
  closeSettingsModal();
}

// Plugin Inspector Modal Logic
function openPluginInspector(plugin: InstalledPluginEntry) {
  activeInspectedPlugin = plugin;
  inspectorPluginName.textContent = plugin.manifest.name;
  inspectorPluginId.textContent = plugin.manifest.id;
  inspectorSourceUrl.textContent = plugin.sourceUrl;

  if (plugin.naddr) {
    inspectorNostrProvenance.style.display = "flex";
    inspectorAuthorNpub.textContent = plugin.authorNpub || "Anonymous";
    inspectorNaddr.textContent = plugin.naddr;
    btnPublishPluginNostr.textContent = "Re-Publish to Nostr (Update)";
  } else {
    inspectorNostrProvenance.style.display = "none";
    btnPublishPluginNostr.textContent = "Publish / Share to Nostr (NIP-5A)";
  }

  // 1. Components list
  inspectorComponentsList.innerHTML = "";
  for (const comp of plugin.manifest.components || []) {
    const item = document.createElement("div");
    item.style.background = "var(--omni-bg-surface)";
    item.style.border = "1px solid var(--omni-border-subtle)";
    item.style.borderRadius = "var(--omni-radius-sm)";
    item.style.padding = "8px 12px";
    item.style.fontSize = "0.8rem";
    item.style.display = "flex";
    item.style.justifyContent = "space-between";
    item.style.alignItems = "center";

    const left = document.createElement("div");
    left.innerHTML = `<strong>${comp.title || comp.id}</strong> <span style="color: var(--omni-text-muted); font-size: 0.72rem;">(${comp.id})</span>`;

    const slotPill = document.createElement("span");
    slotPill.style.background = "var(--omni-bg-subtle)";
    slotPill.style.color = "var(--omni-accent-primary)";
    slotPill.style.padding = "2px 8px";
    slotPill.style.borderRadius = "var(--omni-radius-pill)";
    slotPill.style.fontFamily = "var(--omni-font-mono)";
    slotPill.style.fontSize = "0.72rem";
    slotPill.textContent = `slot: ${comp.slot}`;

    item.appendChild(left);
    item.appendChild(slotPill);
    inspectorComponentsList.appendChild(item);
  }

  // 2. Permissions list with interactive toggles
  inspectorPermissionsList.innerHTML = "";
  const declaredPerms: Array<{ key: string; name: string; desc: string }> = [];

  if (plugin.manifest.permissions?.storage) {
    declaredPerms.push({
      key: "storage:kv",
      name: "Scoped Storage (KV)",
      desc: `Persistent IndexedDB storage (Quota: ${plugin.manifest.permissions.storage.quotaMb || 5} MB)`
    });
  }
  if (plugin.manifest.permissions?.intents) {
    declaredPerms.push({
      key: "intents:dispatch",
      name: "Intent Dispatch",
      desc: "Allow cross-plugin intent calls and events"
    });
  }
  // Standard Nostr permissions
  declaredPerms.push({
    key: "nostr:read",
    name: "Nostr Subscriptions (Read)",
    desc: "Subscribe to public notes, profiles, and live timeline streams"
  });
  declaredPerms.push({
    key: "nostr:write",
    name: "Nostr Event Signing (Write)",
    desc: "Draft and request signing of Nostr notes and custom events"
  });

  for (const perm of declaredPerms) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.background = "var(--omni-bg-surface)";
    row.style.border = "1px solid var(--omni-border-subtle)";
    row.style.borderRadius = "var(--omni-radius-sm)";
    row.style.padding = "10px 12px";

    const info = document.createElement("div");
    info.style.display = "flex";
    info.style.flexDirection = "column";
    info.style.gap = "2px";

    const name = document.createElement("strong");
    name.style.fontSize = "0.82rem";
    name.textContent = perm.name;

    const desc = document.createElement("span");
    desc.style.fontSize = "0.72rem";
    desc.style.color = "var(--omni-text-muted)";
    desc.textContent = perm.desc;

    info.appendChild(name);
    info.appendChild(desc);

    const toggle = document.createElement("label");
    toggle.className = "omni-toggle";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = kernel.getPluginPermission(plugin.id, perm.key);
    input.addEventListener("change", () => {
      kernel.setPluginPermission(plugin.id, perm.key, input.checked);
    });

    const slider = document.createElement("span");
    slider.className = "toggle-slider";

    toggle.appendChild(input);
    toggle.appendChild(slider);

    row.appendChild(info);
    row.appendChild(toggle);
    inspectorPermissionsList.appendChild(row);
  }

  // 3. Raw Manifest
  inspectorManifestRaw.textContent = JSON.stringify(plugin.manifest, null, 2);

  // Switch to default Overview tab
  switchInspectorTab("overview");
  pluginInspectorModal.classList.add("open");
}

function closePluginInspector() {
  pluginInspectorModal.classList.remove("open");
  activeInspectedPlugin = null;
}

function switchInspectorTab(tab: "overview" | "permissions" | "manifest") {
  tabBtnOverview.classList.toggle("active", tab === "overview");
  tabBtnPermissions.classList.toggle("active", tab === "permissions");
  tabBtnManifest.classList.toggle("active", tab === "manifest");

  inspectorPaneOverview.style.display = tab === "overview" ? "flex" : "none";
  inspectorPanePermissions.style.display = tab === "permissions" ? "flex" : "none";
  inspectorPaneManifest.style.display = tab === "manifest" ? "flex" : "none";
}

tabBtnOverview.addEventListener("click", () => switchInspectorTab("overview"));
tabBtnPermissions.addEventListener("click", () => switchInspectorTab("permissions"));
tabBtnManifest.addEventListener("click", () => switchInspectorTab("manifest"));
btnCloseInspector.addEventListener("click", closePluginInspector);
pluginInspectorModal.addEventListener("click", (e) => {
  if (e.target === pluginInspectorModal) closePluginInspector();
});

btnCopyManifest.addEventListener("click", async () => {
  if (activeInspectedPlugin) {
    await navigator.clipboard.writeText(JSON.stringify(activeInspectedPlugin.manifest, null, 2));
    btnCopyManifest.textContent = "Copied!";
    setTimeout(() => {
      btnCopyManifest.textContent = "Copy JSON";
    }, 1500);
  }
});

btnPublishPluginNostr.addEventListener("click", async () => {
  if (!activeInspectedPlugin) return;
  const p = activeInspectedPlugin;
  btnPublishPluginNostr.disabled = true;
  btnPublishPluginNostr.textContent = "Signing & Publishing to Nostr...";

  try {
    const published = await kernel.publishNsitePlugin(p.manifest, p.scriptContent);
    p.naddr = published.naddr;
    p.authorNpub = published.authorNpub;
    p.event = published.event;
    p.sourceUrl = published.naddr;

    inspectorNostrProvenance.style.display = "flex";
    inspectorAuthorNpub.textContent = published.authorNpub;
    inspectorNaddr.textContent = published.naddr;
    inspectorSourceUrl.textContent = published.naddr;
    btnPublishPluginNostr.textContent = "Published & Verified!";

    await navigator.clipboard.writeText(published.naddr);
    alert(`Plugin '${p.manifest.name}' successfully signed and published to Nostr relays (NIP-5A)!\n\nShareable Nostr Address (copied to clipboard):\n${published.naddr}`);

    setTimeout(() => {
      btnPublishPluginNostr.disabled = false;
      btnPublishPluginNostr.textContent = "Re-Publish to Nostr (Update)";
    }, 2000);
  } catch (err: any) {
    console.error("Failed to publish plugin to Nostr:", err);
    alert(`Failed to publish plugin to Nostr: ${err.message || String(err)}`);
    btnPublishPluginNostr.disabled = false;
    btnPublishPluginNostr.textContent = "Publish / Share to Nostr (NIP-5A)";
  }
});

// Install Plugin Modal Logic
btnShowInstallModal.addEventListener("click", () => {
  installPluginModal.classList.add("open");
});

btnCloseInstallModal.addEventListener("click", () => {
  installPluginModal.classList.remove("open");
});

installPluginModal.addEventListener("click", (e) => {
  if (e.target === installPluginModal) installPluginModal.classList.remove("open");
});

// Quick Sample Plugin (Scratchpad Notes)
const SAMPLE_SCRATCHPAD_MANIFEST = {
  $schema: "https://omni.org/schemas/manifest.v1.json",
  id: "org.omni.plugins.scratchpad",
  name: "Scratchpad Notes",
  version: "1.0.0",
  description: "Minimal persistent scratchpad note taking widget",
  author: { name: "Omni Community" },
  license: "MIT",
  permissions: {
    storage: { quotaMb: 2 }
  },
  components: [
    {
      id: "scratchpad-sidebar-widget",
      slot: "sidebar",
      title: "Scratchpad",
      description: "Fast markdown scratchpad"
    }
  ]
};

const SAMPLE_SCRATCHPAD_SCRIPT = `
if (typeof omni !== "undefined") {
  omni.registerComponent("scratchpad-sidebar-widget", async ({ root }) => {
    const card = root.createElement("div");
    card.setAttribute("style", "background: var(--omni-bg-surface); border: 1px solid var(--omni-border-strong); border-radius: var(--omni-radius-md); padding: 14px; display: flex; flex-direction: column; gap: 10px;");

    const header = root.createElement("div");
    header.setAttribute("style", "display: flex; justify-content: space-between; align-items: center;");
    const title = root.createElement("h3");
    title.setAttribute("style", "font-size: 0.95rem; font-weight: 600;");
    title.textContent = "Scratchpad Notes";
    header.appendChild(title);
    card.appendChild(header);

    const textarea = root.createElement("textarea");
    textarea.setAttribute("style", "width: 100%; min-height: 90px; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); border-radius: var(--omni-radius-sm); color: var(--omni-text-primary); padding: 8px 10px; font-family: var(--omni-font-sans); font-size: 0.85rem; outline: none; resize: vertical;");
    textarea.setAttribute("placeholder", "Write persistent notes here...");

    const saved = await omni.storage.get("scratchpad_content");
    if (saved) textarea.value = saved;

    textarea.addEventListener("input", async (e) => {
      const val = textarea.value;
      await omni.storage.set("scratchpad_content", val);
    });

    card.appendChild(textarea);
    root.appendChild(card);
  });
}
`;

btnQuickSamplePlugin.addEventListener("click", () => {
  installManifestUrl.value = "https://registry.omni.org/plugins/scratchpad/omni.manifest.json";
  installManifestJson.value = JSON.stringify(SAMPLE_SCRATCHPAD_MANIFEST, null, 2);
});

btnQuickSampleNostr.addEventListener("click", async () => {
  btnQuickSampleNostr.disabled = true;
  btnQuickSampleNostr.textContent = "Publishing to Nostr...";

  try {
    const sampleManifest: any = {
      $schema: "https://omni.org/schemas/manifest.v1.json",
      id: "org.omni.plugin.nostr-wisdom",
      name: "Decentralized Wisdom",
      version: "1.0.0",
      description: "Cryptographic quotes and cypherpunk wisdom widget published via Nostr NIP-5A",
      entry: "dist/index.js",
      components: [
        {
          id: "wisdom-sidebar-widget",
          slot: "sidebar",
          type: "sidebar",
          title: "Wisdom Widget"
        }
      ],
      permissions: {
        storage: { quotaMb: 2 },
        nostr: { read: { allKinds: true } }
      }
    };

    const sampleScript = `
if (typeof omni !== "undefined") {
  const quotes = [
    "“Fix the money, fix the world.” — Satoshi Nakamoto",
    "“Vires in numeris — Strength in numbers.”",
    "“Don't trust, verify.” — Cypherpunk Maxim",
    "“Nostr: Freedom of speech meets cryptographic proof.”",
    "“Decentralization is not a feature; it is the entire foundation.”"
  ];
  let quoteIndex = 0;

  omni.registerComponent("wisdom-sidebar-widget", ({ root }) => {
    const card = root.createElement("div");
    card.setAttribute("style", "background: var(--omni-bg-surface); border: 1px solid var(--omni-border-strong); border-radius: var(--omni-radius-md); padding: 14px; display: flex; flex-direction: column; gap: 10px;");

    const header = root.createElement("div");
    header.setAttribute("style", "display: flex; justify-content: space-between; align-items: center;");
    const h = root.createElement("h3");
    h.setAttribute("style", "font-size: 0.95rem; font-weight: 600; color: var(--omni-accent-primary);");
    h.textContent = "✦ Decentralized Wisdom";
    header.appendChild(h);
    card.appendChild(header);

    const quoteP = root.createElement("p");
    quoteP.setAttribute("style", "font-size: 0.85rem; color: var(--omni-text-primary); line-height: 1.4; font-style: italic; min-height: 40px;");
    quoteP.textContent = quotes[quoteIndex];
    card.appendChild(quoteP);

    const btnNext = root.createElement("button");
    btnNext.setAttribute("style", "background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 5px 12px; border-radius: var(--omni-radius-sm); font-size: 0.78rem; cursor: pointer; align-self: flex-start;");
    btnNext.textContent = "Next Quote →";
    btnNext.addEventListener("click", () => {
      quoteIndex = (quoteIndex + 1) % quotes.length;
      quoteP.textContent = quotes[quoteIndex];
    });
    card.appendChild(btnNext);

    root.appendChild(card);
  });
}
`;

    const published = await kernel.publishNsitePlugin(sampleManifest, sampleScript);
    installManifestUrl.value = published.naddr;
    installManifestJson.value = "";
    btnQuickSampleNostr.textContent = "naddr Loaded!";
    setTimeout(() => {
      btnQuickSampleNostr.disabled = false;
      btnQuickSampleNostr.textContent = "Load Sample Nostr (naddr)";
    }, 2000);
  } catch (err: any) {
    console.error("Failed to generate Nostr sample:", err);
    alert(`Failed to publish Nostr sample: ${err.message || String(err)}`);
    btnQuickSampleNostr.disabled = false;
    btnQuickSampleNostr.textContent = "Load Sample Nostr (naddr)";
  }
});

btnConfirmInstall.addEventListener("click", async () => {
  const jsonText = installManifestJson.value.trim();
  const urlText = installManifestUrl.value.trim();

  let manifest: any = null;
  let scriptContent = "";
  let resolvedNaddr: string | undefined;
  let resolvedAuthorNpub: string | undefined;

  btnConfirmInstall.disabled = true;

  try {
    if (urlText && (urlText.startsWith("naddr1") || urlText.includes(":"))) {
      // 1. Resolve from Nostr Network (NIP-5A)
      btnConfirmInstall.textContent = "Resolving from Nostr (NIP-5A)...";
      const resolved = await kernel.resolveNsitePlugin(urlText);
      manifest = resolved.manifest;
      scriptContent = resolved.scriptContent;
      resolvedNaddr = resolved.naddr;
      resolvedAuthorNpub = resolved.authorNpub;
    } else if (urlText) {
      // 2. Fetch from HTTPS URL
      btnConfirmInstall.textContent = "Fetching from URL...";
      const res = await fetch(urlText);
      manifest = await res.json();
    } else if (jsonText) {
      // 3. Raw JSON paste
      manifest = JSON.parse(jsonText);
    } else {
      alert("Please provide either a Nostr naddr, Manifest URL, or paste a JSON manifest.");
      btnConfirmInstall.disabled = false;
      return;
    }

    if (!manifest.id || !manifest.name) {
      alert("Invalid manifest: 'id' and 'name' are required fields.");
      btnConfirmInstall.disabled = false;
      return;
    }

    // Check if already installed
    if (installedPlugins.some((p) => p.id === manifest.id)) {
      alert(`Plugin '${manifest.name}' (${manifest.id}) is already installed.`);
      btnConfirmInstall.disabled = false;
      return;
    }

    // Default script content if not resolved from Nostr
    if (!scriptContent) {
      scriptContent = manifest.id === "org.omni.plugins.scratchpad"
        ? SAMPLE_SCRATCHPAD_SCRIPT
        : `
if (typeof omni !== "undefined") {
  ${(manifest.components || []).map((c: any) => `
  omni.registerComponent("${c.id}", ({ root }) => {
    const card = root.createElement("div");
    card.setAttribute("style", "background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-md); padding: 12px;");
    const h = root.createElement("h4");
    h.textContent = "${c.title || c.id}";
    const p = root.createElement("p");
    p.setAttribute("style", "font-size: 0.8rem; color: var(--omni-text-muted);");
    p.textContent = "${c.description || "Contributed component"}";
    card.appendChild(h);
    card.appendChild(p);
    root.appendChild(card);
  });
  `).join("\n")}
}
`;
    }

    const entry: InstalledPluginEntry = {
      id: manifest.id,
      manifest,
      scriptContent,
      sourceUrl: resolvedNaddr || urlText || `custom:${manifest.id}`,
      enabled: true,
      naddr: resolvedNaddr,
      authorNpub: resolvedAuthorNpub
    };

    btnConfirmInstall.textContent = "Mounting to sandbox...";
    await kernel.registerPlugin(manifest, scriptContent, slotContainers);
    installedPlugins.push(entry);
    renderPluginManager();
    installPluginModal.classList.remove("open");
    installManifestUrl.value = "";
    installManifestJson.value = "";
    alert(`Plugin '${manifest.name}' installed successfully!${resolvedNaddr ? `\n(Verified Nostr NIP-5A Origin: ${resolvedNaddr.slice(0, 16)}...)` : ""}`);
  } catch (err: any) {
    console.error("Install failed:", err);
    alert(`Install failed: ${err.message || String(err)}`);
  } finally {
    btnConfirmInstall.disabled = false;
    btnConfirmInstall.textContent = "Install Plugin";
  }
});

function uninstallPlugin(pluginId: string) {
  kernel.uninstallPlugin(pluginId);
  const idx = installedPlugins.findIndex((p) => p.id === pluginId);
  if (idx !== -1) {
    installedPlugins.splice(idx, 1);
  }
  renderPluginManager();
}

// Synchronous Top-Level UI Event Bindings
dockBtnSettings?.addEventListener("click", () => openSettingsModal("profile"));

// Profile & Identity Modal Wiring
async function updateProfileUi() {
  const pubkey = await kernel.getUserPubkey();
  const npub = await kernel.getNpub();
  const shortNpub = `${npub.slice(0, 10)}...${npub.slice(-4)}`;

  if (profileKeysNpub) profileKeysNpub.value = npub;
  if (profileKeysHex) profileKeysHex.value = pubkey;
  if (profilePreviewNpub) profilePreviewNpub.textContent = shortNpub;

  const profile = await kernel.getProfile(pubkey);
  if (profile) {
    if (inputProfileDisplayName) inputProfileDisplayName.value = profile.display_name || "";
    if (inputProfileName) inputProfileName.value = profile.name || "";
    if (inputProfileAbout) inputProfileAbout.value = profile.about || "";
    if (inputProfilePicture) inputProfilePicture.value = profile.picture || "";
    if (inputProfileNip05) inputProfileNip05.value = profile.nip05 || "";
    if (inputProfileLud16) inputProfileLud16.value = profile.lud16 || "";

    const displayName = profile.display_name || profile.name || shortNpub;
    if (userBadge) {
      userBadge.textContent = displayName;
      userBadge.title = `${displayName}\n${npub}\nClick to manage profile & keys`;
    }
    if (profilePreviewName) profilePreviewName.textContent = profile.display_name || profile.name || "Guest User";

    if (profile.picture && profileAvatarPreview) {
      profileAvatarPreview.innerHTML = `<img src="${encodeURI(profile.picture)}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.remove()" />`;
    } else if (profileAvatarPreview) {
      profileAvatarPreview.textContent = "✦";
    }
  } else {
    if (inputProfileDisplayName) inputProfileDisplayName.value = "";
    if (inputProfileName) inputProfileName.value = "";
    if (inputProfileAbout) inputProfileAbout.value = "";
    if (inputProfilePicture) inputProfilePicture.value = "";
    if (inputProfileNip05) inputProfileNip05.value = "";
    if (inputProfileLud16) inputProfileLud16.value = "";
    if (userBadge) {
      userBadge.textContent = shortNpub;
      userBadge.title = `Your Nostr Identity: ${npub}\nClick to manage profile & keys`;
    }
    if (profilePreviewName) profilePreviewName.textContent = "Guest User";
    if (profileAvatarPreview) profileAvatarPreview.textContent = "✦";
  }
}

function updateLivePreview() {
  const dName = inputProfileDisplayName?.value.trim() || "";
  const name = inputProfileName?.value.trim() || "";
  if (profilePreviewName) profilePreviewName.textContent = dName || name || "Guest User";

  const pic = inputProfilePicture?.value.trim() || "";
  if (pic && profileAvatarPreview) {
    profileAvatarPreview.innerHTML = `<img src="${encodeURI(pic)}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.remove()" />`;
  } else if (profileAvatarPreview) {
    profileAvatarPreview.textContent = "✦";
  }
}

inputProfileDisplayName?.addEventListener("input", updateLivePreview);
inputProfileName?.addEventListener("input", updateLivePreview);
inputProfilePicture?.addEventListener("input", updateLivePreview);

function openProfileModal() {
  openSettingsModal("profile");
  if (privateKeyDisplayWrapper) privateKeyDisplayWrapper.style.display = "none";
  if (profileKeysNsec) profileKeysNsec.value = "";
  if (btnRevealNsec) btnRevealNsec.textContent = "Reveal Private Key";
}

function closeProfileModal() {
  closeSettingsModal();
}

userBadge?.addEventListener("click", openProfileModal);

tabBtnProfileInfo?.addEventListener("click", () => {
  tabBtnProfileInfo.classList.add("active");
  tabBtnProfileKeys?.classList.remove("active");
  if (profilePaneInfo) profilePaneInfo.style.display = "flex";
  if (profilePaneKeys) profilePaneKeys.style.display = "none";
});

tabBtnProfileKeys?.addEventListener("click", () => {
  tabBtnProfileKeys.classList.add("active");
  tabBtnProfileInfo?.classList.remove("active");
  if (profilePaneKeys) profilePaneKeys.style.display = "flex";
  if (profilePaneInfo) profilePaneInfo.style.display = "none";
});

btnSaveProfile?.addEventListener("click", async () => {
  if (!btnSaveProfile) return;
  btnSaveProfile.disabled = true;
  btnSaveProfile.textContent = "Signing & Publishing (kind 0)...";

  try {
    const metadata: Record<string, any> = {};
    if (inputProfileName?.value.trim()) metadata.name = inputProfileName.value.trim();
    if (inputProfileDisplayName?.value.trim()) metadata.display_name = inputProfileDisplayName.value.trim();
    if (inputProfileAbout?.value.trim()) metadata.about = inputProfileAbout.value.trim();
    if (inputProfilePicture?.value.trim()) metadata.picture = inputProfilePicture.value.trim();
    if (inputProfileNip05?.value.trim()) metadata.nip05 = inputProfileNip05.value.trim();
    if (inputProfileLud16?.value.trim()) metadata.lud16 = inputProfileLud16.value.trim();

    await kernel.publishProfile(metadata);
    await updateProfileUi();
    btnSaveProfile.textContent = "Profile Saved & Published!";
    setTimeout(() => {
      if (btnSaveProfile) {
        btnSaveProfile.disabled = false;
        btnSaveProfile.textContent = "Save & Publish Profile (kind 0)";
      }
    }, 1800);
  } catch (err: any) {
    console.error("Failed to publish profile:", err);
    alert(`Failed to publish profile: ${err.message || String(err)}`);
    btnSaveProfile.disabled = false;
    btnSaveProfile.textContent = "Save & Publish Profile (kind 0)";
  }
});

async function copyToClipboard(text: string, button: HTMLButtonElement | null) {
  if (!button) return;
  try {
    await navigator.clipboard.writeText(text);
    const prev = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => {
      button.textContent = prev;
    }, 1200);
  } catch {
    window.prompt("Copy to clipboard:", text);
  }
}

btnCopyNpub?.addEventListener("click", () => copyToClipboard(profileKeysNpub?.value || "", btnCopyNpub));
btnCopyHex?.addEventListener("click", () => copyToClipboard(profileKeysHex?.value || "", btnCopyHex));
btnCopyNsec?.addEventListener("click", () => copyToClipboard(profileKeysNsec?.value || "", btnCopyNsec));

btnRevealNsec?.addEventListener("click", () => {
  if (!privateKeyDisplayWrapper || !profileKeysNsec || !btnRevealNsec) return;
  if (privateKeyDisplayWrapper.style.display === "flex") {
    privateKeyDisplayWrapper.style.display = "none";
    profileKeysNsec.value = "";
    btnRevealNsec.textContent = "Reveal Private Key";
    return;
  }

  const confirmed = window.confirm(
    "⚠️ WARNING: Never share your private key with anyone!\nAnyone who sees your nsec has full permanent control of your identity.\n\nDo you want to reveal your private key?"
  );
  if (!confirmed) return;

  profileKeysNsec.value = kernel.getNsec();
  privateKeyDisplayWrapper.style.display = "flex";
  btnRevealNsec.textContent = "Hide Private Key";
});

btnConfirmImportKey?.addEventListener("click", async () => {
  const keyInput = inputImportNsec?.value.trim();
  if (!keyInput) {
    alert("Please enter a private key (nsec1... or 64-char hex)");
    return;
  }

  try {
    const decoded = WebCryptoKeystore.decodeKey(keyInput);
    if ((decoded.type !== "nsec" && decoded.type !== "hex") || !decoded.hex) {
      alert("The identifier you entered is not a private key. You must enter an nsec or hex private key to switch signing identity.");
      return;
    }

    const confirmed = window.confirm("Switch to this Nostr account? This will change your active identity.");
    if (!confirmed) return;

    kernel.switchPrivateKey(decoded.hex);
    localStorage.setItem(STORAGE_KEY_NSEC, decoded.hex);
    if (inputImportNsec) inputImportNsec.value = "";

    await updateProfileUi();
    if (privateKeyDisplayWrapper) privateKeyDisplayWrapper.style.display = "none";
    if (profileKeysNsec) profileKeysNsec.value = "";
    if (btnRevealNsec) btnRevealNsec.textContent = "Reveal Private Key";

    alert("Identity switched successfully!");
  } catch (err: any) {
    alert(`Failed to import key: ${err.message || String(err)}`);
  }
});

btnGenerateNewKey?.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Generate a fresh random Nostr keypair? This will switch your active identity to a new anonymous account."
  );
  if (!confirmed) return;

  const freshHex = WebCryptoKeystore.generatePrivateKey();
  kernel.switchPrivateKey(freshHex);
  localStorage.setItem(STORAGE_KEY_NSEC, freshHex);

  await updateProfileUi();
  if (privateKeyDisplayWrapper) privateKeyDisplayWrapper.style.display = "none";
  if (profileKeysNsec) profileKeysNsec.value = "";
  if (btnRevealNsec) btnRevealNsec.textContent = "Reveal Private Key";

  alert("New Nostr keypair generated and activated!");
});

// 6. Application Startup & Main Wiring
async function startApp() {
  console.log("⚡ [Omni Web] Booting OmniKernel...");
  await kernel.boot();

  // Persist private key if not already saved
  if (!localStorage.getItem(STORAGE_KEY_NSEC)) {
    localStorage.setItem(STORAGE_KEY_NSEC, kernel.keystore.getPrivateKey());
  }

  // Load and display user profile
  await updateProfileUi();
  const userPubkey = await kernel.getUserPubkey();

  // Check existing events in local store; if empty, seed a welcome note
  const existingNotes = await kernel.eventStore.getEvents({ kinds: [1], limit: 5 });
  if (existingNotes.length === 0) {
    console.log("⚡ [Omni Web] Seeding welcome note to local 0ms store...");
    await kernel.publishNote(
      "Welcome to Omni! ✦ A modular, mobile-first Nostr web client where every feature is a first-class plugin. Use the Layout tool to customize widget slots, and inspect relay connections via the status pill."
    );
  }

  // Mount all enabled plugins into runtime sandboxes
  console.log("⚡ [Omni Web] Mounting core plugins into modular runtime...");
  for (const p of installedPlugins) {
    if (p.enabled) {
      console.log(`⚡ [Omni Web] Mounting plugin ${p.manifest.name}...`);
      await kernel.registerPlugin(p.manifest as any, p.scriptContent, slotContainers);
    }
  }

  console.log("🚀 [Omni Web] App running successfully!");
}

startApp().catch((err) => {
  console.error("Fatal startup error in Omni Web:", err);
});

