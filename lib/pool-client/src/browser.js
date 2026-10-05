// Browser entry: proving runs in a Web Worker so the page stays responsive.
import { setProver } from "./prover.js";

export * from "./index.js";

export function installWorkerProver({ wasmUrl, zkeyUrl }) {
  const worker = new Worker(new URL("./prover.worker.js", import.meta.url), { type: "module" });
  const pending = new Map();
  let next = 0;
  worker.onmessage = (event) => {
    const { id, ok, error, proof, publicSignals } = event.data;
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    ok ? job.resolve({ proof, publicSignals }) : job.reject(new Error(error));
  };
  worker.onerror = (event) => {
    for (const job of pending.values()) job.reject(new Error(event.message || "prover worker failed"));
    pending.clear();
  };
  const call = (kind, input) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, kind, input, wasmUrl, zkeyUrl });
    });
  setProver((input) => call("prove", input));
  return {
    /** Downloads (or reads from cache) both proving keys ahead of the first proof. */
    warm: () => call("warm"),
    terminate: () => worker.terminate(),
  };
}
