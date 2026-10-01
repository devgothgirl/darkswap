import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { CheckMarketingWebhookHealthResponse, SubscribeUpdatesBody, SubscribeUpdatesResponse } from "@workspace/api-zod";
import { beginWebhookProcessing, finishWebhookProcessing, confirmOptIn, genericMessage, markWebhookProcessingFailure, marketingHealth, recordProviderEvent, recordWebhookReceipt, requestOptIn, unsubscribe, validToken, verifyWebhook } from "../lib/marketing";

const router: IRouter = Router();
const requests = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const MAX_BUCKETS = 5_000;

router.get("/marketing/health", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  try {
    const status = await marketingHealth();
    res.status(status === "healthy" ? 200 : 503).json(CheckMarketingWebhookHealthResponse.parse({ status }));
  } catch {
    req.log.error("Marketing webhook health check unavailable");
    res.status(503).json(CheckMarketingWebhookHealthResponse.parse({ status: "unavailable" }));
  }
});

function limited(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  for (const [key, bucket] of requests) {
    if (bucket.reset <= now) requests.delete(key);
  }
  // The IP is only used in this short-lived rate-limit bucket; it is never persisted.
  const key = req.ip ?? "unknown";
  const bucket = requests.get(key);
  if (bucket && bucket.count >= MAX_REQUESTS) {
    res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
    return;
  }
  if (!bucket && requests.size >= MAX_BUCKETS) {
    res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
    return;
  }
  requests.set(key, bucket
    ? { count: bucket.count + 1, reset: bucket.reset }
    : { count: 1, reset: now + WINDOW_MS });
  next();
}

router.post("/marketing/subscriptions", limited, async (req, res): Promise<void> => {
  // Only the two consent fields are accepted; never ingest order or wallet identifiers.
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)
    || Object.keys(req.body).some((key) => key !== "email" && key !== "consent")) {
    res.status(400).json({ error: "A valid email and explicit consent are required." });
    return;
  }
  const normalized = typeof req.body.email === "string"
    ? req.body.email.trim().toLowerCase()
    : req.body.email;
  const parsed = SubscribeUpdatesBody.safeParse({ email: normalized, consent: req.body.consent });
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email and explicit consent are required." });
    return;
  }

  try {
    await requestOptIn(parsed.data.email);
    res.status(200).json(SubscribeUpdatesResponse.parse({ message: genericMessage }));
  } catch {
    // Database errors can include the submitted email; never log the exception or request body.
    req.log.error("Marketing subscription intake unavailable");
    res.status(503).json({ error: "Subscription intake is unavailable. Please try again later." });
  }
});

// A GET never changes subscription state: link scanners must not confirm or unsubscribe.
function confirmationForm(action: string, token: unknown, label: string): string {
  const safe = validToken(token) ? token : "";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${label}</title><body><h1>${label}</h1><form method="post" action="${action}"><input type="hidden" name="token" value="${safe}"><button type="submit">${label}</button></form></body></html>`;
}

function privateTokenPage(res: Response): Response {
  return res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "X-Robots-Tag": "noindex, nofollow",
  });
}

router.get("/marketing/confirm", (req, res) => {
  privateTokenPage(res).type("html").send(confirmationForm("/api/marketing/confirm", req.query.token, "Confirm subscription"));
});
router.post("/marketing/confirm", async (req, res): Promise<void> => {
  if (!validToken(req.body?.token)) { res.status(400).json({ error: "Invalid confirmation link." }); return; }
  try {
    const confirmed = await confirmOptIn(req.body.token);
    privateTokenPage(res).status(confirmed ? 200 : 410).type("html")
      .send(confirmed ? "<p>Subscription confirmed.</p>" : "<p>This confirmation link has expired or was already used.</p>");
  } catch {
    req.log.error("Marketing confirmation unavailable");
    res.status(503).json({ error: "Confirmation unavailable." });
  }
});
router.get("/marketing/unsubscribe", (req, res) => {
  privateTokenPage(res).type("html").send(confirmationForm("/api/marketing/unsubscribe", req.query.token, "Unsubscribe"));
});
router.post("/marketing/unsubscribe", async (req, res): Promise<void> => {
  const token = validToken(req.body?.token) ? req.body.token : req.query.token;
  if (!validToken(token)) { res.status(400).json({ error: "Invalid unsubscribe link." }); return; }
  try {
    await unsubscribe(token);
    privateTokenPage(res).status(200)
      .send(req.get("List-Unsubscribe") === "One-Click" || req.body?.["List-Unsubscribe"] === "One-Click"
        ? "" : "<p>You have been unsubscribed.</p>");
  } catch {
    req.log.error("Marketing unsubscribe unavailable");
    res.status(503).json({ error: "Unsubscribe unavailable." });
  }
});

router.post("/marketing/webhook/resend", async (req, res): Promise<void> => {
  const secret = process.env.MARKETING_RESEND_WEBHOOK_SECRET;
  const raw = req.body;
  if (!secret || !Buffer.isBuffer(raw) || !verifyWebhook(raw, {
    id: req.get("svix-id"), timestamp: req.get("svix-timestamp"), signature: req.get("svix-signature"),
  }, secret)) {
    res.status(401).end();
    return;
  }
  try {
    // Commit before parsing or applying signed activity. Never process without
    // a durable fence; a crash or rejected failure-latch write leaves it intact.
    const attemptId = await beginWebhookProcessing(req.get("svix-id")!);
    if (attemptId === null) {
      // An active or unresolved attempt already owns this event. Do not apply
      // the replay or latch a new failure merely because callbacks overlap.
      // Returning 503 (not 204) preserves provider retry/reconciliation signals.
      res.status(503).end();
      return;
    }
    const payload: unknown = JSON.parse(raw.toString("utf8"));
    if (!payload || typeof payload !== "object" || !("type" in payload) || !("data" in payload)) {
      throw new Error("Malformed signed webhook");
    }
    if (payload.type === "email.sent" || payload.type === "email.delivered" ||
      payload.type === "email.bounced" || payload.type === "email.complained") {
      const data = payload.data;
      if (!data || typeof data !== "object" || !("email_id" in data) || typeof data.email_id !== "string") {
        throw new Error("Malformed signed webhook event");
      }
      if (payload.type === "email.bounced" || payload.type === "email.complained") {
        const recipient = "to" in data && Array.isArray(data.to) && data.to.length === 1 ? data.to[0] : undefined;
        await recordProviderEvent(req.get("svix-id")!, data.email_id, payload.type === "email.bounced" ? "bounce" : "complaint", recipient);
      }
      await recordWebhookReceipt(req.get("svix-id")!, data.email_id);
    }
    await finishWebhookProcessing(attemptId);
    res.status(204).end();
  } catch {
    // Never log provider payloads, headers, contacts or exception details.
    const persisted = await markWebhookProcessingFailure();
    req.log.error(persisted ? "Marketing webhook processing failed; campaigns paused" :
      "Marketing webhook processing failed and failure latch could not be saved; reconciliation required");
    res.status(503).end();
  }
});

export default router;