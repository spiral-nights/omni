export interface FeedNoteItem {
  id: string;
  pubkey: string;
  authorName: string;
  npub: string;
  avatar?: string;
  content: string;
  created_at: number;
  likes: number;
  reposts: number;
  replies: number;
  zaps: number;
  liked?: boolean;
  reposted?: boolean;
  replyToId?: string;
  replyToAuthor?: string;
  replyToPubkey?: string;
  rootId?: string;
}

export interface FeedSchemaState {
  activeTab: "following" | "global";
  notes: FeedNoteItem[];
  composerText: string;
  activeThreadNoteId: string | null;
  searchQuery?: string;
}

export interface DecodedNostrEntity {
  type: "npub" | "nprofile" | "note" | "nevent" | "naddr";
  data: {
    pubkey?: string;
    id?: string;
    relays?: string[];
    kind?: number;
    identifier?: string;
  };
}

export interface ParsedSearchQuery {
  authors: string[];
  keyword: string;
}
