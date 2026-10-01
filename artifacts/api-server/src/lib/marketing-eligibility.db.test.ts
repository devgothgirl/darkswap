import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { eq, sql } from "drizzle-orm";

// Fail before loading the database client; never use the operator database.
if (process.env.MARKETING_HEALTH_TEST_DB !== "true"
  || !/^postgresql:\/\/marketing_test@127\.0\.0\.1:\d+\/postgres$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run via pnpm --filter @workspace/api-server test:marketing-health (temporary local database only).");
}

const { db, pool, marketingSubscriptionsTable: subscriptions, marketingDeliveriesTable: deliveries,
  marketingWebhookReceiptsTable: receipts } = await import("@workspace/db");
const { campaignUnsubscribeToken, hashToken, marketingHealth, recordProviderEvent, sendCampaign,
  unsubscribe } = await import("./marketing");
type MailTransport = import("./marketing").MailTransport;

process.env.MARKETING_PUBLIC_URL = "https://example.invalid";
process.env.MARKETING_FROM_EMAIL = "never-send@example.invalid";
process.env.MARKETING_POSTAL_ADDRESS = "Test-only postal address";
process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-only-secret-".repeat(4);
process.env.MARKETING_RESEND_WEBHOOK_SECRET = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
process.env.MARKETING_WEBHOOK_READY = "true";

after(async () => { await pool.end(); });
beforeEach(async () => {
  await db.execute(sql`TRUNCATE marketing_subscriptions, marketing_deliveries, marketing_events,
    marketing_webhook_receipts, marketing_webhook_status, marketing_campaigns, marketing_send_pace`);
  await db.insert(deliveries).values({
    id: "health-seed", email: "probe@example.invalid", kind: "probe", status: "accepted",
    providerMessageId: "health-message", webhookExpectedAt: new Date(),
  });
  await db.insert(receipts).values({ id: "health-receipt", providerMessageId: "health-message" });
  assert.equal(await marketingHealth(), "healthy");
});

async function seedContacts(emails: string[]) {
  for (const email of emails) {
    await db.insert(subscriptions).values({
      email, source: "test", consentVersion: "marketing-v1", verifiedAt: new Date(),
      unsubscribeTokenHash: hashToken(campaignUnsubscribeToken(email)),
    });
  }
}

for (const change of ["unsubscribe", "suppression"] as const) {
  test(`${change} during the sending delay consumes the claim without transporting or retrying`, async () => {
    const campaign = { key: `delayed-${change}`, subject: "Mock", html: "<p>Mock</p>", text: "Mock" };
    const contacts = ["one@example.invalid", "two@example.invalid"];
    await seedContacts(contacts);
    const sent: string[] = [];
    const transport: MailTransport = {
      async send(message) { sent.push(message.to); return `mock-${sent.length}`; },
    };
    let enteredDelay!: () => void;
    const delayEntered = new Promise<void>(resolve => { enteredDelay = resolve; });
    let resumeDelay: (() => void) | undefined;
    const originalSetTimeout = globalThis.setTimeout;
    // Pause the real campaign rate limiter, not a database query or transport.
    // Reaching this timer proves the second reservation has been made.
    globalThis.setTimeout = ((callback: () => void, ms?: number) => {
      if (!resumeDelay && sent.length === 1 && ms !== undefined && ms <= 600
        && new Error().stack?.includes("sendCampaign")) {
        resumeDelay = callback;
        enteredDelay();
        return {} as NodeJS.Timeout;
      }
      return originalSetTimeout(callback, ms);
    }) as typeof setTimeout;
    const sending = sendCampaign(campaign, transport, false);
    try {
      await Promise.race([delayEntered, sending.then(
        () => { throw new Error("Campaign finished before the sending delay"); },
        error => { throw error; },
      )]);
      globalThis.setTimeout = originalSetTimeout;
      assert.equal(sent.length, 1);
      const skipped = contacts.find(email => email !== sent[0])!;
      const before = await db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
      assert.equal(before.length, 2, "both recipients must be reserved before the delay");
      assert.equal(before.find(row => row.email === skipped)?.status, "attempted");
      if (change === "unsubscribe") {
        await unsubscribe(campaignUnsubscribeToken(skipped));
      } else {
        await recordProviderEvent("during-delay-bounce", "earlier-message", "bounce", skipped);
      }
      const [contact] = await db.select().from(subscriptions).where(eq(subscriptions.email, skipped));
      assert.ok(change === "unsubscribe" ? contact.unsubscribedAt : contact.suppressedAt);
      assert.equal(await marketingHealth(), "healthy");
      resumeDelay!();
      resumeDelay = undefined;
      assert.deepEqual(await sending, { eligible: 2, sent: 1 });
      assert.deepEqual(sent, [contacts.find(email => email !== skipped)]);
      const rows = await db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
      const skippedDelivery = rows.find(row => row.email === skipped);
      assert.equal(skippedDelivery?.status, "attempted");
      assert.equal(skippedDelivery?.providerMessageId, null);
      assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
      await db.update(subscriptions).set({ unsubscribedAt: null, suppressedAt: null })
        .where(eq(subscriptions.email, skipped));
      assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
      assert.equal(sent.length, 1, "restored eligibility must not retry the consumed reservation");
      assert.deepEqual(await db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key)), rows);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      resumeDelay?.();
      await sending.catch(() => {});
    }
  });

  test(`${change} after the contact snapshot prevents an atomic delivery claim`, async () => {
    const campaign = { key: `snapshot-${change}`, subject: "Mock", html: "<p>Mock</p>", text: "Mock" };
    const contacts = ["one@example.invalid", "two@example.invalid"];
    await seedContacts(contacts);
    assert.deepEqual(await sendCampaign(campaign), { eligible: 2, sent: 0 });
    const sent: string[] = [];
    let skipped = "";
    const transport: MailTransport = {
      async send(message) {
        sent.push(message.to);
        assert.equal(sent.length, 1, "ineligible snapshot contact must never reach transport");
        // The full list has been read. Choose the other contact rather than
        // relying on PostgreSQL returning rows in any particular order.
        skipped = contacts.find(email => email !== message.to)!;
        if (change === "unsubscribe") {
          await unsubscribe(campaignUnsubscribeToken(skipped));
        } else {
          await recordProviderEvent("mid-campaign-bounce", "earlier-message", "bounce", skipped);
        }
        return "mock-message";
      },
    };

    assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 2, sent: 1 });
    const rows = await db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
    assert.equal(rows.length, 1, "atomic recheck must not reserve the now-ineligible contact");
    assert.equal(rows[0].email, sent[0]);
    assert.equal(rows[0].status, "accepted");
    assert.equal(rows[0].providerMessageId, "mock-message");
    const [contact] = await db.select().from(subscriptions).where(eq(subscriptions.email, skipped));
    assert.ok(change === "unsubscribe" ? contact.unsubscribedAt : contact.suppressedAt);
    assert.equal(await marketingHealth(), "healthy", "eligibility, not a health failure, prevented the send");
    assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
    assert.equal(sent.length, 1);
    assert.deepEqual(await db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key)), rows);
  });

  test(`${change} just after reservation consumes the claim without sending or retrying`, async () => {
    const campaign = { key: `reserved-${change}`, subject: "Mock", html: "<p>Mock</p>", text: "Mock" };
    const email = "reserved@example.invalid";
    await seedContacts([email]);
    // A test-only AFTER INSERT trigger deterministically changes eligibility
    // after the atomic claim but before the subsequent eligibility SELECT.
    // No sleeps, production hooks, or mocked database operations are needed.
    const column = change === "unsubscribe" ? "unsubscribed_at" : "suppressed_at";
    await db.execute(sql.raw(`CREATE FUNCTION test_revoke_reserved_contact() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE marketing_subscriptions SET ${column} = now() WHERE email = NEW.email;
        RETURN NEW;
      END $$`));
    await db.execute(sql`CREATE TRIGGER test_revoke_reserved_contact
      AFTER INSERT ON marketing_deliveries FOR EACH ROW
      WHEN (NEW.kind = 'campaign') EXECUTE FUNCTION test_revoke_reserved_contact()`);
    let calls = 0;
    const transport: MailTransport = {
      async send() { calls++; return "must-not-send"; },
    };
    const campaignRows = () => db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
    try {
      assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 1, sent: 0 });
      assert.equal(calls, 0);
      const rows = await campaignRows();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].email, email);
      assert.equal(rows[0].status, "attempted");
      assert.equal(rows[0].providerMessageId, null);
      const [contact] = await db.select().from(subscriptions).where(eq(subscriptions.email, email));
      assert.ok(change === "unsubscribe" ? contact.unsubscribedAt : contact.suppressedAt);
      assert.equal(await marketingHealth(), "healthy");
      assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
      assert.deepEqual(await campaignRows(), rows);

      // Artificial test-only restoration isolates reservation deduplication:
      // even if eligibility returns, this consumed attempt cannot be retried.
      await db.update(subscriptions).set({ unsubscribedAt: null, suppressedAt: null })
        .where(eq(subscriptions.email, email));
      await db.execute(sql`DROP TRIGGER test_revoke_reserved_contact ON marketing_deliveries`);
      assert.equal(await marketingHealth(), "healthy");
      assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
      assert.equal(calls, 0, "a consumed claim must never cause an unsafe retry");
      assert.deepEqual(await campaignRows(), rows, "reservation identity and state remain unchanged");
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS test_revoke_reserved_contact ON marketing_deliveries`);
      await db.execute(sql`DROP FUNCTION test_revoke_reserved_contact()`);
    }
  });
}

test("an unsubscribe committed after the final eligibility read prevents transport and consumes the claim", async () => {
  const email = "handoff@example.invalid";
  const campaign = { key: "handoff-unsubscribe", subject: "Mock", html: "<p>Mock</p>", text: "Mock" };
  await seedContacts([email]);
  const originalQuery = pool.query.bind(pool);
  let injected = false;
  let calls = 0;
  const transport: MailTransport = { async send() { calls++; return "must-not-send"; } };
  // Return the already-read eligibility result only after another connection
  // has committed the unsubscribe. This targets the exact old read/transport gap.
  pool.query = (async (...args: unknown[]) => {
    const result = await (originalQuery as (...values: unknown[]) => Promise<unknown>)(...args);
    const statement = typeof args[0] === "string" ? args[0]
      : (args[0] as { text?: string })?.text ?? "";
    if (!injected && /select/i.test(statement) && /marketing_subscriptions/i.test(statement)
      && /unsubscribe_token_hash/i.test(statement) && /email"?\s*=/i.test(statement)
      && /limit/i.test(statement)) {
      injected = true;
      await unsubscribe(campaignUnsubscribeToken(email));
    }
    return result;
  }) as typeof pool.query;
  try {
    assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 1, sent: 0 });
  } finally {
    pool.query = originalQuery;
  }
  assert.equal(injected, true);
  assert.equal(calls, 0);
  const rows = await db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "attempted");
  assert.equal(rows[0].providerMessageId, null);
  await db.update(subscriptions).set({ unsubscribedAt: null }).where(eq(subscriptions.email, email));
  assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
  assert.equal(calls, 0, "the claim must not be retried after eligibility is restored");
});

test("an unsubscribe cannot commit while a campaign transport is in flight", async () => {
  const email = "inflight@example.invalid";
  const campaign = { key: "inflight-unsubscribe", subject: "Mock", html: "<p>Mock</p>", text: "Mock" };
  await seedContacts([email]);
  let entered!: () => void;
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const transport: MailTransport = {
    async send() {
      entered();
      await pending;
      return "inflight-message";
    },
  };
  const sending = sendCampaign(campaign, transport, false);
  let unsubscribing: Promise<void> | undefined;
  try {
    await started;
    const [row] = await db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
    assert.equal(row.status, "sending", "the handoff must be committed before external I/O");
    unsubscribing = unsubscribe(campaignUnsubscribeToken(email));
    // The subscription row is not locked across I/O: a separate connection can
    // read it, while unsubscribe must not yet have committed.
    const [contact] = await db.select().from(subscriptions).where(eq(subscriptions.email, email));
    assert.equal(contact.unsubscribedAt, null);
    const [active] = (await db.execute(sql`SELECT status FROM marketing_deliveries WHERE id = ${row.id}`)).rows;
    assert.equal(active.status, "sending");
  } finally {
    finish();
  }
  assert.deepEqual(await sending, { eligible: 1, sent: 1 });
  await unsubscribing;
  const [contact] = await db.select().from(subscriptions).where(eq(subscriptions.email, email));
  assert.ok(contact.unsubscribedAt);
  const [delivery] = await db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
  assert.equal(delivery.status, "accepted");
  assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
});