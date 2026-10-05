// Shielded pool chains (TESTNET). EVM addresses come from the deployment files
// that Deploy.s.sol writes; the Solana program id comes from the environment.
import fs from "node:fs";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";

export type EvmDeployment = {
  chainId: number;
  pool: `0x${string}`;
  verifier: `0x${string}`;
  token?: `0x${string}`;
  owner: `0x${string}`;
  feeRecipient: `0x${string}`;
  protocolFeeBps: number;
  deployBlock: number;
};

type ChainBase = { id: string; label: string; envKey: string; explorer: string };
export type EvmChain = ChainBase & { kind: "evm"; chainId: number; nativeSymbol: string };
export type SolanaChain = ChainBase & { kind: "solana"; cluster: string; nativeSymbol: string };
export type PoolChain = EvmChain | SolanaChain;

const CHAINS: PoolChain[] = [
  { id: "sepolia", label: "Sepolia", kind: "evm", chainId: 11155111, envKey: "SEPOLIA", nativeSymbol: "ETH", explorer: "https://sepolia.etherscan.io" },
  { id: "base-sepolia", label: "Base Sepolia", kind: "evm", chainId: 84532, envKey: "BASE_SEPOLIA", nativeSymbol: "ETH", explorer: "https://sepolia.basescan.org" },
  { id: "solana-devnet", label: "Solana devnet", kind: "solana", cluster: "devnet", envKey: "SOLANA_DEVNET", nativeSymbol: "SOL", explorer: "https://explorer.solana.com" },
];

// A local anvil chain, for development only. Never offered in production.
const LOCAL: EvmChain = { id: "anvil", label: "Local anvil", kind: "evm", chainId: 31337, envKey: "ANVIL", nativeSymbol: "ETH", explorer: "" };

export function poolChains(): PoolChain[] {
  const local = process.env.NODE_ENV !== "production" && process.env.RPC_URL_ANVIL ? [LOCAL] : [];
  return [...CHAINS, ...local];
}

export function findChain(id: string): PoolChain | undefined {
  return poolChains().find((c) => c.id === id);
}

// Development runs from artifacts/api-server; the published server runs from
// the workspace root. Look in both places.
export function deploymentsDir(): string {
  if (process.env.POOL_DEPLOYMENTS_DIR) return process.env.POOL_DEPLOYMENTS_DIR;
  const candidates = [
    path.resolve(process.cwd(), "packages/darkswap-pool/deployments"),
    path.resolve(process.cwd(), "../../packages/darkswap-pool/deployments"),
  ];
  return candidates.find((dir) => fs.existsSync(dir)) ?? candidates[0];
}

export function evmDeployment(chain: EvmChain): EvmDeployment | null {
  const file = path.join(deploymentsDir(), `${chain.chainId}.json`);
  if (!fs.existsSync(file)) return null;
  const dep = JSON.parse(fs.readFileSync(file, "utf8")) as EvmDeployment;
  if (Number(dep.chainId) !== chain.chainId) throw new Error(`${file} is for chain ${dep.chainId}`);
  return dep;
}

export function solanaProgramId(chain: SolanaChain): PublicKey | null {
  const raw = process.env[`POOL_PROGRAM_ID_${chain.cluster.toUpperCase()}`];
  return raw ? new PublicKey(raw) : null;
}

export function rpcUrl(chain: PoolChain): string | null {
  const configured = process.env[`RPC_URL_${chain.envKey}`];
  if (configured) return configured;
  // Solana devnet has a public cluster endpoint; EVM testnets need a configured RPC.
  if (chain.kind === "solana") return "https://api.devnet.solana.com";
  return null;
}

// Browsers check the indexer's root against the chain through a public RPC, so
// the check works without a connected wallet. These see a root read, nothing else.
const PUBLIC_RPC: Record<string, string> = {
  sepolia: "https://ethereum-sepolia-rpc.publicnode.com",
  "base-sepolia": "https://sepolia.base.org",
  "solana-devnet": "https://api.devnet.solana.com",
  anvil: "http://127.0.0.1:8545",
};
export function publicRpcUrl(chain: PoolChain): string {
  return process.env[`POOL_PUBLIC_RPC_${chain.envKey}`] || PUBLIC_RPC[chain.id];
}

/** Why a chain is not live yet, or null when it is configured. */
export function chainUnavailableReason(chain: PoolChain): string | null {
  if (chain.kind === "evm") {
    if (!evmDeployment(chain)) return "Not deployed yet.";
  } else if (!solanaProgramId(chain)) return "Not deployed yet.";
  if (!rpcUrl(chain)) return "No RPC configured.";
  return null;
}
