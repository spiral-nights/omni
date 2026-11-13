import {
  apply_initial_url,
  mount_shell,
  start_live_data,
  start_with_bridge,
  watch_permission_prompts,
  type ShellBoot,
} from "@omni/gleam-interop/shell_boot";

// Bundled Gleam guest runtime injected into every plugin sandbox.
import guestBridgeScript from "../../../gleam/bridge/dist/guest-runtime.js?raw";
import { installPwaPrompt } from "./pwa";

/**
 * Omni host microkernel.
 *
 * All shell behavior lives in the Gleam `omni_shell` / `omni_web` packages:
 * this file only opens the host container, boots the Gleam kernel + shell
 * registry, and paints the active theme into `#omni-root`.
 */

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);

  return new Promise((resolve, reject) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (ok) resolve();
    else reject(new Error("copy command was rejected"));
  });
}

function installCopyHandlers(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLButtonElement>(".omni-code-copy-btn");
    if (!button) return;

    const text = button.getAttribute("data-copy-text") ?? "";
    const label = button.getAttribute("aria-label") ?? "Copy code";
    copyText(text)
      .then(() => {
        button.setAttribute("aria-label", "Copied");
        button.setAttribute("title", "Copied");
        window.setTimeout(() => {
          button.setAttribute("aria-label", label);
          button.setAttribute("title", label);
        }, 1200);
      })
      .catch((err) => {
        console.warn("[Omni] Copy failed:", err);
      });
  });
}

function showBootError(rootEl: HTMLElement, message: string): void {
  rootEl.innerHTML = "";
  const box = document.createElement("div");
  box.className = "omni-boot-error";
  box.setAttribute("role", "alert");
  box.textContent = `Omni failed to start: ${message}`;
  rootEl.appendChild(box);
}

async function mountShell(): Promise<void> {
  const rootEl = document.getElementById("omni-root");
  if (!rootEl) throw new Error("Missing #omni-root container");

  const result = await start_with_bridge("omni_shell", guestBridgeScript);

  if (!result.isOk()) {
    const message = (result as unknown as { 0: string })[0] ?? "unknown error";
    showBootError(rootEl, String(message));
    return;
  }

  const booted = (result as unknown as { 0: ShellBoot })[0];
  const host = apply_initial_url(booted, window.location.search);
  rootEl.innerHTML = "";
  mount_shell("#omni-root", host);
  watch_permission_prompts(host);
  // The pool replays subscriptions when sockets open, so this can start now.
  start_live_data(host);
  rootEl.setAttribute("data-omni-booted", "true");
  installPwaPrompt(rootEl);
}

function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister();
      }
    });
    return;
  }

  if (!window.location.protocol.startsWith("http")) return;

  const register = () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .catch((err) => {
        console.warn("[Omni PWA] Service worker registration failed:", err);
      });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register);
  }
}

installCopyHandlers();

mountShell().catch((err) => {
  console.error("Fatal startup error in Omni Web:", err);
});

registerServiceWorker();
