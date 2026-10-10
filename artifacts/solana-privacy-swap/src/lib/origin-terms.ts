import type { NearToken } from '@workspace/api-client-react';

// Wording for the network a NEAR Intents order is funded from. Solana keeps
// the wording the Privacy swap has always used; EVM origins never borrow
// Solana or SPL terms.

/** Every receipt saved before multi-network origins was funded on Solana. */
const LEGACY_ORIGIN_CHAIN = 'sol';
/** Exact identity of native SOL. Legacy receipts lack the `native` flag, and a missing contract does not mean native. */
const NATIVE_SOL_ID = 'nep141:sol.omft.near';
/** Origin-capable EVM networks. The networks offered in pickers still come from the API. */
const EVM_CHAINS: ReadonlySet<string> = new Set(['eth', 'arb', 'base', 'op', 'pol', 'bsc']);

export type OriginToken = Pick<NearToken, 'id' | 'symbol'> & Partial<Pick<NearToken, 'chain' | 'chainName' | 'contractAddress' | 'native'>>;
export type OriginAssetKind = 'native' | 'token' | 'unknown';

export interface NetworkTerms {
  chain: string;
  /** Display name, for example "Solana" or "Base". */
  network: string;
  /** "Solana network" or "Base network"; a name that already ends in Chain or Network is used as is. */
  networkLabel: string;
  evm: boolean;
  /** Standard of a non-native deposit: "SPL" or "ERC-20". */
  tokenStandard: string;
  /** "SPL token transfer" or "ERC-20 token transfer". */
  tokenTransfer: string;
  /** "Token mint" or "Token contract". */
  contractLabel: string;
  /** "mint" on Solana, "contract" elsewhere, for labels such as "Solana asset mint". */
  contractNoun: string;
}

export interface OriginTerms extends NetworkTerms {
  kind: OriginAssetKind;
  symbol: string;
  contract?: string;
  /** "native SOL" or "native ETH" for a network's own coin, otherwise the token transfer kind. */
  transferKind: string;
  /** Shown where a token contract would otherwise appear, for example "Native SOL (not an SPL token)". */
  assetDescription: string;
}

export const isEvmOrigin = (chain: string | undefined) => !!chain && EVM_CHAINS.has(chain);

/** "a Solana", "an Ethereum": the indefinite article for a network name. */
export const withArticle = (network: string) => `${/^[aeiou]/i.test(network) ? 'an' : 'a'} ${network}`;

export function networkTerms(chain: string | undefined, chainName?: string): NetworkTerms {
  const id = chain || LEGACY_ORIGIN_CHAIN;
  const network = chainName || (id === LEGACY_ORIGIN_CHAIN ? 'Solana' : id);
  const networkLabel = /\b(?:chain|network)$/i.test(network) ? network : `${network} network`;
  if (id === LEGACY_ORIGIN_CHAIN) {
    return { chain: id, network, networkLabel, evm: false, tokenStandard: 'SPL', tokenTransfer: 'SPL token transfer', contractLabel: 'Token mint', contractNoun: 'mint' };
  }
  if (EVM_CHAINS.has(id)) {
    return { chain: id, network, networkLabel, evm: true, tokenStandard: 'ERC-20', tokenTransfer: 'ERC-20 token transfer', contractLabel: 'Token contract', contractNoun: 'contract' };
  }
  return { chain: id, network, networkLabel, evm: false, tokenStandard: 'token', tokenTransfer: 'token transfer', contractLabel: 'Token contract', contractNoun: 'contract' };
}

/** Today's wording, used wherever no origin is given. */
export const SOLANA_NETWORK_TERMS: NetworkTerms = networkTerms(LEGACY_ORIGIN_CHAIN, 'Solana');

/** Network, transfer kind and contract label for the asset a user deposits. */
export function originTerms(token: OriginToken): OriginTerms {
  const terms = networkTerms(token.chain, token.chainName);
  const native = token.native ?? (terms.chain === LEGACY_ORIGIN_CHAIN && token.id === NATIVE_SOL_ID);
  const contract = token.contractAddress || undefined;
  const kind: OriginAssetKind = native ? 'native' : contract ? 'token' : 'unknown';
  // Solana's coin is always called SOL here, exactly as before multi-network origins.
  const coin = terms.chain === LEGACY_ORIGIN_CHAIN ? 'SOL' : token.symbol;
  return {
    ...terms,
    kind,
    symbol: token.symbol,
    ...(contract ? { contract } : {}),
    transferKind: kind === 'native' ? `native ${coin}` : kind === 'token' ? terms.tokenTransfer : `${token.symbol} transfer`,
    assetDescription: kind === 'native' ? `Native ${coin} (not an ${terms.tokenStandard} token)` : contract ?? `${token.symbol} on ${terms.network}`,
  };
}
