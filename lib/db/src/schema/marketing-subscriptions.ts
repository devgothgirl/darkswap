import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Marketing consent is intentionally independent of orders, wallets, and transactions.
export const marketingSubscriptionsTable = pgTable("marketing_subscriptions", {
  email: text("email").primaryKey(),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
  consentVersion: text("consent_version").notNull(),
  source: text("source").notNull(),
  // Existing records remain unverified until they explicitly confirm a new opt-in.
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  confirmationTokenHash: text("confirmation_token_hash"),
  confirmationExpiresAt: timestamp("confirmation_expires_at", { withTimezone: true }),
  lastConfirmationSentAt: timestamp("last_confirmation_sent_at", { withTimezone: true }),
  unsubscribeTokenHash: text("unsubscribe_token_hash"),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  suppressedAt: timestamp("suppressed_at", { withTimezone: true }),
  suppressionReason: text("suppression_reason"),
}, (table) => [
  uniqueIndex("marketing_unsubscribe_token_unique").on(table.unsubscribeTokenHash),
]);

export const insertMarketingSubscriptionSchema = createInsertSchema(marketingSubscriptionsTable).omit({ consentedAt: true, verifiedAt: true, confirmationTokenHash: true, confirmationExpiresAt: true, lastConfirmationSentAt: true, unsubscribeTokenHash: true, unsubscribedAt: true, suppressedAt: true, suppressionReason: true });
export type InsertMarketingSubscription = z.infer<typeof insertMarketingSubscriptionSchema>;
export type MarketingSubscription = typeof marketingSubscriptionsTable.$inferSelect;