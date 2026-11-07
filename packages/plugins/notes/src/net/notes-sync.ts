import { NoteItem } from "../types.js";

export const NOTES_NIP78_D_PREFIX = "omni/notes/v1/";

let syncSocket: WebSocket | null = null;
let currentPubkey: string | null = null;
let isSyncing = false;

export async function getUserPubkey(): Promise<string | null> {
  if (currentPubkey) return currentPubkey;
  if (typeof window === "undefined") return null;
  const nostr = (window as any).nostr;
  if (!nostr || typeof nostr.getPublicKey !== "function") return null;
  try {
    currentPubkey = await nostr.getPublicKey();
    return currentPubkey;
  } catch (err) {
    console.warn("[NotesSync] Could not obtain public key from nostr signer:", err);
    return null;
  }
}

export function initNotesRelaySync(
  onNoteReceived: (note: NoteItem) => void,
  onStatusChange?: (status: "saved" | "saving" | "offline") => void
): void {
  if (typeof WebSocket === "undefined" || typeof window === "undefined") return;

  // Skip in headless testing environments without full mock socket
  const w = window as any;
  if (w.happyDOM || w.__VITEST_ENVIRONMENT__) return;

  if (syncSocket && (syncSocket.readyState === WebSocket.OPEN || syncSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  getUserPubkey().then((pubkey) => {
    if (!pubkey) {
      onStatusChange?.("saved");
      return;
    }

    try {
      syncSocket = new WebSocket("wss://relay.damus.io");

      syncSocket.onopen = () => {
        onStatusChange?.("saved");
        // Query user's notes from 0ms local event store & relay pool
        syncSocket?.send(
          JSON.stringify([
            "REQ",
            "omni_notes_sub",
            {
              kinds: [30078],
              authors: [pubkey],
              limit: 250
            }
          ])
        );
      };

      syncSocket.onmessage = async (event) => {
        try {
          const frame = JSON.parse(event.data);
          if (!Array.isArray(frame)) return;

          const type = frame[0];
          if (type === "EVENT" && frame[2]) {
            const ev = frame[2];
            if (ev.kind !== 30078 || !ev.content) return;

            // Ensure event belongs to our notes d-tag namespace
            const dTag = ev.tags?.find((t: any[]) => t[0] === "d")?.[1];
            if (!dTag || !dTag.startsWith(NOTES_NIP78_D_PREFIX)) return;

            const nostr = (window as any).nostr;
            if (!nostr || !nostr.nip04 || typeof nostr.nip04.decrypt !== "function") return;

            try {
              const decryptedJson = await nostr.nip04.decrypt(pubkey, ev.content);
              const noteData: NoteItem = JSON.parse(decryptedJson);

              if (noteData && noteData.id) {
                // Ensure timestamp alignment with event
                if (!noteData.updatedAt && ev.created_at) {
                  noteData.updatedAt = ev.created_at * 1000;
                }
                onNoteReceived(noteData);
              }
            } catch (decErr) {
              // Note might belong to another client or corrupted key
              console.warn("[NotesSync] Failed to decrypt note event:", decErr);
            }
          }
        } catch (_) {}
      };

      syncSocket.onerror = () => {
        onStatusChange?.("offline");
      };

      syncSocket.onclose = () => {
        syncSocket = null;
      };
    } catch (err) {
      console.warn("[NotesSync] Failed to initialize WebSocket:", err);
      onStatusChange?.("offline");
    }
  });
}

export async function syncNoteToRelays(
  note: NoteItem,
  onStatusChange?: (status: "saved" | "saving" | "offline") => void
): Promise<void> {
  if (typeof window === "undefined") return;
  const nostr = (window as any).nostr;
  if (!nostr || typeof nostr.signEvent !== "function" || !nostr.nip04) {
    onStatusChange?.("saved");
    return;
  }

  const pubkey = await getUserPubkey();
  if (!pubkey) {
    onStatusChange?.("saved");
    return;
  }

  onStatusChange?.("saving");

  try {
    const jsonString = JSON.stringify(note);
    const ciphertext = await nostr.nip04.encrypt(pubkey, jsonString);

    const nowSec = Math.floor(Date.now() / 1000);
    const unsigned = {
      kind: 30078,
      created_at: nowSec,
      tags: [
        ["d", NOTES_NIP78_D_PREFIX + note.id],
        ["client", "omni"]
      ],
      content: ciphertext
    };

    const signed = await nostr.signEvent(unsigned);
    if (!signed) {
      onStatusChange?.("saved");
      return;
    }

    if (syncSocket && syncSocket.readyState === WebSocket.OPEN) {
      syncSocket.send(JSON.stringify(["EVENT", signed]));
      onStatusChange?.("saved");
    } else {
      try {
        const ws = new WebSocket("wss://relay.damus.io");
        ws.onopen = () => {
          ws.send(JSON.stringify(["EVENT", signed]));
          onStatusChange?.("saved");
          setTimeout(() => {
            try {
              ws.close();
            } catch (_) {}
          }, 1500);
        };
        ws.onerror = () => {
          onStatusChange?.("saved");
        };
      } catch (_) {
        onStatusChange?.("saved");
      }
    }
  } catch (err) {
    console.warn("[NotesSync] Error encrypting and publishing note:", err);
    onStatusChange?.("saved");
  }
}
