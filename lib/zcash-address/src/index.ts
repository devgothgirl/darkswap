/**
 * ZIP 316 validation adapted from NEAR Foundation's MIT-licensed Intents SDK:
 * https://github.com/defuse-protocol/sdk-monorepo/blob/main/packages/intents-sdk/src/lib/zcash-unified-address.ts
 * Unlike its general validator, DarkSwap requires an Orchard receiver and
 * rejects ALL transparent receivers and unsupported receiver/metadata types.
 * No receiver is extracted, rewritten or sent to a transparent fallback.
 */
import { blake2b } from "@noble/hashes/blake2b";
import { bech32m } from "@scure/base";

export const NATIVE_ZEC_ASSET = "nep141:zec.omft.near";
export const MAX_ZCASH_ADDRESS_LENGTH = 512;
export const SHIELDED_ZCASH_HINT = "Use a shielded-only mainnet Unified Address (u1) with an Orchard receiver and no transparent receiver. Mixed, transparent and Sapling-only addresses are not accepted.";

/** Checksum, network, F4Jumble padding, canonical receiver list and policy. */
export function isShieldedZcashAddress(address: string): boolean {
  if (address.length > MAX_ZCASH_ADDRESS_LENGTH || !address.startsWith("u1") ||
      address !== address.toLowerCase()) return false;
  try {
    const decoded = bech32m.decodeToBytes(address);
    if (decoded.prefix !== "u" || decoded.bytes.length < 48) return false;
    const bytes = unjumble(decoded.bytes);
    const end = bytes.length - 16;
    if (bytes[end] !== 117) return false; // HRP "u" + 15 zero padding bytes
    for (let i = end + 1; i < bytes.length; i++) if (bytes[i] !== 0) return false;
    let offset = 0;
    let previous = -1;
    let orchard = false;
    while (offset < end) {
      const type = compactSize(bytes, offset, end);
      if (!type || type.value <= previous) return false;
      previous = type.value;
      const length = compactSize(bytes, type.next, end);
      if (!length || length.next + length.value > end) return false;
      // Known shielded receiver types only; reject transparent and unknown
      // types/metadata rather than claiming unsupported pools are shielded.
      if ((type.value !== 2 && type.value !== 3) || length.value !== 43) return false;
      orchard ||= type.value === 3;
      offset = length.next + length.value;
    }
    return offset === end && orchard;
  } catch {
    return false;
  }
}

/** Canonical Bitcoin CompactSize; uint64 cannot occur in our bounded input. */
function compactSize(bytes: Uint8Array, at: number, end: number): { value: number; next: number } | null {
  if (at >= end) return null;
  const first = bytes[at]!;
  if (first < 253) return { value: first, next: at + 1 };
  if (first === 255) return null;
  const count = first === 253 ? 2 : 4;
  if (at + count + 1 > end) return null;
  let value = 0;
  for (let i = 0; i < count; i++) value += bytes[at + i + 1]! * 2 ** (8 * i);
  if (value < (count === 2 ? 253 : 65536) || value > 0x2000000) return null;
  return { value, next: at + count + 1 };
}

function personalization(kind: "G" | "H", round: number, block: number): Uint8Array {
  const result = new Uint8Array(16);
  const prefix = `UA_F4Jumble_${kind}`;
  for (let i = 0; i < prefix.length; i++) result[i] = prefix.charCodeAt(i);
  result[13] = round;
  result[14] = block & 255;
  result[15] = block >> 8;
  return result;
}

function xor(target: Uint8Array, mask: Uint8Array): void {
  for (let i = 0; i < target.length; i++) target[i] = target[i]! ^ mask[i]!;
}

/** ZIP 316 F4Jumble inverse, same four BLAKE2b rounds as librustzcash. */
function unjumble(payload: Uint8Array): Uint8Array {
  const leftLength = Math.min(64, Math.floor(payload.length / 2));
  const left = payload.slice(0, leftLength);
  const right = payload.slice(leftLength);
  for (const round of [1, 0]) {
    xor(left, blake2b(right, { personalization: personalization("H", round, 0), dkLen: left.length }));
    for (let block = 0; block * 64 < right.length; block++) {
      const chunk = right.subarray(block * 64, Math.min((block + 1) * 64, right.length));
      xor(chunk, blake2b(left, { personalization: personalization("G", round, block), dkLen: 64 }));
    }
  }
  const result = new Uint8Array(payload.length);
  result.set(left);
  result.set(right, leftLength);
  return result;
}
