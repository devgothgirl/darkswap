import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { eq, sql } from "drizzle-orm";

// Fail before importing the database client: this test may never touch the
// workspace's configured operator database, even when invoked directly.
if (process.env.MARKETING_HEALTH_TEST_DB !== "true"
  || !/^postgresql:\/\/marketing_test@127\.0\.0\.1:\d+\/postgres$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run via pnpm --filter @workspace/api-server test:marketing-health (temporary local database only).");
}

const { db, pool, marketingWebhookStatusTable: status, marketingDeliveriesTable: deliveries,
  marketingWebhookReceiptsTable: receipts, marketingSubscriptionsTable: subscriptions } = await import("@workspace/db");
const { beginWebhookProcessing, finishWebhookProcessing, campaignUnsubscribeToken, confirmOptIn, hashToken, marketingHealth, recordWebhookReceipt, requestOptIn, sendCampaign, sendWebhookProbe, unsubscribe } = await import("./marketing");
const { default: marketingRouter } = await import("../routes/marketing");
type MailTransport = import("./marketing").MailTransport;

const secretKey = Buffer.alloc(32, 7);
process.env.MARKETING_PUBLIC_URL = "https://example.invalid";
process.env.MARKETING_FROM_EMAIL = "never-send@example.invalid";
process.env.MARKETING_POSTAL_ADDRESS = "Test-only postal address";
process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-only-secret-".repeat(4);
process.env.MARKETING_RESEND_WEBHOOK_SECRET = `whsec_${secretKey.toString("base64")}`;
process.env.MARKETING_WEBHOOK_READY = "true";

after(async () => { await pool.end(); });

const campaign = { key: "health-test", subject: "Mock campaign", html: "<p>Mock</p>", text: "Mock" };
const email = "health-test@example.invalid";
const sent: string[] = [];
const mock: MailTransport = {
  async send(message) {
    sent.push(message.to);
    return "mock-campaign-message";
  },
};

async function healthResponse(base: string) {
  const response = await fetch(`${base}/api/marketing/health`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return { code: response.status, body: await response.json() as { status: string } };
}

test("health pauses sends for stale and overdue activity, latches signed processing failures, and requires reconciliation", async () => {
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: "silent" }) }));
  app.use("/api/marketing/webhook/resend", express.raw({ type: "application/json" }));
  app.use("/api", marketingRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;

  const signedPost = async (id: string, payload: string, valid = true) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secretKey).update(`${id}.${timestamp}.${payload}`).digest("base64");
    return fetch(`${base}/api/marketing/webhook/resend`, {
      method: "POST",
      headers: {
        "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp,
        "svix-signature": `v1,${valid ? signature : "invalid"}`,
      },
      body: payload,
    });
  };

  const assertPaused = async (reason: string) => {
    assert.equal(await marketingHealth(), reason);
    assert.deepEqual(await healthResponse(base), { code: 503, body: { status: reason } });
    await assert.rejects(() => sendCampaign(campaign, mock, false), /campaigns paused/);
    assert.equal(sent.length, 0, "paused campaign must never reach the transport");
  };

  try {
    await db.insert(subscriptions).values({
      email, source: "test", consentVersion: "marketing-v1", verifiedAt: new Date(),
      unsubscribeTokenHash: hashToken(campaignUnsubscribeToken(email)),
    });

    // A receipt from a different message cannot prove this delivery was observed.
    await db.insert(deliveries).values({
      id: "old-delivery", email, kind: "probe", status: "accepted",
      providerMessageId: "old-message", webhookExpectedAt: new Date(Date.now() - 26 * 60 * 60_000),
    });
    await db.insert(receipts).values({
      id: "old-receipt", providerMessageId: "old-message",
      receivedAt: new Date(Date.now() - 25 * 60 * 60_000),
    });
    await db.insert(receipts).values({ id: "unrelated-receipt", providerMessageId: "unrelated-message" });
    await assertPaused("stale");
    assert.deepEqual(await db.select().from(status), [], "staleness does not latch a processing failure");

    // A fresh correlated receipt restores health while there is no overdue send.
    await recordWebhookReceipt("fresh-receipt", "old-message");
    assert.equal(await marketingHealth(), "healthy");
    assert.deepEqual(await healthResponse(base), { code: 200, body: { status: "healthy" } });

    await db.insert(deliveries).values({
      id: "overdue-delivery", email, kind: "probe", status: "accepted",
      providerMessageId: "overdue-message", webhookExpectedAt: new Date(Date.now() - 20 * 60_000),
    });
    assert.equal(await marketingHealth(), "backlog");
    assert.equal((await db.select().from(status)).length, 1, "overdue accepted delivery latches failure");
    await assertPaused("processing_failure");
    await recordWebhookReceipt("recovered-receipt", "overdue-message");
    await assertPaused("processing_failure");

    // Invalid signatures never change health, while a signed but unprocessable
    // event must latch a failure even when a recent correlated receipt exists.
    await db.delete(status).where(eq(status.key, "resend")); // operator reconciliation after receipt
    await db.execute(sql`DELETE FROM marketing_webhook_processing`);
    assert.equal(await marketingHealth(), "healthy");
    assert.equal((await signedPost("invalid-signature", "{}", false)).status, 401);
    assert.equal(await marketingHealth(), "healthy");
    assert.equal((await signedPost("malformed-signed", JSON.stringify({ type: "email.bounced", data: {} }))).status, 503);
    await assertPaused("processing_failure");
    assert.equal((await signedPost("valid-after-failure",
      JSON.stringify({ type: "email.delivered", data: { email_id: "overdue-message" } }))).status, 204);
    await assertPaused("processing_failure");

    // Reconciliation is explicit: a later successful webhook does not clear
    // the latch. Only after checking receipts can the operator clear it.
    assert.equal((await db.select().from(receipts).where(eq(receipts.id, "valid-after-failure"))).length, 1);
    await db.delete(status).where(eq(status.key, "resend"));
    await db.execute(sql`DELETE FROM marketing_webhook_processing WHERE event_id = 'malformed-signed'`);
    assert.equal(await marketingHealth(), "healthy");
    assert.deepEqual(await healthResponse(base), { code: 200, body: { status: "healthy" } });
    assert.deepEqual(await sendCampaign(campaign, mock, false), { eligible: 1, sent: 1 });
    assert.deepEqual(sent, [email]);
    assert.equal((await db.execute(sql`SELECT count(*)::int AS total FROM marketing_deliveries WHERE campaign_key = ${campaign.key}`)).rows[0].total, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("event claims are bounded without expiring or replacing unresolved legacy fences", async () => {
  await db.execute(sql`DELETE FROM marketing_webhook_processing`);
  const attempts = await Promise.all(Array.from({ length: 40 }, () => beginWebhookProcessing("bounded-event")));
  const owners = attempts.filter((id): id is string => id !== null);
  assert.equal(owners.length, 1, "only one concurrent claimant owns the event");
  const original = (await db.execute(sql`SELECT * FROM marketing_webhook_processing`)).rows;
  for (let i = 0; i < 40; i++) assert.equal(await beginWebhookProcessing("bounded-event"), null);
  assert.deepEqual((await db.execute(sql`SELECT * FROM marketing_webhook_processing`)).rows, original,
    "retries neither append rows nor refresh their metadata");
  const distinct = await beginWebhookProcessing("independent-event");
  assert.ok(distinct);
  await finishWebhookProcessing(distinct);
  assert.equal(await beginWebhookProcessing("bounded-event"), null, "other events cannot clear this pause");

  await db.execute(sql`INSERT INTO marketing_webhook_processing (id, event_id, started_at) VALUES
    ('legacy-one', 'legacy-event', now() - interval '10 years'),
    ('legacy-two', 'legacy-event', now() - interval '10 years')`);
  assert.equal(await beginWebhookProcessing("legacy-event"), null, "old fences do not expire");
  await db.execute(sql`DELETE FROM marketing_webhook_processing WHERE id = 'legacy-one'`);
  assert.equal(await beginWebhookProcessing("legacy-event"), null, "each legacy failure still needs review");
  await db.execute(sql`DELETE FROM marketing_webhook_processing WHERE id = 'legacy-two'`);
  const reconciled = await beginWebhookProcessing("legacy-event");
  assert.ok(reconciled);
  await finishWebhookProcessing("legacy-two");
  assert.equal(await beginWebhookProcessing("legacy-event"), null, "stale cleanup cannot clear a new owner");
  await finishWebhookProcessing(reconciled);
  await finishWebhookProcessing(owners[0]);
});

test("controlled probe can bootstrap a webhook while campaigns remain paused", async () => {
  const previousReady = process.env.MARKETING_WEBHOOK_READY;
  const previousProbe = process.env.MARKETING_WEBHOOK_PROBE_EMAIL;
  process.env.MARKETING_WEBHOOK_PROBE_EMAIL = "delivered@resend.dev";
  delete process.env.MARKETING_WEBHOOK_READY;
  const messages = new Map<string, { text: string; id: string }>();
  const probeTransport: MailTransport = {
    async send(message) {
      const id = `mock-${message.to.replace("@", "-")}-${messages.size}`;
      messages.set(message.to, { text: message.text, id });
      return id;
    },
  };
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: "silent" }) }));
  app.use("/api/marketing/webhook/resend", express.raw({ type: "application/json" }));
  app.use("/api", marketingRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const signedPost = async (id: string, messageId: string, type: string, recipient?: string) => {
    const payload = JSON.stringify({ type, data: { email_id: messageId, ...(recipient ? { to: [recipient] } : {}) } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secretKey).update(`${id}.${timestamp}.${payload}`).digest("base64");
    return fetch(`http://127.0.0.1:${address.port}/api/marketing/webhook/resend`, {
      method: "POST",
      headers: { "content-type": "application/json", "svix-id": id,
        "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
      body: payload,
    });
  };
  try {
    const priorCampaignSends = sent.length;
    assert.equal(await marketingHealth(), "not_ready");
    await sendWebhookProbe(probeTransport);
    const probe = messages.get("delivered@resend.dev");
    assert.ok(probe);
    assert.equal((await db.select().from(deliveries)
      .where(eq(deliveries.providerMessageId, probe.id))).length, 1);
    await assert.rejects(() => sendCampaign(campaign, mock, false), /verified signed Resend webhook/);
    assert.equal(sent.length, priorCampaignSends, "probe does not send a campaign");
    assert.equal((await signedPost("bootstrap-delivered", probe.id, "email.delivered")).status, 204);
    assert.equal((await db.select().from(receipts).where(eq(receipts.id, "bootstrap-delivered"))).length, 1);
    assert.equal(await marketingHealth(), "not_ready", "probe receipt alone never enables sending");

    process.env.MARKETING_WEBHOOK_READY = "true";
    assert.equal(await marketingHealth(), "healthy");
    for (const recipient of ["delivered@resend.dev", "bounced@resend.dev", "complained@resend.dev"]) {
      await requestOptIn(recipient, probeTransport);
      const confirmation = messages.get(recipient);
      assert.ok(confirmation);
      assert.match(confirmation.text, /Please confirm your DarkSwap updates subscription/);
      const confirmationToken = confirmation.text.match(/\/api\/marketing\/confirm\?token=([a-f0-9]{64})/)?.[1];
      assert.ok(confirmationToken);
      assert.equal(await confirmOptIn(confirmationToken), true);
      if (recipient === "delivered@resend.dev") {
        const unsubscribeToken = confirmation.text.match(/\/api\/marketing\/unsubscribe\?token=([a-f0-9]{64})/)?.[1];
        assert.ok(unsubscribeToken);
        await unsubscribe(unsubscribeToken);
        const [contact] = await db.select().from(subscriptions).where(eq(subscriptions.email, recipient));
        assert.ok(contact.unsubscribedAt, "unsubscribe must persist");
      } else {
        const eventType = recipient === "bounced@resend.dev" ? "email.bounced" : "email.complained";
        assert.equal((await signedPost(`signed-${eventType}`, confirmation.id, eventType, recipient)).status, 204);
        const [contact] = await db.select().from(subscriptions).where(eq(subscriptions.email, recipient));
        assert.ok(contact.suppressedAt, "signed bounce or complaint must suppress the contact");
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (previousReady === undefined) delete process.env.MARKETING_WEBHOOK_READY;
    else process.env.MARKETING_WEBHOOK_READY = previousReady;
    if (previousProbe === undefined) delete process.env.MARKETING_WEBHOOK_PROBE_EMAIL;
    else process.env.MARKETING_WEBHOOK_PROBE_EMAIL = previousProbe;
  }
});

test("health database read failure reports unavailable and blocks the transport", async () => {
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: "silent" }) }));
  app.use("/api", marketingRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const sends: string[] = [];
  const transport: MailTransport = {
    async send(message) {
      sends.push(message.to);
      return "unexpected-send";
    },
  };
  let renamed = false;

  try {
    const contact = "health-db-failure@example.invalid";
    await db.insert(subscriptions).values({
      email: contact, source: "test", consentVersion: "marketing-v1", verifiedAt: new Date(),
      unsubscribeTokenHash: hashToken(campaignUnsubscribeToken(contact)),
    });
    await db.insert(deliveries).values({
      id: "health-db-failure-delivery", email: contact, kind: "probe", status: "accepted",
      providerMessageId: "health-db-failure-message", webhookExpectedAt: new Date(),
    });
    await db.insert(receipts).values({
      id: "health-db-failure-receipt", providerMessageId: "health-db-failure-message",
    });
    assert.equal(await marketingHealth(), "healthy", "failure test must start from a healthy state");
    // This database is created solely for this test run. Removing the health
    // table temporarily makes the first health read fail without touching the
    // workspace operator database or changing production code.
    await db.execute(sql`ALTER TABLE marketing_webhook_status RENAME TO marketing_webhook_status_offline`);
    renamed = true;
    await assert.rejects(() => marketingHealth(), "the health check must actually reach the failing read");
    assert.deepEqual(await healthResponse(base), { code: 503, body: { status: "unavailable" } });
    await assert.rejects(() => sendCampaign({ ...campaign, key: "health-read-failure" }, transport, false));
    assert.deepEqual(sends, [], "database failure must prevent any transport call");
  } finally {
    if (renamed) {
      await db.execute(sql`ALTER TABLE marketing_webhook_status_offline RENAME TO marketing_webhook_status`);
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("overdue backlog latch write failure reports unavailable and blocks the transport", async () => {
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: "silent" }) }));
  app.use("/api", marketingRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const sends: string[] = [];
  const transport: MailTransport = {
    async send(message) {
      sends.push(message.to);
      return "unexpected-send";
    },
  };
  let triggerInstalled = false;

  try {
    const contact = "health-latch-failure@example.invalid";
    await db.insert(subscriptions).values({
      email: contact, source: "test", consentVersion: "marketing-v1", verifiedAt: new Date(),
      unsubscribeTokenHash: hashToken(campaignUnsubscribeToken(contact)),
    });
    await db.insert(deliveries).values({
      id: "health-latch-recent-delivery", email: contact, kind: "probe", status: "accepted",
      providerMessageId: "health-latch-recent-message", webhookExpectedAt: new Date(),
    });
    await db.insert(receipts).values({
      id: "health-latch-recent-receipt", providerMessageId: "health-latch-recent-message",
    });
    assert.equal(await marketingHealth(), "healthy", "failure test must start from a healthy state");
    await db.insert(deliveries).values({
      id: "health-latch-overdue-delivery", email: contact, kind: "probe", status: "accepted",
      providerMessageId: "health-latch-overdue-message", webhookExpectedAt: new Date(Date.now() - 20 * 60_000),
    });
    // The temporary local database keeps health reads working, but rejects the
    // insert that persists a detected backlog. No operator database is involved.
    await db.execute(sql`
      CREATE FUNCTION test_reject_webhook_latch() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'simulated backlog latch write failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await db.execute(sql`
      CREATE TRIGGER test_reject_webhook_latch_insert
      BEFORE INSERT ON marketing_webhook_status
      FOR EACH ROW EXECUTE FUNCTION test_reject_webhook_latch()
    `);
    triggerInstalled = true;
    const latchWriteFailed = (error: unknown): boolean => {
      assert.match(String((error as { cause?: unknown }).cause), /simulated backlog latch write failure/);
      return true;
    };
    await assert.rejects(() => marketingHealth(), latchWriteFailed,
      "the overdue health check must reach the failing latch insert");
    assert.deepEqual(await healthResponse(base), { code: 503, body: { status: "unavailable" } });
    await assert.rejects(() => sendCampaign({ ...campaign, key: "health-latch-failure" }, transport, false),
      latchWriteFailed);
    assert.deepEqual(sends, [], "failed backlog latch must prevent any transport call");
    assert.deepEqual(await db.select().from(status), [], "failed latch must not be mistaken for healthy state");
  } finally {
    if (triggerInstalled) await db.execute(sql`DROP TRIGGER test_reject_webhook_latch_insert ON marketing_webhook_status`);
    await db.execute(sql`DROP FUNCTION IF EXISTS test_reject_webhook_latch()`);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("signed webhook processing failure pauses sends when its latch write fails but health reads work", async () => {
  // Earlier cases intentionally leave overdue deliveries behind. Reset only
  // the disposable database created by test-marketing-health.sh.
  await db.execute(sql`TRUNCATE marketing_subscriptions, marketing_deliveries, marketing_events,
    marketing_webhook_receipts, marketing_webhook_status, marketing_campaigns`);
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: "silent" }) }));
  app.use("/api/marketing/webhook/resend", express.raw({ type: "application/json" }));
  app.use("/api", marketingRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const sends: string[] = [];
  const transport: MailTransport = {
    async send(message) {
      sends.push(message.to);
      return "unexpected-send";
    },
  };
  let triggerInstalled = false;

  try {
    const contact = "signed-latch-failure@example.invalid";
    await db.insert(subscriptions).values({
      email: contact, source: "test", consentVersion: "marketing-v1", verifiedAt: new Date(),
      unsubscribeTokenHash: hashToken(campaignUnsubscribeToken(contact)),
    });
    await db.insert(deliveries).values({
      id: "signed-latch-delivery", email: contact, kind: "probe", status: "accepted",
      providerMessageId: "signed-latch-message", webhookExpectedAt: new Date(),
    });
    await recordWebhookReceipt("signed-latch-receipt", "signed-latch-message");
    assert.equal(await marketingHealth(), "healthy", "the signed failure must start from healthy state");
    assert.deepEqual(await db.select().from(status), []);

    // Only latch inserts fail. The correlated receipt remains recent, there is
    // no overdue send, and all health reads remain available.
    await db.execute(sql`
      CREATE FUNCTION test_reject_signed_latch() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'simulated signed webhook latch write failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await db.execute(sql`
      CREATE TRIGGER test_reject_signed_latch_insert
      BEFORE INSERT ON marketing_webhook_status
      FOR EACH ROW EXECUTE FUNCTION test_reject_signed_latch()
    `);
    triggerInstalled = true;
    const payload = JSON.stringify({ type: "email.bounced", data: {} });
    const id = "signed-latch-error";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secretKey).update(`${id}.${timestamp}.${payload}`).digest("base64");
    const response = await fetch(`${base}/api/marketing/webhook/resend`, {
      method: "POST",
      headers: {
        "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp,
        "svix-signature": `v1,${signature}`,
      },
      body: payload,
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await db.select().from(status), [], "failed latch write left no persistent failure");
    assert.equal((await db.select().from(receipts).where(eq(receipts.id, "signed-latch-receipt"))).length, 1);
    assert.equal(await marketingHealth(), "processing_failure");
    assert.deepEqual(await healthResponse(base), { code: 503, body: { status: "processing_failure" } });
    await assert.rejects(() => sendCampaign({ ...campaign, key: "signed-latch-failure" }, transport, false), /campaigns paused/);
    assert.deepEqual(sends, []);

    // A subsequent check after writes recover must not silently clear the
    // pause. Only operator reconciliation and restart can do that.
    await db.execute(sql`DROP TRIGGER test_reject_signed_latch_insert ON marketing_webhook_status`);
    triggerInstalled = false;
    assert.deepEqual(await db.select().from(status), []);
    assert.equal(await marketingHealth(), "processing_failure");
    assert.deepEqual(await healthResponse(base), { code: 503, body: { status: "processing_failure" } });
    await assert.rejects(() => sendCampaign({ ...campaign, key: "signed-latch-failure" }, transport, false), /campaigns paused/);
    assert.deepEqual(sends, [], "a later healthy database read cannot resume campaign transport");
  } finally {
    if (triggerInstalled) await db.execute(sql`DROP TRIGGER test_reject_signed_latch_insert ON marketing_webhook_status`);
    await db.execute(sql`DROP FUNCTION IF EXISTS test_reject_signed_latch()`);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("rejected signed failure latch blocks other workers and replacements until explicit reconciliation", { timeout: 30_000 }, async () => {
  await db.execute(sql`TRUNCATE marketing_subscriptions, marketing_deliveries, marketing_events,
    marketing_webhook_receipts, marketing_webhook_status, marketing_webhook_processing, marketing_campaigns, marketing_send_pace`);
  const contact = "multi-worker-health@example.invalid";
  await db.insert(subscriptions).values({
    email: contact, source: "test", consentVersion: "marketing-v1", verifiedAt: new Date(),
    unsubscribeTokenHash: hashToken(campaignUnsubscribeToken(contact)),
  });
  await db.insert(deliveries).values({
    id: "multi-worker-probe", email: contact, kind: "probe", status: "accepted",
    providerMessageId: "multi-worker-message", webhookExpectedAt: new Date(),
  });
  await recordWebhookReceipt("multi-worker-recent", "multi-worker-message");

  const workers: ReturnType<typeof startWorker>[] = [];
  function startWorker() {
    const child = spawn(process.execPath, [
      fileURLToPath(new URL("../../../../scripts/node_modules/tsx/dist/cli.mjs", import.meta.url)),
      fileURLToPath(new URL("./marketing-health.worker.ts", import.meta.url)),
    ], { env: process.env, stdio: "pipe" });
    const output = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    const exited = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", code => code === 0 || child.signalCode
        ? resolve() : reject(new Error(`Worker failed (${code}): ${stderr}`)));
    });
    // Register rejection handling immediately, including when a test assertion fails.
    void exited.catch(() => {});
    async function read() {
      const result = await output.next();
      if (result.done) throw new Error(`Worker stopped unexpectedly: ${stderr}`);
      return JSON.parse(result.value);
    }
    return {
      child, read, exited,
      async send(key: string) { child.stdin.write(JSON.stringify({ key }) + "\n"); return read(); },
    };
  }
  const signedPost = async (base: string, id: string, payload: string) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secretKey).update(`${id}.${timestamp}.${payload}`).digest("base64");
    return fetch(`${base}/api/marketing/webhook/resend`, {
      method: "POST", body: payload,
      headers: { "content-type": "application/json", "svix-id": id,
        "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
    });
  };
  let triggerInstalled = false;
  let replayTriggerInstalled = false;
  const replayLock = await pool.connect();
  const timer = setTimeout(() => workers.forEach(worker => worker.child.kill("SIGKILL")), 25_000);
  try {
    const handler = startWorker(); workers.push(handler);
    const other = startWorker(); workers.push(other);
    const [{ base }, { base: otherBase }] = await Promise.all([handler.read(), other.read()]);
    assert.deepEqual(await healthResponse(base), { code: 200, body: { status: "healthy" } });
    assert.deepEqual(await healthResponse(otherBase), { code: 200, body: { status: "healthy" } });
    // Hold the original owner inside receipt processing, after its fence is
    // committed. Separate worker replays must not adopt or delete that fence.
    await db.execute(sql`CREATE FUNCTION test_hold_replay_receipt() RETURNS trigger AS $$
      BEGIN
        IF NEW.id IN ('active-replay', 'failed-replay') THEN
          PERFORM pg_advisory_xact_lock(741837202, 74);
          IF NEW.id = 'failed-replay' THEN RAISE EXCEPTION 'simulated receipt failure'; END IF;
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER test_hold_replay_receipt_insert BEFORE INSERT ON marketing_webhook_receipts
      FOR EACH ROW EXECUTE FUNCTION test_hold_replay_receipt()`);
    replayTriggerInstalled = true;
    for (const id of ["active-replay", "failed-replay"]) {
      await replayLock.query("SELECT pg_advisory_lock(741837202, 74)");
      const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "multi-worker-message" } });
      const owner = signedPost(base, id, payload);
      // Wait for the owner to acquire its durable claim, not a timing guess.
      const deadline = Date.now() + 5_000;
      let claimed = false;
      while (Date.now() < deadline) {
        if ((await db.execute(sql`SELECT id FROM marketing_webhook_processing WHERE event_id = ${id}`)).rows.length) {
          claimed = true; break;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(claimed);
      const before = (await db.execute(sql`SELECT * FROM marketing_webhook_processing WHERE event_id = ${id}`)).rows;
      const replays = await Promise.all(Array.from({ length: 12 }, (_, i) => signedPost(
        i % 2 ? base : otherBase, id, i % 3 ? payload : '{"type":"email.bounced","data":{}}')));
      assert.ok(replays.every(response => response.status === 503));
      assert.deepEqual((await db.execute(sql`SELECT * FROM marketing_webhook_processing WHERE event_id = ${id}`)).rows, before);
      assert.deepEqual(await db.select().from(status), [], "overlapping retries must not latch a false failure");
      await replayLock.query("SELECT pg_advisory_unlock(741837202, 74)");
      assert.equal((await owner).status, id === "active-replay" ? 204 : 503);
      if (id === "active-replay") {
        assert.deepEqual(await healthResponse(otherBase), { code: 200, body: { status: "healthy" } },
          "successful owner restores health without reconciliation");
      } else {
        assert.equal(await marketingHealth(), "processing_failure");
        assert.equal((await signedPost(otherBase, id, payload)).status, 503,
          "a successful payload cannot replay over another attempt's failure");
        assert.deepEqual((await db.execute(sql`SELECT * FROM marketing_webhook_processing WHERE event_id = ${id}`)).rows, before);
        await db.execute(sql`DELETE FROM marketing_webhook_processing WHERE id = ${before[0].id}`);
        await db.delete(status).where(eq(status.key, "resend"));
      }
    }
    await db.execute(sql`DROP TRIGGER test_hold_replay_receipt_insert ON marketing_webhook_receipts`);
    replayTriggerInstalled = false;
    await db.execute(sql`
      CREATE FUNCTION test_reject_multi_worker_latch() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'simulated multi-worker latch rejection'; END;
      $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER test_reject_multi_worker_latch_insert
      BEFORE INSERT ON marketing_webhook_status FOR EACH ROW EXECUTE FUNCTION test_reject_multi_worker_latch()`);
    triggerInstalled = true;
    assert.equal((await signedPost(base, "multi-worker-failed",
      JSON.stringify({ type: "email.bounced", data: {} }))).status, 503);
    assert.deepEqual(await db.select().from(status), [], "latch write was rejected");
    const pending = (await db.execute(sql`SELECT id, event_id FROM marketing_webhook_processing`)).rows;
    assert.equal(pending.length, 1, "write-ahead fence survives the rejected latch write");
    assert.equal(pending[0].event_id, "multi-worker-failed");
    const failedFence = (await db.execute(sql`SELECT * FROM marketing_webhook_processing`)).rows;
    const repeated = await Promise.all(Array.from({ length: 40 }, (_, i) => signedPost(
      i % 2 ? base : otherBase, "multi-worker-failed", '{"type":"email.bounced","data":{}}')));
    assert.ok(repeated.every(response => response.status === 503));
    assert.deepEqual((await db.execute(sql`SELECT * FROM marketing_webhook_processing`)).rows, failedFence,
      "permanently malformed retries stay bounded across workers even with rejected latch writes");
    assert.equal((await signedPost(base, "distinct-failed-event", "{}")).status, 503);
    assert.equal((await db.execute(sql`SELECT id FROM marketing_webhook_processing`)).rows.length, 2,
      "distinct unresolved events must each retain their own durable fence");
    const blocked = { health: "processing_failure", sends: 0, paused: true };
    assert.deepEqual(await handler.send("multi-handler"), blocked);
    assert.deepEqual(await other.send("multi-other"), blocked, "already-running worker must refuse transport");
    handler.child.kill("SIGKILL");
    await handler.exited;
    const replacement = startWorker(); workers.push(replacement);
    const { base: replacementBase } = await replacement.read();
    assert.deepEqual(await replacement.send("multi-restarted"), blocked, "unsafe restart must not restore sends");

    await db.execute(sql`DROP TRIGGER test_reject_multi_worker_latch_insert ON marketing_webhook_status`);
    triggerInstalled = false;
    // Even a successful replay cannot clear the earlier attempt's fence.
    assert.equal((await signedPost(replacementBase, "multi-worker-failed",
      JSON.stringify({ type: "email.delivered", data: { email_id: "multi-worker-message" } }))).status, 503);
    assert.deepEqual(await other.send("multi-repaired-db"), blocked);
    assert.deepEqual(await replacement.send("multi-replayed"), blocked);
    assert.equal((await db.execute(sql`SELECT id FROM marketing_webhook_processing`)).rows.length, 2);
    // Operator explicitly reconciles the reviewed attempt, not all attempts.
    await db.execute(sql`DELETE FROM marketing_webhook_processing WHERE id = ${pending[0].id}`);
    assert.deepEqual(await replacement.send("multi-partially-reconciled"), blocked,
      "reconciling one event cannot clear the other event's failure");
    await db.execute(sql`DELETE FROM marketing_webhook_processing WHERE event_id = 'distinct-failed-event'`);
    assert.deepEqual(await other.send("multi-reconciled-other"), { health: "healthy", sends: 1, paused: false });
    assert.deepEqual(await replacement.send("multi-reconciled-replacement"), { health: "healthy", sends: 1, paused: false });
  } finally {
    clearTimeout(timer);
    await replayLock.query("SELECT pg_advisory_unlock_all()");
    replayLock.release();
    for (const worker of workers) if (worker.child.exitCode === null && !worker.child.signalCode) worker.child.kill("SIGKILL");
    await Promise.all(workers.map(worker => worker.exited));
    if (triggerInstalled) await db.execute(sql`DROP TRIGGER test_reject_multi_worker_latch_insert ON marketing_webhook_status`);
    if (replayTriggerInstalled) await db.execute(sql`DROP TRIGGER test_hold_replay_receipt_insert ON marketing_webhook_receipts`);
    await db.execute(sql`DROP FUNCTION IF EXISTS test_hold_replay_receipt()`);
    await db.execute(sql`DROP FUNCTION IF EXISTS test_reject_multi_worker_latch()`);
  }
});