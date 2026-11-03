export interface StudioFileEntry {
  path: string;
  bytes: Uint8Array;
  size: number;
  sha256: string;
  mimeType: string;
  isText: boolean;
  textContent?: string;
}

export interface PublishedAppRecord {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  naddr: string;
  eventId: string;
  pubkey: string;
  createdAt: number;
  packagingMode: "inlined" | "multifile" | "local";
  fileCount: number;
  files: Array<{ path: string; sha256: string; mimeType: string }>;
  servers: string[];
  rawEvent?: any;
  htmlContent?: string;
  publishedAt?: number;
  totalSize?: number;
  views?: Array<{ id: string; title: string; path: string }>;
}

export interface BlossomServerConfig {
  url: string;
  enabled: boolean;
  status?: string;
}

export interface PublisherState {
  activeTab: "create" | "published" | "servers";
  servers: BlossomServerConfig[];
  publishedApps: PublishedAppRecord[];
  extractedFiles: StudioFileEntry[];
  entryFilePath: string;
  appName: string;
  appId: string;
  appVersion: string;
  appDescription: string;
  appIcon: string;
  packagingMode: "inlined" | "multifile";
  remoteUrlInputVal: string;
  newServerUrlVal: string;
  statusLogs: string[];
  lastPublishedResult: PublishedAppRecord | null;
  uploadProgress: { current: number; total: number; label: string } | null;
  isUploading: boolean;
}
