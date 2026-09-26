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
}
