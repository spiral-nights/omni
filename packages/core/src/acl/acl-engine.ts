import { CapabilityStore, GrantLevel } from "./capability-store.js";
import { OmniManifest } from "@omni/types";

export type PermissionPromptHandler = (
  pluginId: string,
  category: string,
  details?: any,
  manifest?: OmniManifest
) => Promise<GrantLevel>;

export class AclEngine {
  private store: CapabilityStore;
  private promptHandler?: PermissionPromptHandler;
  private manifests: Map<string, OmniManifest> = new Map();

  constructor(store: CapabilityStore, promptHandler?: PermissionPromptHandler) {
    this.store = store;
    this.promptHandler = promptHandler;
  }

  registerManifest(manifest: OmniManifest): void {
    this.manifests.set(manifest.id, manifest);
  }

  async checkPermission(
    pluginId: string,
    category: string,
    details?: any
  ): Promise<boolean> {
    // Defense against NIP-78 host workspace tampering:
    // Any kind 30078 event with d-tag starting with 'omni/' or 'omni:' is reserved for the host shell.
    if (
      (category === "nostr:sign" || category === "nostr:write") &&
      details?.kind === 30078 &&
      Array.isArray(details?.tags)
    ) {
      const dTag = details.tags.find((t: any) => Array.isArray(t) && t[0] === "d")?.[1];
      if (typeof dTag === "string" && (dTag === "omni" || dTag.startsWith("omni/") || dTag.startsWith("omni:"))) {
        return false;
      }
    }

    const scope = details?.kind !== undefined ? String(details.kind) : undefined;
    const existing = this.store.getGrant(pluginId, category, scope);

    if (existing === "always" || existing === "session") {
      return true;
    }
    if (existing === "deny") {
      return false;
    }

    // If no existing grant, trigger prompt handler if available
    if (this.promptHandler) {
      const manifest = this.manifests.get(pluginId);
      const userChoice = await this.promptHandler(pluginId, category, details, manifest);
      this.store.setGrant(pluginId, category, userChoice, scope);
      return userChoice === "always" || userChoice === "session";
    }

    return false;
  }

  async canReadEvent(pluginId: string, event: { kind: number }): Promise<boolean> {
    const SENSITIVE_KINDS = [4, 1059, 14];
    if (SENSITIVE_KINDS.includes(event.kind)) {
      const encryptGrant = this.store.getGrant(pluginId, "nostr:encrypt");
      if (encryptGrant === "always" || encryptGrant === "session") {
        return true;
      }
      const specificKindGrant = this.store.getGrant(pluginId, "nostr:read", String(event.kind), false);
      if (specificKindGrant === "always" || specificKindGrant === "session") {
        return true;
      }
      return false;
    }

    return this.checkPermission(pluginId, "nostr:read", { kind: event.kind });
  }
}

