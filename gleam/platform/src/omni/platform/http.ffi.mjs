import { Ok, Error } from "../../gleam.mjs";

export async function fetch_text(url) {
  try {
    const response = await globalThis.fetch(String(url), { redirect: "follow" });
    if (!response.ok) return new Error(`HTTP ${response.status}`);
    return new Ok(await response.text());
  } catch (err) {
    return new Error(String(err && err.message ? err.message : err));
  }
}

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

export async function fetch_bytes(url) {
  try {
    const response = await globalThis.fetch(String(url), { redirect: "follow" });
    if (!response.ok) return new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    return new Ok(new BitArray(new Uint8Array(buffer)));
  } catch (err) {
    return new Error(String(err && err.message ? err.message : err));
  }
}

export async function put_bytes(url, body, headers) {
  try {
    const headerMap = {};
    for (const pair of asArray(headers)) {
      headerMap[String(pair[0])] = String(pair[1]);
    }
    const response = await globalThis.fetch(String(url), {
      method: "PUT",
      headers: headerMap,
      body: bitArrayToUint8Array(body),
    });
    if (!response.ok) return new Error(`HTTP ${response.status}`);
    return new Ok(response.status);
  } catch (err) {
    return new Error(String(err && err.message ? err.message : err));
  }
}
