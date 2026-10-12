// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { RemoteDomHost } from "../src/remote-dom/remote-dom-host.js";

describe("RemoteDomHost Standard HTML Projection", () => {
  it("projects standard HTML elements (div, button, input) into host container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const onEvent = vi.fn();
    const host = new RemoteDomHost({
      container,
      componentId: "test-widget",
      onEvent
    });

    // Send Remote DOM mutation: Insert div with a button and input
    // Mutation 0: Insert child [0, parentId, serializedChild, index]
    host.mutate([
      [
        0,
        "~",
        {
          id: "node-1",
          type: 1,
          element: "div",
          attributes: { class: "widget-card" },
          children: [
            {
              id: "node-2",
              type: 1,
              element: "button",
              attributes: { class: "btn-action" },
              children: [
                {
                  id: "node-3",
                  type: 3,
                  data: "Click Me"
                }
              ]
            },
            {
              id: "node-4",
              type: 1,
              element: "input",
              attributes: { type: "text", placeholder: "Enter name..." },
              children: []
            }
          ]
        },
        0
      ]
    ]);

    // Verify DOM structure
    const widgetCard = container.querySelector(".widget-card");
    expect(widgetCard).not.toBeNull();
    expect(widgetCard?.tagName.toLowerCase()).toBe("div");

    const btn = widgetCard?.querySelector("button");
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe("Click Me");

    const input = widgetCard?.querySelector("input");
    expect(input).not.toBeNull();
    expect(input?.getAttribute("placeholder")).toBe("Enter name...");

    host.destroy();
  });

  it("intercepts click events on standard HTML buttons and routes back to sandbox callback", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const onEvent = vi.fn();
    const host = new RemoteDomHost({
      container,
      componentId: "checklist-widget",
      onEvent
    });

    // 1. Insert button
    host.mutate([
      [
        0,
        "~",
        {
          id: "btn-1",
          type: 1,
          element: "button",
          attributes: {},
          children: [{ id: "txt-1", type: 3, data: "Add Item" }]
        },
        0
      ]
    ]);

    // 2. Register click event listener on the button (Mutation 3 with type 3)
    host.mutate([
      [3, "btn-1", "click", true, 3]
    ]);

    const button = container.querySelector("button")!;
    expect(button).not.toBeNull();

    // Trigger click on host DOM element
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // onEvent should have been invoked with componentId, id, eventName
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      "checklist-widget",
      expect.objectContaining({
        id: "btn-1",
        eventName: "click"
      })
    );

    host.destroy();
  });

  it("DEFAULT_OMNI_RUNTIME executes and creates remote elements without TypeError", async () => {
    const { DEFAULT_OMNI_RUNTIME } = await import("../src/sandbox/default-runtime.js");
    
    // Create an iframe to execute DEFAULT_OMNI_RUNTIME in a fresh window context
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const win = iframe.contentWindow as any;
    
    // Execute runtime script
    win.eval(DEFAULT_OMNI_RUNTIME);

    expect(win.omni).toBeDefined();
    expect(typeof win.omni.registerComponent).toBe("function");

    // Create MessageChannels to simulate handshake
    const channelDom = new MessageChannel();
    const channelRpc = new MessageChannel();

    let renderInvoked = false;
    let createdInputType = "";

    // Register a component that creates elements, sets types, classes, attributes
    win.omni.registerComponent("test-comp", ({ root }: any) => {
      renderInvoked = true;
      const input = root.createElement("input");
      input.type = "text";
      input.placeholder = "Enter value";
      input.className = "test-input";
      root.appendChild(input);
      createdInputType = input.type;
    });

    // Send omni:init handshake via MessageEvent with explicit ports
    const initEvent = new MessageEvent("message", {
      data: { type: "omni:init", payload: { pluginId: "test.plugin" } },
      ports: [channelDom.port2, channelRpc.port2]
    });
    win.dispatchEvent(initEvent);

    // Give microtasks time to execute
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(renderInvoked).toBe(true);
    expect(createdInputType).toBe("text");
    expect(win.omni.nostr).toBeDefined();
    expect(typeof win.omni.nostr.subscribe).toBe("function");
    expect(typeof win.omni.nostr.publish).toBe("function");
    expect(typeof win.omni.nostr.getPublicKey).toBe("function");
    expect(typeof win.omni.nostr.signEvent).toBe("function");

    document.body.removeChild(iframe);
  });

  it("handles ROOT_ID ('~') property mutations directly on container without throwing", () => {
    const container = document.createElement("div");
    container.className = "host-slot";
    document.body.appendChild(container);

    const onEvent = vi.fn();
    const host = new RemoteDomHost({
      container,
      componentId: "feed-dock-icon",
      onEvent
    });

    // Send property mutation on ROOT_ID ("~") which previously caused:
    // Error: Remote property is not allowed: class (type 2)
    expect(() => {
      host.mutate([
        [3, "~", "class", "omni-component-feed-dock-icon custom-active", 2],
        [3, "~", "data-status", "ready", 2]
      ]);
    }).not.toThrow();

    // Verify container received the class and attribute
    expect(container.classList.contains("omni-component-feed-dock-icon")).toBe(true);
    expect(container.classList.contains("custom-active")).toBe(true);
    expect(container.getAttribute("data-status")).toBe("ready");

    host.destroy();
    document.body.removeChild(container);
  });

  it("handles detached element creation followed by appendChild without premature property mutations", async () => {
    const { DEFAULT_OMNI_RUNTIME } = await import("../src/sandbox/default-runtime.js");
    const container = document.createElement("div");
    document.body.appendChild(container);

    const host = new RemoteDomHost({
      container,
      componentId: "feed-dock-icon",
      onEvent: vi.fn()
    });

    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const win = iframe.contentWindow as any;
    win.eval(DEFAULT_OMNI_RUNTIME);

    const channelDom = new MessageChannel();
    const channelRpc = new MessageChannel();

    // Hook channelDom.port1 to host.mutate
    channelDom.port1.onmessage = (event) => {
      if (event.data?.type === "mutate") {
        host.mutate(event.data.records);
      }
    };

    // Register component creating detached tree with classes and attributes
    win.omni.registerComponent("feed-dock-icon", ({ root }: any) => {
      const btn = root.createElement("button");
      btn.className = "dock-item active";
      btn.title = "Timeline Feed";

      const iconWrapper = root.createElement("div");
      iconWrapper.className = "dock-icon-wrapper";

      const span = root.createElement("span");
      span.textContent = "Feed";

      btn.appendChild(iconWrapper);
      btn.appendChild(span);
      root.appendChild(btn);
    });

    const initEvent = new MessageEvent("message", {
      data: { type: "omni:init", payload: { pluginId: "org.omni.plugin.feed" } },
      ports: [channelDom.port2, channelRpc.port2]
    });
    win.dispatchEvent(initEvent);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify button and span projected into host container
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.classList.contains("dock-item")).toBe(true);
    expect(button?.classList.contains("active")).toBe(true);
    expect(button?.getAttribute("title")).toBe("Timeline Feed");
    expect(button?.textContent).toContain("Feed");

    host.destroy();
    document.body.removeChild(container);
    document.body.removeChild(iframe);
  });

  it("intercepts click events on elements with initial eventListeners in inserted tree (mutation 0)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const onEvent = vi.fn();
    const host = new RemoteDomHost({
      container,
      componentId: "timer-widget",
      onEvent
    });

    // Insert tree with nested button having initial eventListeners: { click: true }
    host.mutate([
      [
        0,
        "~",
        {
          id: "card-1",
          type: 1,
          element: "div",
          attributes: { class: "timer-card" },
          children: [
            {
              id: "btn-start",
              type: 1,
              element: "button",
              attributes: { class: "btn-start" },
              eventListeners: { click: true },
              children: [{ id: "txt-start", type: 3, data: "Start" }]
            }
          ]
        },
        0
      ]
    ]);

    const btnStart = container.querySelector(".btn-start") as HTMLButtonElement;
    expect(btnStart).not.toBeNull();

    // Trigger click on host button
    btnStart.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      "timer-widget",
      expect.objectContaining({
        id: "btn-start",
        eventName: "click"
      })
    );

    host.destroy();
    document.body.removeChild(container);
  });

  it("handles removeChild followed by insertChild in same mutation batch without preserving stale elements", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const host = new RemoteDomHost({
      container,
      componentId: "feed-test",
      onEvent: () => {}
    });

    // 1. Initial render: container has a list with a loading-state child at index 0
    host.mutate([
      [
        0,
        "~",
        {
          id: "list-1",
          type: 1,
          element: "div",
          attributes: { class: "notes-list" },
          children: [
            {
              id: "loading-1",
              type: 1,
              element: "div",
              attributes: { class: "loading-state" },
              children: [{ id: "txt-loading", type: 3, data: "Loading timeline notes..." }]
            }
          ]
        },
        0
      ]
    ]);

    expect(container.querySelector(".loading-state")).not.toBeNull();
    expect(container.textContent).toContain("Loading timeline notes...");

    // 2. Incoming note batch: removeChild (index 0) and insertChild (note card at index 0)
    host.mutate([
      [1, "list-1", 0], // removeChild at index 0 (loading-state)
      [
        0,
        "list-1",
        {
          id: "note-1",
          type: 1,
          element: "article",
          attributes: { class: "note-card" },
          children: [{ id: "txt-note", type: 3, data: "First Nostr note content!" }]
        },
        0
      ]
    ]);

    // Verify loading-state is completely removed and note-card is rendered
    expect(container.querySelector(".loading-state")).toBeNull();
    const noteCard = container.querySelector(".note-card");
    expect(noteCard).not.toBeNull();
    expect(noteCard?.textContent).toContain("First Nostr note content!");

    host.destroy();
    document.body.removeChild(container);
  });
});


