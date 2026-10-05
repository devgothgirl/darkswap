import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, nearOrdersTable, nearSwapPreviewsTable } from "@workspace/db";
import type { NearQuoteInput, NearQuoteToken } from "@workspace/db";
import { withProviderCapacity } from "../lib/provider-capacity";
import { InvalidPartnerFeeConfigError, partnerFeeFromEnv, type PartnerFee } from "../lib/near-partner-fee";
import { inputValueUsd, MINIMUM_SWAP_USD } from "../lib/swap-minimum";
import { getNearServiceStatus } from "../lib/near-service-status";
import {
  GetNearTokensQueryParams,
  GetNearTokensResponse,
  GetNearQuoteBody,
  GetNearQuoteResponse,
  CreateNearOrderBody,
  CreateNearOrderResponse,
  GetNearOrderReceiptParams,
  GetNearOrderReceiptResponse,
  GetNearOrderStatusQueryParams,
  GetNearOrderStatusResponse,
  GetNearServiceStatusQueryParams,
  GetNearServiceStatusResponse,
} from "@workspace/api-zod";
import { resolveOrderRewardsAccount, RewardsAuthError } from "../lib/rewards";

const router: IRouter = Router();
router.use("/swap/near", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const BASE = "https://1click.chaindefuser.com/v0";
const DESTINATIONS = new Set(["sol", "near", "eth", "arb", "base", "op", "pol", "bsc"]);
const CHAIN_NAMES: Record<string, string> = {
  sol: "Solana", near: "NEAR", eth: "Ethereum", arb: "Arbitrum",
  base: "Base", op: "Optimism", pol: "Polygon", bsc: "BNB Chain",
};
type Token = NearQuoteToken;
type QuoteInput = NearQuoteInput;
type Preview = { input: QuoteInput; from: Token; to: Token; units: string; minOut: bigint; expires: number };
type ProviderQuote = {
  quoteRequest?: Record<string, unknown>;
  quote?: Record<string, unknown>;
};
let tokenCache: { tokens: Token[]; expires: number } | null = null;
let tokenLoading: Promise<Token[]> | null = null;
const requests = new Map<string, { count: number; reset: number }>();

class NearError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function limited(max: number, bucket: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    if (requests.size > 5000) for (const [key, value] of requests) if (value.reset < now) requests.delete(key);
    const key = `${bucket}:${req.ip ?? "unknown"}`;
    const current = requests.get(key);
    if (current && current.reset > now && current.count >= max) {
      res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
      return;
    }
    requests.set(key, current && current.reset > now
      ? { count: current.count + 1, reset: current.reset }
      : { count: 1, reset: now + 60_000 });
    next();
  };
}

function configured(_req: Request, res: Response, next: NextFunction): void {
  if (!process.env.NEAR_INTENTS_API_KEY) {
    res.status(503).json({ error: "Privacy swap is not configured yet. Use the existing private route." });
    return;
  }
  next();
}

async function provider(path: string, body?: Record<string, unknown>): Promise<unknown> {
  return withProviderCapacity(
    body ? "near-write" : "near-read",
    () => new NearError("Privacy swap is busy. Please try again shortly.", 503),
    async () => {
      const response = await fetch(`${BASE}${path}`, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", "X-API-Key": process.env.NEAR_INTENTS_API_KEY! },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status === 404) throw new NearError("No matching Privacy swap order was found.", 404);
        if (response.status === 400 || response.status === 422) throw new NearError("No Privacy swap route is available for these details. Check the addresses and amount.", 400);
        if (response.status === 403 && path.startsWith("/account/history")) {
          throw new NearError("Order recovery is not enabled for this account yet. Do not create another order; check this receipt again later.", 503);
        }
        if (response.status === 401 || response.status === 403) throw new NearError("Privacy swap is unavailable. Use the existing private route.", 503);
        throw new NearError("Privacy swap is temporarily unavailable. Try again later.", 502);
      }
      return response.json();
    },
  );
}

function fail(req: Request, res: Response, error: unknown): void {
  if (error instanceof NearError) {
    req.log.warn({ status: error.status }, "NEAR route unavailable");
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log.error({ err: error }, "NEAR route response failed validation");
  res.status(502).json({ error: "Privacy swap returned invalid data. Do not send funds; check the saved receipt before making another request." });
}

async function tokens(): Promise<Token[]> {
  if (tokenCache && tokenCache.expires > Date.now()) return tokenCache.tokens;
  if (tokenLoading) return tokenLoading;
  tokenLoading = loadTokens();
  try {
    return await tokenLoading;
  } finally {
    tokenLoading = null;
  }
}

async function loadTokens(): Promise<Token[]> {
  const result = await provider("/tokens");
  if (!Array.isArray(result)) throw new Error("Invalid NEAR token list");
  const normalized = result.flatMap((entry): Token[] => {
    if (!entry || typeof entry !== "object") return [];
    const token = entry as Record<string, unknown>;
    const chain = token.blockchain;
    if (typeof chain !== "string" || !DESTINATIONS.has(chain) ||
        typeof token.assetId !== "string" || !token.assetId.startsWith("nep141:") ||
        typeof token.symbol !== "string" || !token.symbol ||
        !Number.isInteger(token.decimals) || (token.decimals as number) < 0 || (token.decimals as number) > 24) return [];
    if (chain === "sol" && token.assetId !== "nep141:sol.omft.near" &&
        (typeof token.contractAddress !== "string" || !solanaAddress(token.contractAddress))) return [];
    return [{
      id: token.assetId, symbol: token.symbol, chain, chainName: CHAIN_NAMES[chain],
      decimals: token.decimals as number,
      ...(typeof token.contractAddress === "string" ? { contractAddress: token.contractAddress } : {}),
      ...(typeof token.price === "number" && Number.isFinite(token.price) ? { price: token.price } : {}),
    }];
  });
  if (!normalized.some(t => t.chain === "sol")) throw new Error("No Solana-origin NEAR assets available");
  tokenCache = { tokens: normalized, expires: Date.now() + 60_000 };
  return normalized;
}

function solanaAddress(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  let number = 0n;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  for (const char of value) number = number * 58n + BigInt(alphabet.indexOf(char));
  let bytes = 0;
  while (number > 0n) { bytes++; number >>= 8n; }
  return bytes + (value.match(/^1+/)?.[0].length ?? 0) === 32;
}

function destinationAddress(chain: string, value: string): boolean {
  if (chain === "sol") return solanaAddress(value);
  if (chain === "near") return /^(?:[a-z0-9_-]+(?:[.-][a-z0-9_-]+)*\.near|[0-9a-f]{64})$/.test(value);
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function atomic(value: string, decimals: number): string | null {
  if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,24})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) return null;
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction.padEnd(decimals, "0")) || "0");
  return units > 0n ? units.toString() : null;
}

function formatUnits(value: unknown, decimals: number): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error("Invalid NEAR quote amount");
  const padded = value.padStart(decimals + 1, "0");
  const integer = padded.slice(0, -decimals || undefined);
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, "") : "";
  return fraction ? `${integer}.${fraction}` : integer;
}

let partnerFeeConfig: PartnerFee | null | undefined;

// Partner revenue share (NEAR Intents appFees); see lib/near-partner-fee.ts
// for the shared fail-closed parsing rules. Changing NEAR_PARTNER_FEE_BPS or
// NEAR_PARTNER_PAYOUT_ADDRESS also requires updating the docs fee copy;
// near-partner-fee-docs.test.ts (pnpm run test:docs-fee) fails until the docs
// match these values.
function partnerFee(): PartnerFee | null {
  if (partnerFeeConfig !== undefined) return partnerFeeConfig;
  try {
    partnerFeeConfig = partnerFeeFromEnv();
  } catch (error) {
    if (error instanceof InvalidPartnerFeeConfigError) {
      throw new NearError("Privacy swap is temporarily unavailable. Try again later.", 503);
    }
    throw error;
  }
  return partnerFeeConfig;
}

function quoteBody(preview: Preview, dry: boolean) {
  const partner = partnerFee();
  return {
    dry, swapType: "EXACT_INPUT", slippageTolerance: 100,
    originAsset: preview.from.id, depositType: "ORIGIN_CHAIN",
    destinationAsset: preview.to.id, amount: preview.units,
    recipient: preview.input.recipient, recipientType: "DESTINATION_CHAIN",
    refundTo: preview.input.refundTo, refundType: "ORIGIN_CHAIN",
    confidentiality: "basic",
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
    ...(partner ? { appFees: [{ recipient: partner.recipient, fee: partner.feeBps }] } : {}),
  };
}

// The provider normalizes appFees in its echo: it appends its own platform-fee
// entry (at most 25 bps) and may either repeat our entry verbatim or split it
// 50/50 under the documented partner schedule. Validate against the fee that
// was actually sent — never against current configuration — so legacy orders
// saved before partner fees existed (whose echoes carry only the provider's
// own entry) remain recoverable.
export function partnerFeeEchoMatches(sent: unknown, echoed: unknown): boolean {
  if (sent === undefined) {
    return echoed === undefined ||
      (Array.isArray(echoed) && echoed.every((entry) => isRecord(entry)));
  }
  if (!Array.isArray(sent) || sent.length !== 1 || !isRecord(sent[0]) ||
      typeof sent[0].fee !== "number" || !Number.isInteger(sent[0].fee) ||
      (sent[0].fee as number) < 1 || !Array.isArray(echoed)) return false;
  const payout = sent[0].recipient;
  const sentFee = sent[0].fee as number;
  let ours = 0;
  let total = 0;
  for (const entry of echoed) {
    if (!isRecord(entry) || typeof entry.fee !== "number" ||
        !Number.isInteger(entry.fee) || entry.fee < 0) return false;
    if (entry.recipient === payout) ours += entry.fee;
    else if (entry.fee > 25) return false;
    total += entry.fee;
  }
  const split = Math.ceil(sentFee / 2);
  return (ours === sentFee || ours === split) && total <= sentFee + 25;
}

// The partner fee disclosed to the user for a provider request: the configured
// total whenever the echo accounts for it, undefined when the feature is off
// or the echo carries no fee to our address (legacy or foreign orders).
export function echoedPartnerFeeBps(request: unknown): number | undefined {
  const partner = partnerFee();
  if (!partner || !isRecord(request)) return undefined;
  return partnerFeeEchoMatches([{ recipient: partner.recipient, fee: partner.feeBps }], request.appFees)
    ? partner.feeBps
    : undefined;
}

export function checkedQuote(result: unknown, preview: Preview, requestBody: ReturnType<typeof quoteBody>): Record<string, unknown> {
  if (!result || typeof result !== "object") throw new Error("Missing NEAR quote");
  const { quote, quoteRequest } = result as ProviderQuote;
  if (!quote || !quoteRequest ||
      Object.entries(requestBody).some(([key, value]) =>
        key === "appFees" ? !partnerFeeEchoMatches(value, quoteRequest[key]) : quoteRequest[key] !== value) ||
      quote.amountIn !== preview.units) throw new Error("NEAR quote did not match selected confidential route");
  formatUnits(quote.amountOut, preview.to.decimals);
  formatUnits(quote.minAmountOut, preview.to.decimals);
  if (typeof quote.timeEstimate !== "number" || !Number.isFinite(quote.timeEstimate)) throw new Error("Invalid NEAR time estimate");
  return quote;
}

function orderResponse(
  quote: Record<string, unknown>, from: Token, to: Token, recipient: string, refundTo: string,
  status: string, updatedAt?: string, requestId?: string, appFeeBps?: number,
) {
  if (typeof quote.depositAddress !== "string" || !solanaAddress(quote.depositAddress) ||
      typeof quote.deadline !== "string" || !Number.isFinite(Date.parse(quote.deadline)) ||
      (quote.depositMemo !== undefined && quote.depositMemo !== null && typeof quote.depositMemo !== "string")) {
    throw new Error("Missing or invalid NEAR deposit instructions");
  }
  return {
    depositAddress: quote.depositAddress,
    ...(typeof quote.depositMemo === "string" && quote.depositMemo ? { depositMemo: quote.depositMemo } : {}),
    deadline: quote.deadline, from, to, amountIn: formatUnits(quote.amountIn, from.decimals),
    amountOut: formatUnits(quote.amountOut, to.decimals),
    minAmountOut: formatUnits(quote.minAmountOut, to.decimals),
    ...(quote.withdrawFee !== undefined ? { withdrawFee: formatUnits(quote.withdrawFee, to.decimals) } : {}),
    ...(quote.refundFee !== undefined ? { refundFee: formatUnits(quote.refundFee, from.decimals) } : {}),
    ...(appFeeBps !== undefined ? { appFeeBps } : {}),
    recipient, refundTo, status, ...(updatedAt ? { updatedAt } : {}),
    ...(requestId ? { requestId } : {}),
    estimatedSeconds: quote.timeEstimate,
  };
}

async function cleanExpiredPreviews(): Promise<void> {
  await db.execute(sql`
    DELETE FROM near_swap_previews
    WHERE quote_id IN (
      SELECT preview.quote_id
      FROM near_swap_previews AS preview
      WHERE preview.expires_at <= now()
        AND (
          preview.claimed_request_id IS NULL
          OR EXISTS (
            SELECT 1 FROM near_orders AS order_record
            WHERE order_record.id = preview.claimed_request_id
              AND order_record.state = 'ready'
          )
        )
      ORDER BY preview.expires_at
      LIMIT 100
    )
  `);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesNearRequest(
  value: unknown,
  preview: Preview,
  createdAt: Date,
  sentAppFees?: unknown,
): value is ReturnType<typeof quoteBody> {
  if (!isRecord(value)) return false;
  const expected = quoteBody(preview, false);
  if (Object.entries(expected).some(([key, expectedValue]) =>
    key !== "deadline" && key !== "appFees" && value[key] !== expectedValue)) return false;
  // Fees are validated against the persisted request this order was created
  // with, not the current configuration: legacy orders predate partner fees,
  // and the provider normalizes appFees in its echoes.
  if (!partnerFeeEchoMatches(sentAppFees, value.appFees)) return false;
  const deadline = typeof value.deadline === "string" ? Date.parse(value.deadline) : NaN;
  return Number.isFinite(deadline) &&
    deadline > createdAt.getTime() &&
    deadline <= createdAt.getTime() + 31 * 60_000;
}

function nearHistoryMatches(
  item: unknown,
  preview: Preview,
  requestCreatedAt: Date,
  requestBody: ReturnType<typeof quoteBody>,
): item is Record<string, unknown> {
  if (!isRecord(item) ||
      item.depositType !== "ORIGIN_CHAIN" ||
      item.recipientType !== "DESTINATION_CHAIN" ||
      item.refundType !== "ORIGIN_CHAIN" ||
      item.originAsset !== preview.from.id ||
      item.destinationAsset !== preview.to.id ||
      item.recipient !== requestBody.recipient ||
      item.refundTo !== requestBody.refundTo ||
      typeof item.createdAt !== "string" ||
      typeof item.depositAddress !== "string" ||
      !solanaAddress(item.depositAddress) ||
      (item.depositMemo !== undefined && item.depositMemo !== null && typeof item.depositMemo !== "string") ||
      typeof item.amountInFormatted !== "string") return false;

  const created = Date.parse(item.createdAt);
  const deadline = Date.parse(requestBody.deadline);
  const lower = requestCreatedAt.getTime() - 30_000;
  const upper = Math.min(deadline, requestCreatedAt.getTime() + 30 * 60_000);
  return Number.isFinite(created) && created >= lower && created <= upper &&
    atomic(item.amountInFormatted, preview.from.decimals) === preview.units;
}

export async function reconcileNearProviderResponse(
  receipt: typeof nearOrdersTable.$inferSelect,
  preview: Preview,
  requestBody: ReturnType<typeof quoteBody>,
): Promise<{ response: Record<string, unknown>; status: string; updatedAt?: string } | undefined> {
  const baseParams = new URLSearchParams({ search: preview.input.recipient, limit: "100" });
  baseParams.append("depositType", "ORIGIN_CHAIN");
  baseParams.append("recipientType", "DESTINATION_CHAIN");
  baseParams.append("refundType", "ORIGIN_CHAIN");

  const candidates: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  let historyComplete = false;
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams(baseParams);
    if (cursor) params.set("prevCursor", cursor);
    const result = await provider(`/account/history?${params.toString()}`);
    if (!isRecord(result) || !Array.isArray(result.items)) {
      throw new Error("NEAR order history returned an invalid response");
    }
    candidates.push(...result.items.filter((item) =>
      nearHistoryMatches(item, preview, receipt.createdAt, requestBody)) as Record<string, unknown>[]);

    const oldestCreated = result.items.reduce((oldest, item) => {
      if (!isRecord(item) || typeof item.createdAt !== "string") return oldest;
      const timestamp = Date.parse(item.createdAt);
      return Number.isFinite(timestamp) && timestamp < oldest ? timestamp : oldest;
    }, Number.POSITIVE_INFINITY);
    if (oldestCreated < receipt.createdAt.getTime() - 30_000 ||
        typeof result.prevCursor !== "string" || !result.prevCursor) {
      historyComplete = true;
      break;
    }
    cursor = result.prevCursor;
  }
  if (!historyComplete) return undefined;

  if (candidates.length !== 1) return undefined;
  const historyItem = candidates[0];
  if (!historyItem || typeof historyItem.depositAddress !== "string") return undefined;

  const statusParams = new URLSearchParams({ depositAddress: historyItem.depositAddress });
  if (typeof historyItem.depositMemo === "string" && historyItem.depositMemo) {
    statusParams.set("depositMemo", historyItem.depositMemo);
  }
  const statusResult = await provider(`/status?${statusParams.toString()}`);
  if (!isRecord(statusResult) ||
      typeof statusResult.status !== "string" ||
      !["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "INCOMPLETE_DEPOSIT", "PROCESSING", "SUCCESS", "REFUNDED", "FAILED"].includes(statusResult.status) ||
      !isRecord(statusResult.quoteResponse)) {
    throw new Error("NEAR order status returned an invalid response");
  }

  const quoteResponse = statusResult.quoteResponse;
  const quote = quoteResponse.quote;
  if (!isRecord(quote) ||
      quote.depositAddress !== historyItem.depositAddress ||
      (quote.depositMemo ?? null) !== (historyItem.depositMemo ?? null) ||
      !matchesNearRequest(quoteResponse.quoteRequest, preview, receipt.createdAt, requestBody.appFees)) {
    throw new Error("NEAR order history did not match the saved request");
  }
  return {
    response: quoteResponse,
    status: statusResult.status,
    ...(typeof statusResult.updatedAt === "string" ? { updatedAt: statusResult.updatedAt } : {}),
  };
}

async function finalizeNearOrder(
  requestId: string,
  preview: Preview,
  requestBody: ReturnType<typeof quoteBody>,
  providerResponse: unknown,
  status = "PENDING_DEPOSIT",
  updatedAt?: string,
): Promise<ReturnType<typeof CreateNearOrderResponse.parse>> {
  let order: ReturnType<typeof CreateNearOrderResponse.parse>;
  try {
    const quote = checkedQuote(providerResponse, preview, requestBody);
    if (BigInt(quote.minAmountOut as string) < preview.minOut) {
      throw new NearError("The minimum output changed. Request and review a fresh quote.", 409);
    }
    if (typeof quote.deadline !== "string" ||
        (status === "PENDING_DEPOSIT" && Date.parse(quote.deadline) <= Date.now())) {
      throw new NearError("The deposit deadline has passed. Do not send funds to this order.", 409);
    }
    order = CreateNearOrderResponse.parse(orderResponse(
      quote, preview.from, preview.to, preview.input.recipient, preview.input.refundTo, status,
      updatedAt, requestId,
      echoedPartnerFeeBps((providerResponse as ProviderQuote).quoteRequest),
    ));
  } catch (error) {
    await db.update(nearOrdersTable).set({ state: "review_needed" })
      .where(and(eq(nearOrdersTable.id, requestId), eq(nearOrdersTable.state, "provider_received")));
    throw error;
  }

  const [saved] = await db.update(nearOrdersTable).set({
    state: "ready",
    depositAddress: order.depositAddress,
    orderDetails: order,
  }).where(and(eq(nearOrdersTable.id, requestId), eq(nearOrdersTable.state, "provider_received")))
    .returning({ id: nearOrdersTable.id });
  if (saved) return order;

  const [latest] = await db.select().from(nearOrdersTable)
    .where(eq(nearOrdersTable.id, requestId)).limit(1);
  if (latest?.state === "ready") return CreateNearOrderResponse.parse(latest.orderDetails);
  throw new Error("Unable to save NEAR order receipt");
}

async function recoverNearOrderReceipt(
  receipt: typeof nearOrdersTable.$inferSelect,
): Promise<ReturnType<typeof CreateNearOrderResponse.parse> | undefined> {
  const [claimed] = await db.select().from(nearSwapPreviewsTable).where(and(
    eq(nearSwapPreviewsTable.quoteId, receipt.quoteId),
    eq(nearSwapPreviewsTable.claimedRequestId, receipt.id),
  )).limit(1);
  if (!claimed) return undefined;

  const preview: Preview = {
    input: claimed.input,
    from: claimed.fromAsset,
    to: claimed.toAsset,
    units: claimed.units,
    minOut: BigInt(claimed.minOut),
    expires: claimed.expiresAt.getTime(),
  };
  if (receipt.state === "ready" && receipt.orderDetails) {
    const saved = CreateNearOrderResponse.safeParse(receipt.orderDetails);
    return saved.success ? saved.data : undefined;
  }

  const requestBody = isRecord(receipt.providerRequest)
    ? receipt.providerRequest
    : isRecord(receipt.providerResponse) ? receipt.providerResponse.quoteRequest : undefined;
  if (!requestBody) return undefined;
  const sentAppFees = isRecord(requestBody) ? requestBody.appFees : undefined;
  if (!matchesNearRequest(requestBody, preview, receipt.createdAt, sentAppFees)) {
    if (receipt.providerResponse) {
      await db.update(nearOrdersTable).set({ state: "review_needed" })
        .where(and(
          eq(nearOrdersTable.id, receipt.id),
          inArray(nearOrdersTable.state, ["creating", "uncertain", "provider_received"]),
        ));
    }
    return undefined;
  }

  let response = isRecord(receipt.providerResponse) ? receipt.providerResponse : undefined;
  let recoveredStatus = "PENDING_DEPOSIT";
  let recoveredUpdatedAt: string | undefined;
  if (!response) {
    if (receipt.state !== "creating" && receipt.state !== "uncertain") return undefined;
    const recovered = await reconcileNearProviderResponse(
      receipt,
      preview,
      requestBody as ReturnType<typeof quoteBody>,
    );
    if (!recovered) return undefined;
    response = recovered.response;
    recoveredStatus = recovered.status;
    recoveredUpdatedAt = recovered.updatedAt;
  }

  if (receipt.state === "creating" || receipt.state === "uncertain") {
    const [recorded] = await db.update(nearOrdersTable).set({
      state: "provider_received",
      providerResponse: response,
    }).where(and(
      eq(nearOrdersTable.id, receipt.id),
      inArray(nearOrdersTable.state, ["creating", "uncertain"]),
    )).returning({ id: nearOrdersTable.id });
    if (!recorded) {
      const [latest] = await db.select().from(nearOrdersTable)
        .where(eq(nearOrdersTable.id, receipt.id)).limit(1);
      return latest ? recoverNearOrderReceipt(latest) : undefined;
    }
  }

  if (!isRecord(response) || !isRecord(response.quote)) {
    await db.update(nearOrdersTable).set({ state: "review_needed" })
      .where(and(eq(nearOrdersTable.id, receipt.id), eq(nearOrdersTable.state, "provider_received")));
    return undefined;
  }
  return finalizeNearOrder(
    receipt.id,
    preview,
    requestBody as ReturnType<typeof quoteBody>,
    response,
    recoveredStatus,
    recoveredUpdatedAt,
  );
}

async function existingOrderResponse(
  res: Response, previous: typeof nearOrdersTable.$inferSelect | undefined, quoteId: string,
): Promise<void> {
  if (!previous || previous.quoteId !== quoteId) {
    res.status(409).json({ error: "This request belongs to a different quote. Request a fresh one." });
    return;
  }
  if (previous.state === "ready" && previous.orderDetails) {
    res.json(await withRouteStatus(CreateNearOrderResponse.parse(previous.orderDetails)));
    return;
  }
  if (previous.state === "provider_received" || previous.state === "creating" || previous.state === "uncertain") {
    const recovered = await recoverNearOrderReceipt(previous);
    if (recovered) {
      res.json(await withRouteStatus(recovered));
      return;
    }
  }
  res.status(409).json({ error: "No deposit instructions are available for this request. Do not send funds; check this receipt again before creating another order." });
}

async function withRouteStatus(order: ReturnType<typeof CreateNearOrderResponse.parse>, postCreate = false) {
  return {
    ...order,
    routeStatus: await getNearServiceStatus(order.from.chain, order.to.chain, postCreate),
  };
}

router.get("/swap/near/service-status", limited(60, "near-service-status"), async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const parsed = GetNearServiceStatusQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Enter valid route network identifiers." }); return; }
  res.json(GetNearServiceStatusResponse.parse(await getNearServiceStatus(parsed.data.fromChain, parsed.data.toChain)));
});

router.get("/swap/near/tokens", configured, limited(30, "near-tokens"), async (req, res): Promise<void> => {
  const parsed = GetNearTokensQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Choose an asset side and shorter search term." }); return; }
  try {
    const { side, term = "" } = parsed.data;
    const search = term.trim().toLowerCase();
    const list = (await tokens()).filter(token => (side === "source" ? token.chain === "sol" : true) &&
      (!search || `${token.symbol} ${token.chainName}`.toLowerCase().includes(search)));
    res.json(GetNearTokensResponse.parse({ tokens: list }));
  } catch (error) { fail(req, res, error); }
});

router.post("/swap/near/quote", configured, limited(8, "near-quote"), async (req, res): Promise<void> => {
  const parsed = GetNearQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter assets, an amount, and valid recipient/refund addresses." }); return; }
  try {
    const input = parsed.data;
    const list = await tokens();
    const from = list.find(t => t.id === input.from && t.chain === "sol");
    const to = list.find(t => t.id === input.to);
    if (!from || !to || from.id === to.id || !solanaAddress(input.refundTo) || !destinationAddress(to.chain, input.recipient)) {
      res.status(400).json({ error: "Select supported assets and valid addresses for both networks." });
      return;
    }
    const units = atomic(input.amount, from.decimals);
    if (!units) { res.status(400).json({ error: "Enter a positive amount with valid decimal precision." }); return; }
    const usdValue = inputValueUsd(input.amount, from.price);
    if (usdValue === null) {
      res.status(503).json({ error: "Unable to verify the $3 USD minimum for this asset. Try again later." });
      return;
    }
    if (usdValue < MINIMUM_SWAP_USD) {
      res.status(400).json({ error: "Minimum swap amount is $3 USD. Increase the amount and request a new quote." });
      return;
    }
    const preview: Preview = { input, from, to, units, minOut: 0n, expires: Date.now() + 45_000 };
    const body = quoteBody(preview, true);
    const quote = checkedQuote(await provider("/quote", body), preview, body);
    preview.minOut = BigInt(quote.minAmountOut as string);
    await cleanExpiredPreviews();
    const expiresAt = new Date(preview.expires);
    let quoteId = randomUUID();
    let stored: unknown[] = [];
    for (let attempt = 0; attempt < 3 && stored.length === 0; attempt++) {
      const rows = await db.insert(nearSwapPreviewsTable).values({
        quoteId, input: preview.input, fromAsset: preview.from, toAsset: preview.to,
        units: preview.units, minOut: preview.minOut.toString(), expiresAt,
      }).onConflictDoNothing().returning({ quoteId: nearSwapPreviewsTable.quoteId });
      stored = rows;
      if (stored.length === 0) quoteId = randomUUID();
    }
    if (stored.length === 0) throw new Error("Unable to persist unique Privacy swap quote");
    res.json(GetNearQuoteResponse.parse({
      quoteId, from, to, amountIn: formatUnits(quote.amountIn, from.decimals),
      amountOut: formatUnits(quote.amountOut, to.decimals),
      minAmountOut: formatUnits(quote.minAmountOut, to.decimals),
      ...(quote.withdrawFee !== undefined ? { withdrawFee: formatUnits(quote.withdrawFee, to.decimals) } : {}),
      ...(quote.refundFee !== undefined ? { refundFee: formatUnits(quote.refundFee, from.decimals) } : {}),
      ...(partnerFee() ? { appFeeBps: partnerFee()!.feeBps } : {}),
      recipient: input.recipient, refundTo: input.refundTo,
      validUntil: new Date(preview.expires).toISOString(), estimatedSeconds: quote.timeEstimate,
    }));
  } catch (error) { fail(req, res, error); }
});

router.post("/swap/near/orders", configured, limited(4, "near-order"), async (req, res): Promise<void> => {
  const parsed = CreateNearOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Select a fresh quote before continuing." }); return; }
  const { requestId, quoteId } = parsed.data;
  let selectedChains: { from: string; to: string };
  // Replay/recovery must remain reachable while new funding is paused. Check
  // before eligibility and keep the existing on-conflict path for racing calls.
  try {
    const [previous] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, requestId)).limit(1);
    if (previous) {
      await existingOrderResponse(res, previous, quoteId);
      return;
    }
    const [preview] = await db.select().from(nearSwapPreviewsTable)
      .where(eq(nearSwapPreviewsTable.quoteId, quoteId)).limit(1);
    if (!preview || preview.claimedRequestId || preview.expiresAt.getTime() <= Date.now()) {
      res.status(409).json({ error: "This Privacy swap quote expired or has already been used. Check any existing receipt before requesting another quote." });
      return;
    }
    selectedChains = { from: preview.fromAsset.chain, to: preview.toAsset.chain };
    const routeStatus = await getNearServiceStatus(preview.fromAsset.chain, preview.toAsset.chain);
    if (routeStatus.eligibility !== "allowed") {
      // No reservation and no preview claim have been made.
      res.status(503).json({ error: routeStatus.reason });
      return;
    }
  } catch (error) { fail(req, res, error); return; }
  let rewardsAccountDid: string | undefined;
  try {
    rewardsAccountDid = await resolveOrderRewardsAccount(req.get("authorization"));
  } catch (error) {
    if (error instanceof RewardsAuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error("Unable to resolve NEAR order rewards association");
    res.status(503).json({ error: "Privacy swap is temporarily unavailable. Try again later." });
    return;
  }
  // Rewards verification can take time. Re-evaluate immediately before any
  // reservation or preview claim rather than trusting the earlier observation.
  const currentRouteStatus = await getNearServiceStatus(selectedChains.from, selectedChains.to);
  if (currentRouteStatus.eligibility !== "allowed") {
    res.status(503).json({ error: currentRouteStatus.reason });
    return;
  }
  let reservation: { id: string } | undefined;
  try {
    [reservation] = await db.insert(nearOrdersTable).values({
      id: requestId, quoteId, state: "creating", rewardsAccountDid: rewardsAccountDid ?? null,
    }).onConflictDoNothing().returning({ id: nearOrdersTable.id });
  } catch {
    req.log.error("Unable to reserve NEAR order");
    res.status(503).json({ error: "Privacy swap is temporarily unavailable. Try again later." });
    return;
  }
  if (!reservation) {
    try {
      const [previous] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, requestId)).limit(1);
      await existingOrderResponse(res, previous, quoteId);
    } catch (error) { fail(req, res, error); }
    return;
  }
  let preview: Preview;
  try {
    const [claimed] = await db.update(nearSwapPreviewsTable)
      .set({ claimedRequestId: requestId })
      .where(and(
        eq(nearSwapPreviewsTable.quoteId, quoteId),
        isNull(nearSwapPreviewsTable.claimedRequestId),
        gt(nearSwapPreviewsTable.expiresAt, new Date()),
      ))
      .returning();
    if (!claimed) {
      await db.delete(nearOrdersTable)
        .where(and(eq(nearOrdersTable.id, requestId), eq(nearOrdersTable.state, "creating")));
      res.status(409).json({ error: "This Privacy swap quote expired or has already been used. Request a new one before continuing." });
      return;
    }
    preview = {
      input: claimed.input,
      from: claimed.fromAsset,
      to: claimed.toAsset,
      units: claimed.units,
      minOut: BigInt(claimed.minOut),
      expires: claimed.expiresAt.getTime(),
    };
    const usdValue = inputValueUsd(preview.input.amount, preview.from.price);
    if (usdValue === null || usdValue < MINIMUM_SWAP_USD) {
      await db.update(nearOrdersTable).set({ state: "below_minimum" })
        .where(and(eq(nearOrdersTable.id, requestId), eq(nearOrdersTable.state, "creating")));
      res.status(409).json({ error: "The $3 USD minimum could not be confirmed for this quote. Request a fresh quote." });
      return;
    }
    const body = quoteBody(preview, false);
    const [prepared] = await db.update(nearOrdersTable).set({
      providerRequest: body,
    }).where(and(eq(nearOrdersTable.id, requestId), eq(nearOrdersTable.state, "creating")))
      .returning({ id: nearOrdersTable.id });
    if (!prepared) throw new Error("Unable to persist NEAR order request");

    const result = await provider("/quote", body);
    const [recorded] = await db.update(nearOrdersTable)
      .set({ state: "provider_received", providerResponse: result as Record<string, unknown> })
      .where(and(eq(nearOrdersTable.id, requestId), eq(nearOrdersTable.state, "creating")))
      .returning({ id: nearOrdersTable.id });
    if (!recorded) throw new Error("Unable to record NEAR provider result");
    const order = await finalizeNearOrder(requestId, preview, body, result);
    // Always persist the issued receipt first. An incident beginning during
    // creation changes funding guidance, never discards or replaces the order.
    res.json(await withRouteStatus(order, true));
  } catch (error) {
    try {
      // Leave an issued-but-unrecorded order blocked. Never call the provider
      // again for this request ID after an ambiguous outcome.
      await db.update(nearOrdersTable).set({ state: "uncertain" })
        .where(and(eq(nearOrdersTable.id, requestId), eq(nearOrdersTable.state, "creating")));
    } catch (stateError) {
      req.log.error({ err: stateError, requestId }, "Unable to mark NEAR order uncertain");
    }
    fail(req, res, error);
  }
});

router.get("/swap/near/orders/:requestId", configured, limited(30, "near-receipt"), async (req, res): Promise<void> => {
  const parsed = GetNearOrderReceiptParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Enter a valid order receipt ID." }); return; }
  try {
    const [receipt] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, parsed.data.requestId)).limit(1);
    if (!receipt) { res.status(404).json({ error: "No Privacy swap order was found for this receipt." }); return; }
    if (receipt.state === "provider_received" || receipt.state === "creating" || receipt.state === "uncertain") {
      const recovered = await recoverNearOrderReceipt(receipt);
      if (recovered) {
        res.json(GetNearOrderReceiptResponse.parse(await withRouteStatus(recovered)));
        return;
      }
    }
    if (receipt.state !== "ready" || !receipt.orderDetails || !receipt.providerResponse) {
      res.status(409).json({ error: "No deposit instructions are available for this request. Do not send funds; check this receipt again before creating another order." });
      return;
    }
    res.json(GetNearOrderReceiptResponse.parse(await withRouteStatus(CreateNearOrderResponse.parse(receipt.orderDetails))));
  } catch (error) { fail(req, res, error); }
});

router.get("/swap/near/status", configured, limited(60, "near-status"), async (req, res): Promise<void> => {
  const parsed = GetNearOrderStatusQueryParams.safeParse(req.query);
  if (!parsed.success || !solanaAddress(parsed.data?.depositAddress ?? "")) {
    res.status(400).json({ error: "Enter a valid Solana deposit address." });
    return;
  }
  try {
    const params = new URLSearchParams({ depositAddress: parsed.data.depositAddress });
    if (parsed.data.depositMemo) params.set("depositMemo", parsed.data.depositMemo);
    const result = await provider(`/status?${params.toString()}`) as Record<string, unknown>;
    const original = result?.quoteResponse as ProviderQuote | undefined;
    const request = original?.quoteRequest;
    const quote = original?.quote;
    const [receipt] = await db.select().from(nearOrdersTable).where(and(
      eq(nearOrdersTable.depositAddress, parsed.data.depositAddress),
      sql`coalesce(${nearOrdersTable.orderDetails}->>'depositMemo', '') = ${parsed.data.depositMemo ?? ""}`,
    )).limit(1);
    const saved = receipt?.state === "ready" ? CreateNearOrderResponse.safeParse(receipt.orderDetails) : null;
    const list = saved?.success ? [] : await tokens();
    const from = saved?.success ? saved.data.from : list.find(t => t.id === request?.originAsset && t.chain === "sol");
    const to = saved?.success ? saved.data.to : list.find(t => t.id === request?.destinationAsset);
    const allowed = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "INCOMPLETE_DEPOSIT", "PROCESSING", "SUCCESS", "REFUNDED", "FAILED"];
    if (!from || !to || request?.originAsset !== from.id || request?.destinationAsset !== to.id ||
        request?.confidentiality !== "basic" || request?.depositType !== "ORIGIN_CHAIN" ||
        typeof request?.recipient !== "string" || typeof request?.refundTo !== "string" ||
        !quote || quote.depositAddress !== parsed.data.depositAddress ||
        (quote.depositMemo ?? "") !== (parsed.data.depositMemo ?? "") ||
        (saved?.success && (request.recipient !== saved.data.recipient || request.refundTo !== saved.data.refundTo)) ||
        !allowed.includes(result?.status as string)) throw new Error("Unexpected NEAR order status");
    res.set("Cache-Control", "no-store");
    res.json(GetNearOrderStatusResponse.parse(await withRouteStatus(CreateNearOrderResponse.parse(orderResponse(
      quote, from, to, request.recipient, request.refundTo, result.status as string,
      typeof result.updatedAt === "string" ? result.updatedAt : undefined,
      saved?.success ? saved.data.requestId : undefined,
      echoedPartnerFeeBps(request),
    )))));
  } catch (error) { fail(req, res, error); }
});

export default router;