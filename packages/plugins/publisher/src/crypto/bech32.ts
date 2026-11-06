import {
  bech32Polymod,
  convertBits,
  bech32Encode,
  hexToBytes,
  encodeNaddr
} from "@omni/types";

export const encodeBech32 = (hrp: string, dataBytes: Uint8Array): string => bech32Encode(hrp, dataBytes);
export { bech32Polymod, convertBits, hexToBytes, encodeNaddr };
