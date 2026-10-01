import { z } from "zod";
import type { NearServiceIncident, NearServiceStatus } from "@workspace/api-zod";

// This public, unauthenticated observation is independent of 1Click credentials
// and order lifecycle. Never forward caller headers or follow redirects.
export const NEAR_STATUS_FEED = "https://partners.near-intents.org/api/shield/public/status";
const SOURCE = "https://partners.near-intents.org/shield/status";
const CHAINS = new Set(["sol", "near", "eth", "arb", "base", "op", "pol", "bsc"]);
const CACHE_MS = 30_000;
const FAILURE_CACHE_MS = 10_000;
const FRESH_MS = 60_000;
const POST_CREATE_COOLDOWN_MS = 5_000;
const MAX_BYTES = 256 * 1024;
const text = z.string().min(1).max(160);
const timestamp = z.string().datetime({ offset: true });
const common = {
  id: text,
  scopeType: text,
  scopeValue: text,
  createdAt: timestamp,
};
const feedSchema = z.object({
  activeIncidentCount: z.number().int().min(0).max(500),
  // Only 'active' has been observed. Unknown status meanings remain visible but
  // are never treated as evidence that funding is safe.
  activeIncidents: z.array(z.object({ ...common, status: text, updatedAt: timestamp })).max(500),
  recentlyResolved: z.array(z.object({ ...common, resolvedAt: timestamp })).max(500),
}).superRefine((feed, context) => {
  if (feed.activeIncidentCount !== feed.activeIncidents.length) {
    context.addIssue({ code: "custom", message: "Incident count mismatch" });
  }
  const ids = [...feed.activeIncidents, ...feed.recentlyResolved].map(item => item.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Duplicate incident identifiers" });
});
type Feed = z.infer<typeof feedSchema>;
class InvalidFeed extends Error {}

async function boundedFeed(fetcher: typeof fetch, signal: AbortSignal): Promise<Feed> {
  const response = await fetcher(NEAR_STATUS_FEED, {
    method: "GET", headers: { Accept: "application/json" },
    credentials: "omit", redirect: "error", cache: "no-store", signal,
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Public feed unavailable");
  }
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") ||
      Number(response.headers.get("content-length") ?? "0") > MAX_BYTES || !response.body) {
    void response.body?.cancel().catch(() => {});
    throw new InvalidFeed("Invalid public feed body");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) throw new InvalidFeed("Public feed body too large");
      chunks.push(part.value);
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try {
    return feedSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new InvalidFeed("Invalid public feed schema");
  }
}

/** Injectable adapter instances keep mocked tests isolated from production cache. */
export function createNearServiceStatusAdapter(
  { fetcher = ((...args) => fetch(...args)) as typeof fetch, now = () => Date.now(), timeoutMs = 5_000 }:
  { fetcher?: typeof fetch; now?: () => number; timeoutMs?: number } = {},
) {
  let lastFeed: Feed | undefined;
  let lastSuccess: number | undefined;
  let lastFailure: "invalid" | "unavailable" | undefined;
  let nextRefresh = 0;
  let nextPostCreateRefresh = 0;
  let loading: Promise<void> | undefined;

  async function refresh(): Promise<void> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Race bounds the whole read, including a stalled response body.
      const feed = await Promise.race([
        boundedFeed(fetcher, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("Public feed timed out")); }, timeoutMs);
        }),
      ]);
      lastFeed = feed;
      lastSuccess = now();
      lastFailure = undefined;
      nextRefresh = now() + CACHE_MS;
    } catch (error) {
      lastFailure = error instanceof InvalidFeed ? "invalid" : "unavailable";
      nextRefresh = now() + FAILURE_CACHE_MS;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return async function getStatus(fromChain?: string, toChain?: string, postCreate = false): Promise<NearServiceStatus> {
    // One extra bounded revalidation after creation, shared across simultaneous
    // completions and capped at once per 5s per process; failures retain backoff.
    const force = postCreate && !lastFailure && now() >= nextPostCreateRefresh;
    if (!loading && (now() >= nextRefresh || force)) {
      if (postCreate) nextPostCreateRefresh = now() + POST_CREATE_COOLDOWN_MS;
      loading = refresh().finally(() => { loading = undefined; });
    }
    if (loading) await loading;
    const expired = lastSuccess !== undefined && now() >= lastSuccess + FRESH_MS;
    const state: NearServiceStatus["state"] = expired ? "stale" : lastFailure ?? (lastFeed ? "fresh" : "unavailable");
    const knownRoute = !!fromChain && !!toChain && CHAINS.has(fromChain) && CHAINS.has(toChain);
    const impact = (scopeType: string, scopeValue: string): NearServiceIncident["impact"] => {
      if (!knownRoute || !["chain", "chain_all"].includes(scopeType) || !CHAINS.has(scopeValue)) return "unverified";
      return scopeValue === fromChain || scopeValue === toChain ? "matching" : "unrelated";
    };
    const activeIncidents: NearServiceIncident[] = (lastFeed?.activeIncidents ?? []).map(item => ({
      ...item, impact: item.status === "active" ? impact(item.scopeType, item.scopeValue) : "unverified",
    }));
    const recentlyResolved: NearServiceIncident[] = (lastFeed?.recentlyResolved ?? []).map(item => ({
      ...item, status: "resolved", impact: impact(item.scopeType, item.scopeValue),
    }));
    let eligibility: NearServiceStatus["eligibility"] = "unverified";
    let reason = "Current incident information could not be verified. New orders and funding guidance are paused; tracking remains available.";
    if (state === "fresh") {
      if (!knownRoute) {
        reason = "Select both supported route networks to verify incident impact. This feed does not guarantee execution.";
      } else if (activeIncidents.some(item => item.impact === "matching")) {
        eligibility = "paused";
        reason = "An active incident matches a selected network. New orders and funding guidance are paused; existing orders can still be tracked.";
      } else if (activeIncidents.some(item => item.impact === "unverified")) {
        reason = "An active incident has unverified route impact. New orders and funding guidance are conservatively paused; this does not mean all routes are down.";
      } else {
        eligibility = "allowed";
        reason = "No matching active incident is reported. This is not a guarantee of availability, privacy, or settlement.";
      }
    }
    return {
      sourceUrl: SOURCE,
      lastSuccessAt: lastSuccess === undefined ? null : new Date(lastSuccess).toISOString(),
      freshUntil: lastSuccess === undefined ? null : new Date(lastSuccess + FRESH_MS).toISOString(),
      state, activeIncidents, recentlyResolved, eligibility, reason,
    };
  };
}

export const getNearServiceStatus = createNearServiceStatusAdapter();