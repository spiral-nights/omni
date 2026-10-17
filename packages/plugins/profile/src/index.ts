/// <reference types="@omni/types" />

/**
 * Geometric monochrome SVG line icons (stroke: currentColor, 1.8px)
 */
const ICONS = {
  user: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
  key: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"></circle><path d="m21 2-9.6 9.6"></path><path d="m15.5 7.5 3 3"></path></svg>`,
  shield: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>`,
  copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
};

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
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getCurrentView(): string {
  const route =
    (typeof window !== "undefined" && window.location?.search) ||
    (typeof window !== "undefined" && window.location?.hash?.replace("#", "?")) ||
    (typeof window !== "undefined" && (window as any).__OMNI_ROUTE__) ||
    "";
  if (route) {
    try {
      const q = route.includes("?") ? route.slice(route.indexOf("?")) : `?${route.replace(/^#/, "")}`;
      const params = new URLSearchParams(q);
      const v = params.get("view");
      if (v) return v;
    } catch (_) {}
  }
  return "main";
}

async function mountProfile(root: any) {
  const currentView = getCurrentView();

  // Widget compact view
  if (currentView === "widget" || currentView === "pill" || currentView === "badge") {
    return mountProfileWidget(root);
  }

  // Full Profile & Keys Management view (main / settings)
  return mountProfileFull(root);
}

async function mountProfileWidget(root: any) {
  const card = html<HTMLDivElement>`
    <div class="profile-widget-card" style="background: var(--bg-surface, #191816); border: 1px solid var(--border-strong, #383530); border-radius: var(--radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 10px; color: var(--text-primary, #ede8df);">
      <div class="widget-header" style="display: flex; align-items: center; justify-content: space-between;">
        <h3 style="margin: 0; font-size: 0.92rem; font-weight: 600; color: var(--text-primary, #ede8df); display: flex; align-items: center; gap: 7px;">
          <span style="color: var(--accent-primary, #d4a373); display: flex; align-items: center;">${ICONS.user}</span> Active Identity
        </h3>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; margin-top: 2px;">
        <div class="profile-widget-avatar" style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); display: flex; align-items: center; justify-content: center; color: var(--accent-primary, #d4a373); flex-shrink: 0;">
          ${ICONS.user}
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0;">
          <strong class="profile-widget-name" style="font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Loading identity...</strong>
          <span class="profile-widget-npub" style="font-family: var(--font-mono, monospace); font-size: 0.72rem; color: var(--text-muted, #78716c); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">...</span>
        </div>
      </div>
    </div>
  `;

  const strongEl = card.querySelector<HTMLElement>(".profile-widget-name")!;
  const npubEl = card.querySelector<HTMLElement>(".profile-widget-npub")!;
  const avatarEl = card.querySelector<HTMLElement>(".profile-widget-avatar")!;

  root.appendChild(card);

  (async () => {
    try {
      let pubkey = "";
      let npub = "";
      let profileData: any = null;

      if (typeof window !== "undefined" && (window as any).nostr) {
        pubkey = await (window as any).nostr.getPublicKey();
      } else if (typeof omni !== "undefined" && omni.nostr) {
        pubkey = await omni.nostr.getPublicKey();
      }

      if (typeof omni !== "undefined" && omni.auth) {
        npub = await omni.auth.getNpub();
      }

      if (typeof omni !== "undefined" && omni.profile && pubkey) {
        profileData = await omni.profile.get(pubkey);
      }

      const displayName = profileData?.display_name || profileData?.name || (npub ? "Nostr User" : "Anonymous Nostr User");
      strongEl.textContent = displayName;
      npubEl.textContent = npub ? `${npub.slice(0, 10)}...${npub.slice(-6)}` : "No Key Loaded";

      if (profileData?.picture) {
        avatarEl.innerHTML = `<img src="${escapeHtml(profileData.picture)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" alt="Avatar">`;
        const img = avatarEl.querySelector("img");
        img?.addEventListener("error", () => {
          avatarEl.innerHTML = ICONS.user;
        });
      }
    } catch (_) {}
  })();
}

async function mountProfileFull(root: any) {
  const container = html<HTMLDivElement>`
    <div class="profile-full-container" style="display: flex; flex-direction: column; gap: 14px; padding: 4px; color: var(--text-primary, #ede8df);">
      <!-- Non-blocking inline Toast notification banner -->
      <div id="prof-toast" style="display: none; padding: 8px 12px; border-radius: var(--radius-sm, 6px); font-size: 0.8rem; font-weight: 500; align-items: center; gap: 8px; transition: all 0.2s ease;"></div>

      <!-- Tabs -->
      <div class="modal-tabs" style="display: flex; gap: 6px; border-bottom: 1px solid var(--border-subtle, #272522); padding-bottom: 8px;">
        <button class="modal-tab-btn active" id="btn-tab-profile" style="background: transparent; border: none; font-size: 0.82rem; font-weight: 500; cursor: pointer; color: var(--accent-primary, #d4a373); padding: 4px 8px; display: flex; align-items: center; gap: 6px;">
          ${ICONS.user} Profile Info (kind 0)
        </button>
        <button class="modal-tab-btn" id="btn-tab-keys" style="background: transparent; border: none; font-size: 0.82rem; font-weight: 500; cursor: pointer; color: var(--text-muted, #78716c); padding: 4px 8px; display: flex; align-items: center; gap: 6px;">
          ${ICONS.key} Keys & Custody
        </button>
      </div>

      <!-- Pane 1: Profile Info -->
      <div class="pane-profile" style="display: flex; flex-direction: column; gap: 12px;">
        <!-- Live Profile Card Preview -->
        <div class="preview-box" style="display: flex; align-items: center; gap: 12px; background: var(--bg-surface, #191816); padding: 12px 14px; border-radius: var(--radius-sm, 6px); border: 1px solid var(--border-subtle, #272522);">
          <div id="prof-avatar-preview" style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); display: flex; align-items: center; justify-content: center; overflow: hidden; font-size: 1.1rem; color: var(--accent-primary, #d4a373); flex-shrink: 0;">
            ${ICONS.user}
          </div>
          <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0;">
            <span class="preview-name" style="font-weight: 600; font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Active Identity</span>
            <span class="preview-npub" style="font-family: var(--font-mono, monospace); font-size: 0.72rem; color: var(--text-muted, #78716c); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Loading identity...</span>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e); display: flex; flex-direction: column; gap: 3px;">
            Display Name:
            <input id="prof-display-name" type="text" placeholder="e.g. Alice Smith" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 7px 10px; border-radius: var(--radius-sm, 6px); font-size: 0.82rem; outline: none;" />
          </label>
          <label style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e); display: flex; flex-direction: column; gap: 3px;">
            Username / Handle:
            <input id="prof-name" type="text" placeholder="e.g. alice" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 7px 10px; border-radius: var(--radius-sm, 6px); font-size: 0.82rem; outline: none;" />
          </label>
          <label style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e); display: flex; flex-direction: column; gap: 3px;">
            About / Bio:
            <textarea id="prof-about" rows="2" placeholder="Tell the Nostr network about yourself..." style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 7px 10px; border-radius: var(--radius-sm, 6px); font-size: 0.82rem; outline: none; resize: vertical;"></textarea>
          </label>
          <label style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e); display: flex; flex-direction: column; gap: 3px;">
            Avatar URL:
            <input id="prof-picture" type="text" placeholder="https://example.com/avatar.jpg" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 7px 10px; border-radius: var(--radius-sm, 6px); font-size: 0.82rem; outline: none;" />
          </label>
          <label style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e); display: flex; flex-direction: column; gap: 3px;">
            NIP-05 Identifier:
            <input id="prof-nip05" type="text" placeholder="alice@domain.com" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 7px 10px; border-radius: var(--radius-sm, 6px); font-size: 0.82rem; outline: none;" />
          </label>
          <label style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e); display: flex; flex-direction: column; gap: 3px;">
            Lightning Address (lud16):
            <input id="prof-lud16" type="text" placeholder="alice@getalby.com" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 7px 10px; border-radius: var(--radius-sm, 6px); font-size: 0.82rem; outline: none;" />
          </label>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
          <button id="btn-sync-profile" class="btn-secondary" style="font-size: 0.82rem; padding: 6px 14px; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); cursor: pointer; display: flex; align-items: center; gap: 6px;">
            ${ICONS.refresh} Sync from Relays
          </button>
          <button id="btn-save-profile" class="btn-publish" style="font-size: 0.82rem; padding: 6px 16px; background: var(--accent-primary, #d4a373); color: var(--accent-contrast, #141312); border: none; border-radius: var(--radius-sm, 6px); font-weight: 600; cursor: pointer;">Save & Publish Profile (kind 0)</button>
        </div>
      </div>

      <!-- Pane 2: Keys & Custody -->
      <div class="pane-keys" style="display: none; flex-direction: column; gap: 14px;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e);">Public Key (npub):</span>
          <div style="display: flex; gap: 6px;">
            <input id="key-npub" type="text" readonly style="flex: 1; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 6px 10px; border-radius: var(--radius-sm, 6px); font-family: var(--font-mono, monospace); font-size: 0.74rem; outline: none;" value="Loading..." />
            <button id="btn-copy-npub" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); cursor: pointer; display: flex; align-items: center; gap: 4px;">
              ${ICONS.copy} <span>Copy</span>
            </button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e);">Public Key (Hex):</span>
          <div style="display: flex; gap: 6px;">
            <input id="key-hex" type="text" readonly style="flex: 1; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 6px 10px; border-radius: var(--radius-sm, 6px); font-family: var(--font-mono, monospace); font-size: 0.74rem; outline: none;" value="Loading..." />
            <button id="btn-copy-hex" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); cursor: pointer; display: flex; align-items: center; gap: 4px;">
              ${ICONS.copy} <span>Copy</span>
            </button>
          </div>
        </div>

        <!-- Private Key reveal section -->
        <div style="border-top: 1px solid var(--border-subtle, #272522); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary, #a8a29e);">Private Key (nsec):</span>
            <button id="btn-reveal-nsec" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); cursor: pointer;">Reveal Private Key</button>
          </div>

          <!-- Inline Warning Confirmation Box -->
          <div id="box-nsec-confirm" style="display: none; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-sm, 6px); padding: 10px 12px; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; color: #f87171; font-size: 0.78rem; font-weight: 500;">
              <span style="display: flex; align-items: center; flex-shrink: 0;">${ICONS.shield}</span>
              <span>Never share your private key (nsec). Anyone with this key has full control over your Nostr identity.</span>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
              <button id="btn-cancel-reveal" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; background: transparent; border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); cursor: pointer;">Cancel</button>
              <button id="btn-confirm-reveal" style="font-size: 0.72rem; padding: 4px 10px; background: #ef4444; color: #fff; border: none; border-radius: var(--radius-sm, 6px); font-weight: 600; cursor: pointer;">I Understand, Reveal</button>
            </div>
          </div>

          <div id="box-nsec" style="display: none; gap: 6px;">
            <input id="key-nsec" type="text" readonly style="flex: 1; background: var(--bg-subtle, #2a2824); border: 1px solid rgba(239,68,68,0.4); color: #f87171; padding: 6px 10px; border-radius: var(--radius-sm, 6px); font-family: var(--font-mono, monospace); font-size: 0.74rem; outline: none;" />
            <button id="btn-copy-nsec" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); cursor: pointer; display: flex; align-items: center; gap: 4px;">
              ${ICONS.copy} <span>Copy</span>
            </button>
          </div>
        </div>

        <!-- Switch identity / Import key -->
        <div style="border-top: 1px solid var(--border-subtle, #272522); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;">
          <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary, #a8a29e);">Switch Identity / Import Key:</span>
          <input id="key-import" type="password" placeholder="Paste nsec1... or 64-char hex private key" style="background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 7px 10px; border-radius: var(--radius-sm, 6px); font-size: 0.82rem; outline: none;" />
          <button id="btn-import-key" class="btn-publish" style="align-self: flex-end; font-size: 0.78rem; padding: 6px 14px; background: var(--accent-primary, #d4a373); color: var(--accent-contrast, #141312); border: none; border-radius: var(--radius-sm, 6px); font-weight: 600; cursor: pointer;">Import & Switch</button>
        </div>
      </div>
    </div>
  `;

  // Tab switching
  const btnTabProfile = container.querySelector<HTMLButtonElement>("#btn-tab-profile")!;
  const btnTabKeys = container.querySelector<HTMLButtonElement>("#btn-tab-keys")!;
  const paneProfile = container.querySelector<HTMLDivElement>(".pane-profile")!;
  const paneKeys = container.querySelector<HTMLDivElement>(".pane-keys")!;

  btnTabProfile.addEventListener("click", () => {
    btnTabProfile.classList.add("active");
    btnTabProfile.style.color = "var(--accent-primary, #d4a373)";
    btnTabKeys.classList.remove("active");
    btnTabKeys.style.color = "var(--text-muted, #78716c)";
    paneProfile.style.display = "flex";
    paneKeys.style.display = "none";
  });

  btnTabKeys.addEventListener("click", () => {
    btnTabKeys.classList.add("active");
    btnTabKeys.style.color = "var(--accent-primary, #d4a373)";
    btnTabProfile.classList.remove("active");
    btnTabProfile.style.color = "var(--text-muted, #78716c)";
    paneKeys.style.display = "flex";
    paneProfile.style.display = "none";
  });

  // Profile Form fields
  const spanName = container.querySelector<HTMLElement>(".preview-name")!;
  const spanNpub = container.querySelector<HTMLElement>(".preview-npub")!;
  const avatarPreview = container.querySelector<HTMLElement>("#prof-avatar-preview")!;
  const rowDName = container.querySelector<HTMLInputElement>("#prof-display-name")!;
  const rowName = container.querySelector<HTMLInputElement>("#prof-name")!;
  const inpAbout = container.querySelector<HTMLTextAreaElement>("#prof-about")!;
  const rowPic = container.querySelector<HTMLInputElement>("#prof-picture")!;
  const rowNip05 = container.querySelector<HTMLInputElement>("#prof-nip05")!;
  const rowLud16 = container.querySelector<HTMLInputElement>("#prof-lud16")!;
  const btnSave = container.querySelector<HTMLButtonElement>("#btn-save-profile")!;
  const btnSync = container.querySelector<HTMLButtonElement>("#btn-sync-profile")!;

  // Keys fields
  const inpNpub = container.querySelector<HTMLInputElement>("#key-npub")!;
  const inpPubkey = container.querySelector<HTMLInputElement>("#key-hex")!;
  const btnCopyNpub = container.querySelector<HTMLButtonElement>("#btn-copy-npub")!;
  const btnCopyHex = container.querySelector<HTMLButtonElement>("#btn-copy-hex")!;
  const btnReveal = container.querySelector<HTMLButtonElement>("#btn-reveal-nsec")!;
  const nsecConfirmBox = container.querySelector<HTMLDivElement>("#box-nsec-confirm")!;
  const btnCancelReveal = container.querySelector<HTMLButtonElement>("#btn-cancel-reveal")!;
  const btnConfirmReveal = container.querySelector<HTMLButtonElement>("#btn-confirm-reveal")!;
  const nsecBox = container.querySelector<HTMLDivElement>("#box-nsec")!;
  const inpNsec = container.querySelector<HTMLInputElement>("#key-nsec")!;
  const btnCopyNsec = container.querySelector<HTMLButtonElement>("#btn-copy-nsec")!;
  const inpImport = container.querySelector<HTMLInputElement>("#key-import")!;
  const btnImport = container.querySelector<HTMLButtonElement>("#btn-import-key")!;

  // Toast notification helper
  const showToast = (message: string, isError = false) => {
    const toast = container.querySelector<HTMLElement>("#prof-toast");
    if (!toast) return;
    toast.style.display = "flex";
    toast.style.background = isError ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)";
    toast.style.color = isError ? "#f87171" : "#4ade80";
    toast.style.border = `1px solid ${isError ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)"}`;
    toast.innerHTML = `<span style="flex-shrink: 0; display: flex; align-items: center;">${isError ? ICONS.shield : ICONS.check}</span><span>${escapeHtml(message)}</span>`;
    setTimeout(() => {
      toast.style.display = "none";
    }, 3500);
  };

  // Live avatar preview updater
  const updateLiveAvatar = (url?: string) => {
    if (!avatarPreview) return;
    const cleanUrl = url?.trim();
    if (cleanUrl && (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://") || cleanUrl.startsWith("data:image/"))) {
      const fixedUrl = cleanUrl.replace(/^http:\/\//i, "https://");
      avatarPreview.innerHTML = `<img src="${escapeHtml(fixedUrl)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" alt="Avatar">`;
      const img = avatarPreview.querySelector("img");
      img?.addEventListener("error", () => {
        avatarPreview.innerHTML = ICONS.user;
      });
    } else {
      avatarPreview.innerHTML = ICONS.user;
    }
  };

  rowPic.addEventListener("input", () => {
    updateLiveAvatar(rowPic.value);
  });

  const copyText = (val: string, btn: HTMLButtonElement) => {
    if (typeof navigator !== "undefined" && navigator.clipboard && val) {
      navigator.clipboard.writeText(val);
      const span = btn.querySelector("span");
      if (span) span.textContent = "Copied!";
      setTimeout(() => {
        if (span) span.textContent = "Copy";
      }, 1400);
    }
  };

  btnCopyNpub.addEventListener("click", () => copyText(inpNpub.value, btnCopyNpub));
  btnCopyHex.addEventListener("click", () => copyText(inpPubkey.value, btnCopyHex));
  btnCopyNsec.addEventListener("click", () => copyText(inpNsec.value, btnCopyNsec));

  // Key reveal flow with inline confirmation
  btnReveal.addEventListener("click", () => {
    if (nsecBox.style.display === "flex") {
      nsecBox.style.display = "none";
      inpNsec.value = "";
      btnReveal.textContent = "Reveal Private Key";
      return;
    }
    if (nsecConfirmBox.style.display === "flex") {
      nsecConfirmBox.style.display = "none";
      return;
    }
    nsecConfirmBox.style.display = "flex";
  });

  btnCancelReveal.addEventListener("click", () => {
    nsecConfirmBox.style.display = "none";
  });

  btnConfirmReveal.addEventListener("click", async () => {
    nsecConfirmBox.style.display = "none";
    try {
      if (typeof omni !== "undefined" && omni.auth) {
        const nsec = await omni.auth.getNsec();
        inpNsec.value = nsec;
        nsecBox.style.display = "flex";
        btnReveal.textContent = "Hide Private Key";
      }
    } catch (err: any) {
      showToast(`Could not retrieve private key: ${err?.message || String(err)}`, true);
    }
  });

  const refreshIdentity = async (forceRemote = false) => {
    try {
      let pubkey = "";
      let npub = "";
      let profileData: any = null;

      if (typeof window !== "undefined" && (window as any).nostr) {
        pubkey = await (window as any).nostr.getPublicKey();
        if (pubkey) inpPubkey.value = pubkey;
      } else if (typeof omni !== "undefined" && omni.nostr) {
        pubkey = await omni.nostr.getPublicKey();
        if (pubkey) inpPubkey.value = pubkey;
      }

      if (typeof omni !== "undefined" && omni.auth) {
        npub = await omni.auth.getNpub();
        if (npub) {
          spanNpub.textContent = npub;
          inpNpub.value = npub;
        }
      }

      if (!npub && pubkey) {
        spanNpub.textContent = `${pubkey.slice(0, 10)}...${pubkey.slice(-4)}`;
      }

      if (typeof omni !== "undefined" && omni.profile && pubkey) {
        profileData = await (omni.profile.get as any)(pubkey, { syncRemote: forceRemote });
        if (profileData) {
          spanName.textContent = profileData.display_name || profileData.name || "Active Identity";
          rowDName.value = profileData.display_name || "";
          rowName.value = profileData.name || "";
          inpAbout.value = profileData.about || "";
          rowPic.value = profileData.picture || "";
          rowNip05.value = profileData.nip05 || "";
          rowLud16.value = profileData.lud16 || "";
          updateLiveAvatar(profileData.picture);
        } else {
          spanName.textContent = "Active Identity";
          rowDName.value = "";
          rowName.value = "";
          inpAbout.value = "";
          rowPic.value = "";
          rowNip05.value = "";
          rowLud16.value = "";
          updateLiveAvatar("");
        }
      }
      return profileData;
    } catch (_) {
      return null;
    }
  };

  btnSync.addEventListener("click", async () => {
    btnSync.disabled = true;
    btnSync.innerHTML = `${ICONS.refresh} Syncing...`;
    try {
      const profile = await refreshIdentity(true);
      if (profile) {
        btnSync.innerHTML = `${ICONS.check} Synced!`;
        showToast("Profile metadata synchronized from relays!");
      } else {
        btnSync.innerHTML = `${ICONS.refresh} No update`;
        showToast("No new profile metadata found on relays");
      }
      setTimeout(() => {
        btnSync.disabled = false;
        btnSync.innerHTML = `${ICONS.refresh} Sync from Relays`;
      }, 1500);
    } catch (err: any) {
      btnSync.disabled = false;
      btnSync.innerHTML = `${ICONS.refresh} Sync from Relays`;
      showToast("Failed to sync profile from relays", true);
    }
  });

  btnImport.addEventListener("click", async () => {
    const val = inpImport.value?.trim();
    if (!val) {
      showToast("Please enter a private key (nsec or hex)", true);
      return;
    }
    btnImport.disabled = true;
    const origText = btnImport.textContent;
    btnImport.textContent = "Switching & Fetching Profile...";
    try {
      if (typeof omni !== "undefined" && omni.auth) {
        const switchRes = await omni.auth.switchKey(val);
        if (switchRes?.pubkey) {
          inpPubkey.value = switchRes.pubkey;
        }
        if (switchRes?.npub) {
          inpNpub.value = switchRes.npub;
          spanNpub.textContent = switchRes.npub;
        }
        inpImport.value = "";

        // Reset private key reveal state for safety
        if (nsecBox) nsecBox.style.display = "none";
        if (inpNsec) inpNsec.value = "";
        if (btnReveal) btnReveal.textContent = "Reveal Private Key";
        if (nsecConfirmBox) nsecConfirmBox.style.display = "none";

        // Query relays for profile metadata of the switched identity
        const profile = await refreshIdentity(true);
        if (profile) {
          showToast("Switched identity and synced profile!");
        } else {
          showToast("Switched identity! (No remote profile found on relays)");
        }

        // Switch to the Profile Info tab so the user immediately sees their profile
        btnTabProfile.click();
      }
    } catch (err: any) {
      showToast(`Failed to import key: ${err?.message || String(err)}`, true);
    } finally {
      btnImport.disabled = false;
      btnImport.textContent = origText || "Import & Switch";
    }
  });

  btnSave.addEventListener("click", async () => {
    btnSave.disabled = true;
    btnSave.textContent = "Publishing to Nostr...";
    try {
      const meta: Record<string, any> = {};
      if (rowDName.value.trim()) meta.display_name = rowDName.value.trim();
      if (rowName.value.trim()) meta.name = rowName.value.trim();
      if (inpAbout.value.trim()) meta.about = inpAbout.value.trim();
      if (rowPic.value.trim()) meta.picture = rowPic.value.trim();
      if (rowNip05.value.trim()) meta.nip05 = rowNip05.value.trim();
      if (rowLud16.value.trim()) meta.lud16 = rowLud16.value.trim();

      if (typeof omni !== "undefined" && omni.profile) {
        await omni.profile.publish(meta);
      }
      btnSave.textContent = "Profile Published!";
      showToast("Profile published to Nostr relays!");
      setTimeout(() => {
        btnSave.disabled = false;
        btnSave.textContent = "Save & Publish Profile (kind 0)";
      }, 1800);
    } catch (err: any) {
      showToast(`Failed to publish profile: ${err?.message || String(err)}`, true);
      btnSave.disabled = false;
      btnSave.textContent = "Save & Publish Profile (kind 0)";
    }
  });

  root.appendChild(container);

  // Fetch identity asynchronously
  refreshIdentity();
}

let mounted = false;
function initMount(root: any) {
  if (mounted) return;
  mounted = true;
  mountProfile(root);
}

function init() {
  if (typeof document !== "undefined") {
    initMount(document.body);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

export { mountProfile };
