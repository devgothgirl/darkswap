// Partner revenue share (NEAR Intents appFees) configuration, shared between
// the swap route (routes/near.ts) and the docs drift guard
// (routes/near-partner-fee-docs.test.ts) so both read the environment with
// identical semantics.

export type PartnerFee = { recipient: string; feeBps: number };

export class InvalidPartnerFeeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPartnerFeeConfigError";
  }
}

// Fail closed on partial or invalid configuration: never swap silently
// without the agreed fee, and never pay out to a mistyped address. The fee is
// charged from the input asset and split 50/50 with NEAR Intents under the
// partner schedule. Returns null only when the fee is fully disabled (both
// values absent), which means no appFees are sent at all.
export function parsePartnerFeeConfig(rawFee = "", recipient = ""): PartnerFee | null {
  const fee = rawFee.trim();
  const payout = recipient.trim();
  if (!fee && !payout) return null;
  const feeBps = Number(fee);
  const validRecipient = /^(?:[a-z0-9_-]+(?:[.-][a-z0-9_-]+)*\.near|[0-9a-f]{64}|0x[0-9a-fA-F]{40})$/.test(payout);
  if (!Number.isInteger(feeBps) || feeBps < 1 || feeBps > 480 || !validRecipient) {
    throw new InvalidPartnerFeeConfigError(
      "NEAR_PARTNER_FEE_BPS and NEAR_PARTNER_PAYOUT_ADDRESS must both be set and valid (integer 1-480 bps, NEAR account / hex address).",
    );
  }
  return { recipient: payout, feeBps };
}

export function partnerFeeFromEnv(env: Partial<Pick<NodeJS.ProcessEnv, "NEAR_PARTNER_FEE_BPS" | "NEAR_PARTNER_PAYOUT_ADDRESS">> = process.env): PartnerFee | null {
  return parsePartnerFeeConfig(env.NEAR_PARTNER_FEE_BPS ?? "", env.NEAR_PARTNER_PAYOUT_ADDRESS ?? "");
}
