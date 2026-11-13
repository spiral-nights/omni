/**
 * PWA install affordance.
 *
 * Chromium fires `beforeinstallprompt` once the app is installable. We hold the
 * event and expose a themed button inside the shell root; other browsers simply
 * never see the button.
 */

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface InstallPromptHandle {
  dispose: () => void;
}

export function installPwaPrompt(
  root: HTMLElement,
  win: Window = window,
): InstallPromptHandle {
  let deferred: InstallPromptEvent | null = null;
  const button = document.createElement("button");
  button.id = "omni-pwa-install";
  button.className = "omni-pwa-install";
  button.type = "button";
  button.textContent = "Install Omni";
  button.setAttribute("aria-label", "Install Omni as an app");
  button.hidden = true;

  const remove = () => {
    button.remove();
  };

  const onBeforeInstall = (event: Event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    root.appendChild(button);
    button.hidden = false;
  };

  const onClick = async () => {
    if (!deferred) return;
    const event = deferred;
    deferred = null;
    try {
      await event.prompt();
      await event.userChoice;
    } finally {
      remove();
    }
  };

  const onInstalled = () => {
    deferred = null;
    remove();
  };

  win.addEventListener("beforeinstallprompt", onBeforeInstall);
  win.addEventListener("appinstalled", onInstalled);
  button.addEventListener("click", onClick);

  return {
    dispose() {
      win.removeEventListener("beforeinstallprompt", onBeforeInstall);
      win.removeEventListener("appinstalled", onInstalled);
      button.removeEventListener("click", onClick);
      remove();
    },
  };
}
