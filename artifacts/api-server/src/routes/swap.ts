import { createHash } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, privateSwapOrderClaimsTable } from "@workspace/db";
import {
  SearchSwapTokensQueryParams,
  SearchSwapTokensResponse,
  GetSwapChainsResponse,
  GetPrivateQuotesQueryParams,
  GetPrivateQuotesResponse,
  CreatePrivateOrderBody,
  CreatePrivateOrderResponse,
  GetPrivateOrderParams,
  GetPrivateOrderResponse,
} from "@workspace/api-zod";
import {
  houdiniRequest,
  HoudiniError,
  NotSentHoudiniError,
  type ProviderToken,
  type ProviderQuote,
  type ProviderOrder,
} from "../lib/houdini";
import {
  issueQuoteTicket,
  issueTokenTicket,
  readQuoteTicket,
  readQuoteTicketDetails,
  readTokenTicket,
} from "../lib/swap-tickets";
import { MINIMUM_SWAP_USD } from "../lib/swap-minimum";
import { valuePrivateQuotes } from "../lib/private-quote-value";
import { resolveOrderRewardsAccount, RewardsAuthError } from "../lib/rewards";
const router: IRouter = Router();
const tokenCache = new Map<string, { expires: number; tokens: ReturnType<typeof normalizeToken>[]; total: number }>();
const tokenLoads = new Map<string, Promise<{ tokens: ReturnType<typeof normalizeToken>[]; total: number }>>();
let chainCache: { expires: number; chains: { id: string; name: string }[] } | null = null;
let chainLoading: Promise<{ id: string; name: string }[]> | null = null;
const requestCounts = new Map<string, { count: number; reset: number }>();
const TOKEN_CACHE_TTL_MS = 60_000;
const TOKEN_CACHE_MAX_ENTRIES = 500;
const ORDER_CLAIM_PENDING_ERROR = "An order claim for this quote is still being resolved. Please try again shortly.";
const ORDER_CLAIM_UNCERTAIN_ERROR = "Order creation could not be confirmed. This quote cannot be submitted again.";

function hashOrderInput(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function recipientBinding(addressTo: string, destinationTag?: string): string {
  return hashOrderInput(JSON.stringify({
    addressTo: addressTo.trim(),
    destinationTag: destinationTag?.trim() ?? "",
  }));
}

type ReconciliationQuote = {
  fromTokenId: string;
  toTokenId: string;
  amountIn: number;
  amountOut: number;
};

function limit(max: number, bucket: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${bucket}:${req.ip ?? "unknown"}`;
    const record = requestCounts.get(key);
    if (requestCounts.size > 5000) {
      for (const [id, value] of requestCounts) {
        if (value.reset < now) requestCounts.delete(id);
      }
    }
    if (!record || record.reset < now) {
      requestCounts.set(key, { count: 1, reset: now + 60_000 });
    } else if (record.count >= max) {
      res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
      return;
    } else {
      record.count++;
    }
    next();
  };
}

function normalizeToken(token: ProviderToken) {
  return {
    id: token.id,
    symbol: token.symbol,
    name: token.name,
    chain: token.chainData?.shortName ?? "",
    chainName: token.chainData?.name ?? token.chainData?.shortName ?? "",
    decimals: token.decimals ?? 0,
    requiresMemo: token.chainData?.memoNeeded === true,
    ...(token.icon ? { icon: token.icon } : {}),
    ...(typeof token.price === "number" ? { price: token.price } : {}),
  };
}

async function loadTokens(
  cacheKey: string,
  side: "source" | "destination",
  term: string,
  chain?: string,
): Promise<{ tokens: ReturnType<typeof normalizeToken>[]; total: number }> {
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    tokenCache.delete(cacheKey);
    tokenCache.set(cacheKey, cached);
    return { tokens: cached.tokens, total: cached.total };
  }
  if (cached) tokenCache.delete(cacheKey);
  const activeLoad = tokenLoads.get(cacheKey);
  if (activeLoad) return activeLoad;

  const load = (async () => {
    const params = new URLSearchParams({ hasCex: "true", pageSize: "100", page: "1" });
    if (side === "source") params.set("chain", "solana");
    else if (chain) params.set("chain", chain);
    if (term.trim()) params.set("term", term.trim());
    const result = await houdiniRequest<{ tokens: ProviderToken[]; total: number }>(
      `/tokens?${params.toString()}`,
    );
    if (!Array.isArray(result.tokens)) throw new Error("Invalid tokens response");
    const tokens = result.tokens
      .filter((token) => token.enabled !== false && token.hasCex !== false)
      .filter((token) => side !== "source" || token.chainData?.shortName?.toLowerCase() === "solana")
      .map((token) => {
        const normalized = normalizeToken(token);
        return {
          ...normalized,
          id: issueTokenTicket(token.id, token.chainData?.shortName ?? "", side),
        };
      })
      .sort((a, b) => {
        const priority = (symbol: string) => ({ SOL: 0, USDC: 1, USDT: 2 }[symbol.toUpperCase()] ?? 10);
        return priority(a.symbol) - priority(b.symbol);
      });
    const total = Number(result.total) || tokens.length;
    const now = Date.now();
    for (const [key, value] of tokenCache) {
      if (value.expires <= now) tokenCache.delete(key);
    }
    tokenCache.delete(cacheKey);
    tokenCache.set(cacheKey, { tokens, total, expires: now + TOKEN_CACHE_TTL_MS });
    while (tokenCache.size > TOKEN_CACHE_MAX_ENTRIES) {
      const oldest = tokenCache.keys().next().value;
      if (oldest === undefined) break;
      tokenCache.delete(oldest);
    }
    return { tokens, total };
  })();
  tokenLoads.set(cacheKey, load);
  try {
    return await load;
  } finally {
    if (tokenLoads.get(cacheKey) === load) tokenLoads.delete(cacheKey);
  }
}

function handleError(req: Request, res: Response, error: unknown): void {
  if (error instanceof HoudiniError) {
    req.log.warn({ status: error.status }, "Houdini request failed");
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log.error({ err: error }, "Swap request failed");
  res.status(502).json({ error: "The swap provider returned invalid data. Please try again." });
}

router.get("/swap/tokens", limit(30, "tokens"), async (req, res): Promise<void> => {
  const parsed = SearchSwapTokensQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a token side and use a shorter search term." });
    return;
  }
  const { side, term = "", chain } = parsed.data;
  const cacheKey = `${side}:${chain?.toLowerCase() ?? ""}:${term.trim().toLowerCase()}`;

  try {
    const result = await loadTokens(cacheKey, side, term, chain);
    res.json(SearchSwapTokensResponse.parse(result));
  } catch (error) {
    handleError(req, res, error);
  }
});

router.get("/swap/chains", limit(30, "chains"), async (req, res): Promise<void> => {
  try {
    if (!chainCache || chainCache.expires <= Date.now()) {
      if (!chainLoading) {
        chainLoading = (async () => {
          const chains: { id: string; name: string }[] = [];
          for (let page = 1; page <= 20; page++) {
            const params = new URLSearchParams({ hasCex: "true", pageSize: "100", page: String(page) });
            const result = await houdiniRequest<{
              chains: { name?: string; shortName?: string; enabled?: boolean; hasCex?: boolean }[];
              totalPages?: number;
            }>(`/chains?${params.toString()}`);
            if (!Array.isArray(result.chains)) throw new Error("Invalid chains response");
            for (const chain of result.chains) {
              if (chain.enabled === false || chain.hasCex === false || !chain.shortName || !chain.name) continue;
              if (!chains.some(existing => existing.id === chain.shortName)) {
                chains.push({ id: chain.shortName, name: chain.name });
              }
            }
            if (typeof result.totalPages === "number" && page >= result.totalPages) break;
            if (result.chains.length < 100) break;
            if (page === 20) throw new Error("Destination network catalog exceeds supported page limit");
          }
          chainCache = { chains, expires: Date.now() + 60_000 };
          return chains;
        })();
      }
      try {
        await chainLoading;
      } finally {
        chainLoading = null;
      }
    }
    res.json(GetSwapChainsResponse.parse({ chains: chainCache!.chains }));
  } catch (error) {
    handleError(req, res, error);
  }
});

router.get("/swap/quotes", limit(20, "quotes"), async (req, res): Promise<void> => {
  const parsed = GetPrivateQuotesQueryParams.safeParse(req.query);
  if (!parsed.success || !Number.isFinite(parsed.data?.amount)) {
    res.status(400).json({ error: "Enter a valid amount and select both tokens." });
    return;
  }
  const { from, to, amount, timezone } = parsed.data;
  const sourceToken = readTokenTicket(from, "source");
  const destinationToken = readTokenTicket(to, "destination");
  if (
    !sourceToken ||
    sourceToken.chain.toLowerCase() !== "solana" ||
    !destinationToken
  ) {
    res.status(400).json({ error: "Refresh the token list and choose your assets again." });
    return;
  }
  try {
    const params = new URLSearchParams({
      from: sourceToken.providerId,
      to: destinationToken.providerId,
      amount: String(amount),
      types: "private",
    });
    const result = await houdiniRequest<{ quotes: ProviderQuote[] }>(
      `/quotes?${params.toString()}`,
      { userIp: req.ip, userAgent: req.get("user-agent"), timezone },
    );
    if (!Array.isArray(result.quotes)) throw new Error("Invalid quotes response");
    const eligible = result.quotes.filter(
      (quote) =>
        quote.type === "private" &&
        !!quote.quoteId &&
        typeof quote.amountIn === "number" &&
        typeof quote.amountOut === "number" &&
        !quote.filtered &&
        !quote.error &&
        !quote.requiresRefundAddress,
    );
    const verified = await valuePrivateQuotes(eligible, sourceToken.providerId, amount);
    if (eligible.length > 0 && verified.length === 0) {
      res.status(503).json({ error: "Unable to verify the $3 USD minimum for this route. Try again later." });
      return;
    }
    const quotes = verified.filter(quote => quote.amountInUsd! >= MINIMUM_SWAP_USD).slice(0, 8);
    if (verified.length > 0 && quotes.length === 0) {
      res.status(400).json({ error: "Minimum swap amount is $3 USD. Increase the amount and request a new quote." });
      return;
    }
    const now = Date.now();
    const ticketedQuotes = quotes.flatMap((quote) => {
      const validUntil = quote.validUntil ? Date.parse(quote.validUntil) : NaN;
      const expires = Number.isFinite(validUntil) ? Math.min(validUntil, now + 8 * 60_000) : now + 5 * 60_000;
      if (expires <= now) return [];
      return [{
        ...quote,
        quoteId: issueQuoteTicket(quote.quoteId!, expires, quote.amountInUsd!, {
          fromTokenId: sourceToken.providerId,
          toTokenId: destinationToken.providerId,
          amountIn: quote.amountIn!,
          amountOut: quote.amountOut!,
        }),
      }];
    });
    res.json(GetPrivateQuotesResponse.parse({ quotes: ticketedQuotes, total: ticketedQuotes.length }));
  } catch (error) {
    handleError(req, res, error);
  }
});

router.post("/swap/orders", limit(5, "create-order"), async (req, res): Promise<void> => {
  const parsed = CreatePrivateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid recipient address and select a fresh quote." });
    return;
  }
  const { quoteId, addressTo, destinationTag } = parsed.data;
  let rewardsAccountDid: string | undefined;
  try {
    rewardsAccountDid = await resolveOrderRewardsAccount(req.get("authorization"));
  } catch (error) {
    if (error instanceof RewardsAuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error("Unable to resolve private order rewards association");
    res.status(503).json({ error: "Order creation is temporarily unavailable. Please try again later." });
    return;
  }

  const quoteTicket = readQuoteTicketDetails(quoteId, 0);
  // A signed but expired ticket can still identify a previously saved order.
  // It must never create a new one.
  if (!quoteTicket) {
    res.status(400).json({ error: "This quote expired. Request a fresh quote before creating an order." });
    return;
  }
  const providerQuoteId = quoteTicket.providerQuoteId;
  const quoteHash = hashOrderInput(`houdini-private-order-quote:v1\0${providerQuoteId}`);
  const recipientHash = recipientBinding(addressTo, destinationTag);
  if (!readQuoteTicket(quoteId, Date.now(), true)) {
    try {
      const [existing] = await db.select().from(privateSwapOrderClaimsTable)
        .where(eq(privateSwapOrderClaimsTable.quoteHash, quoteHash))
        .limit(1);
      if (existing?.recipientHash === recipientHash) {
        const saved = await recoverPrivateSwapReceipt(existing);
        if (saved) {
          res.json(saved);
          return;
        }
      }
      res.status(409).json({ error: "This quote expired. Request a fresh quote before creating an order." });
    } catch (error) {
      req.log.error({ err: error }, "Unable to recover expired private swap order");
      res.status(503).json({ error: "Order recovery is temporarily unavailable. Please try again." });
    }
    return;
  }
  let claimed: { quoteHash: string } | undefined;
  try {
    [claimed] = await db.insert(privateSwapOrderClaimsTable).values({
      quoteHash,
      recipientHash,
      state: "creating",
      providerRequest: quoteTicket.context ? {
        quote: quoteTicket.context,
      } : null,
      rewardsAccountDid: rewardsAccountDid ?? null,
    }).onConflictDoNothing().returning({ quoteHash: privateSwapOrderClaimsTable.quoteHash });
  } catch (error) {
    req.log.error("Unable to claim private swap order");
    res.status(503).json({ error: "Order creation is temporarily unavailable. Please try again later." });
    return;
  }

  if (!claimed) {
    try {
      const [existing] = await db.select().from(privateSwapOrderClaimsTable)
        .where(eq(privateSwapOrderClaimsTable.quoteHash, quoteHash))
        .limit(1);
      if (!existing) {
        res.status(503).json({ error: ORDER_CLAIM_UNCERTAIN_ERROR });
        return;
      }
      if (existing.recipientHash !== recipientHash) {
        res.status(409).json({ error: "This quote has already been claimed for a different recipient." });
        return;
      }
      const savedOrder = await recoverPrivateSwapReceipt(existing);
      if (savedOrder) {
        res.json(savedOrder);
        return;
      }
      res.status(503).json({
        error: existing.state === "creating" ? ORDER_CLAIM_PENDING_ERROR : ORDER_CLAIM_UNCERTAIN_ERROR,
      });
    } catch (error) {
      req.log.error({ err: error }, "Unable to read private swap order claim");
      res.status(503).json({ error: "Order creation is temporarily unavailable. Please try again later." });
    }
    return;
  }

  let providerOrder: unknown;
  try {
    providerOrder = await houdiniRequest<ProviderOrder>("/exchanges", {
      method: "POST",
      body: {
        quoteId: providerQuoteId,
        addressTo: addressTo.trim(),
        ...(destinationTag ? { destinationTag: destinationTag.trim() } : {}),
      },
      userIp: req.ip,
      userAgent: req.get("user-agent"),
    });
  } catch (error) {
    try {
      if (error instanceof NotSentHoudiniError) {
        await db.delete(privateSwapOrderClaimsTable).where(and(
          eq(privateSwapOrderClaimsTable.quoteHash, quoteHash),
          eq(privateSwapOrderClaimsTable.state, "creating"),
        ));
      } else {
        await db.update(privateSwapOrderClaimsTable).set({
          state: "uncertain",
          updatedAt: new Date(),
        }).where(and(
          eq(privateSwapOrderClaimsTable.quoteHash, quoteHash),
          eq(privateSwapOrderClaimsTable.state, "creating"),
        ));
      }
    } catch (stateError) {
      req.log.error({ err: stateError, quoteHash }, "Unable to mark private swap order claim uncertain");
    }
    handleError(req, res, error);
    return;
  }

  try {
    const [recorded] = await db.update(privateSwapOrderClaimsTable).set({
      state: "provider_received",
      providerResponse: providerOrder as Record<string, unknown>,
      updatedAt: new Date(),
    }).where(and(
      eq(privateSwapOrderClaimsTable.quoteHash, quoteHash),
      eq(privateSwapOrderClaimsTable.state, "creating"),
    )).returning({ quoteHash: privateSwapOrderClaimsTable.quoteHash });
    if (!recorded) throw new Error("Private swap provider response could not be recorded");

    const validatedOrder = await persistPrivateSwapReceipt(quoteHash, providerOrder);
    if (!validatedOrder) {
      res.status(503).json({ error: ORDER_CLAIM_UNCERTAIN_ERROR });
      return;
    }
    res.json(validatedOrder);
  } catch (error) {
    try {
      await db.update(privateSwapOrderClaimsTable).set({
        state: "uncertain",
        updatedAt: new Date(),
      }).where(and(
        eq(privateSwapOrderClaimsTable.quoteHash, quoteHash),
        eq(privateSwapOrderClaimsTable.state, "creating"),
      ));
    } catch (stateError) {
      req.log.error({ err: stateError, quoteHash }, "Unable to mark private swap order claim uncertain");
    }
    req.log.error({ err: error, quoteHash }, "Unable to save private swap order response");
    res.status(503).json({ error: ORDER_CLAIM_UNCERTAIN_ERROR });
    return;
  }
});

router.get("/swap/orders/:id", limit(60, "order-status"), async (req, res): Promise<void> => {
  const parsed = GetPrivateOrderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid order ID." });
    return;
  }
  try {
    const order = await houdiniRequest<ProviderOrder>(
      `/orders/${encodeURIComponent(parsed.data.id)}`,
    );
    res.json(GetPrivateOrderResponse.parse(order));
  } catch (error) {
    handleError(req, res, error);
  }
});

export default router;

async function recoverPrivateSwapReceipt(
  claim: typeof privateSwapOrderClaimsTable.$inferSelect,
): Promise<ReturnType<typeof CreatePrivateOrderResponse.parse> | undefined> {
  if (claim.state === "ready") {
    const parsed = CreatePrivateOrderResponse.safeParse(claim.response);
    return parsed.success ? parsed.data : undefined;
  }
  if (claim.state === "provider_received" && claim.providerResponse !== null) {
    return persistPrivateSwapReceipt(claim.quoteHash, claim.providerResponse);
  }
  if (claim.state !== "creating" && claim.state !== "uncertain") return undefined;

  const providerOrder = await reconcilePrivateSwapOrder(claim);
  if (!providerOrder) return undefined;
  const [recorded] = await db.update(privateSwapOrderClaimsTable).set({
    state: "provider_received",
    providerResponse: providerOrder as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  }).where(and(
    eq(privateSwapOrderClaimsTable.quoteHash, claim.quoteHash),
    inArray(privateSwapOrderClaimsTable.state, ["creating", "uncertain"]),
  )).returning({ quoteHash: privateSwapOrderClaimsTable.quoteHash });
  if (!recorded) {
    const [latest] = await db.select().from(privateSwapOrderClaimsTable)
      .where(eq(privateSwapOrderClaimsTable.quoteHash, claim.quoteHash)).limit(1);
    return latest ? recoverPrivateSwapReceipt(latest) : undefined;
  }
  return persistPrivateSwapReceipt(claim.quoteHash, providerOrder);
}

function reconciliationQuote(value: unknown): ReconciliationQuote | undefined {
  if (!isRecord(value) ||
      typeof value.fromTokenId !== "string" ||
      typeof value.toTokenId !== "string" ||
      typeof value.amountIn !== "number" || !Number.isFinite(value.amountIn) ||
      typeof value.amountOut !== "number" || !Number.isFinite(value.amountOut)) return undefined;
  return {
    fromTokenId: value.fromTokenId,
    toTokenId: value.toTokenId,
    amountIn: value.amountIn,
    amountOut: value.amountOut,
  };
}

async function persistPrivateSwapReceipt(
  quoteHash: string,
  providerResponse: unknown,
): Promise<ReturnType<typeof CreatePrivateOrderResponse.parse> | undefined> {
  const parsed = CreatePrivateOrderResponse.safeParse(providerResponse);
  if (!parsed.success) {
    await db.update(privateSwapOrderClaimsTable).set({
      state: "review_needed",
      providerResponse: providerResponse as Record<string, unknown>,
      updatedAt: new Date(),
    }).where(and(
      eq(privateSwapOrderClaimsTable.quoteHash, quoteHash),
      eq(privateSwapOrderClaimsTable.state, "provider_received"),
    ));
    return undefined;
  }

  const [saved] = await db.update(privateSwapOrderClaimsTable).set({
    state: "ready",
    response: parsed.data,
    updatedAt: new Date(),
  }).where(and(
    eq(privateSwapOrderClaimsTable.quoteHash, quoteHash),
    eq(privateSwapOrderClaimsTable.state, "provider_received"),
  )).returning({ quoteHash: privateSwapOrderClaimsTable.quoteHash });
  if (saved) return parsed.data;

  const [latest] = await db.select().from(privateSwapOrderClaimsTable)
    .where(eq(privateSwapOrderClaimsTable.quoteHash, quoteHash)).limit(1);
  if (latest?.state === "ready") {
    const receipt = CreatePrivateOrderResponse.safeParse(latest.response);
    if (receipt.success) return receipt.data;
  }
  return undefined;
}

function matchesPrivateOrder(
  order: ProviderOrder,
  claim: typeof privateSwapOrderClaimsTable.$inferSelect,
  quote: ReconciliationQuote,
  from: number,
  to: number,
): boolean {
  const created = typeof order.created === "string" ? Date.parse(order.created) : NaN;
  return typeof order.houdiniId === "string" &&
    order.anonymous === true &&
    typeof order.receiverAddress === "string" &&
    recipientBinding(order.receiverAddress, order.receiverTag ?? undefined) === claim.recipientHash &&
    order.inToken?.id === quote.fromTokenId &&
    order.outToken?.id === quote.toTokenId &&
    closeAmount(order.inAmount, quote.amountIn) &&
    closeAmount(order.outAmount, quote.amountOut) &&
    Number.isFinite(created) && created >= from && created <= to;
}

function closeAmount(actual: unknown, expected: number): boolean {
  return typeof actual === "number" && Number.isFinite(actual) &&
    Math.abs(actual - expected) <= Math.max(1e-10, Math.abs(expected) * 1e-8);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function reconcilePrivateSwapOrder(
  claim: typeof privateSwapOrderClaimsTable.$inferSelect,
): Promise<ProviderOrder | undefined> {
  if (!isRecord(claim.providerRequest)) return undefined;
  const quote = reconciliationQuote(claim.providerRequest.quote);
  if (!quote) return undefined;

  const from = claim.createdAt.getTime() - 30_000;
  const to = Math.min(Date.now(), claim.createdAt.getTime() + 5 * 60_000);
  if (to < from) return undefined;

  const matches: ProviderOrder[] = [];
  const firstParams = new URLSearchParams({
    page: "1",
    pageSize: "100",
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    anonymous: "true",
    inTokenId: quote.fromTokenId,
    outTokenId: quote.toTokenId,
  });
  const firstPage = await houdiniRequest<unknown>(`/orders?${firstParams.toString()}`);
  if (!isRecord(firstPage) || !Array.isArray(firstPage.orders) ||
      !Number.isInteger(firstPage.totalPages) || (firstPage.totalPages as number) < 1) {
    throw new Error("Houdini order lookup returned an invalid response");
  }
  const totalPages = firstPage.totalPages as number;
  if (totalPages > 5) return undefined;

  for (let page = 1; page <= totalPages; page++) {
    let result = firstPage;
    if (page > 1) {
      const params = new URLSearchParams(firstParams);
      params.set("page", String(page));
      result = await houdiniRequest<unknown>(`/orders?${params.toString()}`) as Record<string, unknown>;
    }
    if (!Array.isArray(result.orders)) throw new Error("Houdini order lookup returned an invalid page");
    for (const item of result.orders) {
      if (isRecord(item) && matchesPrivateOrder(item as unknown as ProviderOrder, claim, quote, from, to)) {
        matches.push(item as unknown as ProviderOrder);
      }
    }
  }
  if (matches.length !== 1) return undefined;

  const candidate = matches[0];
  const detail = await houdiniRequest<ProviderOrder>(`/orders/${encodeURIComponent(candidate.houdiniId)}`);
  return matchesPrivateOrder(detail, claim, quote, from, to) ? detail : undefined;
}
