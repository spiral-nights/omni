// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_FILTER_PATTERNS,
  STORAGE_KEY_FEED_FILTERS,
  loadFilterPatterns,
  saveFilterPatterns,
  compileFilterRegex,
  isContentFiltered,
  renderFilterSettings,
  mountFeedSettings,
  isSettingsRoute
} from "../src/index";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const feedCode = readFileSync(
  join(__dirname, "../dist/index.js"),
  "utf8"
).replace(/^export /gm, "");

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  url: string;
  readyState = 0;
  onopen: any = null;
  onmessage: any = null;
  onerror: any = null;
  onclose: any = null;
  sent: any[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.(new Event("open"));
    }, 0);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
  }

  deliver(frame: any[]) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

function flush() {
  return new Promise((r) => setTimeout(r, 20));
}

function createMemoryStorage() {
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

describe("Feed Regex Content Filtering", () => {
  let memStorage: any;

  beforeEach(() => {
    memStorage = createMemoryStorage();
    (globalThis as any).localStorage = memStorage;
    if (typeof window !== "undefined") {
      (window as any).localStorage = memStorage;
    }
  });

  describe("Regex filter engine & compilation", () => {
    it("has the default JSON pattern", () => {
      expect(DEFAULT_FILTER_PATTERNS).toEqual(["^\\s*\\{[\\s\\S]*\\}\\s*$"]);
    });

    it("filters JSON messages by default (starting with { and ending with }, ignoring whitespace)", () => {
      const patterns = DEFAULT_FILTER_PATTERNS;

      expect(isContentFiltered('{"foo": "bar"}', patterns)).toBe(true);
      expect(isContentFiltered('  \n  { "key": 123 } \n ', patterns)).toBe(true);
      expect(isContentFiltered('{\n  "multiline": {\n    "nested": true\n  }\n}', patterns)).toBe(true);
      expect(isContentFiltered('{}', patterns)).toBe(true);
      expect(isContentFiltered('\t\r\n{ "type": "bot" }\t', patterns)).toBe(true);
    });

    it("does not filter standard non-JSON notes", () => {
      const patterns = DEFAULT_FILTER_PATTERNS;

      expect(isContentFiltered("Hello world!", patterns)).toBe(false);
      expect(isContentFiltered("Hello {world}", patterns)).toBe(false);
      expect(isContentFiltered("{world} hello", patterns)).toBe(false);
      expect(isContentFiltered("Note with { brackets } inside text", patterns)).toBe(false);
      expect(isContentFiltered("", patterns)).toBe(false);
      expect(isContentFiltered("Just an ordinary Nostr note", patterns)).toBe(false);
    });

    it("supports custom regex patterns with flags and words", () => {
      const patterns = ["\\b(crypto|casino)\\b", "/^bot:/i"];

      expect(isContentFiltered("Check out this new crypto asset", patterns)).toBe(true);
      expect(isContentFiltered("Visit our casino today", patterns)).toBe(true);
      expect(isContentFiltered("bot: daily weather update", patterns)).toBe(true);
      expect(isContentFiltered("BOT: system status", patterns)).toBe(true);
      expect(isContentFiltered("Regular note about cryptography", patterns)).toBe(false);
    });

    it("gracefully handles invalid regex syntax without crashing", () => {
      expect(compileFilterRegex("[unclosed")).toBeNull();
      expect(isContentFiltered("test text", ["[unclosed"])).toBe(false);
    });

    it("loads and saves patterns to localStorage", () => {
      expect(loadFilterPatterns()).toEqual(DEFAULT_FILTER_PATTERNS);

      const custom = ["^spam:", "\\d{5}"];
      saveFilterPatterns(custom);
      expect(loadFilterPatterns()).toEqual(custom);

      localStorage.setItem(STORAGE_KEY_FEED_FILTERS, "invalid json");
      expect(loadFilterPatterns()).toEqual(DEFAULT_FILTER_PATTERNS);
    });
  });

  describe("Settings UI DOM component", () => {
    it("renders active pattern list with default JSON pattern and badge", () => {
      const container = document.createElement("div");
      renderFilterSettings(container);

      expect(container.querySelector(".feed-filter-settings")).not.toBeNull();
      const codes = container.querySelectorAll(".feed-pattern-code");
      expect(codes.length).toBe(1);
      expect(codes[0].textContent).toBe(DEFAULT_FILTER_PATTERNS[0]);
      expect(container.querySelector(".pattern-badge-default")).not.toBeNull();
    });

    it("adds a new pattern when submitted through input and updates storage", () => {
      const container = document.createElement("div");
      let changedPatterns: string[] | null = null;
      renderFilterSettings(container, (patterns) => {
        changedPatterns = patterns;
      });

      const input = container.querySelector<HTMLInputElement>(".filter-pattern-input")!;
      const btnAdd = container.querySelector<HTMLButtonElement>(".btn-add-pattern")!;

      input.value = "\\bspam\\b";
      btnAdd.click();

      const codes = Array.from(container.querySelectorAll(".feed-pattern-code")).map((c) => c.textContent);
      expect(codes).toContain("\\bspam\\b");
      expect(loadFilterPatterns()).toContain("\\bspam\\b");
      expect(changedPatterns).toContain("\\bspam\\b");
    });

    it("validates regex syntax on add and displays error", () => {
      const container = document.createElement("div");
      renderFilterSettings(container);

      const input = container.querySelector<HTMLInputElement>(".filter-pattern-input")!;
      const btnAdd = container.querySelector<HTMLButtonElement>(".btn-add-pattern")!;
      const statusMsg = container.querySelector<HTMLElement>(".filter-status-message")!;

      input.value = "(unclosed";
      btnAdd.click();

      expect(statusMsg.textContent).toContain("Invalid regular expression syntax");
      expect(loadFilterPatterns().length).toBe(1);
    });

    it("removes a pattern and updates storage", () => {
      const container = document.createElement("div");
      renderFilterSettings(container);

      const btnRemove = container.querySelector<HTMLButtonElement>(".btn-remove-pattern")!;
      expect(btnRemove).not.toBeNull();
      btnRemove.click();

      expect(container.querySelectorAll(".feed-pattern-code").length).toBe(0);
      expect(container.querySelector(".empty-patterns")).not.toBeNull();
      expect(loadFilterPatterns()).toEqual([]);
    });

    it("resets to defaults when reset button is clicked", () => {
      const container = document.createElement("div");
      saveFilterPatterns(["custom-pattern"]);
      renderFilterSettings(container);

      expect(container.querySelectorAll(".feed-pattern-code").length).toBe(1);
      expect(container.querySelector(".feed-pattern-code")!.textContent).toBe("custom-pattern");

      const btnReset = container.querySelector<HTMLButtonElement>(".btn-reset-patterns")!;
      btnReset.click();

      const codes = Array.from(container.querySelectorAll(".feed-pattern-code")).map((c) => c.textContent);
      expect(codes).toEqual(DEFAULT_FILTER_PATTERNS);
      expect(loadFilterPatterns()).toEqual(DEFAULT_FILTER_PATTERNS);
    });
  });

  describe("Feed timeline integration with regex filter", () => {
    let document: Document;

    beforeEach(() => {
      document = window.document;
      document.body.innerHTML = "";
      FakeWebSocket.instances = [];
      (window as any).WebSocket = FakeWebSocket;
      (window as any).nostr = { getPublicKey: async () => "a".repeat(64) };
      (window as any).omni = { intents: { dispatch: vi.fn(async () => ({})) } };
      (window as any).location.search = "";
      (window as any).__OMNI_ROUTE__ = "";
    });

    const feed = () => document.body.querySelector<HTMLElement>(".feed-container")!;

    it("filters out JSON events while rendering non-JSON events", async () => {
      new Function(feedCode)();
      await flush();

      const ws = FakeWebSocket.instances[0];
      // Deliver non-JSON event
      ws.deliver(["EVENT", "feed-initial", {
        id: "note-regular", pubkey: "b".repeat(64), kind: 1, created_at: 1700000000,
        content: "Hello Nostr universe!", tags: []
      }]);

      // Deliver raw JSON event (e.g. automated bot payload)
      ws.deliver(["EVENT", "feed-initial", {
        id: "note-json-bot", pubkey: "c".repeat(64), kind: 1, created_at: 1700000001,
        content: '{"action": "ping", "uptime": 3600}', tags: []
      }]);

      // Deliver multi-line JSON event
      ws.deliver(["EVENT", "feed-initial", {
        id: "note-json-multiline", pubkey: "d".repeat(64), kind: 1, created_at: 1700000002,
        content: '  \n{\n  "version": "1.0",\n  "status": "ok"\n}  \n', tags: []
      }]);

      const cards = feed().querySelectorAll(".note-card");
      expect(cards.length).toBe(1);
      expect(cards[0].getAttribute("data-note-id")).toBe("note-regular");
    });

    it("navigates to settings page from header and back", async () => {
      new Function(feedCode)();
      await flush();

      const btnSettings = feed().querySelector<HTMLButtonElement>(".btn-settings-feed")!;
      expect(btnSettings).not.toBeNull();
      btnSettings.click();

      const settingsPage = feed().querySelector<HTMLElement>(".feed-settings-page")!;
      expect(settingsPage.style.display).not.toBe("none");
      expect(feed().querySelector<HTMLElement>(".notes-list")!.style.display).toBe("none");

      const btnBack = feed().querySelector<HTMLButtonElement>(".btn-settings-back")!;
      btnBack.click();

      expect(settingsPage.style.display).toBe("none");
      expect(feed().querySelector<HTMLElement>(".notes-list")!.style.display).toBe("");
    });

    it("mounts standalone settings view when route has ?view=settings and does not mount the feed", async () => {
      (window as any).__OMNI_ROUTE__ = "?view=settings";
      new Function(feedCode)();
      await flush();

      const standalone = document.body.querySelector(".feed-standalone-settings");
      expect(standalone).not.toBeNull();
      expect(standalone!.querySelector(".feed-filter-settings")).not.toBeNull();
      // Verify main feed is NOT mounted in the settings view
      expect(document.body.querySelector(".feed-container")).toBeNull();
      expect(document.body.querySelector(".feed-composer")).toBeNull();
    });

    it("mounts standalone settings view when __OMNI_VIEW__ is settings", async () => {
      (window as any).__OMNI_ROUTE__ = "";
      (window as any).__OMNI_VIEW__ = "settings";
      new Function(feedCode)();
      await flush();

      const standalone = document.body.querySelector(".feed-standalone-settings");
      expect(standalone).not.toBeNull();
      expect(standalone!.querySelector(".feed-filter-settings")).not.toBeNull();
      expect(document.body.querySelector(".feed-container")).toBeNull();
    });
  });
});
