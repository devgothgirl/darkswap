import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Sanitized public discovery only: deliberately no creator/ownership attribution.
export const launchCatalog = pgTable("launch_catalog", {
  network: text("network").notNull(),
  mint: text("mint").notNull(),
  token: jsonb("token").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.network, table.mint] }),
  index("launch_catalog_fetched_at_idx").on(table.fetchedAt),
]);