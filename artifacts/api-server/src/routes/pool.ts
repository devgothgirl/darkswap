// Shielded pools (TESTNET): public state for browsers to verify, and a relayer.
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { chainUnavailableReason, evmDeployment, findChain, poolChains, publicRpcUrl, solanaProgramId } from "../lib/pool/config";
import { ensureFresh, readState } from "../lib/pool/indexer";
import { quote, relay, RelayError, safeError } from "../lib/pool/relayer";

const router: IRouter = Router();

router.use("/pool", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/pool/chains", (_req, res) => {
  res.json({
    testnet: true,
    chains: poolChains().map((chain) => {
      const reason = chainUnavailableReason(chain);
      const base = { id: chain.id, label: chain.label, kind: chain.kind, nativeSymbol: chain.nativeSymbol, explorer: chain.explorer, publicRpc: publicRpcUrl(chain), live: reason === null, reason };
      if (chain.kind === "evm") {
        const dep = evmDeployment(chain);
        return { ...base, chainId: chain.chainId, pool: dep?.pool ?? null };
      }
      return { ...base, cluster: chain.cluster, programId: solanaProgramId(chain)?.toBase58() ?? null };
    }),
  });
});

router.get("/pool/:chain/state", async (req, res) => {
  const chain = findChain(req.params.chain);
  if (!chain) return void res.status(404).json({ error: "Unknown chain." });
  const reason = chainUnavailableReason(chain);
  if (reason) return void res.status(503).json({ error: reason });
  const since = Number(req.query.since ?? 0);
  if (!Number.isInteger(since) || since < 0) return void res.status(400).json({ error: "Bad since." });
  try {
    await ensureFresh(chain);
  } catch (err) {
    logger.error({ chain: chain.id, err: safeError(err) }, "pool sync failed");
    return void res.status(502).json({ error: "Could not read the pool from the chain. Try again shortly." });
  }
  res.json({ chain: chain.id, testnet: true, ...(await readState(chain, since)) });
});

router.get("/pool/:chain/relay", async (req, res) => {
  const chain = findChain(req.params.chain);
  if (!chain) return void res.status(404).json({ error: "Unknown chain." });
  try {
    res.json(await quote(chain));
  } catch (err) {
    if (err instanceof RelayError) return void res.status(err.status).json({ error: err.message });
    logger.error({ chain: chain.id, err: safeError(err) }, "pool quote failed");
    res.status(502).json({ error: "Could not reach the network to quote a relayer fee." });
  }
});

router.post("/pool/:chain/relay", async (req, res) => {
  const chain = findChain(req.params.chain);
  if (!chain) return void res.status(404).json({ error: "Unknown chain." });
  try {
    res.json(await relay(chain, req.body));
  } catch (err) {
    const status = err instanceof RelayError ? err.status : 500;
    res.status(status).json({ error: err instanceof RelayError ? err.message : "Relayer error." });
  }
});

export default router;
