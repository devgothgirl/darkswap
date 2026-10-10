import type { GetNearTokensParams, NearToken } from '@workspace/api-client-react';
import { MAX_ZCASH_ADDRESS_LENGTH } from '@workspace/zcash-address';

/** The Privacy swap is funded from Solana only; the bridge from any origin the API enables. */
export type NearFormMode = 'solana' | 'bridge';

export const SOLANA_ORIGIN = 'sol';
/** Addresses are pasted, never typed into a wallet here; the API rejects anything longer. */
export const MAX_ADDRESS_LENGTH = 120;

/**
 * Query for the origin picker. The Privacy swap asks for Solana explicitly, so a
 * wider server allow-list can never leak other origins into it. The bridge lists
 * every enabled origin and narrows by network on the page.
 */
export function sourceTokenParams(mode: NearFormMode, term: string): GetNearTokensParams {
  if (mode === 'bridge') return { side: 'source' };
  return { side: 'source', chain: SOLANA_ORIGIN, ...(term ? { term } : {}) };
}

/**
 * The origin-catalog entry a flip would send from, or null when flipping is not
 * allowed: only on the bridge, and only when the destination is itself an
 * enabled, origin-eligible asset.
 */
export function flipTarget(mode: NearFormMode, to: NearToken | null, sources: readonly NearToken[] | undefined): NearToken | null {
  if (mode !== 'bridge' || !to || to.originEligible !== true) return null;
  return sources?.find(token => token.id === to.id && token.originEligible === true) ?? null;
}

/** Networks offered by a token list, in catalog order, from the API rather than a fixed list. */
export function networksOf(tokens: readonly NearToken[]): { id: string; name: string }[] {
  return Array.from(new Map(tokens.map(token => [token.chain, { id: token.chain, name: token.chainName }])).values());
}

/** Reads one address from the clipboard. Any refusal, error or implausible value is ignored. */
export async function readClipboardAddress(clipboard: Pick<Clipboard, 'readText'> | undefined | null, maxLength = MAX_ADDRESS_LENGTH): Promise<string | null> {
  try {
    if (!clipboard || typeof clipboard.readText !== 'function') return null;
    const text = (await clipboard.readText()).trim();
    return text.length > 0 && text.length <= Math.min(maxLength, MAX_ZCASH_ADDRESS_LENGTH) ? text : null;
  } catch {
    return null;
  }
}
