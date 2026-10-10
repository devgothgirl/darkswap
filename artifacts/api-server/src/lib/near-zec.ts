// Deliberately allow only the exact Solana ZEC representation, not every
// 1cs_v1 asset or any token claiming the ZEC ticker.
export const SOLANA_ZEC_MINT = "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS";
export const SOLANA_ZEC_ASSET = `1cs_v1:sol:spl:${SOLANA_ZEC_MINT}`;

export function isSolanaZec(token: Record<string, unknown>): boolean {
  return token.assetId === SOLANA_ZEC_ASSET &&
    token.blockchain === "sol" &&
    token.contractAddress === SOLANA_ZEC_MINT &&
    token.symbol === "ZEC" &&
    token.decimals === 8;
}
