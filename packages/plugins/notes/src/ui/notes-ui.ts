import { NoteItem, NotesState } from "../types.js";
import { sanitizeNoteHtml } from "../editor/sanitizer.js";
import { initNotesRelaySync, syncNoteToRelays } from "../net/notes-sync.js";

const STORAGE_KEY = "omni_notes_app_state_v1";

export class NotesApp {
  private container: HTMLElement;
  private state: NotesState = {
    notes: [],
    activeNoteId: null,
    searchQuery: "",
    syncStatus: "saved",
    myPubkey: null,
    isMobileView: false,
    mobileScreen: "list"
  };

  private autoSaveTimeout: any = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public init(): void {
    this.loadLocalState();
    this.checkViewport();
    this.renderSkeleton();
    this.attachEventListeners();

    // Start background sync with Omni local event store & relay pool
    initNotesRelaySync(
      (remoteNote) => this.handleRemoteNote(remoteNote),
      (status) => this.updateSyncStatus(status)
    );

    // Initial render
    this.renderNotesList();
    this.renderEditor();
  }

  private checkViewport(): void {
    if (typeof window !== "undefined") {
      this.state.isMobileView = window.innerWidth <= 720;
    }
  }

  private loadLocalState(): void {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.notes)) {
            this.state.notes = parsed.notes.filter((n: NoteItem) => !n.deleted);
          }
          if (parsed.activeNoteId) {
            this.state.activeNoteId = parsed.activeNoteId;
          }
        }
      }
    } catch (_) {}

    // Seed initial welcome note if notebook is empty
    if (this.state.notes.length === 0) {
      const welcomeNote: NoteItem = {
        id: "note_" + Date.now().toString(36),
        title: "Welcome to Notes",
        html: "<p>A private, local-first personal notebook for your thoughts.</p><ul><li><b>End-to-End Encrypted</b>: Only your key can decrypt your notes.</li><li><b>Multi-Device Sync</b>: Changes sync seamlessly to your other devices.</li><li><b>Zero Distractions</b>: Clean typography, distraction-free writing, and offline access.</li></ul><p>Start editing this note or tap <i>New</i> to create another.</p>",
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.state.notes.push(welcomeNote);
      this.state.activeNoteId = welcomeNote.id;
      this.saveLocalState();
    } else if (!this.state.activeNoteId && this.state.notes.length > 0) {
      this.state.activeNoteId = this.state.notes[0].id;
    }
  }

  private saveLocalState(): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            notes: this.state.notes,
            activeNoteId: this.state.activeNoteId
          })
        );
      }
    } catch (_) {}
  }

  private handleRemoteNote(remoteNote: NoteItem): void {
    const existingIdx = this.state.notes.findIndex((n) => n.id === remoteNote.id);

    if (remoteNote.deleted) {
      if (existingIdx !== -1) {
        this.state.notes.splice(existingIdx, 1);
        if (this.state.activeNoteId === remoteNote.id) {
          this.state.activeNoteId = this.state.notes[0]?.id || null;
          if (this.state.isMobileView) {
            this.state.mobileScreen = "list";
          }
        }
        this.saveLocalState();
        this.renderNotesList();
        this.renderEditor();
      }
      return;
    }

    if (existingIdx === -1) {
      this.state.notes.unshift(remoteNote);
      this.saveLocalState();
      this.renderNotesList();
    } else {
      const local = this.state.notes[existingIdx];
      if (remoteNote.updatedAt > local.updatedAt) {
        this.state.notes[existingIdx] = remoteNote;
        this.saveLocalState();
        this.renderNotesList();
        if (this.state.activeNoteId === remoteNote.id) {
          this.renderEditor();
        }
      }
    }
  }

  private renderSkeleton(): void {
    this.container.innerHTML = `
      <style>
        .omni-notes-root {
          --n-bg-canvas: var(--omni-bg-canvas, #141312);
          --n-bg-surface: var(--omni-bg-surface, #191816);
          --n-bg-elevated: var(--omni-bg-elevated, #22201d);
          --n-bg-subtle: var(--omni-bg-subtle, #2a2825);
          --n-text-primary: var(--omni-text-primary, #ede8df);
          --n-text-secondary: var(--omni-text-secondary, #9e988f);
          --n-text-muted: var(--omni-text-muted, #6b665f);
          --n-border-subtle: var(--omni-border-subtle, #262421);
          --n-border-strong: var(--omni-border-strong, #383530);
          --n-accent: var(--omni-accent-primary, #d4a373);
          --n-accent-hover: var(--omni-accent-hover, #e0b487);
          --n-accent-contrast: var(--omni-accent-contrast, #141312);
          --n-radius-sm: var(--omni-radius-sm, 6px);
          --n-radius-md: var(--omni-radius-md, 10px);
          --n-font-sans: var(--omni-font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
          --n-font-serif: var(--omni-font-serif, "Newsreader", Georgia, serif);
          --n-font-mono: var(--omni-font-mono, ui-monospace, Menlo, Monaco, monospace);

          display: flex;
          width: 100%;
          height: 100%;
          min-height: 100vh;
          background: var(--n-bg-canvas);
          color: var(--n-text-primary);
          font-family: var(--n-font-sans);
          overflow: hidden;
          position: relative;
          box-sizing: border-box;
        }

        /* Desktop Layout */
        .omni-notes-sidebar {
          width: 320px;
          min-width: 260px;
          background: var(--n-bg-surface);
          border-right: 1px solid var(--n-border-subtle);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
          z-index: 1;
        }

        .omni-notes-sidebar-header {
          padding: 16px 18px;
          border-bottom: 1px solid var(--n-border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .omni-notes-brand-title {
          font-family: var(--n-font-serif);
          font-size: 1.35rem;
          font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--n-text-primary);
          margin: 0;
        }

        .omni-btn-new-note {
          background: var(--n-accent);
          color: var(--n-accent-contrast);
          border: none;
          padding: 6px 14px;
          border-radius: var(--n-radius-sm);
          font-size: 0.84rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .omni-btn-new-note:hover {
          background: var(--n-accent-hover);
        }
        .omni-btn-new-note:active {
          transform: scale(0.97);
        }

        .omni-notes-search-box {
          padding: 10px 16px;
          border-bottom: 1px solid var(--n-border-subtle);
        }

        .omni-notes-search-input {
          width: 100%;
          background: var(--n-bg-elevated);
          border: 1px solid var(--n-border-subtle);
          border-radius: var(--n-radius-sm);
          padding: 8px 12px;
          color: var(--n-text-primary);
          font-size: 0.86rem;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s ease;
        }
        .omni-notes-search-input:focus {
          border-color: var(--n-accent);
        }

        .omni-notes-list {
          flex: 1;
          overflow-y: auto;
          list-style: none;
          padding: 8px;
          margin: 0;
        }

        .omni-note-card {
          padding: 12px 14px;
          border-radius: var(--n-radius-md);
          cursor: pointer;
          margin-bottom: 4px;
          border: 1px solid transparent;
          transition: all 0.15s ease;
          position: relative;
        }
        .omni-note-card:hover {
          background: var(--n-bg-elevated);
        }
        .omni-note-card.active {
          background: var(--n-bg-elevated);
          border-color: var(--n-border-strong);
        }
        .omni-note-card.active::before {
          content: "";
          position: absolute;
          left: 0;
          top: 10px;
          bottom: 10px;
          width: 3px;
          background: var(--n-accent);
          border-radius: 0 2px 2px 0;
        }

        .omni-card-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--n-text-primary);
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .omni-card-snippet {
          font-size: 0.8rem;
          color: var(--n-text-secondary);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin-bottom: 6px;
        }

        .omni-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.72rem;
          color: var(--n-text-muted);
        }

        /* Main Editor */
        .omni-notes-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--n-bg-canvas);
          overflow: hidden;
          position: relative;
        }

        .omni-editor-toolbar {
          padding: 8px 20px;
          background: var(--n-bg-surface);
          border-bottom: 1px solid var(--n-border-subtle);
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          min-height: 48px;
          box-sizing: border-box;
        }

        .omni-tool-btn {
          background: transparent;
          border: 1px solid transparent;
          color: var(--n-text-secondary);
          width: 32px;
          height: 32px;
          border-radius: var(--n-radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 0.88rem;
          font-weight: 600;
          transition: all 0.12s ease;
        }
        .omni-tool-btn:hover {
          background: var(--n-bg-elevated);
          color: var(--n-text-primary);
        }
        .omni-tool-btn:active {
          background: var(--n-bg-subtle);
          color: var(--n-accent);
        }

        .omni-tool-divider {
          width: 1px;
          height: 20px;
          background: var(--n-border-subtle);
          margin: 0 4px;
        }

        .omni-editor-status-bar {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 14px;
          font-size: 0.76rem;
          color: var(--n-text-muted);
        }

        .omni-sync-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .omni-sync-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #288755;
          transition: background 0.2s ease;
        }
        .omni-sync-dot.saving {
          background: var(--n-accent);
          animation: omni-pulse 0.8s infinite alternate;
        }
        .omni-sync-dot.offline {
          background: var(--n-text-muted);
        }

        @keyframes omni-pulse {
          from { opacity: 0.3; }
          to { opacity: 1; }
        }

        .omni-btn-delete-note {
          background: transparent;
          border: none;
          color: #c24965;
          cursor: pointer;
          font-size: 0.8rem;
          padding: 6px 10px;
          border-radius: var(--n-radius-sm);
          transition: background 0.12s;
        }
        .omni-btn-delete-note:hover {
          background: rgba(194, 73, 101, 0.12);
        }

        .omni-mobile-back-btn {
          display: none;
          background: transparent;
          border: none;
          color: var(--n-accent);
          font-size: 0.95rem;
          font-weight: 500;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          padding: 6px 4px;
          border-radius: var(--n-radius-sm);
        }

        .omni-editor-scroll-area {
          flex: 1;
          overflow-y: auto;
          padding: 36px 48px;
          display: flex;
          justify-content: center;
          box-sizing: border-box;
        }

        .omni-editor-article {
          width: 100%;
          max-width: 760px;
          display: flex;
          flex-direction: column;
        }

        .omni-note-title-input {
          font-family: var(--n-font-serif);
          font-size: 2.1rem;
          font-weight: 600;
          background: transparent;
          border: none;
          color: var(--n-text-primary);
          outline: none;
          margin-bottom: 24px;
          width: 100%;
          letter-spacing: -0.02em;
          box-sizing: border-box;
        }
        .omni-note-title-input::placeholder {
          color: var(--n-text-muted);
        }

        .omni-note-body-canvas {
          flex: 1;
          outline: none;
          font-size: 1.06rem;
          line-height: 1.75;
          color: var(--n-text-primary);
          min-height: 350px;
          box-sizing: border-box;
        }
        .omni-note-body-canvas[contenteditable]:empty::before {
          content: "Start writing...";
          color: var(--n-text-muted);
          cursor: text;
        }

        .omni-note-body-canvas h1 { font-family: var(--n-font-serif); font-size: 1.85rem; margin: 24px 0 12px; }
        .omni-note-body-canvas h2 { font-family: var(--n-font-serif); font-size: 1.45rem; margin: 20px 0 10px; }
        .omni-note-body-canvas h3 { font-size: 1.2rem; margin: 16px 0 8px; }
        .omni-note-body-canvas p { margin-bottom: 14px; }
        .omni-note-body-canvas ul, .omni-note-body-canvas ol { padding-left: 24px; margin-bottom: 14px; }
        .omni-note-body-canvas li { margin-bottom: 4px; }
        .omni-note-body-canvas blockquote {
          border-left: 3px solid var(--n-accent);
          padding-left: 16px;
          margin: 16px 0;
          color: var(--n-text-secondary);
          font-style: italic;
        }
        .omni-note-body-canvas pre {
          background: var(--n-bg-surface);
          border: 1px solid var(--n-border-subtle);
          border-radius: var(--n-radius-sm);
          padding: 12px 16px;
          font-family: var(--n-font-mono);
          font-size: 0.9rem;
          overflow-x: auto;
          margin-bottom: 14px;
        }

        /* Mobile Responsive View (Deck Screen Slide) */
        @media (max-width: 720px) {
          .omni-notes-sidebar {
            width: 100% !important;
            height: 100% !important;
            position: absolute !important;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-right: none !important;
            transform: translateX(0%);
            z-index: 1;
            opacity: 1;
            pointer-events: auto;
            transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
          }

          .omni-notes-main {
            width: 100% !important;
            height: 100% !important;
            position: absolute !important;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            transform: translateX(100%);
            z-index: 2;
            background: var(--n-bg-canvas);
            pointer-events: none;
            transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
          }

          .omni-notes-root.showing-editor .omni-notes-sidebar {
            transform: translateX(-100%);
            opacity: 0;
            pointer-events: none;
          }

          .omni-notes-root.showing-editor .omni-notes-main {
            transform: translateX(0%);
            pointer-events: auto;
          }

          .omni-mobile-back-btn {
            display: flex !important;
          }

          .omni-editor-scroll-area {
            padding: 20px 20px 80px;
          }

          .omni-note-title-input {
            font-size: 1.7rem;
            margin-bottom: 16px;
          }
        }
      </style>

      <div class="omni-notes-root ${this.state.isMobileView ? "mobile-mode" : ""}" id="omni-notes-root">
        <!-- Sidebar: Notes List & Search -->
        <aside class="omni-notes-sidebar" id="notes-sidebar">
          <div class="omni-notes-sidebar-header">
            <h1 class="omni-notes-brand-title">Notes</h1>
            <button id="btn-create-note" class="omni-btn-new-note" title="Create New Note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>New</span>
            </button>
          </div>

          <div class="omni-notes-search-box">
            <input type="text" id="input-search" class="omni-notes-search-input" placeholder="Search notes..." autocomplete="off" />
          </div>

          <ul id="notes-list" class="omni-notes-list"></ul>
        </aside>

        <!-- Main Content Editor -->
        <main class="omni-notes-main" id="notes-main">
          <header class="omni-editor-toolbar">
            <button id="btn-mobile-back" class="omni-mobile-back-btn" title="Back to Notes">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              <span>Notes</span>
            </button>

            <button class="omni-tool-btn" data-command="bold" title="Bold (Ctrl+B)"><b>B</b></button>
            <button class="omni-tool-btn" data-command="italic" title="Italic (Ctrl+I)"><i>I</i></button>
            <button class="omni-tool-btn" data-command="underline" title="Underline (Ctrl+U)"><u>U</u></button>
            <button class="omni-tool-btn" data-command="strikeThrough" title="Strikethrough"><s>S</s></button>
            
            <div class="omni-tool-divider"></div>

            <button class="omni-tool-btn" data-command="formatBlock" data-value="H1" title="Heading 1">H1</button>
            <button class="omni-tool-btn" data-command="formatBlock" data-value="H2" title="Heading 2">H2</button>
            <button class="omni-tool-btn" data-command="formatBlock" data-value="P" title="Normal Text">¶</button>

            <div class="omni-tool-divider"></div>

            <button class="omni-tool-btn" data-command="insertUnorderedList" title="Bullet List">•</button>
            <button class="omni-tool-btn" data-command="insertOrderedList" title="Numbered List">1.</button>
            <button class="omni-tool-btn" data-command="formatBlock" data-value="BLOCKQUOTE" title="Quote">”</button>
            <button class="omni-tool-btn" data-command="formatBlock" data-value="PRE" title="Code Block">&lt;&gt;</button>

            <div class="omni-editor-status-bar">
              <span id="label-word-count">0 words</span>
              <div class="omni-sync-indicator">
                <div id="sync-dot" class="omni-sync-dot"></div>
                <span id="sync-label">Saved</span>
              </div>
              <button id="btn-delete-note" class="omni-btn-delete-note" title="Delete note">Delete</button>
            </div>
          </header>

          <div class="omni-editor-scroll-area">
            <article class="omni-editor-article">
              <input type="text" id="note-title-input" class="omni-note-title-input" placeholder="Untitled Note" />
              <div id="note-body-canvas" class="omni-note-body-canvas" contenteditable="true" spellcheck="true"></div>
            </article>
          </div>
        </main>
      </div>
    `;
  }

  private attachEventListeners(): void {
    const btnNew = this.container.querySelector("#btn-create-note") as HTMLButtonElement;
    const btnDelete = this.container.querySelector("#btn-delete-note") as HTMLButtonElement;
    const btnMobileBack = this.container.querySelector("#btn-mobile-back") as HTMLButtonElement;
    const searchInput = this.container.querySelector("#input-search") as HTMLInputElement;
    const titleInput = this.container.querySelector("#note-title-input") as HTMLInputElement;
    const bodyCanvas = this.container.querySelector("#note-body-canvas") as HTMLDivElement;

    btnNew?.addEventListener("click", () => this.handleCreateNote());
    btnDelete?.addEventListener("click", () => this.handleDeleteNote());
    btnMobileBack?.addEventListener("click", () => this.handleMobileBack());

    searchInput?.addEventListener("input", (e) => {
      this.state.searchQuery = (e.target as HTMLInputElement).value;
      this.renderNotesList();
    });

    titleInput?.addEventListener("input", () => this.handleContentChange());
    bodyCanvas?.addEventListener("input", () => this.handleContentChange());

    // Formatting Toolbar Buttons
    const toolBtns = this.container.querySelectorAll(".omni-tool-btn");
    toolBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const cmd = btn.getAttribute("data-command");
        const val = btn.getAttribute("data-value") || null;
        if (!cmd) return;

        bodyCanvas?.focus();
        if (cmd === "formatBlock" && val) {
          document.execCommand(cmd, false, val);
        } else {
          document.execCommand(cmd, false);
        }
        this.handleContentChange();
      });
    });

    // Resize listener for mobile responsiveness
    if (typeof window !== "undefined") {
      window.addEventListener("resize", () => {
        const wasMobile = this.state.isMobileView;
        this.state.isMobileView = window.innerWidth <= 720;
        const root = this.container.querySelector("#omni-notes-root");
        if (root) {
          if (this.state.isMobileView) root.classList.add("mobile-mode");
          else root.classList.remove("mobile-mode");
        }
      });
    }
  }

  private handleCreateNote(): void {
    const newNote: NoteItem = {
      id: "note_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      title: "",
      html: "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.state.notes.unshift(newNote);
    this.state.activeNoteId = newNote.id;
    this.saveLocalState();
    this.renderNotesList();
    this.renderEditor();
    this.openMobileEditor();

    const titleInput = this.container.querySelector("#note-title-input") as HTMLInputElement;
    titleInput?.focus();
  }

  private handleDeleteNote(): void {
    if (!this.state.activeNoteId) return;
    const activeNote = this.state.notes.find((n) => n.id === this.state.activeNoteId);
    if (!activeNote) return;

    if (!confirm("Are you sure you want to delete this note?")) return;

    activeNote.deleted = true;
    activeNote.updatedAt = Date.now();

    // Publish tombstone to relays
    syncNoteToRelays(activeNote, (status) => this.updateSyncStatus(status));

    this.state.notes = this.state.notes.filter((n) => n.id !== activeNote.id);
    this.state.activeNoteId = this.state.notes[0]?.id || null;
    this.saveLocalState();

    this.renderNotesList();
    this.renderEditor();
    this.handleMobileBack();
  }

  private handleMobileBack(): void {
    const root = this.container.querySelector("#omni-notes-root");
    root?.classList.remove("showing-editor");
    this.state.mobileScreen = "list";
  }

  private openMobileEditor(): void {
    const root = this.container.querySelector("#omni-notes-root");
    root?.classList.add("showing-editor");
    this.state.mobileScreen = "editor";
  }

  private handleContentChange(): void {
    const active = this.state.notes.find((n) => n.id === this.state.activeNoteId);
    if (!active) return;

    const titleInput = this.container.querySelector("#note-title-input") as HTMLInputElement;
    const bodyCanvas = this.container.querySelector("#note-body-canvas") as HTMLDivElement;

    active.title = titleInput?.value.trim() || "";
    active.html = sanitizeNoteHtml(bodyCanvas?.innerHTML || "");
    active.updatedAt = Date.now();

    // Immediately update title in active sidebar card for instant responsive feedback
    const activeCardTitle = this.container.querySelector(".omni-note-card.active .omni-card-title");
    if (activeCardTitle) {
      activeCardTitle.textContent = active.title || "Untitled Note";
    }

    this.updateWordCount();
    this.updateSyncStatus("saving");

    clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(() => {
      this.saveLocalState();
      this.renderNotesList();
      syncNoteToRelays(active, (status) => this.updateSyncStatus(status));
    }, 400);
  }

  private renderNotesList(): void {
    const listEl = this.container.querySelector("#notes-list");
    if (!listEl) return;

    listEl.innerHTML = "";
    const q = this.state.searchQuery.toLowerCase().trim();
    const filtered = this.state.notes.filter(
      (n) =>
        (n.title || "").toLowerCase().includes(q) ||
        (n.html || "").toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: var(--n-text-muted); font-size: 0.85rem;">
          No notes found.
        </div>
      `;
      return;
    }

    filtered.forEach((note) => {
      const li = document.createElement("li");
      li.className = `omni-note-card ${note.id === this.state.activeNoteId ? "active" : ""}`;

      const tmp = document.createElement("div");
      tmp.innerHTML = note.html || "";
      const textContent = tmp.textContent || tmp.innerText || "Empty note...";
      const dateStr = this.formatRelativeTime(note.updatedAt);

      li.innerHTML = `
        <div class="omni-card-title">${this.escapeHtml(note.title || "Untitled Note")}</div>
        <div class="omni-card-snippet">${this.escapeHtml(textContent)}</div>
        <div class="omni-card-footer">
          <span>${dateStr}</span>
        </div>
      `;

      li.onclick = () => {
        this.state.activeNoteId = note.id;
        this.renderNotesList();
        this.renderEditor();
        this.openMobileEditor();
      };

      listEl.appendChild(li);
    });
  }

  private renderEditor(): void {
    const titleInput = this.container.querySelector("#note-title-input") as HTMLInputElement;
    const bodyCanvas = this.container.querySelector("#note-body-canvas") as HTMLDivElement;
    if (!titleInput || !bodyCanvas) return;

    const active = this.state.notes.find((n) => n.id === this.state.activeNoteId);
    if (!active) {
      titleInput.value = "";
      bodyCanvas.innerHTML = "";
      titleInput.disabled = true;
      bodyCanvas.contentEditable = "false";
      this.updateWordCount();
      return;
    }

    titleInput.disabled = false;
    bodyCanvas.contentEditable = "true";
    titleInput.value = active.title || "";
    bodyCanvas.innerHTML = active.html || "";
    this.updateWordCount();
  }

  private updateWordCount(): void {
    const wordCountEl = this.container.querySelector("#label-word-count");
    const bodyCanvas = this.container.querySelector("#note-body-canvas") as HTMLDivElement;
    if (!wordCountEl || !bodyCanvas) return;

    const text = bodyCanvas.innerText?.trim() || "";
    const count = text.length === 0 ? 0 : text.split(/\s+/).length;
    wordCountEl.textContent = `${count} ${count === 1 ? "word" : "words"}`;
  }

  private updateSyncStatus(status: "saved" | "saving" | "offline"): void {
    this.state.syncStatus = status;
    const syncDot = this.container.querySelector("#sync-dot");
    const syncLabel = this.container.querySelector("#sync-label");
    if (!syncDot || !syncLabel) return;

    syncDot.className = `omni-sync-dot ${status}`;
    if (status === "saving") {
      syncLabel.textContent = "Saving...";
    } else if (status === "offline") {
      syncLabel.textContent = "Offline";
    } else {
      syncLabel.textContent = "Saved";
    }
  }

  private formatRelativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  private escapeHtml(str: string): string {
    return (str || "").replace(/[&<>"']/g, (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[m] || m)
    );
  }
}
