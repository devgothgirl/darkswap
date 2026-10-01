import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { ZodError } from "zod";
import { GetLaunchAdminAuditQueryParams } from "@workspace/api-zod";
import { createChallenge, verifyChallenge, findLaunchSession, requireLaunchSession, sessionResponse, logout } from "../lib/launch/auth";
import { privateHeaders, rateLimit, LaunchError, invalid, exactKeys } from "../lib/launch/store";
import { loadLaunchConfig, loadLaunchReviews, resolveLaunchConfigAvailability } from "../lib/launch/config";
import { updateConfig, createReview, loadAudit } from "../lib/launch/admin";
import { listDrafts, getOwnedDraft, saveDraft, deleteDraft, creatorDashboard } from "../lib/launch/drafts";
import { requestLogo, completeLogo, getLogo } from "../lib/launch/logos";
import { launchDetectorStatus } from "../lib/launch/review";
import { getDiscoveryPairs } from "./stonkfun";
import { DiscoveryError } from "../lib/stonkfun";

const router: IRouter = Router();
type Handler = (req: Request, res: Response) => Promise<void>;
const route = (handler: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve().then(() => { rateLimit(`launch-private:${req.ip}`, 180); return handler(req,res); }).catch(next);
};
const noQuery = (req: Request) => exactKeys(req.query, [], false);
const id = (req: Request) => {
  const value = req.params.id;
  if (typeof value !== "string" || value.length < 1 || value.length > 128) invalid("Invalid private resource identifier.");
  return value;
};
const noBody = (req: Request) => {
  if (req.body !== undefined && (req.body === null || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length)) invalid("This operation does not accept a request body.");
};
async function currentConfig() {
  const config = await loadLaunchConfig();
  if (!config.darkPairingEnabled || !config.darkTokenAddress || config.paused) return config;
  return resolveLaunchConfigAvailability(config, await getDiscoveryPairs(config, await loadLaunchReviews()));
}
router.get("/launch/config", route(async (req,res) => {
  res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  noQuery(req); res.json(await currentConfig());
}));
// Scoped paths: this middleware must not intercept /launch/submit's always-503 boundary.
for (const path of ["/launch/auth", "/launch/drafts", "/launch/logos", "/launch/creator", "/launch/admin"]) router.use(path, privateHeaders);
router.post("/launch/auth/challenge", route(async (req,res) => { noQuery(req); res.json(await createChallenge(req,res)); }));
router.post("/launch/auth/verify", route(async (req,res) => { noQuery(req); res.json(await verifyChallenge(req,res)); }));
router.get("/launch/auth/session", route(async (req,res) => { noQuery(req); res.json(sessionResponse(await findLaunchSession(req))); }));
router.post("/launch/auth/logout", route(async (req,res) => {
  noQuery(req); noBody(req); const session = await requireLaunchSession(req,res,{ csrf: true }); await logout(req,res,session); res.status(204).end();
}));
router.get("/launch/drafts", route(async (req,res) => { noQuery(req); const s = await requireLaunchSession(req,res); res.json({ drafts: await listDrafts(s.wallet) }); }));
router.post("/launch/drafts", route(async (req,res) => { noQuery(req); const s = await requireLaunchSession(req,res,{ csrf: true }); res.status(201).json(await saveDraft(s.wallet,req.body)); }));
router.get("/launch/drafts/:id", route(async (req,res) => { noQuery(req); const s = await requireLaunchSession(req,res); res.json(await getOwnedDraft(s.wallet,id(req))); }));
router.put("/launch/drafts/:id", route(async (req,res) => { noQuery(req); const s = await requireLaunchSession(req,res,{ csrf: true }); res.json(await saveDraft(s.wallet,req.body,id(req),req.get("If-Unmodified-Since"))); }));
router.delete("/launch/drafts/:id", route(async (req,res) => { noQuery(req); noBody(req); const s = await requireLaunchSession(req,res,{ csrf: true }); await deleteDraft(s.wallet,id(req)); res.status(204).end(); }));
router.post("/launch/logos/request-url", route(async (req,res) => { noQuery(req); const s = await requireLaunchSession(req,res,{ csrf: true }); res.status(201).json(await requestLogo(s.wallet,req.body)); }));
router.post("/launch/logos/:id/complete", route(async (req,res) => { noQuery(req); noBody(req); const s = await requireLaunchSession(req,res,{ csrf: true }); res.json(await completeLogo(s.wallet,id(req))); }));
router.get("/launch/logos/:id", route(async (req,res) => { noQuery(req); const s = await requireLaunchSession(req,res); const image = await getLogo(s.wallet,id(req)); res.type(image.contentType).set("Content-Disposition", "inline").send(image.bytes); }));
router.get("/launch/creator", route(async (req,res) => { noQuery(req); const s = await requireLaunchSession(req,res); res.json(await creatorDashboard(s.wallet)); }));
router.get("/launch/admin/config", route(async (req,res) => { noQuery(req); await requireLaunchSession(req,res,{ admin: true }); res.json(await currentConfig()); }));
router.put("/launch/admin/config", route(async (req,res) => { noQuery(req); const s = await requireLaunchSession(req,res,{ admin: true, csrf: true }); res.json(await updateConfig(s.wallet,req.body)); }));
router.get("/launch/admin/reviews", route(async (req,res) => {
  noQuery(req); await requireLaunchSession(req,res,{ admin: true });
  const detectors = launchDetectorStatus.filter(item => ["self_referral", "circular_activity", "transaction_spam", "suspected_wallet_cluster"].includes(item.name))
    .map(item => ({ ...item, name: item.name === "suspected_wallet_cluster" ? "wallet_cluster" : item.name }));
  res.json({ reviews: await loadLaunchReviews(), detectors });
}));
router.post("/launch/admin/reviews", route(async (req,res) => { noQuery(req); const s = await requireLaunchSession(req,res,{ admin: true, csrf: true }); res.status(201).json(await createReview(s.wallet,req.body)); }));
router.get("/launch/admin/audit", route(async (req,res) => {
  await requireLaunchSession(req,res,{ admin: true });
  const query = GetLaunchAdminAuditQueryParams.strict().parse(req.query); res.json({ records: await loadAudit(query.limit ?? 50) });
}));
router.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith("/launch/")) { next(error); return; }
  if (error instanceof ZodError) { res.status(400).json({ error: "Invalid launch input. Check required fields, types and allowed values.", code: "INVALID_INPUT", executionAvailable: false }); return; }
  if (error instanceof DiscoveryError) {
    if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
    res.status(error.status).json({ error: error.message, code: error.code, executionAvailable: false }); return;
  }
  if (error instanceof LaunchError) {
    if (error.status === 429) res.set("Retry-After", "60");
    res.status(error.status).json({ error: error.message, code: error.code, executionAvailable: false }); return;
  }
  // Never log request bodies, wallet proofs, presigned URLs or private identifiers.
  req.log?.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Private launch operation failed");
  res.status(503).json({ error: "Launch persistence or storage is temporarily unavailable. Your request was not confirmed.", code: "SERVICE_UNAVAILABLE", executionAvailable: false });
});
export default router;