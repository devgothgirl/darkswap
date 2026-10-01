import { pgTable, text, timestamp, integer, jsonb, boolean, doublePrecision, index } from "drizzle-orm/pg-core";

const time = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const incentives = () => ({
  darkPair: boolean("dark_pair"),
  darkPoints: doublePrecision("dark_points"),
  referralVolume: doublePrecision("referral_volume"),
  creatorScore: doublePrecision("creator_score"),
  campaignEligible: boolean("campaign_eligible"),
  builderEligible: boolean("builder_eligible"),
  incentiveState: text("incentive_state").notNull().default("planned"),
});
export const launchChallenges = pgTable("launch_challenges", {
  id: text("id").primaryKey(), wallet: text("wallet").notNull(), network: text("network").notNull(),
  origin: text("origin").notNull(), browserHash: text("browser_hash").notNull(),
  message: text("message").notNull(), expiresAt: time("expires_at"), consumedAt: timestamp("consumed_at", { withTimezone: true }),
});
export const launchSessions = pgTable("launch_sessions", {
  tokenHash: text("token_hash").primaryKey(), wallet: text("wallet").notNull(), origin: text("origin").notNull(),
  network: text("network").notNull(), csrfToken: text("csrf_token").notNull(), expiresAt: time("expires_at"),
  createdAt: time("created_at"), revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
export const launchDrafts = pgTable("launch_drafts", {
  id: text("id").primaryKey(), wallet: text("wallet").notNull(), input: jsonb("input").notNull(),
  status: text("status").notNull().default("preparation_ready"), revision: integer("revision").notNull().default(1),
  createdAt: time("created_at"), updatedAt: time("updated_at"), ...incentives(),
}, table => [index("launch_drafts_owner_idx").on(table.wallet)]);
export const launchLogos = pgTable("launch_logos", {
  id: text("id").primaryKey(), wallet: text("wallet").notNull(), uploadPath: text("upload_path").notNull(),
  safePath: text("safe_path"), contentType: text("content_type").notNull(), declaredSize: integer("declared_size").notNull(),
  safeSize: integer("safe_size"), width: integer("width"), height: integer("height"),
  expiresAt: time("expires_at"), createdAt: time("created_at"), completedAt: timestamp("completed_at", { withTimezone: true }),
}, table => [index("launch_logos_owner_idx").on(table.wallet)]);
export const launchConfiguration = pgTable("launch_configuration", {
  id: text("id").primaryKey(), input: jsonb("input").notNull(), updatedAt: time("updated_at"),
});
export const launchReviews = pgTable("launch_reviews", {
  id: text("id").primaryKey(), target: text("target").notNull(), targetType: text("target_type").notNull(),
  network: text("network").notNull(), status: text("status").notNull().default("under_review"),
  input: jsonb("input").notNull(), createdBy: text("created_by").notNull(), createdAt: time("created_at"),
}, table => [index("launch_reviews_target_idx").on(table.network, table.target)]);
export const launchAudit = pgTable("launch_audit", {
  id: text("id").primaryKey(), actorWallet: text("actor_wallet").notNull(), action: text("action").notNull(),
  targetId: text("target_id"), summary: text("summary").notNull(), createdAt: time("created_at"),
});
export const launchCreatorEvidence = pgTable("launch_creator_evidence", {
  id: text("id").primaryKey(), wallet: text("wallet").notNull(), mint: text("mint").notNull(),
  network: text("network").notNull(), evidenceUrl: text("evidence_url").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }), token: jsonb("token"),
  createdAt: time("created_at"), ...incentives(),
}, table => [index("launch_creator_owner_idx").on(table.wallet)]);