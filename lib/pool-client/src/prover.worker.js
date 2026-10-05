// Web Worker: fetches the proving keys once (kept in Cache Storage) and proves.
import * as snarkjs from "snarkjs";

const CACHE = "darkswap-pool-keys-v1";
const loaded = new Map();

async function bytes(url) {
  if (loaded.has(url)) return loaded.get(url);
  const job = (async () => {
    const cache = typeof caches !== "undefined" ? await caches.open(CACHE) : null;
    let res = cache ? await cache.match(url) : undefined;
    if (!res) {
      res = await fetch(url);
      if (!res.ok) throw new Error(`could not load proving key (${res.status})`);
      if (cache) await cache.put(url, res.clone());
    }
    return new Uint8Array(await res.arrayBuffer());
  })();
  loaded.set(url, job);
  job.catch(() => loaded.delete(url));
  return job;
}

self.onmessage = async (event) => {
  const { id, kind, input, wasmUrl, zkeyUrl } = event.data;
  try {
    const [wasm, zkey] = await Promise.all([bytes(wasmUrl), bytes(zkeyUrl)]);
    if (kind === "warm") return self.postMessage({ id, ok: true });
    const out = await snarkjs.groth16.fullProve(input, { type: "mem", data: wasm }, { type: "mem", data: zkey });
    self.postMessage({ id, ok: true, proof: out.proof, publicSignals: out.publicSignals });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message ?? String(err) });
  }
};
