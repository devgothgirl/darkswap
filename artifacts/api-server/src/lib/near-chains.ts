import { isShieldedZcashAddress, NATIVE_ZEC_ASSET } from "@workspace/zcash-address";

// Shared NEAR Intents network rules for the confidential swap and bridge
// routes. One list feeds asset selection, address validation and the incident
// gate so they cannot drift apart.

/** Networks a NEAR Intents route may start or end on. */
export const NEAR_ROUTE_CHAINS: ReadonlySet<string> = new Set(["sol", "near", "eth", "arb", "base", "op", "pol", "bsc", "zec"]);

export const NEAR_CHAIN_NAMES: Readonly<Record<string, string>> = {
  sol: "Solana", near: "NEAR", eth: "Ethereum", arb: "Arbitrum",
  base: "Base", op: "Optimism", pol: "Polygon", bsc: "BNB Chain", zec: "Zcash",
};

const EVM_CHAINS: ReadonlySet<string> = new Set(["eth", "arb", "base", "op", "pol", "bsc"]);

/**
 * Networks that may be enabled as an origin. NEAR stays off until a real order
 * confirms what a wallet must send and the deposit address format.
 */
export const NEAR_ORIGIN_CAPABLE_CHAINS: ReadonlySet<string> = new Set(["sol", ...EVM_CHAINS]);

/**
 * Exact native-coin asset IDs, confirmed against a live public 1Click
 * GET /v0/tokens response on 2026-10-10. A token is native only by this exact
 * identity; a catalog entry that omits contractAddress is not native.
 */
export const NEAR_NATIVE_ASSETS: Readonly<Record<string, string>> = {
  sol: "nep141:sol.omft.near",
  eth: "nep141:eth.omft.near",
  arb: "nep141:arb.omft.near",
  base: "nep141:base.omft.near",
  op: "nep245:v2_1.omni.hot.tg:10_11111111111111111111",
  pol: "nep245:v2_1.omni.hot.tg:137_11111111111111111111",
  bsc: "nep245:v2_1.omni.hot.tg:56_11111111111111111111",
  zec: NATIVE_ZEC_ASSET,
};

export function isEvmChain(chain: string): boolean {
  return EVM_CHAINS.has(chain);
}

export function isNativeAsset(chain: string, assetId: string): boolean {
  return Object.hasOwn(NEAR_NATIVE_ASSETS, chain) && NEAR_NATIVE_ASSETS[chain] === assetId;
}

export function solanaAddress(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  let number = 0n;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  for (const char of value) number = number * 58n + BigInt(alphabet.indexOf(char));
  let bytes = 0;
  while (number > 0n) { bytes++; number >>= 8n; }
  return bytes + (value.match(/^1+/)?.[0].length ?? 0) === 32;
}

/** Whether a value has the address shape of the given route network. */
export function chainAddress(chain: string, value: string): boolean {
  if (chain === "zec") return isShieldedZcashAddress(value);
  if (chain === "sol") return solanaAddress(value);
  if (chain === "near") return /^(?:[a-z0-9_-]+(?:[.-][a-z0-9_-]+)*\.near|[0-9a-f]{64})$/.test(value);
  if (EVM_CHAINS.has(chain)) return /^0x[0-9a-fA-F]{40}$/.test(value);
  return false;
}

/** Whether a value has the shape of a deposit address on any origin-capable network. */
export function originAddressShape(value: string): boolean {
  return [...NEAR_ORIGIN_CAPABLE_CHAINS].some(chain => chainAddress(chain, value));
}

/**
 * Compares two copies of one issued address. EVM addresses are hexadecimal and
 * may be echoed with a different checksum case; Solana and NEAR stay exact.
 * Use only for repeated copies of a deposit address, never for recipient or
 * refund addresses chosen by the user.
 */
export function sameAddress(chain: string, a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (EVM_CHAINS.has(chain)) return chainAddress(chain, a) && chainAddress(chain, b) && a.toLowerCase() === b.toLowerCase();
  return a === b;
}

type WarnLogger = { warn(details: Record<string, unknown>, message: string): void };

/**
 * Parses NEAR_ORIGIN_CHAINS once. Solana is always enabled; anything that is
 * not an origin-capable route network (including NEAR) is logged and ignored.
 */
export function parseOriginChains(raw: string | undefined, log: WarnLogger): ReadonlySet<string> {
  const origins = new Set(["sol"]);
  for (const entry of (raw ?? "").split(",")) {
    const value = entry.trim().toLowerCase();
    if (!value) continue;
    if (NEAR_ORIGIN_CAPABLE_CHAINS.has(value)) {
      origins.add(value);
      continue;
    }
    log.warn({ value: value.slice(0, 32) }, value === "near"
      ? "NEAR_ORIGIN_CHAINS: NEAR is not an enabled origin; ignored"
      : "NEAR_ORIGIN_CHAINS: unsupported origin network ignored");
  }
  return origins;
}
