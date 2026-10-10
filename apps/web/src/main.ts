import { OmniKernel } from "@omni/core";
import { OmniShell, InstalledPluginEntry } from "@omni/plugin-shell";

// Import manifests and compiled plugin bundles (using Vite ?raw import)
import feedManifest from "../../../packages/plugins/feed/omni.manifest.json";
import feedScript from "../../../packages/plugins/feed/dist/index.js?raw";
import relaysManifest from "../../../packages/plugins/relays/omni.manifest.json";
import relaysScript from "../../../packages/plugins/relays/dist/index.js?raw";
import profileManifest from "../../../packages/plugins/profile/omni.manifest.json";
import profileScript from "../../../packages/plugins/profile/dist/index.js?raw";
import checklistManifest from "../../../packages/plugins/checklist/omni.manifest.json";
import checklistScript from "../../../packages/plugins/checklist/dist/index.js?raw";
import timerManifest from "../../../packages/plugins/timer/omni.manifest.json";
import timerScript from "../../../packages/plugins/timer/dist/index.js?raw";
import omniRuntimeScript from "../public/omni-runtime.js?raw";

const STORAGE_KEY_NSEC = "omni_privkey";
const savedPrivkey = localStorage.getItem(STORAGE_KEY_NSEC) || undefined;

// Initial First-Class Core System Plugins
const initialPlugins: InstalledPluginEntry[] = [
  {
    id: feedManifest.id,
    manifest: feedManifest,
    scriptContent: feedScript,
    sourceUrl: "local:@omni/plugin-feed",
    enabled: true
  },
  {
    id: relaysManifest.id,
    manifest: relaysManifest,
    scriptContent: relaysScript,
    sourceUrl: "local:@omni/plugin-relays",
    enabled: true
  },
  {
    id: profileManifest.id,
    manifest: profileManifest,
    scriptContent: profileScript,
    sourceUrl: "local:@omni/plugin-profile",
    enabled: true
  },
  {
    id: checklistManifest.id,
    manifest: checklistManifest,
    scriptContent: checklistScript,
    sourceUrl: "local:@omni/plugin-checklist",
    enabled: true
  },
  {
    id: timerManifest.id,
    manifest: timerManifest,
    scriptContent: timerScript,
    sourceUrl: "local:@omni/plugin-timer",
    enabled: true
  }
];

let shell: OmniShell;

// 1. Initialize Host Orchestration Kernel
const kernel = new OmniKernel({
  privateKeyHex: savedPrivkey,
  bootstrapRelays: ["wss://relay.damus.io"],
  runtimeScript: omniRuntimeScript,
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
      console.log(`⚡ [Omni Web] Mounting plugin ${p.manifest.name}...`);
      await kernel.registerPlugin(p.manifest as any, p.scriptContent, slotContainers);
    }
  }

  console.log("🚀 [Omni Web] App running successfully with modular @omni/plugin-shell!");
}

startApp().catch((err) => {
  console.error("Fatal startup error in Omni Web:", err);
});
