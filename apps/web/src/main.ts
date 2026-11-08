import { OmniKernel } from "@omni/core";
import { shellRegistry } from "@omni/plugin-shell";
import type { BaseShell, InstalledPluginEntry } from "@omni/plugin-shell";
import type { OmniShellHost } from "@omni/types";

// Import compiled plugin scripts (using Vite ?raw / ?url imports)
import feedWasmUrl from "../../../packages/plugins/feed/dist/feed.wasm?url";
import relaysScript from "../../../packages/plugins/relays/dist/index.js?raw";
import profileViewerScript from "../../../packages/plugins/profile-viewer/dist/index.js?raw";
import checklistScript from "../../../packages/plugins/checklist/dist/index.js?raw";
import publisherScript from "../../../packages/plugins/publisher/dist/index.js?raw";
import notesScript from "../../../packages/plugins/notes/dist/index.js?raw";
import timerScript from "../../../packages/plugins/timer/dist/index.js?raw";
import omniRuntimeScript from "../../../packages/core/src/sandbox/omni-runtime.js?raw";

const STORAGE_KEY_NSEC = "omni_privkey";
const STORAGE_KEY_SHELL = "omni_active_shell";
const STORAGE_KEY_PANORAMA_ACCENT = "omni_panorama_accent_color";
const savedPrivkey = localStorage.getItem(STORAGE_KEY_NSEC) || undefined;
const activeShellType = localStorage.getItem(STORAGE_KEY_SHELL) || "editorial";
const savedAccent = localStorage.getItem(STORAGE_KEY_PANORAMA_ACCENT) || "#00a4ef";

// Initial First-Class Core System Standalone nsites (Zero Manifests)
const initialPlugins: InstalledPluginEntry[] = [
  {
    id: "org.omni.plugin.feed",
    name: "Feed",
    description: "Decentralized Nostr timeline notes and Schnorr-signed publishing.",
    icon: "feed",
    viewport: "main",
    pinned: true,
    views: [
      { id: "main", title: "Feed", path: "", format: "wasm" },
      { id: "search", title: "Search", path: "?view=search", format: "wasm" },
      { id: "settings", title: "Feed Settings", path: "?view=settings", format: "wasm" },
      { id: "widget", title: "Feed Widget", path: "?view=widget", format: "wasm" }
    ],
    handledIntents: ["create_note", "compose_note", "view_note", "search", "share"],
    permissions: {
      nostr: { read: { allKinds: true }, write: { allKinds: true }, sign: true }
    },
    scriptContent: feedWasmUrl,
    sourceUrl: "local:@omni/plugin-feed",
    enabled: true
  },
  {
    id: "org.omni.plugin.checklist",
    name: "Task List",
    displayName: "Tasks",
    description: "Decentralized task and todo list synced across Nostr relays.",
    icon: "check-circle",
    views: [
      { id: "main", title: "Task List", path: "", format: "schema" },
      { id: "compact", title: "Live Tile", path: "?view=compact", format: "schema" },
      { id: "widget", title: "Task List", path: "?view=widget", format: "schema" },
      { id: "settings", title: "Task List Settings", path: "?view=settings", format: "schema" }
    ],
    handledIntents: ["create_task"],
    scriptContent: checklistScript,
    sourceUrl: "local:@omni/plugin-checklist",
    enabled: true
  },
  {
    id: "org.omni.plugin.relays",
    name: "Relays",
    description: "Manage connected relays and monitor live WebSocket pool status.",
    icon: "relays",
    views: [
      { id: "main", title: "Relays", path: "", format: "schema" },
      { id: "widget", title: "Relays Widget", path: "?view=widget", format: "schema" },
      { id: "compact", title: "Live Tile", path: "?view=compact", format: "schema" }
    ],
    scriptContent: relaysScript,
    sourceUrl: "local:@omni/plugin-relays",
    permissions: {
      nostr: { read: { allKinds: true }, write: { allKinds: true }, sign: true },
      relays: { manage: true, read: true }
    },
    enabled: true
  },
  {
    id: "org.omni.plugin.profile-viewer",
    name: "Profiles",
    displayName: "Profiles",
    description: "Nostr user profiles, identity metadata, following, and key custody.",
    icon: "users",
    views: [
      { id: "main", title: "Profiles", path: "", format: "schema" },
      { id: "edit", title: "Edit My Profile", path: "?view=edit", format: "schema" },
      { id: "compact", title: "Live Tile", path: "?view=compact", format: "schema" },
      { id: "widget", title: "Profile Card", path: "?view=widget", format: "schema" }
    ],
    handledIntents: ["view_profile", "edit_profile"],
    scriptContent: profileViewerScript,
    sourceUrl: "local:@omni/plugin-profile-viewer",
    enabled: true
  },
  {
    id: "org.omni.plugin.publisher",
    name: "Plugin Publisher",
    displayName: "Plugin Publisher",
    description: "Package .zip archives into NIP-5A nsites, upload to Blossom servers, and manage published plugins.",
    icon: "globe",
    views: [
      { id: "main", title: "Plugin Studio", path: "", format: "schema" },
      { id: "published", title: "My Published Plugins", path: "?view=published", format: "schema" },
      { id: "servers", title: "Blossom Servers", path: "?view=servers", format: "schema" },
      { id: "widget", title: "Publisher Status", path: "?view=widget", format: "schema" }
    ],
    scriptContent: publisherScript,
    sourceUrl: "local:@omni/plugin-publisher",
    enabled: true
  },
  {
    id: "org.omni.plugin.notes",
    name: "Notes",
    displayName: "Notes",
    description: "Private, encrypted personal notebook synced seamlessly across your devices.",
    icon: "notes",
    viewport: "main",
    views: [
      { id: "main", title: "Notes", path: "", format: "iframe" }
    ],
    scriptContent: notesScript,
    sourceUrl: "local:@omni/plugin-notes",
    permissions: {
      nostr: { read: { allKinds: true }, write: { allKinds: true }, sign: true },
      storage: { get: true, set: true }
    },
    enabled: true
  },
  {
    id: "org.omni.plugin.timer",
    name: "Timer",
    displayName: "Visual Timer",
    description: "Visual circular countdown timer.",
    icon: "timer",
    viewport: "main",
    views: [
      { id: "main", title: "Visual Timer", path: "", format: "schema" },
      { id: "widget", title: "Timer Widget", path: "?view=widget", format: "schema" }
    ],
    scriptContent: timerScript,
    sourceUrl: "local:@omni/plugin-timer",
    enabled: true
  }
];

let shell: BaseShell;

// 1. Initialize Host Orchestration Kernel
const kernel = new OmniKernel({
  privateKeyHex: savedPrivkey,
  bootstrapRelays: ["wss://relay.damus.io", "wss://relay.ditto.pub", "wss://relay.nostr.band"],
  runtimeScript: omniRuntimeScript,
  theme: activeShellType === "panorama" ? {
    mode: "dark",
    colors: {
      canvas: "#000000",
      surface: "#111111",
      accent: savedAccent,
      contrast: "#ffffff",
      radius: "0px"
    }
  } : undefined,
  slotResolver: (pluginId, compId, slot) => {
    return shell?.getContainerForPluginSlot(pluginId, slot, compId);
  },
  onSlotAction: (action, slot) => {
    shell?.handleSlotAction?.(action, slot);
  },
  onScrollTo: (params) => {
    shell?.scrollToTop?.(params);
  },
  onHandleUri: (uri, srcId) => {
    return shell?.handleUri?.(uri, srcId);
  },
  onHandleShare: (payload, srcId) => {
    return shell?.handleShare?.(payload, srcId);
  },
  onHistoryPush: (pluginId, params) => {
    return shell?.handleHistoryPush?.(pluginId, params as any);
  },
  onHistoryReplace: (pluginId, params) => {
    return shell?.handleHistoryReplace?.(pluginId, params as any);
  },
  onHistoryBack: (pluginId) => {
    return shell?.handleHistoryBack?.(pluginId);
  },
  onHistoryGo: (pluginId, delta) => {
    return shell?.handleHistoryGo?.(pluginId, delta);
  }
});

// 2. Application Startup & Microkernel Boot
async function startApp() {
  console.log("⚡ [Omni Web] Booting Omni Host Microkernel...");

  const rootEl = document.getElementById("omni-root");
  if (!rootEl) throw new Error("Missing #omni-root container in DOM");

  // Mount active Shell UI Plugin into root container via shellRegistry
  console.log(`✦ [Omni Web] Activating Shell: ${activeShellType}...`);
  shell = (await shellRegistry.createAsync(activeShellType, {
    root: rootEl,
    kernel,
    installedPlugins: initialPlugins
  })) as BaseShell;

  // Restore local workspace customizations (0ms instant startup)
  shell.loadInitialWorkspace();
  shell.mount();

  // Boot Kernel (Keystore, RelayPool, Storage, Coordinator, 0ms Cache)
  await kernel.boot();

  // Persist private key if newly generated
  if (!localStorage.getItem(STORAGE_KEY_NSEC)) {
    localStorage.setItem(STORAGE_KEY_NSEC, kernel.keystore.getPrivateKey());
  }

  // Persist private key when switched or updated, and refresh shell profile UI
  kernel.onKeyChange((newPrivkeyHex) => {
    try {
      localStorage.setItem(STORAGE_KEY_NSEC, newPrivkeyHex);
      console.log("✦ [Omni Web] Persisted updated private key to storage.");
    } catch (err) {
      console.warn("Failed to persist updated private key:", err);
    }
    shell.updateProfileUi().catch((err) => {
      console.warn("Could not update profile UI on key switch:", err);
    });
  });

  // Mount primary active plugin immediately so the user sees the feed in <30ms!
  const activePluginId = shell.getActivePageId() || "org.omni.plugin.feed";
  const primaryPlugin =
    shell.installedPlugins.find((p) => p.id === activePluginId && p.enabled) ||
    shell.installedPlugins.find((p) => p.id === "org.omni.plugin.feed");

  if (primaryPlugin && !kernel.getSandbox(primaryPlugin.id)) {
    console.log(`⚡ [Omni Web] Mounting primary visible nsite ${primaryPlugin.name}...`);
    shell.mountPlugin(primaryPlugin).catch((err) => {
      console.error("Failed to mount primary plugin:", err);
    });
  }

  // Ensure workspace widgets (companion cards in sidebar/widgets slots) are mounted
  shell.ensureWidgetsMounted?.().catch((err: any) => {
    console.warn("Failed to mount workspace widgets:", err);
  });

  // Sync active user identity and profile in background
  shell.updateProfileUi().catch((err) => {
    console.warn("Could not update profile UI:", err);
  });

  // Check 0ms local event store for saved NIP-78 workspace event in background
  kernel.getWorkspaceState().then((cachedWorkspace) => {
    if (cachedWorkspace && cachedWorkspace.state) {
      const cachedUpdated =
        cachedWorkspace.state.updatedAt ||
        (cachedWorkspace.event?.created_at ? cachedWorkspace.event.created_at * 1000 : 0);
      if (cachedUpdated >= (shell.localWorkspaceUpdatedAt || 0)) {
        console.log("✦ [Omni Web] Restoring cached NIP-78 workspace layout from 0ms store...");
        shell.applyWorkspaceState(cachedWorkspace.state, false, false);
        shell.lastSyncedAt = cachedWorkspace.event.created_at * 1000;
        shell.updateSyncUi();
      }
    }
  }).catch((err) => {
    console.warn("Could not check local NIP-78 workspace store:", err);
  });

  // Background plugins and full-page apps are loaded lazily on-demand when the user
  // navigates to them (via dock launcher or app tile) or when an intent is dispatched.

  // Background fetch of remote NIP-78 workspace state from connected relays
  kernel
    .fetchRemoteWorkspaceState(undefined, 4000)
    .then((remote) => {
      if (remote && remote.state) {
        const remoteUpdated =
          remote.state.updatedAt ||
          (remote.event?.created_at ? remote.event.created_at * 1000 : 0);
        if (remoteUpdated >= (shell.localWorkspaceUpdatedAt || 0)) {
          console.log("✦ [Omni Web] Received remote NIP-78 workspace update from relays.");
          shell.applyWorkspaceState(remote.state, true, false);
          shell.lastSyncedAt = remote.event.created_at * 1000;
          shell.workspaceSyncStatus = "synced";
          shell.updateSyncUi();
        } else if (shell.autoSyncNip78) {
          shell.scheduleNip78Sync();
        }
      }
    })
    .catch((err) => {
      console.warn("Background NIP-78 sync query:", err);
    });

  console.log("🚀 [Omni Web] App running successfully with modular @omni/plugin-shell!");

  // Manage Service Worker (PWA offline cache in production; unregister in dev to avoid stale script versions)
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister().then(() => {
            console.log("✦ [Omni Dev] Unregistered lingering dev service worker:", reg.scope);
          });
        }
      });
    } else if (window.location.protocol.startsWith("http")) {
      const registerSw = () => {
        const swUrl = `${import.meta.env.BASE_URL}sw.js`;
        navigator.serviceWorker
          .register(swUrl, { updateViaCache: "none" })
          .then((reg) => {
            console.log("✦ [Omni PWA] Service worker registered successfully:", reg.scope);
          })
          .catch((err) => {
            console.warn("✦ [Omni PWA] Service worker registration failed:", err);
          });
      };

      if (document.readyState === "complete") {
        registerSw();
      } else {
        window.addEventListener("load", registerSw);
      }
    }
  }
}

startApp().catch((err) => {
  console.error("Fatal startup error in Omni Web:", err);
});
