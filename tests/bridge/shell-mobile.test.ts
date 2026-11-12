// @vitest-environment happy-dom
//
// Mobile shell coverage (backlog PL-15): verifies the Classic shell's mobile
// navigation toggle and the pull-to-refresh touch gesture. happy-dom has no
// layout engine, so visual overflow is covered as a stylesheet contract rather
// than by measuring scrollWidth.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, it, expect } from "vitest";

import * as shellBoot from "../../gleam/interop/build/dev/javascript/omni_interop/omni/interop/shell_boot.mjs";
import * as boot from "../../gleam/interop/build/dev/javascript/omni_web/omni/web/boot.mjs";
import { KernelPorts } from "../../gleam/interop/build/dev/javascript/omni_kernel/omni/kernel/kernel.mjs";
import * as storage from "../../gleam/interop/build/dev/javascript/omni_platform/omni/platform/storage.mjs";
import * as clock from "../../gleam/interop/build/dev/javascript/omni_platform/omni/platform/clock.mjs";
import * as idb from "../../gleam/interop/build/dev/javascript/omni_platform/omni/platform/idb.mjs";
import { Option$None$const } from "../../gleam/interop/build/dev/javascript/gleam_stdlib/gleam/option.mjs";
import {
  Msg$FinishPullRefresh$const,
  Msg$StartPullRefresh$const,
} from "../../gleam/interop/build/dev/javascript/omni_shell/omni/shell/msg.mjs";
import {
  PullState$PullIdle,
  PullState$isPulling,
  PullState$isReadyToRefresh,
  PullState$isRefreshing,
  on_touch_end,
  on_touch_move,
  on_touch_start,
  threshold_px,
} from "../../gleam/interop/build/dev/javascript/omni_shell/omni/shell/gestures/pull_to_refresh.mjs";

type GleamResult = { isOk(): boolean; 0: unknown };

function unwrap<T>(result: GleamResult): T {
  if (!result.isOk()) throw new Error("unexpected Gleam Error");
  return result[0] as T;
}

const MOBILE_VIEWPORT_PX = 390;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function touchEvent(type: string, clientY: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: [{ clientY }],
  });
  return event;
}

function shellRoot(): HTMLElement {
  const root = document.getElementById("omni-shell-root");
  if (!root) throw new Error("shell root not mounted");
  return root as HTMLElement;
}

function pullIndicator(): HTMLElement | null {
  return document.querySelector("#omni-pull-to-refresh");
}

describe("mobile shell: viewport, menu toggle, and dock", () => {
  beforeAll(async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: MOBILE_VIEWPORT_PX,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });

    document.body.innerHTML = '<div id="omni-root"></div>';

    const db = unwrap<unknown>(await idb.in_memory_simple());
    const ports = new KernelPorts(
      storage.in_memory(),
      db,
      clock.fixed(1_700_000_000_000),
      Option$None$const,
    );

    // Classic is the theme that exposes the mobile menu toggle and dock.
    const booted = boot.select_shell(
      boot.init_with_bridge(ports, Option$None$const),
      "classic",
    );
    shellBoot.mount_shell("#omni-root", new shellBoot.ShellBoot(booted));
    await nextFrame();
  });

  it("renders the mobile toggle in the closed state", () => {
    expect(window.innerWidth).toBe(MOBILE_VIEWPORT_PX);
    const root = shellRoot();
    expect(root.getAttribute("data-shell")).toBe("classic");
    expect(root.getAttribute("data-mobile-menu")).toBe("closed");

    const toggle = document.querySelector(
      "#btn-shell-mobile-menu",
    ) as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle!.tagName).toBe("BUTTON");
    expect(toggle!.getAttribute("aria-expanded")).toBe("false");
    expect(toggle!.getAttribute("aria-label")).toBe("Toggle Navigation Menu");
  });

  it("opens and closes the mobile menu through the live update loop", async () => {
    const root = shellRoot();
    const toggle = document.querySelector(
      "#btn-shell-mobile-menu",
    ) as HTMLButtonElement;

    toggle.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await nextFrame();

    expect(root.getAttribute("data-mobile-menu")).toBe("open");
    expect(
      document
        .querySelector("#btn-shell-mobile-menu")!
        .getAttribute("aria-expanded"),
    ).toBe("true");

    // A second click (re-queried: Lustre replaces the node on re-render).
    (document.querySelector("#btn-shell-mobile-menu") as HTMLButtonElement)
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    await nextFrame();

    expect(root.getAttribute("data-mobile-menu")).toBe("closed");
    expect(
      document
        .querySelector("#btn-shell-mobile-menu")!
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("keeps the bottom navigation dock available on mobile", () => {
    const dock = document.querySelector("nav.omni-dock") as HTMLElement | null;
    expect(dock).not.toBeNull();
    expect(dock!.getAttribute("aria-label")).toBe("Primary Navigation");
    expect(document.querySelector("#nav-widgets")).not.toBeNull();
    expect(document.querySelector("#nav-apps")).not.toBeNull();
    expect(document.querySelector("#nav-settings")).not.toBeNull();
  });

  it("does not rely on inline widths that would overflow a 390px viewport", () => {
    const root = shellRoot();
    const offenders = Array.from(root.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const inline = element.getAttribute("style") ?? "";
        const widths = Array.from(
          inline.matchAll(/(?:^|;)\s*(min-width|width)\s*:\s*(\d+)px/g),
          (match) => Number(match[2]),
        );
        return widths.some((px) => px > MOBILE_VIEWPORT_PX);
      })
      .map((element) => element.id || element.className);

    expect(offenders).toEqual([]);
  });

  it("uses mobile-first dock/header rules in the shared stylesheet", () => {
    const css = readFileSync(
      join(process.cwd(), "assets/styles/shell-modules.css"),
      "utf8",
    );

    // Dock is a bottom bar on mobile, left rail only from 768px up.
    expect(css).toMatch(
      /\.omni-dock\s*\{[^}]*position:\s*fixed;[^}]*left:\s*0;[^}]*right:\s*0;/s,
    );
    expect(css).toMatch(
      /@media\s*\(min-width:\s*768px\)\s*\{[^@]*\.omni-dock\s*\{[^}]*width:\s*64px;/s,
    );
    // Toggle is visible by default and hidden on desktop.
    expect(css).toMatch(/\.omni-mobile-menu-btn\s*\{/);
    expect(css).toMatch(
      /@media\s*\(min-width:\s*768px\)\s*\{[^@]*\.omni-mobile-menu-btn\s*\{[^}]*display:\s*none;/s,
    );
    // The shell root pins itself to the viewport instead of growing sideways.
    expect(css).toMatch(
      /\.omni-shell\.omni-shell-classic\s*\{[^}]*width:\s*100%;[^}]*overflow:\s*hidden;/s,
    );
    expect(css).toMatch(
      /\.omni-main-viewport\s*\{[^}]*overflow-x:\s*hidden;/s,
    );
  });
});

describe("pull-to-refresh gesture state machine", () => {
  it("only starts pulling at the top of the scroll container", () => {
    expect(
      PullState$isPulling(on_touch_start(PullState$PullIdle(), 0, 100)),
    ).toBe(true);
    expect(
      PullState$isPulling(on_touch_start(PullState$PullIdle(), 1.0, 100)),
    ).toBe(true);
    expect(on_touch_start(PullState$PullIdle(), 1.1, 100)).toBe(
      PullState$PullIdle(),
    );
  });

  it("crosses the 72px threshold and emits StartPullRefresh on release", () => {
    const pulling = on_touch_start(PullState$PullIdle(), 0, 100);
    expect(PullState$isPulling(pulling)).toBe(true);

    const below = on_touch_move(pulling, 100 + threshold_px - 1);
    expect(PullState$isPulling(below)).toBe(true);

    const ready = on_touch_move(below, 100 + threshold_px);
    expect(PullState$isReadyToRefresh(ready)).toBe(true);

    const [next, message] = on_touch_end(ready);
    expect(PullState$isRefreshing(next)).toBe(true);
    expect(message.constructor.name).toBe("Some");
    expect(message[0]).toBe(Msg$StartPullRefresh$const);
  });

  it("resets to idle when released before the threshold", () => {
    const pulling = on_touch_start(PullState$PullIdle(), 0, 100);
    const [next, message] = on_touch_end(on_touch_move(pulling, 150));
    expect(next).toBe(PullState$PullIdle());
    expect(message.constructor.name).toBe("None");
  });
});

describe("pull-to-refresh touch listeners (shell_boot FFI)", () => {
  async function triggerRefresh(deltaPx: number): Promise<void> {
    document.dispatchEvent(touchEvent("touchstart", 100));
    document.dispatchEvent(touchEvent("touchmove", 100 + deltaPx));
    await nextFrame();
  }

  it("dispatches StartPullRefresh and renders the refreshing indicator past 72px", async () => {
    await triggerRefresh(90);

    const indicator = pullIndicator();
    expect(indicator).not.toBeNull();
    expect(indicator!.className).toContain("is-refreshing");
    expect(indicator!.className).not.toContain("pulling");
    expect(indicator!.getAttribute("data-pull-distance")).toBe("72.0");
    expect(indicator!.getAttribute("aria-live")).toBe("polite");
    expect(indicator!.textContent).toContain("refreshing...");

    // Reset so the shell returns to idle after the gesture test.
    window.__omniShellDispatch?.(Msg$FinishPullRefresh$const);
    await nextFrame();
    expect(pullIndicator()!.className).toBe("omni-pull-to-refresh");
  });

  it("does not refresh for a pull shorter than 72px", async () => {
    document.dispatchEvent(touchEvent("touchend", 150));
    await triggerRefresh(threshold_px - 1);

    const indicator = pullIndicator();
    expect(indicator).not.toBeNull();
    expect(indicator!.className).not.toContain("is-refreshing");

    document.dispatchEvent(touchEvent("touchend", 150));
    await nextFrame();
  });

  it("ignores a gesture that starts while the page is scrolled", async () => {
    const originalScrollY = window.scrollY;
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 200,
    });
    try {
      await triggerRefresh(120);
      const indicator = pullIndicator();
      expect(indicator).not.toBeNull();
      expect(indicator!.className).not.toContain("is-refreshing");
    } finally {
      Object.defineProperty(window, "scrollY", {
        configurable: true,
        value: originalScrollY,
      });
      document.dispatchEvent(touchEvent("touchend", 220));
      await nextFrame();
    }
  });
});
