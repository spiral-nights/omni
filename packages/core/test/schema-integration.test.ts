// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import omniRuntimeScript from "../src/sandbox/omni-runtime.js?raw";
import { OmniKernel } from "../src/kernel/omni-kernel.js";
import { OmniManifest } from "@omni/types";

describe("Live Schema-Driven UI Integration", () => {
  let root: HTMLElement;
  let kernel: OmniKernel;

  beforeEach(async () => {
    root = document.createElement("div");
    document.body.appendChild(root);

    kernel = new OmniKernel({
      runtimeScript: omniRuntimeScript
    });
    await kernel.boot();
  });

  it("renders <omni-card>, <omni-input>, <omni-button>, and <omni-list> into the host slot container", async () => {
    const slotContainers = new Map<string, Element>();
    const widgetSlot = document.createElement("div");
    widgetSlot.className = "omni-slot-sidebar";
    root.appendChild(widgetSlot);
    slotContainers.set("sidebar", widgetSlot);

    const pluginCode = `
      var myTasks = [
        { id: 1, text: "Buy groceries", done: false },
        { id: 2, text: "Send note", done: true }
      ];

      function render() {
        var schema = {
          type: "card",
          title: "My Daily Tasks",
          icon: "check",
          children: [
            {
              type: "box",
              direction: "row",
              gap: "sm",
              children: [
                { type: "input", name: "newTask", placeholder: "New task..." },
                { type: "button", label: "Add", action: { name: "add-task" }, size: "sm" }
              ]
            },
            {
              type: "list",
              items: myTasks.map(function(t) {
                return {
                  type: "list-item",
                  id: String(t.id),
                  title: t.text,
                  checked: t.done,
                  onCheckAction: { name: "toggle", payload: { id: t.id } }
                };
              })
            }
          ]
        };
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "omni:schema", schema: schema, componentId: "widget" }, "*");
        } else {
          window.postMessage({ type: "omni:schema", schema: schema, componentId: "widget" }, "*");
        }
      }

      window.addEventListener("message", function(event) {
        if (event.data && (event.data.type === "omni:action" || event.data.type === "action")) {
          var action = event.data.action;
          var payload = event.data.payload;
          if (action && action.name === "add-task" && payload && payload.newTask) {
            myTasks.push({ id: Date.now(), text: payload.newTask, done: false });
            render();
          }
        }
      });

      render();
    `;

    const manifest: OmniManifest = {
      id: "org.test.checklist",
      name: "Checklist",
      version: "1.0.0",
      components: [
        {
          id: "widget",
          type: "sidebar",
          title: "Checklist",
          slot: "sidebar"
        }
      ]
    };

    const sandbox = await kernel.registerPlugin(manifest, pluginCode, slotContainers);
    expect(sandbox).toBeDefined();

    // Send schema from guest port2 to host port1 (simulating postMessage schema)
    (sandbox as any).channel1.port2.postMessage({
      type: "schema",
      componentId: "widget",
      schema: {
        type: "card",
        title: "My Daily Tasks",
        icon: "check",
        children: [
          {
            type: "box",
            direction: "row",
            gap: "sm",
            children: [
              { type: "input", name: "newTask", placeholder: "New task..." },
              { type: "button", label: "Add", action: { name: "add-task" }, size: "sm" }
            ]
          },
          {
            type: "list",
            items: [
              {
                type: "list-item",
                id: "1",
                title: "Buy groceries",
                checked: false,
                onCheckAction: { name: "toggle", payload: { id: 1 } }
              },
              {
                type: "list-item",
                id: "2",
                title: "Send note",
                checked: true,
                onCheckAction: { name: "toggle", payload: { id: 2 } }
              }
            ]
          }
        ]
      }
    });

    // Give microtasks time to deliver schema to host SchemaRenderer
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Verify <omni-card> is rendered in the host slot
    const omniCard = widgetSlot.querySelector("omni-card");
    expect(omniCard).not.toBeNull();

    const titleEl = omniCard?.querySelector(".omni-card-title");
    expect(titleEl?.textContent).toBe("My Daily Tasks");

    const omniInput = omniCard?.querySelector("omni-input");
    expect(omniInput).not.toBeNull();

    const omniButton = omniCard?.querySelector("omni-button");
    expect(omniButton).not.toBeNull();

    const omniList = omniCard?.querySelector("omni-list");
    expect(omniList).not.toBeNull();

    const listItems = omniList?.querySelectorAll("omni-list-item");
    expect(listItems?.length).toBe(2);
    expect(listItems?.[0].querySelector(".omni-list-item-title")?.textContent).toBe("Buy groceries");

    // Test Interactivity: listen on guest port2 for incoming actions from host
    const actionPromise = new Promise<any>((resolve) => {
      (sandbox as any).channel1.port2.onmessage = (e: MessageEvent) => {
        if (e.data?.type === "action") {
          resolve(e.data);
        }
      };
    });

    // Enter a new task into <omni-input>
    const inputNative = omniInput?.querySelector("input") as HTMLInputElement;
    expect(inputNative).not.toBeNull();
    inputNative.value = "Schedule sprint review";

    // Click the <omni-button>
    const btnNative = omniButton?.querySelector("button") as HTMLButtonElement;
    expect(btnNative).not.toBeNull();
    btnNative.click();

    // Verify action was dispatched back to guest port with form values
    const actionMsg = await actionPromise;
    expect(actionMsg.type).toBe("action");
    expect(actionMsg.action.name).toBe("add-task");
    expect(actionMsg.payload.newTask).toBe("Schedule sprint review");

    sandbox.destroy();
  });

  it("validates that canonical omni-ui.schema.json specifies all 24 UI primitives", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const schemaPath = path.resolve(__dirname, "../../types/schema/omni-ui.schema.json");
    expect(fs.existsSync(schemaPath)).toBe(true);

    const schemaRaw = fs.readFileSync(schemaPath, "utf-8");
    const schemaJson = JSON.parse(schemaRaw);

    expect(schemaJson.$id).toBe("https://omni.org/schemas/v1/omni-ui.schema.json");
    expect(schemaJson.$defs).toBeDefined();

    // Verify all 24 primitive elements are declared in $defs
    const expectedPrimitives = [
      "OmniBoxPrimitive",
      "OmniCardPrimitive",
      "OmniDividerPrimitive",
      "OmniSpacerPrimitive",
      "OmniTextPrimitive",
      "OmniBadgePrimitive",
      "OmniMetricPrimitive",
      "OmniIconPrimitive",
      "OmniAvatarPrimitive",
      "OmniButtonPrimitive",
      "OmniIconButtonPrimitive",
      "OmniInputPrimitive",
      "OmniTextareaPrimitive",
      "OmniTogglePrimitive",
      "OmniSelectPrimitive",
      "OmniTabsPrimitive",
      "OmniStatusIndicatorPrimitive",
      "OmniCodeBlockPrimitive",
      "OmniProgressPrimitive",
      "OmniBannerPrimitive",
      "OmniListPrimitive",
      "OmniListItemPrimitive",
      "OmniEmptyStatePrimitive",
      "OmniVirtualListPrimitive"
    ];

    for (const prim of expectedPrimitives) {
      expect(schemaJson.$defs[prim]).toBeDefined();
    }
  });
});
