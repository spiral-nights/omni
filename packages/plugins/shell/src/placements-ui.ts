import { LayoutManager } from "@omni/core";
import { PluginPlacement, PluginViewDeclaration } from "@omni/types";
import { InstalledPluginEntry } from "./base-shell.js";
import { icon } from "./icons.js";

export interface RenderPluginPlacementsOptions {
  plugin: InstalledPluginEntry;
  theme?: "classic" | "editorial" | "panorama";
  viewportOptions: { id: string; label: string; description: string }[];
  pluginViews: PluginViewDeclaration[];
  synthManifest?: any;
  layoutManager?: LayoutManager;
  onUpdate: () => void;
  onRemount: () => Promise<void>;
  onRefreshAll?: () => void;
  getPluginPlacements: (plugin: InstalledPluginEntry) => PluginPlacement[];
  isPinned?: boolean;
  onTogglePin?: (pinned: boolean) => void;
}

export function renderPluginPlacementsSection(options: RenderPluginPlacementsOptions): HTMLElement {
  const {
    plugin,
    theme = "classic",
    viewportOptions,
    pluginViews,
    synthManifest,
    layoutManager,
    onUpdate,
    onRemount,
    onRefreshAll
  } = options;

  const safeId = plugin.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const isPanorama = theme === "panorama";

  const placementsBox = document.createElement("div");
  placementsBox.className = isPanorama
    ? "panorama-config-section plugin-placements-section"
    : "plugin-placements-section";

  if (isPanorama) {
    placementsBox.style.cssText = "display: flex; flex-direction: column; gap: 8px; background: #141414; padding: 10px 12px; border: 1px solid #222;";
  }

  const placementsHeader = document.createElement("div");
  placementsHeader.className = isPanorama ? "panorama-config-section-title" : "";
  placementsHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center;";

  const placementsTitle = document.createElement("span");
  if (isPanorama) {
    placementsTitle.style.cssText = "font-size: 0.78rem; font-weight: 600; color: #fff;";
    placementsTitle.textContent = "Assigned Viewports & Routes";
  } else {
    placementsTitle.style.cssText = "font-family: var(--omni-font-mono, monospace); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--omni-text-primary);";
    placementsTitle.textContent = "Placements & Viewports";
  }
  placementsHeader.appendChild(placementsTitle);

  const btnAddPlacement = document.createElement("button");
  btnAddPlacement.className = isPanorama
    ? "btn-panorama-action btn-add-placement"
    : "editorial-btn-secondary btn-add-placement";
  btnAddPlacement.id = `btn-add-placement-${safeId}`;
  if (!isPanorama) {
    btnAddPlacement.style.cssText = "font-size: 0.68rem; padding: 3px 8px;";
  }
  btnAddPlacement.textContent = "+ Add Location";
  btnAddPlacement.addEventListener("click", async () => {
    const currentPlacements = options.getPluginPlacements(plugin);
    const newPl: PluginPlacement = {
      id: `placement-${Date.now()}`,
      viewport: "sidebar",
      route: pluginViews[0]?.path || "",
      viewId: pluginViews[0]?.id || "main",
      enabled: true
    };
    plugin.placements = [...currentPlacements, newPl];
    plugin.viewport = plugin.placements[0].viewport;
    onUpdate();
    await onRemount();
    if (onRefreshAll) onRefreshAll();
  });
  placementsHeader.appendChild(btnAddPlacement);
  placementsBox.appendChild(placementsHeader);

  const placements = options.getPluginPlacements(plugin);
  if (placements.length === 0) {
    const emptyPl = document.createElement("div");
    emptyPl.className = "empty-placements-note";
    emptyPl.style.cssText = isPanorama
      ? "font-size: 0.72rem; color: #888; font-style: italic;"
      : "font-family: var(--omni-font-mono, monospace); font-size: 0.68rem; color: var(--omni-text-muted); font-style: italic;";
    emptyPl.textContent = "Unassigned — Not currently placed in any viewport.";
    placementsBox.appendChild(emptyPl);
  }

  for (let plIdx = 0; plIdx < placements.length; plIdx++) {
    const pl = placements[plIdx];
    const row = document.createElement("div");
    row.className = "plugin-placement-row";
    if (isPanorama) {
      row.style.cssText = "display: flex; flex-direction: column; gap: 8px; background: #0c0c0c; padding: 10px 12px; border: 1px solid #1e1e1e;";
    }

    const rowHeader = document.createElement("div");
    rowHeader.style.cssText = "display: flex; align-items: center; justify-content: space-between;";

    const plNumber = document.createElement("span");
    if (isPanorama) {
      plNumber.style.cssText = "font-size: 0.74rem; font-weight: 600; color: #fff;";
    } else {
      plNumber.style.cssText = "font-family: var(--omni-font-mono, monospace); font-size: 0.7rem; font-weight: 700; color: var(--omni-text-primary); text-transform: uppercase;";
    }
    plNumber.textContent = `Placement #${plIdx + 1}`;
    rowHeader.appendChild(plNumber);

    const btnRemovePl = document.createElement("button");
    btnRemovePl.className = isPanorama
      ? "btn-panorama-action btn-remove-placement"
      : "editorial-btn-secondary btn-remove-placement";
    btnRemovePl.style.cssText = isPanorama
      ? "font-size: 0.72rem; padding: 4px 10px; color: #ff5555; border-color: #552222;"
      : "font-size: 0.65rem; padding: 2px 6px; color: #ff5555; border-color: #552222;";
    btnRemovePl.textContent = placements.length > 1 ? "Remove" : "Unassign";
    btnRemovePl.title = "Remove this placement";
    btnRemovePl.addEventListener("click", async () => {
      plugin.placements = placements.filter((_, idx) => idx !== plIdx);
      if (plugin.placements.length > 0) {
        plugin.viewport = plugin.placements[0].viewport;
      } else {
        plugin.viewport = "";
        layoutManager?.unregisterPlugin(plugin.id);
      }
      onUpdate();
      await onRemount();
      if (onRefreshAll) onRefreshAll();
    });
    rowHeader.appendChild(btnRemovePl);
    row.appendChild(rowHeader);

    const fieldsGrid = document.createElement("div");
    fieldsGrid.className = "plugin-placement-fields";
    if (isPanorama) {
      fieldsGrid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px;";
    }

    // Viewport Column
    const vpCol = document.createElement("label");
    if (isPanorama) {
      vpCol.style.cssText = "display: flex; flex-direction: column; gap: 4px; font-size: 0.7rem; color: #888;";
    } else {
      vpCol.style.cssText = "display: flex; flex-direction: column; gap: 4px; font-family: var(--omni-font-mono, monospace); font-size: 0.65rem; color: var(--omni-text-muted); text-transform: uppercase;";
    }
    const vpLabel = document.createElement("span");
    vpLabel.textContent = "Viewport";
    vpCol.appendChild(vpLabel);

    const vpSelect = document.createElement("select");
    vpSelect.className = "plugin-viewport-select";
    if (isPanorama) {
      vpSelect.style.cssText = "background: #191919; border: 1px solid #333; color: #fff; font-size: 0.75rem; padding: 6px 8px; outline: none; cursor: pointer; width: 100%; height: 32px; box-sizing: border-box;";
    }

    let hasSelectedVp = false;
    for (const optDef of viewportOptions) {
      const opt = document.createElement("option");
      opt.value = optDef.id;
      opt.textContent = optDef.label;
      if (optDef.id === pl.viewport) {
        opt.selected = true;
        hasSelectedVp = true;
      }
      vpSelect.appendChild(opt);
    }
    if (!hasSelectedVp) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select Viewport...";
      placeholder.disabled = true;
      placeholder.selected = true;
      vpSelect.insertBefore(placeholder, vpSelect.firstChild);
    }

    vpSelect.addEventListener("change", async () => {
      pl.viewport = vpSelect.value;
      plugin.viewport = pl.viewport;
      if (pl.viewport === "dock") {
        plugin.pinned = true;
      }
      const primaryComp = synthManifest?.components?.[0];
      if (primaryComp && layoutManager) {
        layoutManager.setComponentSlot(plugin.id, primaryComp.id, pl.viewport);
      }
      onUpdate();
      await onRemount();
      if (onRefreshAll) onRefreshAll();
    });
    vpCol.appendChild(vpSelect);
    fieldsGrid.appendChild(vpCol);

    // Route / View Column
    const routeCol = document.createElement("label");
    if (isPanorama) {
      routeCol.style.cssText = "display: flex; flex-direction: column; gap: 4px; font-size: 0.7rem; color: #888;";
    } else {
      routeCol.style.cssText = "display: flex; flex-direction: column; gap: 4px; font-family: var(--omni-font-mono, monospace); font-size: 0.65rem; color: var(--omni-text-muted); text-transform: uppercase;";
    }
    const routeLabel = document.createElement("span");
    routeLabel.textContent = isPanorama ? "Route / View" : "View / Route";
    routeCol.appendChild(routeLabel);

    const routeSelect = document.createElement("select");
    routeSelect.className = "plugin-route-select";
    if (isPanorama) {
      routeSelect.style.cssText = "background: #191919; border: 1px solid #333; color: #fff; font-size: 0.75rem; padding: 6px 8px; outline: none; cursor: pointer; width: 100%; height: 32px; box-sizing: border-box;";
    }

    for (const v of pluginViews) {
      const opt = document.createElement("option");
      opt.value = v.path || "";
      opt.textContent = `${v.title || v.id} (${v.path || "/"})`;
      if ((v.path || "") === (pl.route || "")) opt.selected = true;
      routeSelect.appendChild(opt);
    }

    routeSelect.addEventListener("change", async () => {
      pl.route = routeSelect.value;
      const matchedView = pluginViews.find((v: any) => (v.path || "") === pl.route);
      if (matchedView) pl.viewId = matchedView.id;
      onUpdate();
      await onRemount();
      if (onRefreshAll) onRefreshAll();
    });
    routeCol.appendChild(routeSelect);
    fieldsGrid.appendChild(routeCol);

    row.appendChild(fieldsGrid);

    if (options.onTogglePin && pl.viewport === "main") {
      const isPinned = !!options.isPinned;
      const pinBtnWrap = document.createElement("div");
      pinBtnWrap.style.cssText = "display: flex; justify-content: flex-start; margin-top: 2px;";

      const pinBtn = document.createElement("button");
      pinBtn.className = isPanorama ? "btn-panorama-action btn-pin-dock" : "editorial-btn-secondary btn-pin-dock";
      pinBtn.style.cssText = isPanorama
        ? `font-size: 0.74rem; padding: 5px 12px; display: inline-flex; align-items: center; gap: 6px; color: ${
            isPinned ? "var(--omni-accent-primary, #00a4ef)" : "#bbb"
          }; border-color: ${isPinned ? "var(--omni-accent-primary, #00a4ef)" : "#333"};`
        : `font-size: 0.68rem; padding: 3px 8px;`;
      pinBtn.innerHTML = `${icon("pin", 12)} <span>${isPinned ? "Pinned to Tiles" : "Pin to Tiles"}</span>`;
      pinBtn.title = isPinned ? "Unpin tile" : "Pin live tile";
      pinBtn.addEventListener("click", () => {
        options.onTogglePin!(!isPinned);
      });
      pinBtnWrap.appendChild(pinBtn);
      row.appendChild(pinBtnWrap);
    }

    placementsBox.appendChild(row);
  }

  return placementsBox;
}

export interface RenderPluginCustomSettingsOptions {
  kernel: any;
  plugin: InstalledPluginEntry;
  theme?: "classic" | "editorial" | "panorama";
  pluginViews: PluginViewDeclaration[];
  synthManifest?: any;
}

export function renderPluginCustomSettingsSection(options: RenderPluginCustomSettingsOptions): HTMLElement | null {
  const { kernel, plugin, theme = "classic", pluginViews, synthManifest } = options;
  const safeId = plugin.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const isPanorama = theme === "panorama";

  const settingsView = pluginViews.find((v: any) => v.id === "settings" || v.path?.includes("view=settings"));

  if (!settingsView && !isPanorama) {
    return null;
  }

  const settingsBox = document.createElement("div");
  settingsBox.className = isPanorama
    ? "panorama-config-section plugin-settings-box"
    : "plugin-custom-settings-container";

  if (isPanorama) {
    settingsBox.style.cssText = "display: flex; flex-direction: column; gap: 8px; background: #141414; padding: 10px 12px; border: 1px solid #222;";
  }

  const settingsHeader = document.createElement("div");
  settingsHeader.className = isPanorama ? "panorama-config-section-title" : "";
  settingsHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center;";
  if (isPanorama) {
    settingsHeader.style.fontSize = "0.78rem";
    settingsHeader.style.fontWeight = "600";
    settingsHeader.style.color = "#fff";
  }

  const settingsTitle = document.createElement("span");
  if (isPanorama) {
    settingsTitle.textContent = "Preferences";
  } else {
    settingsTitle.style.cssText = "font-family: var(--omni-font-mono, monospace); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--omni-text-primary);";
    settingsTitle.textContent = "Plugin Settings & Rules";
  }
  settingsHeader.appendChild(settingsTitle);

  const mountContainer = document.createElement("div");
  mountContainer.id = isPanorama ? `panorama-settings-mount-${safeId}` : `settings-mount-${safeId}`;
  mountContainer.className = "plugin-settings-mount-container";
  mountContainer.style.cssText = isPanorama
    ? "display: none; margin-top: 6px; padding: 10px; background: #000; border: 1px solid #222;"
    : "display: none; padding: 10px; background: var(--omni-bg-elevated); border: 1px solid var(--omni-border-subtle); border-radius: var(--omni-radius-sm); margin-top: 6px;";

  if (settingsView && kernel?.mountPluginSettings) {
    const btnToggleSettings = document.createElement("button");
    btnToggleSettings.className = isPanorama
      ? "btn-panorama-action btn-plugin-settings"
      : "editorial-btn-secondary";
    btnToggleSettings.id = `btn-toggle-settings-${safeId}`;
    if (!isPanorama) {
      btnToggleSettings.style.cssText = "font-size: 0.68rem; padding: 3px 8px; color: var(--omni-accent-primary); border-color: var(--omni-accent-primary);";
      btnToggleSettings.textContent = "Configure Settings";
    } else {
      btnToggleSettings.textContent = "Configure";
    }

    btnToggleSettings.addEventListener("click", async () => {
      const isCurrentlyOpen = mountContainer.style.display !== "none";
      if (!isCurrentlyOpen) {
        mountContainer.style.display = "block";
        mountContainer.innerHTML = `<div style="font-family: var(--omni-font-mono, monospace); font-size: 0.72rem; color: var(--omni-text-muted, #888);">${isPanorama ? "Loading..." : "Loading settings..."}</div>`;
        try {
          await kernel.mountPluginSettings(
            plugin.id,
            synthManifest,
            plugin.htmlContent || plugin.scriptContent,
            mountContainer,
            settingsView.path || "?view=settings",
            plugin.relays
          );
          btnToggleSettings.textContent = isPanorama ? "Close" : "Close Settings";
        } catch (err: any) {
          console.error(`Failed to mount settings for ${plugin.id}:`, err);
          mountContainer.textContent = "Failed to load settings.";
          btnToggleSettings.textContent = isPanorama ? "Configure" : "Configure Settings";
        }
      } else {
        kernel.destroyPluginSettings(plugin.id);
        mountContainer.style.display = "none";
        mountContainer.innerHTML = "";
        btnToggleSettings.textContent = isPanorama ? "Configure" : "Configure Settings";
      }
    });

    settingsHeader.appendChild(btnToggleSettings);
    settingsBox.appendChild(settingsHeader);
    settingsBox.appendChild(mountContainer);
  } else if (isPanorama) {
    const noSettingsNote = document.createElement("div");
    noSettingsNote.style.cssText = "font-size: 0.72rem; color: #888; font-style: italic;";
    noSettingsNote.textContent = "No custom settings view declared. Configure viewports and placements below.";
    settingsBox.appendChild(settingsHeader);
    settingsBox.appendChild(noSettingsNote);
  }

  return settingsBox;
}
