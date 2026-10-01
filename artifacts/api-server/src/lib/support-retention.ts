import { and, eq, sql } from "drizzle-orm";
import { db, supportCasesTable as cases } from "@workspace/db";

// Operator-approved on 2026-09-30. No time-based expiry of open cases.
export const SUPPORT_RETENTION = Object.freeze({ closedDays: 90, orphanDays: 30 });
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockSupport(tx: Transaction) {
  await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
  await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
  // Stable order, shared with all operator mutations. Blocks send-link/webhook
  // writes until deletion commits, so an event cannot become linked mid-cleanup.
  await tx.execute(sql`LOCK TABLE support_cases, support_delivery_events IN SHARE ROW EXCLUSIVE MODE`);
}

export async function reviewSupportCase(input: {
  id: string;
  action: "close" | "reopen" | "hold";
  outcome?: "resolved" | "expired";
  fundReview?: "resolved" | "non-fund";
  enabled?: boolean;
}) {
  if (!input.id || input.id.length > 200) throw new Error("A valid case ID is required.");
  if (input.action === "close" && (!["resolved", "expired"].includes(input.outcome ?? "")
    || !["resolved", "non-fund"].includes(input.fundReview ?? "")
    || (input.outcome === "expired" && input.fundReview !== "non-fund"))) {
    throw new Error("Closure requires reviewed resolution; only non-fund cases can expire.");
  }
  if (!["close", "reopen", "hold"].includes(input.action)
    || (input.action === "hold" && typeof input.enabled !== "boolean")) {
    throw new Error("Invalid operator action.");
  }
  return db.transaction(async tx => {
    await lockSupport(tx);
    const [record] = await tx.select({ lifecycle: cases.lifecycle }).from(cases).where(eq(cases.id, input.id));
    if (!record) throw new Error("Case not found; no changes made.");
    if (input.action === "close" && record.lifecycle !== "open") {
      throw new Error("Case is already closed. Reopen and review it before closing again.");
    }
    const now = new Date();
    if (input.action === "close") {
      await tx.update(cases).set({
        lifecycle: input.outcome, fundReview: input.fundReview, closedAt: now, updatedAt: now,
      }).where(and(eq(cases.id, input.id), eq(cases.lifecycle, "open")));
    } else if (input.action === "reopen") {
      // Re-review is required; never preserve an old assertion that funds were resolved.
      await tx.update(cases).set({
        lifecycle: "open", fundReview: "unreviewed", closedAt: null, updatedAt: now,
      }).where(eq(cases.id, input.id));
    } else {
      await tx.update(cases).set({ retentionHold: input.enabled, updatedAt: now }).where(eq(cases.id, input.id));
    }
    return { action: input.action, changed: 1 };
  });
}

// Used for both preview and deletion; no content, email or token is selected.
const eligibleCases = (cutoff: string, limit: number) => sql`
  SELECT c.id, c.provider_message_id FROM support_cases c
  WHERE c.lifecycle IN ('resolved', 'expired')
    AND c.fund_review IN ('resolved', 'non-fund')
    AND (c.lifecycle <> 'expired' OR c.fund_review = 'non-fund')
    AND c.retention_hold = false AND c.closed_at < ${cutoff}::timestamptz
    AND c.updated_at < ${cutoff}::timestamptz
    AND NOT EXISTS (SELECT 1 FROM support_delivery_events e
      WHERE e.provider_message_id = c.provider_message_id AND e.received_at >= ${cutoff}::timestamptz)
  ORDER BY c.closed_at, c.id LIMIT ${limit}`;

const eligibleOrphans = (cutoff: string, limit: number) => sql`
  SELECT e.id FROM support_delivery_events e
  WHERE e.received_at < ${cutoff}::timestamptz
    AND NOT EXISTS (SELECT 1 FROM support_cases c WHERE c.provider_message_id = e.provider_message_id)
    AND NOT EXISTS (SELECT 1 FROM support_cases c WHERE c.lifecycle = 'open' AND c.provider_message_id IS NULL)
  ORDER BY e.received_at, e.id LIMIT ${limit}`;

export async function runSupportRetention(options: { apply?: boolean; limit?: number } = {}) {
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Limit must be an integer from 1 to 1000.");
  return db.transaction(async tx => {
    if (options.apply) await lockSupport(tx);
    else await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`);
    // PostgreSQL clock, not operator-supplied/backdated timestamps.
    const clock = await tx.execute<{ closed_cutoff: string; orphan_cutoff: string }>(sql`
      SELECT (now() - interval '90 days')::text AS closed_cutoff,
        (now() - interval '30 days')::text AS orphan_cutoff`);
    const { closed_cutoff: closedCutoff, orphan_cutoff: orphanCutoff } = clock.rows[0]!;
    const candidateCases = eligibleCases(closedCutoff, limit);
    const candidateOrphans = eligibleOrphans(orphanCutoff, limit);
    const counts = await tx.execute<{ cases: number; linked_events: number; orphan_events: number; orphan_cleanup_blocked: boolean }>(sql`
      WITH eligible AS (${candidateCases}), orphans AS (${candidateOrphans})
      SELECT (SELECT count(*)::int FROM eligible) AS cases,
        (SELECT count(*)::int FROM support_delivery_events e
          JOIN eligible c ON c.provider_message_id = e.provider_message_id) AS linked_events,
        (SELECT count(*)::int FROM orphans) AS orphan_events,
        EXISTS (SELECT 1 FROM support_cases WHERE lifecycle = 'open' AND provider_message_id IS NULL) AS orphan_cleanup_blocked`);
    const result = { mode: options.apply ? "delete" : "preview", policy: SUPPORT_RETENTION,
      limit, closedCutoff, orphanCutoff, ...counts.rows[0]! };
    if (!options.apply) return result;
    // Capture bounded candidate IDs in memory; locks prevent changed eligibility.
    const selected = await tx.execute<{ id: string; provider_message_id: string | null }>(candidateCases);
    const orphanRows = await tx.execute<{ id: string }>(candidateOrphans);
    const ids = selected.rows.map(row => row.id);
    const providers = selected.rows.map(row => row.provider_message_id).filter((id): id is string => id !== null);
    if (providers.length) await tx.execute(sql`DELETE FROM support_delivery_events
      WHERE provider_message_id IN (${sql.join(providers.map(id => sql`${id}`), sql`, `)})`);
    if (ids.length) await tx.execute(sql`DELETE FROM support_cases WHERE id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
    if (orphanRows.rows.length) await tx.execute(sql`DELETE FROM support_delivery_events
      WHERE id IN (${sql.join(orphanRows.rows.map(row => sql`${row.id}`), sql`, `)})`);
    return result;
  });
}