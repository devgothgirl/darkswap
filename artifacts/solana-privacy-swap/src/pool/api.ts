// The API server's pool endpoints. Responses are public data; nothing the
// browser sends here identifies a user beyond the proof being relayed.
import type { ServerPoolState } from '@darkswap/pool-client';

const BASE = `${import.meta.env.BASE_URL}api/pool`;

export type PoolChainInfo = {
  id: string;
  label: string;
  kind: 'evm' | 'solana';
  nativeSymbol: string;
  explorer: string;
  publicRpc: string;
  live: boolean;
  reason: string | null;
  chainId?: number;
  pool?: string | null;
  cluster?: string;
  programId?: string | null;
};
export type RelayQuote =
  | { enabled: false }
  | {
      enabled: true;
      relayer: string;
      /** Fee in the chain's coin, in base units. */
      fee: string;
      /** Fee per accepted token (address or mint → base units). Tokens not listed here go through the user's own wallet. */
      tokenFees: Record<string, string>;
      freePerWindow: number;
      windowMinutes: number;
    };
export type PoolState = ServerPoolState & { chain: string };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status}).`);
  return body as T;
}

export const getChains = () => call<{ testnet: true; chains: PoolChainInfo[] }>('/chains');
export const getState = (chain: string, since = 0) => call<PoolState>(`/${chain}/state?since=${since}`);
export const getQuote = (chain: string) => call<RelayQuote>(`/${chain}/relay`);
export const relay = (chain: string, body: unknown) =>
  call<{ hash: string }>(`/${chain}/relay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Link to a transaction in the chain's public explorer, or null on a local chain. */
export function txUrl(chain: PoolChainInfo, hash: string): string | null {
  if (!chain.explorer) return null;
  return chain.kind === 'solana' ? `${chain.explorer}/tx/${hash}?cluster=${chain.cluster}` : `${chain.explorer}/tx/${hash}`;
}
