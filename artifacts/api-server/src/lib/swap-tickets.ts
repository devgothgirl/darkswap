import { createHmac, timingSafeEqual } from "node:crypto";
import { MINIMUM_SWAP_USD } from "./swap-minimum";

const TOKEN_SCOPE = "swap-token";
const QUOTE_SCOPE = "swap-quote";
const KEY_DOMAIN = "darkswap:houdini-swap-ticket-signing:v1";
const MAX_TICKET_LENGTH = 4_096;

interface TicketPayload {
  v: 1;
  s: string;
  i: string;
  e: number;
  c?: string;
  m?: number;
  x?: {
    fromTokenId: string;
    toTokenId: string;
    amountIn: number;
    amountOut: number;
  };
}
function signingKey(): Buffer {
  const secret = process.env.HOUDINI_API_SECRET;
  if (!secret) throw new Error("HOUDINI_API_SECRET is required to sign swap tickets");
  return createHmac("sha256", secret).update(KEY_DOMAIN).digest();
}

function signature(encodedPayload: string, scope: string): Buffer {
  return createHmac("sha256", signingKey())
    .update(`${scope}.${encodedPayload}`)
    .digest();
}

function issue(payload: TicketPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signed = signature(encodedPayload, payload.s).toString("base64url");
  const ticket = `${encodedPayload}.${signed}`;
  if (ticket.length > MAX_TICKET_LENGTH) throw new Error("Swap ticket exceeds its size limit");
  return ticket;
}

function verify(ticket: unknown, scope: string, now = Date.now()): TicketPayload | null {
  if (typeof ticket !== "string" || ticket.length < 8 || ticket.length > MAX_TICKET_LENGTH) return null;
  const parts = ticket.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) {
    return null;
  }

  try {
    const provided = Buffer.from(parts[1], "base64url");
    const expected = signature(parts[0], scope);
    if (
      provided.length !== expected.length ||
      provided.toString("base64url") !== parts[1] ||
      !timingSafeEqual(provided, expected)
    ) {
      return null;
    }

    const payloadBytes = Buffer.from(parts[0], "base64url");
    if (payloadBytes.toString("base64url") !== parts[0]) return null;
    const payload: unknown = JSON.parse(payloadBytes.toString("utf8"));
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("v" in payload) ||
      !("s" in payload) ||
      !("i" in payload) ||
      !("e" in payload)
    ) {
      return null;
    }
    const parsed = payload as TicketPayload;
    if (
      parsed.v !== 1 ||
      parsed.s !== scope ||
      typeof parsed.i !== "string" ||
      parsed.i.length === 0 ||
      !Number.isSafeInteger(parsed.e) ||
      parsed.e <= now
    ) {
      return null;
    }
    if (scope === TOKEN_SCOPE && (
      typeof parsed.c !== "string" ||
      parsed.m !== undefined ||
      parsed.x !== undefined
    )) {
      return null;
    }
    if (scope === QUOTE_SCOPE && parsed.c !== undefined) return null;
    if (scope === QUOTE_SCOPE && parsed.m !== undefined && parsed.m !== MINIMUM_SWAP_USD) return null;
    if (parsed.x !== undefined && (
      scope !== QUOTE_SCOPE ||
      typeof parsed.x !== "object" ||
      parsed.x === null ||
      typeof parsed.x.fromTokenId !== "string" ||
      typeof parsed.x.toTokenId !== "string" ||
      typeof parsed.x.amountIn !== "number" ||
      !Number.isFinite(parsed.x.amountIn) ||
      typeof parsed.x.amountOut !== "number" ||
      !Number.isFinite(parsed.x.amountOut)
    )) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function issueTokenTicket(
  providerId: string,
  chain: string,
  _side: "source" | "destination",
  now = Date.now(),
): string {
  if (!providerId || typeof chain !== "string") throw new Error("Invalid provider token");
  const current = new Date(now);
  const expires = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 2) - 1;
  return issue({
    v: 1,
    s: TOKEN_SCOPE,
    i: providerId,
    c: chain,
    e: expires,
  });
}

export function readTokenTicket(
  ticket: unknown,
  _side: "source" | "destination",
  now = Date.now(),
): { providerId: string; chain: string } | null {
  const payload = verify(ticket, TOKEN_SCOPE, now);
  if (!payload || typeof payload.c !== "string") return null;
  return { providerId: payload.i, chain: payload.c };
}

export function issueQuoteTicket(
  providerQuoteId: string,
  expires: number,
  amountInUsd: number,
  context?: TicketPayload["x"],
): string {
  if (
    !providerQuoteId || !Number.isSafeInteger(expires) || expires <= Date.now() ||
    !Number.isFinite(amountInUsd) || amountInUsd < MINIMUM_SWAP_USD
  ) {
    throw new Error("Invalid provider quote");
  }
  return issue({
    v: 1,
    s: QUOTE_SCOPE,
    i: providerQuoteId,
    e: expires,
    m: MINIMUM_SWAP_USD,
    ...(context ? { x: context } : {}),
  });
}

export function readQuoteTicketDetails(
  ticket: unknown,
  now = Date.now(),
): { providerQuoteId: string; context?: NonNullable<TicketPayload["x"]> } | null {
  const payload = verify(ticket, QUOTE_SCOPE, now);
  if (!payload) return null;
  return {
    providerQuoteId: payload.i,
    ...(payload.x ? { context: payload.x } : {}),
  };
}

export function readQuoteTicket(ticket: unknown, now = Date.now(), requireMinimum = false): string | null {
  const payload = verify(ticket, QUOTE_SCOPE, now);
  return payload && (!requireMinimum || payload.m === MINIMUM_SWAP_USD) ? payload.i : null;
}
