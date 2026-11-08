// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getChecklistSchema,
  handleChecklistAction,
  syncTasksToRelays,
  TASKS_NIP78_D_TAG
} from "../src/index.js";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null
  };
}

describe("@omni/plugin-checklist — Generic Task List", () => {
  beforeEach(() => {
    const memStorage = createMemoryStorage();
    (globalThis as any).localStorage = memStorage;
    if (typeof window !== "undefined") {
      (window as any).localStorage = memStorage;
    }
  });

  it("renders generic Task List title and items in widget view", () => {
    const schema: any = getChecklistSchema("widget");
    expect(schema.type).toBe("card");
    expect(schema.title).toBe("Task List");
    expect(schema.icon).toBe("check");

    const inputRow = schema.children[0];
    expect(inputRow.type).toBe("box");

    const list = schema.children[1];
    expect(list.type).toBe("list");
    expect(list.items.length).toBeGreaterThanOrEqual(1);
    expect(list.items[0].type).toBe("list-item");
  });

  it("renders Task List Settings in settings view", () => {
    const schema: any = getChecklistSchema("settings");
    expect(schema.type).toBe("card");
    expect(schema.title).toBe("Task List Settings");
    expect(schema.subtitle).toContain("Manage persistent tasks storage");
  });

  it("adds tasks via add-task action and create_task intent", () => {
    const updated1: any = handleChecklistAction(
      { name: "add-task" },
      { taskText: "Buy groceries" }
    );
    const list1 = updated1.children[1];
    expect(list1.items.some((i: any) => i.title === "Buy groceries")).toBe(true);

    const updated2: any = handleChecklistAction(
      { name: "create_task" },
      { title: "Fix bug in release" }
    );
    const list2 = updated2.children[1];
    expect(list2.items.some((i: any) => i.title === "Fix bug in release")).toBe(true);
  });

  it("crosses off tasks via toggle-task action", () => {
    // Add task
    handleChecklistAction({ name: "add-task" }, { taskText: "Test cross off" });
    const stored = JSON.parse(window.localStorage.getItem("tasks") || "[]");
    const item = stored.find((t: any) => t.text === "Test cross off");
    expect(item).toBeDefined();
    expect(item.done).toBe(false);

    // Toggle task
    const updated: any = handleChecklistAction(
      { name: "toggle-task", payload: { id: item.id } },
      { id: item.id, checked: true }
    );
    const list = updated.children[1];
    const toggledItem = list.items.find((i: any) => i.id === String(item.id));
    expect(toggledItem.checked).toBe(true);

    const saved = JSON.parse(window.localStorage.getItem("tasks") || "[]");
    const savedItem = saved.find((t: any) => t.id === item.id);
    expect(savedItem.done).toBe(true);
  });

  it("syncs to Nostr relays with kind 30078 and d-tag omni/tasks/v1", async () => {
    let signedEvent: any = null;
    (window as any).nostr = {
      signEvent: vi.fn(async (ev: any) => {
        signedEvent = { ...ev, id: "sig_tasks_123", sig: "s" };
        return signedEvent;
      })
    };

    syncTasksToRelays();
    await new Promise((r) => setTimeout(r, 10));

    expect((window as any).nostr.signEvent).toHaveBeenCalled();
    expect(signedEvent).toBeTruthy();
    expect(signedEvent.kind).toBe(30078);
    expect(signedEvent.tags).toContainEqual(["d", TASKS_NIP78_D_TAG]);
    expect(JSON.parse(signedEvent.content)).toBeInstanceOf(Array);
  });

  it("transparently uses window.nostr.doc when available", async () => {
    let docData: any = null;
    let updateCallback: ((data: any) => void) | null = null;
    const mockDoc = {
      data: [{ id: 99, text: "Remote task from doc", done: false }],
      set: vi.fn(async (data: any) => {
        docData = data;
        return { id: "doc_event_1", kind: 30078 };
      }),
      onUpdate: vi.fn((cb: any) => {
        updateCallback = cb;
        return () => {};
      })
    };

    (window as any).nostr = {
      doc: vi.fn(async (dTag: string, opts: any) => {
        expect(dTag).toBe(TASKS_NIP78_D_TAG);
        return mockDoc;
      })
    };

    const { initTasksRelaySync } = await import("../src/index.js");
    const onUpdateSpy = vi.fn();
    initTasksRelaySync(onUpdateSpy);

    await new Promise((r) => setTimeout(r, 20));

    expect((window as any).nostr.doc).toHaveBeenCalledWith(TASKS_NIP78_D_TAG, { encrypted: false });
    expect(onUpdateSpy).toHaveBeenCalled();

    // Trigger update from doc
    updateCallback?.([{ id: 100, text: "Live sync task", done: true }]);
    const currentSchema: any = getChecklistSchema("widget");
    expect(currentSchema.children[1].items.some((i: any) => i.title === "Live sync task")).toBe(true);

    // Add a task and verify doc.set is called
    handleChecklistAction({ name: "add-task" }, { taskText: "New task for doc" });
    expect(mockDoc.set).toHaveBeenCalled();
  });
});
