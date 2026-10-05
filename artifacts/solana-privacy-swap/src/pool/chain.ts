// Everything the pool tabs do against a chain. The indexer is a convenience:
// its record is rebuilt into a tree here and that root is checked against the
// chain before any note is shown or any proof is made.
import { createPublicClient, encodeFunctionData, erc20Abi, getAddress, http, type Hex } from 'viem';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  evm, solana, fromServerState, evmRelayBody, solanaRelayBody, scanNotes, planShield, planTransaction,
  nextDepositNumber, protocolFeeOn, installWorkerProver, initPoseidon, type Keys, type MerkleTree, type Note,
} from '@darkswap/pool-client';
import { getQuote, getState, relay, type PoolChainInfo, type PoolState, type RelayQuote } from './api';
import { evmClientOn, type EvmWallet, type SolanaWallet } from './wallets';

let prover: ReturnType<typeof installWorkerProver> | null = null;
/** Starts the proving worker once; the keys are cached by the browser after the first download. */
export function ensureProver() {
  if (!prover) {
    const base = `${import.meta.env.BASE_URL}pool-keys/`;
    prover = installWorkerProver({ wasmUrl: `${base}transaction2.wasm`, zkeyUrl: `${base}transaction2.zkey` });
  }
  return prover;
}

export type Asset = PoolState['assets'][number] & { id: bigint };
export type LoadedPool = {
  info: PoolChainInfo;
  raw: PoolState;
  tree: MerkleTree;
  commitments: ReturnType<typeof fromServerState>['commitments'];
  spent: Set<bigint>;
  assets: Asset[];
  txOfIndex: Map<number, string>;
};

const evmReader = (info: PoolChainInfo) => createPublicClient({ transport: http(info.publicRpc) });
const solConnection = (info: PoolChainInfo) => new Connection(info.publicRpc, 'confirmed');
const programIdOf = (info: PoolChainInfo) => new PublicKey(info.programId!);

async function rootIsOnChain(info: PoolChainInfo, root: bigint, nextIndex: number): Promise<boolean> {
  if (info.kind === 'evm') {
    const client = evmReader(info);
    const pool = getAddress(info.pool!);
    const current = (await client.readContract({ address: pool, abi: evm.poolAbi, functionName: 'root' })) as bigint;
    if (current === root) return true;
    // The pool advanced since the indexer's pass: accept a root from its history.
    return (await client.readContract({ address: pool, abi: evm.poolAbi, functionName: 'isKnownRoot', args: [root] })) as boolean;
  }
  const pool = await solana.readPool(solConnection(info), programIdOf(info));
  return pool.root === root && pool.nextIndex === nextIndex;
}

/** Loads (or tops up) a pool's public record and verifies it against the chain. */
export async function loadPool(info: PoolChainInfo, prev?: LoadedPool): Promise<LoadedPool> {
  await initPoseidon();
  for (let attempt = 0; attempt < 3; attempt++) {
    const incremental = attempt === 0 && prev;
    const fetched = await getState(info.id, incremental ? prev.raw.nextIndex : 0);
    const raw: PoolState = incremental
      ? { ...fetched, commitments: [...prev.raw.commitments.filter((c) => c.index < prev.raw.nextIndex), ...fetched.commitments] }
      : fetched;
    const s = fromServerState(raw);
    if (await rootIsOnChain(info, s.tree.root, s.nextIndex)) {
      return {
        info, raw, tree: s.tree, commitments: s.commitments, spent: s.spent,
        assets: raw.assets.map((a) => ({ ...a, id: BigInt(a.assetId) })),
        txOfIndex: new Map(raw.commitments.map((c) => [c.index, c.tx])),
      };
    }
    await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
  }
  throw new Error('The pool record from DarkSwap does not match the chain. Nothing was shown or signed. Try again later.');
}

export const notesFor = (pool: LoadedPool, keys: Keys): Note[] => scanNotes(pool.commitments, keys, pool.assets.map((a) => a.id));

// ---- shield (from the user's own public wallet) -----------------------------

export async function shieldEvm(pool: LoadedPool, wallet: EvmWallet, keys: Keys, notes: Note[], asset: Asset, amount: bigint): Promise<string> {
  const client = await evmClientOn(wallet, pool.info.chainId!);
  const reader = evmReader(pool.info);
  const poolAddr = getAddress(pool.info.pool!);
  const fee = protocolFeeOn(amount, pool.raw.feeBps ?? 0);
  const plan = planShield({ keys, amount, depositNumber: nextDepositNumber(notes) });
  const isNative = getAddress(asset.token) === getAddress(evm.ETH);
  if (!isNative) {
    const token = getAddress(asset.token);
    const allowance = await reader.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [wallet.address, poolAddr] });
    if (allowance < amount + fee) {
      const hash = await client.sendTransaction({
        chain: null, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [poolAddr, amount + fee] }),
      });
      await reader.waitForTransactionReceipt({ hash });
    }
  }
  const data = encodeFunctionData({
    abi: evm.poolAbi, functionName: 'shield',
    args: [getAddress(asset.token), amount, plan.publicKey, plan.blinding, toHexBytes(plan.encryptedOutput)],
  });
  const hash = await client.sendTransaction({ chain: null, to: poolAddr, data, value: isNative ? amount + fee : 0n });
  await reader.waitForTransactionReceipt({ hash });
  return hash;
}

export async function shieldSolana(pool: LoadedPool, wallet: SolanaWallet, keys: Keys, notes: Note[], asset: Asset, amount: bigint): Promise<string> {
  const connection = solConnection(pool.info);
  const programId = programIdOf(pool.info);
  const mint = new PublicKey(asset.token);
  const plan = planShield({ keys, amount, depositNumber: nextDepositNumber(notes) });
  const depositorToken = mint.equals(solana.SOL_MINT) ? undefined : associatedTokenAddress(wallet.address, mint);
  const tx = new Transaction().add(
    solana.computeBudget(),
    solana.shieldIx(programId, wallet.address, mint, amount, plan.publicKey, plan.blinding, plan.encryptedOutput, depositorToken),
  );
  tx.feePayer = wallet.address;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  const { signature } = await wallet.provider.signAndSendTransaction(tx);
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}

// ---- private send and unshield ------------------------------------------------
// Private sends always go through the relayer. Unshields go through the relayer
// (fee in the withdrawn asset) or are submitted from the user's own wallet.

export type Progress = (step: 'proving' | 'relaying' | 'signing' | 'confirming') => void;

/** The relayer's fee for withdrawing this asset, or null if it does not accept it. */
export function relayerFeeFor(pool: LoadedPool, quote: RelayQuote | undefined, asset: Asset): bigint | null {
  if (!quote?.enabled) return null;
  if (isNativeAsset(pool, asset)) return BigInt(quote.fee);
  const key = pool.info.kind === 'evm' ? getAddress(asset.token) : asset.token;
  const fee = Object.entries(quote.tokenFees ?? {}).find(([t]) => (pool.info.kind === 'evm' ? getAddress(t) : t) === key)?.[1];
  return fee === undefined ? null : BigInt(fee);
}

export function isNativeAsset(pool: LoadedPool, asset: Asset): boolean {
  return pool.info.kind === 'evm' ? getAddress(asset.token) === getAddress(evm.ETH) : new PublicKey(asset.token).equals(solana.SOL_MINT);
}

/**
 * Where a Solana withdrawal lands: the wallet itself for SOL; for a token, the
 * wallet's token account for that mint (or the address itself if it already is one).
 */
async function solanaPayoutAccount(info: PoolChainInfo, owner: PublicKey, mint: PublicKey, symbol: string): Promise<PublicKey> {
  if (mint.equals(solana.SOL_MINT)) return owner;
  const connection = solConnection(info);
  const derived = associatedTokenAddress(owner, mint);
  if (await connection.getAccountInfo(derived, 'confirmed')) return derived;
  const direct = await connection.getAccountInfo(owner, 'confirmed');
  if (direct && direct.owner.equals(solana.TOKEN_PROGRAM_ID) && new PublicKey(direct.data.subarray(0, 32)).equals(mint)) return owner;
  throw new Error(`This address has no ${symbol} token account yet. The recipient needs to create one (most wallets do this when they first hold ${symbol}).`);
}

export async function privateSend(pool: LoadedPool, keys: Keys, notes: Note[], asset: Asset, amount: bigint, to: string, progress: Progress): Promise<string> {
  const plan = planTransaction({ kind: 'send', keys, notes, assetId: asset.id, amount, to });
  progress('proving');
  ensureProver();
  let body: unknown;
  if (pool.info.kind === 'evm') {
    body = evmRelayBody(await evm.proveTransaction({ plan, tree: pool.tree, token: asset.token, chainId: pool.info.chainId!, pool: pool.info.pool! }));
  } else {
    const quote = await getQuote(pool.info.id);
    if (!quote.enabled) throw new Error('The relayer is not running on this chain yet.');
    const programId = programIdOf(pool.info);
    const { proof } = await solana.proveTransaction({ plan, tree: pool.tree, mint: new PublicKey(asset.token), programId, value: null });
    body = solanaRelayBody(solana.transactIx(programId, new PublicKey(quote.relayer), proof, 0n, 0n, plan.encryptedOutputs[0], plan.encryptedOutputs[1], null));
  }
  progress('relaying');
  const { hash } = await relay(pool.info.id, body);
  progress('confirming');
  await waitFor(pool.info, hash);
  return hash;
}

export async function unshield(
  pool: LoadedPool, keys: Keys, notes: Note[], asset: Asset, amount: bigint, recipient: string, relayerFee: bigint, relayer: string, progress: Progress,
): Promise<string> {
  const plan = planTransaction({ kind: 'unshield', keys, notes, assetId: asset.id, amount, fee: relayerFee });
  let body: unknown;
  if (pool.info.kind === 'evm') {
    progress('proving');
    ensureProver();
    body = evmRelayBody(await evm.proveTransaction({
      plan, tree: pool.tree, token: asset.token, recipient: getAddress(recipient), relayer, chainId: pool.info.chainId!, pool: pool.info.pool!,
    }));
  } else {
    const mint = new PublicKey(asset.token);
    const isSol = mint.equals(solana.SOL_MINT);
    if (isSol) await solana.checkSolRecipient(solConnection(pool.info), new PublicKey(recipient), amount - protocolFeeOn(amount, pool.raw.feeBps ?? 0));
    const to = await solanaPayoutAccount(pool.info, new PublicKey(recipient), mint, asset.symbol);
    progress('proving');
    ensureProver();
    const programId = programIdOf(pool.info);
    const relayerKey = new PublicKey(relayer);
    const value = { mint, recipient: to, relayer: isSol ? relayerKey : associatedTokenAddress(relayerKey, mint) };
    const { proof } = await solana.proveTransaction({ plan, tree: pool.tree, mint: value.mint, programId, value });
    body = solanaRelayBody(solana.transactIx(programId, value.relayer, proof, plan.extAmount, plan.fee, plan.encryptedOutputs[0], plan.encryptedOutputs[1], value));
  }
  progress('relaying');
  const { hash } = await relay(pool.info.id, body);
  progress('confirming');
  await waitFor(pool.info, hash);
  return hash;
}

/**
 * Withdraws from the user's own wallet, with no relayer and no relayer fee.
 * The wallet signs, pays the network fee and appears on chain as the sender.
 */
export async function unshieldFromWallet(
  pool: LoadedPool, wallet: EvmWallet | SolanaWallet, keys: Keys, notes: Note[], asset: Asset, amount: bigint, recipient: string, progress: Progress,
): Promise<string> {
  const plan = planTransaction({ kind: 'unshield', keys, notes, assetId: asset.id, amount, fee: 0n });
  if (pool.info.kind === 'evm' && wallet.kind === 'evm') {
    const client = await evmClientOn(wallet, pool.info.chainId!);
    progress('proving');
    ensureProver();
    const { proof, ext } = await evm.proveTransaction({
      plan, tree: pool.tree, token: asset.token, recipient: getAddress(recipient), chainId: pool.info.chainId!, pool: pool.info.pool!,
    });
    progress('signing');
    const hash = await client.sendTransaction({
      chain: null, to: getAddress(pool.info.pool!),
      data: encodeFunctionData({ abi: evm.poolAbi, functionName: 'transact', args: [proof, ext] }),
    });
    progress('confirming');
    await evmReader(pool.info).waitForTransactionReceipt({ hash });
    return hash;
  }
  if (pool.info.kind === 'solana' && wallet.kind === 'solana') {
    const connection = solConnection(pool.info);
    const mint = new PublicKey(asset.token);
    const isSol = mint.equals(solana.SOL_MINT);
    if (isSol) await solana.checkSolRecipient(connection, new PublicKey(recipient), amount - protocolFeeOn(amount, pool.raw.feeBps ?? 0));
    const to = await solanaPayoutAccount(pool.info, new PublicKey(recipient), mint, asset.symbol);
    progress('proving');
    ensureProver();
    const programId = programIdOf(pool.info);
    // No fee is paid, so the relayer slot only has to be a valid account of the right kind.
    const value = { mint, recipient: to, relayer: isSol ? wallet.address : to };
    const { proof } = await solana.proveTransaction({ plan, tree: pool.tree, mint, programId, value });
    const tx = new Transaction().add(
      solana.computeBudget(),
      solana.transactIx(programId, wallet.address, proof, plan.extAmount, 0n, plan.encryptedOutputs[0], plan.encryptedOutputs[1], value),
    );
    tx.feePayer = wallet.address;
    tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
    progress('signing');
    const { signature } = await wallet.provider.signAndSendTransaction(tx);
    progress('confirming');
    await connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }
  throw new Error('Connect a wallet for this chain first.');
}

// ---- protocol fee sweep (anyone may call; funds only go to the fee recipient) -

export async function sweepFees(pool: LoadedPool, wallet: EvmWallet | SolanaWallet, asset: Asset): Promise<string> {
  if (pool.info.kind === 'evm' && wallet.kind === 'evm') {
    const client = await evmClientOn(wallet, pool.info.chainId!);
    const hash = await client.sendTransaction({
      chain: null, to: getAddress(pool.info.pool!),
      data: encodeFunctionData({ abi: evm.poolAbi, functionName: 'collectFees', args: [getAddress(asset.token)] }),
    });
    await evmReader(pool.info).waitForTransactionReceipt({ hash });
    return hash;
  }
  if (pool.info.kind === 'solana' && wallet.kind === 'solana') {
    const connection = solConnection(pool.info);
    const mint = new PublicKey(asset.token);
    // The fee recipient is not shown or served by DarkSwap; read it from the pool itself.
    const { feeRecipient: recipient } = await solana.readPool(connection, programIdOf(pool.info));
    const destination = mint.equals(solana.SOL_MINT) ? recipient : associatedTokenAddress(recipient, mint);
    const tx = new Transaction().add(solana.collectFeesIx(programIdOf(pool.info), mint, destination));
    tx.feePayer = wallet.address;
    tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
    const { signature } = await wallet.provider.signAndSendTransaction(tx);
    await connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }
  throw new Error('Connect a wallet for this chain first.');
}

// ---- helpers -----------------------------------------------------------------

const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), solana.TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ATA_PROGRAM_ID)[0];
}

const toHexBytes = (bytes: Uint8Array): Hex => `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;

async function waitFor(info: PoolChainInfo, hash: string) {
  if (info.kind === 'evm') await evmReader(info).waitForTransactionReceipt({ hash: hash as Hex });
  else await solConnection(info).confirmTransaction(hash, 'confirmed');
}
