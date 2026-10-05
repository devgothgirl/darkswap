// Groth16 proving. Node points it at keys-dev files; the browser installs a
// Web Worker prover (see ./browser.js) so the page never blocks while proving.
let artifacts = null;
let custom = null;

/** wasm/zkey: file paths (Node), URLs, or { type: "mem", data: Uint8Array }. */
export function setProverArtifacts({ wasm, zkey }) {
  artifacts = { wasm, zkey };
}

/** fn(input) -> Promise<{ proof, publicSignals }> replaces the built-in prover. */
export function setProver(fn) {
  custom = fn;
}

export async function prove(input) {
  if (custom) return custom(input);
  if (!artifacts) throw new Error("proving keys are not configured: call setProverArtifacts() or setProver() first");
  const snarkjs = await import("snarkjs");
  return snarkjs.groth16.fullProve(input, artifacts.wasm, artifacts.zkey);
}
