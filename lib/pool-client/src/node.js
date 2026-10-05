// Node entry: dev proving keys from packages/darkswap-pool/keys-dev and
// deployments/<chainId>.json from the same package.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setProverArtifacts } from "./prover.js";

export * from "./index.js";

export const POOL_PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/darkswap-pool");
export const DEV_WASM = path.join(POOL_PACKAGE_DIR, "keys-dev/transaction2.wasm");
export const DEV_ZKEY = path.join(POOL_PACKAGE_DIR, "keys-dev/transaction2.zkey");

export function useDevProvingKeys(wasm = DEV_WASM, zkey = DEV_ZKEY) {
  setProverArtifacts({ wasm, zkey });
}

export function loadDeployment(chainId, dir = path.join(POOL_PACKAGE_DIR, "deployments")) {
  return JSON.parse(fs.readFileSync(path.join(dir, `${chainId}.json`), "utf8"));
}
