import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// No foreign key to orders or wallets. An attempted delivery must never be retried blindly:
// a network timeout after Resend accepts a message leaves the outcome unknown.
export const marketingDeliveriesTable = pgTable("marketing_deliveries", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  campaignKey: text("campaign_key"),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  providerMessageId: text("provider_message_id"),
  webhookExpectedAt: timestamp("webhook_expected_at", { withTimezone: true }),
  webhookAcknowledgedAt: timestamp("webhook_acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("marketing_delivery_campaign_unique").on(table.campaignKey, table.email),
  uniqueIndex("marketing_delivery_provider_unique").on(table.providerMessageId),
]);

// Record provider events even if they arrive before the send response has been saved.
export const marketingEventsTable = pgTable("marketing_events", {
  id: text("id").primaryKey(),
  providerMessageId: text("provider_message_id").notNull(),
  recipientEmail: text("recipient_email"),
  reason: text("reason").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// Signed provider activity only; no recipients, payloads or message bodies.
export const marketingWebhookReceiptsTable = pgTable("marketing_webhook_receipts", {
  id: text("id").primaryKey(),
  providerMessageId: text("provider_message_id").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("marketing_webhook_receipt_provider_idx").on(table.providerMessageId),
  index("marketing_webhook_receipt_received_idx").on(table.receivedAt),
]);

// A processing failure stays latched until an operator reconciles missed events.
export const marketingWebhookStatusTable = pgTable("marketing_webhook_status", {
  key: text("key").primaryKey(),
  failedAt: timestamp("failed_at", { withTimezone: true }).notNull().defaultNow(),
});

// Write-ahead fence: an interrupted/failed signed callback requires reconciliation.
// Separate from the failure latch so a rejected latch write cannot erase the fence.
// Claims under the shared advisory gate refuse events with any unresolved row.
// Non-unique index preserves legacy duplicate fences for explicit operator review.
export const marketingWebhookProcessingTable = pgTable("marketing_webhook_processing", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("marketing_webhook_processing_event_idx").on(table.eventId),
]);

// Locks the content associated with a campaign key, without persisting the message body.
export const marketingCampaignsTable = pgTable("marketing_campaigns", {
  key: text("key").primaryKey(),
  contentHash: text("content_hash").notNull(),
});

// One shared schedule across campaigns and server instances. Reserved slots are
// not released after an uncertain provider response.
export const marketingSendPaceTable = pgTable("marketing_send_pace", {
  key: text("key").primaryKey(),
  nextAt: timestamp("next_at", { withTimezone: true }).notNull(),
});