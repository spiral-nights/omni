import { shellRegistry } from "./shell-registry.js";
import { icon, ICONS, IconName } from "./icons.js";

export interface ShellManagerUiOptions {
  root: HTMLElement | Document;
  prefix: string; // "classic" | "panorama" | "editorial"
  onReload: () => void;
  onRefresh: () => void;
  showToast?: (msg: string) => void;
  isEditorial?: boolean;
}

export function renderInstalledShellsList(opts: ShellManagerUiOptions): void {
  const { root, prefix, onReload, onRefresh, showToast, isEditorial } = opts;
  const switcherContainer = (root.querySelector(`#${prefix}-shell-switcher-buttons`) ||
    root.querySelector(`#shell-switcher-buttons`) ||
    document.getElementById(`${prefix}-shell-switcher-buttons`) ||
    document.getElementById(`shell-switcher-buttons`)) as HTMLElement | null;

  const cardsList = (root.querySelector(`#${prefix}-installed-shells-list`) ||
    root.querySelector(`#${prefix}-shells-list`) ||
    document.getElementById(`${prefix}-installed-shells-list`) ||
    document.getElementById(`${prefix}-shells-list`)) as HTMLElement | null;

  const countBadge = (root.querySelector(`#${prefix}-shell-count-badge`) ||
    root.querySelector(`#${prefix}-shell-count`) ||
    document.getElementById(`${prefix}-shell-count-badge`) ||
    document.getElementById(`${prefix}-shell-count`)) as HTMLElement | null;

  const shells = shellRegistry.list();
  const currentActive = shellRegistry.getActiveShellId();

  if (countBadge) {
    countBadge.textContent = `${shells.length} installed`;
  }

  if (switcherContainer) {
    switcherContainer.innerHTML = "";
    for (const s of shells) {
      const btn = document.createElement("button");
      btn.id = prefix === "panorama" ? `btn-switch-${s.id}` : `btn-shell-${s.id}`;
      btn.className = prefix === "panorama"
        ? `btn-panorama-action ${currentActive === s.id ? "active" : ""}`
        : `btn-secondary ${currentActive === s.id ? "active" : ""}`;
      btn.style.cssText = `font-size: 0.72rem; padding: 3px 8px; ${currentActive === s.id ? "border-color: var(--omni-accent-primary); color: var(--omni-accent-primary);" : ""}`;
      btn.textContent = s.name;
      btn.title = s.description;
      btn.addEventListener("click", () => {
        shellRegistry.setActiveShell(s.id);
        onReload();
      });
      switcherContainer.appendChild(btn);
    }
  }

  if (!cardsList) return;
  cardsList.innerHTML = "";

  const btnClass = prefix === "panorama" ? "btn-panorama-action" : prefix === "editorial" ? "editorial-btn-secondary" : "btn-secondary";

  for (const s of shells) {
    const isActive = currentActive === s.id;
    const isBuiltin = s.isBuiltin !== false;
    const card = document.createElement("div");
    card.className = isEditorial ? "editorial-pref-card" : `${prefix}-shell-card`;

    card.style.cssText = `
      background: var(--omni-bg-elevated, #141414);
      border: 1px solid ${isActive ? "var(--omni-accent-primary)" : "var(--omni-border-subtle, #222)"};
      border-radius: var(--omni-radius-sm, 6px);
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 32px; height: 32px; background: var(--omni-bg-surface, #222); border: 1px solid var(--omni-border-subtle, #333); border-radius: var(--omni-radius-sm, 6px); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary); flex-shrink: 0;">
            ${s.icon && ICONS[s.icon as IconName] ? icon(s.icon as IconName, 18) : icon("layout", 18)}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="${isEditorial ? "font-family: var(--omni-font-serif); " : ""}font-size: 0.92rem; color: var(--omni-text-primary, #fff);">${s.name}</strong>
              ${isActive ? `<span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; padding: 1px 6px; background: var(--omni-accent-primary); color: #fff; border-radius: 3px;">Active</span>` : ""}
              ${!isBuiltin ? `<span style="font-size: 0.65rem; text-transform: uppercase; padding: 1px 6px; background: var(--omni-bg-subtle, #262626); color: var(--omni-text-muted, #888); border: 1px solid var(--omni-border-subtle, #333); border-radius: 3px;">Custom</span>` : ""}
            </div>
            <div style="font-size: 0.72rem; color: var(--omni-text-muted, #888); margin-top: 1px;">
              ${s.author ? `by ${s.author}` : "Omni Core Team"} • v${s.version || "1.0.0"}
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          ${!isActive ? `
            <button class="${btnClass} btn-activate-shell" data-shell-id="${s.id}" style="color: var(--omni-accent-primary); border-color: var(--omni-accent-primary); font-size: 0.75rem; padding: 4px 10px; cursor: pointer;">
              Activate
            </button>
          ` : `
            <span style="font-size: 0.72rem; color: var(--omni-accent-primary); font-weight: 600; padding: 4px 6px;">Current</span>
          `}
          ${!isBuiltin ? `
            <button class="${btnClass} btn-uninstall-shell" data-shell-id="${s.id}" style="color: #ff5555; border-color: #552222; font-size: 0.75rem; padding: 4px 8px; cursor: pointer;">
              Uninstall
            </button>
          ` : ""}
        </div>
      </div>
      <p style="font-size: 0.78rem; color: var(--omni-text-secondary, #bbb); margin: 0; line-height: 1.35;">${s.description}</p>
    `;

    card.querySelector(".btn-activate-shell")?.addEventListener("click", () => {
      shellRegistry.setActiveShell(s.id);
      onReload();
    });

    card.querySelector(".btn-uninstall-shell")?.addEventListener("click", () => {
      if (confirm(`Uninstall shell '${s.name}'?`)) {
        shellRegistry.uninstall(s.id);
        onRefresh();
        if (showToast) showToast(`Uninstalled shell ${s.name}`);
      }
    });

    cardsList.appendChild(card);
  }
}

export function renderCuratedShellCatalog(opts: ShellManagerUiOptions): void {
  const { root, prefix, onReload, onRefresh, showToast } = opts;
  const catalogContainer = (root.querySelector(`#${prefix}-curated-shell-catalog`) || document.getElementById(`${prefix}-curated-shell-catalog`)) as HTMLElement | null;
  if (!catalogContainer) return;
  catalogContainer.innerHTML = "";

  const curated = shellRegistry.getCuratedCatalog();
  const installed = shellRegistry.list();

  for (const c of curated) {
    const isInstalled = installed.some((s) => s.id === c.id);
    const isCurrentActive = shellRegistry.getActiveShellId() === c.id;

    const item = document.createElement("div");
    item.style.cssText =
      "display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--omni-bg-surface, #161616); border: 1px solid var(--omni-border-subtle, #282828); border-radius: var(--omni-radius-sm, 6px); gap: 10px;";
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
        <div style="width: 32px; height: 32px; background: var(--omni-bg-elevated, #222); border: 1px solid var(--omni-border-subtle, #333); border-radius: var(--omni-radius-sm, 6px); display: flex; align-items: center; justify-content: center; color: var(--omni-accent-primary); flex-shrink: 0;">
          ${c.icon && ICONS[c.icon as IconName] ? icon(c.icon as IconName, 18) : icon("layout", 18)}
        </div>
        <div style="min-width: 0;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <strong style="font-size: 0.85rem; color: var(--omni-text-primary, #ede8df);">${c.name}</strong>
            <span style="font-size: 0.68rem; color: var(--omni-text-muted, #888);">v${c.version || "1.0.0"}</span>
          </div>
          <div style="font-size: 0.74rem; color: var(--omni-text-muted, #aaa); margin-top: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
            ${c.description}
          </div>
        </div>
      </div>
      <div style="flex-shrink: 0;">
        ${isInstalled ? (
          isCurrentActive ? `
            <span style="font-size: 0.72rem; color: var(--omni-accent-primary); font-weight: 600;">Active</span>
          ` : `
            <button class="btn-secondary btn-activate-curated-shell" data-shell-id="${c.id}" style="font-size: 0.75rem; padding: 4px 10px; cursor: pointer;">
              Activate
            </button>
          `
        ) : `
          <button class="btn-secondary btn-install-curated-shell" data-shell-id="${c.id}" style="color: var(--omni-accent-primary); border-color: var(--omni-accent-primary); font-size: 0.75rem; padding: 4px 10px; cursor: pointer;">
            Install Shell
          </button>
        `}
      </div>
    `;

    item.querySelector(".btn-install-curated-shell")?.addEventListener("click", () => {
      shellRegistry.install(c);
      onRefresh();
      if (showToast) showToast(`Installed ${c.name} Shell!`);
    });

    item.querySelector(".btn-activate-curated-shell")?.addEventListener("click", () => {
      shellRegistry.setActiveShell(c.id);
      onReload();
    });

    catalogContainer.appendChild(item);
  }
}

export function wireShellManagerModal(opts: ShellManagerUiOptions): void {
  const { root, prefix, onReload, onRefresh, showToast } = opts;
  const modal = (root.querySelector(`#${prefix}-install-shell-modal`) ||
    root.querySelector(`#install-shell-modal`) ||
    document.getElementById(`${prefix}-install-shell-modal`) ||
    document.getElementById(`install-shell-modal`)) as HTMLElement | null;

  const btnOpen = (root.querySelector(`#btn-${prefix}-open-install-shell`) ||
    root.querySelector(`#btn-${prefix}-install-shell`) ||
    document.getElementById(`btn-${prefix}-open-install-shell`) ||
    document.getElementById(`btn-${prefix}-install-shell`)) as HTMLElement | null;

  const btnClose = (root.querySelector(`#btn-close-install-shell-modal`) ||
    root.querySelector(`#btn-${prefix}-install-shell-close`) ||
    root.querySelector(`#btn-${prefix}-close-install-shell`) ||
    document.getElementById(`btn-close-install-shell-modal`) ||
    document.getElementById(`btn-${prefix}-install-shell-close`) ||
    document.getElementById(`btn-${prefix}-close-install-shell`)) as HTMLElement | null;

  const btnConfirmCustom = (root.querySelector(`#btn-${prefix}-confirm-custom-shell-install`) ||
    root.querySelector(`#btn-${prefix}-confirm-custom-shell`) ||
    document.getElementById(`btn-${prefix}-confirm-custom-shell-install`) ||
    document.getElementById(`btn-${prefix}-confirm-custom-shell`)) as HTMLElement | null;

  btnOpen?.addEventListener("click", () => {
    if (modal) {
      modal.classList.add("open");
      modal.style.display = "flex";
    }
    renderCuratedShellCatalog(opts);
  });

  const closeModal = () => {
    if (modal) {
      modal.classList.remove("open");
      modal.style.display = "none";
    }
  };

  btnClose?.addEventListener("click", closeModal);

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  btnConfirmCustom?.addEventListener("click", () => {
    const idInput = (root.querySelector(`#${prefix}-custom-shell-id`) || document.getElementById(`${prefix}-custom-shell-id`)) as HTMLInputElement | null;
    const nameInput = (root.querySelector(`#${prefix}-custom-shell-name`) || document.getElementById(`${prefix}-custom-shell-name`)) as HTMLInputElement | null;
    const descInput = (root.querySelector(`#${prefix}-custom-shell-desc`) || document.getElementById(`${prefix}-custom-shell-desc`)) as HTMLInputElement | null;

    const id = idInput?.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const name = nameInput?.value.trim();
    const desc = descInput?.value.trim() || `Custom installed shell experience (${id})`;

    if (!id || !name) {
      alert("Please provide both a Shell ID and Name.");
      return;
    }

    shellRegistry.install({
      id,
      name,
      description: desc,
      author: "Custom",
      version: "1.0.0",
      isBuiltin: false
    });

    closeModal();
    onRefresh();
    if (showToast) showToast(`Installed shell ${name}!`);
  });
}
