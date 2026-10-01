/**
 * Evidence-only heuristics. Public aggregate catalog rows cannot be passed as
 * activity evidence. No detector infers identity or issues rewards.
 * No live transaction/referral evidence source is connected in this release.
 */
export const launchDetectorStatus = [
  { name: "self_referral", active: false, reason: "No verified referral evidence source is connected." },
  { name: "circular_activity", active: false, reason: "Aggregate catalog volume does not identify counterparties or transaction paths." },
  { name: "transaction_spam", active: false, reason: "No verified transaction-level history is connected." },
  { name: "suspected_wallet_cluster", active: false, reason: "No independently sourced cluster evidence is connected; shared behavior is not proof of identity." },
  { name: "wash_trading", active: false, reason: "No beneficial-ownership or transaction evidence; aggregate volume cannot prove wash trading." },
  { name: "sybil_identity", active: false, reason: "Heuristics cannot establish that different wallets belong to one person." },
] as const;

type EvidenceSource = {
  network: "mainnet-beta";
  evidenceUrl: string;
  /** Must be assigned by a trusted ingestion service, never public JSON input. */
  provenanceVerified: true;
};
export type ReferralEvidence = EvidenceSource & {
  kind: "referral"; id: string; referrer: string; referred: string;
};
export type ActivityEvidence = EvidenceSource & {
  kind: "activity"; id: string; from: string; to: string; assetMint: string;
  amountAtomic: string; timestamp: number;
};
export type ClusterEvidence = EvidenceSource & {
  kind: "cluster"; id: string; wallets: string[]; methodology: string;
};
export type ReviewEvidence = ReferralEvidence | ActivityEvidence | ClusterEvidence;
export type HeuristicFlag = {
  wallet: string;
  network: "mainnet-beta";
  reason: "self_referral" | "circular_activity" | "transaction_spam" | "suspected_wallet_cluster";
  status: "under_review";
  evidenceUrls: string[];
  evidenceIds: string[];
  notes: string;
  automaticEligibility: false;
};

function evidenceUrlSafe(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

export function detectReviewFlags(input: readonly ReviewEvidence[]): HeuristicFlag[] {
  if (input.length > 5000) throw new Error("Evidence batch exceeds safe bound");
  const seen = new Set<string>();
  const evidence = input.filter(item => {
    if (item.provenanceVerified !== true || item.network !== "mainnet-beta"
      || !item.id || !evidenceUrlSafe(item.evidenceUrl)) return false;
    // Duplicate provider observations are not multiple independent events.
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const flags: HeuristicFlag[] = [];
  const add = (wallet: string, reason: HeuristicFlag["reason"], rows: ReviewEvidence[], notes: string) => {
    if (!wallet || flags.some(flag => flag.wallet === wallet && flag.reason === reason)) return;
    flags.push({ wallet, network: "mainnet-beta", reason, status: "under_review",
      evidenceUrls: [...new Set(rows.map(row => row.evidenceUrl))].slice(0, 10),
      evidenceIds: rows.map(row => row.id).slice(0, 100), notes, automaticEligibility: false });
  };
  for (const item of evidence) {
    if (item.kind === "referral" && item.referrer === item.referred) {
      add(item.referrer, "self_referral", [item], "The same verified wallet appears as referrer and referred. Manual review required.");
    }
    if (item.kind === "cluster" && item.methodology.trim().length >= 20 && new Set(item.wallets).size >= 2) {
      for (const wallet of new Set(item.wallets.slice(0, 100))) {
        add(wallet, "suspected_wallet_cluster", [item],
          `External cluster evidence: ${item.methodology.slice(0, 500)}. This does not prove shared identity.`);
      }
    }
  }
  const activity = evidence.filter((item): item is ActivityEvidence =>
    item.kind === "activity" && item.from !== item.to && !!item.from && !!item.to
    && /^\d+$/.test(item.amountAtomic) && BigInt(item.amountAtomic) > 0n
    && Number.isSafeInteger(item.timestamp));
  const bySender = new Map<string, ActivityEvidence[]>();
  for (const row of activity) bySender.set(row.from, [...(bySender.get(row.from) ?? []), row]);
  for (const [wallet, rows] of bySender) {
    const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
    // Ten independent records from one sender in a rolling minute, not ten
    // repeated copies of the same transaction, are a review hint only.
    for (let end = 9; end < sorted.length; end++) {
      if (sorted[end].timestamp - sorted[end - 9].timestamp <= 60_000) {
        add(wallet, "transaction_spam", sorted.slice(end - 9, end + 1),
          "At least ten distinct verified activity records within one minute. High frequency alone is not proof of manipulation.");
        break;
      }
    }
    // Look for repeated two-wallet round trips of the same asset and amount.
    // Bounded to a ten-minute window. Other graph structures remain unsupported.
    const roundTrips: ActivityEvidence[] = [];
    for (const row of rows) {
      const reverse = (bySender.get(row.to) ?? []).find(other =>
        other.to === wallet && other.assetMint === row.assetMint
        && other.amountAtomic === row.amountAtomic
        && other.timestamp >= row.timestamp && other.timestamp - row.timestamp <= 600_000
        && !roundTrips.some(used => used.id === other.id));
      if (reverse) roundTrips.push(row, reverse);
    }
    if (roundTrips.length >= 4) {
      add(wallet, "circular_activity", roundTrips,
        "Repeated matching two-wallet return paths within ten minutes. This is a review heuristic, not proof of wash trading or shared ownership.");
    }
  }
  return flags;
}

export function canAutomaticallyPromote(flags: readonly { status: string }[]): boolean {
  return !flags.some(flag => flag.status === "under_review");
}

/** Even clean records cannot earn/claim value in this release. */
export function incentiveEligibility(): { state: "planned"; claimable: false } {
  return { state: "planned", claimable: false };
}