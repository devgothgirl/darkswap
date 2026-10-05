// Shared helpers: field, Poseidon, notes, Merkle tree, circuit inputs.
// Runs in browsers and Node (moved here from packages/darkswap-pool/scripts).
import { buildPoseidon } from "circomlibjs";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Buffer } from "buffer";
import { randomBytes } from "./random.js";

export const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const LEVELS = 26;

let _poseidon;
export async function initPoseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}

/** Poseidon over BN254 (circomlib parameters), 1 to 4 inputs here. */
export function poseidon(inputs) {
  if (!_poseidon) throw new Error("call initPoseidon() first");
  return _poseidon.F.toObject(_poseidon(inputs.map((x) => BigInt(x))));
}

export const mod = (x) => ((BigInt(x) % FIELD) + FIELD) % FIELD;

export function keccakField(text) {
  const digest = keccak_256(new TextEncoder().encode(text));
  return mod(BigInt("0x" + Buffer.from(digest).toString("hex")));
}

/** The value of an empty leaf. No note commitment is known to hash to it. */
export const zeroLeaf = () => keccakField("darkswap.zero");

/** zeros[i] is the root of an empty subtree of height i. */
export function zeroHashes(levels = LEVELS) {
  const zeros = [zeroLeaf()];
  for (let i = 1; i <= levels; i++) zeros.push(poseidon([zeros[i - 1], zeros[i - 1]]));
  return zeros;
}

/** Sparse full-tree build. Independent of the incremental algorithm on-chain. */
export class MerkleTree {
  constructor(leaves = [], levels = LEVELS) {
    this.levels = levels;
    this.zeros = zeroHashes(levels);
    this.layers = [leaves.map(BigInt)];
    this.rebuild();
  }
  rebuild() {
    for (let level = 0; level < this.levels; level++) {
      const below = this.layers[level];
      const above = [];
      for (let i = 0; i < below.length; i += 2) {
        const left = below[i];
        const right = i + 1 < below.length ? below[i + 1] : this.zeros[level];
        above.push(poseidon([left, right]));
      }
      this.layers[level + 1] = above;
    }
  }
  insert(leaf) {
    this.layers[0].push(BigInt(leaf));
    this.rebuild();
  }
  get root() {
    const top = this.layers[this.levels];
    return top.length ? top[0] : this.zeros[this.levels];
  }
  path(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.layers[0].length)
      throw new Error(`no leaf at index ${index}`);
    const pathElements = [];
    let i = index;
    for (let level = 0; level < this.levels; level++) {
      const sibling = i ^ 1;
      const layer = this.layers[level];
      pathElements.push(sibling < layer.length ? layer[sibling] : this.zeros[level]);
      i >>= 1;
    }
    return pathElements;
  }
}

// ---- keys and notes -------------------------------------------------------

export const publicKeyOf = (privateKey) => poseidon([privateKey]);

export function commitmentOf({ amount, assetId, publicKey, blinding }) {
  return poseidon([amount, assetId, publicKey, blinding]);
}

export function nullifierOf({ commitment, pathIndex, privateKey }) {
  const signature = poseidon([privateKey, commitment, pathIndex]);
  return poseidon([commitment, pathIndex, signature]);
}

/** A note the prover can spend: it knows the private key and tree position. */
export function inputNote({ amount, assetId, privateKey, blinding, pathIndex = 0 }) {
  const publicKey = publicKeyOf(privateKey);
  const commitment = commitmentOf({ amount, assetId, publicKey, blinding });
  return { amount: BigInt(amount), assetId: BigInt(assetId), privateKey: BigInt(privateKey),
    publicKey, blinding: BigInt(blinding), pathIndex, commitment,
    nullifier: nullifierOf({ commitment, pathIndex, privateKey }) };
}

export function outputNote({ amount, assetId, publicKey, blinding }) {
  return { amount: BigInt(amount), assetId: BigInt(assetId), publicKey: BigInt(publicKey),
    blinding: BigInt(blinding), commitment: commitmentOf({ amount, assetId, publicKey, blinding }) };
}

/** A uniformly random field element (rejection-sampled from 32 random bytes). */
export function randomField() {
  for (;;) {
    const x = BigInt("0x" + randomBytes(32).toString("hex")) >> 2n; // 254 bits
    if (x < FIELD) return x;
  }
}

/**
 * A zero-amount input used to pad a transaction with fewer than two real
 * notes. Its key and blinding are fresh random values, so its nullifier is
 * new every time. Never reuse a dummy: its nullifier is spent after one use.
 */
export function dummyInput(assetId) {
  return inputNote({ amount: 0n, assetId, privateKey: randomField(), blinding: randomField(), pathIndex: 0 });
}

const inField = (name, x) => {
  if (BigInt(x) < 0n || BigInt(x) >= FIELD) throw new Error(`${name} is not a field element`);
  return BigInt(x);
};

/**
 * Builds the circuit input for one transaction. Pass one or two inputs; a
 * missing input is padded with a fresh dummy.
 * `publicAmount` is signed here (+ shield, - unshield incl. fee) and is
 * reduced into the field, exactly as the pool will do on-chain.
 */
export function buildInput({ tree, inputs, outputs, assetId, publicAmount, publicAssetId, extDataHash }) {
  if (inputs.length > 2 || outputs.length !== 2) throw new Error("need at most 2 inputs and exactly 2 outputs");
  inField("assetId", assetId);
  inField("publicAssetId", publicAssetId);
  inputs = [...inputs];
  while (inputs.length < 2) inputs.push(dummyInput(assetId));
  const zeroPath = new Array(tree.levels).fill(0n);
  return {
    root: tree.root,
    publicAmount: mod(publicAmount),
    extDataHash: mod(extDataHash),
    publicAssetId: BigInt(publicAssetId),
    inputNullifier: inputs.map((n) => n.nullifier),
    outputCommitment: outputs.map((n) => n.commitment),
    assetId: BigInt(assetId),
    inAmount: inputs.map((n) => n.amount),
    inPrivateKey: inputs.map((n) => n.privateKey),
    inBlinding: inputs.map((n) => n.blinding),
    inPathIndex: inputs.map((n) => BigInt(n.pathIndex)),
    inPathElements: inputs.map((n) => (n.amount > 0n ? tree.path(n.pathIndex) : zeroPath)),
    outAmount: outputs.map((n) => n.amount),
    outPublicKey: outputs.map((n) => n.publicKey),
    outBlinding: outputs.map((n) => n.blinding),
  };
}

export const PUBLIC_SIGNAL_NAMES = [
  "root", "publicAmount", "extDataHash", "publicAssetId",
  "inputNullifier[0]", "inputNullifier[1]", "outputCommitment[0]", "outputCommitment[1]",
];

export const hex32 = (x) => "0x" + BigInt(x).toString(16).padStart(64, "0");

/** Converts any object of bigints into the decimal strings snarkjs expects. */
export function stringify(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stringify);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stringify(v)]));
  return value;
}
