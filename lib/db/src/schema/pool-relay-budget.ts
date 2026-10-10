import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Service-wide rolling free-send budget. One bounded row per chain; no
// addresses, proofs, nullifiers, request identities or transaction hashes.
export const poolRelayBudgetTable = pgTable("pool_relay_budget", {
  chain: text("chain").primaryKey(),
  usedAt: timestamp("used_at", { withTimezone: true }).array().notNull(),
});
