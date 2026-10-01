import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq, sql } from "drizzle-orm";

// Never allow direct execution against the workspace's operator database.
if (process.env.MARKETING_HEALTH_TEST_DB !== "true"
  || !/^postgresql:\/\/marketing_test@127\.0\.0\.1:\d+\/postgres$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run via pnpm --filter @workspace/api-server test:marketing-health (temporary local database only).");
}

const { db, pool, marketingSubscriptionsTable: subscriptions, marketingDeliveriesTable: deliveries,
  marketingWebhookReceiptsTable: receipts, marketingWebhookStatusTable: status } = await import("@workspace/db");
const { campaignTransportTimeoutMs, campaignUnsubscribeToken, hashToken, markWebhookFailure, marketingHealth, sendCampaign } = await import("./marketing");
type MailTransport = import("./marketing").MailTransport;

process.env.MARKETING_PUBLIC_URL = "https://example.invalid";
process.env.MARKETING_FROM_EMAIL = "never-send@example.invalid";
process.env.MARKETING_POSTAL_ADDRESS = "Test-only postal address";
process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-only-secret-".repeat(4);
process.env.MARKETING_RESEND_WEBHOOK_SECRET = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
process.env.MARKETING_WEBHOOK_READY = "true";

after(async () => { await pool.end(); });

async function reset() {
  await db.execute(sql`TRUNCATE marketing_subscriptions, marketing_deliveries, marketing_events,
    marketing_webhook_receipts, marketing_webhook_status, marketing_campaigns, marketing_send_pace`);
}

async function seed(contacts: string[]) {
  for (const email of contacts) {
    await db.insert(subscriptions).values({
      email, source: "test", consentVersion: "marketing-v1", verifiedAt: new Date(),
      unsubscribeTokenHash: hashToken(campaignUnsubscribeToken(email)),
    });
  }
  await db.insert(deliveries).values({
    id: "health-seed", email: contacts[0], kind: "probe", status: "accepted",
    providerMessageId: "health-seed-message", webhookExpectedAt: new Date(),
  });
  await db.insert(receipts).values({ id: "health-seed-receipt", providerMessageId: "health-seed-message" });
  assert.equal(await marketingHealth(), "healthy");
}

test("a processing failure after the first send stops the campaign without retrying its reservation", async () => {
  await reset();
  const campaign = { key: "mid-send-health", subject: "Mock campaign", html: "<p>Mock</p>", text: "Mock" };
  const contacts = ["first@example.invalid", "second@example.invalid", "third@example.invalid"];
  await seed(contacts);
  const sent: { email: string; reservation: string }[] = [];
  const transport: MailTransport = {
    async send(message, idempotencyKey) {
      sent.push({ email: message.to, reservation: idempotencyKey });
      return `mock-message-${sent.length}`;
    },
  };

  // Failure is committed after the first accepted delivery, outside its gate.
  await db.execute(sql`CREATE FUNCTION test_fail_after_first_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO marketing_webhook_status (key) VALUES ('resend') ON CONFLICT DO NOTHING;
      RETURN NEW;
    END $$`);
  await db.execute(sql`CREATE TRIGGER test_fail_after_first_delivery AFTER UPDATE ON marketing_deliveries
    FOR EACH ROW WHEN (NEW.campaign_key = 'mid-send-health' AND NEW.status = 'accepted')
    EXECUTE FUNCTION test_fail_after_first_delivery()`);
  try {
    await assert.rejects(() => sendCampaign(campaign, transport, false), /campaigns paused/);
  } finally {
    await db.execute(sql`DROP TRIGGER test_fail_after_first_delivery ON marketing_deliveries`);
    await db.execute(sql`DROP FUNCTION test_fail_after_first_delivery()`);
  }
  assert.equal(await marketingHealth(), "processing_failure");
  assert.equal(sent.length, 1);
  const campaignDeliveries = () => db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
  const [first] = await campaignDeliveries();
  assert.equal(first.email, sent[0].email);
  assert.equal(first.id, sent[0].reservation);
  assert.equal(first.status, "accepted");
  assert.equal(first.providerMessageId, "mock-message-1");
  assert.equal((await campaignDeliveries()).length, 1);

  await assert.rejects(() => sendCampaign(campaign, transport, false), /campaigns paused/);
  await db.delete(status).where(eq(status.key, "resend"));
  assert.equal(await marketingHealth(), "healthy");
  assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 2, sent: 2 });
  assert.equal(new Set(sent.map(entry => entry.email)).size, contacts.length);
  assert.equal(new Set(sent.map(entry => entry.reservation)).size, contacts.length);
});

test("a waiting webhook failure commits after held transport and blocks the next reserved recipient", async () => {
  await reset();
  const campaign = { key: "in-flight-health-failure", subject: "Mock campaign", html: "<p>Mock</p>", text: "Mock" };
  const contacts = ["held-one@example.invalid", "held-two@example.invalid"];
  await seed(contacts);
  const sent: { email: string; reservation: string }[] = [];
  const order: string[] = [];
  let enterTransport!: () => void;
  const transportEntered = new Promise<void>(resolve => { enterTransport = resolve; });
  let releaseTransport!: () => void;
  const transportHeld = new Promise<void>(resolve => { releaseTransport = resolve; });
  const transport: MailTransport = {
    async send(message, idempotencyKey) {
      sent.push({ email: message.to, reservation: idempotencyKey });
      assert.equal(sent.length, 1, "the queued recipient must never reach transport");
      enterTransport();
      await transportHeld;
      order.push("transport-completed");
      return "mock-held-message";
    },
  };
  const campaignDeliveries = () => db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
  // Poll observable database state, not elapsed delays. Bound a broken test
  // without using sleeps to establish the race.
  async function until(check: () => Promise<boolean>, description: string) {
    const deadline = Date.now() + 10_000;
    while (!await check()) {
      assert.ok(Date.now() < deadline, description);
    }
  }

  const sending = sendCampaign(campaign, transport, false);
  // Attach rejection handlers immediately, including on cleanup paths.
  const firstOutcome = Promise.allSettled([sending]);
  let failure: Promise<void> | undefined;
  let queuedOutcome: ReturnType<typeof Promise.allSettled> | undefined;
  const observer = await pool.connect();
  let observerReleased = false;
  try {
    await Promise.race([transportEntered, sending.then(
      () => { throw new Error("Campaign finished before entering held transport"); },
      error => { throw error; },
    )]);
    failure = markWebhookFailure().then(() => { order.push("failure-committed"); });
    void failure.catch(() => {});
    await until(async () => {
      const result = await observer.query(`
        SELECT waiting.pid AS writer_pid, holding.pid AS sender_pid
        FROM pg_locks waiting JOIN pg_locks holding
          ON holding.locktype = waiting.locktype AND holding.classid = waiting.classid
          AND holding.objid = waiting.objid AND holding.objsubid = waiting.objsubid
        WHERE waiting.locktype = 'advisory' AND waiting.classid = 741837201
          AND waiting.objid = 1 AND waiting.objsubid = 2
          AND NOT waiting.granted AND holding.granted AND waiting.pid <> holding.pid
          AND holding.pid = ANY(pg_blocking_pids(waiting.pid))
      `);
      return result.rows.length === 1;
    }, "failure writer must wait on the held send's gate on another connection");
    assert.deepEqual(order, [], "failure cannot commit while transport is held");
    assert.equal((await observer.query("SELECT key FROM marketing_webhook_status")).rowCount, 0);
    observer.release();
    observerReleased = true;

    // Another worker consumes the next reservation but queues behind the held
    // transport. This also proves recovery cannot retry either claimed contact.
    queuedOutcome = Promise.allSettled([sendCampaign(campaign, transport, false)]);
    await until(async () => (await campaignDeliveries()).length === 2,
      "the next recipient must be reserved before releasing transport");
    const before = await campaignDeliveries();
    const held = before.find(row => row.id === sent[0].reservation);
    const queued = before.find(row => row.id !== sent[0].reservation);
    assert.ok(held);
    assert.ok(queued);
    assert.equal(held.status, "sending");
    assert.equal(queued.status, "attempted");
    assert.equal(queued.providerMessageId, null);
    assert.deepEqual(order, []);
    assert.equal(await marketingHealth(), "healthy", "waiting failure is not yet committed");

    releaseTransport();
    await failure;
    assert.deepEqual(order, ["transport-completed", "failure-committed"]);
    const [first] = await firstOutcome;
    assert.equal(first.status, "fulfilled");
    if (first.status === "fulfilled") assert.deepEqual(first.value, { eligible: 1, sent: 1 });
    const [next] = await queuedOutcome;
    assert.equal(next.status, "rejected");
    if (next.status === "rejected") assert.match(String(next.reason), /campaigns paused/);
    assert.equal(await marketingHealth(), "processing_failure");
    assert.equal(sent.length, 1);
    const after = await campaignDeliveries();
    assert.equal(after.length, 2);
    assert.equal(after.find(row => row.id === held.id)?.status, "accepted");
    assert.equal(after.find(row => row.id === held.id)?.providerMessageId, "mock-held-message");
    assert.deepEqual(after.find(row => row.id === queued.id), queued);

    await assert.rejects(() => sendCampaign(campaign, transport, false), /campaigns paused/);
    await db.delete(status).where(eq(status.key, "resend"));
    assert.equal(await marketingHealth(), "healthy");
    assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
    assert.equal(sent.length, 1, "neither reservation may be retried after recovery");
    assert.deepEqual(await campaignDeliveries(), after);
  } finally {
    if (!observerReleased) observer.release();
    releaseTransport();
    await Promise.allSettled([firstOutcome, failure, queuedOutcome]);
  }
});

for (const lateOutcome of ["pending", "accepted", "rejected"] as const) {
test(`a stalled transport releases the failure gate on timeout with a ${lateOutcome} late outcome`, { timeout: 15_000 }, async () => {
  await reset();
  const campaign = { key: `stalled-${lateOutcome}`, subject: "Mock campaign", html: "<p>Mock</p>", text: "Mock" };
  await seed(["stalled-one@example.invalid", "stalled-two@example.invalid"]);
  let enterTransport!: () => void;
  const entered = new Promise<void>(resolve => { enterTransport = resolve; });
  let resolveTransport!: (id: string) => void;
  let rejectTransport!: (error: Error) => void;
  const held = new Promise<string>((resolve, reject) => {
    resolveTransport = resolve;
    rejectTransport = reject;
  });
  const sent: string[] = [];
  const transport: MailTransport = {
    async send(_message, reservation) {
      sent.push(reservation);
      enterTransport();
      return held;
    },
  };
  const campaignDeliveries = () => db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
  async function until(check: () => Promise<boolean>, description: string) {
    const deadline = Date.now() + 10_000;
    while (!await check()) assert.ok(Date.now() < deadline, description);
  }
  // Capture only the production transport deadline, then expire it after
  // proving the failure writer is blocked. No elapsed sleep establishes the race.
  const originalSetTimeout = globalThis.setTimeout;
  let expire!: () => void;
  let timer: NodeJS.Timeout | undefined;
  globalThis.setTimeout = ((callback: () => void, ms?: number) => {
    const handle = originalSetTimeout(callback, ms);
    if (ms === campaignTransportTimeoutMs) {
      expire = callback;
      timer = handle;
    }
    return handle;
  }) as typeof setTimeout;
  const firstOutcome = Promise.allSettled([sendCampaign(campaign, transport, false)]);
  let failure: Promise<void> | undefined;
  let queuedOutcome: ReturnType<typeof Promise.allSettled> | undefined;
  const observer = await pool.connect();
  let observerReleased = false;
  try {
    await entered;
    globalThis.setTimeout = originalSetTimeout;
    assert.equal(typeof expire, "function", "transport must have a finite deadline");
    failure = markWebhookFailure();
    void failure.catch(() => {});
    await until(async () => {
      const result = await observer.query(`
        SELECT 1 FROM pg_locks waiting JOIN pg_locks holding
          ON holding.locktype = waiting.locktype AND holding.classid = waiting.classid
          AND holding.objid = waiting.objid AND holding.objsubid = waiting.objsubid
        WHERE waiting.locktype = 'advisory' AND waiting.classid = 741837201
          AND waiting.objid = 1 AND waiting.objsubid = 2
          AND NOT waiting.granted AND holding.granted
          AND holding.pid = ANY(pg_blocking_pids(waiting.pid))
      `);
      return result.rows.length === 1;
    }, "failure writer must be blocked by the stalled transport");
    observer.release();
    observerReleased = true;
    queuedOutcome = Promise.allSettled([sendCampaign(campaign, transport, false)]);
    await until(async () => (await campaignDeliveries()).length === 2,
      "another worker must reserve the queued recipient");
    const before = await campaignDeliveries();
    assert.equal(before.find(row => row.id === sent[0])?.status, "sending");
    assert.equal(await marketingHealth(), "healthy");

    expire();
    await failure; // Completes without ever releasing the transport.
    const [first] = await firstOutcome;
    assert.equal(first.status, "rejected");
    if (first.status === "rejected") assert.match(String(first.reason), /timed out.*outcome unknown/);
    const [queued] = await queuedOutcome;
    assert.equal(queued.status, "rejected");
    if (queued.status === "rejected") assert.match(String(queued.reason), /campaigns paused/);
    assert.equal(await marketingHealth(), "processing_failure");
    assert.equal(sent.length, 1, "queued recipient must not reach transport");
    const after = await campaignDeliveries();
    assert.equal(after.length, 2);
    for (const row of after) {
      assert.equal(row.status, "attempted", "no live sending fence may remain");
      assert.equal(row.providerMessageId, null, "a timeout is not acceptance");
      assert.ok(row.webhookExpectedAt, "unknown outcomes still await reconciliation");
    }
    await assert.rejects(() => sendCampaign(campaign, transport, false), /campaigns paused/);
    await db.delete(status).where(eq(status.key, "resend"));
    assert.equal(await marketingHealth(), "healthy");
    assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
    assert.equal(sent.length, 1, "recovery must not retry either consumed reservation");

    if (lateOutcome === "accepted") resolveTransport("late-provider-id");
    if (lateOutcome === "rejected") rejectTransport(new Error("Late provider failure"));
    // Drain late transport continuations; node:test also catches unhandled rejection.
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(await campaignDeliveries(), after, "late responses must not rewrite an uncertain send");
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    clearTimeout(timer);
    if (!observerReleased) observer.release();
    resolveTransport("cleanup-only");
    await Promise.allSettled([firstOutcome, failure, queuedOutcome]);
  }
});
}

test("a webhook failure committed during the sending delay blocks transport and consumes the reservation", async () => {
  await reset();
  const campaign = { key: "delayed-health-failure", subject: "Mock campaign", html: "<p>Mock</p>", text: "Mock" };
  const contacts = ["delay-one@example.invalid", "delay-two@example.invalid"];
  await seed(contacts);
  const sent: { email: string; reservation: string }[] = [];
  const transport: MailTransport = {
    async send(message, idempotencyKey) {
      sent.push({ email: message.to, reservation: idempotencyKey });
      return `mock-delay-message-${sent.length}`;
    },
  };
  let enteredDelay!: () => void;
  const delayEntered = new Promise<void>(resolve => { enteredDelay = resolve; });
  let resumeDelay: (() => void) | undefined;
  const originalSetTimeout = globalThis.setTimeout;
  // The shared send slot delays the second reserved recipient.
  globalThis.setTimeout = ((callback: () => void, ms?: number) => {
    if (!resumeDelay && sent.length === 1 && ms !== undefined && ms >= 0 && ms <= 600
      && new Error().stack?.includes("withCampaignSendSlot")) {
      resumeDelay = callback;
      enteredDelay();
      return {} as NodeJS.Timeout;
    }
    return originalSetTimeout(callback, ms);
  }) as typeof setTimeout;
  const sending = sendCampaign(campaign, transport, false);
  const campaignDeliveries = () => db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
  try {
    await Promise.race([delayEntered, sending.then(
      () => { throw new Error("Campaign finished before the sending delay"); },
      error => { throw error; },
    )]);
    globalThis.setTimeout = originalSetTimeout;
    assert.equal(sent.length, 1);
    const before = await campaignDeliveries();
    assert.equal(before.length, 2);
    const delayed = before.find(row => row.email !== sent[0].email);
    assert.ok(delayed);
    assert.equal(delayed.status, "attempted");
    assert.equal(delayed.providerMessageId, null);

    await markWebhookFailure();
    assert.equal(await marketingHealth(), "processing_failure");
    resumeDelay!();
    resumeDelay = undefined;
    await assert.rejects(sending, /campaigns paused/);
    assert.equal(sent.length, 1);
    assert.deepEqual(await campaignDeliveries(), before);
    await db.delete(status).where(eq(status.key, "resend"));
    assert.equal(await marketingHealth(), "healthy");
    assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
    assert.equal(sent.length, 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    resumeDelay?.();
    await sending.catch(() => {});
  }
});

test("a failure committed after the final health read blocks transport and consumes the reservation", async () => {
  await reset();
  const campaign = { key: "post-health-failure", subject: "Mock campaign", html: "<p>Mock</p>", text: "Mock" };
  const email = "post-health@example.invalid";
  await seed([email]);
  let sent = 0;
  const transport: MailTransport = { async send() { sent++; return "unexpected-send"; } };
  const originalQuery = pool.query.bind(pool);
  let injected = false;
  // After the final eligibility SELECT, commit failure before returning it.
  pool.query = (async (...args: unknown[]) => {
    const result = await (originalQuery as (...values: unknown[]) => Promise<unknown>)(...args);
    const statement = typeof args[0] === "string" ? args[0]
      : (args[0] as { text?: string })?.text ?? "";
    if (!injected && /select/i.test(statement) && /marketing_subscriptions/i.test(statement)
      && /unsubscribe_token_hash/i.test(statement) && /email"?\s*=/i.test(statement)
      && /limit/i.test(statement)) {
      injected = true;
      await markWebhookFailure();
      assert.equal(await marketingHealth(), "processing_failure");
    }
    return result;
  }) as typeof pool.query;
  try {
    await assert.rejects(() => sendCampaign(campaign, transport, false), /campaigns paused/);
  } finally {
    pool.query = originalQuery;
  }
  assert.equal(injected, true);
  assert.equal(sent, 0);
  const rows = await db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, email);
  assert.equal(rows[0].status, "attempted");
  assert.equal(rows[0].providerMessageId, null);
  await db.delete(status).where(eq(status.key, "resend"));
  assert.equal(await marketingHealth(), "healthy");
  assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
  assert.equal(sent, 0);
  assert.deepEqual(await db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key)), rows);
});