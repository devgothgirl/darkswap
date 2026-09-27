import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  SearchSwapTokensQueryParams,
  SearchSwapTokensResponse,
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
  type ProviderToken,
  type ProviderQuote,
  type ProviderOrder,
} from "../lib/houdini";

const router: IRouter = Router();
const tokenCache = new Map<string, { expires: number; tokens: ReturnType<typeof normalizeToken>[]; total: number }>();
const sourceIds = new Map<string, number>();
const destinationIds = new Map<string, number>();
const issuedQuotes = new Map<string, number>();
const requestCounts = new Map<string, { count: number; reset: number }>();

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
  const { side, term = "" } = parsed.data;
  const cacheKey = `${side}:${term.trim().toLowerCase()}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    res.json(SearchSwapTokensResponse.parse({ tokens: cached.tokens, total: cached.total }));
    return;
  }

  try {
    const params = new URLSearchParams({
      hasCex: "true",
      pageSize: side === "source" ? "100" : "100",
      page: "1",
    });
    if (side === "source") params.set("chain", "solana");
    if (term.trim()) params.set("term", term.trim());
    const result = await houdiniRequest<{ tokens: ProviderToken[]; total: number }>(
      `/tokens?${params.toString()}`,
    );
    if (!Array.isArray(result.tokens)) throw new Error("Invalid tokens response");
    const tokens = result.tokens
      .filter((token) => token.enabled !== false && token.hasCex !== false)
      .filter((token) => side !== "source" || token.chainData?.shortName?.toLowerCase() === "solana")
      .map(normalizeToken)
      .sort((a, b) => {
        const priority = (symbol: string) => ({ SOL: 0, USDC: 1, USDT: 2 }[symbol.toUpperCase()] ?? 10);
        return priority(a.symbol) - priority(b.symbol);
      });
    const now = Date.now();
    for (const token of tokens) {
      (side === "source" ? sourceIds : destinationIds).set(token.id, now + 10 * 60_000);
    }
    tokenCache.set(cacheKey, { tokens, total: Number(result.total) || tokens.length, expires: now + 60_000 });
    res.json(SearchSwapTokensResponse.parse({ tokens, total: Number(result.total) || tokens.length }));
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
  if ((sourceIds.get(from) ?? 0) < Date.now() || (destinationIds.get(to) ?? 0) < Date.now()) {
    res.status(400).json({ error: "Refresh the token list and choose your assets again." });
    return;
  }
  try {
    const params = new URLSearchParams({ from, to, amount: String(amount), types: "private" });
    const result = await houdiniRequest<{ quotes: ProviderQuote[] }>(
      `/quotes?${params.toString()}`,
      { userIp: req.ip, userAgent: req.get("user-agent"), timezone },
    );
    if (!Array.isArray(result.quotes)) throw new Error("Invalid quotes response");
    const quotes = result.quotes.filter(
      (quote) =>
        quote.type === "private" &&
        !!quote.quoteId &&
        typeof quote.amountIn === "number" &&
        typeof quote.amountOut === "number" &&
        !quote.filtered &&
        !quote.error &&
        !quote.requiresRefundAddress,
    ).slice(0, 8);
    const now = Date.now();
    if (issuedQuotes.size > 5000) {
      for (const [id, expires] of issuedQuotes) {
        if (expires < now) issuedQuotes.delete(id);
      }
    }
    for (const quote of quotes) {
      const validUntil = quote.validUntil ? Date.parse(quote.validUntil) : NaN;
      const expires = Number.isFinite(validUntil) ? Math.min(validUntil, now + 8 * 60_000) : now + 5 * 60_000;
      if (expires > now) issuedQuotes.set(quote.quoteId!, expires);
    }
    res.json(GetPrivateQuotesResponse.parse({ quotes, total: quotes.length }));
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
  if ((issuedQuotes.get(quoteId) ?? 0) < Date.now()) {
    res.status(400).json({ error: "This quote expired. Request a fresh quote before creating an order." });
    return;
  }
  try {
    const order = await houdiniRequest<ProviderOrder>("/exchanges", {
      method: "POST",
      body: { quoteId, addressTo: addressTo.trim(), ...(destinationTag ? { destinationTag: destinationTag.trim() } : {}) },
      userIp: req.ip,
      userAgent: req.get("user-agent"),
    });
    issuedQuotes.delete(quoteId);
    res.json(CreatePrivateOrderResponse.parse(order));
  } catch (error) {
    handleError(req, res, error);
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