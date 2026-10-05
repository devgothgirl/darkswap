// What the relayer charges for an unshield, and that it never charges less.
//
// Three numbers decide what a user pays to withdraw privately: the network
// cost, the operator's margin (POOL_RELAY_MIN_FEE_<CHAIN>, the only part
// chosen by hand), and the check that refuses an underpaying proof. The quote
// and the check are written out twice in relayer.ts, so they can drift apart
// without anything failing; these tests pin both to the same figure.
//
// No network is touched: the EVM side answers viem's JSON-RPC calls from a
// stubbed global fetch, and the Solana side stubs the Connection reads. Both
// chains point at an unroutable RPC URL, so a missed stub fails the test
// rather than reaching a real cluster.
//
// What this cannot cover: the gas a real `transact` burns (the EVM e2e run
// measures that) and a real Solana cluster, which this environment has none of.
import assert from "node:assert/strict";
import test, { after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  EVM_TRANSACT_GAS, LAMPORTS_PER_SIGNATURE, SOLANA_NULLIFIER_ACCOUNTS,
  evm, evmRelayBody, solana, solanaRelayBody, withQuoteHeadroom,
} from "@darkswap/pool-client";

const POOL = getAddress("0x1111111111111111111111111111111111111111");
const OTHER = getAddress("0x2222222222222222222222222222222222222222");
const SENT_HASH = "0x00000000000000000000000000000000000000000000000000000000000000aa";
// Anvil's first published account: a throwaway key everyone has, used here
// only so the relayer can derive an address and sign a transaction offline.
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const UNROUTABLE_RPC = "http://127.0.0.1:1";

// A deployment file for the local chain, so evmRelayer() has a pool to call.
const deploymentsDir = fs.mkdtempSync(path.join(os.tmpdir(), "pool-relayer-"));
fs.writeFileSync(path.join(deploymentsDir, "31337.json"), JSON.stringify({
  chainId: 31337, pool: POOL, verifier: OTHER, owner: OTHER, feeRecipient: OTHER, protocolFeeBps: 50, deployBlock: 0,
}));
after(() => fs.rmSync(deploymentsDir, { recursive: true, force: true }));

process.env.NODE_ENV = "test";
process.env.POOL_DEPLOYMENTS_DIR = deploymentsDir;
process.env.RPC_URL_ANVIL = UNROUTABLE_RPC;
process.env.RPC_URL_SOLANA_DEVNET = UNROUTABLE_RPC;
process.env.POOL_RELAYER_PRIVATE_KEY_EVM = ANVIL_KEY;
// A fixed test keypair; it holds nothing and signs nothing that is broadcast.
const relayerKeypair = Keypair.fromSeed(new Uint8Array(32).fill(7));
process.env.POOL_RELAYER_KEYPAIR_SOLANA = JSON.stringify(Array.from(relayerKeypair.secretKey));
process.env.POOL_PROGRAM_ID_DEVNET = "Dark1oo1111111111111111111111111111111111111";
// Token fees are a separate conversion on top of these figures; left out so
// the native quote is what is being measured.
delete process.env.POOL_RELAY_TOKEN_RATES_ANVIL;
delete process.env.POOL_RELAY_TOKEN_RATES_SOLANA_DEVNET;

const { findChain } = await import("./config");
const { quote, relay, relayMargin, RelayError } = await import("./relayer");

const evmChain = findChain("anvil")!;
const solanaChain = findChain("solana-devnet")!;
if (evmChain?.kind !== "evm") throw new Error("anvil should be an EVM chain");
if (solanaChain?.kind !== "solana") throw new Error("solana-devnet should be a Solana chain");

const relayerAddress = privateKeyToAccount(ANVIL_KEY).address;
const programId = new PublicKey(process.env.POOL_PROGRAM_ID_DEVNET!);

const GAS_PRICE = 130_000_000n; // 0.13 gwei
const RENT = 890_880n; // lamports for a rent-exempt empty account
const EVM_MARGIN = 20_000_000_000_000n; // 0.00002 ETH
const SOLANA_MARGIN = 7_000n;

// ---- stubs -----------------------------------------------------------------

const hex = (v: bigint) => `0x${v.toString(16)}`;

/** Answers viem's JSON-RPC calls; anything unstubbed fails the call it came from. */
async function withRpc<T>(methods: Record<string, (params: unknown[]) => unknown>, run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const call = JSON.parse(String(init?.body ?? "{}")) as { id?: number; method?: string; params?: unknown[] };
    const handler = methods[String(call.method)];
    const body = handler
      ? { jsonrpc: "2.0", id: call.id, result: handler(call.params ?? []) }
      : { jsonrpc: "2.0", id: call.id, error: { code: -32601, message: `unstubbed RPC call: ${call.method}` } };
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  try { return await run(); } finally { globalThis.fetch = real; }
}

/** The one cluster read the Solana quote makes, and the two the relay path adds. */
async function withSolanaReads<T>(run: () => Promise<T>, simulated?: { err: unknown }): Promise<T> {
  const proto = Connection.prototype as unknown as Record<string, unknown>;
  const real = {
    rent: proto.getMinimumBalanceForRentExemption,
    blockhash: proto.getLatestBlockhash,
    simulate: proto.simulateTransaction,
  };
  proto.getMinimumBalanceForRentExemption = async () => Number(RENT);
  proto.getLatestBlockhash = async () => ({ blockhash: relayerKeypair.publicKey.toBase58(), lastValidBlockHeight: 1 });
  proto.simulateTransaction = async () => ({ context: { slot: 1 }, value: simulated ?? { err: null } });
  try { return await run(); } finally { Object.assign(proto, { getMinimumBalanceForRentExemption: real.rent, getLatestBlockhash: real.blockhash, simulateTransaction: real.simulate }); }
}

// ---- the operator's margin --------------------------------------------------

test("no configured margin means no margin, per chain", () => {
  delete process.env.POOL_RELAY_MIN_FEE_ANVIL;
  assert.equal(relayMargin(evmChain), 0n);
  process.env.POOL_RELAY_MIN_FEE_ANVIL = "";
  assert.equal(relayMargin(evmChain), 0n);

  // Each chain reads its own key, in that chain's base unit.
  process.env.POOL_RELAY_MIN_FEE_ANVIL = "20000000000000";
  process.env.POOL_RELAY_MIN_FEE_SOLANA_DEVNET = "7000";
  assert.equal(relayMargin(evmChain), 20_000_000_000_000n);
  assert.equal(relayMargin(solanaChain), 7_000n);
});

test("a margin that is not a whole number is refused rather than read as zero", () => {
  // Quietly reading any of these as zero would hand out free withdrawals.
  for (const raw of ["0.5", "abc", "-1", "1e9", "20_000", " 100", "0x10", "1 "]) {
    process.env.POOL_RELAY_MIN_FEE_ANVIL = raw;
    assert.throws(() => relayMargin(evmChain), (err: unknown) => {
      assert.ok(err instanceof RelayError, `${JSON.stringify(raw)} should raise a RelayError`);
      assert.equal(err.status, 503);
      return true;
    }, `${JSON.stringify(raw)} should be refused`);
  }
});

// ---- what each chain quotes -------------------------------------------------

test("the EVM quote is the gas the call needs plus the margin", async () => {
  const gasTerm = withQuoteHeadroom(EVM_TRANSACT_GAS * GAS_PRICE);

  process.env.POOL_RELAY_MIN_FEE_ANVIL = EVM_MARGIN.toString();
  const withMargin = await withRpc({ eth_gasPrice: () => hex(GAS_PRICE) }, () => quote(evmChain));
  assert.ok(withMargin.enabled);
  assert.equal(withMargin.relayer, relayerAddress);
  assert.equal(withMargin.fee, (gasTerm + EVM_MARGIN).toString());

  // The margin is on top of the gas term, not folded into it.
  process.env.POOL_RELAY_MIN_FEE_ANVIL = "0";
  const without = await withRpc({ eth_gasPrice: () => hex(GAS_PRICE) }, () => quote(evmChain));
  assert.ok(without.enabled);
  assert.equal(without.fee, gasTerm.toString());
  assert.equal(BigInt(withMargin.fee) - BigInt(without.fee), EVM_MARGIN);
});

test("the Solana quote is one signature, two nullifier accounts and the margin", async () => {
  const networkTerm = LAMPORTS_PER_SIGNATURE + SOLANA_NULLIFIER_ACCOUNTS * RENT;

  process.env.POOL_RELAY_MIN_FEE_SOLANA_DEVNET = SOLANA_MARGIN.toString();
  const withMargin = await withSolanaReads(() => quote(solanaChain));
  assert.ok(withMargin.enabled);
  assert.equal(withMargin.relayer, relayerKeypair.publicKey.toBase58());
  assert.equal(withMargin.fee, (networkTerm + SOLANA_MARGIN).toString());

  process.env.POOL_RELAY_MIN_FEE_SOLANA_DEVNET = "0";
  const without = await withSolanaReads(() => quote(solanaChain));
  assert.ok(without.enabled);
  assert.equal(without.fee, networkTerm.toString());
  assert.equal(BigInt(withMargin.fee) - BigInt(without.fee), SOLANA_MARGIN);
});

// ---- the check that the fee actually paid covers the quote ------------------

const evmWithdrawal = (fee: bigint) => evmRelayBody({
  proof: {
    a: [1n, 2n], b: [[3n, 4n], [5n, 6n]], c: [7n, 8n],
    root: 9n, inputNullifiers: [10n, 11n], outputCommitments: [12n, 13n],
  },
  ext: {
    recipient: OTHER, extAmount: -200n, relayer: relayerAddress, fee, token: evm.ETH,
    encryptedOutput1: "0x" as Hex, encryptedOutput2: "0x" as Hex,
  },
});

test("an EVM fee below the quote is refused, and the quote itself is accepted", async () => {
  process.env.POOL_RELAY_MIN_FEE_ANVIL = EVM_MARGIN.toString();
  // The pool call costs exactly what the quote assumes, so the check and the
  // quote must land on the same number; if either side drops the margin or
  // changes its gas figure alone, one of these two assertions fails.
  const rpc = {
    eth_gasPrice: () => hex(GAS_PRICE),
    eth_chainId: () => hex(31337n),
    eth_call: () => "0x",
    eth_estimateGas: () => hex(withQuoteHeadroom(EVM_TRANSACT_GAS)),
    eth_getTransactionCount: () => hex(0n),
    eth_maxPriorityFeePerGas: () => hex(1_000_000n),
    eth_getBlockByNumber: () => ({ number: hex(1n), baseFeePerGas: hex(GAS_PRICE), timestamp: hex(1n), gasLimit: hex(30_000_000n), gasUsed: "0x0", transactions: [] }),
    eth_sendRawTransaction: () => SENT_HASH,
  };

  await withRpc(rpc, async () => {
    const q = await quote(evmChain);
    assert.ok(q.enabled);
    const quoted = BigInt(q.fee);

    await assert.rejects(() => relay(evmChain, evmWithdrawal(quoted - 1n)), (err: unknown) => {
      assert.ok(err instanceof RelayError);
      assert.match(err.message, new RegExp(`at least ${quoted} wei`));
      return true;
    });

    assert.deepEqual(await relay(evmChain, evmWithdrawal(quoted)), { hash: SENT_HASH });
  });
});

const solanaWithdrawal = (fee: bigint) => solanaRelayBody(solana.transactIx(
  programId, relayerKeypair.publicKey,
  { a: [1n, 2n], b: [3n, 4n, 5n, 6n], c: [7n, 8n], root: 9n, nullifiers: [10n, 11n], commitments: [12n, 13n] },
  -200n, fee, new Uint8Array(96).fill(7), new Uint8Array(96).fill(9),
  { mint: solana.SOL_MINT, recipient: new PublicKey(new Uint8Array(32).fill(3)), relayer: relayerKeypair.publicKey },
));

test("a Solana fee below the quote is refused, and the quote itself gets through the check", async () => {
  process.env.POOL_RELAY_MIN_FEE_SOLANA_DEVNET = SOLANA_MARGIN.toString();
  await withSolanaReads(async () => {
    const q = await quote(solanaChain);
    assert.ok(q.enabled);
    const quoted = BigInt(q.fee);

    await assert.rejects(() => relay(solanaChain, solanaWithdrawal(quoted - 1n)), (err: unknown) => {
      assert.ok(err instanceof RelayError);
      assert.match(err.message, new RegExp(`at least ${quoted} lamports`));
      return true;
    });

    // At the quote the fee check passes: the pool's own refusal of this
    // made-up proof is what comes back, which is a later step than the fee.
    await assert.rejects(() => relay(solanaChain, solanaWithdrawal(quoted)), (err: unknown) => {
      assert.ok(err instanceof RelayError);
      assert.match(err.message, /The pool refused this transaction: InvalidProof\./);
      return true;
    });
  }, { err: { InstructionError: [1, { Custom: 12 }] } });
});
