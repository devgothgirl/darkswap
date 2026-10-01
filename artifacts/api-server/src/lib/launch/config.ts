import { GetLaunchConfigResponse, CreateLaunchAdminReviewResponse, UpdateLaunchAdminConfigBody } from "@workspace/api-zod";
import type { z } from "zod";
import { pool, iso, unavailableReason, validAddress } from "./store";

export type LaunchConfigInput = z.infer<typeof UpdateLaunchAdminConfigBody>;
export type LaunchConfig = Omit<z.infer<typeof GetLaunchConfigResponse>, "updatedAt"> & { updatedAt: string };
export type LaunchReview = Omit<z.infer<typeof CreateLaunchAdminReviewResponse>, "createdAt"> & { createdAt: string };
export function defaultLaunchConfigInput(): LaunchConfigInput {
  const mint = process.env.DARK_TOKEN_ADDRESS?.trim();
  const priority = Number(process.env.DARK_PAIR_PRIORITY ?? "1");
  return {
    darkPairingEnabled: process.env.DARK_PAIRING_ENABLED === "true",
    darkTokenAddress: mint && validAddress(mint) ? mint : null,
    darkPairSymbol: "DARK", darkPairPriority: Number.isInteger(priority) && priority >= 1 && priority <= 10000 ? priority : 1,
    nearPairingEnabled: process.env.NEAR_PAIRING_ENABLED === "true",
    pairOverrides: [], featuredPair: null, featuredMints: [], paused: false,
    banner: null, feeProposal: null, campaignProposal: null, pointsProposal: null,
  };
}
export function resolveLaunchConfigAvailability(config: LaunchConfig, discovery: {
  source: { stale: boolean };
  pairs: { mint: string; network: string; enabled: boolean; launchable: boolean; launchLabReady: boolean | null; group: string }[];
}): LaunchConfig {
  const available = !discovery.source.stale && !config.paused && config.darkPairingEnabled
    && !!config.darkTokenAddress && discovery.pairs.some(pair => pair.mint === config.darkTokenAddress
      && pair.network === "mainnet-beta" && pair.group === "dark" && pair.enabled
      && pair.launchable && pair.launchLabReady === true);
  return {
    ...config, executionAvailable: false, darkPairAvailable: available,
    defaultView: available ? "dark" : "trending",
    darkPairMessage: available
      ? "Verified $DARK ecosystem discovery is available on Solana. Launch execution remains unavailable."
      : "$DARK pairing is being activated for the DarkSwap ecosystem.",
  };
}
export function normalizeLaunchConfig(input: LaunchConfigInput, updatedAt: Date | string): LaunchConfig {
  return {
    ...input, network: "mainnet-beta", executionAvailable: false, executionState: "unavailable",
    unavailableReason, darkPairAvailable: false,
    darkPairMessage: "$DARK pairing is being activated for the DarkSwap ecosystem.",
    defaultView: "trending", providerLaunchFee: null, launchDestination: null, updatedAt: iso(updatedAt),
  };
}
export async function loadLaunchConfig(): Promise<LaunchConfig> {
  const { rows } = await pool.query("SELECT input,updated_at FROM launch_configuration WHERE id='main'");
  const input = rows[0] ? UpdateLaunchAdminConfigBody.parse(rows[0].input) : defaultLaunchConfigInput();
  return normalizeLaunchConfig(input, rows[0]?.updated_at ?? new Date(0));
}
export async function loadLaunchReviews(): Promise<LaunchReview[]> {
  // Deliberately fail closed rather than silently omitting moderation records.
  const { rows } = await pool.query("SELECT * FROM launch_reviews WHERE status='under_review' ORDER BY created_at DESC LIMIT 10001");
  if (rows.length > 10000) throw new Error("Launch review capacity exceeded; archival review required.");
  return rows.map(row => ({ ...row.input, id: row.id, status: "under_review", createdBy: row.created_by, createdAt: iso(row.created_at) }));
}