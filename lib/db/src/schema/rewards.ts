import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rewardsAccountsTable = pgTable("rewards_accounts", {
  privyDid: text("privy_did").primaryKey(),
  email: text("email").unique(),
  enrolled: boolean("enrolled").notNull().default(false),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rewardsLedgerTable = pgTable("rewards_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountDid: text("account_did").notNull().references(() => rewardsAccountsTable.privyDid),
  points: integer("points").notNull(),
  reason: text("reason").notNull(),
  route: text("route"),
  orderReference: text("order_reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("rewards_ledger_terminal_order_unique")
    .on(table.route, table.orderReference)
    .where(sql`${table.route} IS NOT NULL AND ${table.orderReference} IS NOT NULL AND ${table.reason} IN ('swap_completed', 'swap_capped')`),
  uniqueIndex("rewards_ledger_reversal_unique")
    .on(table.route, table.orderReference)
    .where(sql`${table.route} IS NOT NULL AND ${table.orderReference} IS NOT NULL AND ${table.reason} = 'swap_reversed'`),
]);

export const insertRewardsAccountSchema = createInsertSchema(rewardsAccountsTable);
export type InsertRewardsAccount = z.infer<typeof insertRewardsAccountSchema>;
export type RewardsAccount = typeof rewardsAccountsTable.$inferSelect;
export type RewardsLedgerEntry = typeof rewardsLedgerTable.$inferSelect;