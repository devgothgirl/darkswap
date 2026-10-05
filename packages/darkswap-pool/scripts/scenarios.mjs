// The fixed test world used by every test in this repo: a small tree and
// three transactions that cover shield, private transfer and unshield.
// All keys and blindings here are public test values. Never reuse them.
import {
  initPoseidon, MerkleTree, inputNote, outputNote, publicKeyOf, buildInput, keccakField, poseidon,
} from "./lib.mjs";

export const ALICE = 0x0a11ce0000000000000000000000000000000000000000000000000000000001n;
export const BOB = 0x0b0b000000000000000000000000000000000000000000000000000000000002n;

// Asset ids are opaque field elements to the circuit. On EVM the pool will
// use the token address; on Solana a hash of the mint. These are stand-ins.
export const ASSET_X = 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48n; // a 160-bit address
export const ASSET_Y = keccakField("darkswap.test.assetY");

export async function buildWorld() {
  await initPoseidon();
  const alicePk = publicKeyOf(ALICE);
  const bobPk = publicKeyOf(BOB);
  const filler = (i) => poseidon([keccakField(`darkswap.test.filler.${i}`)]);

  // Eight leaves. Alice owns three notes; the rest belong to other people.
  const a1 = inputNote({ amount: 700n, assetId: ASSET_X, privateKey: ALICE, blinding: 11n, pathIndex: 2 });
  const a2 = inputNote({ amount: 300n, assetId: ASSET_X, privateKey: ALICE, blinding: 12n, pathIndex: 5 });
  const a3 = inputNote({ amount: 1000n, assetId: ASSET_Y, privateKey: ALICE, blinding: 13n, pathIndex: 6 });
  const leaves = [filler(0), filler(1), a1.commitment, filler(3), filler(4), a2.commitment, a3.commitment, filler(7)];
  const tree = new MerkleTree(leaves);

  const dummy = (assetId, blinding, pathIndex = 0) =>
    inputNote({ amount: 0n, assetId, privateKey: ALICE, blinding, pathIndex });

  // 1. Unshield: spend 700 + 300 of X, pay 590 out plus a 10 relayer fee, keep 400.
  const unshield = {
    name: "unshield",
    tree,
    assetId: ASSET_X,
    publicAssetId: ASSET_X,
    publicAmount: -600n,
    extDataHash: keccakField("darkswap.test.extdata.unshield"),
    inputs: [a1, a2],
    outputs: [
      outputNote({ amount: 400n, assetId: ASSET_X, publicKey: alicePk, blinding: 21n }),
      outputNote({ amount: 0n, assetId: ASSET_X, publicKey: alicePk, blinding: 22n }),
    ],
  };

  // 2. Private transfer: 250 of Y to Bob, 750 change. Nothing crosses the pool
  //    boundary, so the public asset id is 0 and the real asset stays hidden.
  const transfer = {
    name: "transfer",
    tree,
    assetId: ASSET_Y,
    publicAssetId: 0n,
    publicAmount: 0n,
    extDataHash: keccakField("darkswap.test.extdata.transfer"),
    inputs: [a3, dummy(ASSET_Y, 31n, 1)],
    outputs: [
      outputNote({ amount: 250n, assetId: ASSET_Y, publicKey: bobPk, blinding: 32n }),
      outputNote({ amount: 750n, assetId: ASSET_Y, publicKey: alicePk, blinding: 33n }),
    ],
  };

  // 3. Shield through the circuit: no real inputs, 5000 of X comes in.
  const shield = {
    name: "shield",
    tree,
    assetId: ASSET_X,
    publicAssetId: ASSET_X,
    publicAmount: 5000n,
    extDataHash: keccakField("darkswap.test.extdata.shield"),
    inputs: [dummy(ASSET_X, 41n, 0), dummy(ASSET_X, 42n, 1)],
    outputs: [
      outputNote({ amount: 5000n, assetId: ASSET_X, publicKey: alicePk, blinding: 43n }),
      outputNote({ amount: 0n, assetId: ASSET_X, publicKey: alicePk, blinding: 44n }),
    ],
  };

  return { tree, leaves, alicePk, bobPk, notes: { a1, a2, a3 }, scenarios: [unshield, transfer, shield] };
}

export const inputFor = (s) => buildInput(s);
