// EVM chain adapter: reads pool events, rebuilds the tree, computes
// extDataHash exactly as DarkPool.sol does, and sends shield / transact.
import { encodeAbiParameters, keccak256, parseAbi, getAddress, toHex, hexToBytes } from "viem";
import { FIELD, MerkleTree, LEVELS, zeroLeaf, buildInput, stringify } from "./lib.js";
import { prove } from "./prover.js";

export const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const poolAbi = parseAbi([
  "function shield(address token, uint256 amount, uint256 publicKey, uint256 blinding, bytes encryptedOutput) payable returns (uint256)",
  "function transact((uint256[2] a, uint256[2][2] b, uint256[2] c, uint256 root, uint256[2] inputNullifiers, uint256[2] outputCommitments) proof, (address recipient, int256 extAmount, address relayer, uint256 fee, address token, bytes encryptedOutput1, bytes encryptedOutput2) ext) payable",
  "function extDataHash((address recipient, int256 extAmount, address relayer, uint256 fee, address token, bytes encryptedOutput1, bytes encryptedOutput2) ext) view returns (uint256)",
  "function root() view returns (uint256)",
  "function nextIndex() view returns (uint256)",
  "function nullifierSpent(uint256) view returns (bool)",
  "function isKnownRoot(uint256) view returns (bool)",
  "function assets(address) view returns (bool listed, bool depositsEnabled, uint128 minDeposit, uint128 maxDeposit, uint128 depositCap, uint128 balance)",
  "function protocolFeeBps() view returns (uint16)",
  "function protocolFees(address) view returns (uint256)",
  "function feeRecipient() view returns (address)",
  "function feeOn(uint256) view returns (uint256)",
  "function collectFees(address)",
  "event ProtocolFeeCharged(uint8 kind, address token, uint256 amount)",
  "event ProtocolFeesCollected(address token, uint256 amount, address to)",
  "event NewCommitment(uint256 commitment, uint256 index, bytes encryptedOutput)",
  "event Shielded(uint256 index, address token, uint256 amount, uint256 publicKey, uint256 blinding)",
  "event NewNullifier(uint256 nullifier)",
  "event AssetListed(address token, uint128 minDeposit, uint128 maxDeposit, uint128 depositCap)",
  "event OutputsDiscarded(uint256 commitment0, uint256 commitment1)",
  "error UnknownRoot()", "error NullifierAlreadySpent()", "error InvalidProof()", "error DuplicateNullifier()",
  "error BadExtData()", "error AmountOutOfRange()", "error InsufficientPoolBalance()", "error DepositsAreOff()",
  "error AssetNotListed()", "error BadEthValue()", "error InputOutOfField()", "error OverDepositLimit()",
  "error OverDepositCap()", "error UnderDepositMinimum()", "error FeeTooHigh()", "error NothingToCollect()", "error Sanctioned()", "error EthTransferFailed()", "error BadTransferAmount()",
  "error LeafOutOfField()", "error TreeFull()",
]);

const extDataType = {
  type: "tuple",
  components: [
    { name: "recipient", type: "address" },
    { name: "extAmount", type: "int256" },
    { name: "relayer", type: "address" },
    { name: "fee", type: "uint256" },
    { name: "token", type: "address" },
    { name: "encryptedOutput1", type: "bytes" },
    { name: "encryptedOutput2", type: "bytes" },
  ],
};

/** keccak256(abi.encode(ext, chainid, pool)) mod p, as in DarkPool.extDataHash. */
export function extDataHash(ext, chainId, pool) {
  const encoded = encodeAbiParameters(
    [extDataType, { type: "uint256" }, { type: "address" }],
    [ext, BigInt(chainId), getAddress(pool)],
  );
  return BigInt(keccak256(encoded)) % FIELD;
}

export const assetIdOf = (token) => BigInt(getAddress(token));

/** Reads every commitment, nullifier and listed asset since deployBlock. */
export async function sync(client, pool, fromBlock = 0n) {
  const logs = await client.getContractEvents({ address: pool, abi: poolAbi, fromBlock: BigInt(fromBlock) });
  const commitments = [];
  const spent = new Set();
  const tokens = [];
  for (const log of logs) {
    if (log.eventName === "NewCommitment")
      commitments.push({ commitment: log.args.commitment, index: log.args.index, encryptedOutput: hexToBytes(log.args.encryptedOutput) });
    else if (log.eventName === "NewNullifier") spent.add(log.args.nullifier);
    else if (log.eventName === "AssetListed") tokens.push(getAddress(log.args.token));
  }
  const nextIndex = await client.readContract({ address: pool, abi: poolAbi, functionName: "nextIndex" });
  const leaves = new Array(Number(nextIndex)).fill(zeroLeaf());
  for (const c of commitments) leaves[Number(c.index)] = c.commitment;
  const tree = new MerkleTree(leaves, LEVELS);
  const onchainRoot = await client.readContract({ address: pool, abi: poolAbi, functionName: "root" });
  if (tree.root !== onchainRoot) throw new Error("local tree does not match the pool's root");
  return { tree, commitments, spent, tokens };
}

/** Proves a planned transaction and returns transact() arguments. */
export async function proveTransaction({ plan, tree, token, recipient, relayer, chainId, pool }) {
  const ext = {
    recipient: recipient ?? "0x0000000000000000000000000000000000000000",
    extAmount: plan.extAmount,
    relayer: relayer ?? "0x0000000000000000000000000000000000000000",
    fee: plan.fee,
    token: plan.extAmount === 0n && plan.fee === 0n ? "0x0000000000000000000000000000000000000000" : token,
    encryptedOutput1: toHex(plan.encryptedOutputs[0]),
    encryptedOutput2: toHex(plan.encryptedOutputs[1]),
  };
  const isTransfer = plan.extAmount === 0n && plan.fee === 0n;
  const input = buildInput({
    tree,
    inputs: plan.inputs,
    outputs: plan.outputs,
    assetId: assetIdOf(token),
    publicAmount: plan.extAmount - plan.fee,
    publicAssetId: isTransfer ? 0n : assetIdOf(token),
    extDataHash: extDataHash(ext, chainId, pool),
  });
  const started = Date.now();
  const { proof, publicSignals } = await prove(stringify(input));
  const proveMs = Date.now() - started;
  return {
    proveMs,
    proof: {
      a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
      b: [[BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])], [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]],
      c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
      root: BigInt(publicSignals[0]),
      inputNullifiers: [BigInt(publicSignals[4]), BigInt(publicSignals[5])],
      outputCommitments: [BigInt(publicSignals[6]), BigInt(publicSignals[7])],
    },
    ext,
  };
}
