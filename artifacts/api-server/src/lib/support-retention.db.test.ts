import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, beforeEach, test } from "node:test";
import { sql } from "drizzle-orm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.SUPPORT_TEST_DB !== "true"
  || !/^postgresql:\/\/support_test@127\.0\.0\.1:\d+\/postgres$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run via pnpm --filter @workspace/api-server test:support-delivery (temporary local database only).");
}

const { db, pool, supportCasesTable: cases, supportDeliveryEventsTable: events } = await import("@workspace/db");
const { reviewSupportCase, runSupportRetention } = await import("./support-retention");
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");

after(async () => { await pool.end(); });
beforeEach(async () => {
  await db.execute(sql.raw("DROP TRIGGER IF EXISTS support_case_delete_reject ON support_cases"));
  await db.execute(sql.raw("DROP FUNCTION IF EXISTS reject_support_case_delete()"));
  await db.execute(sql`TRUNCATE support_delivery_events, support_cases`);
});

async function addCase(id: string, options: {
  status?: string;
  lifecycle?: string;
  fundReview?: string;
  retentionHold?: boolean;
  providerMessageId?: string | null;
} = {}) {
  await db.insert(cases).values({
    id,
    accessTokenHash: `test-hash-${id}`,
    email: `${id}@example.invalid`,
    report: `Synthetic fixture ${id}`,
    status: options.status ?? "pending",
    lifecycle: options.lifecycle ?? "open",
    fundReview: options.fundReview ?? "unreviewed",
    retentionHold: options.retentionHold ?? false,
    providerMessageId: options.providerMessageId ?? null,
  });
}

async function addEvent(id: string, providerMessageId: string) {
  await db.insert(events).values({ id, providerMessageId, status: "delivered" });
}

async function ageCase(id: string, closedAge: string, updatedAge: string, createdAge?: string) {
  await db.execute(sql`UPDATE support_cases SET
    closed_at = now() - ${closedAge}::interval,
    updated_at = now() - ${updatedAge}::interval
    ${createdAge === undefined ? sql`` : sql`, created_at = now() - ${createdAge}::interval`}
    WHERE id = ${id}`);
}

async function ageEvent(id: string, receivedAge: string) {
  await db.execute(sql`UPDATE support_delivery_events
    SET received_at = now() - ${receivedAge}::interval WHERE id = ${id}`);
}

async function aggregateCounts() {
  const result = await db.execute<{ cases: number; events: number }>(sql`
    SELECT (SELECT count(*)::int FROM support_cases) AS cases,
      (SELECT count(*)::int FROM support_delivery_events) AS events`);
  return result.rows[0]!;
}

function runRetentionCli(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync("pnpm", [
    "--filter", "@workspace/api-server", "support:retention", "--", ...args,
  ], {
    cwd: workspaceRoot,
    env,
    encoding: "utf8",
    timeout: 20_000,
  });
}

test("open delivery states, malformed or unreviewed closures, and held cases are protected", async () => {
  for (const status of ["pending", "delivered", "failed", "unconfirmed"]) {
    const id = `open-${status}`;
    await addCase(id, { status });
    await db.execute(sql`UPDATE support_cases SET created_at = now() - interval '180 days',
      updated_at = now() - interval '180 days' WHERE id = ${id}`);
  }

  for (const [id, fundReview] of [["closed-unreviewed", "unreviewed"], ["closed-unresolved", "unresolved"]] as const) {
    await addCase(id, { lifecycle: "resolved", fundReview });
    await ageCase(id, "180 days", "180 days");
  }
  // The disposable fixture schema deliberately omits production checks; cleanup must still reject malformed rows.
  await addCase("closed-without-time", { lifecycle: "resolved", fundReview: "resolved" });
  await db.execute(sql`UPDATE support_cases SET closed_at = NULL, updated_at = now() - interval '180 days'
    WHERE id = 'closed-without-time'`);
  await addCase("unknown-closed-lifecycle", { lifecycle: "closed", fundReview: "resolved" });
  await ageCase("unknown-closed-lifecycle", "180 days", "180 days");
  await addCase("expired-with-fund-review", { lifecycle: "expired", fundReview: "resolved" });
  await ageCase("expired-with-fund-review", "180 days", "180 days");
  await addCase("held-case", { lifecycle: "resolved", fundReview: "resolved", retentionHold: true });
  await ageCase("held-case", "180 days", "180 days");

  const preview = await runSupportRetention();
  assert.equal(preview.cases, 0);
  assert.equal(preview.linked_events, 0);
  assert.equal(preview.orphan_events, 0);
  const before = await aggregateCounts();
  const applied = await runSupportRetention({ apply: true });
  assert.equal(applied.cases, 0);
  assert.deepEqual(await aggregateCounts(), before);
});

test("case age is measured from closure and last update, and recent linked events protect it", async () => {
  await addCase("eligible-recent-created", { lifecycle: "resolved", fundReview: "resolved" });
  await ageCase("eligible-recent-created", "120 days", "120 days");

  await addCase("closed-but-recently-updated", { lifecycle: "resolved", fundReview: "resolved" });
  await ageCase("closed-but-recently-updated", "120 days", "89 days");

  await addCase("recently-closed", { lifecycle: "resolved", fundReview: "resolved" });
  await ageCase("recently-closed", "89 days", "120 days", "200 days");

  await addCase("recent-event-case", {
    lifecycle: "resolved", fundReview: "resolved", providerMessageId: "recent-event-provider",
  });
  await ageCase("recent-event-case", "120 days", "120 days");
  await addEvent("recent-linked-event", "recent-event-provider");
  await ageEvent("recent-linked-event", "89 days");

  const preview = await runSupportRetention();
  assert.equal(preview.cases, 1);
  const applied = await runSupportRetention({ apply: true });
  assert.equal(applied.cases, 1);
  const remaining = await db.select({ id: cases.id }).from(cases);
  assert.deepEqual(remaining.map(row => row.id).sort(), [
    "closed-but-recently-updated", "recent-event-case", "recently-closed",
  ]);
});

test("expired non-fund and resolved fund-reviewed cases are eligible for cleanup", async () => {
  await addCase("expired-non-fund", { lifecycle: "expired", fundReview: "non-fund" });
  await ageCase("expired-non-fund", "120 days", "120 days");
  await addCase("resolved-fund-reviewed", { lifecycle: "resolved", fundReview: "resolved" });
  await ageCase("resolved-fund-reviewed", "120 days", "120 days");

  const preview = await runSupportRetention();
  assert.equal(preview.cases, 2);
  const applied = await runSupportRetention({ apply: true });
  assert.equal(applied.cases, 2);
  assert.deepEqual(await aggregateCounts(), { cases: 0, events: 0 });
});

test("preview reports aggregate candidates without changing any rows", async () => {
  await addCase("preview-linked-case", {
    lifecycle: "resolved", fundReview: "resolved", providerMessageId: "preview-provider",
  });
  await ageCase("preview-linked-case", "120 days", "120 days");
  await addEvent("preview-linked-old-event", "preview-provider");
  await addEvent("preview-linked-second-old-event", "preview-provider");
  await ageEvent("preview-linked-old-event", "120 days");
  await ageEvent("preview-linked-second-old-event", "120 days");
  await addEvent("preview-old-orphan", "preview-orphan-provider");
  await ageEvent("preview-old-orphan", "40 days");
  await addEvent("preview-young-orphan", "preview-young-orphan-provider");

  const before = await aggregateCounts();
  const result = await runSupportRetention();
  assert.equal(result.mode, "preview");
  assert.equal(result.cases, 1);
  assert.equal(result.linked_events, 2);
  assert.equal(result.orphan_events, 1);
  assert.equal(result.orphan_cleanup_blocked, false);
  assert.deepEqual(await aggregateCounts(), before);
});

test("apply removes eligible cases with linked events and only old unlinked orphans", async () => {
  await addCase("apply-eligible", {
    lifecycle: "resolved", fundReview: "resolved", providerMessageId: "apply-provider",
  });
  await ageCase("apply-eligible", "120 days", "120 days");
  await addEvent("apply-linked-one", "apply-provider");
  await addEvent("apply-linked-two", "apply-provider");
  await ageEvent("apply-linked-one", "120 days");
  await ageEvent("apply-linked-two", "120 days");
  await addEvent("apply-old-orphan", "apply-orphan-provider");
  await ageEvent("apply-old-orphan", "40 days");
  await addEvent("apply-recent-orphan", "apply-recent-provider");

  const result = await runSupportRetention({ apply: true });
  assert.equal(result.mode, "delete");
  assert.equal(result.cases, 1);
  assert.equal(result.linked_events, 2);
  assert.equal(result.orphan_events, 1);
  assert.deepEqual(await aggregateCounts(), { cases: 0, events: 1 });
  const [remainingEvent] = await db.select({ id: events.id }).from(events);
  assert.equal(remainingEvent.id, "apply-recent-orphan");
});

test("any open unlinked case blocks deletion of all old unlinked events", async () => {
  await addCase("closed-unlinked-case", { lifecycle: "resolved", fundReview: "non-fund" });
  await ageCase("closed-unlinked-case", "120 days", "120 days");
  await addCase("open-unlinked-case");
  await addEvent("blocked-old-orphan", "blocked-provider");
  await ageEvent("blocked-old-orphan", "40 days");

  const preview = await runSupportRetention();
  assert.equal(preview.cases, 1);
  assert.equal(preview.orphan_events, 0);
  assert.equal(preview.orphan_cleanup_blocked, true);
  const applied = await runSupportRetention({ apply: true });
  assert.equal(applied.cases, 1);
  assert.equal(applied.orphan_events, 0);
  assert.equal(applied.orphan_cleanup_blocked, true);
  assert.deepEqual(await aggregateCounts(), { cases: 1, events: 1 });
});

test("cleanup is bounded per batch and becomes idempotent when all candidates are removed", async () => {
  for (const suffix of ["a", "b", "c"]) {
    const provider = `bounded-provider-${suffix}`;
    await addCase(`bounded-case-${suffix}`, {
      lifecycle: "resolved", fundReview: "non-fund", providerMessageId: provider,
    });
    await ageCase(`bounded-case-${suffix}`, "120 days", "120 days");
    await addEvent(`bounded-linked-${suffix}`, provider);
    await ageEvent(`bounded-linked-${suffix}`, "120 days");
    await addEvent(`bounded-orphan-${suffix}`, `bounded-orphan-provider-${suffix}`);
    await ageEvent(`bounded-orphan-${suffix}`, "40 days");
  }

  const first = await runSupportRetention({ apply: true, limit: 2 });
  assert.equal(first.limit, 2);
  assert.equal(first.cases, 2);
  assert.equal(first.linked_events, 2);
  assert.equal(first.orphan_events, 2);
  assert.deepEqual(await aggregateCounts(), { cases: 1, events: 2 });

  const second = await runSupportRetention({ apply: true, limit: 2 });
  assert.equal(second.cases, 1);
  assert.equal(second.linked_events, 1);
  assert.equal(second.orphan_events, 1);
  assert.deepEqual(await aggregateCounts(), { cases: 0, events: 0 });

  const repeated = await runSupportRetention({ apply: true, limit: 2 });
  assert.equal(repeated.cases, 0);
  assert.equal(repeated.linked_events, 0);
  assert.equal(repeated.orphan_events, 0);
  await assert.rejects(runSupportRetention({ limit: 0 }), /Limit must be an integer/);
  await assert.rejects(runSupportRetention({ apply: true, limit: 1001 }), /Limit must be an integer/);
});

test("closure validation fails safely and reopening requires a new fund review without clearing hold", async () => {
  await addCase("review-case");

  await assert.rejects(reviewSupportCase({
    id: "review-case", action: "close", outcome: "expired", fundReview: "resolved",
  }), /Closure requires reviewed resolution/);
  await assert.rejects(reviewSupportCase({
    id: "review-case", action: "close", outcome: "resolved", fundReview: "unreviewed",
  } as never), /Closure requires reviewed resolution/);
  await assert.rejects(reviewSupportCase({
    id: "review-case", action: "close", fundReview: "resolved",
  } as never), /Closure requires reviewed resolution/);
  await assert.rejects(reviewSupportCase({
    id: "review-case", action: "close", outcome: "resolved",
  } as never), /Closure requires reviewed resolution/);
  await assert.rejects(reviewSupportCase({
    id: "review-case", action: "close", outcome: "unknown", fundReview: "resolved",
  } as never), /Closure requires reviewed resolution/);
  await assert.rejects(reviewSupportCase({
    id: "missing-review-case", action: "close", outcome: "resolved", fundReview: "resolved",
  }), /Case not found/);

  await reviewSupportCase({
    id: "review-case", action: "close", outcome: "resolved", fundReview: "resolved",
  });
  await reviewSupportCase({ id: "review-case", action: "hold", enabled: true });
  await reviewSupportCase({ id: "review-case", action: "reopen" });
  const [reopened] = await db.select().from(cases).where(sql`${cases.id} = 'review-case'`);
  assert.equal(reopened.lifecycle, "open");
  assert.equal(reopened.fundReview, "unreviewed");
  assert.equal(reopened.closedAt, null);
  assert.equal(reopened.retentionHold, true);
});

test("documented pnpm preview command uses the disposable DB and emits aggregate counts only", async () => {
  await addCase("cli-preview-case", {
    lifecycle: "resolved", fundReview: "resolved", providerMessageId: "cli-preview-provider",
  });
  await ageCase("cli-preview-case", "120 days", "120 days");
  await addEvent("cli-preview-linked-event", "cli-preview-provider");
  await ageEvent("cli-preview-linked-event", "120 days");
  await addEvent("cli-preview-orphan-event", "cli-preview-orphan-provider");
  await ageEvent("cli-preview-orphan-event", "40 days");

  const result = runRetentionCli(["preview"]);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  const outputLine = result.stdout.split(/\r?\n/).find(line => line.trimStart().startsWith("{"));
  assert.ok(outputLine, "CLI should print its aggregate JSON result");
  const output = JSON.parse(outputLine);
  assert.equal(output.mode, "preview");
  assert.equal(output.cases, 1);
  assert.equal(output.linked_events, 1);
  assert.equal(output.orphan_events, 1);
  assert.equal(output.orphan_cleanup_blocked, false);
  assert.equal("id" in output, false);
  assert.equal("email" in output, false);
  assert.equal("report" in output, false);
});

test("documented pnpm close, hold, and reopen commands succeed", async () => {
  await addCase("cli-review-case");

  const closed = runRetentionCli([
    "close", "--case-id", "cli-review-case", "--outcome", "resolved",
    "--fund-review", "resolved", "--confirm-reviewed",
  ]);
  assert.equal(closed.error, undefined, closed.error?.message);
  assert.equal(closed.status, 0, closed.stderr);

  const held = runRetentionCli([
    "hold", "--case-id", "cli-review-case", "--enabled", "true", "--confirm-reviewed",
  ]);
  assert.equal(held.error, undefined, held.error?.message);
  assert.equal(held.status, 0, held.stderr);

  const reopened = runRetentionCli(["reopen", "--case-id", "cli-review-case", "--confirm-reviewed"]);
  assert.equal(reopened.error, undefined, reopened.error?.message);
  assert.equal(reopened.status, 0, reopened.stderr);
  const [record] = await db.select().from(cases).where(sql`${cases.id} = 'cli-review-case'`);
  assert.equal(record.lifecycle, "open");
  assert.equal(record.fundReview, "unreviewed");
  assert.equal(record.closedAt, null);
  assert.equal(record.retentionHold, true);
});

test("apply waits for a conflicting support-table lock before deleting", async () => {
  await addCase("lock-eligible", { lifecycle: "resolved", fundReview: "resolved" });
  await ageCase("lock-eligible", "120 days", "120 days");

  const client = await pool.connect();
  let transactionOpen = false;
  let pending: Promise<Awaited<ReturnType<typeof runSupportRetention>>> | undefined;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("LOCK TABLE support_cases, support_delivery_events IN SHARE ROW EXCLUSIVE MODE");
    let settled = false;
    pending = runSupportRetention({ apply: true });
    void pending.then(() => { settled = true; }, () => { settled = true; });
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
    assert.equal(settled, false, "cleanup should wait behind the operator table lock");
    assert.equal((await aggregateCounts()).cases, 1);

    await client.query("COMMIT");
    transactionOpen = false;
    const result = await pending;
    assert.equal(result.cases, 1);
    assert.deepEqual(await aggregateCounts(), { cases: 0, events: 0 });
  } finally {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pending?.catch(() => undefined);
  }
});

test("a case deletion failure rolls back its linked-event deletion", async () => {
  await addCase("rollback-case", {
    lifecycle: "resolved", fundReview: "resolved", providerMessageId: "rollback-provider",
  });
  await ageCase("rollback-case", "120 days", "120 days");
  await addEvent("rollback-linked-event", "rollback-provider");
  await ageEvent("rollback-linked-event", "120 days");

  await db.execute(sql.raw(`CREATE FUNCTION reject_support_case_delete() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic test rejection'; END; $$`));
  await db.execute(sql.raw(`CREATE TRIGGER support_case_delete_reject BEFORE DELETE ON support_cases
    FOR EACH ROW EXECUTE FUNCTION reject_support_case_delete()`));
  try {
    await assert.rejects(runSupportRetention({ apply: true }));
    assert.deepEqual(await aggregateCounts(), { cases: 1, events: 1 });
  } finally {
    await db.execute(sql.raw("DROP TRIGGER IF EXISTS support_case_delete_reject ON support_cases"));
    await db.execute(sql.raw("DROP FUNCTION IF EXISTS reject_support_case_delete()"));
  }
});

test("unconfirmed cleanup CLI fails without a database connection", () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.SUPPORT_TEST_DB;
  const result = runRetentionCli(["cleanup"], env);
  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Deletion is irreversible/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /"mode":"delete"/);
});