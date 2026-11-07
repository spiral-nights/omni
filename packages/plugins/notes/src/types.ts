export interface NoteItem {
  id: string;
  title: string;
  html: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export type SyncStatus = "saved" | "saving" | "offline";

export interface NotesState {
  notes: NoteItem[];
  activeNoteId: string | null;
  searchQuery: string;
  syncStatus: SyncStatus;
  myPubkey: string | null;
  isMobileView: boolean;
  mobileScreen: "list" | "editor";
}
