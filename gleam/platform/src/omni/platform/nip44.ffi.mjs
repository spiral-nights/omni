import { secp256k1 } from "@noble/curves/secp256k1";
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

export async function nip44_encrypt(_priv, _pub, _plaintext) {
  return new Error("NIP-44 encryption is not yet implemented");
}

export async function nip44_decrypt(_priv, _pub, _ciphertext) {
  return new Error("NIP-44 decryption is not yet implemented");
}
