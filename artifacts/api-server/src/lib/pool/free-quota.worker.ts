// Separate server-process stand-in used only by the quota regression tests.
import { pool } from "@workspace/db";
import { takeFreeSlot } from "./free-quota";
import { RelayError } from "./relay-error";

try {
  const statuses = await Promise.all(Array.from({ length: 12 }, async () => {
    try { await takeFreeSlot("replica-test"); return 200; }
    catch (err) {
      if (!(err instanceof RelayError)) throw err;
      return err.status;
    }
  }));
  process.send?.(statuses);
} finally {
  await pool.end();
}
