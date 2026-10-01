import { randomUUID } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { CreateSupportRequestBody, CreateSupportRequestResponse, GetSupportRequestStatusQueryParams, GetSupportRequestStatusResponse } from "@workspace/api-zod";
import { postSupportToDiscord } from "../lib/support-discord";
import { createCase, getCaseStatus, recordSupportEvent, statusMessage, updateCase } from "../lib/support-delivery";
import { verifyWebhook } from "../lib/marketing";

const router: IRouter = Router();
const buckets = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_REQUESTS = 3;
const DESTINATION = "support@darkswap.app";

function limit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  for (const [key, value] of buckets) if (value.reset <= now) buckets.delete(key);
  const key = req.ip ?? "unknown";
  const bucket = buckets.get(key);
  if (bucket?.count === MAX_REQUESTS || (!bucket && buckets.size >= 5000)) {
    res.status(429).json({ error: "Too many reports. Please try again later or email support@darkswap.app." });
    return;
  }
  buckets.set(key, bucket ? { count: bucket.count + 1, reset: bucket.reset } : { count: 1, reset: now + WINDOW_MS });
  next();
}

router.post("/support/requests", limit, async (req, res): Promise<void> => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "Please complete the report form." });
    return;
  }
  const parsed = CreateSupportRequestBody.strict().safeParse(req.body);
  if (!parsed.success || !parsed.data.email.trim() || !parsed.data.message.trim()) {
    res.status(400).json({ error: "Please provide a valid email and at least 20 characters describing the issue." });
    return;
  }
  const { email, issue, route, orderReference, transactionHash, message, website } = parsed.data;
  if (website) {
    res.json(CreateSupportRequestResponse.parse({ message: "Your report was received.", status: "pending", token: randomUUID() + randomUUID() }));
    return;
  }
  if (/\b(seed phrase|recovery phrase|private key|secret key|mnemonic phrase)\b/i.test(
    [message, orderReference, transactionHash].filter(Boolean).join(" "),
  )) {
    res.status(400).json({ error: "Do not include wallet secrets. Remove any seed phrase or private key from your report." });
    return;
  }
  const from = process.env.MARKETING_FROM_EMAIL;
  const discordWebhook = process.env.DISCORD_SUPPORT_WEBHOOK_URL;
  const canEmail = !!from && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from);
  const reportId = randomUUID();
  const text = [
    `New DarkSwap support report ${reportId}`,
    `Issue: ${issue}`, `Route: ${route ?? "unsure"}`,
    `Reply to: ${email.trim()}`,
    `Order reference: ${orderReference?.trim() || "Not provided"}`,
    `Sending transaction hash: ${transactionHash?.trim() || "Not provided"}`,
    "", "Customer message:", message.trim(),
    "", "Treat this as a user report, not a verified transaction status. Never request wallet secrets.",
  ].join("\n");
  let supportCase: Awaited<ReturnType<typeof createCase>>;
  try {
    supportCase = await createCase(email.trim(), text, reportId);
  } catch {
    req.log.error("Support case persistence unavailable");
    res.status(503).json({ error: "We could not save your report. Please try again later." });
    return;
  }

  const emailDelivery = async (): Promise<{ status: "pending" | "failed" | "unconfirmed"; providerId?: string }> => {
    if (!canEmail) return { status: "failed" };
    try {
      const response = await new ReplitConnectors().proxy("resend", "/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": supportCase.id },
        body: JSON.stringify({
          from, to: DESTINATION, reply_to: email.trim(),
          subject: `DarkSwap support report: ${issue.replaceAll("_", " ")}`,
          text,
        }),
      });
      if (!response.ok) return { status: "failed" };
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string")
        return { status: "unconfirmed" };
      return { status: "pending", providerId: result.id };
    } catch {
      // A timeout can occur after provider acceptance. Never retry blindly or log provider errors.
      return { status: "unconfirmed" };
    }
  };
  const [emailResult, discordAccepted] = await Promise.all([
    emailDelivery(),
    discordWebhook
      ? postSupportToDiscord({
        id: reportId, email: email.trim(), issue, route,
        orderReference: orderReference?.trim(), transactionHash: transactionHash?.trim(),
        message: message.trim(),
      }, discordWebhook)
      : Promise.resolve(false),
  ]);
  if (emailResult.status !== "pending") req.log.error({ reportId }, "Support email delivery unavailable or unconfirmed");
  if (!discordAccepted && discordWebhook) req.log.error({ reportId }, "Support Discord notification unavailable");

  let status: "pending" | "delivered" | "failed" | "unconfirmed" = emailResult.status;
  try {
    if (emailResult.providerId) {
      await updateCase(supportCase.id, "pending", emailResult.providerId);
      status = (await getCaseStatus(supportCase.token)) ?? "unconfirmed";
    } else {
      await updateCase(supportCase.id, status);
      status = (await getCaseStatus(supportCase.token)) ?? "unconfirmed";
    }
  } catch {
    req.log.error({ reportId }, "Support case status update unavailable");
    status = "unconfirmed";
  }
  const backup = discordAccepted ? " Your report was also posted to the support team's private Discord channel." : "";
  res.set("Cache-Control", "no-store").json(CreateSupportRequestResponse.parse({
    message: `${statusMessage(status)}${backup}`, status, token: supportCase.token,
  }));
});

router.get("/support/requests/status", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const parsed = GetSupportRequestStatusQueryParams.safeParse(req.query);
  if (!parsed.success || !/^[0-9a-f-]{72}$/.test(parsed.data.token)) { res.status(404).end(); return; }
  try {
    const status = await getCaseStatus(parsed.data.token);
    if (!status) { res.status(404).end(); return; }
    res.json(GetSupportRequestStatusResponse.parse({ status, message: statusMessage(status) }));
  } catch {
    req.log.error("Support case status unavailable");
    res.status(503).end();
  }
});

router.post("/support/webhook/resend", async (req, res): Promise<void> => {
  const raw = req.body;
  const secret = process.env.SUPPORT_RESEND_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(raw) || !verifyWebhook(raw, {
    id: req.get("svix-id"), timestamp: req.get("svix-timestamp"), signature: req.get("svix-signature"),
  }, secret)) { res.status(401).end(); return; }
  try {
    const payload: unknown = JSON.parse(raw.toString("utf8"));
    if (!payload || typeof payload !== "object" || !("type" in payload)) throw new Error("Invalid event");
    if (payload.type === "email.delivered" || payload.type === "email.bounced" || payload.type === "email.complained") {
      if (!("data" in payload) || !payload.data || typeof payload.data !== "object" ||
        !("email_id" in payload.data) || typeof payload.data.email_id !== "string" ||
        !("to" in payload.data) || !Array.isArray(payload.data.to) ||
        !payload.data.to.every((recipient) => typeof recipient === "string")) throw new Error("Invalid event data");
      if (payload.data.to.length !== 1 || payload.data.to[0].toLowerCase() !== DESTINATION) {
        res.status(204).end();
        return;
      }
      await recordSupportEvent(req.get("svix-id")!, payload.data.email_id,
        payload.type === "email.delivered" ? "delivered" : "failed");
      if (payload.type !== "email.delivered") req.log.error("Support email delivery failure recorded; operator review required");
    }
    res.status(204).end();
  } catch {
    // Return a retryable error. Never log raw payloads, headers, addresses, or report text.
    req.log.error("Support webhook processing failed; operator review required");
    res.status(503).end();
  }
});

export default router;
