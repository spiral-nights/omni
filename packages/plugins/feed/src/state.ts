import type { FeedNoteItem, FeedSchemaState } from "./types.js";

export const defaultFeedState: FeedSchemaState = {
  activeTab: "following",
  composerText: "",
  notes: [],
  activeThreadNoteId: null
};

export const currentFeedState: FeedSchemaState = { ...defaultFeedState };

export const schemaThreadReplies: Map<string, FeedNoteItem[]> = new Map();
export const allKnownNotes = new Map<string, any>();

export const pendingProfileFetches = new Set<string>();
export const queuedProfilePubkeys = new Set<string>();

export const schemaFollowingPubkeys = new Set<string>();
export let schemaMyUserPubkey = "";
export function setSchemaMyUserPubkey(pk: string) {
  schemaMyUserPubkey = pk;
}

export let schemaOldestTimestamp = Infinity;
export function setSchemaOldestTimestamp(ts: number) {
  schemaOldestTimestamp = ts;
}

export let schemaIsLoadingOlder = false;
export function setSchemaIsLoadingOlder(val: boolean) {
  schemaIsLoadingOlder = val;
}

export let schemaGlobalSubId: string | null = null;
export function setSchemaGlobalSubId(id: string | null) {
  schemaGlobalSubId = id;
}

export let schemaWs: WebSocket | null = null;
export function setSchemaWs(ws: WebSocket | null) {
  schemaWs = ws;
}

export let activeWs: any = null;
export function setActiveWs(ws: any) {
  activeWs = ws;
}
