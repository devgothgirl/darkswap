// Turns the API server's public pool record into what the wallet needs, and
// relay requests into JSON. The server is not trusted: callers must check
// `tree.root` against the chain (verifyRoot*) before proving.
import { hexToBytes } from "viem";
import { Buffer } from "buffer";
import { MerkleTree, LEVELS, zeroLeaf, stringify } from "./lib.js";

/** state: the JSON of GET /pool/:chain/state (full, not ?since). */
export function fromServerState(state) {
  const leaves = new Array(state.nextIndex).fill(zeroLeaf());
  const commitments = state.commitments.map((c) => {
    if (c.index >= state.nextIndex) throw new Error("pool record lists a leaf past the end of the tree");
    leaves[c.index] = BigInt(c.commitment);
    return { commitment: BigInt(c.commitment), index: c.index, encryptedOutput: hexToBytes(c.encryptedOutput), tx: c.tx };
  });
  return {
    tree: new MerkleTree(leaves, LEVELS),
    commitments: commitments.filter((c) => c.encryptedOutput.length),
    spent: new Set(state.spentNullifiers.map(BigInt)),
    nextIndex: state.nextIndex,
  };
}

/** Body for POST /pool/:chain/relay on EVM. */
export const evmRelayBody = ({ proof, ext }) => stringify({ proof, ext });

/** Body for POST /pool/:chain/relay on Solana: the exact instruction. */
export const solanaRelayBody = (ix) => ({
  data: Buffer.from(ix.data).toString("base64"),
  accounts: ix.keys.map((k) => k.pubkey.toBase58()),
});
