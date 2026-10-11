/// <reference types="@omni/types" />

async function mountProfile(root: any) {
  const isRemote = typeof root.createElement === "function";
  const createElement = (tag: string) => (isRemote ? root.createElement(tag) : document.createElement(tag));

  const urlParams = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const currentView = urlParams.get("view") || "main";

  // Widget compact view
  if (currentView === "widget" || currentView === "pill" || currentView === "badge") {
    return mountProfileWidget(root, createElement);
  }

  // Full Profile & Keys Management view (main / settings)
  return mountProfileFull(root, createElement);
}

async function mountProfileWidget(root: any, createElement: (tag: string) => any) {
  const card = createElement("div");
  card.className = "checklist-widget-card";

  const header = createElement("div");
  header.className = "widget-header";
  const title = createElement("h3");
  title.textContent = "✦ Active Identity";
  header.appendChild(title);
  card.appendChild(header);

  let pubkey = "";
  let npub = "";
  let profileData: any = null;

  try {
    if (typeof omni !== "undefined" && omni.nostr) {
      pubkey = await omni.nostr.getPublicKey();
    }
    if (typeof omni !== "undefined" && omni.auth) {
      npub = await omni.auth.getNpub();
    }
    if (typeof omni !== "undefined" && omni.profile && pubkey) {
      profileData = await omni.profile.get(pubkey);
    }
  } catch {}

  const infoRow = createElement("div");
  infoRow.setAttribute("style", "display: flex; flex-direction: column; gap: 6px; margin-top: 8px; font-size: 0.82rem;");

  const nameEl = createElement("div");
  const displayName = profileData?.display_name || profileData?.name || "Anonymous Nostr User";
  nameEl.innerHTML = `<strong>${displayName}</strong>`;

  const npubEl = createElement("div");
  npubEl.setAttribute("style", "font-family: var(--omni-font-mono); font-size: 0.72rem; color: var(--omni-text-muted); word-break: break-all;");
  npubEl.textContent = npub ? `${npub.slice(0, 12)}...${npub.slice(-8)}` : "No Key Loaded";

  infoRow.appendChild(nameEl);
  infoRow.appendChild(npubEl);
  card.appendChild(infoRow);
  root.appendChild(card);
}

async function mountProfileFull(root: any, createElement: (tag: string) => any) {
  const container = createElement("div");
  container.setAttribute("style", "display: flex; flex-direction: column; gap: 14px; padding: 4px;");

  // Tab Header: Profile Info vs Keys & Custody
  const tabRow = createElement("div");
  tabRow.setAttribute("style", "display: flex; gap: 6px; border-bottom: 1px solid var(--omni-border-subtle); padding-bottom: 8px;");

  const btnTabProfile = createElement("button");
  btnTabProfile.className = "modal-tab-btn active";
  btnTabProfile.textContent = "Profile Info (kind 0)";

  const btnTabKeys = createElement("button");
  btnTabKeys.className = "modal-tab-btn";
  btnTabKeys.textContent = "Keys & Custody";

  tabRow.appendChild(btnTabProfile);
  tabRow.appendChild(btnTabKeys);
  container.appendChild(tabRow);

  // Pane 1: Profile Info Form
  const paneProfile = createElement("div");
  paneProfile.setAttribute("style", "display: flex; flex-direction: column; gap: 12px;");

  let pubkey = "";
  let npub = "";
  let profileData: any = null;

  try {
    if (typeof omni !== "undefined" && omni.nostr) {
      pubkey = await omni.nostr.getPublicKey();
    }
    if (typeof omni !== "undefined" && omni.auth) {
      npub = await omni.auth.getNpub();
    }
    if (typeof omni !== "undefined" && omni.profile && pubkey) {
      profileData = await omni.profile.get(pubkey);
    }
  } catch {}

  // Preview header
  const previewBox = createElement("div");
  previewBox.setAttribute("style", "display: flex; align-items: center; gap: 12px; background: var(--omni-bg-surface); padding: 10px 14px; border-radius: var(--omni-radius-sm); border: 1px solid var(--omni-border-subtle);");

  const avatar = createElement("div");
  avatar.setAttribute("style", "width: 44px; height: 44px; border-radius: 50%; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; color: var(--omni-accent-primary); flex-shrink: 0;");
  avatar.textContent = "✦";

  const previewText = createElement("div");
  previewText.setAttribute("style", "display: flex; flex-direction: column; gap: 2px; overflow: hidden;");
  const pName = profileData?.display_name || profileData?.name || "Active Identity";
  previewText.innerHTML = `<span style="font-weight: 600; font-size: 0.9rem;">${pName}</span><span style="font-family: var(--omni-font-mono); font-size: 0.72rem; color: var(--omni-text-muted); text-overflow: ellipsis; overflow: hidden;">${npub || "No npub"}</span>`;

  previewBox.appendChild(avatar);
  previewBox.appendChild(previewText);
  paneProfile.appendChild(previewBox);

  // Inputs
  const formBox = createElement("div");
  formBox.setAttribute("style", "display: flex; flex-direction: column; gap: 8px;");

  const createInputRow = (label: string, placeholder: string, value: string = "") => {
    const wrap = createElement("label");
    wrap.setAttribute("style", "font-size: 0.78rem; color: var(--omni-text-secondary); display: flex; flex-direction: column; gap: 3px;");
    wrap.textContent = label;
    const inp = createElement("input");
    inp.setAttribute("type", "text");
    inp.setAttribute("placeholder", placeholder);
    inp.setAttribute("style", "background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 7px 10px; border-radius: var(--omni-radius-sm); font-size: 0.82rem; outline: none;");
    if (value) inp.value = value;
    wrap.appendChild(inp);
    return { wrap, inp };
  };

  const rowDName = createInputRow("Display Name:", "e.g. Alice Smith", profileData?.display_name || "");
  const rowName = createInputRow("Username / Handle:", "e.g. alice", profileData?.name || "");

  const rowAboutWrap = createElement("label");
  rowAboutWrap.setAttribute("style", "font-size: 0.78rem; color: var(--omni-text-secondary); display: flex; flex-direction: column; gap: 3px;");
  rowAboutWrap.textContent = "About / Bio:";
  const inpAbout = createElement("textarea");
  inpAbout.setAttribute("rows", "2");
  inpAbout.setAttribute("placeholder", "Tell the Nostr network about yourself...");
  inpAbout.setAttribute("style", "background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 7px 10px; border-radius: var(--omni-radius-sm); font-size: 0.82rem; outline: none; resize: vertical;");
  if (profileData?.about) inpAbout.value = profileData.about;
  rowAboutWrap.appendChild(inpAbout);

  const rowPic = createInputRow("Avatar URL:", "https://example.com/avatar.jpg", profileData?.picture || "");
  const rowNip05 = createInputRow("NIP-05 Identifier:", "alice@domain.com", profileData?.nip05 || "");
  const rowLud16 = createInputRow("Lightning Address (lud16):", "alice@getalby.com", profileData?.lud16 || "");

  formBox.appendChild(rowDName.wrap);
  formBox.appendChild(rowName.wrap);
  formBox.appendChild(rowAboutWrap);
  formBox.appendChild(rowPic.wrap);
  formBox.appendChild(rowNip05.wrap);
  formBox.appendChild(rowLud16.wrap);
  paneProfile.appendChild(formBox);

  // Save Button
  const btnSave = createElement("button");
  btnSave.className = "btn-publish";
  btnSave.setAttribute("style", "align-self: flex-end; font-size: 0.82rem; padding: 6px 16px; margin-top: 4px;");
  btnSave.textContent = "Save & Publish Profile (kind 0)";
  btnSave.addEventListener("click", async () => {
    btnSave.disabled = true;
    btnSave.textContent = "Publishing to Nostr...";
    try {
      const meta: Record<string, any> = {};
      if (rowDName.inp.value.trim()) meta.display_name = rowDName.inp.value.trim();
      if (rowName.inp.value.trim()) meta.name = rowName.inp.value.trim();
      if (inpAbout.value.trim()) meta.about = inpAbout.value.trim();
      if (rowPic.inp.value.trim()) meta.picture = rowPic.inp.value.trim();
      if (rowNip05.inp.value.trim()) meta.nip05 = rowNip05.inp.value.trim();
      if (rowLud16.inp.value.trim()) meta.lud16 = rowLud16.inp.value.trim();

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
  paneProfile.appendChild(btnSave);
  container.appendChild(paneProfile);

  // Pane 2: Keys & Custody
  const paneKeys = createElement("div");
  paneKeys.setAttribute("style", "display: none; flex-direction: column; gap: 14px;");

  const createKeyRow = (label: string, value: string) => {
    const wrap = createElement("div");
    wrap.setAttribute("style", "display: flex; flex-direction: column; gap: 4px;");
    const lbl = createElement("span");
    lbl.setAttribute("style", "font-size: 0.78rem; color: var(--omni-text-secondary);");
    lbl.textContent = label;
    const row = createElement("div");
    row.setAttribute("style", "display: flex; gap: 6px;");
    const inp = createElement("input");
    inp.setAttribute("type", "text");
    inp.setAttribute("readonly", "true");
    inp.setAttribute("style", "flex: 1; background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 6px 10px; border-radius: var(--omni-radius-sm); font-family: var(--omni-font-mono); font-size: 0.74rem; outline: none;");
    inp.value = value;
    const btn = createElement("button");
    btn.className = "btn-secondary";
    btn.setAttribute("style", "font-size: 0.72rem; padding: 4px 10px;");
    btn.textContent = "Copy";
    btn.addEventListener("click", () => {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(value);
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = "Copy"), 1200);
      }
    });
    row.appendChild(inp);
    row.appendChild(btn);
    wrap.appendChild(lbl);
    wrap.appendChild(row);
    return wrap;
  };

  paneKeys.appendChild(createKeyRow("Public Key (npub):", npub || "Not available"));
  paneKeys.appendChild(createKeyRow("Public Key (Hex):", pubkey || "Not available"));

  // Private Key (nsec) reveal section
  const nsecSection = createElement("div");
  nsecSection.setAttribute("style", "border-top: 1px solid var(--omni-border-subtle); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;");

  const nsecHeader = createElement("div");
  nsecHeader.setAttribute("style", "display: flex; justify-content: space-between; align-items: center;");
  const nsecTitle = createElement("span");
  nsecTitle.setAttribute("style", "font-size: 0.82rem; font-weight: 600; color: var(--omni-text-secondary);");
  nsecTitle.textContent = "Private Key (nsec):";

  const btnReveal = createElement("button");
  btnReveal.className = "btn-secondary";
  btnReveal.setAttribute("style", "font-size: 0.72rem;");
  btnReveal.textContent = "Reveal Private Key";

  nsecHeader.appendChild(nsecTitle);
  nsecHeader.appendChild(btnReveal);
  nsecSection.appendChild(nsecHeader);

  const nsecBox = createElement("div");
  nsecBox.setAttribute("style", "display: none; gap: 6px;");

  const inpNsec = createElement("input");
  inpNsec.setAttribute("type", "text");
  inpNsec.setAttribute("readonly", "true");
  inpNsec.setAttribute("style", "flex: 1; background: var(--omni-bg-subtle); border: 1px solid rgba(239,68,68,0.4); color: #f87171; padding: 6px 10px; border-radius: var(--omni-radius-sm); font-family: var(--omni-font-mono); font-size: 0.74rem; outline: none;");

  const btnCopyNsec = createElement("button");
  btnCopyNsec.className = "btn-secondary";
  btnCopyNsec.setAttribute("style", "font-size: 0.72rem;");
  btnCopyNsec.textContent = "Copy";
  btnCopyNsec.addEventListener("click", () => {
    if (typeof navigator !== "undefined" && navigator.clipboard && inpNsec.value) {
      navigator.clipboard.writeText(inpNsec.value);
      btnCopyNsec.textContent = "Copied!";
      setTimeout(() => (btnCopyNsec.textContent = "Copy"), 1200);
    }
  });

  nsecBox.appendChild(inpNsec);
  nsecBox.appendChild(btnCopyNsec);
  nsecSection.appendChild(nsecBox);

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

  paneKeys.appendChild(nsecSection);

  // Switch identity / Import key
  const switchSection = createElement("div");
  switchSection.setAttribute("style", "border-top: 1px solid var(--omni-border-subtle); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;");

  const switchTitle = createElement("span");
  switchTitle.setAttribute("style", "font-size: 0.82rem; font-weight: 600; color: var(--omni-text-secondary);");
  switchTitle.textContent = "Switch Identity / Import Key:";

  const inpImport = createElement("input");
  inpImport.setAttribute("type", "password");
  inpImport.setAttribute("placeholder", "Paste nsec1... or 64-char hex private key");
  inpImport.setAttribute("style", "background: var(--omni-bg-subtle); border: 1px solid var(--omni-border-strong); color: var(--omni-text-primary); padding: 7px 10px; border-radius: var(--omni-radius-sm); font-size: 0.82rem; outline: none;");

  const btnImport = createElement("button");
  btnImport.className = "btn-publish";
  btnImport.setAttribute("style", "align-self: flex-end; font-size: 0.78rem; padding: 6px 14px;");
  btnImport.textContent = "Import & Switch";
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

  switchSection.appendChild(switchTitle);
  switchSection.appendChild(inpImport);
  switchSection.appendChild(btnImport);
  paneKeys.appendChild(switchSection);

  container.appendChild(paneKeys);

  // Wire Tab Buttons
  btnTabProfile.addEventListener("click", () => {
    btnTabProfile.className = "modal-tab-btn active";
    btnTabKeys.className = "modal-tab-btn";
    paneProfile.style.display = "flex";
    paneKeys.style.display = "none";
  });

  btnTabKeys.addEventListener("click", () => {
    btnTabKeys.className = "modal-tab-btn active";
    btnTabProfile.className = "modal-tab-btn";
    paneKeys.style.display = "flex";
    paneProfile.style.display = "none";
  });

  root.appendChild(container);
}

if (typeof omni !== "undefined" && typeof (omni as any).registerComponent === "function") {
  (omni as any).registerComponent("profile-main", ({ root }: any) => {
    mountProfile(root);
  });
  (omni as any).registerComponent("profile-badge", ({ root }: any) => {
    mountProfile(root);
  });
  (omni as any).registerComponent("org.omni.nsite.profile-main", ({ root }: any) => {
    mountProfile(root);
  });
} else if (typeof document !== "undefined") {
  mountProfile(document.body);
}
