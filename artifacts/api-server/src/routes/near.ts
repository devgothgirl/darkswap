import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { db, nearOrdersTable } from "@workspace/db";
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
} from "@workspace/api-zod";

const router: IRouter = Router();
const BASE = "https://1click.chaindefuser.com/v0";
const DESTINATIONS = new Set(["sol", "near", "eth", "arb", "base", "op", "pol", "bsc"]);
const CHAIN_NAMES: Record<string, string> = {
  sol: "Solana", near: "NEAR", eth: "Ethereum", arb: "Arbitrum",
  base: "Base", op: "Optimism", pol: "Polygon", bsc: "BNB Chain",
};
type Token = { id: string; symbol: string; chain: string; chainName: string; decimals: number; price?: number; contractAddress?: string };
type QuoteInput = { from: string; to: string; amount: string; recipient: string; refundTo: string };
type Preview = { input: QuoteInput; from: Token; to: Token; units: string; minOut: bigint; expires: number };
type ProviderQuote = {
  quoteRequest?: Record<string, unknown>;
  quote?: Record<string, unknown>;
};
let tokenCache: { tokens: Token[]; expires: number } | null = null;
const previews = new Map<string, Preview>();
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
  const response = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-API-Key": process.env.NEAR_INTENTS_API_KEY! },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if (response.status === 404) throw new NearError("No matching Privacy swap order was found.", 404);
    if (response.status === 400 || response.status === 422) throw new NearError("No Privacy swap route is available for these details. Check the addresses and amount.", 400);
    if (response.status === 401 || response.status === 403) throw new NearError("Privacy swap is unavailable. Use the existing private route.", 503);
    throw new NearError("Privacy swap is temporarily unavailable. Try again later.", 502);
  }
  return response.json();
}

function fail(req: Request, res: Response, error: unknown): void {
  if (error instanceof NearError) {
    req.log.warn({ status: error.status }, "NEAR route unavailable");
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log.error({ err: error }, "NEAR route response failed validation");
  res.status(502).json({ error: "Privacy swap returned invalid data. Do not send funds; try again." });
}

async function tokens(): Promise<Token[]> {
  if (tokenCache && tokenCache.expires > Date.now()) return tokenCache.tokens;
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

function quoteBody(preview: Preview, dry: boolean) {
  return {
    dry, swapType: "EXACT_INPUT", slippageTolerance: 100,
    originAsset: preview.from.id, depositType: "ORIGIN_CHAIN",
    destinationAsset: preview.to.id, amount: preview.units,
    recipient: preview.input.recipient, recipientType: "DESTINATION_CHAIN",
    refundTo: preview.input.refundTo, refundType: "ORIGIN_CHAIN",
    confidentiality: "basic",
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
}

function checkedQuote(result: unknown, preview: Preview, requestBody: ReturnType<typeof quoteBody>): Record<string, unknown> {
  if (!result || typeof result !== "object") throw new Error("Missing NEAR quote");
  const { quote, quoteRequest } = result as ProviderQuote;
  if (!quote || !quoteRequest ||
      Object.entries(requestBody).some(([key, value]) => quoteRequest[key] !== value) ||
      quote.amountIn !== preview.units) throw new Error("NEAR quote did not match selected confidential route");
  formatUnits(quote.amountOut, preview.to.decimals);
  formatUnits(quote.minAmountOut, preview.to.decimals);
  if (typeof quote.timeEstimate !== "number" || !Number.isFinite(quote.timeEstimate)) throw new Error("Invalid NEAR time estimate");
  return quote;
}

function orderResponse(
  quote: Record<string, unknown>, from: Token, to: Token, recipient: string, refundTo: string,
  status: string, updatedAt?: string, requestId?: string,
) {
  if (typeof quote.depositAddress !== "string" || !solanaAddress(quote.depositAddress) ||
      typeof quote.deadline !== "string" || !Number.isFinite(Date.parse(quote.deadline)) ||
      (quote.depositMemo !== undefined && typeof quote.depositMemo !== "string")) {
    throw new Error("Missing or invalid NEAR deposit instructions");
  }
  return {
    depositAddress: quote.depositAddress, ...(quote.depositMemo ? { depositMemo: quote.depositMemo } : {}),
    deadline: quote.deadline, from, to, amountIn: formatUnits(quote.amountIn, from.decimals),
    amountOut: formatUnits(quote.amountOut, to.decimals),
    minAmountOut: formatUnits(quote.minAmountOut, to.decimals),
    ...(quote.withdrawFee !== undefined ? { withdrawFee: formatUnits(quote.withdrawFee, to.decimals) } : {}),
    ...(quote.refundFee !== undefined ? { refundFee: formatUnits(quote.refundFee, from.decimals) } : {}),
    recipient, refundTo, status, ...(updatedAt ? { updatedAt } : {}),
    ...(requestId ? { requestId } : {}),
    estimatedSeconds: quote.timeEstimate,
  };
}

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
    const preview: Preview = { input, from, to, units, minOut: 0n, expires: Date.now() + 45_000 };
    const body = quoteBody(preview, true);
    const quote = checkedQuote(await provider("/quote", body), preview, body);
    preview.minOut = BigInt(quote.minAmountOut as string);
    if (previews.size > 5000) for (const [id, value] of previews) if (value.expires < Date.now()) previews.delete(id);
    const quoteId = randomUUID();
    previews.set(quoteId, preview);
    res.json(GetNearQuoteResponse.parse({
      quoteId, from, to, amountIn: formatUnits(quote.amountIn, from.decimals),
      amountOut: formatUnits(quote.amountOut, to.decimals),
      minAmountOut: formatUnits(quote.minAmountOut, to.decimals),
      ...(quote.withdrawFee !== undefined ? { withdrawFee: formatUnits(quote.withdrawFee, to.decimals) } : {}),
      ...(quote.refundFee !== undefined ? { refundFee: formatUnits(quote.refundFee, from.decimals) } : {}),
      recipient: input.recipient, refundTo: input.refundTo,
      validUntil: new Date(preview.expires).toISOString(), estimatedSeconds: quote.timeEstimate,
    }));
  } catch (error) { fail(req, res, error); }
});

router.post("/swap/near/orders", configured, limited(4, "near-order"), async (req, res): Promise<void> => {
  const parsed = CreateNearOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Select a fresh quote before continuing." }); return; }
  try {
    const [previous] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, parsed.data.requestId)).limit(1);
    if (previous) {
      if (previous.quoteId !== parsed.data.quoteId) { res.status(409).json({ error: "This request belongs to a different quote. Request a fresh one." }); return; }
      if (previous.state === "ready" && previous.orderDetails) {
        res.json(CreateNearOrderResponse.parse(previous.orderDetails)); return;
      }
      res.status(409).json({ error: "No deposit instructions are available for this request yet. Do not send funds; check its receipt or request a fresh quote." });
      return;
    }
  } catch (error) { fail(req, res, error); return; }
  const preview = previews.get(parsed.data.quoteId);
  if (!preview || preview.expires < Date.now()) {
    res.status(409).json({ error: "This Privacy swap quote expired. Request a new one before continuing." });
    return;
  }
  // Consume before awaiting: one preview must not generate multiple deposit addresses.
  previews.delete(parsed.data.quoteId);
  try {
    await db.insert(nearOrdersTable).values({
      id: parsed.data.requestId, quoteId: parsed.data.quoteId, state: "creating",
    });
    const body = quoteBody(preview, false);
    const result = await provider("/quote", body);
    const quote = checkedQuote(result, preview, body);
    if (BigInt(quote.minAmountOut as string) < preview.minOut) {
      res.status(409).json({ error: "The minimum output changed. Request and review a fresh quote." });
      return;
    }
    if (typeof quote.deadline !== "string" || Date.parse(quote.deadline) <= Date.now()) {
      throw new Error("Expired NEAR deposit deadline");
    }
    const order = CreateNearOrderResponse.parse(orderResponse(
      quote, preview.from, preview.to, preview.input.recipient, preview.input.refundTo, "PENDING_DEPOSIT",
      undefined, parsed.data.requestId,
    ));
    await db.update(nearOrdersTable).set({
      state: "ready", depositAddress: order.depositAddress,
      providerResponse: result as Record<string, unknown>, orderDetails: order,
    }).where(and(eq(nearOrdersTable.id, parsed.data.requestId), eq(nearOrdersTable.state, "creating")));
    res.json(order);
  } catch (error) { fail(req, res, error); }
});

router.get("/swap/near/orders/:requestId", configured, limited(30, "near-receipt"), async (req, res): Promise<void> => {
  const parsed = GetNearOrderReceiptParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Enter a valid order receipt ID." }); return; }
  try {
    const [receipt] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, parsed.data.requestId)).limit(1);
    if (!receipt) { res.status(404).json({ error: "No Privacy swap order was found for this receipt." }); return; }
    if (receipt.state !== "ready" || !receipt.orderDetails || !receipt.providerResponse) {
      res.status(409).json({ error: "No deposit instructions are available for this request. Do not send funds; request a fresh quote if it does not complete." });
      return;
    }
    res.json(GetNearOrderReceiptResponse.parse(receipt.orderDetails));
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
    const [receipt] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.depositAddress, parsed.data.depositAddress)).limit(1);
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
    res.json(GetNearOrderStatusResponse.parse(orderResponse(
      quote, from, to, request.recipient, request.refundTo, result.status as string,
      typeof result.updatedAt === "string" ? result.updatedAt : undefined,
      saved?.success ? saved.data.requestId : undefined,
    )));
  } catch (error) { fail(req, res, error); }
});

export default router;