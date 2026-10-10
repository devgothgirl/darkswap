// Submits shielded-pool transactions so the user's own wallet never appears.
// Logs only tx hashes and errors: never IPs, user agents or wallet addresses.
// Free-send spending is reserved in shared storage without request identities.
import {
  BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, erc20Abi, getAddress, http, isAddress, isHex, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ComputeBudgetProgram, Connection, Keypair, PublicKey, SendTransactionError, Transaction,
} from "@solana/web3.js";
import {
  evm, solana, evmRelayerQuote, solanaRelayerQuote, withQuoteHeadroom,
} from "@darkswap/pool-client";
import { logger } from "../logger";
import { evmDeployment, rpcUrl, solanaProgramId, type EvmChain, type PoolChain, type SolanaChain } from "./config";
import { RelayError } from "./relay-error";
import { FREE_WINDOW_MS, freePerWindow, takeFreeSlot } from "./free-quota";
export { RelayError } from "./relay-error";

/** Margin on top of network costs, in the chain's base unit (wei / lamports). */
function margin(chain: PoolChain): bigint {
  const raw = process.env[`POOL_RELAY_MIN_FEE_${chain.envKey}`];
  if (raw === undefined || raw === "") return 0n;
  if (!/^\d+$/.test(raw)) throw new RelayError("Relayer fee margin is misconfigured.", 503);
  return BigInt(raw);
}

// ---- token fees --------------------------------------------------------------
//
// The pool pays the relayer in the asset being withdrawn, while the relayer
// pays the network in the chain's coin. A token is accepted only when the
// operator sets its rate in POOL_RELAY_TOKEN_RATES_<CHAIN>, a JSON object of
// { "<token address or mint>": "<whole tokens per 1 whole native coin>" }.
// Testnet tokens have no market price, so there is no automatic feed; a live
// price source is needed before mainnet. Tokens without a rate can still be
// withdrawn from the user's own wallet.

type Rate = { num: bigint; den: bigint };

function parseRate(raw: string): Rate | null {
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const [whole, frac = ""] = raw.split(".");
  const num = BigInt(whole + frac);
  if (num === 0n) return null;
  return { num, den: 10n ** BigInt(frac.length) };
}

function tokenRates(chain: PoolChain): Map<string, Rate> {
  const raw = process.env[`POOL_RELAY_TOKEN_RATES_${chain.envKey}`];
  const rates = new Map<string, Rate>();
  if (!raw) return rates;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new RelayError("Relayer token rates are misconfigured.", 503); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new RelayError("Relayer token rates are misconfigured.", 503);
  for (const [token, value] of Object.entries(parsed as Record<string, unknown>)) {
    const rate = parseRate(String(value));
    if (!rate) throw new RelayError("Relayer token rates are misconfigured.", 503);
    let key: string;
    try { key = chain.kind === "evm" ? getAddress(token) : new PublicKey(token).toBase58(); } catch { throw new RelayError("Relayer token rates are misconfigured.", 503); }
    rates.set(key, rate);
  }
  return rates;
}

const NATIVE_DECIMALS = { evm: 18, solana: 9 } as const;

/** A native-coin amount in a token's base units, rounded up. */
function inToken(chain: PoolChain, native: bigint, rate: Rate, tokenDecimals: number): bigint {
  const num = native * rate.num * 10n ** BigInt(tokenDecimals);
  const den = rate.den * 10n ** BigInt(NATIVE_DECIMALS[chain.kind]);
  return (num + den - 1n) / den;
}

const decimalsCache = new Map<string, number>();

// ---- EVM -------------------------------------------------------------------

function evmRelayer(chain: EvmChain) {
  const key = process.env.POOL_RELAYER_PRIVATE_KEY_EVM;
  const dep = evmDeployment(chain);
  const url = rpcUrl(chain);
  if (!key || !dep || !url) return null;
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  return {
    account, dep, pool: getAddress(dep.pool),
    publicClient: createPublicClient({ transport: http(url) }),
    walletClient: createWalletClient({ account, transport: http(url) }),
  };
}

async function evmDecimals(chain: EvmChain, r: NonNullable<ReturnType<typeof evmRelayer>>, token: Hex): Promise<number> {
  const key = `${chain.id}:${token}`;
  if (!decimalsCache.has(key)) {
    decimalsCache.set(key, Number(await r.publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" })));
  }
  return decimalsCache.get(key)!;
}

async function evmQuote(chain: EvmChain) {
  const r = evmRelayer(chain);
  if (!r) return null;
  const gasPrice = await r.publicClient.getGasPrice();
  const fee = evmRelayerQuote(gasPrice, margin(chain));
  const tokenFees: Record<string, string> = {};
  for (const [token, rate] of tokenRates(chain)) {
    tokenFees[token] = inToken(chain, fee, rate, await evmDecimals(chain, r, token as Hex)).toString();
  }
  return { relayer: r.account.address, fee, tokenFees };
}

const big = (v: unknown, what: string) => {
  if (typeof v !== "string" || !/^-?\d{1,80}$/.test(v)) throw new RelayError(`Bad ${what}.`);
  return BigInt(v);
};
const pair = (v: unknown, what: string): [bigint, bigint] => {
  if (!Array.isArray(v) || v.length !== 2) throw new RelayError(`Bad ${what}.`);
  return [big(v[0], what), big(v[1], what)];
};
const addr = (v: unknown, what: string) => {
  if (typeof v !== "string" || !isAddress(v)) throw new RelayError(`Bad ${what}.`);
  return getAddress(v);
};
const bytes = (v: unknown, what: string) => {
  if (typeof v !== "string" || !isHex(v) || v.length > 2 + 2 * 512) throw new RelayError(`Bad ${what}.`);
  return v as Hex;
};

function revertName(err: unknown): string | null {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? "reverted";
  }
  return null;
}

async function relayEvm(chain: EvmChain, body: Record<string, unknown>) {
  const r = evmRelayer(chain);
  if (!r) throw new RelayError("The relayer is not running on this chain yet.", 503);
  const p = (body.proof ?? {}) as Record<string, unknown>;
  const e = (body.ext ?? {}) as Record<string, unknown>;
  const proof = {
    a: pair(p.a, "proof"), b: [pair((p.b as unknown[])?.[0], "proof"), pair((p.b as unknown[])?.[1], "proof")] as [[bigint, bigint], [bigint, bigint]],
    c: pair(p.c, "proof"), root: big(p.root, "root"),
    inputNullifiers: pair(p.inputNullifiers, "nullifiers"), outputCommitments: pair(p.outputCommitments, "commitments"),
  };
  const ext = {
    recipient: addr(e.recipient, "recipient"), extAmount: big(e.extAmount, "amount"), relayer: addr(e.relayer, "relayer"),
    fee: big(e.fee, "fee"), token: addr(e.token, "token"),
    encryptedOutput1: bytes(e.encryptedOutput1, "note"), encryptedOutput2: bytes(e.encryptedOutput2, "note"),
  };
  if (ext.extAmount > 0n) throw new RelayError("Deposits are sent from your own wallet, not the relayer.");
  const isTransfer = ext.extAmount === 0n && ext.fee === 0n;

  const isNative = ext.token === getAddress(evm.ETH);
  let rate: Rate | undefined;
  if (!isTransfer) {
    if (ext.relayer !== r.account.address) throw new RelayError("This proof pays a different relayer. Refresh and try again.");
    if (!isNative) {
      rate = tokenRates(chain).get(ext.token);
      if (!rate) throw new RelayError("The relayer does not accept this token. Withdraw it from your own wallet instead.");
    }
  }

  const call = { address: r.pool, abi: evm.poolAbi, functionName: "transact", args: [proof, ext], account: r.account } as const;
  let gas: bigint;
  try {
    await r.publicClient.simulateContract(call);
    gas = await r.publicClient.estimateContractGas(call);
  } catch (err) {
    const name = revertName(err);
    throw new RelayError(name ? `The pool refused this transaction: ${name}.` : "Could not simulate this transaction.");
  }
  if (isTransfer) await takeFreeSlot(chain.id);
  else {
    const gasPrice = await r.publicClient.getGasPrice();
    const neededNative = gas * gasPrice + margin(chain);
    const needed = rate ? inToken(chain, neededNative, rate, await evmDecimals(chain, r, ext.token)) : neededNative;
    if (ext.fee < needed) throw new RelayError(`Relayer fee too low: at least ${needed} ${rate ? "token base units" : "wei"} is needed right now.`);
  }
  const hash = await r.walletClient.writeContract({ ...call, chain: null, gas: withQuoteHeadroom(gas) });
  logger.info({ chain: chain.id, hash }, "pool relay sent");
  return { hash };
}

// ---- Solana ----------------------------------------------------------------

function solanaRelayer(chain: SolanaChain) {
  const raw = process.env.POOL_RELAYER_KEYPAIR_SOLANA;
  const programId = solanaProgramId(chain);
  const url = rpcUrl(chain);
  if (!raw || !programId || !url) return null;
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
  return { keypair, programId, connection: new Connection(url, "confirmed") };
}

const ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const ata = (owner: PublicKey, mint: PublicKey) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), solana.TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ATA_PROGRAM_ID)[0];

async function solanaDecimals(chain: SolanaChain, r: NonNullable<ReturnType<typeof solanaRelayer>>, mint: PublicKey): Promise<number | null> {
  const key = `${chain.id}:${mint.toBase58()}`;
  if (!decimalsCache.has(key)) {
    const asset = await solana.readAsset(r.connection, r.programId, mint);
    if (!asset) return null; // not listed in this pool
    decimalsCache.set(key, asset.decimals);
  }
  return decimalsCache.get(key)!;
}

async function solanaQuote(chain: SolanaChain) {
  const r = solanaRelayer(chain);
  if (!r) return null;
  const rent = BigInt(await r.connection.getMinimumBalanceForRentExemption(0));
  const fee = solanaRelayerQuote(rent, margin(chain));
  const tokenFees: Record<string, string> = {};
  for (const [token, rate] of tokenRates(chain)) {
    const mint = new PublicKey(token);
    const decimals = await solanaDecimals(chain, r, mint);
    // The fee is paid into the relayer's own token account, which the operator creates once per token.
    if (decimals === null || !(await r.connection.getAccountInfo(ata(r.keypair.publicKey, mint)))) {
      logger.warn({ chain: chain.id, mint: token }, "token rate set but the asset is unlisted or the relayer has no token account");
      continue;
    }
    tokenFees[token] = inToken(chain, fee, rate, decimals).toString();
  }
  return { relayer: r.keypair.publicKey.toBase58(), fee, tokenFees };
}

async function relaySolana(chain: SolanaChain, body: Record<string, unknown>) {
  const r = solanaRelayer(chain);
  if (!r) throw new RelayError("The relayer is not running on this chain yet.", 503);
  if (typeof body.data !== "string") throw new RelayError("Bad instruction data.");
  const data = Buffer.from(body.data, "base64");
  if (data.length < 437 || data.length > 1100 || data[0] !== 6) throw new RelayError("Only pool transact instructions can be relayed.");
  const accounts = Array.isArray(body.accounts) ? body.accounts : [];
  let keys: PublicKey[];
  try { keys = accounts.map((a) => new PublicKey(String(a))); } catch { throw new RelayError("Bad account list."); }

  // The client builds the instruction with the relayer as payer; every
  // account must be exactly what transactIx derives, so nothing else rides along.
  const extAmount = data.readBigInt64LE(1 + 416);
  const fee = data.readBigUInt64LE(1 + 424);
  if (extAmount > 0n) throw new RelayError("Deposits are sent from your own wallet, not the relayer.");
  const isTransfer = extAmount === 0n && fee === 0n;
  const p = solana.pdas(r.programId);
  const n0 = BigInt("0x" + data.subarray(1 + 288, 1 + 320).toString("hex"));
  const n1 = BigInt("0x" + data.subarray(1 + 320, 1 + 352).toString("hex"));
  const expected = [r.keypair.publicKey, p.pool, p.nullifier(n0), p.nullifier(n1), solana.SOL_MINT];
  // SOL: 9 accounts, paid to the relayer's wallet. Tokens: 11 accounts (plus
  // mint and token program), paid to the relayer's token account for the mint.
  let mint = solana.SOL_MINT;
  let rate: Rate | undefined;
  if (isTransfer) {
    if (keys.length !== 5) throw new RelayError("Bad account list.");
  } else if (keys.length === 9) {
    if (!keys[8].equals(r.keypair.publicKey)) throw new RelayError("This proof pays a different relayer. Refresh and try again.");
    expected.push(p.asset(mint), p.vault(mint), keys[7], r.keypair.publicKey);
  } else if (keys.length === 11) {
    mint = keys[9];
    rate = tokenRates(chain).get(mint.toBase58());
    if (!rate) throw new RelayError("The relayer does not accept this token. Withdraw it from your own wallet instead.");
    const relayerToken = ata(r.keypair.publicKey, mint);
    if (!keys[8].equals(relayerToken)) throw new RelayError("This proof pays a different relayer. Refresh and try again.");
    expected.push(p.asset(mint), p.vault(mint), keys[7], relayerToken, mint, solana.TOKEN_PROGRAM_ID);
  } else {
    throw new RelayError("Bad account list.");
  }
  if (!keys.every((k, i) => k.equals(expected[i]))) throw new RelayError("Bad account list.");

  if (!isTransfer) {
    const rent = BigInt(await r.connection.getMinimumBalanceForRentExemption(0));
    const neededNative = solanaRelayerQuote(rent, margin(chain));
    if (rate) {
      const decimals = await solanaDecimals(chain, r, mint);
      if (decimals === null) throw new RelayError("This token is not listed in the pool.");
      const needed = inToken(chain, neededNative, rate, decimals);
      if (fee < needed) throw new RelayError(`Relayer fee too low: at least ${needed} token base units is needed (network fee and two nullifier accounts).`);
    } else if (fee < neededNative) {
      throw new RelayError(`Relayer fee too low: at least ${neededNative} lamports is needed (network fee and two nullifier accounts).`);
    }
  }

  const ix = solana.transactIx(r.programId, r.keypair.publicKey,
    { a: [0n, 0n], b: [0n, 0n, 0n, 0n], c: [0n, 0n], root: 0n, nullifiers: [n0, n1], commitments: [0n, 0n] },
    0n, 0n, new Uint8Array(), new Uint8Array(),
    isTransfer ? null : { mint, recipient: keys[7], relayer: keys[8] });
  ix.data = data; // same accounts as derived above; the client's exact bytes
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ix);
  tx.feePayer = r.keypair.publicKey;
  tx.recentBlockhash = (await r.connection.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(r.keypair);

  const sim = await r.connection.simulateTransaction(tx);
  if (sim.value.err) {
    const custom = (sim.value.err as { InstructionError?: [number, { Custom?: number }] }).InstructionError?.[1]?.Custom;
    throw new RelayError(`The pool refused this transaction: ${custom !== undefined ? (SOLANA_ERRORS[custom] ?? `error ${custom}`) : "simulation failed"}.`);
  }
  if (isTransfer) await takeFreeSlot(chain.id);
  try {
    const signature = await r.connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    logger.info({ chain: chain.id, signature }, "pool relay sent");
    return { hash: signature };
  } catch (err) {
    logger.error({ chain: chain.id, err: safeError(err) }, "pool relay failed");
    throw new RelayError("The network did not accept this transaction.", 502);
  }
}

// From solana/pool/src/lib.rs (the numbers e2e-solana.mjs asserts on).
const SOLANA_ERRORS: Record<number, string> = {
  1: "NotAdmin", 2: "WrongFeeDestination", 3: "DepositsAreOff", 8: "UnknownRoot", 9: "NullifierAlreadySpent",
  12: "InvalidProof", 16: "NotUpgradeAuthority", 18: "UnderDepositMinimum", 19: "FeeTooHigh", 20: "NothingToCollect",
};

// ---- entry points ----------------------------------------------------------

export async function quote(chain: PoolChain) {
  const q = chain.kind === "evm" ? await evmQuote(chain) : await solanaQuote(chain);
  if (!q) return { enabled: false as const };
  return { enabled: true as const, relayer: q.relayer, fee: q.fee.toString(), tokenFees: q.tokenFees, freePerWindow: freePerWindow(), windowMinutes: FREE_WINDOW_MS / 60_000 };
}

export async function relay(chain: PoolChain, body: unknown) {
  if (!body || typeof body !== "object") throw new RelayError("Missing request body.");
  try {
    return chain.kind === "evm" ? await relayEvm(chain, body as Record<string, unknown>) : await relaySolana(chain, body as Record<string, unknown>);
  } catch (err) {
    if (err instanceof RelayError) throw err;
    logger.error({ chain: chain.id, err: safeError(err) }, "pool relay failed");
    throw new RelayError("The relayer could not send this transaction.", 502);
  }
}

// The operator's configured margin for this chain, so the volume exporter
// reports the same number the relayer quotes with.
export { margin as relayMargin };

// Library error messages can echo call arguments (recipient addresses), so
// only the short summary or the error class is logged.
export function safeError(err: unknown): string {
  if (err instanceof BaseError) return err.shortMessage;
  if (err instanceof SendTransactionError) return "SendTransactionError";
  return err instanceof Error ? err.name : "unknown";
}
