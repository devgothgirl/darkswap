import { pool } from "@workspace/db";
import bs58 from "bs58";
import type { Request, Response, NextFunction } from "express";

export { pool };
export class LaunchError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function invalid(message: string): never { throw new LaunchError(400, "INVALID_INPUT", message); }
export function validAddress(value: string): boolean {
  try { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) && bs58.decode(value).length === 32; } catch { return false; }
}
export function safeUrl(value: string): boolean {
  if (/[\u0000-\u0020\u007f\\]/.test(value)) return false;
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password && !!u.hostname; } catch { return false; }
}
export function plainText(value: string): boolean { return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(value); }
export function exactKeys(value: unknown, keys: readonly string[], required = true): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Expected a JSON object");
  const present = Object.keys(value);
  if (present.some(key => !keys.includes(key)) || (required && keys.some(key => !present.includes(key)))) invalid("Unexpected or missing fields");
}
export const iso = (value: Date | string) => new Date(value).toISOString();
export const unavailableReason = "Launch execution is unavailable: verified StonkFun transaction documentation and terms are not connected. Saved preparation is not a launch.";
export const plannedIncentives = (underReview = false) => ({
  dark_pair: null, dark_points: null, referral_volume: null, creator_score: null,
  campaign_eligible: null, builder_eligible: null, state: underReview ? "under_review" as const : "planned" as const, under_review: underReview,
});
export function privateHeaders(_req: Request, res: Response, next: NextFunction) {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" }); next();
}
// Bounded per-instance abuse control, not a claim of distributed DDoS protection.
const buckets = new Map<string, { count: number; until: number }>();
export function rateLimit(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  if (buckets.size >= 10_000) for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k);
  let entry = buckets.get(key);
  if (!entry || entry.until <= now) {
    if (buckets.size >= 10_000 && !entry) throw new LaunchError(429, "RATE_LIMITED", "Rate limiter capacity reached; retry shortly.");
    entry = { count: 0, until: now + windowMs }; buckets.set(key, entry);
  }
  if (++entry.count > limit) throw new LaunchError(429, "RATE_LIMITED", "Too many requests; retry shortly.");
}
async function acquireClient() { return pool.connect(); }
export async function transaction<T>(work: (client: Awaited<ReturnType<typeof acquireClient>>) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const value = await work(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}