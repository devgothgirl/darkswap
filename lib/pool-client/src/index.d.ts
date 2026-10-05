// Types for @darkswap/pool-client. The JavaScript sources are the reference;
// these declarations cover what the app and the API server use.
import type { Abi, Hex } from "viem";
import type { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";

export declare const FIELD: bigint;
export declare const LEVELS: number;
export declare function initPoseidon(): Promise<unknown>;
export declare function poseidon(inputs: Array<bigint | number | string>): bigint;
export declare const mod: (x: bigint | number | string) => bigint;
export declare const zeroLeaf: () => bigint;
export declare function zeroHashes(levels?: number): bigint[];
export declare function randomField(): bigint;
export declare const hex32: (x: bigint | number | string) => string;
export declare function stringify(value: unknown): unknown;

export declare class MerkleTree {
  constructor(leaves?: Array<bigint | string>, levels?: number);
  levels: number;
  layers: bigint[][];
  insert(leaf: bigint): void;
  readonly root: bigint;
  path(index: number): bigint[];
}

export interface Note {
  amount: bigint;
  assetId: bigint;
  privateKey: bigint;
  publicKey: bigint;
  blinding: bigint;
  pathIndex: number;
  commitment: bigint;
  nullifier: bigint;
  depositNumber: number | null;
}

export interface CommitmentEvent {
  commitment: bigint | string;
  index: number | bigint;
  encryptedOutput: Uint8Array;
}

export declare class Keys {
  constructor(secret: Uint8Array);
  privateKey: bigint;
  publicKey: bigint;
  encPrivate: Uint8Array;
  encPublic: Uint8Array;
  depositPrivateKey(i: number): bigint;
  static random(): Keys;
  readonly address: string;
}

export declare function encodeAddress(publicKey: bigint, encPublic: Uint8Array): string;
export declare function decodeAddress(address: string): { publicKey: bigint; encPublic: Uint8Array };
export declare const ENCRYPTED_NOTE_BYTES: number;
export declare function encryptNote(note: { amount: bigint; blinding: bigint }, recipientEncPub: Uint8Array): Uint8Array;
export declare function decryptNote(ciphertext: Uint8Array, keys: Keys): { amount: bigint; blinding: bigint } | null;
export declare function scanNotes(events: CommitmentEvent[], keys: Keys, assetIds: bigint[], gap?: number): Note[];
export declare function nextDepositNumber(notes: Note[]): number;
export declare function planShield(args: { keys: Keys; amount: bigint; depositNumber: number }): {
  publicKey: bigint;
  blinding: bigint;
  encryptedOutput: Uint8Array;
};
export declare function unspent(notes: Note[], spentSet: Set<bigint>, assetId: bigint): Note[];
export declare function selectNotes(candidates: Note[], need: bigint): Note[];

export interface Plan {
  inputs: Note[];
  outputs: Array<{ amount: bigint; assetId: bigint; publicKey: bigint; blinding: bigint; commitment: bigint }>;
  encryptedOutputs: [Uint8Array, Uint8Array];
  extAmount: bigint;
  fee: bigint;
}
export declare function planTransaction(args: {
  kind: "send" | "unshield" | "deposit";
  keys: Keys;
  notes: Note[];
  assetId: bigint;
  amount: bigint;
  fee?: bigint;
  to?: string;
}): Plan;
export declare const protocolFeeOn: (amount: bigint, bps: bigint | number) => bigint;

export declare const ACTIVATION_MESSAGE: string;
export declare function secretFromSignature(signature: Uint8Array): Uint8Array;
export declare function secretToWords(secret: Uint8Array): string;
export declare function normalizeWords(words: string): string;
export declare function wordsToSecret(words: string): Uint8Array;
export declare const keysFromSignature: (signature: Uint8Array) => Keys;
export declare const keysFromWords: (words: string) => Keys;
export declare class KeySession {
  constructor(options?: { idleMs?: number; onLock?: () => void });
  keys: Keys | null;
  unlock(secret: Uint8Array): Keys;
  touch(): void;
  words(): string;
  lock(notify?: boolean): void;
}

export interface Groth16Output {
  proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] };
  publicSignals: string[];
}
export declare function setProver(fn: ((input: unknown) => Promise<Groth16Output>) | null): void;
export declare function setProverArtifacts(artifacts: { wasm: unknown; zkey: unknown }): void;
export declare function prove(input: unknown): Promise<Groth16Output>;
export declare function installWorkerProver(urls: { wasmUrl: string; zkeyUrl: string }): {
  warm(): Promise<unknown>;
  terminate(): void;
};

export interface EvmExt {
  recipient: Hex;
  extAmount: bigint;
  relayer: Hex;
  fee: bigint;
  token: Hex;
  encryptedOutput1: Hex;
  encryptedOutput2: Hex;
}
export interface EvmProof {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
  root: bigint;
  inputNullifiers: [bigint, bigint];
  outputCommitments: [bigint, bigint];
}
export declare namespace evm {
  const ETH: Hex;
  const poolAbi: Abi;
  function extDataHash(ext: EvmExt, chainId: number | bigint, pool: string): bigint;
  function assetIdOf(token: string): bigint;
  function proveTransaction(args: {
    plan: Plan;
    tree: MerkleTree;
    token: string;
    recipient?: string;
    relayer?: string;
    chainId: number | bigint;
    pool: string;
  }): Promise<{ proveMs: number; proof: EvmProof; ext: EvmExt }>;
}

export interface SolanaProof {
  a: [bigint, bigint];
  b: [bigint, bigint, bigint, bigint];
  c: [bigint, bigint];
  root: bigint;
  nullifiers: [bigint, bigint];
  commitments: [bigint, bigint];
}
export declare namespace solana {
  const TOKEN_PROGRAM_ID: PublicKey;
  const SOL_MINT: PublicKey;
  function pdas(programId: PublicKey): {
    pool: PublicKey;
    solVault: PublicKey;
    asset(mint: PublicKey): PublicKey;
    vault(mint: PublicKey): PublicKey;
    nullifier(n: bigint): PublicKey;
    programData: PublicKey;
  };
  function assetIdOf(mint: PublicKey): bigint;
  function extDataHash(args: {
    programId: PublicKey; recipient: PublicKey; relayer: PublicKey; mint: PublicKey;
    extAmount: bigint; fee: bigint; enc0: Uint8Array; enc1: Uint8Array;
  }): bigint;
  function collectFeesIx(programId: PublicKey, mint: PublicKey, destination: PublicKey): TransactionInstruction;
  function shieldIx(
    programId: PublicKey, depositor: PublicKey, mint: PublicKey, amount: bigint, publicKey: bigint,
    blinding: bigint, encryptedOutput: Uint8Array, depositorToken?: PublicKey,
  ): TransactionInstruction;
  function transactIx(
    programId: PublicKey, payer: PublicKey, proof: SolanaProof, extAmount: bigint, fee: bigint,
    enc0: Uint8Array, enc1: Uint8Array, value: { mint: PublicKey; recipient: PublicKey; relayer: PublicKey } | null,
  ): TransactionInstruction;
  function computeBudget(units?: number): TransactionInstruction;
  function readPool(connection: Connection, programId: PublicKey): Promise<{
    nextIndex: number; root: bigint; paused: boolean; feeBps: number; feeRecipient: PublicKey;
  }>;
  function readAsset(connection: Connection, programId: PublicKey, mint: PublicKey): Promise<{
    mint: PublicKey; enabled: boolean; decimals: number; maxDeposit: bigint; cap: bigint;
    balance: bigint; minDeposit: bigint; fees: bigint;
  } | null>;
  function checkSolRecipient(connection: Connection, recipient: PublicKey, lamports: bigint): Promise<void>;
  function proveTransaction(args: {
    plan: Plan; tree: MerkleTree; mint: PublicKey; programId: PublicKey;
    value: { mint: PublicKey; recipient: PublicKey; relayer: PublicKey } | null;
  }): Promise<{ proveMs: number; proof: SolanaProof }>;
}

export declare namespace solana {
  function poolCalls(tx: unknown, programId: PublicKey): Array<{ data: Buffer; accounts: PublicKey[] }>;
  function inExecutionOrder(connection: Connection, sigs: Array<{ slot: number; signature: string }>): Promise<string[]>;
}

export interface ServerPoolState {
  nextIndex: number;
  root: string | null;
  commitments: Array<{ index: number; commitment: string; encryptedOutput: string; tx: string }>;
  spentNullifiers: string[];
  spentTx: Record<string, string>;
  assets: Array<{ token: string; assetId: string; symbol: string; decimals: number }>;
  feeBps: number | null;
  protocolFees: Array<{ token: string; symbol: string; decimals: number; charged: string; unswept: string; swept: string }>;
  indexedAt: string | null;
}
export declare function fromServerState(state: Pick<ServerPoolState, "nextIndex" | "commitments" | "spentNullifiers">): {
  tree: MerkleTree;
  commitments: Array<CommitmentEvent & { commitment: bigint; index: number; tx: string }>;
  spent: Set<bigint>;
  nextIndex: number;
};
// ---- relayer fee formula (src/relayer-fees.js) ------------------------------
// One definition of the relayer's quote, shared by the relayer, the volume
// exporter that inverts it and the earnings calculator.
export declare const EVM_TRANSACT_GAS: bigint;
export declare const QUOTE_HEADROOM_NUM: bigint;
export declare const QUOTE_HEADROOM_DEN: bigint;
export declare const LAMPORTS_PER_SIGNATURE: bigint;
export declare const SOLANA_NULLIFIER_ACCOUNTS: bigint;
export declare function withQuoteHeadroom(gas: bigint): bigint;
export declare function evmRelayerQuote(gasPriceWei: bigint, margin?: bigint): bigint;
export declare function solanaRelayerQuote(rentLamports: bigint, margin?: bigint, signatureLamports?: bigint): bigint;
export declare function evmGasPriceFromQuote(quoteOverMargin: bigint): bigint;
export declare function solanaRentFromQuote(quoteOverMargin: bigint): bigint;

export declare function evmRelayBody(args: { proof: EvmProof; ext: EvmExt }): unknown;
export declare function solanaRelayBody(ix: TransactionInstruction): { data: string; accounts: string[] };
