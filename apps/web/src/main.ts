import { OmniKernel } from "@omni/core";
import { OmniShell, InstalledPluginEntry } from "@omni/plugin-shell";

// Import compiled plugin scripts (using Vite ?raw import)
import feedScript from "../../../packages/plugins/feed/dist/index.js?raw";
import relaysScript from "../../../packages/plugins/relays/dist/index.js?raw";
import profileScript from "../../../packages/plugins/profile/dist/index.js?raw";
import checklistScript from "../../../packages/plugins/checklist/dist/index.js?raw";
import timerScript from "../../../packages/plugins/timer/dist/index.js?raw";
import omniRuntimeScript from "../public/omni-runtime.js?raw";

const STORAGE_KEY_NSEC = "omni_privkey";
const savedPrivkey = localStorage.getItem(STORAGE_KEY_NSEC) || undefined;

// Initial First-Class Core System Standalone nsites (Zero Manifests)
const initialPlugins: InstalledPluginEntry[] = [
  {
    id: "org.omni.plugin.feed",
    name: "Timeline Feed & Composer",
    description: "Decentralized Nostr timeline notes and Schnorr-signed publishing.",
    icon: "feed",
    viewport: "main",
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
    scriptContent: checklistScript,
    sourceUrl: "local:@omni/plugin-checklist",
    enabled: true
  },
  {
    id: "org.omni.plugin.relays",
    name: "Relay Inspector",
    description: "Manage connected relays and monitor live WebSocket pool status.",
    icon: "relays",
    viewport: "sidebar",
    scriptContent: relaysScript,
    sourceUrl: "local:@omni/plugin-relays",
    enabled: true
  },
  {
    id: "org.omni.plugin.profile",
    name: "Profile & Keys",
    description: "Decentralized Nostr profile metadata and key custody.",
    icon: "profile",
    viewport: "sidebar",
    scriptContent: profileScript,
    sourceUrl: "local:@omni/plugin-profile",
    enabled: true
  }
];

let shell: OmniShell;

// 1. Initialize Host Orchestration Kernel
const kernel = new OmniKernel({
  privateKeyHex: savedPrivkey,
  bootstrapRelays: ["wss://relay.damus.io"],
  runtimeScript: omniRuntimeScript,
  slotResolver: (pluginId, _compId, slot) => {
    return shell?.getContainerForPluginSlot(pluginId, slot);
  },
  onSlotAction: (action, slot) => {
    shell?.handleSlotAction(action, slot);
  },
  onHandleUri: (uri, srcId) => {
    return shell?.handleUri(uri, srcId);
  },
  onHandleShare: (payload, srcId) => {
    return shell?.handleShare(payload, srcId);
  }
});

// 2. Application Startup & Microkernel Boot
async function startApp() {
  console.log("⚡ [Omni Web] Booting Omni Host Microkernel...");

  const rootEl = document.getElementById("omni-root");
  if (!rootEl) throw new Error("Missing #omni-root container in DOM");

  // Mount Shell UI Plugin into root container
  shell = new OmniShell({
    root: rootEl,
    kernel,
    installedPlugins: initialPlugins
  });
  shell.mount();

  // Boot Kernel (Keystore, RelayPool, Storage, Coordinator)
  await kernel.boot();

  // Persist private key if newly generated
  if (!localStorage.getItem(STORAGE_KEY_NSEC)) {
    localStorage.setItem(STORAGE_KEY_NSEC, kernel.keystore.getPrivateKey());
  }

  // Sync active user identity and profile
  await shell.updateProfileUi();

  // Seed local welcome note if storage is empty
  const existingNotes = await kernel.eventStore.getEvents({ kinds: [1], limit: 5 });
  if (existingNotes.length === 0) {
    console.log("⚡ [Omni Web] Seeding welcome note to local 0ms store...");
    await kernel.publishNote(
      "Welcome to Omni! ✦ A modular Nostr web client where every feature is a first-class plugin. Use the Layout tool to customize viewports, and inspect relay connections via Settings."
    );
  }

  // Mount enabled plugins into sandboxes using shell slot containers
  console.log("⚡ [Omni Web] Mounting core plugins into sandboxed viewports...");
  const slotContainers = shell.getSlotContainers();
  for (const p of shell.installedPlugins) {
    if (p.enabled) {
      const synthManifest = shell.ensurePluginManifest(p);
      console.log(`⚡ [Omni Web] Mounting nsite ${synthManifest.name}...`);
      await kernel.registerPlugin(synthManifest, p.htmlContent || p.scriptContent, slotContainers);
    }
  }

  console.log("🚀 [Omni Web] App running successfully with modular @omni/plugin-shell!");
}

startApp().catch((err) => {
  console.error("Fatal startup error in Omni Web:", err);
});
