import { NotesApp } from "./ui/notes-ui.js";
export { NotesApp } from "./ui/notes-ui.js";
export { sanitizeNoteHtml } from "./editor/sanitizer.js";
export { initNotesRelaySync, syncNoteToRelays, NOTES_NIP78_D_PREFIX } from "./net/notes-sync.js";
export * from "./types.js";

// Auto-boot if running inside an iframe or standalone DOM document
if (typeof document !== "undefined") {
  const mount = () => {
    const root = document.getElementById("root") || document.getElementById("omni-root") || document.body;
    if (root) {
      const app = new NotesApp(root);
      app.init();
      (window as any).__omni_notes_app__ = app;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
}
