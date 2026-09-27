import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

export type SolanaWallet = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string };
  connect(): Promise<{publicKey: {toBase58(): string}}>;
  disconnect?(): Promise<void>;
  signAndSendTransaction(transaction: Transaction | VersionedTransaction): Promise<{signature: string} | string>;
};

declare global {
  interface Window { solana?: SolanaWallet; phantom?: {solana?: SolanaWallet} }
}

export function getWallet(): SolanaWallet | undefined {
  return window.phantom?.solana || window.solana;
}

export function isValidMint(value: string): boolean {
  try { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) && new PublicKey(value).toBytes().length === 32; }
  catch { return false; }
}

export function deserializeSwapTransaction(serialized: string): Transaction | VersionedTransaction {
  const bytes = bs58.decode(serialized);
  try { return VersionedTransaction.deserialize(bytes); }
  catch { return Transaction.from(bytes); }
}