// @vitest-environment happy-dom
//
// Mobile shell coverage: verifies the Editorial shell mounts at phone width,
// keeps its navigation dock reachable, avoids fixed pixel overflow, and that
// the pull-to-refresh gesture works. happy-dom has no layout engine, so visual
// overflow is covered as a stylesheet contract rather than by measuring
// scrollWidth.
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
  const root = document.querySelector("#omni-root [data-shell]");
  if (!root) throw new Error("shell root not mounted");
  return root as HTMLElement;
}

function pullIndicator(): HTMLElement | null {
  return document.querySelector("#omni-pull-to-refresh");
}

describe("mobile shell: viewport, dock, and stylesheet contracts", () => {
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

    const booted = boot.select_shell(
      boot.init_with_bridge(ports, Option$None$const),
      "editorial",
    );
    shellBoot.mount_shell("#omni-root", new shellBoot.ShellBoot(booted));
    await nextFrame();
  });

  it("mounts the Editorial shell at phone width", () => {
    expect(window.innerWidth).toBe(MOBILE_VIEWPORT_PX);
    const root = shellRoot();
    expect(root.getAttribute("data-shell")).toBe("editorial");
    expect(document.getElementById("editorial-shell-root")).not.toBeNull();
  });

  it("keeps the navigation dock reachable on mobile", () => {
    const dock = document.querySelector("nav.editorial-dock") as
      | HTMLElement
      | null;
    expect(dock).not.toBeNull();
    expect(dock!.getAttribute("aria-label")).toBe("Primary Navigation");
    expect(document.querySelector("#btn-editorial-dock-apps")).not.toBeNull();
    expect(document.querySelector("#btn-editorial-dock-widgets")).not.toBeNull();
    expect(document.querySelector("#btn-editorial-dock-prefs")).not.toBeNull();
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

  it("uses viewport-safe rules for the dock and main viewport", () => {
    const css = readFileSync(
      join(process.cwd(), "assets/styles/editorial.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.editorial-dock\s*\{[^}]*position:\s*fixed;[^}]*left:\s*0;[^}]*right:\s*0;/s,
    );
    expect(css).not.toMatch(/\.omni-shell\.omni-shell-classic/);

    const modules = readFileSync(
      join(process.cwd(), "assets/styles/shell-modules.css"),
      "utf8",
    );
    expect(modules).toMatch(
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

  it("crosses the 50px threshold and emits StartPullRefresh on release", () => {
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
    const [next, message] = on_touch_end(on_touch_move(pulling, 140));
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

  it("dispatches StartPullRefresh and renders the refreshing indicator past 50px", async () => {
    await triggerRefresh(90);

    const indicator = pullIndicator();
    expect(indicator).not.toBeNull();
    expect(indicator!.className).toContain("is-refreshing");
    expect(indicator!.className).not.toContain("pulling");
    expect(indicator!.getAttribute("data-pull-distance")).toBe("50.0");
    expect(indicator!.getAttribute("aria-live")).toBe("polite");
    expect(indicator!.textContent).toContain("refreshing...");

    // Reset so the shell returns to idle after the gesture test.
    window.__omniShellDispatch?.(Msg$FinishPullRefresh$const);
    await nextFrame();
    expect(pullIndicator()!.className).toBe("omni-pull-to-refresh");
  });

  it("does not refresh for a pull shorter than 50px", async () => {
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
