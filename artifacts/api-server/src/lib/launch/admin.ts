import { randomUUID } from "node:crypto";
import { CreateLaunchAdminReviewBody, UpdateLaunchAdminConfigBody } from "@workspace/api-zod";
import { transaction, pool, exactKeys, invalid, validAddress, safeUrl, plainText, iso } from "./store";
import { normalizeLaunchConfig, type LaunchConfigInput, type LaunchReview } from "./config";

export function validateConfig(body: unknown): LaunchConfigInput {
  exactKeys(body, Object.keys(UpdateLaunchAdminConfigBody.shape));
  const raw = body as LaunchConfigInput;
  if (Array.isArray(raw.pairOverrides)) for (const row of raw.pairOverrides) exactKeys(row, ["mint", "network", "enabled", "priority", "group", "evidenceUrl"]);
  if (raw.featuredPair) exactKeys(raw.featuredPair, ["mint", "network"]);
  if (raw.feeProposal) exactKeys(raw.feeProposal, ["amount", "currency", "notes"]);
  if (raw.campaignProposal) exactKeys(raw.campaignProposal, ["name", "description", "eligibilityNotes"]);
  if (raw.pointsProposal) exactKeys(raw.pointsProposal, ["name", "description", "formulaProposal"]);
  const input = UpdateLaunchAdminConfigBody.strict().parse(body);
  const addresses = [...input.featuredMints, ...input.pairOverrides.map(row => row.mint), ...(input.darkTokenAddress ? [input.darkTokenAddress] : []), ...(input.featuredPair ? [input.featuredPair.mint] : [])];
  if (addresses.some(mint => !validAddress(mint))) invalid("Every configured identity must be a valid 32-byte Solana mint.");
  if (input.darkPairingEnabled && !input.darkTokenAddress) invalid("DARK pairing requires a verified mint address; enablement never proves upstream readiness.");
  if (new Set(input.featuredMints).size !== input.featuredMints.length || new Set(input.pairOverrides.map(row => row.mint)).size !== input.pairOverrides.length) invalid("Duplicate mint identities are not allowed.");
  if (input.pairOverrides.some(row => !safeUrl(row.evidenceUrl))) invalid("Pair evidence must use a safe HTTP(S) URL.");
  const text = [input.banner, ...Object.values(input.feeProposal ?? {}), ...Object.values(input.campaignProposal ?? {}), ...Object.values(input.pointsProposal ?? {})];
  if (text.some(value => value !== null && !plainText(value))) invalid("Configuration text must be plain text, without markup or control characters.");
  return input;
}
export async function updateConfig(wallet: string, body: unknown) {
  const input = validateConfig(body);
  return transaction(async client => {
    // Serializes moderation and feature changes, including the initial config row.
    await client.query("SELECT pg_advisory_xact_lock(990099)");
    const targets = [...input.featuredMints, ...(input.featuredPair ? [input.featuredPair.mint] : [])];
    const blocked = await client.query("SELECT 1 FROM launch_reviews r WHERE r.status='under_review' AND r.network='mainnet-beta' AND ((r.target_type='token' AND r.target=ANY($1::text[])) OR (r.target_type='wallet' AND EXISTS(SELECT 1 FROM launch_creator_evidence e WHERE e.wallet=r.target AND e.mint=ANY($1::text[]) AND e.network=r.network AND e.verified_at IS NOT NULL))) LIMIT 1", [targets]);
    if (blocked.rows.length) invalid("Under-review tokens or verified creators cannot be featured.");
    const result = await client.query("INSERT INTO launch_configuration(id,input) VALUES('main',$1) ON CONFLICT(id) DO UPDATE SET input=excluded.input,updated_at=now() RETURNING updated_at", [JSON.stringify(input)]);
    await client.query("INSERT INTO launch_audit(id,actor_wallet,action,target_id,summary) VALUES($1,$2,'config_updated','main',$3)", [randomUUID(),wallet,`Launch preparation configuration replaced; paused=${input.paused}; ${input.pairOverrides.length} evidence-backed pair rules; ${input.featuredMints.length} featured mints. Financial/campaign proposals remain inactive; execution unavailable.`]);
    return normalizeLaunchConfig(input, result.rows[0].updated_at);
  });
}
export function validateReview(body: unknown) {
  const input = CreateLaunchAdminReviewBody.strict().parse(body);
  if (!validAddress(input.target) || input.evidenceUrls.some(url => !safeUrl(url))) invalid("Review requires a valid Solana identity and safe HTTP(S) evidence.");
  if (!input.notes.trim() || !plainText(input.notes)) invalid("Review notes must be nonempty plain text.");
  if (input.suppressMetadata && input.targetType !== "token") invalid("Only token reviews can suppress metadata.");
  return input;
}
export async function createReview(wallet: string, body: unknown): Promise<LaunchReview> {
  const input = validateReview(body);
  return transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(990099)");
    const id = randomUUID();
    const result = await client.query("INSERT INTO launch_reviews(id,target,target_type,network,input,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING created_at", [id,input.target,input.targetType,input.network,JSON.stringify(input),wallet]);
    // A later review must remove prior promotion as well as block future promotion.
    const affected = input.targetType === "token" ? [input.target] : (await client.query("SELECT mint FROM launch_creator_evidence WHERE wallet=$1 AND network=$2 AND verified_at IS NOT NULL", [input.target,input.network])).rows.map(row => row.mint as string);
    const configRow = await client.query("SELECT input FROM launch_configuration WHERE id='main' FOR UPDATE");
    if (configRow.rows[0]) {
      const config = configRow.rows[0].input as LaunchConfigInput;
      config.featuredMints = config.featuredMints.filter(mint => !affected.includes(mint));
      if (config.featuredPair && affected.includes(config.featuredPair.mint)) config.featuredPair = null;
      await client.query("UPDATE launch_configuration SET input=$1,updated_at=now() WHERE id='main'", [JSON.stringify(config)]);
    }
    await client.query("INSERT INTO launch_audit(id,actor_wallet,action,target_id,summary) VALUES($1,$2,'review_created',$3,$4)", [randomUUID(),wallet,id,`${input.targetType} placed under review: ${input.reason}; ${input.evidenceUrls.length} evidence URLs. Matching featured promotion removed; eligibility remains unavailable.`]);
    return { ...input, id, status: "under_review", createdBy: wallet, createdAt: iso(result.rows[0].created_at) };
  });
}
export async function loadAudit(limit: number) {
  const { rows } = await pool.query("SELECT id,actor_wallet,action,target_id,summary,created_at FROM launch_audit ORDER BY created_at DESC,id DESC LIMIT $1", [limit]);
  return rows.map(row => ({ id: row.id, actorWallet: row.actor_wallet, action: row.action, targetId: row.target_id, summary: row.summary, createdAt: iso(row.created_at) }));
}