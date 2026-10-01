import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, pool, marketingSubscriptionsTable as subscriptions, marketingDeliveriesTable as deliveries, marketingEventsTable as events, marketingCampaignsTable as campaigns, marketingWebhookReceiptsTable as receipts, marketingWebhookStatusTable as webhookStatus, marketingWebhookProcessingTable as webhookProcessing } from "@workspace/db";

export const genericMessage = "Thanks. If you opted in, please check your inbox to confirm your email.";
const tokenPattern = /^[a-f0-9]{64}$/;
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
export const newToken = (): string => randomBytes(32).toString("hex");
export const validToken = (token: unknown): token is string => typeof token === "string" && tokenPattern.test(token);
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Reject obviously incomplete footer addresses; this is not postal verification.
// Operators must still supply and verify the full business/PO box address.
export function validPostalAddress(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 15
    && value.trim().length <= 1000 && /\p{L}/u.test(value);
}

export function sendConfig() {
  const url = process.env.MARKETING_PUBLIC_URL;
  const from = process.env.MARKETING_FROM_EMAIL;
  const postal = process.env.MARKETING_POSTAL_ADDRESS;
  if (!url || !from || !validPostalAddress(postal) || !/^https:\/\//.test(url) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    throw new Error("Marketing sends require a HTTPS public URL, sender email, and postal address.");
  }
  if (!process.env.MARKETING_UNSUBSCRIBE_SECRET || process.env.MARKETING_UNSUBSCRIBE_SECRET.length < 32) {
    throw new Error("Marketing sends require a stable MARKETING_UNSUBSCRIBE_SECRET (at least 32 characters).");
  }
  return { url: url.replace(/\/$/, ""), from, postal };
}

export function campaignConfig() {
  const config = sendConfig();
  requireSignedWebhookSecret();
  if (process.env.MARKETING_WEBHOOK_READY !== "true") {
    throw new Error("Campaign sends require an explicitly verified signed Resend webhook.");
  }
  return config;
}

function requireSignedWebhookSecret(): void {
  const secret = process.env.MARKETING_RESEND_WEBHOOK_SECRET;
  if (!secret?.startsWith("whsec_") || !/^[A-Za-z0-9+/]+={0,2}$/.test(secret.slice(6))
    || Buffer.from(secret.slice(6), "base64").length < 16) {
    throw new Error("A configured signed Resend webhook is required.");
  }
}

// Absence of events alone cannot distinguish an idle list from a broken webhook.
// Require a recent correlated receipt, and reject any overdue unacknowledged send.
// Operators can send a controlled probe when traffic is idle.
export type MarketingHealth = "healthy" | "not_ready" | "processing_failure" | "backlog" | "stale";

// Failure writes and campaign dispatches share this cross-worker gate.
const webhookFailureGate = sql`SELECT pg_advisory_xact_lock(741837201, 1)`;
// A failed signed-webhook latch write must not let a later successful health
// read resume sends in this process. Reconcile the durable processing fences
// and failure latch before restarting a worker with this local fallback set.
let unpersistedWebhookFailure = false;
export function webhookSignalHealth(backlog: boolean, recent: boolean): MarketingHealth {
  return backlog ? "backlog" : recent ? "healthy" : "stale";
}
export async function marketingHealth(): Promise<MarketingHealth> {
  try { campaignConfig(); } catch { return "not_ready"; }
  if (unpersistedWebhookFailure) return "processing_failure";
  const [failure] = await db.select({ key: webhookStatus.key }).from(webhookStatus)
    .where(eq(webhookStatus.key, "resend")).limit(1);
  if (failure) return "processing_failure";
  const [unfinished] = await db.select({ id: webhookProcessing.id }).from(webhookProcessing).limit(1);
  if (unfinished) return "processing_failure";
  const [result] = (await db.execute(sql`
    SELECT
      EXISTS (
        SELECT 1 FROM marketing_deliveries d
        WHERE d.status = 'accepted' AND d.webhook_expected_at < now() - interval '15 minutes'
          AND d.webhook_acknowledged_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM marketing_webhook_receipts r WHERE r.provider_message_id = d.provider_message_id)
      ) AS backlog,
      EXISTS (
        SELECT 1 FROM marketing_webhook_receipts r
        JOIN marketing_deliveries d ON d.provider_message_id = r.provider_message_id
        WHERE r.received_at >= now() - interval '24 hours'
      ) AS recent
  `)).rows;
  if (result?.backlog) {
    await markWebhookFailure();
  }
  return webhookSignalHealth(result?.backlog === true, result?.recent === true);
}

export async function requireMarketingHealth(): Promise<void> {
  if (await marketingHealth() !== "healthy") throw new Error("Marketing webhook health check failed; campaigns paused.");
}

export async function recordWebhookReceipt(id: string, providerMessageId: string): Promise<void> {
  await db.transaction(async tx => {
    await tx.insert(receipts).values({ id, providerMessageId }).onConflictDoNothing();
    // Also handle replays: a prior receipt may have arrived before the provider ID was saved.
    await tx.execute(sql`
      UPDATE marketing_deliveries d SET webhook_acknowledged_at = r.received_at
      FROM (SELECT min(received_at) AS received_at FROM marketing_webhook_receipts
        WHERE provider_message_id = ${providerMessageId}) r
      WHERE d.provider_message_id = ${providerMessageId}
        AND d.webhook_acknowledged_at IS NULL AND r.received_at IS NOT NULL
    `);
  });
}

// Preserve acknowledgment on deliveries before expiring the bounded receipt ledger.
// Unmatched receipts are held for 30 days so early webhooks can still be correlated.
export async function pruneWebhookReceipts(): Promise<void> {
  await db.transaction(async tx => {
    await tx.execute(sql`
      UPDATE marketing_deliveries d SET webhook_acknowledged_at = r.received_at
      FROM (SELECT provider_message_id, min(received_at) AS received_at
        FROM marketing_webhook_receipts GROUP BY provider_message_id) r
      WHERE d.provider_message_id = r.provider_message_id
        AND d.webhook_acknowledged_at IS NULL
    `);
    await tx.execute(sql`
      DELETE FROM marketing_webhook_receipts r
      WHERE r.received_at < now() - interval '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM marketing_deliveries d
          WHERE d.provider_message_id = r.provider_message_id
            AND d.status = 'accepted' AND d.webhook_acknowledged_at IS NULL
        )
    `);
  });
}

export async function markWebhookFailure(): Promise<void> {
  await db.transaction(async tx => {
    // Coordinate with in-flight campaign sends: a failure cannot commit between
    // their final gate and the provider request.
    await tx.execute(webhookFailureGate);
    await tx.insert(webhookStatus).values({ key: "resend" }).onConflictDoNothing();
  });
}

export async function markWebhookProcessingFailure(): Promise<boolean> {
  try {
    await markWebhookFailure();
    return true;
  } catch {
    unpersistedWebhookFailure = true;
    return false;
  }
}

export async function beginWebhookProcessing(eventId: string): Promise<string | null> {
  return db.transaction(async tx => {
    await tx.execute(webhookFailureGate);
    // Serialize claims across workers, including legacy rows that may contain
    // several attempts for one event. Never adopt, replace or expire a fence:
    // its owner alone may finish it, or an operator must reconcile it.
    const [pending] = await tx.select({ id: webhookProcessing.id }).from(webhookProcessing)
      .where(eq(webhookProcessing.eventId, eventId)).limit(1);
    if (pending) return null;
    const id = randomUUID();
    await tx.insert(webhookProcessing).values({ id, eventId });
    return id;
  });
}

export async function finishWebhookProcessing(id: string): Promise<void> {
  // Only this successful attempt may remove its fence. A successful replay
  // must not erase a different attempt's failure or interrupted processing.
  await db.delete(webhookProcessing).where(eq(webhookProcessing.id, id));
}

export async function sendWebhookProbe(transport: MailTransport = resendTransport): Promise<void> {
  // Bootstrap check: a controlled probe must be possible before the sending gate is enabled.
  // Campaigns and signups still require a healthy signed-webhook signal and readiness flag.
  const config = sendConfig();
  requireSignedWebhookSecret();
  const email = process.env.MARKETING_WEBHOOK_PROBE_EMAIL;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A controlled MARKETING_WEBHOOK_PROBE_EMAIL is required.");
  }
  const id = await registerDelivery(email, "probe");
  if (!id) throw new Error("Could not reserve marketing webhook probe.");
  const providerId = await transport.send({
    from: config.from, to: email, subject: "DarkSwap webhook health probe",
    text: "Operational webhook health probe.", html: "<p>Operational webhook health probe.</p>",
  }, id);
  await recordDelivery(id, providerId);
}

export interface MailTransport {
  send(message: { from: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string> }, idempotencyKey: string): Promise<string>;
}

export const resendTransport: MailTransport = {
  async send(message, idempotencyKey) {
    const response = await new ReplitConnectors().proxy("resend", "/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error("Marketing email provider unavailable");
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("id" in payload) || typeof payload.id !== "string") {
      throw new Error("Marketing email provider returned no message ID");
    }
    return payload.id;
  },
};

export function unsubscribeUrl(base: string, token: string) {
  return `${base}/api/marketing/unsubscribe?token=${token}`;
}

export function confirmationMessage(email: string, confirmToken: string, unsubToken: string, config: ReturnType<typeof sendConfig>) {
  const confirm = `${config.url}/api/marketing/confirm?token=${confirmToken}`;
  const unsubscribe = unsubscribeUrl(config.url, unsubToken);
  const text = `Please confirm your DarkSwap updates subscription: ${confirm}\n\nIf this wasn't you, unsubscribe here: ${unsubscribe}\n\n${config.postal}`;
  const html = `<p>Please confirm your DarkSwap updates subscription:</p><p><a href="${escapeHtml(confirm)}">Confirm subscription</a></p><p>If this wasn't you, <a href="${escapeHtml(unsubscribe)}">unsubscribe</a>.</p><p>${escapeHtml(config.postal)}</p>`;
  return { from: config.from, to: email, subject: "Confirm your DarkSwap updates subscription", text, html,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}

async function registerDelivery(email: string, kind: string, campaignKey?: string): Promise<string | null> {
  const id = randomUUID();
  const inserted = await db.insert(deliveries).values({
    id, email, kind, campaignKey, status: "attempted", webhookExpectedAt: new Date(),
  }).onConflictDoNothing().returning({ id: deliveries.id });
  return inserted[0]?.id ?? null;
}

async function recordDelivery(id: string, providerMessageId: string) {
  await db.transaction(async tx => {
    // Locking the delivery row closes the race with recordWebhookReceipt's update.
    await tx.update(deliveries).set({ providerMessageId, status: "accepted" }).where(eq(deliveries.id, id));
    await tx.execute(sql`
      UPDATE marketing_deliveries d SET webhook_acknowledged_at = r.received_at
      FROM (SELECT min(received_at) AS received_at FROM marketing_webhook_receipts
        WHERE provider_message_id = ${providerMessageId}) r
      WHERE d.id = ${id} AND d.webhook_acknowledged_at IS NULL AND r.received_at IS NOT NULL
    `);
  });
  await applyProviderSuppressions(providerMessageId);
}

export async function requestOptIn(email: string, transport: MailTransport = resendTransport): Promise<void> {
  const config = campaignConfig(); // signed suppression must be live even for confirmations
  const confirmToken = newToken();
  const unsubToken = campaignUnsubscribeToken(email);
  const now = new Date();
  const inserted = await db.insert(subscriptions).values({
    email, consentVersion: "marketing-v1", source: "order-page",
    confirmationTokenHash: hashToken(confirmToken),
    confirmationExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    lastConfirmationSentAt: now,
    unsubscribeTokenHash: hashToken(unsubToken),
  }).onConflictDoNothing().returning({ email: subscriptions.email });
  // An insert can conflict on either email OR the unique unsubscribe hash.
  // Do not use ON CONFLICT(email) here: concurrent inserts of the same address
  // can fail on the token index before the email conflict is selected.
  const updated = inserted.length ? inserted : await db.update(subscriptions).set({
      confirmationTokenHash: hashToken(confirmToken),
      confirmationExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      lastConfirmationSentAt: now,
      unsubscribeTokenHash: hashToken(unsubToken),
    }).where(and(eq(subscriptions.email, email),
      isNull(subscriptions.verifiedAt), isNull(subscriptions.unsubscribedAt), isNull(subscriptions.suppressedAt),
      sql`(${subscriptions.lastConfirmationSentAt} IS NULL OR ${subscriptions.lastConfirmationSentAt} < now() - interval '15 minutes')`),
    ).returning({ email: subscriptions.email });
  // The conditional update is atomic across server instances and retains older valid links.
  if (!updated.length) return;
  const deliveryId = await registerDelivery(email, "confirmation");
  if (!deliveryId) return;
  const id = await transport.send(confirmationMessage(email, confirmToken, unsubToken, config), deliveryId);
  await recordDelivery(deliveryId, id);
}

export async function confirmOptIn(token: string): Promise<boolean> {
  const rows = await db.update(subscriptions).set({
    verifiedAt: new Date(), confirmationTokenHash: null, confirmationExpiresAt: null,
  }).where(and(eq(subscriptions.confirmationTokenHash, hashToken(token)), gt(subscriptions.confirmationExpiresAt, new Date()),
    isNull(subscriptions.verifiedAt), isNull(subscriptions.unsubscribedAt), isNull(subscriptions.suppressedAt)))
    .returning({ email: subscriptions.email });
  return rows.length > 0;
}

export async function unsubscribe(token: string): Promise<void> {
  // Serialize the handoff with campaign dispatch, without keeping a row lock
  // across provider I/O. A committed "sending" attempt is already in flight:
  // wait for it to settle before reporting that an unsubscribe committed.
  // On a crashed/indefinitely stalled sender fail explicitly, never acknowledge
  // an unsubscribe that could still race a provider request.
  const deadline = Date.now() + 5_000;
  while (true) {
    const pending = await db.transaction(async tx => {
      const locked = await tx.execute(sql`SELECT email FROM marketing_subscriptions
        WHERE unsubscribe_token_hash = ${hashToken(token)} FOR UPDATE`);
      if (!locked.rows.length) return false;
      const email = locked.rows[0].email as string;
      const inFlight = await tx.execute(sql`SELECT 1 FROM marketing_deliveries
        WHERE email = ${email} AND kind = 'campaign' AND status = 'sending' LIMIT 1`);
      if (inFlight.rows.length) return true;
      await tx.update(subscriptions).set({
        unsubscribedAt: sql`coalesce(${subscriptions.unsubscribedAt}, now())`,
        confirmationTokenHash: null, confirmationExpiresAt: null,
      }).where(eq(subscriptions.email, email));
      return false;
    });
    if (!pending) return;
    if (Date.now() >= deadline) throw new Error("Campaign send still in flight; retry unsubscribe after reconciliation.");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

export async function applyProviderSuppressions(providerMessageId: string): Promise<void> {
  const matches = await db.select({ email: deliveries.email, reason: events.reason }).from(events)
    .innerJoin(deliveries, eq(deliveries.providerMessageId, events.providerMessageId))
    .where(eq(events.providerMessageId, providerMessageId));
  for (const match of matches) {
    await db.update(subscriptions).set({
      suppressedAt: sql`coalesce(${subscriptions.suppressedAt}, now())`,
      suppressionReason: match.reason,
      confirmationTokenHash: null, confirmationExpiresAt: null,
    }).where(eq(subscriptions.email, match.email));
  }
}

export async function recordProviderEvent(id: string, providerMessageId: string, reason: "bounce" | "complaint", recipient?: unknown) {
  // Only a strictly normalized marketing contact is eligible for direct suppression.
  // Signed provider recipient data covers timeout / unknown send-response cases.
  const email = typeof recipient === "string" && recipient === recipient.trim().toLowerCase()
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) && recipient.length <= 254 ? recipient : null;
  await db.insert(events).values({ id, providerMessageId, reason, recipientEmail: email }).onConflictDoNothing();
  if (email) {
    await db.update(subscriptions).set({
      suppressedAt: sql`coalesce(${subscriptions.suppressedAt}, now())`,
      suppressionReason: reason, confirmationTokenHash: null, confirmationExpiresAt: null,
    }).where(eq(subscriptions.email, email));
  }
  await applyProviderSuppressions(providerMessageId);
}

// Resend signs Svix payloads: base64 HMAC-SHA256 of "id.timestamp.rawBody".
export function verifyWebhook(raw: Buffer, headers: { id?: string; timestamp?: string; signature?: string }, secret: string, now = Date.now()): boolean {
  if (!secret.startsWith("whsec_") || !headers.id || !headers.timestamp || !headers.signature
    || !/^\d+$/.test(headers.timestamp) || Math.abs(now / 1000 - Number(headers.timestamp)) > 300) return false;
  let key: Buffer;
  try { key = Buffer.from(secret.slice(6), "base64"); } catch { return false; }
  if (key.length < 16) return false;
  const digest = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.`).update(raw).digest();
  return headers.signature.split(" ").some(part => {
    if (!part.startsWith("v1,")) return false;
    const supplied = Buffer.from(part.slice(3), "base64");
    return supplied.length === digest.length && timingSafeEqual(supplied, digest);
  });
}

export interface Campaign { key: string; subject: string; html: string; text: string }

export const campaignTransportTimeoutMs = 30_000;

async function withCampaignTransportTimeout(send: () => Promise<string>): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(
      "Marketing email transport timed out; provider outcome unknown. Reservation will not be retried.",
    )), campaignTransportTimeoutMs);
  });
  try {
    // Bound the gate, not the provider request: it may still complete.
    // Race observes late rejections, but late IDs must never record acceptance.
    return await Promise.race([Promise.resolve().then(send), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// Do not occupy all four pool connections with local workers waiting for the
// advisory lock: health checks and transports may also need the database.
let localSendQueue: Promise<void> = Promise.resolve();
async function withCampaignSendSlot<T>(send: () => Promise<T>): Promise<T> {
  const previous = localSendQueue;
  let releaseQueue!: () => void;
  localSendQueue = new Promise<void>(resolve => { releaseQueue = resolve; });
  await previous;
  try {
    const client = await pool.connect();
    let locked = false;
    try {
      await client.query("SELECT pg_advisory_lock(hashtextextended('marketing-campaign-send', 0))");
      locked = true;
      const pace = await client.query<{ wait_ms: number }>(`
        SELECT greatest(0, extract(epoch FROM (next_at - clock_timestamp())) * 1000) AS wait_ms
        FROM marketing_send_pace WHERE key = 'resend-campaign'
      `);
      const waitMs = Number(pace.rows[0]?.wait_ms ?? 0);
      if (!Number.isFinite(waitMs)) throw new Error("Could not read campaign send pace.");
      if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, Math.ceil(waitMs)));
      // Keep health and eligibility checks after the delay. Do not release the
      // lock between those checks and dispatch: a stalled worker must not send
      // directly after another worker's slot.
      return await send();
    } finally {
      try {
        if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended('marketing-campaign-send', 0))");
      } finally {
        client.release();
      }
    }
  } finally {
    releaseQueue();
  }
}

async function markCampaignSendAttempt(): Promise<void> {
  // Called under the shared advisory lock immediately before dispatch. This
  // write commits even when the provider response is unknown or throws.
  await db.execute(sql`INSERT INTO marketing_send_pace (key, next_at)
    VALUES ('resend-campaign', clock_timestamp() + interval '600 milliseconds')
    ON CONFLICT (key) DO UPDATE SET next_at = clock_timestamp() + interval '600 milliseconds'`);
}

async function beginCampaignTransport(email: string, tokenHash: string, deliveryId: string): Promise<boolean> {
  return db.transaction(async tx => {
    // Unsubscribe and dispatch lock the same contact row. The second operation
    // observes the first one's committed state in a new statement.
    const locked = await tx.execute(sql`SELECT email FROM marketing_subscriptions
      WHERE email = ${email} FOR UPDATE`);
    if (!locked.rows.length) return false;
    const eligible = await tx.select({ email: subscriptions.email }).from(subscriptions)
      .where(and(eq(subscriptions.email, email), eq(subscriptions.unsubscribeTokenHash, tokenHash),
        sql`${subscriptions.verifiedAt} is not null`, isNull(subscriptions.unsubscribedAt),
        isNull(subscriptions.suppressedAt))).limit(1);
    if (!eligible.length) return false;
    const started = await tx.update(deliveries).set({ status: "sending" })
      .where(and(eq(deliveries.id, deliveryId), eq(deliveries.status, "attempted")))
      .returning({ id: deliveries.id });
    return started.length > 0;
  });
}

export async function sendCampaign(campaign: Campaign, transport: MailTransport = resendTransport, dryRun = true): Promise<{ eligible: number; sent: number }> {
  const config = campaignConfig();
  if (!dryRun) await requireMarketingHealth();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(campaign.key) || !campaign.subject.trim() || !campaign.html.trim() || !campaign.text.trim()) {
    throw new Error("Campaign requires a stable key, subject, HTML and plain text.");
  }
  const contentHash = createHash("sha256").update(JSON.stringify([campaign.subject, campaign.html, campaign.text])).digest("hex");
  if (!dryRun) await db.insert(campaigns).values({ key: campaign.key, contentHash }).onConflictDoNothing();
  const [registered] = await db.select({ hash: campaigns.contentHash }).from(campaigns)
    .where(eq(campaigns.key, campaign.key));
  if (registered && registered.hash !== contentHash) throw new Error("Campaign key already registered with different content.");
  const contacts = await db.select({ email: subscriptions.email, token: subscriptions.unsubscribeTokenHash })
    .from(subscriptions).where(and(sql`${subscriptions.verifiedAt} is not null`, isNull(subscriptions.unsubscribedAt), isNull(subscriptions.suppressedAt),
      sql`${subscriptions.unsubscribeTokenHash} is not null`));
  // A stable HMAC-derived token permits campaign links without storing plaintext tokens.
  let eligible = 0;
  let sent = 0;
  for (const contact of contacts) {
    // Secret rotation must not produce broken unsubscribe links.
    const token = campaignUnsubscribeToken(contact.email);
    if (contact.token !== hashToken(token)) continue;
    const existing = await db.select({ id: deliveries.id }).from(deliveries)
      .where(and(eq(deliveries.campaignKey, campaign.key), eq(deliveries.email, contact.email))).limit(1);
    if (existing.length) continue;
    eligible++;
    if (dryRun) continue;
    await requireMarketingHealth();
    const url = unsubscribeUrl(config.url, token);
    // Atomic eligibility recheck on each recipient, with unique campaign/email reservation.
    const deliveryId = randomUUID();
    const claimed = await db.execute(sql`INSERT INTO marketing_deliveries
      (id, email, campaign_key, kind, status, webhook_expected_at)
      SELECT ${deliveryId}, email, ${campaign.key}, 'campaign', 'attempted', now()
      FROM marketing_subscriptions
      WHERE email = ${contact.email} AND verified_at IS NOT NULL
        AND unsubscribed_at IS NULL AND suppressed_at IS NULL AND unsubscribe_token_hash = ${hashToken(token)}
      ON CONFLICT DO NOTHING RETURNING id`);
    if (!claimed.rows.length) continue;
    const text = `${campaign.text}\n\nUnsubscribe: ${url}\n${config.postal}`;
    const html = `${campaign.html}<p><a href="${escapeHtml(url)}">Unsubscribe</a></p><p>${escapeHtml(config.postal)}</p>`;
    const id = await withCampaignSendSlot(async () => {
      await requireMarketingHealth();
      // Check after the sending delay and health read: the reserved contact may
      // have unsubscribed or been suppressed while waiting. Keep the claim consumed.
      const stillEligible = await db.select({ email: subscriptions.email }).from(subscriptions)
        .where(and(eq(subscriptions.email, contact.email), eq(subscriptions.unsubscribeTokenHash, hashToken(token)),
          sql`${subscriptions.verifiedAt} is not null`, isNull(subscriptions.unsubscribedAt), isNull(subscriptions.suppressedAt))).limit(1);
      if (!stillEligible.length) return null; // never risk retrying this reservation.
      // Close the read-to-transport gap with a durable in-flight fence.
      // Unsubscribe cannot commit past this point until this attempt settles.
      if (!await beginCampaignTransport(contact.email, hashToken(token), deliveryId)) return null;
      // Keep the failure writer behind dispatch until transport settles or times out. If
      // failure committed first, refuse the send; the claim remains consumed.
      try {
        const providerId = await db.transaction(async tx => {
          await tx.execute(webhookFailureGate);
          const [failure] = await tx.select({ key: webhookStatus.key }).from(webhookStatus)
            .where(eq(webhookStatus.key, "resend")).limit(1);
          const [unfinished] = await tx.select({ id: webhookProcessing.id }).from(webhookProcessing).limit(1);
          if (unpersistedWebhookFailure || failure || unfinished) {
            throw new Error("Marketing webhook health check failed; campaigns paused.");
          }
          await markCampaignSendAttempt();
          try {
            // Any transport error aborts the run. Never retry this reservation.
            return await withCampaignTransportTimeout(() => transport.send({
              from: config.from, to: contact.email, subject: campaign.subject, text, html,
              headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
            }, deliveryId));
          } finally {
            // Pace the next worker from completion even on unknown responses.
            await markCampaignSendAttempt();
          }
        });
        await recordDelivery(deliveryId, providerId);
        return providerId;
      } finally {
        // "attempted" remains a consumed, never-retried reservation on failure
        // (including an unknown provider outcome). Do not leave a live fence.
        await db.update(deliveries).set({ status: "attempted" })
          .where(and(eq(deliveries.id, deliveryId), eq(deliveries.status, "sending")));
      }
    });
    if (id === null) continue;
    sent++;
  }
  return { eligible, sent };
}

// HMAC avoids persisting plaintext campaign tokens and keeps links valid across campaigns.
// Rotating this secret invalidates existing links: keep it stable.
export function campaignUnsubscribeToken(email: string): string {
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < 32) throw new Error("MARKETING_UNSUBSCRIBE_SECRET must be at least 32 characters.");
  return createHmac("sha256", secret).update(`marketing-unsubscribe:${email}`).digest("hex");
}

export async function unsubscribeCampaign(token: string) {
  await unsubscribe(token);
}
