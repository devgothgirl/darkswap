import { pool } from "@workspace/db";
import { RelayError } from "./relay-error";

export const FREE_WINDOW_MS = 10 * 60_000;

export function freePerWindow(): number {
  const raw = process.env.POOL_RELAY_FREE_PER_10_MIN ?? "30";
  const limit = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(limit)) {
    throw new RelayError("Free relayer limit is misconfigured.", 503);
  }
  return limit;
}

/** Reserve before broadcast, across all replicas sharing the database.
 * Never refund a slot: a failed/ambiguous broadcast may still spend gas.
 * Restarts do not reset the rolling window. Use the DB clock after locking,
 * not a replica's clock or the transaction-start time before a lock wait.
 */
export async function takeFreeSlot(chain: string): Promise<void> {
  const limit = freePerWindow();
  if (limit === 0) throw new RelayError("The free relayer is busy. Try again in a few minutes.", 429);
  const client = await pool.connect().catch(() => {
    throw new RelayError("The free relayer is temporarily unavailable. Try again shortly.", 503);
  });
  let discardConnection = false;
  let accepted = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query(
      "INSERT INTO pool_relay_budget (chain, used_at) VALUES ($1, '{}') ON CONFLICT (chain) DO NOTHING",
      [chain],
    );
    await client.query("SELECT chain FROM pool_relay_budget WHERE chain = $1 FOR UPDATE", [chain]);
    const result = await client.query(`
      WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now),
      recent AS MATERIALIZED (
        SELECT ARRAY(
          SELECT used FROM unnest(used_at) AS used
          WHERE used > (SELECT now FROM clock) - interval '10 minutes'
        ) AS times
        FROM pool_relay_budget WHERE chain = $1
      )
      UPDATE pool_relay_budget
      SET used_at = array_append(recent.times, clock.now)
      FROM recent, clock
      WHERE chain = $1 AND cardinality(recent.times) < $2
      RETURNING chain
    `, [chain, limit]);
    accepted = result.rowCount === 1;
    await client.query("COMMIT");
  } catch {
    // Do not leak database errors or fall back to process-local spending.
    try { await client.query("ROLLBACK"); } catch { discardConnection = true; }
    throw new RelayError("The free relayer is temporarily unavailable. Try again shortly.", 503);
  } finally {
    client.release(discardConnection);
  }
  if (!accepted) throw new RelayError("The free relayer is busy. Try again in a few minutes.", 429);
}
