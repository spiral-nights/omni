import { describe, it, expect, beforeEach } from "vitest";
import { LayoutManager, STANDARD_SLOTS } from "../src/layout/layout-manager.js";
import { OmniManifest } from "@omni/types";

describe("LayoutManager", () => {
  let layoutManager: LayoutManager;

  const mockManifest: OmniManifest = {
    id: "org.omni.test",
    name: "Test Plugin",
    version: "1.0.0",
    entry: "dist/index.js",
    components: [
      {
        id: "test-widget",
        type: "widget",
        title: "Test Widget",
        slot: "sidebar"
      },
      {
        id: "test-icon",
        type: "icon",
        title: "Test Icon",
        slot: "dock"
      }
    ]
  };

  beforeEach(() => {
    layoutManager = new LayoutManager("test_omni_layout");
  });

  it("exposes standard slots", () => {
    expect(STANDARD_SLOTS.map((s) => s.id)).toEqual([
      "main",
      "sidebar",
      "dock",
      "header-status",
      "header-actions"
    ]);
  });

  it("registers components from manifest with default slots", () => {
    layoutManager.registerPlugin(mockManifest);
    const mappings = layoutManager.getMappings();

    expect(mappings.length).toBe(2);
    expect(layoutManager.getSlotForComponent("org.omni.test", "test-widget")).toBe("sidebar");
    expect(layoutManager.getSlotForComponent("org.omni.test", "test-icon")).toBe("dock");
    expect(layoutManager.isComponentEnabled("org.omni.test", "test-widget")).toBe(true);
  });

  it("allows re-assigning component to a different slot", () => {
    layoutManager.registerPlugin(mockManifest);
    layoutManager.setComponentSlot("org.omni.test", "test-widget", "main");

    expect(layoutManager.getSlotForComponent("org.omni.test", "test-widget")).toBe("main");
    const mainMappings = layoutManager.getMappingsForSlot("main");
    expect(mainMappings.some((m) => m.componentId === "test-widget")).toBe(true);
  });

  it("supports enabling and disabling components in layout", () => {
    layoutManager.registerPlugin(mockManifest);
    layoutManager.setComponentEnabled("org.omni.test", "test-widget", false);

    expect(layoutManager.isComponentEnabled("org.omni.test", "test-widget")).toBe(false);
    const sidebarMappings = layoutManager.getMappingsForSlot("sidebar");
    expect(sidebarMappings.some((m) => m.componentId === "test-widget")).toBe(false);
  });

  it("notifies subscribers when layout changes", () => {
    let callCount = 0;
    const unsubscribe = layoutManager.subscribe(() => {
      callCount++;
    });

    layoutManager.registerPlugin(mockManifest);
    expect(callCount).toBeGreaterThan(0);

    const prevCount = callCount;
    layoutManager.setComponentSlot("org.omni.test", "test-widget", "dock");
    expect(callCount).toBe(prevCount + 1);

    unsubscribe();
    layoutManager.setComponentSlot("org.omni.test", "test-widget", "sidebar");
    expect(callCount).toBe(prevCount + 1);
  });

  it("unregisters plugin components cleanly", () => {
    layoutManager.registerPlugin(mockManifest);
    expect(layoutManager.getMappings().length).toBe(2);

    layoutManager.unregisterPlugin("org.omni.test");
    expect(layoutManager.getMappings().length).toBe(0);
  });
});
