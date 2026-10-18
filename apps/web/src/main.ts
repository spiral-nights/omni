import { OmniKernel } from "@omni/core";
import { OmniShell, PanoramaShell, InstalledPluginEntry, shellRegistry } from "@omni/plugin-shell";
import { OmniShellHost } from "@omni/types";

// Import compiled plugin scripts (using Vite ?raw import)
import feedScript from "../../../packages/plugins/feed/dist/index.js?raw";
import relaysScript from "../../../packages/plugins/relays/dist/index.js?raw";
import profileScript from "../../../packages/plugins/profile/dist/index.js?raw";
import profileViewerScript from "../../../packages/plugins/profile-viewer/dist/index.js?raw";
import checklistScript from "../../../packages/plugins/checklist/dist/index.js?raw";
import timerScript from "../../../packages/plugins/timer/dist/index.js?raw";
import omniRuntimeScript from "../../../packages/core/src/sandbox/omni-runtime.js?raw";

const STORAGE_KEY_NSEC = "omni_privkey";
const STORAGE_KEY_SHELL = "omni_active_shell";
const savedPrivkey = localStorage.getItem(STORAGE_KEY_NSEC) || undefined;
const activeShellType = localStorage.getItem(STORAGE_KEY_SHELL) || "classic";

// Initial First-Class Core System Standalone nsites (Zero Manifests)
const initialPlugins: InstalledPluginEntry[] = [
  {
    id: "org.omni.plugin.feed",
    name: "Feed",
    description: "Decentralized Nostr timeline notes and Schnorr-signed publishing.",
    icon: "feed",
    viewport: "main",
    views: [
      { id: "main", title: "Feed", path: "" },
      { id: "search", title: "Search", path: "?view=search" },
      { id: "settings", title: "Feed Settings", path: "?view=settings" },
      { id: "widget", title: "Feed Widget", path: "?view=widget" }
    ],
    handledIntents: ["create_note", "compose_note", "view_note", "share"],
    scriptContent: feedScript,
    sourceUrl: "local:@omni/plugin-feed",
    enabled: true
  },
  {
    id: "org.omni.plugin.timer",
    name: "Focus Timer",
    description: "Pomodoro focus countdown and productivity timer widget.",
    icon: "timer",
    viewport: "sidebar",
    views: [
      { id: "main", title: "Full Focus Screen", path: "" },
      { id: "widget", title: "Timer Card", path: "?view=widget" },
      { id: "settings", title: "Timer Settings", path: "?view=settings" }
    ],
    scriptContent: timerScript,
    sourceUrl: "local:@omni/plugin-timer",
    enabled: true
  },
  {
    id: "org.omni.plugin.checklist",
    name: "Daily Checklist",
    description: "Track daily goals and productivity tasks.",
    icon: "check-circle",
    viewport: "sidebar",
    views: [
      { id: "main", title: "Full Task List", path: "" },
      { id: "widget", title: "Checklist Card", path: "?view=widget" },
      { id: "settings", title: "Checklist Settings", path: "?view=settings" }
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
    viewport: "sidebar",
    views: [
      { id: "main", title: "Relays", path: "" }
    ],
    scriptContent: relaysScript,
    sourceUrl: "local:@omni/plugin-relays",
    enabled: true
  },
  {
    id: "org.omni.plugin.profile",
    name: "Profile Editor",
    displayName: "My Profile",
    description: "Decentralized Nostr profile metadata and key custody.",
    icon: "profile",
    viewport: "main",
    views: [
      { id: "main", title: "Profile", path: "" },
      { id: "widget", title: "User Badge Pill", path: "?view=widget" },
      { id: "settings", title: "Profile Settings", path: "?view=settings" }
    ],
    handledIntents: ["edit_profile"],
    scriptContent: profileScript,
    sourceUrl: "local:@omni/plugin-profile",
    enabled: true
  },
  {
    id: "org.omni.plugin.profile-viewer",
    name: "People",
    displayName: "People",
    description: "Nostr user profiles, following, and block list management.",
    icon: "users",
    viewport: "main",
    views: [
      { id: "main", title: "People", path: "" }
    ],
    handledIntents: ["view_profile"],
    scriptContent: profileViewerScript,
    sourceUrl: "local:@omni/plugin-profile-viewer",
    enabled: true
  }
];

let shell: OmniShell | PanoramaShell;

// 1. Initialize Host Orchestration Kernel
const kernel = new OmniKernel({
  privateKeyHex: savedPrivkey,
  bootstrapRelays: ["wss://relay.damus.io", "wss://relay.ditto.pub"],
  runtimeScript: omniRuntimeScript,
  theme: activeShellType === "panorama" ? {
    mode: "dark",
    colors: {
      canvas: "#000000",
      surface: "#111111",
      accent: "#00a4ef",
      contrast: "#ffffff",
      radius: "0px"
    }
  } : undefined,
  slotResolver: (pluginId, compId, slot) => {
    return (shell as any)?.getContainerForPluginSlot(pluginId, slot, compId);
  },
  onSlotAction: (action, slot) => {
    (shell as any)?.handleSlotAction?.(action, slot);
  },
  onHandleUri: (uri, srcId) => {
    return (shell as any)?.handleUri?.(uri, srcId);
  },
  onHandleShare: (payload, srcId) => {
    return (shell as any)?.handleShare?.(payload, srcId);
  }
});

// 2. Application Startup & Microkernel Boot
async function startApp() {
  console.log("⚡ [Omni Web] Booting Omni Host Microkernel...");

  const rootEl = document.getElementById("omni-root");
  if (!rootEl) throw new Error("Missing #omni-root container in DOM");

  // Mount active Shell UI Plugin into root container via shellRegistry
  console.log(`✦ [Omni Web] Activating Shell: ${activeShellType}...`);
  shell = shellRegistry.create(activeShellType, {
    root: rootEl,
    kernel,
    installedPlugins: initialPlugins
  }) as OmniShell | PanoramaShell;

  // Restore local workspace customizations (0ms instant startup)
  shell.loadInitialWorkspace();
  shell.mount();

  // Boot Kernel (Keystore, RelayPool, Storage, Coordinator, 0ms Cache)
  await kernel.boot();
  await kernel.seedInitialNotesIfEmpty();

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

  if (primaryPlugin) {
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
      console.log("✦ [Omni Web] Restoring cached NIP-78 workspace layout from 0ms store...");
      shell.applyWorkspaceState(cachedWorkspace.state, false, false);
      shell.lastSyncedAt = cachedWorkspace.event.created_at * 1000;
      shell.updateSyncUi();
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
        console.log("✦ [Omni Web] Received remote NIP-78 workspace update from relays.");
        shell.applyWorkspaceState(remote.state, true, false);
        shell.lastSyncedAt = remote.event.created_at * 1000;
        shell.workspaceSyncStatus = "synced";
        shell.updateSyncUi();
      }
    })
    .catch((err) => {
      console.warn("Background NIP-78 sync query:", err);
    });

  console.log("🚀 [Omni Web] App running successfully with modular @omni/plugin-shell!");

  // Register Offline-First PWA Service Worker
  if (typeof window !== "undefined" && "serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("✦ [Omni PWA] Service worker registered successfully:", reg.scope);
        })
        .catch((err) => {
          console.warn("✦ [Omni PWA] Service worker registration failed:", err);
        });
    });
  }
}

startApp().catch((err) => {
  console.error("Fatal startup error in Omni Web:", err);
});
