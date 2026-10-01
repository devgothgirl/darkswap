import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { eq, sql } from "drizzle-orm";

// This test must never mutate the workspace database or call a real provider.
if (process.env.MARKETING_HEALTH_TEST_DB !== "true"
  || !/^postgresql:\/\/marketing_test@127\.0\.0\.1:\d+\/postgres$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run via pnpm --filter @workspace/api-server test:marketing-health (temporary local database only).");
}

const { db, pool, marketingSubscriptionsTable: subscriptions, marketingDeliveriesTable: deliveries,
  marketingWebhookReceiptsTable: receipts } = await import("@workspace/db");
const { campaignUnsubscribeToken, hashToken, marketingHealth, sendCampaign } = await import("./marketing");
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
});

for (const overlap of [false, true]) {
test(`an uncertain provider response prevents a duplicate send with ${overlap ? "overlapping workers" : "sequential reruns"}`, async () => {
  const email = "uncertain@example.invalid";
  const campaign = { key: "uncertain-response", subject: "Mock campaign", html: "<p>Mock</p>", text: "Mock" };
  await db.insert(subscriptions).values({
    email, source: "test", consentVersion: "marketing-v1", verifiedAt: new Date(),
    unsubscribeTokenHash: hashToken(campaignUnsubscribeToken(email)),
  });
  await db.insert(deliveries).values({
    id: "health-seed", email, kind: "probe", status: "accepted",
    providerMessageId: "health-seed-message", webhookExpectedAt: new Date(),
  });
  await db.insert(receipts).values({ id: "health-seed-receipt", providerMessageId: "health-seed-message" });
  assert.equal(await marketingHealth(), "healthy");

  const campaignDeliveries = () => db.select().from(deliveries).where(eq(deliveries.campaignKey, campaign.key));
  const uncertainResponse = new Error("Connection lost after provider may have accepted the request");
  let calls = 0;
  let reservationId: string | undefined;
  let signalEntered!: () => void;
  const entered = new Promise<void>(resolve => { signalEntered = resolve; });
  let releaseTransport!: () => void;
  const pendingResponse = new Promise<void>(resolve => { releaseTransport = resolve; });
  let transportPending = false;
  const transport: MailTransport = {
    async send(message, idempotencyKey) {
      calls++;
      reservationId = idempotencyKey;
      assert.equal(message.to, email);
      const reserved = await campaignDeliveries();
      assert.equal(reserved.length, 1, "reservation must be persisted before calling the provider");
      assert.equal(reserved[0].id, idempotencyKey);
      assert.equal(reserved[0].status, "sending", "the unsubscribe fence must be committed before transport");
      assert.equal(reserved[0].providerMessageId, null);
      if (overlap) {
        transportPending = true;
        signalEntered();
        await pendingResponse;
        transportPending = false;
      }
      // Simulate acceptance with a lost response: the sender cannot safely retry.
      throw uncertainResponse;
    },
  };

  // Attach the rejection handler immediately, before starting the other worker.
  const firstWorker = assert.rejects(
    sendCampaign(campaign, transport, false), error => error === uncertainResponse,
  );
  if (overlap) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Overlapping workers did not finish within 5 seconds")), 5_000);
    });
    try {
      await Promise.race([entered, deadline]);
      assert.equal(transportPending, true);
      const reserved = await campaignDeliveries();
      assert.equal(await marketingHealth(), "healthy");
      assert.deepEqual(
        await Promise.race([sendCampaign(campaign, transport, false), deadline]),
        { eligible: 0, sent: 0 },
      );
      assert.equal(transportPending, true, "second worker must finish before the first response is released");
      assert.equal(calls, 1, "overlapping worker must not call the transport");
      assert.deepEqual(await campaignDeliveries(), reserved, "overlap must leave the sole reservation unchanged");
    } finally {
      if (timer) clearTimeout(timer);
      releaseTransport();
      await firstWorker;
    }
  } else {
    await firstWorker;
  }
  assert.equal(calls, 1);
  const persisted = await campaignDeliveries();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].id, reservationId);
  assert.equal(persisted[0].email, email);
  assert.equal(persisted[0].status, "attempted");
  assert.equal(persisted[0].providerMessageId, null);
  assert.ok(persisted[0].webhookExpectedAt, "uncertain sends still await reconciliation");

  // Healthy execution must skip the contact because of deduplication, not a health pause.
  assert.equal(await marketingHealth(), "healthy");
  assert.deepEqual(await sendCampaign(campaign, transport, false), { eligible: 0, sent: 0 });
  assert.equal(calls, 1, "the same campaign must not call the provider again for this contact");
  assert.deepEqual(await campaignDeliveries(), persisted, "retry must neither replace nor update the reservation");
});
}