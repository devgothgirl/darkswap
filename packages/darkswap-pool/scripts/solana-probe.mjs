// Sends the phase-1 fixtures to the probe program on a local validator and
// reports the result and the compute units each call used.
//   1. solana-test-validator --bpf-program <probe id> solana/pool-probe/target/deploy/darkswap_pool_probe.so
//   2. node scripts/solana-probe.mjs <probe id>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const hashes = JSON.parse(fs.readFileSync(path.join(root, "fixtures/hashes.json"), "utf8"));
const { proofs } = JSON.parse(fs.readFileSync(path.join(root, "fixtures/proofs.json"), "utf8"));

const programId = new PublicKey(process.argv[2]);
const connection = new Connection(process.env.RPC_URL ?? "http://127.0.0.1:8899", "confirmed");
const payer = Keypair.generate();
const bytes = (h) => Buffer.from(h.slice(2), "hex");

async function simulate(data) {
  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }))
    .add(new TransactionInstruction({ programId, keys: [], data }));
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(payer);
  const { value } = await connection.simulateTransaction(tx);
  const returned = value.returnData?.data?.[0]
    ? "0x" + Buffer.from(value.returnData.data[0], "base64").toString("hex") : null;
  return { err: value.err, units: value.unitsConsumed, logs: value.logs ?? [], returned, size: tx.serialize().length };
}

const sig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
await connection.confirmTransaction(sig, "confirmed");

const results = [];
let failed = false;
const check = (name, ok, extra) => { results.push({ name, ok, ...extra }); if (!ok) failed = true; };

// Poseidon syscall against every vector
let poseidonUnits = {};
for (const v of hashes.poseidon) {
  const r = await simulate(Buffer.concat([Buffer.from([1]), ...v.inputs.map(bytes)]));
  const ok = !r.err && r.returned === v.out;
  poseidonUnits[v.inputs.length] = r.units;
  if (!ok) check(`poseidon arity ${v.inputs.length}`, false, { returned: r.returned, expected: v.out, err: r.err });
}
check("poseidon syscall matches all 16 vectors", !failed, { unitsByArity: poseidonUnits });

// 26 tree hashes
{
  const r = await simulate(Buffer.from([2]));
  check("empty-tree root from 26 hashes on-chain", !r.err && r.returned === hashes.emptyRoot, { units: r.units });
}

// proofs
for (const p of proofs) {
  const data = Buffer.concat([Buffer.from([0]), ...p.a.map(bytes), ...p.b.map(bytes), ...p.c.map(bytes), ...p.publicSignals.map(bytes)]);
  const r = await simulate(data);
  check(`proof accepted: ${p.name}`, !r.err && r.logs.some((l) => l.includes("proof accepted")), { units: r.units, txBytes: r.size, err: r.err });

  const bad = Buffer.from(data);
  bad[1 + 256 + 32 + 31] ^= 1; // flip one bit of publicAmount
  const r2 = await simulate(bad);
  check(`changed public amount rejected: ${p.name}`, !!r2.err && r2.logs.some((l) => l.includes("proof rejected")), { units: r2.units });
}

console.log(JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(root, "fixtures/solana-probe-result.json"), JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
