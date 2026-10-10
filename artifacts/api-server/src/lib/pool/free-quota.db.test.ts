import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { readFile } from "node:fs/promises";
import { after, beforeEach, test } from "node:test";
import { pool } from "@workspace/db";
import { freePerWindow, takeFreeSlot } from "./free-quota";
import { RelayError } from "./relay-error";

const status = (code: number) => (err: unknown) => err instanceof RelayError && err.status === code;

beforeEach(async () => {
  await pool.query("TRUNCATE pool_relay_budget");
  process.env.POOL_RELAY_FREE_PER_10_MIN = "3";
});
after(async () => { await pool.end(); });

function replica(): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const child = fork(new URL("./free-quota.worker.ts", import.meta.url), [], {
      execArgv: process.execArgv.filter((arg) => arg !== "--test"),
      env: { ...process.env, POOL_RELAY_FREE_PER_10_MIN: "7" },
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    let statuses: number[] | undefined;
    child.on("message", (value) => { statuses = value as number[]; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0 || !statuses) reject(new Error(`Quota worker exited with ${code}`));
      else resolve(statuses);
    });
  });
}

test("concurrent independent replicas share one quota; a restarted replica cannot reset it", async () => {
  const statuses = (await Promise.all(Array.from({ length: 4 }, replica))).flat();
  assert.equal(statuses.filter((code) => code === 200).length, 7);
  assert.equal(statuses.filter((code) => code === 429).length, 41);
  assert.deepEqual(await replica(), Array(12).fill(429));
  const { rows } = await pool.query("SELECT cardinality(used_at) AS count FROM pool_relay_budget WHERE chain = 'replica-test'");
  assert.equal(rows[0].count, 7);
});

test("chains have separate budgets and exhaustion returns 429", async () => {
  for (let i = 0; i < 3; i++) await takeFreeSlot("evm");
  await assert.rejects(takeFreeSlot("evm"), status(429));
  await takeFreeSlot("solana");
});

test("rolling expiry prunes old reservations, keeps recent ones, and bounds storage", async () => {
  await pool.query(`
    INSERT INTO pool_relay_budget VALUES ('rolling', ARRAY[
      clock_timestamp() - interval '11 minutes',
      clock_timestamp() - interval '9 minutes',
      clock_timestamp() - interval '1 minute'
    ])
  `);
  await takeFreeSlot("rolling");
  await assert.rejects(takeFreeSlot("rolling"), status(429));
  const { rows } = await pool.query("SELECT cardinality(used_at) AS count FROM pool_relay_budget WHERE chain = 'rolling'");
  assert.equal(rows[0].count, 3);
  await pool.query("UPDATE pool_relay_budget SET used_at = ARRAY[clock_timestamp() - interval '11 minutes'] WHERE chain = 'rolling'");
  await takeFreeSlot("rolling");
  const pruned = await pool.query("SELECT cardinality(used_at) AS count FROM pool_relay_budget WHERE chain = 'rolling'");
  assert.equal(pruned.rows[0].count, 1);
});

test("default is 30, zero disables free sends, and invalid limits fail closed", async () => {
  delete process.env.POOL_RELAY_FREE_PER_10_MIN;
  assert.equal(freePerWindow(), 30);
  process.env.POOL_RELAY_FREE_PER_10_MIN = "0";
  await assert.rejects(takeFreeSlot("disabled"), status(429));
  for (const raw of ["", "NaN", "Infinity", "-1", "1.5", "1e2", "9007199254740992"]) {
    process.env.POOL_RELAY_FREE_PER_10_MIN = raw;
    await assert.rejects(takeFreeSlot("invalid"), status(503));
  }
  const { rows } = await pool.query("SELECT count(*)::int AS count FROM pool_relay_budget");
  assert.equal(rows[0].count, 0);
});

test("lowering the configured limit does not erase existing reservations", async () => {
  await takeFreeSlot("lowered");
  await takeFreeSlot("lowered");
  process.env.POOL_RELAY_FREE_PER_10_MIN = "1";
  await assert.rejects(takeFreeSlot("lowered"), status(429));
  const { rows } = await pool.query("SELECT cardinality(used_at) AS count FROM pool_relay_budget WHERE chain = 'lowered'");
  assert.equal(rows[0].count, 2);
});

test("expiry uses the database clock after a row-lock wait, not replica time", async () => {
  process.env.POOL_RELAY_FREE_PER_10_MIN = "1";
  const blocker = await pool.connect();
  const originalNow = Date.now;
  let pending: Promise<void> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("INSERT INTO pool_relay_budget VALUES ('waiting', ARRAY[clock_timestamp() - interval '599.8 seconds'])");
    // The reservation will wait for this uncommitted row; by commit its
    // timestamp has expired. Skew the caller's clock far into the past too.
    Date.now = () => 0;
    pending = takeFreeSlot("waiting");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await blocker.query("COMMIT");
    await pending;
    await assert.rejects(takeFreeSlot("waiting"), status(429));
  } finally {
    Date.now = originalNow;
    await blocker.query("ROLLBACK");
    blocker.release();
    await pending;
  }
});

test("storage lock timeouts fail closed and release the connection for recovery", async () => {
  await takeFreeSlot("locked");
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT chain FROM pool_relay_budget WHERE chain = 'locked' FOR UPDATE");
    await assert.rejects(takeFreeSlot("locked"), status(503));
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  await takeFreeSlot("locked");
  const { rows } = await pool.query("SELECT cardinality(used_at) AS count FROM pool_relay_budget WHERE chain = 'locked'");
  assert.equal(rows[0].count, 2);
});

test("missing quota storage fails closed with a sanitized 503", async () => {
  await pool.query("ALTER TABLE pool_relay_budget RENAME TO unavailable_budget");
  try {
    await assert.rejects(takeFreeSlot("outage"), (err: unknown) =>
      status(503)(err) && (err as RelayError).message === "The free relayer is temporarily unavailable. Try again shortly.");
  } finally {
    await pool.query("ALTER TABLE unavailable_budget RENAME TO pool_relay_budget");
  }
});

test("both relay paths await a reservation after simulation and before broadcast", async () => {
  const source = await readFile(new URL("./relayer.ts", import.meta.url), "utf8");
  for (const [start, end, simulate, broadcast] of [
    ["async function relayEvm", "// ---- Solana", "simulateContract(call)", "r.walletClient.writeContract"],
    ["async function relaySolana", "// From solana/pool", "simulateTransaction(tx)", "r.connection.sendRawTransaction"],
  ]) {
    const path = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    const reservation = path.indexOf("if (isTransfer) await takeFreeSlot(chain.id)");
    assert.ok(reservation > path.indexOf(simulate));
    assert.ok(reservation < path.indexOf(broadcast));
    assert.equal(path.match(/takeFreeSlot/g)?.length, 1);
  }
});
