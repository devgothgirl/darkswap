import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Public record of the shielded pools (TESTNET), cached so browsers do not
// scan a chain from its deployment on every load. Browsers rebuild the tree
// from these rows and check its root against the chain before proving.
// Nothing here identifies a user: only on-chain commitments, nullifiers and fees.

export const poolCommitmentsTable = pgTable("pool_commitments", {
  chain: text("chain").notNull(),
  index: integer("index").notNull(),
  commitment: text("commitment").notNull(),
  encryptedOutput: text("encrypted_output").notNull(),
  tx: text("tx").notNull(),
}, (table) => [primaryKey({ columns: [table.chain, table.index] })]);

export const poolNullifiersTable = pgTable("pool_nullifiers", {
  chain: text("chain").notNull(),
  nullifier: text("nullifier").notNull(),
  tx: text("tx").notNull(),
}, (table) => [primaryKey({ columns: [table.chain, table.nullifier] })]);

// kind: "shield" | "unshield" (charged) or "collected" (swept to the fee recipient).
export const poolFeesTable = pgTable("pool_fees", {
  chain: text("chain").notNull(),
  token: text("token").notNull(),
  kind: text("kind").notNull(),
  amount: text("amount").notNull(),
  tx: text("tx").notNull(),
  // Position of the fee inside its transaction, so re-indexing stays idempotent.
  position: integer("position").notNull(),
}, (table) => [
  primaryKey({ columns: [table.chain, table.tx, table.position] }),
  index("pool_fees_chain_token_idx").on(table.chain, table.token),
]);

// One row per public pool action, so a month of real testnet usage can be
// summarised without scanning a chain again. kind: "shield" | "unshield" |
// "deposit" (added to existing notes) | "send" (private, no external amount) |
// "unreadable" (an action the indexer saw but could not read the amounts of,
// kept so a month reports the gap instead of understating itself).
// `amount` is the external amount in the token's base units, which the chain
// already publishes; `relayerFee` is what the sender paid a relayer in that
// same asset, 0 when the sender submitted the transaction itself. Sends carry
// no token and no amount. Nothing here identifies a user.
export const poolActivityTable = pgTable("pool_activity", {
  chain: text("chain").notNull(),
  tx: text("tx").notNull(),
  // Position inside the transaction, so re-indexing stays idempotent.
  position: integer("position").notNull(),
  kind: text("kind").notNull(),
  token: text("token").notNull(),
  amount: text("amount").notNull(),
  relayerFee: text("relayer_fee").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.chain, table.tx, table.position] }),
  index("pool_activity_chain_time_idx").on(table.chain, table.occurredAt),
]);

// Indexer cursor per chain: last EVM block or newest Solana signature read,
// plus the listed assets and fee rate seen so far.
export const poolSyncTable = pgTable("pool_sync", {
  chain: text("chain").primaryKey(),
  cursor: text("cursor"),
  nextIndex: integer("next_index").notNull().default(0),
  root: text("root"),
  state: jsonb("state").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
