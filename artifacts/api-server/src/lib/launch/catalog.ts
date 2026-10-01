import { GetStonkfunTokenResponse } from "@workspace/api-zod";
import { NETWORK, type DiscoveryCatalog, type DiscoverySource, type DiscoveryToken } from "../stonkfun";

/** Indexed network+mint observations, hard bounded under a transaction-scoped writer lock. */
export const discoveryCatalog: DiscoveryCatalog = {
  async put(tokens: DiscoveryToken[], source: DiscoverySource) {
    if (!tokens.length) return;
    const { pool } = await import("@workspace/db");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '4000ms'");
      await client.query("SET LOCAL lock_timeout = '2000ms'");
      await client.query("SELECT pg_advisory_xact_lock(991003)");
      const safe = tokens.map(token => GetStonkfunTokenResponse.shape.token.parse(token));
      await client.query(`
        INSERT INTO launch_catalog (network, mint, token, fetched_at, generated_at)
        SELECT $1, item->>'mint', item, $3::timestamptz, $4::timestamptz
        FROM jsonb_array_elements($2::jsonb) item
        ON CONFLICT (network, mint) DO UPDATE SET token = EXCLUDED.token,
          fetched_at = EXCLUDED.fetched_at, generated_at = EXCLUDED.generated_at
        WHERE launch_catalog.fetched_at <= EXCLUDED.fetched_at
      `, [NETWORK, JSON.stringify(safe), source.fetchedAt, source.generatedAt]);
      await client.query(`
        DELETE FROM launch_catalog WHERE (network, mint) IN (
          SELECT network, mint FROM launch_catalog
          ORDER BY fetched_at DESC, network, mint OFFSET 10000
        )
      `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  },
  async get(mint: string) {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      "SELECT token, fetched_at, generated_at FROM launch_catalog WHERE network = $1 AND mint = $2 LIMIT 1",
      [NETWORK, mint],
    );
    const row = result.rows[0];
    if (!row) return null;
    const token = GetStonkfunTokenResponse.shape.token.parse(row.token);
    if (token.network !== NETWORK || token.mint !== mint) throw new Error("Indexed token identity mismatch");
    return { token, fetchedAt: new Date(row.fetched_at), generatedAt: row.generated_at ? new Date(row.generated_at) : null };
  },
};