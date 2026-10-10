/// <reference types="@omni/types" />

async function mountProfile(root: any) {
  const isRemote = typeof root.createElement === "function";
  const createElement = (tag: string) => isRemote ? root.createElement(tag) : document.createElement(tag);

  const card = createElement("div");
  card.className = "checklist-widget-card";

  const header = createElement("div");
  header.className = "widget-header";
  const title = createElement("h3");
  title.textContent = "✦ Nostr Profile & Identity";
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
  infoRow.setAttribute("style", "display: flex; flex-direction: column; gap: 8px; margin-top: 8px; font-size: 0.82rem;");

  const nameEl = createElement("div");
  const displayName = profileData?.display_name || profileData?.name || "Active Identity";
  nameEl.innerHTML = `<strong>${displayName}</strong>`;

  const npubEl = createElement("div");
  npubEl.setAttribute("style", "font-family: var(--omni-font-mono); font-size: 0.72rem; color: var(--omni-text-muted); word-break: break-all;");
  npubEl.textContent = npub || (pubkey ? `pubkey: ${pubkey.slice(0, 10)}...` : "Anonymous Session");

  const aboutEl = createElement("p");
  aboutEl.setAttribute("style", "font-size: 0.78rem; color: var(--omni-text-secondary); margin: 4px 0;");
  aboutEl.textContent = profileData?.about || "Decentralized cryptographic identity secured by secp256k1 & Schnorr signatures.";

  infoRow.appendChild(nameEl);
  infoRow.appendChild(npubEl);
  infoRow.appendChild(aboutEl);
  card.appendChild(infoRow);

  root.appendChild(card);
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
