// @vitest-environment happy-dom
//
// Phase 7.11 dual-run conformance harness for the Gleam guest bridge.
//
// The legacy TypeScript host still injects `omni-runtime.js`; these tests pin
// the *external contract* every shim must honour so the Gleam bridge
// (`gleam/bridge`) can be swapped in without changing plugin behaviour.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { install as installStorage } from "../../gleam/bridge/src/omni/bridge/storage_shim.ffi.mjs";
import { install as installLinks } from "../../gleam/bridge/src/omni/bridge/links_shim.ffi.mjs";
import { install as installShare } from "../../gleam/bridge/src/omni/bridge/share_shim.ffi.mjs";
import { install_actions } from "../../gleam/bridge/src/omni/bridge/schema_bridge.ffi.mjs";
import { install as installNostr, route_notification as routeNostr } from "../../gleam/bridge/src/omni/bridge/nostr_shim.ffi.mjs";
import {
  install as installWebSocket,
  route_notification as routeSocket,
} from "../../gleam/bridge/src/omni/bridge/websocket_shim.ffi.mjs";

describe("bridge parity: storage partition", () => {
  it("isolates plugin keys behind a per-plugin prefix", () => {
    installStorage("example.app.alpha");
    window.localStorage.setItem("token", "alpha-secret");
    expect(window.localStorage.getItem("token")).toBe("alpha-secret");

    installStorage("example.app.beta");
    expect(window.localStorage.getItem("token")).toBeNull();

    window.localStorage.setItem("token", "beta-secret");
    installStorage("example.app.alpha");
    expect(window.localStorage.getItem("token")).toBe("alpha-secret");
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.key(0)).toBe("token");
  });
});

describe("bridge parity: protocol links", () => {
  it("intercepts protocol anchors and forwards the raw href", () => {
    const post = vi.fn();
    installLinks(post);

    const anchor = document.createElement("a");
    anchor.href = "nostr:nevent1abc";
    document.body.appendChild(anchor);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(post).toHaveBeenCalledWith("nostr:nevent1abc");

    document.body.removeChild(anchor);
  });

  it("leaves ordinary web links alone", () => {
    const post = vi.fn();
    installLinks(post);
    const anchor = document.createElement("a");
    anchor.href = "https://example.com/story";
    document.body.appendChild(anchor);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
    expect(post).not.toHaveBeenCalled();
    document.body.removeChild(anchor);
  });
});

describe("bridge parity: share", () => {
  it("routes navigator.share payloads to the shell", async () => {
    const post = vi.fn();
    installShare(post);
    await navigator.share({ title: "Hi", text: "Hello nostr", url: "https://x.test" });

    expect(post).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(post.mock.calls[0][0]);
    expect(payload).toMatchObject({
      type: "omni:share",
      title: "Hi",
      text: "Hello nostr",
      url: "https://x.test",
    });
  });
});

describe("bridge parity: schema actions", () => {
  it("delivers omni:action messages to the guest handler", () => {
    const onAction = vi.fn();
    install_actions(onAction);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "omni:action", action: { name: "create_note" } },
      }),
    );

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(JSON.parse(onAction.mock.calls[0][0])).toMatchObject({
      type: "omni:action",
    });
  });
});

describe("bridge parity: window.nostr", () => {
  it("forwards standard NIP-07 calls over host RPC", async () => {
    const rpc = vi.fn((method: string) => ({ method }));
    installNostr(rpc);

    await window.nostr.getPublicKey();
    expect(rpc).toHaveBeenCalledWith("nostr.getPublicKey", expect.anything());

    await window.nostr.signEvent({ kind: 1, content: "hey" });
    expect(rpc).toHaveBeenCalledWith("nostr.signEvent", expect.anything());

    const sub = window.nostr.subscribe([{ kinds: [1] }], () => {}, () => {});
    expect(rpc).toHaveBeenCalledWith("nostr.subscribe", expect.anything());

    routeNostr(
      JSON.stringify({
        method: "nostr.stream.event",
        params: { subscriptionId: sub.id, event: { id: "abc" } },
      }),
    );
    sub.unsubscribe();
  });
});

describe("bridge parity: virtual WebSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("maps relay frames to host RPC and relays stream notifications", async () => {
    const rpc = vi.fn();
    const handleFrame = vi.fn(() => '["OK","evt",true,""]');
    installWebSocket(rpc, handleFrame);

    const socket = new window.WebSocket("wss://relay.damus.io");
    await Promise.resolve();
    vi.runAllTimers();

    const received: string[] = [];
    socket.onmessage = (event: MessageEvent) => received.push(String(event.data));

    socket.send('["REQ","sub1",{"kinds":[1]}]');
    expect(handleFrame).toHaveBeenCalledWith(
      '["REQ","sub1",{"kinds":[1]}]',
      false,
    );

    socket.send('["EVENT",{"id":"e1"}]');
    expect(received).toContain('["OK","evt",true,""]');

    routeSocket(
      JSON.stringify({
        method: "nostr.stream.event",
        params: { subscriptionId: "sub1", event: { id: "e1" } },
      }),
    );
    expect(received).toContain('["EVENT","sub1",{"id":"e1"}]');

    routeSocket(
      JSON.stringify({
        method: "nostr.stream.eose",
        params: { subscriptionId: "sub1" },
      }),
    );
    expect(received).toContain('["EOSE","sub1"]');

    socket.close();
  });
});
