// Moved to lib/pool-client (@darkswap/pool-client); Node entry point kept.
// Here the prover reads the dev keys straight from keys-dev/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setProverArtifacts } from "../../../lib/pool-client/src/prover.js";

export * from "../../../lib/pool-client/src/evm.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WASM = path.join(root, "keys-dev/transaction2.wasm");
export const ZKEY = path.join(root, "keys-dev/transaction2.zkey");
setProverArtifacts({ wasm: WASM, zkey: ZKEY });

export function loadDeployment(chainId) {
  return JSON.parse(fs.readFileSync(path.join(root, `deployments/${chainId}.json`), "utf8"));
}
