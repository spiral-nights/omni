import { start, render, type ShellBoot } from "@omni/gleam-interop/shell_boot";

/**
 * Omni host microkernel.
 *
 * All shell behavior lives in the Gleam `omni_shell` / `omni_web` packages:
 * this file only opens the host container, boots the Gleam kernel + shell
 * registry, and paints the active theme into `#omni-root`.
 */

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

  const result = await start("omni_shell");

  if (!result.isOk()) {
    const message = (result as unknown as { 0: string })[0] ?? "unknown error";
    showBootError(rootEl, String(message));
    return;
  }

  const host = (result as unknown as { 0: ShellBoot })[0];
  rootEl.innerHTML = render(host);
  rootEl.setAttribute("data-omni-booted", "true");
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

mountShell().catch((err) => {
  console.error("Fatal startup error in Omni Web:", err);
});

registerServiceWorker();
