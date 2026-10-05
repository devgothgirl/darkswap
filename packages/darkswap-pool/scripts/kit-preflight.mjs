// Checks, before anything else loads, that the shared pool client's packages
// are installed. The helpers in this folder re-export lib/pool-client, whose
// imports (viem, circomlibjs, ...) resolve from lib/pool-client/node_modules,
// not from this package's node_modules. A root pnpm workspace install supplies
// both folders; this turns the resulting "Cannot find package" crash into a
// plain instruction. Imports only Node built-ins so it can run before the rest.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CLIENT = path.resolve(PKG, "..", "..", "lib", "pool-client");

export function ensureClientDeps() {
  const missing = [];
  if (!fs.existsSync(path.join(PKG, "node_modules", "viem"))) missing.push(["packages/darkswap-pool", "(cd ../.. && pnpm install --frozen-lockfile)"]);
  for (const dep of ["viem", "circomlibjs", "@solana/web3.js", "snarkjs"]) {
    if (!fs.existsSync(path.join(CLIENT, "node_modules", dep))) {
      missing.push(["lib/pool-client", "(cd ../.. && pnpm install --frozen-lockfile)"]);
      break;
    }
  }
  if (missing.length === 0) return;
  console.error("\n  FIX   packages are not installed yet. From packages/darkswap-pool run:");
  for (const [, cmd] of missing) console.error(`          ${cmd}`);
  console.error("        then run this command again.\n");
  process.exit(1);
}
