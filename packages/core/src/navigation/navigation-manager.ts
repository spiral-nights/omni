export type NavigationType = "app" | "section" | "subroute";

export interface NavigationFrame {
  id: string;
  type: NavigationType;
  appId?: string;
  section?: string;
  url?: string;
  state?: any;
  title?: string;
  timestamp: number;
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

  constructor(initialFrame?: Omit<NavigationFrame, "id" | "timestamp">) {
    if (initialFrame) {
      this.initInitialFrame(initialFrame);
    }
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
    const newFrame: NavigationFrame = {
      ...frame,
      id: generateNavId(),
      timestamp: Date.now()
    };

    // If pointer is not at the end of the stack, discard forward history
    if (this.pointer >= 0 && this.pointer < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.pointer + 1);
    }

    this.stack.push(newFrame);
    this.pointer = this.stack.length - 1;

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
