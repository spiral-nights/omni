export type GrantLevel = "always" | "session" | "deny";

export interface PermissionRecord {
  pluginId: string;
  category: string;
  scope?: string;
  grant: GrantLevel;
  updatedAt: number;
}

export class CapabilityStore {
  private memoryStore: Map<string, GrantLevel> = new Map();
  private storageKey: string;

  constructor(storageKey: string = "omni_capability_grants") {
    this.storageKey = storageKey;
    this.load();
  }

  private getKey(pluginId: string, category: string, scope?: string): string {
    return `${pluginId}::${category}::${scope || "*"}`;
  }

  private load(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const records: PermissionRecord[] = JSON.parse(raw);
        for (const r of records) {
          if (r.grant === "always" || r.grant === "deny") {
            this.memoryStore.set(this.getKey(r.pluginId, r.category, r.scope), r.grant);
          }
        }
      }
    } catch {
      // Storage unavailable or invalid JSON
    }
  }

  save(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const records: PermissionRecord[] = [];
      for (const [key, grant] of this.memoryStore.entries()) {
        const [pluginId, category, scope] = key.split("::");
        records.push({
          pluginId,
          category,
          scope,
          grant,
          updatedAt: Date.now()
        });
      }
      localStorage.setItem(this.storageKey, JSON.stringify(records));
    } catch {
      // Ignore storage write error
    }
  }

  getGrant(pluginId: string, category: string, scope?: string, allowWildcard: boolean = true): GrantLevel | null {
    const specificKey = this.getKey(pluginId, category, scope);
    if (this.memoryStore.has(specificKey)) {
      return this.memoryStore.get(specificKey)!;
    }
    if (!allowWildcard) return null;
    const wildcardKey = this.getKey(pluginId, category, "*");
    return this.memoryStore.get(wildcardKey) || null;
  }

  setGrant(pluginId: string, category: string, grant: GrantLevel, scope?: string): void {
    const key = this.getKey(pluginId, category, scope);
    this.memoryStore.set(key, grant);
    if (grant === "always" || grant === "deny") {
      this.save();
    }
  }

  revoke(pluginId: string, category?: string): void {
    for (const key of Array.from(this.memoryStore.keys())) {
      if (key.startsWith(`${pluginId}::`)) {
        if (!category || key.includes(`::${category}::`)) {
          this.memoryStore.delete(key);
        }
      }
    }
    this.save();
  }

  getAllGrants(pluginId: string): Record<string, GrantLevel> {
    const result: Record<string, GrantLevel> = {};
    for (const [key, grant] of this.memoryStore.entries()) {
      if (key.startsWith(`${pluginId}::`)) {
        const parts = key.split("::");
        result[`${parts[1]}:${parts[2]}`] = grant;
      }
    }
    return result;
  }
}
