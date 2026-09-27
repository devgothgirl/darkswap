import { createHmac } from "node:crypto";

export class ProviderError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

type DiscoveryRaw = {
  assetId?: string; name?: string; symbol?: string; category?: string; imageUrl?: string | null;
  primaryVariant?: { mint?: string; trustTier?: string; market?: { logoURI?: string } } | null;
  stats?: Record<string, number | null>;
  description?: string;
};

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeDiscovery(asset: DiscoveryRaw) {
  if (!asset.assetId || !asset.name || !asset.symbol) return null;
  return {
    assetId: asset.assetId, name: asset.name, symbol: asset.symbol,
    ...(asset.category ? { category: asset.category } : {}),
    ...(asset.primaryVariant?.mint ? { mint: asset.primaryVariant.mint } : {}),
    ...(asset.imageUrl || asset.primaryVariant?.market?.logoURI ? { icon: asset.imageUrl || asset.primaryVariant?.market?.logoURI } : {}),
    ...(asset.primaryVariant?.trustTier ? { trustTier: asset.primaryVariant.trustTier } : {}),
    ...(number(asset.stats?.price) !== undefined ? { price: number(asset.stats?.price) } : {}),
    ...(number(asset.stats?.priceChange24hPercent) !== undefined ? { change24h: number(asset.stats?.priceChange24hPercent) } : {}),
    ...(number(asset.stats?.volume24hUSD) !== undefined ? { volume24h: number(asset.stats?.volume24hUSD) } : {}),
    ...(number(asset.stats?.marketCap) !== undefined ? { marketCap: number(asset.stats?.marketCap) } : {}),
    ...(number(asset.stats?.liquidity) !== undefined ? { liquidity: number(asset.stats?.liquidity) } : {}),
  };
}

export async function tokensRequest(path: string): Promise<any> {
  const key = process.env.TOKENS_XYZ_API_KEY;
  if (!key) throw new ProviderError("Tokens.xyz is not configured.", 503);
  let response: Response;
  try {
    response = await fetch(`https://api.tokens.xyz/v1${path}`, {
      headers: { "x-api-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch { throw new ProviderError("Tokens.xyz is temporarily unreachable."); }
  if (!response.ok) throw new ProviderError(response.status === 404 ? "Asset not found." : "Token market data is temporarily unavailable.", response.status === 404 ? 404 : 502);
  return response.json();
}

export async function heliusAsset(mint: string): Promise<any> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new ProviderError("Helius is not configured.", 503);
  let response: Response;
  try {
    response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "asset", method: "getAsset", params: { id: mint } }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch { throw new ProviderError("Helius is temporarily unreachable."); }
  if (!response.ok) throw new ProviderError("On-chain metadata is temporarily unavailable.");
  const data = await response.json() as { result?: unknown; error?: unknown };
  if (data.error || !data.result) throw new ProviderError("On-chain metadata is unavailable.");
  return data.result;
}

export async function okxRequest(path: string, params: URLSearchParams): Promise<any> {
  const key = process.env.OKX_API_KEY;
  const secret = process.env.OKX_API_SECRET;
  const passphrase = process.env.OKX_API_PASSPHRASE;
  if (!key || !secret || !passphrase) throw new ProviderError("OKX DEX is not configured.", 503);
  const requestPath = `/api/v6/dex/aggregator/${path}?${params.toString()}`;
  const timestamp = new Date().toISOString();
  const signature = createHmac("sha256", secret).update(timestamp + "GET" + requestPath).digest("base64");
  let response: Response;
  try {
    response = await fetch(`https://web3.okx.com${requestPath}`, {
      headers: {
        "OK-ACCESS-KEY": key, "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp, "OK-ACCESS-PASSPHRASE": passphrase,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new ProviderError("OKX DEX is temporarily unreachable."); }
  let data: { code?: string; msg?: string; data?: unknown[] };
  try { data = await response.json() as typeof data; } catch { throw new ProviderError("OKX DEX returned an invalid response."); }
  if (!response.ok || data.code !== "0" || !Array.isArray(data.data)) {
    throw new ProviderError(response.status === 401 || response.status === 403 ? "OKX DEX credentials were rejected." : data.msg?.slice(0, 200) || "OKX DEX cannot route this swap.", response.status === 401 || response.status === 403 ? 503 : 422);
  }
  return data.data;
}