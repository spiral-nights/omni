import { CapabilityStore, GrantLevel } from "./capability-store.js";
import { OmniManifest } from "@omni/types";
import { decide, decide_read } from "@omni/gleam-interop/acl";

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
    // Policy (reserved NIP-78 identifiers, stored grants) lives in Gleam: omni_kernel's acl/policy.
    const scope = details?.kind !== undefined ? String(details.kind) : undefined;
    const verdict = decide(category, details, this.store.getGrant(pluginId, category, scope));
    if (verdict === "allow") return true;
    if (verdict === "deny") return false;

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
    // Sensitive-kind filtering lives in Gleam: omni_kernel's acl/read_filter.
    const verdict = decide_read(
      event.kind,
      this.store.getGrant(pluginId, "nostr:encrypt"),
      this.store.getGrant(pluginId, "nostr:read", String(event.kind), false)
    );
    if (verdict === "allow") return true;
    if (verdict === "deny") return false;
    return this.checkPermission(pluginId, "nostr:read", { kind: event.kind });
  }
}
