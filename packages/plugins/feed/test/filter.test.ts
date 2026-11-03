// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_FILTER_PATTERNS,
  STORAGE_KEY_FEED_FILTERS,
  loadFilterPatterns,
  saveFilterPatterns,
  compileFilterRegex,
  isContentFiltered,
  renderFilterSettings
} from "../src/index";

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
});
