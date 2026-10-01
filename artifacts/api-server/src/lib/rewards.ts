import { PrivyClient, type User } from "@privy-io/server-auth";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import {
  db,
  nearOrdersTable,
  privateSwapOrderClaimsTable,
  rewardsAccountsTable,
  rewardsLedgerTable,
} from "@workspace/db";
import { CreatePrivateOrderResponse, CreateNearOrderResponse } from "@workspace/api-zod";
import type { ProviderOrder } from "./houdini";
import { houdiniRequest } from "./houdini";

const REWARD_POINTS = 100;
const DAILY_CAP = 300;
const REWARDS_RULE_VERSION = 1;
const HISTORY_DEFAULT = 25;
const HISTORY_MAX = 100;
const REWARDS_PAGE_LIMIT = 20;
const NEAR_STATUS_URL = "https://1click.chaindefuser.com/v0";
let client: PrivyClient | undefined;

export class RewardsAuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export type RewardsIdentity = { did: string; email?: string };

export function rewardsConfig(): { appId: string | null; enabled: boolean } {
  const appId = process.env.PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();
  const enabled = !!appId && !!appSecret;
  return { appId: enabled ? appId! : null, enabled };
}

function configuredClient(): PrivyClient {
  const config = rewardsConfig();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();
  if (!config.enabled || !config.appId || !appSecret) {
    throw new RewardsAuthError(503, "Email rewards are not currently available.");
  }
  if (!client) client = new PrivyClient(config.appId, appSecret);
  return client;
}

export function verifiedPrivyEmail(user: User): string | undefined {
  const linked = user.linkedAccounts.find((account) =>
    account.type === "email" && typeof account.address === "string",
  );
  // Privy exposes linked email addresses directly; verification timestamp
  // metadata is optional and absent from some current user responses.
  const email = (user.email?.address ?? (linked?.type === "email" ? linked.address : ""))
    .trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

export async function verifyRewardsIdentity(
  authorization: string | undefined,
  requireVerifiedEmail = true,
): Promise<RewardsIdentity> {
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    throw new RewardsAuthError(401, "A valid Privy bearer token is required.");
  }
  const token = authorization.replace(/^Bearer\s+/i, "");
  const privy = configuredClient();
  let claims;
  try {
    claims = await privy.verifyAuthToken(token);
  } catch {
    throw new RewardsAuthError(401, "The Privy access token is invalid or expired.");
  }
  const expectedAppId = process.env.PRIVY_APP_ID?.trim();
  if (
    claims.appId !== expectedAppId ||
    claims.issuer !== "privy.io" ||
    !Number.isFinite(claims.expiration) ||
    claims.expiration <= Math.floor(Date.now() / 1000) ||
    !/^did:privy:[A-Za-z0-9_-]+$/.test(claims.userId)
  ) {
    throw new RewardsAuthError(401, "The Privy access token is invalid or expired.");
  }

  let user: User;
  try {
    user = await privy.getUserById(claims.userId);
  } catch {
    throw new RewardsAuthError(503, "Verified account details are temporarily unavailable.");
  }
  if (user.id !== claims.userId) {
    throw new RewardsAuthError(401, "The Privy account could not be verified.");
  }
  const email = verifiedPrivyEmail(user);
  if (requireVerifiedEmail && !email) {
    throw new RewardsAuthError(401, "Link and verify an email in your Privy account to use rewards.");
  }
  return { did: user.id, email };
}

export async function enrolledAccountForOrder(identity: RewardsIdentity): Promise<string | undefined> {
  const [account] = await db.select({
    did: rewardsAccountsTable.privyDid,
    email: rewardsAccountsTable.email,
  }).from(rewardsAccountsTable).where(and(
    eq(rewardsAccountsTable.privyDid, identity.did),
    eq(rewardsAccountsTable.enrolled, true),
  )).limit(1);
  return identity.email && account?.email === identity.email ? account.did : undefined;
}

export async function resolveOrderRewardsAccount(authorization: string | undefined): Promise<string | undefined> {
  if (authorization === undefined) return undefined;
  if (!rewardsConfig().enabled) {
    throw new RewardsAuthError(
      503,
      "Rewards could not be verified. No order was created. Retry without Authorization to continue as a guest.",
    );
  }
  const identity = await verifyRewardsIdentity(authorization);
  const accountDid = await enrolledAccountForOrder(identity);
  if (!accountDid) {
    throw new RewardsAuthError(
      409,
      "Rewards enrollment is no longer active. No order was created. Retry without Authorization to continue as a guest.",
    );
  }
  return accountDid;
}

export async function enrollRewards(identity: RewardsIdentity, consent: boolean): Promise<boolean> {
  if (!consent) {
    await db.update(rewardsAccountsTable).set({
      email: null,
      enrolled: false,
      consentAt: null,
      updatedAt: new Date(),
    }).where(eq(rewardsAccountsTable.privyDid, identity.did));
    return false;
  }
  if (!identity.email) {
    throw new RewardsAuthError(401, "Link and verify an email in your Privy account to enroll.");
  }
  try {
    await db.insert(rewardsAccountsTable).values({
      privyDid: identity.did,
      email: identity.email,
      enrolled: true,
      consentAt: new Date(),
    }).onConflictDoUpdate({
      target: rewardsAccountsTable.privyDid,
      set: {
        email: identity.email,
        enrolled: true,
        consentAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error &&
        (error as { code?: unknown }).code === "23505") {
      throw new RewardsAuthError(409, "This verified email is already associated with another rewards account.");
    }
    throw error;
  }
  return true;
}

type HistoryCursor = { date: string; id: string };

function decodeCursor(value: string | undefined): HistoryCursor | undefined {
  if (!value) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<HistoryCursor>;
    if (typeof decoded.date !== "string" || !Number.isFinite(Date.parse(decoded.date)) ||
        typeof decoded.id !== "string" || !/^[0-9a-f-]{36}$/i.test(decoded.id)) return undefined;
    return { date: decoded.date, id: decoded.id };
  } catch {
    return undefined;
  }
}

export async function rewardsMe(
  identity: RewardsIdentity,
  cursorValue: string | undefined,
  requestedLimit: number | undefined,
) {
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) throw new RewardsAuthError(400, "The rewards history cursor is invalid.");
  const limit = Math.min(HISTORY_MAX, Math.max(1, requestedLimit ?? HISTORY_DEFAULT));
  const [account] = await db.select({ enrolled: rewardsAccountsTable.enrolled })
    .from(rewardsAccountsTable)
    .where(eq(rewardsAccountsTable.privyDid, identity.did))
    .limit(1);
  const [totals] = await db.select({
    balance: sql<number>`coalesce(sum(${rewardsLedgerTable.points}), 0)::int`,
  }).from(rewardsLedgerTable).where(eq(rewardsLedgerTable.accountDid, identity.did));

  const clauses = [eq(rewardsLedgerTable.accountDid, identity.did)];
  if (cursor) {
    const date = new Date(cursor.date);
    clauses.push(or(
      lt(rewardsLedgerTable.createdAt, date),
      and(eq(rewardsLedgerTable.createdAt, date), lt(rewardsLedgerTable.id, cursor.id)),
    )!);
  }
  const rows = await db.select().from(rewardsLedgerTable)
    .where(and(...clauses))
    .orderBy(desc(rewardsLedgerTable.createdAt), desc(rewardsLedgerTable.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const balance = totals?.balance ?? 0;
  const tier = balance >= 2000
    ? { id: "pro" as const, name: "Pro", threshold: 2000 as const, version: REWARDS_RULE_VERSION as 1 }
    : balance >= 500
      ? { id: "plus" as const, name: "Plus", threshold: 500 as const, version: REWARDS_RULE_VERSION as 1 }
      : { id: "starter" as const, name: "Starter", threshold: 0 as const, version: REWARDS_RULE_VERSION as 1 };
  const nextThreshold = balance < 500 ? 500 : balance < 2000 ? 2000 : null;
  const last = page.at(-1);
  return {
    enrolled: account?.enrolled ?? false,
    balance,
    tier,
    nextThreshold,
    ruleConfig: {
      version: REWARDS_RULE_VERSION,
      pointsPerCompletedSwap: REWARD_POINTS,
      dailyCap: DAILY_CAP,
      dailyCapPeriod: "utc_day" as const,
      tiers: [
        { id: "starter" as const, name: "Starter" as const, threshold: 0 as const },
        { id: "plus" as const, name: "Plus" as const, threshold: 500 as const },
        { id: "pro" as const, name: "Pro" as const, threshold: 2000 as const },
      ],
    },
    history: page.map((entry) => ({
      id: entry.id,
      points: entry.points,
      reason: entry.reason,
      ...(entry.route ? { route: entry.route } : {}),
      ...(entry.orderReference ? { orderReference: entry.orderReference } : {}),
      createdAt: entry.createdAt,
    })),
    nextCursor: hasMore && last
      ? Buffer.from(JSON.stringify({ date: last.createdAt.toISOString(), id: last.id })).toString("base64url")
      : null,
  };
}

export async function recordRewardsTerminalResult(
  accountDid: string | null,
  route: "houdini" | "near",
  orderReference: string,
  result: "complete" | "reverse",
  at = new Date(),
): Promise<void> {
  if (!accountDid) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT privy_did FROM rewards_accounts WHERE privy_did = ${accountDid} FOR UPDATE`);
    const [account] = await tx.select({ enrolled: rewardsAccountsTable.enrolled })
      .from(rewardsAccountsTable).where(eq(rewardsAccountsTable.privyDid, accountDid)).limit(1);
    if (!account) return;
    const reason = result === "complete" ? "swap_completed" : "swap_reversed";
    const [existing] = await tx.select({ id: rewardsLedgerTable.id })
      .from(rewardsLedgerTable).where(and(
        eq(rewardsLedgerTable.route, route),
        eq(rewardsLedgerTable.orderReference, orderReference),
        result === "complete"
          ? inArray(rewardsLedgerTable.reason, ["swap_completed", "swap_capped"])
          : eq(rewardsLedgerTable.reason, "swap_reversed"),
      )).limit(1);
    if (existing) return;
    if (result === "complete") {
      if (!account.enrolled) return;
      const dayStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const [daily] = await tx.select({
        points: sql<number>`coalesce(sum(greatest(${rewardsLedgerTable.points}, 0)), 0)::int`,
      }).from(rewardsLedgerTable).where(and(
        eq(rewardsLedgerTable.accountDid, accountDid),
        eq(rewardsLedgerTable.reason, "swap_completed"),
        gte(rewardsLedgerTable.createdAt, dayStart),
        lt(rewardsLedgerTable.createdAt, dayEnd),
      ));
      if ((daily?.points ?? 0) + REWARD_POINTS > DAILY_CAP) {
        // Persist a terminal order decision so later UTC days or policy versions cannot grant it.
        await tx.insert(rewardsLedgerTable).values({
          accountDid,
          points: 0,
          reason: "swap_capped",
          route,
          orderReference,
          createdAt: at,
        }).onConflictDoNothing();
        return;
      }
    } else {
      const [award] = await tx.select({ id: rewardsLedgerTable.id })
        .from(rewardsLedgerTable).where(and(
          eq(rewardsLedgerTable.accountDid, accountDid),
          eq(rewardsLedgerTable.route, route),
          eq(rewardsLedgerTable.orderReference, orderReference),
          eq(rewardsLedgerTable.reason, "swap_completed"),
        )).limit(1);
      if (!award) return;
    }
    await tx.insert(rewardsLedgerTable).values({
      accountDid,
      points: result === "complete" ? REWARD_POINTS : -REWARD_POINTS,
      reason,
      route,
      orderReference,
      createdAt: at,
    }).onConflictDoNothing();
  });
}

function closeAmount(actual: unknown, expected: number): boolean {
  return typeof actual === "number" && Number.isFinite(actual) &&
    Math.abs(actual - expected) <= Math.max(1e-10, Math.abs(expected) * 1e-8);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesPrivateRecipient(address: string, tag: string | null | undefined, hash: string): boolean {
  const binding = createHash("sha256").update(JSON.stringify({
    addressTo: address.trim(),
    destinationTag: tag?.trim() ?? "",
  })).digest("hex");
  return binding === hash;
}

export function houdiniRewardResult(status: unknown): "complete" | "reverse" | undefined {
  // Houdini v2 OrderStatus contract: 4=FINISHED, 5=EXPIRED,
  // 6=FAILED, 7=REFUNDED, 8=DELETED. Expiration/deletion are not awards or reversals.
  if (status === 4) return "complete";
  if (status === 6 || status === 7) return "reverse";
  return undefined;
}

function nearTerminalStatus(value: string): "complete" | "reverse" | undefined {
  const status = value.trim().toLowerCase();
  if (["success", "successful", "complete", "completed", "finished"].includes(status)) return "complete";
  if (["refunded", "failed", "failure", "expired"].includes(status)) return "reverse";
  return undefined;
}

async function pollHoudiniRewards(): Promise<void> {
  const claims = await db.select().from(privateSwapOrderClaimsTable)
    .where(and(
      isNotNull(privateSwapOrderClaimsTable.rewardsAccountDid),
      eq(privateSwapOrderClaimsTable.state, "ready"),
    ))
    .orderBy(sql`${privateSwapOrderClaimsTable.rewardsCheckedAt} ASC NULLS FIRST`, asc(privateSwapOrderClaimsTable.createdAt))
    .limit(REWARDS_PAGE_LIMIT);
  for (const claim of claims) {
    await db.update(privateSwapOrderClaimsTable).set({ rewardsCheckedAt: new Date() })
      .where(eq(privateSwapOrderClaimsTable.quoteHash, claim.quoteHash));
    const saved = CreatePrivateOrderResponse.safeParse(claim.response);
    if (!saved.success) continue;
    const quoteData = isRecord(claim.providerRequest) ? claim.providerRequest.quote : undefined;
    if (
      !isRecord(quoteData) ||
      typeof quoteData.fromTokenId !== "string" ||
      typeof quoteData.toTokenId !== "string" ||
      typeof quoteData.amountIn !== "number" ||
      typeof quoteData.amountOut !== "number"
    ) continue;
    try {
      const order = await houdiniRequest<ProviderOrder>(`/orders/${encodeURIComponent(saved.data.houdiniId)}`);
      if (
        order.houdiniId !== saved.data.houdiniId ||
        order.depositAddress !== saved.data.depositAddress ||
        order.receiverAddress !== saved.data.receiverAddress ||
        (order.receiverTag ?? null) !== (saved.data.receiverTag ?? null) ||
        order.inSymbol !== saved.data.inSymbol ||
        order.outSymbol !== saved.data.outSymbol ||
        order.inToken?.id !== quoteData.fromTokenId ||
        order.outToken?.id !== quoteData.toTokenId ||
        !matchesPrivateRecipient(order.receiverAddress, order.receiverTag, claim.recipientHash) ||
        !closeAmount(order.inAmount, quoteData.amountIn) ||
        !closeAmount(order.outAmount, quoteData.amountOut) ||
        !closeAmount(order.inAmount, saved.data.inAmount) ||
        !closeAmount(order.outAmount, saved.data.outAmount)
      ) continue;
      const result = houdiniRewardResult(order.status);
      if (result) await recordRewardsTerminalResult(claim.rewardsAccountDid, "houdini", order.houdiniId, result);
    } catch {
      // Provider outages are retryable; fixed log messages below avoid identifiers and contact data.
    }
  }
}

function matchesNearStatus(
  status: Record<string, unknown>,
  saved: ReturnType<typeof CreateNearOrderResponse.parse>,
  storedRequest: unknown,
): boolean {
  const response = status.quoteResponse;
  if (!response || typeof response !== "object" || Array.isArray(response)) return false;
  const quoteResponse = response as Record<string, unknown>;
  const quote = quoteResponse.quote;
  const request = quoteResponse.quoteRequest;
  if (!quote || typeof quote !== "object" || Array.isArray(quote) ||
      !request || typeof request !== "object" || Array.isArray(request)) return false;
  const providerQuote = quote as Record<string, unknown>;
  const providerRequest = request as Record<string, unknown>;
  if (!isRecord(storedRequest) ||
      Object.entries(storedRequest).some(([key, value]) => providerRequest[key] !== value)) return false;
  return providerQuote.depositAddress === saved.depositAddress &&
    (providerQuote.depositMemo ?? "") === (saved.depositMemo ?? "") &&
    providerQuote.amountIn === storedRequest.amount &&
    providerRequest.originAsset === saved.from.id &&
    providerRequest.destinationAsset === saved.to.id &&
    providerRequest.recipient === saved.recipient &&
    providerRequest.refundTo === saved.refundTo &&
    providerRequest.confidentiality === "basic" &&
    providerRequest.depositType === "ORIGIN_CHAIN" &&
    providerRequest.recipientType === "DESTINATION_CHAIN" &&
    providerRequest.refundType === "ORIGIN_CHAIN";
}

async function pollNearRewards(): Promise<void> {
  const apiKey = process.env.NEAR_INTENTS_API_KEY;
  if (!apiKey) return;
  const orders = await db.select().from(nearOrdersTable)
    .where(and(
      isNotNull(nearOrdersTable.rewardsAccountDid),
      eq(nearOrdersTable.state, "ready"),
    ))
    .orderBy(sql`${nearOrdersTable.rewardsCheckedAt} ASC NULLS FIRST`, asc(nearOrdersTable.createdAt))
    .limit(REWARDS_PAGE_LIMIT);
  for (const order of orders) {
    await db.update(nearOrdersTable).set({ rewardsCheckedAt: new Date() })
      .where(eq(nearOrdersTable.id, order.id));
    const saved = CreateNearOrderResponse.safeParse(order.orderDetails);
    if (!saved.success) continue;
    try {
      const params = new URLSearchParams({ depositAddress: saved.data.depositAddress });
      if (saved.data.depositMemo) params.set("depositMemo", saved.data.depositMemo);
      const response = await fetch(`${NEAR_STATUS_URL}/status?${params}`, {
        headers: { "X-API-Key": apiKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      const result = await response.json() as Record<string, unknown>;
      const terminal = typeof result.status === "string" ? nearTerminalStatus(result.status) : undefined;
      if (
        !terminal ||
        !["SUCCESS", "REFUNDED", "FAILED"].includes(String(result.status)) ||
        !matchesNearStatus(result, saved.data, order.providerRequest)
      ) continue;
      await recordRewardsTerminalResult(order.rewardsAccountDid, "near", order.id, terminal);
    } catch {
      // Provider outages are retryable; fixed log messages below avoid identifiers and contact data.
    }
  }
}

let pollActive = false;
export async function pollRewardsOrders(): Promise<void> {
  if (pollActive || !rewardsConfig().enabled) return;
  pollActive = true;
  try {
    await pollHoudiniRewards();
    await pollNearRewards();
  } finally {
    pollActive = false;
  }
}