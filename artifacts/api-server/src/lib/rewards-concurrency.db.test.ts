import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@privy-io/server-auth";

if (process.env.REWARDS_CAP_TEST_DB !== "true") {
  throw new Error("Rewards concurrency tests require their isolated test database");
}

const { db, pool, rewardsAccountsTable, rewardsLedgerTable } = await import("@workspace/db");
const { and, eq } = await import("drizzle-orm");
const { GetRewardsMeResponse } = await import("@workspace/api-zod");
const { houdiniRewardResult, recordRewardsTerminalResult, rewardsMe, verifiedPrivyEmail } = await import("./rewards");
const accountDid = "did:privy:rewards-concurrency-test";

test("Privy linked email is recognized without optional verification metadata", () => {
  const user = {
    id: accountDid,
    linkedAccounts: [{ type: "email", address: " Rewards@Example.com " }],
  } as User;
  assert.equal(verifiedPrivyEmail(user), "rewards@example.com");
});

test("Houdini rewards use numeric v2 terminal statuses only", () => {
  assert.equal(houdiniRewardResult(4), "complete");
  assert.equal(houdiniRewardResult(6), "reverse");
  assert.equal(houdiniRewardResult(7), "reverse");
  for (const status of [5, 8, "4", "FINISHED", undefined]) {
    assert.equal(houdiniRewardResult(status), undefined);
  }
});

test("concurrent completion pollers enforce duplicate, cap, and terminal decision limits", async () => {
  await db.insert(rewardsAccountsTable).values({
    privyDid: accountDid,
    enrolled: true,
  });
  try {
    await Promise.all([
      ...Array.from({ length: 20 }, () => recordRewardsTerminalResult(accountDid, "houdini", "same-provider-order", "complete")),
      ...Array.from({ length: 5 }, (_, index) =>
        recordRewardsTerminalResult(accountDid, "near", `near-order-${index}`, "complete")),
    ]);

    let ledger = await db.select().from(rewardsLedgerTable).where(and(
      eq(rewardsLedgerTable.accountDid, accountDid),
    ));
    const awards = ledger.filter((entry) => entry.reason === "swap_completed");
    const capped = ledger.filter((entry) => entry.reason === "swap_capped");
    assert.equal(awards.reduce((total, entry) => total + entry.points, 0), 300);
    assert.equal(awards.length, 3);
    assert.equal(capped.length, 3);
    assert.equal(ledger.filter((entry) => entry.orderReference === "same-provider-order").length, 1);

    const tomorrow = new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate() + 1,
    ));
    await Promise.all(capped.map((entry) =>
      recordRewardsTerminalResult(accountDid, entry.route as "houdini" | "near", entry.orderReference!, "complete", tomorrow)));
    await recordRewardsTerminalResult(accountDid, "near", "fresh-next-day-order", "complete", tomorrow);
    ledger = await db.select().from(rewardsLedgerTable).where(and(
      eq(rewardsLedgerTable.accountDid, accountDid),
    ));
    assert.equal(ledger.filter((entry) => entry.reason === "swap_capped").length, 3);
    assert.equal(ledger.filter((entry) => entry.reason === "swap_completed").length, 4);
    assert.equal(ledger.filter((entry) => entry.orderReference === "fresh-next-day-order")[0]?.points, 100);

    const reversed = ledger.find((entry) => entry.reason === "swap_completed")!;
    assert.ok(reversed.route === "houdini" || reversed.route === "near");
    assert.ok(reversed.orderReference);
    await Promise.all(Array.from({ length: 10 }, () =>
      recordRewardsTerminalResult(accountDid, reversed.route as "houdini" | "near", reversed.orderReference!, "reverse")));
    ledger = await db.select().from(rewardsLedgerTable)
      .where(eq(rewardsLedgerTable.accountDid, accountDid));
    assert.equal(ledger.filter((entry) => entry.reason === "swap_reversed").length, 1);
    assert.equal(ledger.reduce((total, entry) => total + entry.points, 0), 300);

    const view = await rewardsMe({ did: accountDid, email: "rewards@example.com" }, undefined, 25);
    assert.deepEqual(view.tier, { id: "starter", name: "Starter", threshold: 0, version: 1 });
    assert.deepEqual(view.ruleConfig, {
      version: 1,
      pointsPerCompletedSwap: 100,
      dailyCap: 300,
      dailyCapPeriod: "utc_day",
      tiers: [
        { id: "starter", name: "Starter", threshold: 0 },
        { id: "plus", name: "Plus", threshold: 500 },
        { id: "pro", name: "Pro", threshold: 2000 },
      ],
    });
    assert.doesNotThrow(() => GetRewardsMeResponse.parse(view));
  } finally {
    await db.delete(rewardsLedgerTable).where(eq(rewardsLedgerTable.accountDid, accountDid));
    await db.delete(rewardsAccountsTable).where(eq(rewardsAccountsTable.privyDid, accountDid));
    await pool.end();
  }
});