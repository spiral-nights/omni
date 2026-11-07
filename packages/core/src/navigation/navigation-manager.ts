export type NavigationType = "app" | "section" | "subroute";

export interface NavigationFrame {
  id: string;
  type: NavigationType;
  appId?: string;
  section?: string;
  pageId?: string;
  url?: string;
  state?: any;
  title?: string;
  timestamp: number;
  intentEntry?: boolean;
}

export interface NavigationEvent {
  direction: "forward" | "back" | "jump" | "replace" | "push";
  currentFrame: NavigationFrame;
  previousFrame?: NavigationFrame;
  isInternalSubroute: boolean;
}

export type NavigationListener = (event: NavigationEvent) => void;

let navCounter = 0;
function generateNavId(): string {
  navCounter++;
  return `nav_${Date.now()}_${navCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

export class NavigationManager {
  private stack: NavigationFrame[] = [];
  private pointer = -1;
  private listeners: Set<NavigationListener> = new Set();
  private isProcessingPopState = false;
  private pendingIntentAppId: string | null = null;
  private intentEntryTimestamp = 0;

  constructor(initialFrame?: Omit<NavigationFrame, "id" | "timestamp">) {
    if (initialFrame) {
      this.initInitialFrame(initialFrame);
    }
  }

  /**
   * Marks the next entry or current entry for `appId` as an intent-driven navigation
   * so that opening an inactive app + navigating to its target page/subroute coalesces
   * into a single history frame (preventing phantom root frames on Back).
   */
  public markIntentEntry(appId: string): void {
    this.pendingIntentAppId = appId;
    this.intentEntryTimestamp = Date.now();
    const current = this.getCurrentFrame();
    if (current && current.appId === appId) {
      current.intentEntry = true;
    }
  }

  /**
   * Returns the most recent frame in the stack for `appId` at or before `maxIndex`
   * (defaults to the current pointer).
   */
  public getLastFrameForApp(appId: string, maxIndex: number = this.pointer): NavigationFrame | undefined {
    const start = Math.min(maxIndex, this.stack.length - 1);
    for (let i = start; i >= 0; i--) {
      if (this.stack[i]?.appId === appId) {
        return this.stack[i];
      }
    }
    return undefined;
  }

  /**
   * Initializes or resets the navigation stack with an initial root frame.
   */
  public initInitialFrame(frame: Omit<NavigationFrame, "id" | "timestamp">): NavigationFrame {
    const newFrame: NavigationFrame = {
      ...frame,
      id: generateNavId(),
      timestamp: Date.now()
    };
    this.stack = [newFrame];
    this.pointer = 0;
    return newFrame;
  }

  /**
   * Pushes a new navigation frame onto the stack.
   * Truncates any forward history if the pointer was in the middle of the stack.
   */
  public push(
    frame: Omit<NavigationFrame, "id" | "timestamp">,
    syncBrowser = true
  ): NavigationFrame {
    const previousFrame = this.getCurrentFrame();
    const isPendingIntent = Boolean(
      frame.appId &&
      this.pendingIntentAppId === frame.appId &&
      Date.now() - this.intentEntryTimestamp <= 1500
    );
    if (frame.appId && this.pendingIntentAppId === frame.appId) {
      this.pendingIntentAppId = null;
    }

    // 1. Automatic Intent Coalescing:
    // When an app was just opened via cross-plugin intent or URI, its initial "app" frame
    // has `intentEntry: true`. When the plugin subsequently pushes its target page/subroute,
    // coalesce it in-place into that frame so Back returns directly to the originating app.
    const isActiveIntentEntry = Boolean(
      previousFrame &&
      previousFrame.appId &&
      previousFrame.appId === frame.appId &&
      previousFrame.intentEntry &&
      Date.now() - this.intentEntryTimestamp <= 1500
    );
    if (isActiveIntentEntry && previousFrame) {
      if (frame.type === "app" && !frame.state && !frame.pageId) {
        return previousFrame;
      }
      // If the plugin emits its default initial root render (state: null, empty url) before
      // handling the intent payload, absorb pageId in-place while keeping intentEntry active.
      if (frame.state === null && (!frame.url || frame.url === "")) {
        if (frame.pageId) {
          previousFrame.pageId = frame.pageId;
        }
        return previousFrame;
      }
      // Target subroute/page of the intent: replace the entry frame in-place and consume intentEntry
      return this.replace(
        {
          ...frame,
          type: frame.type || "subroute",
          intentEntry: false
        },
        syncBrowser
      );
    }

    // 2. Initial Root Page Hydration:
    // When an app is freshly opened (type === "app", no state, no pageId yet) and its root
    // schema or initial render reports the default root page (state === null, empty url),
    // hydrate the existing app frame in-place instead of pushing a duplicate root frame.
    if (
      previousFrame &&
      previousFrame.appId &&
      previousFrame.appId === frame.appId &&
      previousFrame.type === "app" &&
      !previousFrame.pageId &&
      !previousFrame.state &&
      frame.state === null &&
      (!frame.url || frame.url === "")
    ) {
      previousFrame.pageId = frame.pageId;
      previousFrame.url = frame.url ?? previousFrame.url;
      if (frame.title) {
        previousFrame.title = frame.title;
      }
      return previousFrame;
    }

    // 3. Same-Page / Duplicate Frame Deduplication:
    if (previousFrame && previousFrame.appId === frame.appId) {
      const sameExplicitPage = Boolean(frame.pageId && previousFrame.pageId && previousFrame.pageId === frame.pageId);
      const sameNonEmptyUrl = Boolean(frame.url && previousFrame.url && previousFrame.url === frame.url);
      const sameStateAndUrl =
        previousFrame.url === frame.url &&
        JSON.stringify(previousFrame.state ?? null) === JSON.stringify(frame.state ?? null) &&
        (previousFrame.type === frame.type || Boolean(frame.url) || frame.state !== undefined);
      const sameLogicalTabTarget = Boolean(
        (!previousFrame.pageId || !frame.pageId) &&
        previousFrame.state &&
        frame.state &&
        typeof previousFrame.state === "object" &&
        typeof frame.state === "object" &&
        previousFrame.state.tab &&
        previousFrame.state.tab === frame.state.tab &&
        previousFrame.state.pubkey === frame.state.pubkey &&
        previousFrame.state.noteId === frame.state.noteId
      );

      if (sameExplicitPage || sameNonEmptyUrl || sameStateAndUrl || sameLogicalTabTarget) {
        if (frame.pageId && !previousFrame.pageId) {
          previousFrame.pageId = frame.pageId;
        }
        if (frame.state && typeof frame.state === "object") {
          previousFrame.state =
            previousFrame.state && typeof previousFrame.state === "object"
              ? { ...previousFrame.state, ...frame.state }
              : frame.state;
        } else if (frame.state !== undefined && previousFrame.state === undefined) {
          previousFrame.state = frame.state;
        }
        if (frame.url && !previousFrame.url) {
          previousFrame.url = frame.url;
        }
        console.debug("[Omni Nav] stack.push -> ignoring duplicate frame:", previousFrame);
        return previousFrame;
      }
    }

    if (previousFrame && previousFrame.appId !== frame.appId && previousFrame.intentEntry) {
      previousFrame.intentEntry = false;
    }

    const newFrame: NavigationFrame = {
      ...frame,
      intentEntry: isPendingIntent || frame.intentEntry,
      id: generateNavId(),
      timestamp: Date.now()
    };

    // If pointer is not at the end of the stack, discard forward history
    if (this.pointer >= 0 && this.pointer < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.pointer + 1);
    }

    this.stack.push(newFrame);
    this.pointer = this.stack.length - 1;
    console.debug("[Omni Nav] stack.push -> pointer:", this.pointer, "length:", this.stack.length, "frame:", newFrame);

    if (syncBrowser && typeof window !== "undefined" && window.history && !this.isProcessingPopState) {
      try {
        window.history.pushState(
          { omniNavId: newFrame.id, ...newFrame },
          newFrame.title || document.title,
          window.location.href
        );
      } catch (_) {}
    }

    const isInternalSubroute = Boolean(
      previousFrame &&
      newFrame.appId &&
      previousFrame.appId === newFrame.appId &&
      (newFrame.type === "subroute" || previousFrame.type === "subroute")
    );

    this.emit({
      direction: "push",
      currentFrame: newFrame,
      previousFrame,
      isInternalSubroute
    });

    return newFrame;
  }

  /**
   * Replaces the current navigation frame in-place.
   */
  public replace(
    frame: Omit<NavigationFrame, "id" | "timestamp">,
    syncBrowser = true
  ): NavigationFrame {
    const previousFrame = this.getCurrentFrame();
    const newFrame: NavigationFrame = {
      ...frame,
      id: previousFrame ? previousFrame.id : generateNavId(),
      timestamp: Date.now()
    };

    if (this.pointer >= 0 && this.pointer < this.stack.length) {
      this.stack[this.pointer] = newFrame;
    } else {
      this.stack = [newFrame];
      this.pointer = 0;
    }
    console.debug("[Omni Nav] stack.replace -> pointer:", this.pointer, "length:", this.stack.length, "frame:", newFrame);

    if (syncBrowser && typeof window !== "undefined" && window.history && !this.isProcessingPopState) {
      try {
        window.history.replaceState(
          { omniNavId: newFrame.id, ...newFrame },
          newFrame.title || document.title,
          window.location.href
        );
      } catch (_) {}
    }

    this.emit({
      direction: "replace",
      currentFrame: newFrame,
      previousFrame,
      isInternalSubroute: Boolean(
        previousFrame &&
        newFrame.appId &&
        previousFrame.appId === newFrame.appId
      )
    });

    return newFrame;
  }

  /**
   * Goes back one step in history.
   * If syncBrowser is true, calls window.history.back() if running in a browser.
   */
  public back(syncBrowser = true): {
    handled: boolean;
    currentFrame?: NavigationFrame;
    previousFrame?: NavigationFrame;
    isInternalSubroute?: boolean;
  } {
    if (!this.canGoBack()) {
      return { handled: false };
    }

    const previousFrame = this.stack[this.pointer];
    this.pointer--;
    const currentFrame = this.stack[this.pointer];

    const isInternalSubroute = Boolean(
      previousFrame &&
      currentFrame &&
      previousFrame.appId &&
      previousFrame.appId === currentFrame.appId
    );

    if (syncBrowser && typeof window !== "undefined" && window.history && !this.isProcessingPopState) {
      try {
        window.history.back();
      } catch (_) {}
    }

    this.emit({
      direction: "back",
      currentFrame,
      previousFrame,
      isInternalSubroute
    });

    return {
      handled: true,
      currentFrame,
      previousFrame,
      isInternalSubroute
    };
  }

  /**
   * Goes forward one step in history if forward entries exist.
   */
  public forward(syncBrowser = true): {
    handled: boolean;
    currentFrame?: NavigationFrame;
    previousFrame?: NavigationFrame;
  } {
    if (!this.canGoForward()) {
      return { handled: false };
    }

    const previousFrame = this.stack[this.pointer];
    this.pointer++;
    const currentFrame = this.stack[this.pointer];

    const isInternalSubroute = Boolean(
      previousFrame &&
      currentFrame &&
      previousFrame.appId &&
      previousFrame.appId === currentFrame.appId
    );

    if (syncBrowser && typeof window !== "undefined" && window.history && !this.isProcessingPopState) {
      try {
        window.history.forward();
      } catch (_) {}
    }

    this.emit({
      direction: "forward",
      currentFrame,
      previousFrame,
      isInternalSubroute
    });

    return {
      handled: true,
      currentFrame,
      previousFrame
    };
  }

  /**
   * Jumps directly to a specific frame index in the navigation stack.
   */
  public jumpTo(targetIdx: number, syncBrowser = true): {
    handled: boolean;
    currentFrame?: NavigationFrame;
    previousFrame?: NavigationFrame;
  } {
    if (targetIdx < 0 || targetIdx >= this.stack.length || targetIdx === this.pointer) {
      return { handled: false };
    }

    const previousFrame = this.stack[this.pointer];
    const delta = targetIdx - this.pointer;
    this.pointer = targetIdx;
    const currentFrame = this.stack[this.pointer];

    if (syncBrowser && typeof window !== "undefined" && window.history && !this.isProcessingPopState) {
      try {
        window.history.go(delta);
      } catch (_) {}
    }

    this.emit({
      direction: delta < 0 ? "back" : "forward",
      currentFrame,
      previousFrame,
      isInternalSubroute: Boolean(previousFrame?.appId && previousFrame.appId === currentFrame?.appId)
    });

    return {
      handled: true,
      currentFrame,
      previousFrame
    };
  }

  /**
   * Handles incoming popstate events from window.addEventListener("popstate").
   * Synchronizes internal pointer with the matching omniNavId in stack.
   */
  public handlePopState(state: any): {
    handled: boolean;
    currentFrame?: NavigationFrame;
    previousFrame?: NavigationFrame;
    isInternalSubroute?: boolean;
    direction?: "back" | "forward" | "jump";
  } {
    const navId = state?.omniNavId || state?.id;
    if (!navId) {
      // If popping back to the initial state (before first pushState)
      if (this.pointer > 0 && !state) {
        const previousFrame = this.stack[this.pointer];
        this.pointer = 0;
        const currentFrame = this.stack[0];
        const isInternalSubroute = Boolean(
          previousFrame &&
          currentFrame &&
          previousFrame.appId &&
          previousFrame.appId === currentFrame.appId
        );
        this.emit({
          direction: "back",
          currentFrame,
          previousFrame,
          isInternalSubroute
        });
        return {
          handled: true,
          currentFrame,
          previousFrame,
          isInternalSubroute,
          direction: "back"
        };
      }
      return { handled: false };
    }

    const targetIdx = this.stack.findIndex((f) => f.id === navId);
    if (targetIdx === -1) {
      return { handled: false };
    }

    // If pointer is already at targetIdx (e.g. popstate event arriving after back()/forward() updated pointer),
    // acknowledge without duplicate processing
    if (targetIdx === this.pointer) {
      return {
        handled: true,
        currentFrame: this.stack[this.pointer],
        direction: "jump"
      };
    }

    const previousFrame = this.stack[this.pointer];
    const direction = targetIdx < this.pointer ? "back" : "forward";
    this.pointer = targetIdx;
    const currentFrame = this.stack[this.pointer];

    const isInternalSubroute = Boolean(
      previousFrame &&
      currentFrame &&
      previousFrame.appId &&
      previousFrame.appId === currentFrame.appId
    );

    this.isProcessingPopState = true;
    try {
      this.emit({
        direction,
        currentFrame,
        previousFrame,
        isInternalSubroute
      });
    } finally {
      this.isProcessingPopState = false;
    }

    return {
      handled: true,
      currentFrame,
      previousFrame,
      isInternalSubroute,
      direction
    };
  }

  public canGoBack(): boolean {
    return this.pointer > 0;
  }

  public canGoForward(): boolean {
    return this.pointer < this.stack.length - 1;
  }

  public getCurrentFrame(): NavigationFrame | undefined {
    return this.pointer >= 0 && this.pointer < this.stack.length
      ? this.stack[this.pointer]
      : undefined;
  }

  public getPointer(): number {
    return this.pointer;
  }

  public getStack(): NavigationFrame[] {
    return [...this.stack];
  }

  public getActiveAppId(): string | undefined {
    const cur = this.getCurrentFrame();
    return cur?.appId;
  }

  public getActiveSection(): string | undefined {
    const cur = this.getCurrentFrame();
    return cur?.section;
  }

  public onNavigate(listener: NavigationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: NavigationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in NavigationManager listener:", err);
      }
    }
  }
}
