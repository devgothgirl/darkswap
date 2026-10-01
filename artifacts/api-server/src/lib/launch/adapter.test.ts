import assert from "node:assert/strict";
import test from "node:test";
import {
  assertReviewBinding, bindingHash, launchAdapter, nextLifecycle,
  type LaunchIntent, type ReviewedLaunch, type VerifiedLaunchTerms,
} from "./adapter";
import { detectReviewFlags, incentiveEligibility, launchDetectorStatus, type ReviewEvidence } from "./review";

function reviewFixture(): ReviewedLaunch {
  const intent: LaunchIntent = {
    draftId: "fixture-only", revision: 1, signer: "fixture-signer", network: "mainnet-beta",
    pairMint: "fixture-pair", configuration: { supply: "1000000000", name: "Fixture" },
  };
  const terms: VerifiedLaunchTerms = {
    source: "test-only", termsId: "fixture-terms", fetchedAt: 1000, expiresAt: 2000,
    intentHash: bindingHash(intent), signer: intent.signer, network: intent.network,
    pairMint: intent.pairMint, destinations: ["fixture-destination"], programs: ["fixture-program"],
    fees: [{ mint: "fixture-fee-mint", amountAtomic: "123", destination: "fixture-destination" }],
    transactionDigest: "not-a-real-transaction",
  };
  return { intent, terms, consent: { intentHash: bindingHash(intent), termsHash: bindingHash(terms), acceptedAt: 1100 }, idempotencyKey: "fixture-key" };
}

test("production adapter never creates terms, submits or confirms even with modeled valid consent", async () => {
  const review = reviewFixture();
  assert.equal(launchAdapter.available, false);
  await assert.rejects(launchAdapter.getTerms(review.intent), { code: "EXECUTION_UNAVAILABLE" });
  await assert.rejects(launchAdapter.submit(review, new Uint8Array()), { code: "EXECUTION_UNAVAILABLE" });
  await assert.rejects(launchAdapter.confirm("arbitrary"), { code: "EXECUTION_UNAVAILABLE" });
});

test("review binds configuration, signer, network, pair, fees, destination, program and expiry", () => {
  const valid = reviewFixture();
  assert.doesNotThrow(() => assertReviewBinding(valid, 1200));
  const mutations: ((review: ReviewedLaunch) => void)[] = [
    review => { review.intent.configuration = { supply: "1" }; },
    review => { review.intent.signer = "different"; },
    review => { review.intent.revision = 2; },
    review => { review.intent.pairMint = "different"; },
    review => { review.terms.network = "devnet" as "mainnet-beta"; },
    review => { review.terms.fees = [{ mint: "changed", amountAtomic: "999", destination: "changed" }]; },
    review => { review.terms.destinations = ["changed"]; },
    review => { review.terms.programs = ["changed"]; },
    review => { review.terms.transactionDigest = "changed"; },
    review => { review.consent.acceptedAt = 999; },
    review => { review.idempotencyKey = ""; },
  ];
  for (const change of mutations) {
    const altered = reviewFixture();
    change(altered);
    assert.throws(() => assertReviewBinding(altered, 1200));
  }
  assert.throws(() => assertReviewBinding(valid, 2000));
  assert.equal(bindingHash({ b: 2, a: 1 }), bindingHash({ a: 1, b: 2 }));
});

test("lifecycle cannot confuse saved preparation with submitted or confirmed launch", () => {
  assert.equal(nextLifecycle("unavailable", "prepare", { adapterVerified: false }), "preparation_ready");
  assert.throws(() => nextLifecycle("preparation_ready", "review", { adapterVerified: false, bindingValid: true }));
  assert.throws(() => nextLifecycle("preparation_ready", "confirm", { adapterVerified: true, confirmationVerified: true }));
  assert.equal(nextLifecycle("preparation_ready", "review", { adapterVerified: true, bindingValid: true }), "review_ready");
  assert.equal(nextLifecycle("review_ready", "edit", { adapterVerified: true }), "preparation_ready");
  assert.equal(nextLifecycle("review_ready", "submit", { adapterVerified: true, bindingValid: true }), "submitted");
  assert.throws(() => nextLifecycle("submitted", "confirm", { adapterVerified: true, confirmationVerified: false }));
  assert.equal(nextLifecycle("submitted", "confirm", { adapterVerified: true, confirmationVerified: true }), "confirmed");
  assert.throws(() => nextLifecycle("confirmed", "edit", { adapterVerified: true }));
});

test("review heuristics require evidence and never turn catalog aggregates into proof or value", () => {
  const source = { network: "mainnet-beta", evidenceUrl: "https://evidence.example/record", provenanceVerified: true } as const;
  const rows: ReviewEvidence[] = [
    { ...source, kind: "referral", id: "r1", referrer: "a", referred: "a" },
    { ...source, kind: "cluster", id: "c1", wallets: ["a", "b"], methodology: "Independent fixture evidence for review only" },
    ...Array.from({ length: 10 }, (_, index) => ({
      ...source, kind: "activity" as const, id: `s${index}`, from: "spam", to: "other",
      assetMint: "asset", amountAtomic: "100", timestamp: 1000 + index,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      ...source, kind: "activity" as const, id: `c${index}`,
      from: index % 2 ? "b" : "a", to: index % 2 ? "a" : "b",
      assetMint: "asset", amountAtomic: "10", timestamp: 2000 + index,
    })),
  ];
  const flags = detectReviewFlags(rows);
  assert.deepEqual(new Set(flags.map(flag => flag.reason)),
    new Set(["self_referral", "suspected_wallet_cluster", "transaction_spam", "circular_activity"]));
  assert.ok(flags.every(flag => flag.status === "under_review" && !flag.automaticEligibility && flag.evidenceUrls.length));
  assert.deepEqual(detectReviewFlags([]), []);
  assert.deepEqual(detectReviewFlags(rows.map(row => ({ ...row, provenanceVerified: false })) as unknown as ReviewEvidence[]), []);
  assert.equal(detectReviewFlags(Array(10).fill(rows[2])).length, 0, "duplicate records are not spam evidence");
  assert.ok(launchDetectorStatus.every(detector => !detector.active));
  assert.deepEqual(incentiveEligibility(), { state: "planned", claimable: false });
});