const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    if ((top >> 0) & 1) chk ^= 0x3b6a57b2;
    if ((top >> 1) & 1) chk ^= 0x26508e6d;
    if ((top >> 2) & 1) chk ^= 0x1ea119fa;
    if ((top >> 3) & 1) chk ^= 0x3d4233dd;
    if ((top >> 4) & 1) chk ^= 0x2a1462b3;
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function convertBits(data: number[], fromBits: number, toBits: number, pad = true): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const val of data) {
    acc = (acc << fromBits) | val;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) {
    ret.push((acc << (toBits - bits)) & maxv);
  }
  return ret;
}

export function hexToNpub(hex: string): string {
  if (!hex || hex.length !== 64) return hex;
  try {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    const words = convertBits(bytes, 8, 5, true);
    const hrp = "npub";
    const mod = polymod(hrpExpand(hrp).concat(words).concat([0, 0, 0, 0, 0, 0])) ^ 1;
    const checksum: number[] = [];
    for (let p = 0; p < 6; p++) {
      checksum.push((mod >> (5 * (5 - p))) & 31);
    }
    let result = hrp + "1";
    for (const w of words.concat(checksum)) {
      result += BECH32_CHARSET.charAt(w);
    }
    return result;
  } catch (_) {
    return hex;
  }
}

export function npubToHex(npub: string): string {
  if (!npub || !npub.startsWith("npub1")) return npub;
  try {
    const data = npub.slice(5);
    const words: number[] = [];
    for (let i = 0; i < data.length - 6; i++) {
      const idx = BECH32_CHARSET.indexOf(data[i]);
      if (idx === -1) return npub;
      words.push(idx);
    }
    const bytes = convertBits(words, 5, 8, false);
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (_) {
    return npub;
  }
}
