import { Router, type Request, type Response } from "express";
import {
  DiscoveryError, DiscoveryService, StonkfunClient, parseDiscoveryQuery, validMint,
  type LaunchDiscoveryConfig, type DiscoveryReview,
} from "../lib/stonkfun";
import { discoveryCatalog } from "../lib/launch/catalog";

const service = new DiscoveryService(new StonkfunClient(), discoveryCatalog);

// Public config/adapter callers must use this same policy, never a symbol lookup.
export async function getDiscoveryPairs(config: LaunchDiscoveryConfig, reviews: DiscoveryReview[]) {
  return (await service.pairs(config, reviews)).response;
}
type Dependencies = {
  service: DiscoveryService;
  loadConfig: () => Promise<LaunchDiscoveryConfig>;
  loadReviews: () => Promise<DiscoveryReview[]>;
  now?: () => number;
};
export function createStonkfunRouter(dependencies: Dependencies): Router {
  const router = Router();
  const buckets = new Map<string, { count: number; until: number }>();
  const now = dependencies.now ?? Date.now;
  let globalBucket = { count: 0, until: 0 };
  let active = 0;
  const errorResponse = (res: Response, error: unknown) => {
    const known = error instanceof DiscoveryError ? error :
      new DiscoveryError(503, "SERVICE_UNAVAILABLE", "Discovery configuration or service is temporarily unavailable.");
    res.set("X-Discovery-State", "error");
    if (known.retryAfter) res.set("Retry-After", String(known.retryAfter));
    res.status(known.status).json({ error: known.message, code: known.code, executionAvailable: false });
  };
  router.use("/stonkfun", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    const time = now();
    if (globalBucket.until <= time) globalBucket = { count: 0, until: time + 60_000 };
    if (active >= 32 || ++globalBucket.count > 600) {
      errorResponse(res, new DiscoveryError(429, "RATE_LIMITED", "Discovery service capacity reached.", 10)); return;
    }
    for (const [key, bucket] of buckets) if (bucket.until <= time) buckets.delete(key);
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let bucket = buckets.get(key);
    if (!bucket && buckets.size >= 2000) {
      errorResponse(res, new DiscoveryError(429, "RATE_LIMITED", "Discovery request capacity reached.", 60)); return;
    }
    if (!bucket) { bucket = { count: 0, until: time + 60_000 }; buckets.set(key, bucket); }
    if (++bucket.count > 120) {
      errorResponse(res, new DiscoveryError(429, "RATE_LIMITED", "Too many discovery requests.", Math.max(1, Math.ceil((bucket.until - time) / 1000)))); return;
    }
    active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once("finish", release); res.once("close", release);
    next();
  });
  const context = async () => {
    const [config, reviews] = await Promise.all([dependencies.loadConfig(), dependencies.loadReviews()]);
    return { config, reviews };
  };
  const handle = (fn: (req: Request) => Promise<{ response: unknown; cacheState: string }>) =>
    async (req: Request, res: Response) => {
      try {
        const result = await fn(req);
        res.set("X-Discovery-State", result.cacheState).json(result.response);
      } catch (error) { errorResponse(res, error); }
    };
  router.get("/stonkfun/tokens", handle(async req => {
    const query = parseDiscoveryQuery(req.query);
    const { config, reviews } = await context();
    return dependencies.service.tokens(query, config, reviews);
  }));
  router.get("/stonkfun/pairs", handle(async req => {
    if (Object.keys(req.query).length) throw new DiscoveryError(400, "INVALID_INPUT", "Pair queries are unsupported.");
    const { config, reviews } = await context();
    return dependencies.service.pairs(config, reviews);
  }));
  router.get("/stonkfun/tokens/:mint", handle(async req => {
    if (Object.keys(req.query).length || !validMint(req.params.mint)) throw new DiscoveryError(400, "INVALID_INPUT", "Invalid mint or unsupported detail query.");
    const { config, reviews } = await context();
    return dependencies.service.token(req.params.mint, config, reviews);
  }));
  return router;
}
const router = createStonkfunRouter({
  service,
  loadConfig: async () => (await import("../lib/launch/config")).loadLaunchConfig(),
  loadReviews: async () => (await import("../lib/launch/config")).loadLaunchReviews(),
});
export default router;