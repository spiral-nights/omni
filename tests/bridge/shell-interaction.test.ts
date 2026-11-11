// @vitest-environment happy-dom
//
// Verifies the host mounts the Gleam shell with live Lustre event handlers
// (not a static HTML snapshot), so shell buttons respond to input.
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";

import * as shellBoot from "../../gleam/interop/build/dev/javascript/omni_interop/omni/interop/shell_boot.mjs";
import * as boot from "../../gleam/interop/build/dev/javascript/omni_web/omni/web/boot.mjs";
import {
  KernelPorts,
} from "../../gleam/interop/build/dev/javascript/omni_kernel/omni/kernel/kernel.mjs";
import * as storage from "../../gleam/interop/build/dev/javascript/omni_platform/omni/platform/storage.mjs";
import * as clock from "../../gleam/interop/build/dev/javascript/omni_platform/omni/platform/clock.mjs";
import * as idb from "../../gleam/interop/build/dev/javascript/omni_platform/omni/platform/idb.mjs";
import { Option$None$const } from "../../gleam/interop/build/dev/javascript/gleam_stdlib/gleam/option.mjs";

type GleamResult = { isOk(): boolean; 0: unknown };

function unwrap<T>(result: GleamResult): T {
  if (!result.isOk()) throw new Error("unexpected Gleam Error");
  return result[0] as T;
}

describe("interactive shell mount", () => {
  it("renders the theme and responds to dock clicks", async () => {
    document.body.innerHTML = '<div id="omni-root"></div>';

    const db = unwrap<unknown>(await idb.in_memory_simple());
    const ports = new KernelPorts(
      storage.in_memory(),
      db,
      clock.fixed(1_700_000_000_000),
      Option$None$const,
    );

    const booted = boot.init_with_bridge(ports, Option$None$const);
    const host = new shellBoot.ShellBoot(booted);

    shellBoot.mount_shell("#omni-root", host);

    const root = document.getElementById("omni-root")!;
    expect(root.innerHTML).toContain("editorial-shell-root");
    expect(root.innerHTML).toContain("editorial-dock-inner");
    expect(window.location.search).toBe("?app=org.omni.plugin.feed");
    // Built-in apps render their Schema in the host, not a blank sandbox island.
    expect(root.innerHTML).toContain("omni-hosted-app");
    expect(root.innerHTML).toContain("Following");

    // Click "Settings" in the dock: the update loop must re-render the view.
    const settingsBtn = document.querySelector(
      "#btn-editorial-dock-prefs",
    ) as HTMLElement | null;
    expect(settingsBtn).not.toBeNull();
    settingsBtn!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

    expect(root.innerHTML).toContain("omni-settings-view");
    expect(window.location.search).toContain("view=settings");

    // Apps page: built-ins are already installed (matched by source URL).
    (document.querySelector("#btn-editorial-dock-apps") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(root.innerHTML).toContain("omni-app-store");
    expect(root.innerHTML).toContain("Installed");
  });
});
