import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool, marketingSubscriptionsTable as subscriptions, marketingDeliveriesTable as deliveries,
  marketingEventsTable as events, marketingCampaignsTable as campaigns,
  marketingWebhookReceiptsTable as receipts } from "@workspace/db";
import { campaignUnsubscribeToken, confirmOptIn, hashToken, marketingHealth,
  pruneWebhookReceipts, recordProviderEvent, recordWebhookReceipt, requestOptIn,
  sendCampaign, unsubscribe, type MailTransport } from "./marketing";

after(async () => { await pool.end(); });

test("DB-backed marketing lifecycle and concurrent deduplication (mock transport only)", async () => {
  const suffix = randomUUID().replace(/-/g, "");
  const emails = [`marketing-test-${suffix}@example.invalid`, `marketing-pending-${suffix}@example.invalid`,
    `marketing-early-event-${suffix}@example.invalid`];
  const keys = [`test-${suffix}`];
  const eventIds = [`test-event-${suffix}`, `test-unknown-${suffix}`, `test-receipt-${suffix}`, `test-unmatched-${suffix}`];
  const providerIds: string[] = [];
  const originals = Object.fromEntries([
    "MARKETING_PUBLIC_URL", "MARKETING_FROM_EMAIL", "MARKETING_POSTAL_ADDRESS",
    "MARKETING_UNSUBSCRIBE_SECRET", "MARKETING_RESEND_WEBHOOK_SECRET", "MARKETING_WEBHOOK_READY",
  ].map(key => [key, process.env[key]]));
  process.env.MARKETING_PUBLIC_URL = "https://darkswap.app";
  process.env.MARKETING_FROM_EMAIL = "never-send@example.invalid";
  process.env.MARKETING_POSTAL_ADDRESS = "Test-only postal address";
  process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-only-secret-".repeat(4);
  process.env.MARKETING_RESEND_WEBHOOK_SECRET = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
  process.env.MARKETING_WEBHOOK_READY = "true";
  const confirmations: string[] = [];
  const campaignsSent: string[] = [];
  const mock: MailTransport = {
    async send(message) {
      if (message.subject.startsWith("Confirm")) confirmations.push(message.text);
      else campaignsSent.push(message.to);
      const providerId = `provider-${randomUUID()}`;
      providerIds.push(providerId);
      // Signed provider activity can arrive before the send response is saved.
      await recordWebhookReceipt(`test-receipt-${suffix}-${providerIds.length}`, providerId);
      return providerId;
    },
  };
  let stage = "concurrent intake";
  try {
    // Atomic cooldown prevents races from issuing multiple confirmations.
    await Promise.all(Array.from({ length: 4 }, () => requestOptIn(emails[0], mock)));
    assert.equal(confirmations.length, 1);
    assert.equal(await marketingHealth(), "healthy");
    await requestOptIn(emails[0], mock);
    assert.equal(confirmations.length, 1);
    const token = confirmations[0].match(/\/confirm\?token=([a-f0-9]{64})/)?.[1];
    assert.ok(token);
    stage = "confirmation expiry and replay";
    await requestOptIn(emails[1], mock);
    const pending = confirmations[1].match(/\/confirm\?token=([a-f0-9]{64})/)?.[1];
    assert.ok(pending);
    await db.update(subscriptions).set({ confirmationExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(subscriptions.email, emails[1]));
    assert.equal(await confirmOptIn(pending), false);
    assert.equal(await confirmOptIn(token), true);
    assert.equal(await confirmOptIn(token), false);

    const campaign = { key: keys[0], subject: "Mock subject", html: "<p>Mock</p>", text: "Mock" };
    stage = "campaign eligibility and deduplication";
    assert.equal((await sendCampaign(campaign, mock)).eligible, 1); // old/pending remain ineligible
    await Promise.all([sendCampaign(campaign, mock, false), sendCampaign(campaign, mock, false)]);
    assert.deepEqual(campaignsSent, [emails[0]]);
    await assert.rejects(() => sendCampaign({ ...campaign, subject: "Changed" }, mock, false), /different content/);
    stage = "receipt retention and durable acknowledgment";
    const [confirmedDelivery] = await db.select().from(deliveries)
      .where(eq(deliveries.providerMessageId, providerIds[0]));
    assert.ok(confirmedDelivery.webhookAcknowledgedAt); // signed event arrived before send response
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await db.update(receipts).set({ receivedAt: old }).where(eq(receipts.providerMessageId, providerIds[0]));
    await db.update(deliveries).set({ webhookExpectedAt: old, webhookAcknowledgedAt: null })
      .where(eq(deliveries.providerMessageId, providerIds[0]));
    const unmatchedProvider = `unmatched-${suffix}`;
    await recordWebhookReceipt(eventIds[3], unmatchedProvider);
    await db.update(receipts).set({ receivedAt: old }).where(eq(receipts.id, eventIds[3]));
    await pruneWebhookReceipts();
    const [retainedDelivery] = await db.select().from(deliveries)
      .where(eq(deliveries.providerMessageId, providerIds[0]));
    assert.ok(retainedDelivery.webhookAcknowledgedAt); // backfilled before deletion
    assert.equal((await db.select().from(receipts).where(eq(receipts.providerMessageId, providerIds[0]))).length, 0);
    assert.equal((await db.select().from(receipts).where(eq(receipts.id, eventIds[3]))).length, 0);
    assert.equal(await marketingHealth(), "healthy"); // other fresh receipt remains; no false backlog
    stage = "unsubscribe and resubscription";
    await unsubscribe(campaignUnsubscribeToken(emails[0]));
    await unsubscribe(campaignUnsubscribeToken(emails[0]));
    await requestOptIn(emails[0], mock);
    assert.equal(confirmations.length, 2); // the only second confirmation belongs to pending address
    assert.equal((await sendCampaign({ ...campaign, key: `second-${suffix}` }, mock)).eligible, 0);


    // A signed webhook can suppress an existing contact even when a provider
    // response was lost, and duplicate event IDs are harmless.
    stage = "duplicate signed event suppression";
    await recordProviderEvent(eventIds[0], "unknown-provider-id", "complaint", emails[1]);
    await recordProviderEvent(eventIds[0], "unknown-provider-id", "complaint", emails[1]);
    const [suppressed] = await db.select().from(subscriptions).where(eq(subscriptions.email, emails[1]));
    assert.equal(suppressed.suppressionReason, "complaint");
    assert.ok(suppressed.suppressedAt);
    await requestOptIn(emails[1], mock);
    assert.equal(confirmations.length, 2);
    const [count] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventIds[0]));
    assert.ok(count);

    // Event arrives during send, before the provider ID can be saved locally.
    stage = "event before provider ID save";
    const providerId = `provider-late-${suffix}`;
    const earlyEventMock: MailTransport = {
      async send() {
        await recordProviderEvent(eventIds[1], providerId, "bounce");
        return providerId;
      },
    };
    await requestOptIn(emails[2], earlyEventMock);
    const [early] = await db.select().from(subscriptions).where(eq(subscriptions.email, emails[2]));
    assert.equal(early.suppressionReason, "bounce");
    assert.equal(hashToken(campaignUnsubscribeToken(emails[0])).length, 64);
  } catch {
    // Assert/DB errors can include token hashes, links or addresses. Report only stage.
    throw new Error(`DB-backed marketing test failed at ${stage}; sensitive details omitted.`);
  } finally {
    // Delete only records with IDs/emails generated by this test; never wipe user data.
    try {
      await db.delete(receipts).where(inArray(receipts.providerMessageId, providerIds));
      await db.delete(events).where(inArray(events.id, eventIds));
      await db.delete(deliveries).where(inArray(deliveries.email, emails));
      await db.delete(campaigns).where(inArray(campaigns.key, keys));
      await db.delete(subscriptions).where(inArray(subscriptions.email, emails));
    } catch {
      throw new Error("DB-backed marketing test cleanup failed; sensitive details omitted.");
    } finally {
      for (const [key, value] of Object.entries(originals)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
});