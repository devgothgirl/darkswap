// Circuit tests: valid transactions make a witness; every attack below must
// fail to make one. These run on the compiled circuit, no proving keys needed.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import {
  inputNote, outputNote, publicKeyOf, stringify, FIELD, MerkleTree, LEVELS,
} from "./lib.mjs";
import { buildWorld, inputFor, ALICE, BOB, ASSET_X, ASSET_Y } from "./scenarios.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WASM = path.join(root, "build/transaction2_js/transaction2.wasm");

async function witness(input) {
  const wtns = { type: "mem" };
  await snarkjs.wtns.calculate(stringify(input), WASM, wtns);
  return wtns;
}
const accepts = (input) => assert.doesNotReject(witness(input));
const rejects = (input) => assert.rejects(witness(input));

const world = await buildWorld();
const [unshield, transfer, shield] = world.scenarios;

test("valid: unshield with fee, private transfer, shield", async () => {
  await accepts(inputFor(unshield));
  await accepts(inputFor(transfer));
  await accepts(inputFor(shield));
});

test("rejects: outputs worth more than inputs", async () => {
  const outputs = [
    outputNote({ amount: 401n, assetId: ASSET_X, publicKey: world.alicePk, blinding: 21n }),
    unshield.outputs[1],
  ];
  await rejects(inputFor({ ...unshield, outputs }));
});

test("rejects: withdrawing more than the proof allows (public amount changed)", async () => {
  const input = inputFor(unshield);
  input.publicAmount = (input.publicAmount - 1n + FIELD) % FIELD; // take 601 instead of 600
  await rejects(input);
});

test("rejects: a note that is not in the tree", async () => {
  const ghost = inputNote({ amount: 1000n, assetId: ASSET_X, privateKey: ALICE, blinding: 999n, pathIndex: 2 });
  const outputs = [
    outputNote({ amount: 700n, assetId: ASSET_X, publicKey: world.alicePk, blinding: 21n }),
    unshield.outputs[1],
  ];
  await rejects(inputFor({ ...unshield, inputs: [ghost, unshield.inputs[1]], outputs }));
});

test("rejects: spending someone else's note with your own key", async () => {
  // Bob tries to spend Alice's note a1. With Bob's key the commitment he can
  // open is a different leaf, so the Merkle check fails.
  const stolen = inputNote({ amount: 700n, assetId: ASSET_X, privateKey: BOB, blinding: 11n, pathIndex: 2 });
  await rejects(inputFor({ ...unshield, inputs: [stolen, unshield.inputs[1]] }));
});

test("rejects: the same note in both input slots", async () => {
  const { a1 } = world.notes;
  const outputs = [
    outputNote({ amount: 800n, assetId: ASSET_X, publicKey: world.alicePk, blinding: 21n }),
    unshield.outputs[1],
  ];
  await rejects(inputFor({ ...unshield, inputs: [a1, a1], outputs }));
});

test("rejects: a nullifier that does not belong to the note", async () => {
  const input = inputFor(unshield);
  input.inputNullifier = [input.inputNullifier[0] + 1n, input.inputNullifier[1]];
  await rejects(input);
});

test("rejects: claiming a note sits at another index (would mint a second nullifier)", async () => {
  // a1 is at index 2. Claiming index 3 changes the nullifier, but the Merkle
  // path no longer leads to the root.
  const moved = inputNote({ amount: 700n, assetId: ASSET_X, privateKey: ALICE, blinding: 11n, pathIndex: 3 });
  const input = inputFor({ ...unshield, inputs: [moved, unshield.inputs[1]] });
  input.inPathElements[0] = world.tree.path(2);
  await rejects(input);
});

test("rejects: a path index wider than the tree", async () => {
  // Index 2 + 2^26 walks the same path if the index were not range-checked.
  const wide = 2 + 2 ** LEVELS;
  const moved = inputNote({ amount: 700n, assetId: ASSET_X, privateKey: ALICE, blinding: 11n, pathIndex: wide });
  const input = inputFor(unshield); // honest path for index 2
  input.inPathIndex[0] = BigInt(wide);
  input.inputNullifier[0] = moved.nullifier; // the nullifier that index would give
  await rejects(input);
});

test("rejects: turning asset Y into asset X", async () => {
  // Alice's 1000 Y note sits at index 6. She re-labels it as X, with a
  // nullifier that matches the re-labelled note, and asks for X outputs.
  // The re-labelled commitment is not the leaf in the tree, so it fails.
  const a3 = inputNote({ amount: 1000n, assetId: ASSET_X, privateKey: ALICE, blinding: 13n, pathIndex: 6 });
  const outputs = [
    outputNote({ amount: 1000n, assetId: ASSET_X, publicKey: world.alicePk, blinding: 51n }),
    outputNote({ amount: 0n, assetId: ASSET_X, publicKey: world.alicePk, blinding: 52n }),
  ];
  const dummy = inputNote({ amount: 0n, assetId: ASSET_X, privateKey: ALICE, blinding: 53n, pathIndex: 0 });
  await rejects(inputFor({
    ...transfer, assetId: ASSET_X, publicAssetId: 0n, publicAmount: 0n, inputs: [a3, dummy], outputs,
  }));
});

test("rejects: unshielding Y while telling the pool it is X", async () => {
  const { a3 } = world.notes;
  const dummy = inputNote({ amount: 0n, assetId: ASSET_Y, privateKey: ALICE, blinding: 61n, pathIndex: 0 });
  const outputs = [
    outputNote({ amount: 0n, assetId: ASSET_Y, publicKey: world.alicePk, blinding: 62n }),
    outputNote({ amount: 0n, assetId: ASSET_Y, publicKey: world.alicePk, blinding: 63n }),
  ];
  const tx = { ...transfer, publicAmount: -1000n, inputs: [a3, dummy], outputs };
  await accepts(inputFor({ ...tx, publicAssetId: ASSET_Y })); // honest version works
  await rejects(inputFor({ ...tx, publicAssetId: ASSET_X })); // lying about the asset does not
});

test("rejects: an output amount of 2^248 or more (overflow attack)", async () => {
  // out0 = p - 1 would make the balance equation wrap: inputs + 0 == (p-1) + 1001.
  const huge = FIELD - 1n;
  const outputs = [
    outputNote({ amount: huge, assetId: ASSET_Y, publicKey: world.alicePk, blinding: 71n }),
    outputNote({ amount: 1001n, assetId: ASSET_Y, publicKey: world.alicePk, blinding: 72n }),
  ];
  await rejects(inputFor({ ...transfer, outputs }));
});

test("rejects: an output commitment that hides a different amount", async () => {
  const input = inputFor(transfer);
  const fat = outputNote({ amount: 250000n, assetId: ASSET_Y, publicKey: world.bobPk, blinding: 32n });
  input.outputCommitment = [fat.commitment, input.outputCommitment[1]];
  await rejects(input);
});

test("rejects: a real note against the wrong root", async () => {
  const other = new MerkleTree([...world.leaves, 123n]);
  const input = inputFor(unshield);
  input.root = other.root;
  await rejects(input);
});

test("zero-amount inputs need no tree membership (padding works)", async () => {
  const other = new MerkleTree([1n, 2n, 3n]);
  await accepts(inputFor({ ...shield, tree: other }));
});

test("buildInput pads a missing input with a fresh dummy each time", async () => {
  const one = { ...transfer, inputs: [world.notes.a3] };
  const first = inputFor(one);
  const second = inputFor(one);
  await accepts(first);
  await accepts(second);
  assert.notEqual(first.inputNullifier[1], second.inputNullifier[1], "dummy nullifiers must differ");
});

test("buildInput refuses asset ids outside the field and bad leaf indexes", () => {
  assert.throws(() => inputFor({ ...transfer, publicAssetId: FIELD }));
  assert.throws(() => inputFor({ ...transfer, assetId: FIELD + 1n }));
  assert.throws(() => world.tree.path(8));
});

test("public key is Poseidon(private key) and differs per key", () => {
  assert.notEqual(publicKeyOf(ALICE), publicKeyOf(BOB));
});
