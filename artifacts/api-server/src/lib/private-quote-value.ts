import { houdiniRequest, type ProviderQuote, type ProviderToken } from "./houdini";
import { inputValueUsd } from "./swap-minimum";

/** QuoteV2.amountInUsd is optional. Token.price is documented as current USD
 * price: https://docs.houdiniswap.com/developer-hub/core-concepts/tokens-networks
 * Fetch by exact source ID per request; never reuse catalog prices or infer
 * input value from output value. Explicitly malformed USD values fail closed.
 */
export async function valuePrivateQuotes(
  quotes: ProviderQuote[],
  sourceId: string,
  requestedAmount: number,
  loadToken = (id: string) => houdiniRequest<ProviderToken>(`/tokens/${encodeURIComponent(id)}`),
): Promise<ProviderQuote[]> {
  const matching = quotes.filter(q =>
    Number.isFinite(q.amountIn) && q.amountIn! > 0 &&
    q.amountIn === requestedAmount &&
    Number.isFinite(q.amountOut) && q.amountOut! > 0,
  );
  let price: unknown;
  if (matching.some(q => q.amountInUsd === undefined)) {
    try {
      const token = await loadToken(sourceId);
      if (token.id === sourceId && token.chainData?.shortName?.toLowerCase() === "solana" &&
          token.enabled !== false && token.hasCex !== false) price = token.price;
    } catch {
      // Quotes with their own valid USD valuation may still be used.
    }
  }
  return matching.flatMap(q => {
    const value = q.amountInUsd === undefined
      ? inputValueUsd(q.amountIn!, price)
      : typeof q.amountInUsd === "number" && Number.isFinite(q.amountInUsd) && q.amountInUsd > 0
        ? q.amountInUsd : null;
    return value !== null && value > 0 ? [{ ...q, amountInUsd: value }] : [];
  });
}