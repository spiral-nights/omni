import { secp256k1 } from "@noble/curves/secp256k1";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { Ok, Error } from "../../gleam.mjs";

function getCrypto() {
  if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new globalThis.Error("WebCrypto API is not available");
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function nip04_encrypt(privateKeyHex, recipientPubkeyHex, plaintext) {
  try {
    const crypto = getCrypto();
    const priv = privateKeyHex.trim();
    let pub = recipientPubkeyHex.trim();
    if (pub.length === 64) {
      pub = "02" + pub;
    }
    const shared = secp256k1.getSharedSecret(priv, pub);
    const sharedX = shared.slice(1, 33);

    const key = await crypto.subtle.importKey(
      "raw",
      sharedX,
      { name: "AES-CBC" },
      false,
      ["encrypt"]
    );

    const iv = new Uint8Array(16);
    crypto.getRandomValues(iv);

    const encoded = new TextEncoder().encode(plaintext);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      key,
      encoded
    );

    const b64Encrypted = bytesToBase64(new Uint8Array(encrypted));
    const b64Iv = bytesToBase64(iv);
    return new Ok(`${b64Encrypted}?iv=${b64Iv}`);
  } catch (err) {
    return new Error(String(err && err.message ? err.message : err));
  }
}

export async function nip04_decrypt(privateKeyHex, senderPubkeyHex, ciphertext) {
  try {
    const parts = ciphertext.split("?iv=");
    if (parts.length !== 2) {
      return new Error("Invalid NIP-04 ciphertext format (missing ?iv=)");
    }
    const [b64Encrypted, b64Iv] = parts;

    const crypto = getCrypto();
    const priv = privateKeyHex.trim();
    let pub = senderPubkeyHex.trim();
    if (pub.length === 64) {
      pub = "02" + pub;
    }
    const shared = secp256k1.getSharedSecret(priv, pub);
    const sharedX = shared.slice(1, 33);

    const key = await crypto.subtle.importKey(
      "raw",
      sharedX,
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );

    const iv = base64ToBytes(b64Iv);
    const encrypted = base64ToBytes(b64Encrypted);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      key,
      encrypted
    );

    return new Ok(new TextDecoder().decode(decrypted));
  } catch (err) {
    return new Error(String(err && err.message ? err.message : err));
  }
}

const NIP44_VERSION = 2;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function hexToBytes(hex) {
  const clean = String(hex).trim().replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function conversationKey(privHex, pubHex) {
  let pub = String(pubHex).trim();
  if (pub.length === 64) pub = "02" + pub;
  const shared = secp256k1.getSharedSecret(hexToBytes(privHex), pub, true);
  const sharedX = shared.slice(1, 33);
  return hmac(sha256, encoder.encode("nip44-v2"), sharedX);
}

function expand(prk, info, length) {
  const chunks = [];
  let prev = new Uint8Array(0);
  let counter = 1;
  let total = 0;
  while (total < length) {
    prev = hmac(sha256, prk, concatBytes(prev, info, new Uint8Array([counter])));
    chunks.push(prev);
    total += prev.length;
    counter += 1;
  }
  return concatBytes(...chunks).slice(0, length);
}

function calcPaddedLen(len) {
  if (len <= 32) return 32;
  const nextPower = 1 << (Math.floor(Math.log2(len - 1)) + 1);
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * Math.ceil(len / chunk);
}

function pad(plaintextBytes) {
  const unpaddedLen = plaintextBytes.length;
  const paddedLen = calcPaddedLen(unpaddedLen);
  const out = new Uint8Array(2 + paddedLen);
  out[0] = (unpaddedLen >> 8) & 0xff;
  out[1] = unpaddedLen & 0xff;
  out.set(plaintextBytes, 2);
  return out;
}

function unpad(padded) {
  const len = (padded[0] << 8) | padded[1];
  if (len < 0 || len > padded.length - 2) throw new Error("Invalid padding");
  return padded.slice(2, 2 + len);
}

function rotl(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function chachaBlock(key, counter, nonce) {
  const constants = new Uint32Array([
    0x61707865, 0x3320646e, 0x79622d32, 0x6b206574,
  ]);
  const state = new Uint32Array(16);
  state.set(constants, 0);
  for (let i = 0; i < 8; i += 1) {
    state[4 + i] =
      (key[i * 4] |
        (key[i * 4 + 1] << 8) |
        (key[i * 4 + 2] << 16) |
        (key[i * 4 + 3] << 24)) >>>
      0;
  }
  state[12] = counter >>> 0;
  state[13] =
    (nonce[0] | (nonce[1] << 8) | (nonce[2] << 16) | (nonce[3] << 24)) >>> 0;
  state[14] =
    (nonce[4] | (nonce[5] << 8) | (nonce[6] << 16) | (nonce[7] << 24)) >>> 0;
  state[15] =
    (nonce[8] | (nonce[9] << 8) | (nonce[10] << 16) | (nonce[11] << 24)) >>> 0;

  const working = state.slice();
  const qr = (a, b, c, d) => {
    working[a] = (working[a] + working[b]) >>> 0;
    working[d] = rotl(working[d] ^ working[a], 16);
    working[c] = (working[c] + working[d]) >>> 0;
    working[b] = rotl(working[b] ^ working[c], 12);
    working[a] = (working[a] + working[b]) >>> 0;
    working[d] = rotl(working[d] ^ working[a], 8);
    working[c] = (working[c] + working[d]) >>> 0;
    working[b] = rotl(working[b] ^ working[c], 7);
  };
  for (let i = 0; i < 10; i += 1) {
    qr(0, 4, 8, 12);
    qr(1, 5, 9, 13);
    qr(2, 6, 10, 14);
    qr(3, 7, 11, 15);
    qr(0, 5, 10, 15);
    qr(1, 6, 11, 12);
    qr(2, 7, 8, 13);
    qr(3, 4, 9, 14);
  }
  for (let i = 0; i < 16; i += 1) working[i] = (working[i] + state[i]) >>> 0;
  const out = new Uint8Array(64);
  for (let i = 0; i < 16; i += 1) {
    out[i * 4] = working[i] & 0xff;
    out[i * 4 + 1] = (working[i] >>> 8) & 0xff;
    out[i * 4 + 2] = (working[i] >>> 16) & 0xff;
    out[i * 4 + 3] = (working[i] >>> 24) & 0xff;
  }
  return out;
}

function chacha20(key, nonce, data) {
  const out = new Uint8Array(data.length);
  for (let offset = 0, counter = 0; offset < data.length; counter += 1) {
    const block = chachaBlock(key, counter, nonce);
    for (let i = 0; i < 64 && offset < data.length; i += 1, offset += 1) {
      out[offset] = data[offset] ^ block[i];
    }
  }
  return out;
}

function messageKeys(conversation, nonce) {
  const keys = expand(conversation, nonce, 76);
  return {
    chachaKey: keys.slice(0, 32),
    chachaNonce: keys.slice(32, 44),
    hmacKey: keys.slice(44, 76),
  };
}

export async function nip44_encrypt(privateKeyHex, recipientPubkeyHex, plaintext) {
  try {
    const conversation = conversationKey(privateKeyHex, recipientPubkeyHex);
    const nonce = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const { chachaKey, chachaNonce, hmacKey } = messageKeys(conversation, nonce);
    const padded = pad(encoder.encode(String(plaintext)));
    const ciphertext = chacha20(chachaKey, chachaNonce, padded);
    const mac = hmac(
      sha256,
      hmacKey,
      concatBytes(new Uint8Array([NIP44_VERSION]), nonce, ciphertext),
    );
    const payload = concatBytes(
      new Uint8Array([NIP44_VERSION]),
      nonce,
      ciphertext,
      mac,
    );
    return new Ok(bytesToBase64(payload));
  } catch (err) {
    return new Error(String(err && err.message ? err.message : err));
  }
}

export async function nip44_decrypt(privateKeyHex, senderPubkeyHex, ciphertext) {
  try {
    const payload = base64ToBytes(String(ciphertext).trim());
    if (payload.length < 1 + 32 + 32) return new Error("Invalid payload");
    if (payload[0] !== NIP44_VERSION) return new Error("Unsupported version");
    const nonce = payload.slice(1, 33);
    const ciphertextPart = payload.slice(33, payload.length - 32);
    const mac = payload.slice(payload.length - 32);

    const conversation = conversationKey(privateKeyHex, senderPubkeyHex);
    const { chachaKey, chachaNonce, hmacKey } = messageKeys(conversation, nonce);
    const expectedMac = hmac(
      sha256,
      hmacKey,
      concatBytes(new Uint8Array([NIP44_VERSION]), nonce, ciphertextPart),
    );
    if (bytesToHex(mac) !== bytesToHex(expectedMac)) {
      return new Error("Invalid MAC");
    }
    const padded = chacha20(chachaKey, chachaNonce, ciphertextPart);
    return new Ok(decoder.decode(unpad(padded)));
  } catch (err) {
    return new Error(String(err && err.message ? err.message : err));
  }
}
