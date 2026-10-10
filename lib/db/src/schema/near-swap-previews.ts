import { createInsertSchema } from "drizzle-zod";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type NearQuoteInput = { from: string; to: string; amount: string; recipient: string; refundTo: string };
export type NearQuoteToken = {
  id: string;
  symbol: string;
  chain: string;
  chainName: string;
  decimals: number;
  price?: number;
  contractAddress?: string;
  // Added with multi-network origins. Previews saved earlier omit both (and
  // may omit chain); readers must treat such a token as a Solana origin.
  native?: boolean;
  originEligible?: boolean;
};

export const nearSwapPreviewsTable = pgTable("near_swap_previews", {
  quoteId: uuid("quote_id").primaryKey(),
  input: jsonb("input").$type<NearQuoteInput>().notNull(),
  fromAsset: jsonb("from_asset").$type<NearQuoteToken>().notNull(),
  toAsset: jsonb("to_asset").$type<NearQuoteToken>().notNull(),
  units: text("units").notNull(),
  minOut: text("min_out").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  claimedRequestId: uuid("claimed_request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("near_swap_previews_expires_at_idx").on(table.expiresAt),
]);

export const insertNearSwapPreviewSchema = createInsertSchema(nearSwapPreviewsTable).omit({ createdAt: true });
export type InsertNearSwapPreview = z.infer<typeof insertNearSwapPreviewSchema>;
export type StoredNearSwapPreview = typeof nearSwapPreviewsTable.$inferSelect;