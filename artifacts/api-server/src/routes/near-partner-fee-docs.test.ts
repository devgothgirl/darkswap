import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { InvalidPartnerFeeConfigError, parsePartnerFeeConfig, partnerFeeFromEnv } from "../lib/near-partner-fee";

// Drift guard: the docs pages state the partner fee and payout address in
// static copy, while the swap actually charges whatever NEAR_PARTNER_FEE_BPS
// and NEAR_PARTNER_PAYOUT_ADDRESS configure. This test resolves the fee with
// the exact same parser the runtime uses (lib/near-partner-fee.ts) — no
// invented defaults — so it fails rather than certifying the docs when the
// fee is disabled or misconfigured, and fails when a changed env value no
// longer matches the published copy.

const DOCS_PAGES = [
  "../../../solana-privacy-swap/src/pages/docs-route-economics.tsx",
  "../../../solana-privacy-swap/src/pages/docs.tsx",
];

function docsSources(): string[] {
  return DOCS_PAGES.map(page => readFileSync(fileURLToPath(new URL(page, import.meta.url)), "utf8"));
}

const HINT = "Update the docs fee copy in artifacts/solana-privacy-swap/src/pages/ (docs-route-economics.tsx and docs.tsx) to match NEAR_PARTNER_FEE_BPS / NEAR_PARTNER_PAYOUT_ADDRESS.";

test("docs state the configured partner fee, its 50/50 split, and payout address", () => {
  let partner: ReturnType<typeof partnerFeeFromEnv>;
  try {
    partner = partnerFeeFromEnv();
  } catch (error) {
    assert.fail(error instanceof InvalidPartnerFeeConfigError
      ? `The partner fee is misconfigured (${error.message}) Fix the configuration or the docs before publishing fee claims.`
      : String(error));
  }
  assert.ok(partner, `No partner fee is configured, but the docs state one. Set NEAR_PARTNER_FEE_BPS and NEAR_PARTNER_PAYOUT_ADDRESS, or remove the fee claims from the docs. ${HINT}`);
  const feePercent = `${(partner.feeBps / 100).toFixed(2)}%`;
  const halfPercent = `${(partner.feeBps / 200).toFixed(2)}%`;
  const combined = docsSources().join("\n");
  assert.ok(combined.includes(`${feePercent} partner fee`), `Docs must state a ${feePercent} partner fee. ${HINT}`);
  assert.ok(combined.includes(`${halfPercent} to DarkSwap`), `Docs must state the ${halfPercent} DarkSwap half of the partner split. ${HINT}`);
  assert.ok(combined.includes(`${halfPercent} to 1Click`), `Docs must state the ${halfPercent} 1Click half of the partner split. ${HINT}`);
  assert.ok(combined.includes(partner.recipient), `Docs must name the configured payout address ${partner.recipient}. ${HINT}`);
});

test("every partner-fee percentage on the docs pages matches the configured fee", () => {
  // Catch a partially updated page: no stale fee figure may survive anywhere
  // the docs talk about the DarkSwap partner fee. Skipped when the fee is
  // disabled or invalid — the first test already fails in that case.
  const partner = partnerFeeFromEnv();
  if (!partner) return;
  const stale = /(\d+\.\d{2})% (?:DarkSwap )?partner fee/g;
  for (const source of docsSources()) {
    for (const match of source.matchAll(stale)) {
      assert.equal(match[1], (partner.feeBps / 100).toFixed(2),
        `Stale partner-fee figure "${match[0]}" found. ${HINT}`);
    }
  }
});

test("partner fee parser mirrors runtime semantics", () => {
  // Fully unset (either as missing or blank values) means no fee is charged.
  assert.equal(parsePartnerFeeConfig(), null);
  assert.equal(parsePartnerFeeConfig("", ""), null);
  assert.equal(parsePartnerFeeConfig("  ", "   "), null);
  // Partial configuration must fail closed, never charge or document a fee.
  assert.throws(() => parsePartnerFeeConfig("40", ""), InvalidPartnerFeeConfigError);
  assert.throws(() => parsePartnerFeeConfig("40", "   "), InvalidPartnerFeeConfigError);
  assert.throws(() => parsePartnerFeeConfig("", "darkswapapp.near"), InvalidPartnerFeeConfigError);
  assert.throws(() => parsePartnerFeeConfig("  ", "darkswapapp.near"), InvalidPartnerFeeConfigError);
  // Out-of-range, non-integer, or mistyped values are rejected, not guessed at.
  assert.throws(() => parsePartnerFeeConfig("0", "darkswapapp.near"), InvalidPartnerFeeConfigError);
  assert.throws(() => parsePartnerFeeConfig("481", "darkswapapp.near"), InvalidPartnerFeeConfigError);
  assert.throws(() => parsePartnerFeeConfig("40.5", "darkswapapp.near"), InvalidPartnerFeeConfigError);
  assert.throws(() => parsePartnerFeeConfig("abc", "darkswapapp.near"), InvalidPartnerFeeConfigError);
  assert.throws(() => parsePartnerFeeConfig("40", "not an address!"), InvalidPartnerFeeConfigError);
  // Valid configuration parses exactly what the route will send.
  assert.deepEqual(parsePartnerFeeConfig("40", "darkswapapp.near"), { recipient: "darkswapapp.near", feeBps: 40 });
  assert.deepEqual(partnerFeeFromEnv({ NEAR_PARTNER_FEE_BPS: "55", NEAR_PARTNER_PAYOUT_ADDRESS: "other.near" }),
    { recipient: "other.near", feeBps: 55 });
});
