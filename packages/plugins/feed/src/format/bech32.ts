import {
  bech32Decode,
  wordsToBytes,
  bytesToHex,
  decodeNostrEntity,
  DecodedNostrEntity
} from "@omni/types";

export { bech32Decode, wordsToBytes, bytesToHex, decodeNostrEntity };
export type { DecodedNostrEntity };

export function extractQuotedNoteId(content: string): string | null {
  if (!content) return null;
  const match = content.match(/(?:nostr:)?((?:note|nevent)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{20,})/i);
  if (!match) return null;
  const decoded = decodeNostrEntity(match[1]);
  if (!decoded) return null;
  return decoded.hex || decoded.eventId || decoded.pubkey || null;
}
