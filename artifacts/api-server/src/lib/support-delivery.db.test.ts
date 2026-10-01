import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, test } from "node:test";
import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { eq, sql } from "drizzle-orm";

if (process.env.SUPPORT_TEST_DB !== "true"
  || !/^postgresql:\/\/support_test@127\.0\.0\.1:\d+\/postgres$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run via pnpm --filter @workspace/api-server test:support-delivery (temporary local database only).");
}
const { db, pool, supportCasesTable: cases } = await import("@workspace/db");
const { createCase, getCaseStatus, recordSupportEvent, updateCase, tokenHash } = await import("./support-delivery");
const { default: supportRouter } = await import("../routes/support");
const key = Buffer.alloc(32, 8);
process.env.SUPPORT_RESEND_WEBHOOK_SECRET = `whsec_${key.toString("base64")}`;
after(async () => { await pool.end(); });

test("support status survives failures, early callbacks, duplicates and tampered signatures", async () => {
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: "silent" }) }));
  app.use("/api/support/webhook/resend", express.raw({ type: "application/json" }));
  app.use("/api", supportRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const post = (id: string, type: string, emailId: string, valid = true, recipient = "support@darkswap.app") => {
    const body = JSON.stringify({ type, data: { email_id: emailId, to: [recipient] } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    return fetch(`${base}/support/webhook/resend`, {
      method: "POST",
      headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp,
        "svix-signature": `v1,${valid ? signature : "invalid"}` },
      body,
    });
  };
  try {
    const { id, token } = await createCase("synthetic@example.invalid", "Synthetic case; no real email sent.");
    assert.equal(await getCaseStatus(token), "pending");
    assert.notEqual(tokenHash(token), token);
    assert.equal((await db.select().from(cases).where(eq(cases.id, id)))[0].accessTokenHash, tokenHash(token));
    assert.equal((await post("tampered", "email.bounced", "synthetic-msg", false)).status, 401);
    assert.equal((await post("other-recipient", "email.bounced", "synthetic-msg", true, "elsewhere@example.invalid")).status, 204);
    assert.equal(await getCaseStatus(token), "pending");
    // Signed bounce may arrive before the provider send response.
    assert.equal((await post("evt-bounce", "email.bounced", "synthetic-msg")).status, 204);
    await updateCase(id, "pending", "synthetic-msg");
    assert.equal(await getCaseStatus(token), "failed");
    assert.equal((await post("evt-bounce", "email.bounced", "synthetic-msg")).status, 204);
    assert.equal((await post("evt-late", "email.delivered", "synthetic-msg")).status, 204);
    assert.equal(await getCaseStatus(token), "failed");
    const checked = await fetch(`${base}/support/requests/status?token=${token}`);
    assert.equal(checked.status, 200);
    assert.equal((await checked.json() as { status: string }).status, "failed");
    assert.equal((await fetch(`${base}/support/requests/status?token=${"0".repeat(72)}`)).status, 404);
    const second = await createCase("synthetic@example.invalid", "No delivery yet.");
    await updateCase(second.id, "pending", "another-msg");
    assert.equal((await post("evt-deliver", "email.delivered", "another-msg")).status, 204);
    assert.equal(await getCaseStatus(second.token), "delivered");
    // Force the precise request/webhook interleaving: read delivered, then bounce,
    // then complete the request using the stale read.
    const staleStatus = await getCaseStatus(second.token);
    assert.equal((await post("evt-after-read", "email.bounced", "another-msg")).status, 204);
    await updateCase(second.id, staleStatus!);
    assert.equal(await getCaseStatus(second.token), "failed", "stale completion cannot conceal a bounce");
    const third = await createCase("synthetic@example.invalid", "Overdue delivery.");
    await db.update(cases).set({ createdAt: new Date(Date.now() - 16 * 60_000) }).where(eq(cases.id, third.id));
    assert.equal(await getCaseStatus(third.token), "unconfirmed");
    assert.equal((await db.select({ count: sql<number>`count(*)` }).from(cases))[0].count, "3");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
