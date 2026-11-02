import { extractPluginFromZip } from "@omni/core";
import { icon } from "./icons.js";
import { InstalledPluginEntry } from "./base-shell.js";

export interface PluginUpdateModalOptions {
  plugin: InstalledPluginEntry;
  onUpdateEntry: (entry: InstalledPluginEntry) => Promise<void>;
  onResolveAndInstall: (target: string) => Promise<InstalledPluginEntry>;
  onWorkspaceUpdated: () => void;
  onRefreshActiveApp?: () => void;
}

export function showPluginUpdateModal(options: PluginUpdateModalOptions): HTMLElement {
  const { plugin, onUpdateEntry, onResolveAndInstall, onWorkspaceUpdated, onRefreshActiveApp } = options;

  document.querySelectorAll("#update-app-modal").forEach((m) => m.remove());

  const modal = document.createElement("div");
  modal.id = "update-app-modal";
  modal.className = "omni-modal-overlay open";

  modal.innerHTML = `
    <div class="omni-modal-card update-modal-card" style="max-width: 560px; width: 92%; background: var(--omni-bg-elevated, #22201d); border: 1px solid var(--omni-border-subtle, #33302a); border-radius: var(--omni-radius-md, 10px); padding: 22px; display: flex; flex-direction: column; gap: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); box-sizing: border-box;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--omni-border-subtle, #33302a); padding-bottom: 14px;">
        <div>
          <h3 style="margin: 0; font-size: 1.15rem; color: var(--omni-text-primary, #ede8df); font-family: var(--omni-font-serif, inherit);">
            Update ${plugin.displayName || plugin.name || plugin.id}
          </h3>
          <span style="font-family: var(--omni-font-mono, monospace); font-size: 0.72rem; color: var(--omni-text-muted, #9e988f);">
            Current: v${plugin.version || "1.0.0"} • ${plugin.id}
          </span>
        </div>
        <button id="btn-close-update-modal" style="background: transparent; border: none; color: var(--omni-text-secondary, #9e988f); cursor: pointer; padding: 4px;">
          ${icon("close", 18)}
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 14px;">
        <!-- Option A: File (.zip or .html) -->
        <div class="update-option-card" style="background: var(--omni-bg-surface, #191816); border: 2px dashed var(--omni-border-subtle, #33302a); border-radius: 8px; padding: 18px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: border-color 0.15s ease;" id="update-zip-dropzone">
          <span style="font-size: 1.6rem;">📦</span>
          <strong style="font-size: 0.88rem; color: var(--omni-text-primary, #ede8df);">Drop Updated .zip or .html File Here</strong>
          <span style="font-size: 0.75rem; color: var(--omni-text-muted, #9e988f);">Extracts and updates assets cleanly preserving your viewport settings</span>
          <input type="file" id="update-file-input" accept=".zip,.html,.htm,.js" style="display: none;" />
          <button id="btn-browse-update-file" style="background: var(--omni-accent-primary, #d4a373); color: #141312; border: none; padding: 7px 16px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; margin-top: 4px;">
            Choose .zip File
          </button>
        </div>

        <!-- Option B: Remote / Blossom / Nostr -->
        <div style="background: var(--omni-bg-surface, #191816); border: 1px solid var(--omni-border-subtle, #33302a); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 8px;">
          <strong style="font-size: 0.82rem; color: var(--omni-text-primary, #ede8df); display: flex; align-items: center; gap: 6px;">
            ${icon("refresh", 14)} Or Update from Blossom / URL / Nsite
          </strong>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="update-url-input" value="${plugin.naddr || (plugin.sourceUrl?.startsWith("http") ? plugin.sourceUrl : "")}" placeholder="Enter naddr1... or https://... url" style="flex: 1; background: var(--omni-bg-elevated, #22201d); border: 1px solid var(--omni-border-subtle, #33302a); border-radius: 6px; color: var(--omni-text-primary, #ede8df); padding: 8px 10px; font-size: 0.78rem; font-family: monospace;" />
            <button id="btn-fetch-update-url" style="background: var(--omni-bg-card, #22201d); color: var(--omni-text-primary, #ede8df); border: 1px solid var(--omni-border-strong, #3d3933); border-radius: 6px; padding: 8px 14px; font-size: 0.78rem; font-weight: 600; cursor: pointer; white-space: nowrap;">
              Fetch Update
            </button>
          </div>
        </div>

        <!-- Status Indicator -->
        <div id="update-status-log" style="font-size: 0.76rem; color: var(--omni-accent-primary, #d4a373); min-height: 18px; text-align: center; font-weight: 600;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector("#btn-close-update-modal")?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  const statusEl = modal.querySelector("#update-status-log") as HTMLElement;
  const fileInput = modal.querySelector("#update-file-input") as HTMLInputElement;
  const btnBrowse = modal.querySelector("#btn-browse-update-file") as HTMLElement;
  const dropzone = modal.querySelector("#update-zip-dropzone") as HTMLElement;

  btnBrowse.addEventListener("click", () => fileInput.click());

  const handleFile = async (file: File) => {
    statusEl.textContent = `Reading ${file.name}...`;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let scriptContent = "";
      let newVersion = plugin.version || "1.0.0";
      let newName = plugin.displayName || plugin.name;

      if (file.name.endsWith(".zip") || (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b)) {
        statusEl.textContent = "Extracting and bundling ZIP...";
        const extracted = extractPluginFromZip(bytes);
        scriptContent = extracted.bundledHtml;
        newVersion = extracted.inferredMeta.version || newVersion;
        newName = extracted.inferredMeta.name || newName;
      } else {
        scriptContent = new TextDecoder().decode(bytes);
      }

      statusEl.textContent = "Applying update and preserving viewports...";
      await onUpdateEntry({
        ...plugin,
        displayName: newName,
        version: newVersion,
        scriptContent
      });

      statusEl.textContent = `🎉 Successfully updated to v${newVersion}!`;
      setTimeout(() => {
        closeModal();
        onWorkspaceUpdated();
        if (onRefreshActiveApp) onRefreshActiveApp();
      }, 800);
    } catch (err: any) {
      statusEl.textContent = `Update failed: ${err?.message || String(err)}`;
    }
  };

  fileInput.addEventListener("change", () => {
    if (fileInput.files?.[0]) handleFile(fileInput.files[0]);
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--omni-accent-primary, #d4a373)";
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.style.borderColor = "var(--omni-border-subtle, #33302a)";
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--omni-border-subtle, #33302a)";
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  modal.querySelector("#btn-fetch-update-url")?.addEventListener("click", async () => {
    const urlInput = modal.querySelector("#update-url-input") as HTMLInputElement;
    const target = (urlInput.value || "").trim();
    if (!target) {
      statusEl.textContent = "Please enter a valid URL or naddr.";
      return;
    }
    statusEl.textContent = "Fetching release...";
    try {
      const updated = await onResolveAndInstall(target);
      statusEl.textContent = `🎉 Successfully updated ${updated.displayName || updated.name} to v${updated.version}!`;
      setTimeout(() => {
        closeModal();
        onWorkspaceUpdated();
        if (onRefreshActiveApp) onRefreshActiveApp();
      }, 800);
    } catch (err: any) {
      statusEl.textContent = `Update failed: ${err?.message || String(err)}`;
    }
  });

  return modal;
}
