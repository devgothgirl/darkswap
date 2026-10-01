import { createHash } from "node:crypto";

/**
 * This module deliberately contains no network calls, transaction builder,
 * wallet signer, fee collector, or activation environment variable.
 * Discovery documentation is NOT an execution contract.
 */
export const EXECUTION_UNAVAILABLE =
  "Launch preparation is available. Token creation is disabled until the provider's transaction, destination, program and fee contract has been independently verified.";

export type LaunchLifecycle =
  | "unavailable"
  | "preparation_ready"
  | "review_ready"
  | "submitted"
  | "confirmed"
  | "failed";

export interface LaunchIntent {
  draftId: string;
  revision: number;
  signer: string;
  network: "mainnet-beta";
  pairMint: string;
  configuration: Readonly<Record<string, unknown>>;
}

export interface VerifiedLaunchTerms {
  /** Only a future audited provider adapter may create verified terms. */
  source: string;
  termsId: string;
  fetchedAt: number;
  expiresAt: number;
  intentHash: string;
  signer: string;
  network: "mainnet-beta";
  pairMint: string;
  destinations: readonly string[];
  programs: readonly string[];
  fees: readonly { mint: string; amountAtomic: string; destination: string }[];
  transactionDigest: string;
}

export interface ReviewedLaunch {
  intent: LaunchIntent;
  terms: VerifiedLaunchTerms;
  consent: { intentHash: string; termsHash: string; acceptedAt: number };
  idempotencyKey: string;
}

export interface VerifiedConfirmation {
  signature: string;
  network: "mainnet-beta";
  signer: string;
  pairMint: string;
  intentHash: string;
  termsHash: string;
  tokenMint: string;
  independentlyVerified: true;
  finalized: true;
}

export interface LaunchAdapter {
  readonly available: boolean;
  readonly reason: string;
  getTerms(intent: LaunchIntent): Promise<VerifiedLaunchTerms>;
  submit(review: ReviewedLaunch, creatorSignedTransaction: Uint8Array): Promise<{
    signature: string;
    state: "submitted";
  }>;
  confirm(signature: string): Promise<VerifiedConfirmation>;
}

export class LaunchExecutionUnavailable extends Error {
  readonly code = "EXECUTION_UNAVAILABLE";
  constructor() { super(EXECUTION_UNAVAILABLE); }
}

/** The ONLY production adapter. No admin configuration can replace it. */
export const launchAdapter: LaunchAdapter = Object.freeze({
  available: false,
  reason: EXECUTION_UNAVAILABLE,
  async getTerms() { throw new LaunchExecutionUnavailable(); },
  async submit() { throw new LaunchExecutionUnavailable(); },
  async confirm() { throw new LaunchExecutionUnavailable(); },
});

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const result = JSON.stringify(value);
    if (result === undefined || (typeof value === "number" && !Number.isFinite(value))) {
      throw new Error("Intent must contain JSON values");
    }
    return result;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
  ).join(",")}}`;
}

export function bindingHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

/**
 * Necessary (not sufficient) checks for a FUTURE adapter. A valid binding alone
 * never enables the production adapter. Transaction decoding, exact allowlisted
 * programs/destinations/fee bounds, database idempotency and independent on-chain
 * confirmation remain mandatory adapter responsibilities.
 */
export function assertReviewBinding(review: ReviewedLaunch, now = Date.now()): void {
  const { intent, terms, consent } = review;
  if (!Number.isSafeInteger(intent.revision) || intent.revision < 1
    || terms.fetchedAt > now || terms.expiresAt <= now
    || terms.expiresAt <= terms.fetchedAt
    || terms.expiresAt - terms.fetchedAt > 5 * 60_000
    || terms.intentHash !== bindingHash(intent)
    || terms.signer !== intent.signer || terms.network !== intent.network
    || terms.pairMint !== intent.pairMint
    || consent.intentHash !== bindingHash(intent)
    || consent.termsHash !== bindingHash(terms)
    || consent.acceptedAt < terms.fetchedAt || consent.acceptedAt > now
    || !review.idempotencyKey || review.idempotencyKey.length > 128
    || !terms.source || !terms.termsId || !terms.transactionDigest
    || !terms.destinations.length || !terms.programs.length
    || terms.fees.some(fee => !/^\d+$/.test(fee.amountAtomic)
      || !fee.mint || !terms.destinations.includes(fee.destination))) {
    throw new Error("Launch terms changed, expired, or do not match the reviewed configuration. Renew explicit consent.");
  }
}

/** Pure lifecycle model for tests; never persists a token or successful receipt. */
export function nextLifecycle(
  current: LaunchLifecycle,
  event: "prepare" | "review" | "submit" | "confirm" | "fail" | "edit",
  evidence: { adapterVerified: boolean; bindingValid?: boolean; confirmationVerified?: boolean },
): LaunchLifecycle {
  if (event === "edit") {
    if (current === "submitted" || current === "confirmed") throw new Error("Submitted intent is immutable");
    return "preparation_ready";
  }
  if (event === "prepare" && current === "unavailable") return "preparation_ready";
  if (event === "fail" && (current === "review_ready" || current === "submitted")) return "failed";
  if (event === "review" && current === "preparation_ready" && evidence.adapterVerified && evidence.bindingValid) return "review_ready";
  if (event === "submit" && current === "review_ready" && evidence.adapterVerified && evidence.bindingValid) return "submitted";
  if (event === "confirm" && current === "submitted" && evidence.adapterVerified && evidence.confirmationVerified) return "confirmed";
  throw new Error("Unsupported launch lifecycle transition");
}