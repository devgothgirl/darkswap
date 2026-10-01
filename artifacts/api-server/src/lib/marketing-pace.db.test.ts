import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";

if (process.env.MARKETING_HEALTH_TEST_DB !== "true"
  || !/^postgresql:\/\/marketing_test@127\.0\.0\.1:\d+\/postgres$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run via pnpm --filter @workspace/api-server test:marketing-health (temporary local database only).");
}

const { db, pool, marketingSubscriptionsTable: subscriptions, marketingDeliveriesTable: deliveries,
  marketingWebhookReceiptsTable: receipts } = await import("@workspace/db");
const { campaignUnsubscribeToken, hashToken } = await import("./marketing");
process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-only-secret-".repeat(4);

after(async () => { await pool.end(); });

test("separate campaign processes stay 600ms apart even when the first stalls before provider dispatch", async () => {
  const email = "paced@example.invalid";
  await db.insert(subscriptions).values({
    email, source: "test", consentVersion: "marketing-v1", verifiedAt: new Date(),
    unsubscribeTokenHash: hashToken(campaignUnsubscribeToken(email)),
  });
  await db.insert(deliveries).values({
    id: "pace-health-seed", email, kind: "probe", status: "accepted",
    providerMessageId: "pace-health-message", webhookExpectedAt: new Date(),
  });
  await db.insert(receipts).values({ id: "pace-health-receipt", providerMessageId: "pace-health-message" });

  const scriptsDir = fileURLToPath(new URL("../../../../scripts/", import.meta.url));
  const workerPath = fileURLToPath(new URL("./marketing-pace.worker.ts", import.meta.url));
  const workers: ChildProcessWithoutNullStreams[] = [];
  const start = (key: string) => {
    const child = spawn("pnpm", ["--dir", scriptsDir, "exec", "tsx", workerPath, key], {
      env: process.env,
      stdio: "pipe",
    });
    workers.push(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
    const ready = new Promise<void>((resolve, reject) => {
      const onData = () => {
        if (stdout.includes("ready\n")) {
          child.stdout.off("data", onData);
          resolve();
        }
      };
      child.stdout.on("data", onData);
      child.once("exit", code => reject(new Error(`Worker ${key} exited before ready (${code}): ${stderr}`)));
    });
    const entered = key === "pace-one" ? new Promise<void>((resolve, reject) => {
      const onData = () => {
        if (stdout.includes("transport-entered\n")) {
          child.stdout.off("data", onData);
          resolve();
        }
      };
      child.stdout.on("data", onData);
      child.once("exit", code => reject(new Error(`Worker ${key} exited before transport (${code}): ${stderr}`)));
    }) : Promise.resolve();
    const finished = new Promise<{ at: number; email: string; key: string }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", code => {
        if (code !== 0) return reject(new Error(`Worker ${key} failed (${code}): ${stderr}\n${stdout}`));
        const line = stdout.split("\n").find(value => value.startsWith('{"at":'));
        if (!line) return reject(new Error(`Worker ${key} made no send: ${stdout}`));
        resolve(JSON.parse(line) as { at: number; email: string; key: string });
      });
    });
    return { child, ready, entered, finished };
  };

  const timer = setTimeout(() => workers.forEach(worker => worker.kill()), 15_000);
  try {
    const first = start("pace-one");
    const second = start("pace-two");
    await Promise.all([first.ready, second.ready]);
    first.child.stdin.write("go\n");
    await first.entered;
    second.child.stdin.write("go\n");
    const calls = await Promise.all([first.finished, second.finished]);
    assert.deepEqual(new Set(calls.map(call => call.key)), new Set(["pace-one", "pace-two"]));
    assert.ok(calls.every(call => call.email === email));
    assert.ok(Math.abs(calls[0].at - calls[1].at) >= 600,
      `provider calls from separate processes must be paced by 600ms: ${JSON.stringify(calls)}`);
    const rows = (await db.execute(sql`SELECT campaign_key, status FROM marketing_deliveries
      WHERE kind = 'campaign'`)).rows;
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.status === "accepted"));
  } finally {
    clearTimeout(timer);
    workers.forEach(worker => { if (worker.exitCode === null && worker.signalCode === null) worker.kill(); });
    await Promise.allSettled(workers.map(worker => new Promise(resolve => {
      if (worker.exitCode !== null || worker.signalCode !== null) resolve(undefined);
      else worker.once("exit", resolve);
    })));
  }
});