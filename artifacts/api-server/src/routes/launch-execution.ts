import { Router, type IRouter } from "express";
import { launchAdapter } from "../lib/launch/adapter";

const router: IRouter = Router();
// No parsing, auth, provider call, draft transition, or configuration flag can
// make this endpoint execute. Also blocks alternative pairs and admin callers.
router.all("/launch/submit", (_req, res) => {
  res.set("Cache-Control", "no-store").status(503).json({
    code: "EXECUTION_UNAVAILABLE",
    executionAvailable: false,
    error: launchAdapter.reason,
  });
});
export default router;