import { BitArray, List, Ok, Error } from "../../gleam.mjs";
import { zipSync, unzipSync, strToU8 } from "fflate";

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

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value.toArray === "function") return value.toArray();
  return [];
}

export function zip(entries) {
  const files = {};
  for (const entry of asArray(entries)) {
    const path = String(entry[0]);
    files[path] = bitArrayToUint8Array(entry[1]);
  }
  const archive = zipSync(files, { level: 6 });
  return new BitArray(archive);
}

export function unzip(bytes) {
  try {
    const files = unzipSync(bitArrayToUint8Array(bytes));
    const entries = Object.entries(files).map(([path, data]) => [
      path,
      new BitArray(data),
    ]);
    return new Ok(List.fromArray(entries));
  } catch (err) {
    return new Error(String(err && err.message ? err.message : err));
  }
}
