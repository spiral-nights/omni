import { OmniManifest } from "@omni/types";

export interface SlotMapping {
  pluginId: string;
  componentId: string;
  slotId: string;
  order: number;
  enabled: boolean;
}

export interface AvailableSlot {
  id: string;
  name: string;
  description: string;
}

export const STANDARD_SLOTS: AvailableSlot[] = [
  { id: "main", name: "Feed Page", description: "Primary view area for timeline notes and main tools" },
  { id: "sidebar", name: "Widgets Page", description: "Full-page grid dashboard for workspace widgets & productivity tools" },
  { id: "dock", name: "Navigation Dock", description: "Desktop & mobile navigation dock for icons & shortcuts" },
  { id: "header-status", name: "Header Status Area", description: "Top header area next to brand logo" },
  { id: "header-actions", name: "Header Actions", description: "Top right header area for quick actions and profile badge" }
];

export class LayoutManager {
  private mappings: SlotMapping[] = [];
  private listeners: Set<(mappings: SlotMapping[]) => void> = new Set();
  private storageKey: string;

  constructor(storageKey = "omni_slot_layout") {
    this.storageKey = storageKey;
    this.load();
  }

  private load(): void {
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.mappings = parsed;
          }
        }
      } catch (err) {
        console.warn("[LayoutManager] Failed to load layout mappings from storage:", err);
      }
    }
  }

  private save(): void {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.mappings));
      } catch (err) {
        console.warn("[LayoutManager] Failed to save layout mappings to storage:", err);
      }
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getMappings());
      } catch (err) {
        console.error("[LayoutManager] Error in listener:", err);
      }
    }
  }

  subscribe(listener: (mappings: SlotMapping[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getMappings(): SlotMapping[] {
    return [...this.mappings].sort((a, b) => a.order - b.order);
  }

  getMappingsForSlot(slotId: string): SlotMapping[] {
    return this.mappings
      .filter((m) => m.slotId === slotId && m.enabled)
      .sort((a, b) => a.order - b.order);
  }

  getSlotForComponent(pluginId: string, componentId: string): string | undefined {
    const found = this.mappings.find(
      (m) => m.pluginId === pluginId && m.componentId === componentId
    );
    return found ? found.slotId : undefined;
  }

  isComponentEnabled(pluginId: string, componentId: string): boolean {
    const found = this.mappings.find(
      (m) => m.pluginId === pluginId && m.componentId === componentId
    );
    return found ? found.enabled : true;
  }

  registerPlugin(manifest: OmniManifest): void {
    let changed = false;
    for (const comp of manifest.components) {
      const existing = this.mappings.find(
        (m) => m.pluginId === manifest.id && m.componentId === comp.id
      );
      if (!existing) {
        const nextOrder = this.mappings.filter((m) => m.slotId === comp.slot).length;
        this.mappings.push({
          pluginId: manifest.id,
          componentId: comp.id,
          slotId: comp.slot,
          order: nextOrder,
          enabled: true
        });
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
  }

  unregisterPlugin(pluginId: string): void {
    const countBefore = this.mappings.length;
    this.mappings = this.mappings.filter((m) => m.pluginId !== pluginId);
    if (this.mappings.length !== countBefore) {
      this.save();
    }
  }

  setComponentSlot(pluginId: string, componentId: string, targetSlotId: string, order?: number): void {
    const existingIndex = this.mappings.findIndex(
      (m) => m.pluginId === pluginId && m.componentId === componentId
    );

    const slotItems = this.mappings.filter((m) => m.slotId === targetSlotId);
    const assignedOrder = order ?? slotItems.length;

    if (existingIndex >= 0) {
      this.mappings[existingIndex].slotId = targetSlotId;
      this.mappings[existingIndex].order = assignedOrder;
    } else {
      this.mappings.push({
        pluginId,
        componentId,
        slotId: targetSlotId,
        order: assignedOrder,
        enabled: true
      });
    }
    this.save();
  }

  setComponentEnabled(pluginId: string, componentId: string, enabled: boolean): void {
    const existing = this.mappings.find(
      (m) => m.pluginId === pluginId && m.componentId === componentId
    );
    if (existing) {
      existing.enabled = enabled;
      this.save();
    }
  }

  reorder(pluginId: string, componentId: string, newOrder: number): void {
    const existing = this.mappings.find(
      (m) => m.pluginId === pluginId && m.componentId === componentId
    );
    if (existing) {
      existing.order = newOrder;
      this.save();
    }
  }

  resetToDefaults(manifests: OmniManifest[]): void {
    this.mappings = [];
    for (const manifest of manifests) {
      for (let i = 0; i < manifest.components.length; i++) {
        const comp = manifest.components[i];
        this.mappings.push({
          pluginId: manifest.id,
          componentId: comp.id,
          slotId: comp.slot,
          order: i,
          enabled: true
        });
      }
    }
    this.save();
  }
}
