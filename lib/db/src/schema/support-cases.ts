import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Support cases are independent of marketing consent and delivery health.
// Access tokens are stored only as hashes; report details are retained for manual recovery.
export const supportCasesTable = pgTable("support_cases", {
  id: text("id").primaryKey(),
  accessTokenHash: text("access_token_hash").notNull(),
  email: text("email").notNull(),
  report: text("report").notNull(),
  status: text("status").notNull(),
  // Delivery is not resolution. Legacy and new reports stay protected until reviewed.
  lifecycle: text("lifecycle").notNull().default("open"),
  fundReview: text("fund_review").notNull().default("unreviewed"),
  retentionHold: boolean("retention_hold").notNull().default(false),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  providerMessageId: text("provider_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("support_case_access_token_idx").on(table.accessTokenHash),
  uniqueIndex("support_case_provider_idx").on(table.providerMessageId),
  index("support_case_retention_idx").on(table.lifecycle, table.closedAt),
  check("support_case_lifecycle_check", sql`${table.lifecycle} IN ('open', 'resolved', 'expired')`),
  check("support_case_fund_review_check", sql`${table.fundReview} IN ('unreviewed', 'unresolved', 'resolved', 'non-fund')`),
  check("support_case_closure_check", sql`(${table.lifecycle} = 'open' AND ${table.closedAt} IS NULL) OR
    (${table.lifecycle} = 'resolved' AND ${table.closedAt} IS NOT NULL AND ${table.fundReview} IN ('resolved', 'non-fund')) OR
    (${table.lifecycle} = 'expired' AND ${table.closedAt} IS NOT NULL AND ${table.fundReview} = 'non-fund')`),
]);

// An event may beat the provider's send response. Keep it until the case can be linked.
export const supportDeliveryEventsTable = pgTable("support_delivery_events", {
  id: text("id").primaryKey(),
  providerMessageId: text("provider_message_id").notNull(),
  status: text("status").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("support_event_provider_idx").on(table.providerMessageId),
  index("support_event_received_idx").on(table.receivedAt),
]);