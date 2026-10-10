import express from "express";
import type { AddressInfo } from "node:net";
import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction, Router } from "express";
import { SOLANA_ZEC_ASSET, SOLANA_ZEC_MINT } from "../lib/near-zec";

/** A provider catalog covering every normalization rule the routes apply. */
export const CATALOG = [
  { assetId: "nep141:sol.omft.near", blockchain: "sol", symbol: "SOL", decimals: 9, price: 150 },
  { assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", blockchain: "sol", symbol: "USDC", decimals: 6, contractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", price: 1 },
  // A Solana token without a mint is dropped entirely, as before.
  { assetId: "nep141:sol-unlisted.omft.near", blockchain: "sol", symbol: "NOMINT", decimals: 6, price: 1 },
  // A newer prefix stays excluded even with an otherwise valid mint.
  { assetId: "1cs_v1:sol:spl:So11111111111111111111111111111111111111112", blockchain: "sol", symbol: "ZEC", decimals: 8, contractAddress: "So11111111111111111111111111111111111111112", price: 30 },
  { assetId: SOLANA_ZEC_ASSET, blockchain: "sol", symbol: "ZEC", decimals: 8, contractAddress: SOLANA_ZEC_MINT, price: 1200 },
  { assetId: "nep141:eth.omft.near", blockchain: "eth", symbol: "ETH", decimals: 18, price: 3000 },
  { assetId: "nep141:arb.omft.near", blockchain: "arb", symbol: "ETH", decimals: 18, price: 3000 },
  { assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", blockchain: "base", symbol: "USDC", decimals: 6, contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", price: 1 },
  // Missing contract data on an EVM network never implies a native coin.
  { assetId: "nep141:base-unlisted.omft.near", blockchain: "base", symbol: "NOCONTRACT", decimals: 18, price: 1 },
  { assetId: "nep245:v2_1.omni.hot.tg:137_11111111111111111111", blockchain: "pol", symbol: "POL", decimals: 18, price: 0.5 },
  { assetId: "nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g", blockchain: "bsc", symbol: "USDT", decimals: 18, contractAddress: "0x55d398326f99059ff775485246999027b3197955", price: 1 },
  { assetId: "nep141:wrap.near", blockchain: "near", symbol: "wNEAR", decimals: 24, price: 3 },
  { assetId: "nep141:btc.omft.near", blockchain: "btc", symbol: "BTC", decimals: 8, price: 60000 },
  { assetId: "nep141:zec.omft.near", blockchain: "zec", symbol: "ZEC", decimals: 8, price: 100 },
  { assetId: "nep141:fake-zec.omft.near", blockchain: "zec", symbol: "ZEC", decimals: 8, price: 100 },
  { assetId: "nep141:zec.omft.near", blockchain: "zec", symbol: "ZEC", decimals: 18, price: 100 },
];

export type CatalogToken = {
  id: string; symbol: string; chain: string; chainName: string; decimals: number;
  contractAddress?: string; price?: number; native?: boolean; originEligible?: boolean;
};

type ProviderCall = { path: string; method: string; body?: Record<string, unknown> };

/**
 * Serves the NEAR route on a local port and stubs the provider: the catalog
 * above for /tokens, and the given status for /quote (a 400 means no route).
 */
export async function startNearRoute(router: Router, quoteStatus = 400) {
  const nativeFetch = globalThis.fetch;
  const calls: ProviderCall[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "127.0.0.1") return nativeFetch(input, init);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ path: url.pathname, method: init?.method ?? "GET", body });
    if (url.pathname === "/v0/tokens") return Response.json(CATALOG);
    if (url.pathname === "/v0/quote") return Response.json({ message: "No confidential route" }, { status: quoteStatus });
    throw new Error(`Unexpected provider call: ${url.pathname}`);
  };
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
    Object.assign(req, { log: { warn() {}, error() {}, info() {} } });
    next();
  });
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let client = 1;
  const headers = () => ({ "Content-Type": "application/json", "X-Forwarded-For": `192.0.2.${client++}` });
  return {
    calls,
    async tokens(params: Record<string, string>): Promise<CatalogToken[]> {
      const response = await nativeFetch(`${baseUrl}/swap/near/tokens?${new URLSearchParams(params)}`, { headers: headers() });
      if (response.status !== 200) throw new Error(`tokens returned ${response.status}`);
      return (await response.json() as { tokens: CatalogToken[] }).tokens;
    },
    async quote(body: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
      const response = await nativeFetch(`${baseUrl}/swap/near/quote`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    },
    async close() {
      globalThis.fetch = nativeFetch;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

export const SOL = "nep141:sol.omft.near";
export const ZEC_SOL = SOLANA_ZEC_ASSET;
export const USDC_SOL = "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near";
export const ETH = "nep141:eth.omft.near";
export const ETH_ARB = "nep141:arb.omft.near";
export const USDC_BASE = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
export const BASE_NO_CONTRACT = "nep141:base-unlisted.omft.near";
export const POL = "nep245:v2_1.omni.hot.tg:137_11111111111111111111";
export const USDT_BSC = "nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g";
export const SOLANA_ADDRESS = "11111111111111111111111111111111";
export const EVM_ADDRESS = "0xAbCdEf1111111111111111111111111111111111";
export const NO_ROUTE = "No Privacy swap route is available for these details. Check the addresses and amount.";
export const INVALID_SELECTION = "Select supported assets and valid addresses for both networks.";
