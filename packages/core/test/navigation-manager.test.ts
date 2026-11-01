import { describe, it, expect, vi } from "vitest";
import { NavigationManager } from "../src/navigation/navigation-manager.js";

describe("NavigationManager", () => {
  it("initializes with an initial frame and calculates canGoBack correctly", () => {
    const nav = new NavigationManager({
      type: "app",
      appId: "org.omni.plugin.feed",
      title: "Feed"
    });

    expect(nav.canGoBack()).toBe(false);
    expect(nav.canGoForward()).toBe(false);
    expect(nav.getCurrentFrame()?.appId).toBe("org.omni.plugin.feed");
    expect(nav.getActiveAppId()).toBe("org.omni.plugin.feed");
    expect(nav.getStack().length).toBe(1);
  });

  it("pushes an app switch and enables canGoBack", () => {
    const nav = new NavigationManager({
      type: "app",
      appId: "org.omni.plugin.feed"
    });

    nav.push({
      type: "app",
      appId: "org.omni.plugin.profile-viewer"
    }, false);

    expect(nav.canGoBack()).toBe(true);
    expect(nav.getCurrentFrame()?.appId).toBe("org.omni.plugin.profile-viewer");
    expect(nav.getStack().length).toBe(2);
  });

  it("pushes an internal subroute and tracks isInternalSubroute", () => {
    const nav = new NavigationManager({
      type: "app",
      appId: "org.omni.plugin.profile-viewer"
    });

    let lastEvent: any = null;
    nav.onNavigate((ev) => {
      lastEvent = ev;
    });

    // Subroute inside same app: Following -> View Profile
    nav.push({
      type: "subroute",
      appId: "org.omni.plugin.profile-viewer",
      url: "?tab=user-profile&pubkey=abc12345",
      state: { tab: "user-profile", pubkey: "abc12345" }
    }, false);

    expect(nav.canGoBack()).toBe(true);
    expect(lastEvent.isInternalSubroute).toBe(true);
    expect(lastEvent.currentFrame.url).toBe("?tab=user-profile&pubkey=abc12345");

    // Going back should stay in the same app and flag isInternalSubroute
    const backResult = nav.back(false);
    expect(backResult.handled).toBe(true);
    expect(backResult.isInternalSubroute).toBe(true);
    expect(backResult.currentFrame?.appId).toBe("org.omni.plugin.profile-viewer");
    expect(backResult.currentFrame?.type).toBe("app");
  });

  it("handles popstate matching frame id correctly", () => {
    const nav = new NavigationManager({
      type: "app",
      appId: "org.omni.plugin.feed"
    });

    const frame2 = nav.push({
      type: "app",
      appId: "org.omni.plugin.profile-viewer"
    }, false);

    const frame3 = nav.push({
      type: "subroute",
      appId: "org.omni.plugin.profile-viewer",
      url: "?tab=user-profile&pubkey=user1"
    }, false);

    expect(nav.getPointer()).toBe(2);

    // Simulate browser back to frame2
    const popRes = nav.handlePopState({ omniNavId: frame2.id });
    expect(popRes.handled).toBe(true);
    expect(popRes.direction).toBe("back");
    expect(popRes.isInternalSubroute).toBe(true);
    expect(nav.getCurrentFrame()?.id).toBe(frame2.id);
  });

  it("truncates forward history when pushing after navigating back", () => {
    const nav = new NavigationManager({
      type: "app",
      appId: "org.omni.plugin.feed"
    });

    nav.push({ type: "app", appId: "app-A" }, false);
    nav.push({ type: "app", appId: "app-B" }, false);
    expect(nav.getStack().length).toBe(3);

    nav.back(false);
    expect(nav.getCurrentFrame()?.appId).toBe("app-A");
    expect(nav.canGoForward()).toBe(true);

    nav.push({ type: "app", appId: "app-C" }, false);
    expect(nav.getStack().length).toBe(3); // feed -> app-A -> app-C
    expect(nav.getCurrentFrame()?.appId).toBe("app-C");
    expect(nav.canGoForward()).toBe(false);
  });
});
