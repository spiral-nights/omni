import { BitArray } from "../../gleam.mjs";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";

function bitArrayToUint8Array(bitArray) {
  if (bitArray.bitOffset === 0 && bitArray.rawBuffer.length === bitArray.byteSize) {
    return bitArray.rawBuffer;
  }
  const buffer = new Uint8Array(bitArray.byteSize);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = bitArray.byteAt(i);
  }
  return buffer;
}

export function random_bytes(count) {
  const n = Math.max(0, count);
  const bytes = new Uint8Array(n);
  if (n > 0) {
    if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return new BitArray(bytes);
}

export function sha256(bitArray) {
  const bytes = bitArrayToUint8Array(bitArray);
  const digest = nobleSha256(bytes);
  return new BitArray(digest);
}

export function sha256_hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = nobleSha256(bytes);
  let hex = "";
  for (let i = 0; i < digest.length; i++) {
    hex += digest[i].toString(16).padStart(2, "0");
  }
  return hex;
}
