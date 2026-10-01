import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rewardsAccountsTable } from "./rewards";

export const privateSwapOrderClaimsTable = pgTable("private_swap_order_claims", {
  quoteHash: text("quote_hash").primaryKey(),
  recipientHash: text("recipient_hash").notNull(),
  state: text("state").notNull(),
  response: jsonb("response"),
  providerRequest: jsonb("provider_request"),
  providerResponse: jsonb("provider_response"),
  rewardsAccountDid: text("rewards_account_did").references(() => rewardsAccountsTable.privyDid),
  rewardsCheckedAt: timestamp("rewards_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPrivateSwapOrderClaimSchema = createInsertSchema(privateSwapOrderClaimsTable);
export type InsertPrivateSwapOrderClaim = z.infer<typeof insertPrivateSwapOrderClaimSchema>;
export type StoredPrivateSwapOrderClaim = typeof privateSwapOrderClaimsTable.$inferSelect;
