/**
 * Standard NIP-78 (Arbitrary Custom App Data) Workspace Schema for Omni
 */

export const OMNI_WORKSPACE_D_TAG = "omni/workspace/v1";

export interface PluginPlacement {
  id: string; // unique placement identifier, e.g. "main", "sidebar", "dock", "header-actions"
  viewport: string; // "main" | "dock" | "sidebar" | "header-actions"
  route?: string; // target route (e.g. "?view=widget", "" or "?view=settings")
  viewId?: string; // matched view ID
  enabled?: boolean;
  pinned?: boolean; // Whether pinned directly to navigation dock (for main full-page apps)
  relays?: string[]; // Custom relay URLs allowed for this placement/plugin. If undefined, uses all configured relays. If empty ([]), disables all relays (offline / local-only).
}

export interface OmniWorkspacePluginConfig {
  id: string;
  viewport?: string; // "main" | "dock" | "sidebar" | "header-actions"
  enabled: boolean;
  pinned?: boolean;
  order?: number;
  naddr?: string;
  sourceUrl?: string;
  displayName?: string; // Human-facing display name for dock, app tiles, and nav
  name?: string;
  description?: string;
  icon?: string;
  route?: string; // Target route/query (e.g. "?view=widget", "?view=settings", or "")
  viewId?: string; // View identifier (e.g. "main", "widget", "settings")
  relays?: string[]; // Custom relay URLs allowed for this plugin. If undefined, uses all configured relays. If empty ([]), disables all relays (offline / local-only).
  placements?: PluginPlacement[]; // Multi-viewport placements
  handledIntents?: string[]; // List of intent actions this plugin is enabled to handle
  disabledIntents?: string[]; // Specific intent actions user explicitly disabled for this plugin
}

export interface OmniWorkspaceState {
  version: 1;
  updatedAt: number;
  activePage?: string;
  autoSync?: boolean;
  shellType?: "classic" | "panorama" | string;
  defaultIntents?: Record<string, string>; // Maps intent action (e.g. "create_note", "view_profile") to default pluginId
  plugins: OmniWorkspacePluginConfig[];
}

/**
 * Canonical contract for Omni Shell implementations.
 * Any swappable shell (e.g. mobile shell, terminal shell, desktop shell)
 * satisfies this contract to mount and coordinate with OmniKernel.
 */
export interface OmniShellHost {
  /**
   * Mounts the shell layout and UI frame into the root host DOM element
   */
  mount(): void;

  /**
   * Resolves physical DOM container elements for plugin viewports (main, sidebar, dock, header-actions)
   */
  getContainerForPluginSlot(pluginId: string, viewport: string, componentId?: string): Element | undefined;

  /**
   * Handles drawer / slot toggling requests triggered by plugins or user actions
   */
  handleSlotAction?(action: "toggle" | "open" | "close" | "scrollToTop", slot: string): void;

  /**
   * Handles protocol URIs (nostr:, lightning:, cashu:) intercepted at the sandbox boundary
   */
  handleUri?(uri: string, sourcePluginId?: string): Promise<any>;

  /**
   * Handles Web Share API payload delegations
   */
  handleShare?(payload: { title?: string; text?: string; url?: string }, sourcePluginId?: string): Promise<any>;

  /**
   * Ensures companion widgets mapped to sidebar/widgets slots are mounted
   */
  ensureWidgetsMounted?(): Promise<void>;

  /**
   * Scrolls the main viewport or active page container to top
   */
  scrollToTop?(params?: { behavior?: ScrollBehavior }): void;

  /**
   * Handles history pushState routed from plugin sandboxes
   */
  handleHistoryPush?(pluginId: string, params: { path?: string; title?: string; state?: any }): void;

  /**
   * Handles history replaceState routed from plugin sandboxes
   */
  handleHistoryReplace?(pluginId: string, params: { path?: string; title?: string; state?: any }): void;

  /**
   * Handles history.back() routed from plugin sandboxes
   */
  handleHistoryBack?(pluginId: string): void;

  /**
   * Handles history.go() routed from plugin sandboxes
   */
  handleHistoryGo?(pluginId: string, delta: number): void;

  /**
   * Opens an application directly as active full-page app
   */
  openApp?(pluginId: string, pushState?: boolean): Promise<void> | void;

  /**
   * Opens the settings dialog or settings page
   */
  openSettings?(pushState?: boolean): void;

  /**
   * Exports the current workspace layout state for NIP-78 and local persistence
   */
  exportWorkspaceState(): OmniWorkspaceState;
}

