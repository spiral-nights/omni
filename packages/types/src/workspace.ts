/**
 * Standard NIP-78 (Arbitrary Custom App Data) Workspace Schema for Omni
 */

export const OMNI_WORKSPACE_D_TAG = "omni/workspace/v1";

export interface OmniWorkspacePluginConfig {
  id: string;
  viewport?: string; // "main" | "dock" | "sidebar" | "header-actions"
  enabled: boolean;
  order?: number;
  naddr?: string;
  sourceUrl?: string;
  name?: string;
  description?: string;
  icon?: string;
  route?: string; // Target route/query (e.g. "?view=widget", "?view=settings", or "")
  viewId?: string; // View identifier (e.g. "main", "widget", "settings")
}

export interface OmniWorkspaceState {
  version: 1;
  updatedAt: number;
  activePage?: string;
  autoSync?: boolean;
  plugins: OmniWorkspacePluginConfig[];
}
