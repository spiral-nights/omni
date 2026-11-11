import { schnorr, secp256k1 } from "@noble/curves/secp256k1";
import { Ok, Error } from "../../gleam.mjs";

function bytesToHex(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function generate_private_key() {
  const bytes = schnorr.utils.randomPrivateKey();
  return bytesToHex(bytes);
}

export function get_public_key(privateKeyHex) {
  try {
    if (typeof privateKeyHex !== "string" || !/^[0-9a-fA-F]{64}$/.test(privateKeyHex.trim())) {
      return new Error(undefined);
    }
    const pub = schnorr.getPublicKey(privateKeyHex.trim());
    return new Ok(bytesToHex(pub));
  } catch (_e) {
    return new Error(undefined);
  }
}

export function schnorr_sign(messageHashHex, privateKeyHex) {
  try {
    if (
      typeof messageHashHex !== "string" ||
      !/^[0-9a-fA-F]{64}$/.test(messageHashHex.trim()) ||
      typeof privateKeyHex !== "string" ||
      !/^[0-9a-fA-F]{64}$/.test(privateKeyHex.trim())
    ) {
      return new Error(undefined);
    }
    const sig = schnorr.sign(messageHashHex.trim(), privateKeyHex.trim());
    return new Ok(bytesToHex(sig));
  } catch (_e) {
    return new Error(undefined);
  }
}

export function schnorr_verify(signatureHex, messageHashHex, publicKeyHex) {
  try {
    if (
      typeof signatureHex !== "string" ||
      !/^[0-9a-fA-F]{128}$/.test(signatureHex.trim()) ||
      typeof messageHashHex !== "string" ||
      !/^[0-9a-fA-F]{64}$/.test(messageHashHex.trim()) ||
      typeof publicKeyHex !== "string" ||
      !/^[0-9a-fA-F]{64}$/.test(publicKeyHex.trim())
    ) {
      return false;
    }
    return schnorr.verify(signatureHex.trim(), messageHashHex.trim(), publicKeyHex.trim());
  } catch (_e) {
    return false;
  }
}

export function get_shared_secret(privateKeyHex, publicKeyHex) {
  try {
    const priv = privateKeyHex.trim();
    let pub = publicKeyHex.trim();
    if (pub.length === 64) {
      pub = "02" + pub;
    }
    const shared = secp256k1.getSharedSecret(priv, pub);
    const sharedX = shared.slice(1, 33);
    return new Ok(bytesToHex(sharedX));
  } catch (_e) {
    return new Error(undefined);
  }
}
