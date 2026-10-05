// Browser-extension wallets only, reached through the providers they inject.
// No wallet SDK is loaded, so nothing contacts a wallet service on page load.
import { createWalletClient, custom, getAddress, toHex, type EIP1193Provider, type Hex } from 'viem';
import { PublicKey, type Transaction } from '@solana/web3.js';

export type EvmWallet = { kind: 'evm'; name: string; provider: EIP1193Provider; address: Hex };
export type SolanaProvider = {
  publicKey?: PublicKey | null;
  connect(): Promise<{ publicKey: PublicKey }>;
  signMessage(message: Uint8Array, display?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
  signAndSendTransaction(tx: Transaction): Promise<{ signature: string }>;
};
export type SolanaWallet = { kind: 'solana'; name: string; provider: SolanaProvider; address: PublicKey };
export type ConnectedWallet = EvmWallet | SolanaWallet;

type Announced = { info: { name: string; uuid: string }; provider: EIP1193Provider };
declare global {
  interface WindowEventMap { 'eip6963:announceProvider': CustomEvent<Announced> }
  interface Window {
    solflare?: SolanaProvider & { isSolflare?: boolean };
    backpack?: { solana?: SolanaProvider };
  }
}

/** Every injected EVM wallet (EIP-6963), falling back to window.ethereum. */
export async function findEvmWallets(): Promise<Array<{ name: string; provider: EIP1193Provider }>> {
  const found = new Map<string, { name: string; provider: EIP1193Provider }>();
  const onAnnounce = (e: CustomEvent<Announced>) => found.set(e.detail.info.uuid, { name: e.detail.info.name, provider: e.detail.provider });
  window.addEventListener('eip6963:announceProvider', onAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise((r) => setTimeout(r, 250));
  window.removeEventListener('eip6963:announceProvider', onAnnounce);
  const list = [...found.values()];
  const injected = (window as { ethereum?: EIP1193Provider }).ethereum;
  if (!list.length && injected) list.push({ name: 'Browser wallet', provider: injected });
  return list;
}

export function findSolanaWallets(): Array<{ name: string; provider: SolanaProvider }> {
  const list: Array<{ name: string; provider: SolanaProvider }> = [];
  const phantom = (window as { phantom?: { solana?: SolanaProvider } }).phantom?.solana;
  if (phantom) list.push({ name: 'Phantom', provider: phantom });
  if (window.solflare?.isSolflare) list.push({ name: 'Solflare', provider: window.solflare });
  if (window.backpack?.solana) list.push({ name: 'Backpack', provider: window.backpack.solana });
  return list;
}

export async function connectEvm(name: string, provider: EIP1193Provider): Promise<EvmWallet> {
  const [address] = (await provider.request({ method: 'eth_requestAccounts' })) as Hex[];
  if (!address) throw new Error('The wallet did not share an account.');
  return { kind: 'evm', name, provider, address: getAddress(address) };
}

export async function connectSolana(name: string, provider: SolanaProvider): Promise<SolanaWallet> {
  const { publicKey } = await provider.connect();
  return { kind: 'solana', name, provider, address: new PublicKey(publicKey.toString()) };
}

/** Signs the fixed activation message. Both schemes are deterministic, so the same wallet always yields the same keys. */
export async function signActivation(wallet: ConnectedWallet, message: string): Promise<Uint8Array> {
  if (wallet.kind === 'evm') {
    const sig = (await wallet.provider.request({ method: 'personal_sign', params: [toHex(message), wallet.address] })) as Hex;
    const hex = sig.slice(2);
    return Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
  }
  const out = await wallet.provider.signMessage(new TextEncoder().encode(message), 'utf8');
  return out instanceof Uint8Array ? out : out.signature;
}

/** A viem wallet client on the requested chain, asking the wallet to switch if needed. */
export async function evmClientOn(wallet: EvmWallet, chainId: number) {
  const current = Number(await wallet.provider.request({ method: 'eth_chainId' }));
  if (current !== chainId) {
    await wallet.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: toHex(chainId) }] });
  }
  return createWalletClient({ account: wallet.address, transport: custom(wallet.provider) });
}
