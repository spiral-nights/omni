const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

export function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

export function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (let i = 0; i < data.length; i++) {
    acc = (acc << fromBits) | data[i];
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

export function encodeBech32(hrp: string, dataBytes: Uint8Array): string {
  const words = convertBits(dataBytes, 8, 5, true);
  const hrpExpanded: number[] = [];
  for (let i = 0; i < hrp.length; i++) hrpExpanded.push(hrp.charCodeAt(i) >> 5);
  hrpExpanded.push(0);
  for (let i = 0; i < hrp.length; i++) hrpExpanded.push(hrp.charCodeAt(i) & 31);

  const polymod = bech32Polymod([...hrpExpanded, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum: number[] = [];
  for (let p = 0; p < 6; p++) {
    checksum.push((polymod >> (5 * (5 - p))) & 31);
  }
  return hrp + "1" + [...words, ...checksum].map((d) => BECH32_CHARSET[d]).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function encodeNaddr(params: { identifier: string; pubkey: string; kind: number; relays?: string[] }): string {
  const chunks: number[] = [];
  const dBytes = new TextEncoder().encode(params.identifier);
  chunks.push(0, dBytes.length, ...Array.from(dBytes));

  for (const r of (params.relays || []).slice(0, 3)) {
    const rBytes = new TextEncoder().encode(r);
    if (rBytes.length <= 255) {
      chunks.push(1, rBytes.length, ...Array.from(rBytes));
    }
  }

  const pkBytes = hexToBytes(params.pubkey);
  if (pkBytes.length === 32) {
    chunks.push(2, 32, ...Array.from(pkBytes));
  }

  const k = params.kind >>> 0;
  chunks.push(3, 4, (k >>> 24) & 0xff, (k >>> 16) & 0xff, (k >>> 8) & 0xff, k & 0xff);

  return encodeBech32("naddr", new Uint8Array(chunks));
}
