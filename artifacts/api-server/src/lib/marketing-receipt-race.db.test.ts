import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import express from "express";
import { eq, sql } from "drizzle-orm";

// Never run this destructive/concurrent DB test against the operator database.
if (process.env.MARKETING_HEALTH_TEST_DB !== "true"
  || !/^postgresql:\/\/marketing_test@127\.0\.0\.1:\d+\/postgres$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run via pnpm --filter @workspace/api-server test:marketing-health (temporary local database only).");
}

const { db, pool, marketingDeliveriesTable: deliveries, marketingWebhookReceiptsTable: receipts,
  marketingWebhookStatusTable: status } = await import("@workspace/db");
const { marketingHealth, pruneWebhookReceipts, sendWebhookProbe } = await import("./marketing");
const { default: marketingRouter } = await import("../routes/marketing");
type MailTransport = import("./marketing").MailTransport;

after(async () => { await pool.end(); });

test("signed receipt survives cleanup overlapping late provider-response correlation", async () => {
  const secret = Buffer.alloc(32, 7);
  process.env.MARKETING_PUBLIC_URL = "https://example.invalid";
  process.env.MARKETING_FROM_EMAIL = "never-send@example.invalid";
  process.env.MARKETING_POSTAL_ADDRESS = "Test-only postal address";
  process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-only-secret-".repeat(4);
  process.env.MARKETING_RESEND_WEBHOOK_SECRET = `whsec_${secret.toString("base64")}`;
  process.env.MARKETING_WEBHOOK_READY = "true";
  process.env.MARKETING_WEBHOOK_PROBE_EMAIL = "probe@example.invalid";

  const providerId = `mock-${randomUUID()}`;
  const unrelatedProviderId = `unrelated-${randomUUID()}`;
  const oldId = `old-${randomUUID()}`;
  const signedId = `signed-${randomUUID()}`;
  let providerCalled!: () => void;
  const enteredProvider = new Promise<void>(resolve => { providerCalled = resolve; });
  let returnProvider!: () => void;
  const providerResponse = new Promise<void>(resolve => { returnProvider = resolve; });
  const transport: MailTransport = {
    async send() {
      providerCalled();
      await providerResponse;
      return providerId;
    },
  };

  const app = express();
  app.use("/api/marketing/webhook/resend", express.raw({ type: "application/json" }));
  app.use("/api", marketingRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  let locked = false;
  const locker = await pool.connect();
  let pruning: Promise<void> | undefined;
  let sending: Promise<void> | undefined;
  let stage = "setup";
  try {
    sending = sendWebhookProbe(transport);
    await enteredProvider;
    // An unrelated expired receipt holds cleanup at its DELETE. The probe
    // cannot be acknowledged until its own signed webhook arrives, while the
    // provider response is still in flight.
    await db.insert(receipts).values({
      id: oldId, providerMessageId: unrelatedProviderId,
      receivedAt: new Date(Date.now() - 31 * 24 * 60 * 60_000),
    });
    await locker.query("BEGIN");
    locked = true;
    await locker.query("SELECT id FROM marketing_webhook_receipts WHERE id = $1 FOR UPDATE", [oldId]);
    pruning = pruneWebhookReceipts();
    stage = "waiting for cleanup to reach retention delete";
    const deadline = Date.now() + 10_000;
    while (true) {
      const [waiting] = (await db.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE wait_event_type = 'Lock'
            AND query LIKE '%DELETE FROM marketing_webhook_receipts r%'
        ) AS blocked
      `)).rows;
      if (waiting?.blocked === true) break;
      if (Date.now() > deadline) throw new Error("cleanup did not reach the locked delete");
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    stage = "signed webhook during cleanup";
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: providerId } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secret)
      .update(`${signedId}.${timestamp}.${payload}`).digest("base64");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/marketing/webhook/resend`, {
      method: "POST",
      headers: {
        "content-type": "application/json", "svix-id": signedId,
        "svix-timestamp": timestamp, "svix-signature": `v1,${signature}`,
      },
      body: payload,
    });
    assert.equal(response.status, 204, "signed receipt must be accepted during cleanup");

    stage = "late response correlation";
    returnProvider();
    await sending;
    await locker.query("COMMIT");
    locked = false;
    await pruning;

    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.providerMessageId, providerId));
    assert.equal(delivery?.status, "accepted");
    assert.ok(delivery.webhookAcknowledgedAt, "receipt acknowledgment must survive cleanup");
    const [signedReceipt] = await db.select().from(receipts).where(eq(receipts.id, signedId));
    assert.ok(signedReceipt, "fresh signed receipt must not be pruned");
    assert.equal(delivery.webhookAcknowledgedAt.getTime(), signedReceipt.receivedAt.getTime(),
      "probe must be acknowledged from its signed webhook");
    // Make the accepted send overdue: without durable correlation this health
    // read would latch a backlog and pause future sends.
    await db.update(deliveries).set({ webhookExpectedAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(deliveries.id, delivery.id));
    assert.equal(await marketingHealth(), "healthy", "no false overdue pause");
    assert.equal((await db.select().from(status)).length, 0, "no failure latch");
  } catch {
    // Do not leak provider IDs, emails, webhook signatures or SQL parameters.
    throw new Error(`Receipt/cleanup concurrency test failed at ${stage}; sensitive details omitted.`);
  } finally {
    returnProvider();
    if (locked) await locker.query("ROLLBACK");
    locker.release();
    await Promise.allSettled([pruning, sending].filter((p): p is Promise<void> => p !== undefined));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});