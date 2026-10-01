import { createHash, randomBytes, randomUUID, createPublicKey, verify, timingSafeEqual } from "node:crypto";
import bs58 from "bs58";
import type { Request, Response } from "express";
import { CreateLaunchAuthChallengeBody, VerifyLaunchAuthBody } from "@workspace/api-zod";
import { pool, transaction, LaunchError, validAddress, invalid, iso, rateLimit } from "./store";

export const SESSION_COOKIE = "darkswap_launch_session";
const CHALLENGE_COOKIE = "darkswap_launch_challenge";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");
export function cookie(req: Request, name: string): string {
  const values = (req.headers.cookie ?? "").split(";").map(x => x.trim()).filter(x => x.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : "";
}
function options(req: Request) { return { httpOnly: true, secure: req.secure || process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" }; }
export function allowedOrigins(): Set<string> {
  const values = (process.env.LAUNCH_ALLOWED_ORIGINS ?? "").split(",").map(x => x.trim()).filter(Boolean);
  if (process.env.NODE_ENV !== "production" && /^[a-zA-Z0-9.-]+$/.test(process.env.REPLIT_DEV_DOMAIN ?? "")) values.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  return new Set(values.filter(value => {
    try { const url = new URL(value); return url.origin === value && (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))); } catch { return false; }
  }));
}
export function requestOrigin(req: Request, mutation = false): string {
  const origin = req.get("origin");
  // GETs commonly omit Origin. Their actual request authority is still required
  // to match the explicit origin allowlist and the stored session binding.
  const authority = `${req.protocol}://${req.get("host") ?? ""}`;
  const allowed = allowedOrigins();
  if (!allowed.has(authority) || (origin && origin !== authority) || (mutation && !origin)
      || (req.get("sec-fetch-site") === "cross-site")) throw new LaunchError(403, "FORBIDDEN", "Launch request origin is not allowed.");
  return authority;
}
export function isLaunchAdmin(wallet: string): boolean {
  return validAddress(wallet) && (process.env.LAUNCH_ADMIN_WALLETS ?? "").split(",").map(x => x.trim()).filter(validAddress).includes(wallet);
}
export type LaunchSession = { tokenHash: string; wallet: string; origin: string; csrfToken: string; expiresAt: string; isAdmin: boolean };
export async function findLaunchSession(req: Request): Promise<LaunchSession | null> {
  const origin = requestOrigin(req);
  const token = cookie(req, SESSION_COOKIE);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await pool.query("SELECT * FROM launch_sessions WHERE token_hash=$1 AND origin=$2 AND network='mainnet-beta' AND revoked_at IS NULL AND expires_at>now()", [hashToken(token), origin]);
  const row = result.rows[0];
  return row ? { tokenHash: row.token_hash, wallet: row.wallet, origin, csrfToken: row.csrf_token, expiresAt: iso(row.expires_at), isAdmin: isLaunchAdmin(row.wallet) } : null;
}
export async function requireLaunchSession(req: Request, _res?: Response, options: { csrf?: boolean; admin?: boolean } = {}): Promise<LaunchSession> {
  const session = await findLaunchSession(req);
  if (!session) throw new LaunchError(401, "UNAUTHENTICATED", "Prove wallet ownership to access private launch data.");
  if (options.csrf) {
    requestOrigin(req, true);
    const provided = req.get("X-Launch-CSRF") ?? "";
    const given = Buffer.from(provided), expected = Buffer.from(session.csrfToken);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new LaunchError(403, "FORBIDDEN", "Invalid launch CSRF token.");
  }
  if (options.admin && !isLaunchAdmin(session.wallet)) throw new LaunchError(403, "FORBIDDEN", "Launch administrator authorization is required.");
  rateLimit(`wallet:${session.wallet}`, 120);
  return session;
}
export const sessionResponse = (session: LaunchSession | null) => session
  ? { wallet: session.wallet, csrfToken: session.csrfToken, expiresAt: session.expiresAt, isAdmin: session.isAdmin }
  : { wallet: null, csrfToken: null, expiresAt: null, isAdmin: false };
export async function createChallenge(req: Request, res: Response) {
  const origin = requestOrigin(req, true);
  rateLimit(`auth:${req.ip}`, 12);
  const input = CreateLaunchAuthChallengeBody.strict().parse(req.body);
  if (!validAddress(input.wallet)) invalid("Wallet must decode to a 32-byte Solana public key.");
  const id = randomUUID(), browser = randomToken(), nonce = randomToken();
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const message = `${new URL(origin).host} requests a DarkSwap Launch wallet proof.\n\nWallet: ${input.wallet}\nNetwork: ${input.network}\nOrigin: ${origin}\nChallenge: ${id}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${expiresAt}\n\nSign only to access private launch preparation. No transaction, fee, spending approval, or launch is authorized.`;
  await pool.query("INSERT INTO launch_challenges(id,wallet,network,origin,browser_hash,message,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)", [id,input.wallet,input.network,origin,hashToken(browser),message,expiresAt]);
  res.cookie(CHALLENGE_COOKIE, browser, { ...options(req), maxAge: 300_000 });
  return { id, message, expiresAt };
}
export function verifyWalletSignature(wallet: string, message: string, signature: string): boolean {
  if (!validAddress(wallet)) return false;
  try {
    const bytes = Buffer.from(signature, "base64");
    if (bytes.length !== 64 || bytes.toString("base64") !== signature) return false;
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(bs58.decode(wallet))]), type: "spki", format: "der" });
    return verify(null, Buffer.from(message, "utf8"), key, bytes);
  } catch { return false; }
}
export async function verifyChallenge(req: Request, res: Response) {
  const origin = requestOrigin(req, true);
  rateLimit(`auth:${req.ip}`, 12);
  const input = VerifyLaunchAuthBody.strict().parse(req.body);
  const browser = cookie(req, CHALLENGE_COOKIE);
  if (!/^[A-Za-z0-9_-]{43}$/.test(browser)) throw new LaunchError(401, "UNAUTHENTICATED", "Challenge browser binding is missing.");
  const token = randomToken(), csrfToken = randomToken(), expiresAt = new Date(Date.now() + 8 * 3600_000).toISOString();
  const wallet = await transaction(async client => {
    const { rows } = await client.query("SELECT * FROM launch_challenges WHERE id=$1 AND origin=$2 AND browser_hash=$3 AND network='mainnet-beta' AND expires_at>now() AND consumed_at IS NULL FOR UPDATE", [input.id,origin,hashToken(browser)]);
    const row = rows[0];
    if (!row || !verifyWalletSignature(row.wallet, row.message, input.signature)) throw new LaunchError(401, "UNAUTHENTICATED", "Invalid, expired or already used wallet proof.");
    await client.query("UPDATE launch_challenges SET consumed_at=now() WHERE id=$1", [row.id]);
    const oldToken = cookie(req, SESSION_COOKIE);
    if (oldToken) await client.query("UPDATE launch_sessions SET revoked_at=now() WHERE token_hash=$1 AND origin=$2", [hashToken(oldToken),origin]);
    await client.query("INSERT INTO launch_sessions(token_hash,wallet,origin,network,csrf_token,expires_at) VALUES($1,$2,$3,'mainnet-beta',$4,$5)", [hashToken(token),row.wallet,origin,csrfToken,expiresAt]);
    return row.wallet as string;
  });
  res.clearCookie(CHALLENGE_COOKIE, options(req));
  res.cookie(SESSION_COOKIE, token, { ...options(req), maxAge: 8 * 3600_000 });
  return { wallet, csrfToken, expiresAt, isAdmin: isLaunchAdmin(wallet) };
}
export async function logout(req: Request, res: Response, session: LaunchSession) {
  await pool.query("UPDATE launch_sessions SET revoked_at=now() WHERE token_hash=$1", [session.tokenHash]);
  res.clearCookie(SESSION_COOKIE, options(req));
}