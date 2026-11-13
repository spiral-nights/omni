// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { installPwaPrompt } from "../../apps/web/src/pwa";

describe("PWA install prompt", () => {
  it("stores beforeinstallprompt, prompts on click, and cleans up", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById("root") as HTMLElement;
    const handle = installPwaPrompt(root);

    expect(root.querySelector("#omni-pwa-install")).toBeNull();

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string; platform: string }>;
    };
    event.prompt = prompt;
    event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
    window.dispatchEvent(event);

    const button = root.querySelector("#omni-pwa-install") as HTMLButtonElement;
    expect(button.hidden).toBe(false);

    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prompt).toHaveBeenCalled();
    expect(root.querySelector("#omni-pwa-install")).toBeNull();

    handle.dispose();
  });
});
