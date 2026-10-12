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
    <div class="checklist-widget-card" style="background: var(--bg-surface, #191816); border: 1px solid var(--border-strong, #383530); border-radius: var(--radius-md, 10px); padding: 16px; display: flex; flex-direction: column; gap: 8px; color: var(--text-primary, #ede8df);">
      <div class="widget-header">
        <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--text-primary, #ede8df);">✦ Active Identity</h3>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px; font-size: 0.82rem;">
        <div><strong class="profile-widget-name">Loading identity...</strong></div>
        <div class="profile-widget-npub" style="font-family: var(--font-mono, monospace); font-size: 0.72rem; color: var(--text-muted, #78716c); word-break: break-all;">...</div>
      </div>
    </div>
  `;

  const strongEl = card.querySelector<HTMLElement>(".profile-widget-name")!;
  const npubEl = card.querySelector<HTMLElement>(".profile-widget-npub")!;

  root.appendChild(card);

  (async () => {
    try {
      let pubkey = "";
      let npub = "";
      let profileData: any = null;

      if (typeof omni !== "undefined" && omni.nostr) {
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
      npubEl.textContent = npub ? `${npub.slice(0, 12)}...${npub.slice(-8)}` : "No Key Loaded";
    } catch (_) {}
  })();
}

async function mountProfileFull(root: any) {
  const container = html<HTMLDivElement>`
    <div class="profile-full-container" style="display: flex; flex-direction: column; gap: 14px; padding: 4px; color: var(--text-primary, #ede8df);">
      <!-- Tabs -->
      <div class="modal-tabs" style="display: flex; gap: 6px; border-bottom: 1px solid var(--border-subtle, #272522); padding-bottom: 8px;">
        <button class="modal-tab-btn active" id="btn-tab-profile" style="background: transparent; border: none; font-size: 0.82rem; font-weight: 500; cursor: pointer; color: var(--accent-primary, #d4a373); padding: 4px 8px;">Profile Info (kind 0)</button>
        <button class="modal-tab-btn" id="btn-tab-keys" style="background: transparent; border: none; font-size: 0.82rem; font-weight: 500; cursor: pointer; color: var(--text-muted, #78716c); padding: 4px 8px;">Keys & Custody</button>
      </div>

      <!-- Pane 1: Profile Info -->
      <div class="pane-profile" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="preview-box" style="display: flex; align-items: center; gap: 12px; background: var(--bg-surface, #191816); padding: 10px 14px; border-radius: var(--radius-sm, 6px); border: 1px solid var(--border-subtle, #272522);">
          <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; color: var(--accent-primary, #d4a373); flex-shrink: 0;">✦</div>
          <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
            <span class="preview-name" style="font-weight: 600; font-size: 0.9rem;">Active Identity</span>
            <span class="preview-npub" style="font-family: var(--font-mono, monospace); font-size: 0.72rem; color: var(--text-muted, #78716c); text-overflow: ellipsis; overflow: hidden;">Loading identity...</span>
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

        <button id="btn-save-profile" class="btn-publish" style="align-self: flex-end; font-size: 0.82rem; padding: 6px 16px; margin-top: 4px; background: var(--accent-primary, #d4a373); color: var(--accent-contrast, #141312); border: none; border-radius: var(--radius-sm, 6px); font-weight: 600; cursor: pointer;">Save & Publish Profile (kind 0)</button>
      </div>

      <!-- Pane 2: Keys & Custody -->
      <div class="pane-keys" style="display: none; flex-direction: column; gap: 14px;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e);">Public Key (npub):</span>
          <div style="display: flex; gap: 6px;">
            <input id="key-npub" type="text" readonly style="flex: 1; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 6px 10px; border-radius: var(--radius-sm, 6px); font-family: var(--font-mono, monospace); font-size: 0.74rem; outline: none;" value="Loading..." />
            <button id="btn-copy-npub" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); cursor: pointer;">Copy</button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span style="font-size: 0.78rem; color: var(--text-secondary, #a8a29e);">Public Key (Hex):</span>
          <div style="display: flex; gap: 6px;">
            <input id="key-hex" type="text" readonly style="flex: 1; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); padding: 6px 10px; border-radius: var(--radius-sm, 6px); font-family: var(--font-mono, monospace); font-size: 0.74rem; outline: none;" value="Loading..." />
            <button id="btn-copy-hex" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); cursor: pointer;">Copy</button>
          </div>
        </div>

        <!-- Private Key reveal section -->
        <div style="border-top: 1px solid var(--border-subtle, #272522); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary, #a8a29e);">Private Key (nsec):</span>
            <button id="btn-reveal-nsec" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); cursor: pointer;">Reveal Private Key</button>
          </div>
          <div id="box-nsec" style="display: none; gap: 6px;">
            <input id="key-nsec" type="text" readonly style="flex: 1; background: var(--bg-subtle, #2a2824); border: 1px solid rgba(239,68,68,0.4); color: #f87171; padding: 6px 10px; border-radius: var(--radius-sm, 6px); font-family: var(--font-mono, monospace); font-size: 0.74rem; outline: none;" />
            <button id="btn-copy-nsec" class="btn-secondary" style="font-size: 0.72rem; padding: 4px 10px; background: var(--bg-subtle, #2a2824); border: 1px solid var(--border-strong, #383530); color: var(--text-primary, #ede8df); border-radius: var(--radius-sm, 6px); cursor: pointer;">Copy</button>
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
  const rowDName = container.querySelector<HTMLInputElement>("#prof-display-name")!;
  const rowName = container.querySelector<HTMLInputElement>("#prof-name")!;
  const inpAbout = container.querySelector<HTMLTextAreaElement>("#prof-about")!;
  const rowPic = container.querySelector<HTMLInputElement>("#prof-picture")!;
  const rowNip05 = container.querySelector<HTMLInputElement>("#prof-nip05")!;
  const rowLud16 = container.querySelector<HTMLInputElement>("#prof-lud16")!;
  const btnSave = container.querySelector<HTMLButtonElement>("#btn-save-profile")!;

  // Keys fields
  const inpNpub = container.querySelector<HTMLInputElement>("#key-npub")!;
  const inpPubkey = container.querySelector<HTMLInputElement>("#key-hex")!;
  const btnCopyNpub = container.querySelector<HTMLButtonElement>("#btn-copy-npub")!;
  const btnCopyHex = container.querySelector<HTMLButtonElement>("#btn-copy-hex")!;
  const btnReveal = container.querySelector<HTMLButtonElement>("#btn-reveal-nsec")!;
  const nsecBox = container.querySelector<HTMLDivElement>("#box-nsec")!;
  const inpNsec = container.querySelector<HTMLInputElement>("#key-nsec")!;
  const btnCopyNsec = container.querySelector<HTMLButtonElement>("#btn-copy-nsec")!;
  const inpImport = container.querySelector<HTMLInputElement>("#key-import")!;
  const btnImport = container.querySelector<HTMLButtonElement>("#btn-import-key")!;

  const copyText = (val: string, btn: HTMLButtonElement) => {
    if (typeof navigator !== "undefined" && navigator.clipboard && val) {
      navigator.clipboard.writeText(val);
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 1200);
    }
  };

  btnCopyNpub.addEventListener("click", () => copyText(inpNpub.value, btnCopyNpub));
  btnCopyHex.addEventListener("click", () => copyText(inpPubkey.value, btnCopyHex));
  btnCopyNsec.addEventListener("click", () => copyText(inpNsec.value, btnCopyNsec));

  btnReveal.addEventListener("click", async () => {
    if (nsecBox.style.display === "flex") {
      nsecBox.style.display = "none";
      inpNsec.value = "";
      btnReveal.textContent = "Reveal Private Key";
      return;
    }
    if (typeof confirm === "function" && !confirm("⚠️ Never share your private key!\nReveal private key?")) return;
    try {
      if (typeof omni !== "undefined" && omni.auth) {
        const nsec = await omni.auth.getNsec();
        inpNsec.value = nsec;
        nsecBox.style.display = "flex";
        btnReveal.textContent = "Hide Private Key";
      }
    } catch (err: any) {
      alert(`Could not retrieve private key: ${err?.message || String(err)}`);
    }
  });

  btnImport.addEventListener("click", async () => {
    const val = inpImport.value?.trim();
    if (!val) return alert("Please enter private key");
    try {
      if (typeof omni !== "undefined" && omni.auth) {
        await omni.auth.switchKey(val);
        alert("Account switched successfully!");
        inpImport.value = "";
      }
    } catch (err: any) {
      alert(`Failed to import key: ${err?.message || String(err)}`);
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
      setTimeout(() => {
        btnSave.disabled = false;
        btnSave.textContent = "Save & Publish Profile (kind 0)";
      }, 1800);
    } catch (err: any) {
      alert(`Failed to publish profile: ${err?.message || String(err)}`);
      btnSave.disabled = false;
      btnSave.textContent = "Save & Publish Profile (kind 0)";
    }
  });

  root.appendChild(container);

  // Fetch identity asynchronously
  (async () => {
    try {
      let pubkey = "";
      let npub = "";
      let profileData: any = null;

      if (typeof omni !== "undefined" && omni.nostr) {
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
      if (typeof omni !== "undefined" && omni.profile && pubkey) {
        profileData = await omni.profile.get(pubkey);
        if (profileData) {
          spanName.textContent = profileData.display_name || profileData.name || "Active Identity";
          if (profileData.display_name) rowDName.value = profileData.display_name;
          if (profileData.name) rowName.value = profileData.name;
          if (profileData.about) inpAbout.value = profileData.about;
          if (profileData.picture) rowPic.value = profileData.picture;
          if (profileData.nip05) rowNip05.value = profileData.nip05;
          if (profileData.lud16) rowLud16.value = profileData.lud16;
        }
      }
    } catch (_) {}
  })();
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
