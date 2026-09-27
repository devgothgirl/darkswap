import { Router, type IRouter } from "express";
import {
  DiscoverTokensQueryParams, DiscoverTokensResponse,
  GetDiscoveredTokenParams, GetDiscoveredTokenResponse,
} from "@workspace/api-zod";
import { heliusAsset, normalizeDiscovery, ProviderError, tokensRequest } from "../lib/token-providers";

const router: IRouter = Router();
const cache = new Map<string, { expires: number; value: unknown }>();
const requests = new Map<string, { count: number; until: number }>();
function limited(ip: string | undefined) {
  const now = Date.now(), key = ip || "unknown", record = requests.get(key);
  if (requests.size > 5000) for (const [id, value] of requests) if (value.until < now) requests.delete(id);
  if (!record || record.until < now) { requests.set(key, { count: 1, until: now + 60_000 }); return false; }
  return ++record.count > 30;
}
function errorResponse(res: any, error: unknown) {
  res.status(error instanceof ProviderError ? error.status : 502).json({ error: error instanceof ProviderError ? error.message : "Token data is temporarily unavailable." });
}
router.get("/explore/tokens", async (req, res) => {
  if (limited(req.ip)) return void res.status(429).json({ error: "Please wait before searching again." });
  const parsed = DiscoverTokensQueryParams.safeParse(req.query);
  if (!parsed.success || !parsed.data.term.trim()) return void res.status(400).json({ error: "Enter a token name, symbol, or mint." });
  const term = parsed.data.term.trim();
  const key = `search:${term.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return void res.json(cached.value);
  try {
    const data = await tokensRequest(`/assets/search?q=${encodeURIComponent(term)}&limit=20`);
    if (!Array.isArray(data.results)) throw new Error("Invalid search response");
    const value = DiscoverTokensResponse.parse({ assets: data.results.map(normalizeDiscovery).filter(Boolean) });
    cache.set(key, { value, expires: Date.now() + 60_000 });
    res.json(value);
  } catch (error) { req.log.warn({ err: error }, "Discovery search failed"); errorResponse(res, error); }
});
router.get("/explore/tokens/:assetId", async (req, res) => {
  if (limited(req.ip)) return void res.status(429).json({ error: "Please wait before requesting another token." });
  const parsed = GetDiscoveredTokenParams.safeParse(req.params);
  if (!parsed.success || !/^[a-zA-Z0-9_-]+$/.test(parsed.data.assetId)) return void res.status(400).json({ error: "Invalid asset ID." });
  const key = `detail:${parsed.data.assetId}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return void res.json(cached.value);
  try {
    const data = await tokensRequest(`/assets/${encodeURIComponent(parsed.data.assetId)}`);
    const asset = normalizeDiscovery(data.asset);
    if (!asset) throw new Error("Invalid asset response");
    let metadata: Record<string, unknown> = { metadataStatus: "unavailable" };
    if (asset.mint) {
      try {
        const chain = await heliusAsset(asset.mint);
        const info = chain.token_info;
        metadata = {
          metadataStatus: "available",
          ...(chain.content?.metadata?.name ? { onChainName: chain.content.metadata.name } : {}),
          ...(chain.content?.metadata?.symbol ? { onChainSymbol: chain.content.metadata.symbol } : {}),
          ...(Number.isInteger(info?.decimals) ? { decimals: info.decimals } : {}),
          ...(info?.decimals !== undefined && Number.isFinite(info?.supply) ? { supply: info.supply / 10 ** info.decimals } : {}),
          ...(info?.mint_authority ? { mintAuthority: info.mint_authority } : {}),
          ...(info?.freeze_authority ? { freezeAuthority: info.freeze_authority } : {}),
        };
      } catch (error) { req.log.warn({ err: error }, "Helius asset metadata unavailable"); }
    }
    const value = GetDiscoveredTokenResponse.parse({ asset, ...(data.asset.description ? { description: data.asset.description } : {}), ...metadata });
    cache.set(key, { value, expires: Date.now() + 60_000 });
    res.json(value);
  } catch (error) { req.log.warn({ err: error }, "Discovery detail failed"); errorResponse(res, error); }
});
export default router;