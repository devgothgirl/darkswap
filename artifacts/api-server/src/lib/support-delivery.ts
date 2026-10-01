import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, supportCasesTable as cases, supportDeliveryEventsTable as events } from "@workspace/db";

export type SupportStatus = "pending" | "delivered" | "failed" | "unconfirmed";
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createCase(email: string, report: string, id = randomUUID()) {
  const token = randomUUID() + randomUUID();
  await db.insert(cases).values({ id, accessTokenHash: tokenHash(token), email, report, status: "pending" });
  return { id, token };
}

export async function updateCase(id: string, status: SupportStatus, providerMessageId?: string) {
  if (!providerMessageId) {
    // Request completion cannot replace a failure received from a signed webhook.
    await db.update(cases).set({ status, updatedAt: new Date() })
      .where(and(eq(cases.id, id), eq(cases.status, "pending")));
    return;
  }
  await db.transaction(async tx => {
    // Link and event receipt serialize even when a signed callback beats the send response.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${providerMessageId}, 0))`);
    await tx.update(cases).set({ providerMessageId, updatedAt: new Date() })
      .where(and(eq(cases.id, id), inArray(cases.status, ["pending", "unconfirmed"])));
    await reconcile(tx, providerMessageId);
  });
}

type SupportTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function reconcile(tx: SupportTransaction, providerMessageId: string) {
  const matches = await tx.select({ status: events.status }).from(events)
    .where(eq(events.providerMessageId, providerMessageId));
  const status = matches.some(event => event.status === "failed") ? "failed"
    : matches.some(event => event.status === "delivered") ? "delivered" : null;
  if (status) await tx.update(cases).set({ status, updatedAt: new Date() })
    .where(and(eq(cases.providerMessageId, providerMessageId),
      inArray(cases.status, status === "failed" ? ["pending", "unconfirmed", "delivered"] : ["pending", "unconfirmed"])));
}

export async function recordSupportEvent(id: string, providerMessageId: string, status: "delivered" | "failed") {
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${providerMessageId}, 0))`);
    await tx.insert(events).values({ id, providerMessageId, status }).onConflictDoNothing();
    await reconcile(tx, providerMessageId);
  });
}

export async function getCaseStatus(token: string): Promise<SupportStatus | null> {
  const [record] = await db.select({ status: cases.status, createdAt: cases.createdAt }).from(cases)
    .where(eq(cases.accessTokenHash, tokenHash(token)));
  if (!record) return null;
  if (record.status === "pending" && record.createdAt < new Date(Date.now() - 15 * 60_000)) {
    await db.update(cases).set({ status: "unconfirmed", updatedAt: new Date() })
      .where(and(eq(cases.accessTokenHash, tokenHash(token)), eq(cases.status, "pending"),
        lt(cases.createdAt, new Date(Date.now() - 15 * 60_000))));
    const [current] = await db.select({ status: cases.status }).from(cases)
      .where(eq(cases.accessTokenHash, tokenHash(token)));
    // A reviewed, expired case may be removed between the reads.
    return current ? current.status as SupportStatus : null;
  }
  return record.status as SupportStatus;
}

export function statusMessage(status: SupportStatus): string {
  switch (status) {
    case "delivered": return "The email provider reports delivery to support@darkswap.app. Inbox review is not confirmed.";
    case "failed": return "Email delivery failed. Your report is saved for operator recovery, but do not rely on an inbox response. Keep your order details and do not send another deposit.";
    case "unconfirmed": return "Delivery has not been confirmed. Your report is saved for operator recovery. Do not send another deposit.";
    case "pending": return "Your report is saved. Email delivery to support@darkswap.app is pending, not yet confirmed. Do not send another deposit.";
  }
}
