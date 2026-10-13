// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseSearchQuery,
  isNostrIdentifier,
  decodeNostrEntity,
  bech32Decode,
  wordsToBytes,
  bytesToHex
} from "../src/index";

// Valid test vectors generated with standard bech32/NIP-19 encoding
const NPUB_HEX = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
const NPUB = "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6";
const NOTE_HEX = "d2187dc5cd23b0a195b4b0c62b9bbd1bfcf0e5a55f8db761a6d5acd1c6b4a33e";
const NOTE = "note16gv8m3wdywc2r9d5krrzhxaar070ped9t7xmwcdx6kkdr3455vlqs6qdre";

describe("parseSearchQuery", () => {
  it("splits @author tokens from keywords", () => {
    expect(parseSearchQuery("@bob cat pictures")).toEqual({
      authors: ["bob"],
      keyword: "cat pictures"
    });
  });

  it("handles keyword-only queries", () => {
    expect(parseSearchQuery("nostr client")).toEqual({
      authors: [],
      keyword: "nostr client"
    });
  });

  it("handles author-only queries", () => {
    expect(parseSearchQuery("@satoshi")).toEqual({
      authors: ["satoshi"],
      keyword: ""
    });
  });

  it("supports multiple author tokens", () => {
    expect(parseSearchQuery("@alice @bob hello")).toEqual({
      authors: ["alice", "bob"],
      keyword: "hello"
    });
  });

  it("treats a lone @ as a keyword", () => {
    expect(parseSearchQuery("email me @ home")).toEqual({
      authors: [],
      keyword: "email me @ home"
    });
  });

  it("normalizes keyword casing", () => {
    expect(parseSearchQuery("Bitcoin NEWS")).toEqual({
      authors: [],
      keyword: "bitcoin news"
    });
  });
});

describe("bech32 decode", () => {
  // Official test vectors from BIP-173 (github.com/bitcoin/bips/blob/master/bip-0173.mediawiki)
  const BIP173_VALID = [
    "A12UEL5L",
    "a12uel5l",
    "an83characterlonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1tt5tgs",
    "abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw",
    "11qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqc8247j",
    "split1checkupstagehandshakeupstreamerranterredcaperred2y9e3w",
    "?1ezyfcl"
  ];

  // Official invalid vectors from BIP-173, with the reason each must be rejected.
  // The "overall max length exceeded" vector is intentionally omitted: Nostr NIP-19
  // entities (nprofile/naddr with relay hints) legitimately exceed the 90-char BIP-173
  // limit, so the decoder must not enforce it.
  const BIP173_INVALID: Array<[string, string]> = [
    [" pzry9x0s0muk", "HRP character out of range (0x20)"],
    ["\x7f1axkwrx", "HRP character out of range (0x7F)"],
    ["pzry9x0s0muk", "no separator character"],
    ["1pzry9x0s0muk", "empty HRP"],
    ["x1b4n0q5v", "invalid data character"],
    ["li1dgmt3", "too short checksum"],
    ["A1G7SGD8", "checksum calculated with uppercase form of HRP"],
    ["10a06t8", "empty HRP"],
    ["1qzzfhee", "empty HRP"]
  ];

  it.each(BIP173_VALID)("accepts BIP-173 valid vector %s", (v) => {
    expect(bech32Decode(v)).not.toBeNull();
  });

  it.each(BIP173_INVALID)("rejects BIP-173 invalid vector %j (%s)", (v) => {
    expect(bech32Decode(v)).toBeNull();
  });

  it("decodes npub to the correct hex pubkey", () => {
    const decoded = bech32Decode(NPUB);
    expect(decoded?.hrp).toBe("npub");
    expect(bytesToHex(wordsToBytes(decoded!.words))).toBe(NPUB_HEX);
  });

  it("decodes note to the correct hex event id", () => {
    const decoded = bech32Decode(NOTE);
    expect(decoded?.hrp).toBe("note");
    expect(bytesToHex(wordsToBytes(decoded!.words))).toBe(NOTE_HEX);
  });

  it("rejects invalid bech32 strings", () => {
    expect(bech32Decode("npub1invalid")).toBeNull();
    expect(bech32Decode("")).toBeNull();
  });

  it("fails or changes output when a single data character is corrupted", () => {
    const corrupt = NPUB.slice(0, 20) + (NPUB[20] === "q" ? "p" : "q") + NPUB.slice(21);
    const decoded = bech32Decode(corrupt);
    // Either the checksum catches it (null) or the payload changed, never the original hex
    if (decoded) {
      expect(bytesToHex(wordsToBytes(decoded.words))).not.toBe(NPUB_HEX);
    }
  });

  it("roundtrips case-insensitively", () => {
    const decoded = bech32Decode(NPUB.toUpperCase());
    expect(decoded?.hrp).toBe("npub");
    expect(bytesToHex(wordsToBytes(decoded!.words))).toBe(NPUB_HEX);
  });
});

describe("decodeNostrEntity", () => {
  it("decodes npub entities", () => {
    expect(decodeNostrEntity(NPUB)).toEqual({ type: "npub", hex: NPUB_HEX });
  });

  it("decodes the second official NIP-19 npub example", () => {
    expect(decodeNostrEntity("npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg")).toEqual({
      type: "npub",
      hex: "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e"
    });
  });

  it("rejects nsec (secret keys are never identifiers)", () => {
    // Official NIP-19 nsec example
    expect(decodeNostrEntity("nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5")).toBeNull();
  });

  it("decodes note entities", () => {
    expect(decodeNostrEntity(NOTE)).toEqual({ type: "note", hex: NOTE_HEX });
  });

  it("decodes the official NIP-19 nprofile example with relay TLV hints", () => {
    // TLVs: pubkey 3bf0c63f..., relay wss://r.x.com, relay wss://djbas.sadkb.com
    const decoded = decodeNostrEntity(
      "nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p"
    );
    expect(decoded?.type).toBe("nprofile");
    expect(decoded?.pubkey).toBe(NPUB_HEX);
  });

  it("decodes naddr entities", () => {
    // kind 30023, author 3bf0c63f..., identifier "test-article"
    const decoded = decodeNostrEntity(
      "naddr1qqzqqqr4guqjqwlsccluhy6xxsr6l9a9uhhxf75g85g8a709tprjcn4e42h053vaqgx8getnwskkzun5d93kceg95aju6"
    );
    expect(decoded?.type).toBe("naddr");
    expect(decoded?.kind).toBe(30023);
    expect(decoded?.pubkey).toBe(NPUB_HEX);
    expect(decoded?.identifier).toBe("test-article");
  });

  it("returns null for non-identifier text", () => {
    expect(decodeNostrEntity("hello world")).toBeNull();
    expect(decodeNostrEntity("@bob")).toBeNull();
  });
});

describe("isNostrIdentifier", () => {
  it("accepts npub and note entities", () => {
    expect(isNostrIdentifier(NPUB)).toBe(true);
    expect(isNostrIdentifier(NOTE)).toBe(true);
  });

  it("accepts 64-char hex and NIP-05 addresses", () => {
    expect(isNostrIdentifier(NPUB_HEX)).toBe(true);
    expect(isNostrIdentifier("bob@example.com")).toBe(true);
  });

  it("rejects plain search terms", () => {
    expect(isNostrIdentifier("cat pictures")).toBe(false);
    expect(isNostrIdentifier("@bob")).toBe(false);
    expect(isNostrIdentifier("")).toBe(false);
  });
});
