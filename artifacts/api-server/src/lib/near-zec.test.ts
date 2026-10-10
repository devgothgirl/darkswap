import assert from "node:assert/strict";
import { test } from "node:test";
import { isSolanaZec, SOLANA_ZEC_ASSET, SOLANA_ZEC_MINT } from "./near-zec";

test("Solana ZEC exception requires exact ID, mint, network, symbol and decimals", () => {
  const token = { assetId: SOLANA_ZEC_ASSET, contractAddress: SOLANA_ZEC_MINT, blockchain: "sol", symbol: "ZEC", decimals: 8 };
  assert.equal(isSolanaZec(token), true);
  for (const overrides of [
    { assetId: `${SOLANA_ZEC_ASSET}fake` },
    { contractAddress: "So11111111111111111111111111111111111111112" },
    { blockchain: "near" }, { symbol: "SOL" }, { decimals: 9 },
    { contractAddress: undefined }, { assetId: "1cs_v1:near:nep141:zec.omft.near" },
  ]) assert.equal(isSolanaZec({ ...token, ...overrides }), false);
});
