/// <reference types="@omni/types" />

if (typeof omni !== "undefined") {
  omni.registerComponent("profile-badge", async ({ root }) => {
    let pubkey = "";
    let npub = "";
    let profileData: any = null;

    try {
      pubkey = await omni.nostr.getPublicKey();
      npub = await omni.auth.getNpub();
      profileData = await omni.profile.get(pubkey);
    } catch {
      // Fallback
    }

    const badgeBtn = root.createElement("button");
    badgeBtn.className = "user-profile-badge";
    badgeBtn.setAttribute("style", "background: var(--omni-bg-surface); border: 1px solid var(--omni-border-subtle); color: var(--omni-text-primary); padding: 5px 12px; border-radius: var(--omni-radius-pill); font-size: 0.78rem; font-weight: 500; cursor: pointer; transition: all 0.15s ease;");
    badgeBtn.title = "Click to manage Nostr profile & keys";

    function updateBadgeText() {
      if (profileData && (profileData.display_name || profileData.name)) {
        badgeBtn.textContent = profileData.display_name || profileData.name;
      } else if (npub) {
        badgeBtn.textContent = `${npub.slice(0, 8)}...${npub.slice(-4)}`;
      } else {
        badgeBtn.textContent = "Guest User";
      }
    }

    updateBadgeText();

    badgeBtn.addEventListener("click", () => {
      // Toggle modal or trigger profile intent
      omni.intents.emit("profile.openModal", { pubkey, npub, profileData });
      omni.ui.toggleSlot("sidebar");
    });

    root.appendChild(badgeBtn);
  });
}
