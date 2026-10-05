// The relayer's fee formula, in one place.
//
// Three callers need the same arithmetic and must not drift apart:
//   - the relayer that quotes and checks the fee
//     (artifacts/api-server/src/lib/pool/relayer.ts),
//   - the volume exporter that inverts the quote to read the gas price or the
//     rent back out of the fees users actually paid
//     (artifacts/api-server/src/lib/pool/volumes.ts),
//   - the earnings calculator that projects relayer economics
//     (lib/pool-client/scripts/earnings-calculator.mjs).
//
// Change a number here and all three move together;
// test/earnings-calculator.test.mjs fails if a caller stops using these.

/** Gas the relayer quotes for one unshield (measured ~1.40M in the EVM e2e run). */
export const EVM_TRANSACT_GAS = 1_500_000n;

/** Headroom over the gas figure, as a fraction: 1.2x. */
export const QUOTE_HEADROOM_NUM = 12n;
export const QUOTE_HEADROOM_DEN = 10n;

/** Solana network fee for the relayer's single signature. */
export const LAMPORTS_PER_SIGNATURE = 5_000n;

/** Nullifier accounts the relayer funds for one spend (two inputs per proof). */
export const SOLANA_NULLIFIER_ACCOUNTS = 2n;

/** A gas figure with the quote's headroom on top. */
export const withQuoteHeadroom = (gas) => (BigInt(gas) * QUOTE_HEADROOM_NUM) / QUOTE_HEADROOM_DEN;

/** What the relayer quotes for one relayed EVM unshield, in wei. */
export const evmRelayerQuote = (gasPriceWei, margin = 0n) =>
  withQuoteHeadroom(EVM_TRANSACT_GAS * BigInt(gasPriceWei)) + BigInt(margin);

/**
 * What the relayer quotes for one relayed Solana unshield, in lamports.
 * `signatureLamports` exists for the earnings calculator, which lets an
 * operator model a different network fee; the relayer itself always quotes at
 * `LAMPORTS_PER_SIGNATURE`.
 */
export const solanaRelayerQuote = (rentLamports, margin = 0n, signatureLamports = LAMPORTS_PER_SIGNATURE) =>
  BigInt(signatureLamports) + SOLANA_NULLIFIER_ACCOUNTS * BigInt(rentLamports) + BigInt(margin);

/**
 * Inverse of `evmRelayerQuote`: the gas price implied by a quote with its
 * margin already taken off. Floors, so a quote too small to imply a whole wei
 * of gas price comes back as 0.
 */
export const evmGasPriceFromQuote = (quoteOverMargin) =>
  (BigInt(quoteOverMargin) * QUOTE_HEADROOM_DEN) / (QUOTE_HEADROOM_NUM * EVM_TRANSACT_GAS);

/**
 * Inverse of `solanaRelayerQuote`: the per-account rent implied by a quote
 * with its margin already taken off. Comes back at or below zero when the
 * quote does not even cover one signature.
 */
export const solanaRentFromQuote = (quoteOverMargin) =>
  (BigInt(quoteOverMargin) - LAMPORTS_PER_SIGNATURE) / SOLANA_NULLIFIER_ACCOUNTS;
