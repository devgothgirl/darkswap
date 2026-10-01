import { withProviderCapacity } from "./provider-capacity";

const BASE_URL = "https://api-partner.houdiniswap.com/v2";

export class HoudiniError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

// Only use this when no request was dispatched to Houdini. An in-flight
// timeout or malformed response might still represent a created order.
export class NotSentHoudiniError extends HoudiniError {}

export interface ProviderToken {
  id: string;
  symbol: string;
  name: string;
  icon?: string;
  decimals?: number;
  price?: number | null;
  enabled?: boolean;
  hasCex?: boolean;
  chainData?: {
    shortName?: string;
    name?: string;
    memoNeeded?: boolean | null;
  };
}

export interface ProviderQuote {
  quoteId?: string;
  type?: string;
  amountIn?: number;
  amountOut?: number;
  amountOutUsd?: number;
  // Optional in the v2 QuoteV2 contract; private quotes may omit it.
  amountInUsd?: number;
  feeUsd?: number;
  duration?: number;
  min?: number;
  max?: number;
  validUntil?: string;
  swapName?: string;
  fixed?: boolean;
  requiresRefundAddress?: boolean;
  error?: string;
  filtered?: boolean;
}

export interface ProviderOrder {
  houdiniId: string;
  depositAddress: string;
  depositTag?: string;
  receiverAddress: string;
  receiverTag?: string | null;
  anonymous?: boolean;
  inToken?: { id?: string };
  outToken?: { id?: string };
  inAmount: number;
  inSymbol: string;
  outAmount: number;
  outSymbol: string;
  displayStatus: string;
  /** Houdini v2 OrderStatus: 4 finished, 5 expired, 6 failed, 7 refunded, 8 deleted. */
  status?: -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  eta?: number;
  created: string;
  expires: string;
  outTransactionOutHash?: string;
}

export async function houdiniRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    userIp?: string;
    userAgent?: string;
    timezone?: string;
  } = {},
): Promise<T> {
  const key = process.env.HOUDINI_API_KEY;
  const secret = process.env.HOUDINI_API_SECRET;
  if (!key || !secret) {
    throw new NotSentHoudiniError("The private route is temporarily unavailable.", 503);
  }

  const headers: Record<string, string> = {
    Authorization: `${key}:${secret}`,
    Accept: "application/json",
  };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.userIp) headers["x-user-ip"] = options.userIp;
  if (options.userAgent) headers["x-user-agent"] = options.userAgent;
  if (options.timezone) headers["x-user-timezone"] = options.timezone;

  return withProviderCapacity(
    options.method === "POST" ? "houdini-write" : "houdini-read",
    () => new NotSentHoudiniError("The private route is busy. Please try again shortly.", 503),
    async () => {
      let response: Response;
      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method: options.method ?? "GET",
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new HoudiniError("The private route is temporarily unreachable. Please try again.", 502);
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new HoudiniError("The private route returned an unexpected response.", 502);
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new HoudiniError("The private route is temporarily unavailable.", 503);
        }
        const providerMessage =
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message.slice(0, 300)
            : "The swap provider could not complete this request.";
        const message = providerMessage.replace(/\bhoudini(?:swap)?\b/gi, "the private route provider");
        const status = response.status === 404 ? 404 : response.status === 429 ? 429 : response.status === 422 ? 422 : 502;
        throw new HoudiniError(message, status);
      }
      return data as T;
    },
  );
}
