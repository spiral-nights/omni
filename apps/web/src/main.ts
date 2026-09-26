import { OmniKernel } from "@omni/core";
import { NostrEvent } from "@omni/types";

// Import manifests and compiled plugin bundles (using Vite ?raw import)
import checklistManifest from "../../../packages/plugins/checklist/omni.manifest.json";
import timerManifest from "../../../packages/plugins/timer/omni.manifest.json";
import checklistScript from "../../../packages/plugins/checklist/dist/index.js?raw";
import timerScript from "../../../packages/plugins/timer/dist/index.js?raw";

// DOM Element references
const dockSlot = document.getElementById("dock-slot")!;
const desktopSidebarSlot = document.getElementById("desktop-sidebar-slot")!;
const mobileSidebarSlot = document.getElementById("mobile-sidebar-slot")!;
const notesList = document.getElementById("notes-list")!;
const composerInput = document.getElementById("composer-input") as HTMLTextAreaElement;
const btnPublish = document.getElementById("btn-publish") as HTMLButtonElement;
const userBadge = document.getElementById("user-badge") as HTMLButtonElement;
const relayCountText = document.getElementById("relay-count-text")!;
const drawerOverlay = document.getElementById("drawer-overlay")!;
const drawerSheet = document.getElementById("drawer-sheet")!;
const btnCloseDrawer = document.getElementById("btn-close-drawer")!;
const dockBtnWidgets = document.getElementById("dock-btn-widgets")!;
const dockBtnFeed = document.getElementById("dock-btn-feed")!;
const dockBtnSettings = document.getElementById("dock-btn-settings")!;
const btnOpenPlugins = document.getElementById("btn-open-plugins")!;
const pluginModal = document.getElementById("plugin-modal")!;
const btnCloseModal = document.getElementById("btn-close-modal")!;
const pluginsListContainer = document.getElementById("plugins-list")!;

// 1. Mobile Drawer Control
function openDrawer() {
  drawerOverlay.classList.add("open");
  drawerSheet.classList.add("open");
}

function closeDrawer() {
  drawerOverlay.classList.remove("open");
  drawerSheet.classList.remove("open");
}

function toggleDrawer() {
  if (drawerSheet.classList.contains("open")) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

// 2. Responsive Slot Container Setup
// We use a shared wrapper for sidebar widgets so their Remote DOM nodes remain intact across breakpoint transitions
const sidebarSlotWrapper = document.createElement("div");
sidebarSlotWrapper.className = "omni-slot";

function updateSidebarPlacement() {
  const isDesktop = window.matchMedia("(min-width: 768px)").matches;
  if (isDesktop) {
    if (sidebarSlotWrapper.parentElement !== desktopSidebarSlot) {
      desktopSidebarSlot.appendChild(sidebarSlotWrapper);
    }
  } else {
    if (sidebarSlotWrapper.parentElement !== mobileSidebarSlot) {
      mobileSidebarSlot.appendChild(sidebarSlotWrapper);
    }
  }
}

window.addEventListener("resize", updateSidebarPlacement);
updateSidebarPlacement();

// 3. Initialize OmniKernel
const kernel = new OmniKernel({
  bootstrapRelays: ["wss://relay.damus.io"],
  onSlotAction: (action, slot) => {
    if (slot === "sidebar" || slot === "widgets") {
      if (action === "toggle") toggleDrawer();
      else if (action === "open") openDrawer();
      else if (action === "close") closeDrawer();
    }
  }
});

// Map of slot names to host containers
const slotContainers = new Map<string, Element>();
slotContainers.set("icon", dockSlot);
slotContainers.set("sidebar", sidebarSlotWrapper);

// 4. Notes Feed Rendering
const renderedNoteIds = new Set<string>();

function formatTimestamp(unixSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const date = new Date(unixSec * 1000);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderNote(note: NostrEvent, userPubkey: string, prepend = false) {
  if (renderedNoteIds.has(note.id)) return;
  renderedNoteIds.add(note.id);

  // Clear initial placeholder if this is the first real note
  if (notesList.children.length === 1 && notesList.firstElementChild?.textContent?.includes("Loading")) {
    notesList.innerHTML = "";
  }

  const isSelf = note.pubkey === userPubkey;
  const shortPubkey = isSelf ? "You" : `${note.pubkey.slice(0, 8)}...${note.pubkey.slice(-4)}`;

  const card = document.createElement("article");
  card.className = "note-card";
  card.id = `note-${note.id}`;

  const header = document.createElement("div");
  header.className = "note-header";

  const author = document.createElement("span");
  author.className = "note-author";
  author.textContent = shortPubkey;
  if (isSelf) {
    author.style.color = "var(--omni-accent-primary)";
  }

  const time = document.createElement("span");
  time.className = "note-meta";
  time.textContent = formatTimestamp(note.created_at);

  header.appendChild(author);
  header.appendChild(time);

  const content = document.createElement("div");
  content.className = "note-content";
  content.textContent = note.content;

  const actions = document.createElement("div");
  actions.className = "note-actions";

  const btnReply = document.createElement("button");
  btnReply.className = "note-action-btn";
  btnReply.innerHTML = "💬 <span>0</span>";

  const btnLike = document.createElement("button");
  btnLike.className = "note-action-btn";
  btnLike.innerHTML = "❤️ <span>0</span>";

  actions.appendChild(btnReply);
  actions.appendChild(btnLike);

  card.appendChild(header);
  card.appendChild(content);
  card.appendChild(actions);

  if (prepend && notesList.firstChild) {
    notesList.insertBefore(card, notesList.firstChild);
  } else {
    notesList.appendChild(card);
  }
}

// 5. Plugin Manager Modal
const installedPlugins = [
  { manifest: checklistManifest, id: checklistManifest.id },
  { manifest: timerManifest, id: timerManifest.id }
];

function renderPluginManager() {
  pluginsListContainer.innerHTML = "";
  for (const p of installedPlugins) {
    const row = document.createElement("div");
    row.className = "plugin-item-row";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.gap = "4px";

    const titleRow = document.createElement("div");
    titleRow.style.display = "flex";
    titleRow.style.alignItems = "center";
    titleRow.style.gap = "8px";

    const title = document.createElement("strong");
    title.style.fontSize = "0.92rem";
    title.textContent = p.manifest.name;

    const version = document.createElement("span");
    version.style.fontSize = "0.72rem";
    version.style.color = "var(--omni-text-muted)";
    version.textContent = `v${p.manifest.version}`;

    const statusBadge = document.createElement("span");
    statusBadge.style.fontSize = "0.7rem";
    statusBadge.style.color = "var(--omni-status-online)";
    statusBadge.style.background = "var(--omni-bg-subtle)";
    statusBadge.style.padding = "1px 6px";
    statusBadge.style.borderRadius = "var(--omni-radius-pill)";
    statusBadge.textContent = "Sandboxed";

    titleRow.appendChild(title);
    titleRow.appendChild(version);
    titleRow.appendChild(statusBadge);

    const desc = document.createElement("span");
    desc.style.fontSize = "0.8rem";
    desc.style.color = "var(--omni-text-secondary)";
    desc.textContent = p.manifest.description;

    const permissions = document.createElement("span");
    permissions.style.fontSize = "0.72rem";
    permissions.style.color = "var(--omni-text-muted)";
    const permKeys = Object.keys(p.manifest.permissions || {});
    permissions.textContent = `Permissions: ${permKeys.join(", ") || "none"}`;

    left.appendChild(titleRow);
    left.appendChild(desc);
    left.appendChild(permissions);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "8px";

    const btnClear = document.createElement("button");
    btnClear.className = "btn-publish";
    btnClear.style.padding = "4px 10px";
    btnClear.style.fontSize = "0.75rem";
    btnClear.style.background = "var(--omni-bg-subtle)";
    btnClear.style.color = "var(--omni-text-secondary)";
    btnClear.textContent = "Clear DB";
    btnClear.addEventListener("click", async () => {
      await kernel.storageManager.clear(p.id);
      btnClear.textContent = "Cleared!";
      setTimeout(() => {
        btnClear.textContent = "Clear DB";
      }, 1500);
    });

    right.appendChild(btnClear);
    row.appendChild(left);
    row.appendChild(right);
    pluginsListContainer.appendChild(row);
  }
}

function openPluginModal() {
  renderPluginManager();
  pluginModal.classList.add("open");
}

function closePluginModal() {
  pluginModal.classList.remove("open");
}

// 6. Application Startup & Main Wiring
async function startApp() {
  console.log("⚡ [Omni Web] Booting OmniKernel...");
  await kernel.boot();

  const userPubkey = await kernel.getUserPubkey();
  const shortPubkey = `npub:${userPubkey.slice(0, 6)}...${userPubkey.slice(-4)}`;
  userBadge.textContent = shortPubkey;
  userBadge.title = `Your Nostr Pubkey: ${userPubkey}\nClick to copy`;

  userBadge.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(userPubkey);
      const original = userBadge.textContent;
      userBadge.textContent = "Copied!";
      setTimeout(() => {
        userBadge.textContent = original;
      }, 1200);
    } catch {
      alert(`Your Pubkey: ${userPubkey}`);
    }
  });

  // Mount MVP Plugins into sandbox
  console.log("⚡ [Omni Web] Mounting Checklist plugin...");
  await kernel.registerPlugin(checklistManifest as any, checklistScript, slotContainers);

  console.log("⚡ [Omni Web] Mounting Timer plugin...");
  await kernel.registerPlugin(timerManifest as any, timerScript, slotContainers);

  // Check existing events in local store; if empty, seed a welcome note
  const existingNotes = await kernel.eventStore.getEvents({ kinds: [1], limit: 20 });
  if (existingNotes.length === 0) {
    console.log("⚡ [Omni Web] Seeding welcome note to local 0ms store...");
    const seedNote = await kernel.publishNote(
      "Welcome to Omni! ✦ A modular, mobile-first Nostr web client with secure Shopify Remote DOM plugin projection. Open the Widgets drawer to use the Daily Checklist and Focus Timer."
    );
    renderNote(seedNote, userPubkey, true);
  } else {
    for (const note of existingNotes) {
      renderNote(note, userPubkey, false);
    }
  }

  // Subscribe to live timeline feed (0ms cache + real-time relays)
  kernel.subscribeTimeline(
    "main_feed",
    [{ kinds: [1], limit: 50 }],
    (event) => {
      renderNote(event, userPubkey, true);
    },
    () => {
      relayCountText.textContent = "Connected (0ms Cache)";
    }
  );

  // Publish Note Handler
  async function handlePublish() {
    const text = composerInput.value.trim();
    if (!text) return;

    btnPublish.disabled = true;
    btnPublish.textContent = "Signing...";

    try {
      const signedNote = await kernel.publishNote(text);
      composerInput.value = "";
      renderNote(signedNote, userPubkey, true);
    } catch (err) {
      console.error("Failed to publish note:", err);
      alert(`Publish failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      btnPublish.disabled = false;
      btnPublish.textContent = "Publish Note";
    }
  }

  btnPublish.addEventListener("click", handlePublish);
  composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePublish();
    }
  });

  // UI Event Listeners
  dockBtnWidgets.addEventListener("click", toggleDrawer);
  btnCloseDrawer.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);

  dockBtnFeed.addEventListener("click", () => {
    closeDrawer();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  dockBtnSettings.addEventListener("click", openPluginModal);
  btnOpenPlugins.addEventListener("click", openPluginModal);
  btnCloseModal.addEventListener("click", closePluginModal);
  pluginModal.addEventListener("click", (e) => {
    if (e.target === pluginModal) closePluginModal();
  });

  console.log("🚀 [Omni Web] App running successfully!");
}

startApp().catch((err) => {
  console.error("Fatal startup error in Omni Web:", err);
});
