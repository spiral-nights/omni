// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotesApp, sanitizeNoteHtml, NOTES_NIP78_D_PREFIX } from "../src/index.js";
import { NoteItem } from "../src/types.js";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null
  };
}

describe("@omni/plugin-notes — Private Encrypted Notes App", () => {
  beforeEach(() => {
    const memStorage = createMemoryStorage();
    (globalThis as any).localStorage = memStorage;
    if (typeof window !== "undefined") {
      (window as any).localStorage = memStorage;
    }
  });

  describe("HTML Sanitization", () => {
    it("preserves standard formatting tags", () => {
      const raw = "<p>Hello <b>bold</b> and <i>italic</i> with <h1>heading</h1></p>";
      const clean = sanitizeNoteHtml(raw);
      expect(clean).toContain("<b>bold</b>");
      expect(clean).toContain("<i>italic</i>");
      expect(clean).toContain("<h1>heading</h1>");
    });

    it("strips harmful script tags and on* attributes", () => {
      const malicious = '<p>Normal text</p><script>alert("hack")</script><b onclick="evil()">Click</b>';
      const clean = sanitizeNoteHtml(malicious);
      expect(clean).not.toContain("<script>");
      expect(clean).not.toContain("alert");
      expect(clean).not.toContain("onclick");
      expect(clean).toContain("Normal text");
    });

    it("strips javascript: URLs", () => {
      const link = '<a href="javascript:alert(1)">Click</a><a href="https://example.com">Safe</a>';
      const clean = sanitizeNoteHtml(link);
      expect(clean).not.toContain("javascript:");
      expect(clean).toContain("https://example.com");
    });
  });

  describe("NotesApp UI & State", () => {
    it("mounts into container and seeds initial note", () => {
      const root = document.createElement("div");
      document.body.appendChild(root);

      const app = new NotesApp(root);
      app.init();

      expect(root.querySelector(".omni-notes-brand-title")?.textContent).toBe("Notes");
      expect(root.querySelector("#btn-create-note")).toBeTruthy();
      expect(root.querySelector("#note-title-input")).toBeTruthy();
      expect(root.querySelector("#note-body-canvas")).toBeTruthy();

      const noteCards = root.querySelectorAll(".omni-note-card");
      expect(noteCards.length).toBeGreaterThanOrEqual(1);
    });

    it("creates a new note when clicking New button", () => {
      const root = document.createElement("div");
      document.body.appendChild(root);

      const app = new NotesApp(root);
      app.init();

      const initialCount = root.querySelectorAll(".omni-note-card").length;
      const btnNew = root.querySelector("#btn-create-note") as HTMLButtonElement;
      btnNew.click();

      const updatedCount = root.querySelectorAll(".omni-note-card").length;
      expect(updatedCount).toBe(initialCount + 1);

      const titleInput = root.querySelector("#note-title-input") as HTMLInputElement;
      expect(titleInput.value).toBe("");
    });

    it("updates note title and recalculates word count on input", () => {
      const root = document.createElement("div");
      document.body.appendChild(root);

      const app = new NotesApp(root);
      app.init();

      const titleInput = root.querySelector("#note-title-input") as HTMLInputElement;
      const bodyCanvas = root.querySelector("#note-body-canvas") as HTMLDivElement;
      const wordCount = root.querySelector("#label-word-count");

      titleInput.value = "Cryptography Thoughts";
      titleInput.dispatchEvent(new Event("input"));

      bodyCanvas.innerText = "One two three four five";
      bodyCanvas.dispatchEvent(new Event("input"));

      expect(wordCount?.textContent).toBe("5 words");
      const activeCard = root.querySelector(".omni-note-card.active .omni-card-title");
      expect(activeCard?.textContent).toBe("Cryptography Thoughts");
    });

    it("filters notes via search box", () => {
      const root = document.createElement("div");
      document.body.appendChild(root);

      const app = new NotesApp(root);
      app.init();

      const titleInput = root.querySelector("#note-title-input") as HTMLInputElement;
      titleInput.value = "Unique Search Target";
      titleInput.dispatchEvent(new Event("input"));

      const searchInput = root.querySelector("#input-search") as HTMLInputElement;
      searchInput.value = "Unique Search";
      searchInput.dispatchEvent(new Event("input"));

      const cards = root.querySelectorAll(".omni-note-card");
      expect(cards.length).toBe(1);
      expect(cards[0].querySelector(".omni-card-title")?.textContent).toBe("Unique Search Target");

      // Non-matching search
      searchInput.value = "NonExistentKeywordXYZ";
      searchInput.dispatchEvent(new Event("input"));
      expect(root.querySelectorAll(".omni-note-card").length).toBe(0);
      expect(root.querySelector("#notes-list")?.textContent).toContain("No notes found");
    });
  });

  describe("NIP-78 D-tag Namespace", () => {
    it("uses standard omni/notes/v1/ prefix", () => {
      expect(NOTES_NIP78_D_PREFIX).toBe("omni/notes/v1/");
    });
  });
});
