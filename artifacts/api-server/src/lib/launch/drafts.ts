import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { CreateLaunchDraftBody, GetStonkfunTokenResponse } from "@workspace/api-zod";
import { pool, transaction, exactKeys, invalid, validAddress, safeUrl, plainText, iso, LaunchError, unavailableReason, plannedIncentives } from "./store";

export type LaunchDraftInput = z.infer<typeof CreateLaunchDraftBody>;
export function validateDraft(body: unknown): LaunchDraftInput {
  exactKeys(body, Object.keys(CreateLaunchDraftBody.shape));
  exactKeys((body as LaunchDraftInput).allocations, ["creator", "developer", "liquidity", "community"]);
  const input = CreateLaunchDraftBody.strict().parse(body);
  if (![input.name, input.symbol, input.description].every(plainText)) invalid("Token metadata must be plain text without markup or control characters.");
  for (const url of [input.website,input.x,input.telegram,input.discord,input.github]) if (url !== "" && !safeUrl(url)) invalid("Social links must be valid HTTP(S) URLs without credentials.");
  if (input.pairMint && !validAddress(input.pairMint)) invalid("Pair mint must decode to a 32-byte Solana address.");
  if (!/^[1-9][0-9]{0,77}$/.test(input.supply)) invalid("Supply must be a positive integer of at most 78 decimal digits.");
  const allocations = Object.values(input.allocations);
  // Exact integer basis points avoid floating point sum acceptance and precision loss.
  const bps = allocations.map(value => Math.round(value * 100));
  if (allocations.some((value,index) => bps[index] / 100 !== value) || bps.reduce((sum,value) => sum + value, 0) !== 10000) invalid("Allocations must use at most two decimal places and total exactly 100%.");
  return input;
}
function serializeDraft(row: Record<string, any>, underReview = false) {
  return { ...row.input, id: row.id, wallet: row.wallet, status: "preparation-ready" as const,
    executionAvailable: false as const, unavailableReason,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), incentives: plannedIncentives(underReview) };
}
export async function walletUnderReview(wallet: string) {
  return (await pool.query("SELECT 1 FROM launch_reviews WHERE target_type='wallet' AND target=$1 AND network='mainnet-beta' AND status='under_review' LIMIT 1", [wallet])).rows.length > 0;
}
export async function getOwnedDraft(wallet: string, id: string) {
  const { rows } = await pool.query("SELECT * FROM launch_drafts WHERE id=$1 AND wallet=$2", [id,wallet]);
  if (!rows[0]) throw new LaunchError(404, "NOT_FOUND", "Private draft not found.");
  return serializeDraft(rows[0], await walletUnderReview(wallet));
}
export async function listDrafts(wallet: string) {
  const { rows } = await pool.query("SELECT * FROM launch_drafts WHERE wallet=$1 ORDER BY updated_at DESC,id DESC LIMIT 100", [wallet]);
  const reviewed = await walletUnderReview(wallet);
  return rows.map(row => serializeDraft(row, reviewed));
}
export async function saveDraft(wallet: string, body: unknown, id?: string, ifUnmodifiedSince?: string) {
  const input = validateDraft(body);
  const row = await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`launch-draft:${wallet}`]);
    if (input.logoId) {
      const logo = await client.query("SELECT id FROM launch_logos WHERE id=$1 AND wallet=$2 AND completed_at IS NOT NULL AND safe_path IS NOT NULL", [input.logoId,wallet]);
      if (!logo.rows.length) throw new LaunchError(404, "NOT_FOUND", "Completed private logo not found.");
    }
    if (id) {
      const existing = await client.query("SELECT * FROM launch_drafts WHERE id=$1 AND wallet=$2 FOR UPDATE", [id,wallet]);
      if (!existing.rows[0]) throw new LaunchError(404, "NOT_FOUND", "Private draft not found.");
      if (ifUnmodifiedSince && Date.parse(ifUnmodifiedSince) !== new Date(existing.rows[0].updated_at).getTime()) throw new LaunchError(409, "INVALID_INPUT", "Draft changed in another tab. Reload before saving.");
      return (await client.query("UPDATE launch_drafts SET input=$1,revision=revision+1,status='preparation_ready',updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=$2 AND wallet=$3 RETURNING *", [JSON.stringify(input),id,wallet])).rows[0];
    }
    const count = await client.query("SELECT count(*)::int AS n FROM launch_drafts WHERE wallet=$1", [wallet]);
    if (count.rows[0].n >= 100) throw new LaunchError(429, "RATE_LIMITED", "Private draft quota reached (100). Delete an old draft first.");
    return (await client.query("INSERT INTO launch_drafts(id,wallet,input) VALUES($1,$2,$3) RETURNING *", [randomUUID(),wallet,JSON.stringify(input)])).rows[0];
  });
  return serializeDraft(row, await walletUnderReview(wallet));
}
export async function deleteDraft(wallet: string, id: string) {
  const result = await pool.query("DELETE FROM launch_drafts WHERE id=$1 AND wallet=$2 RETURNING id", [id,wallet]);
  if (!result.rows.length) throw new LaunchError(404, "NOT_FOUND", "Private draft not found.");
}
export async function creatorDashboard(wallet: string) {
  // No user-facing endpoint can write attribution. Only independently verified,
  // trusted evidence records qualify; public catalog creator guesses never do.
  const { rows } = await pool.query("SELECT token,mint,network FROM launch_creator_evidence WHERE wallet=$1 AND network='mainnet-beta' AND verified_at IS NOT NULL AND token IS NOT NULL ORDER BY created_at DESC LIMIT 100", [wallet]);
  const launches = rows.map(row => ({ row,token: GetStonkfunTokenResponse.shape.token.parse(row.token) }))
    .filter(({ row,token }) => token.creatorWallet === wallet && token.mint === row.mint && token.network === row.network)
    .map(({ token }) => token);
  const uniqueLaunches = [...new Map(launches.map(token => [token.mint, token])).values()];
  return {
    wallet, drafts: await listDrafts(wallet), launches: uniqueLaunches,
    metrics: { totalVolumeUsd: null, darkVolumeUsd: null, holders: null, feesUsd: null, referrals: null, darkPoints: null },
    incentives: plannedIncentives(await walletUnderReview(wallet)),
    warnings: ["No live creator-attribution evidence source is connected. Only independently verified stored attribution can appear here.",
      "Aggregate creator volume, distinct holders, fees and referral metrics are unavailable. Token holder counts are never summed.",
      "Incentives are planned, unverified and not claimable; this dashboard is separate from swap rewards."],
  };
}