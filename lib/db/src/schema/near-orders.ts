import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nearOrdersTable = pgTable("near_orders", {
  id: uuid("id").primaryKey(),
  quoteId: uuid("quote_id").notNull(),
  state: text("state").notNull(),
  depositAddress: text("deposit_address"),
  providerResponse: jsonb("provider_response"),
  orderDetails: jsonb("order_details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNearOrderSchema = createInsertSchema(nearOrdersTable).omit({ createdAt: true });
export type InsertNearOrder = z.infer<typeof insertNearOrderSchema>;
export type StoredNearOrder = typeof nearOrdersTable.$inferSelect;