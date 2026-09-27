import { Router, type IRouter } from "express";
import bs58 from "bs58";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  SearchOkxTokensQueryParams, SearchOkxTokensResponse,
  GetOkxQuoteQueryParams, GetOkxQuoteResponse,
  BuildOkxTransactionBody, BuildOkxTransactionResponse,
} from "@workspace/api-zod";
import { okxRequest, ProviderError } from "../lib/token-providers";

const router: IRouter = Router();
type Token = { mint: string; name: string; symbol: string; decimals: number; icon?: string };
let tokenCache: { tokens: Token[]; expires: number } | undefined;
const counts = new Map<string, { count: number; until: number }>();
function limited(ip: string | undefined, max: number): boolean {
  const key = ip || "unknown", now = Date.now(), record = counts.get(key);
  if (counts.size > 5000) for (const [id, entry] of counts) if (entry.until < now) counts.delete(id);
  if (!record || record.until < now) { counts.set(key, { count: 1, until: now + 60_000 }); return false; }
  record.count++;
  return record.count > max;
}
function fail(res: any, error: unknown) {
  res.status(error instanceof ProviderError ? error.status : 502).json({ error: error instanceof ProviderError ? error.message : "OKX DEX returned invalid data." });
}
async function supportedTokens(): Promise<Token[]> {
  if (tokenCache && tokenCache.expires > Date.now()) return tokenCache.tokens;
  const data = await okxRequest("all-tokens", new URLSearchParams({ chainIndex: "501" }));
  const tokens = data.filter((t: any) =>
    t && typeof t.tokenContractAddress === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t.tokenContractAddress) &&
    typeof t.tokenSymbol === "string" && typeof t.tokenName === "string" &&
    Number.isInteger(Number(t.decimals)) && Number(t.decimals) >= 0 && Number(t.decimals) <= 18
  ).map((t: any): Token => ({
    mint: t.tokenContractAddress, name: t.tokenName, symbol: t.tokenSymbol,
    decimals: Number(t.decimals), ...(typeof t.tokenLogoUrl === "string" ? { icon: t.tokenLogoUrl } : {}),
  }));
  if (!tokens.length) throw new ProviderError("OKX returned no supported Solana tokens.");
  tokenCache = { tokens, expires: Date.now() + 5 * 60_000 };
  return tokens;
}
function units(amount: string, decimals: number): string {
  if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,18})?$/.test(amount)) throw new ProviderError("Enter a positive decimal amount.", 400);
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) throw new ProviderError(`This token supports up to ${decimals} decimal places.`, 400);
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction.padEnd(decimals, "0") || "0"));
  if (value <= 0n || value > 1_000_000_000_000_000_000_000_000n) throw new ProviderError("Amount is outside the supported range.", 400);
  return String(value);
}
function fromUnits(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) throw new ProviderError("OKX returned an invalid amount.");
  const text = raw.padStart(decimals + 1, "0");
  return decimals ? `${text.slice(0, -decimals)}.${text.slice(-decimals)}`.replace(/\.?0+$/, "") : text;
}
function pair(tokens: Token[], fromMint: string, toMint: string) {
  const from = tokens.find(t => t.mint === fromMint), to = tokens.find(t => t.mint === toMint);
  if (!from || !to || from.mint === to.mint) throw new ProviderError("Choose two different OKX-supported Solana tokens.", 400);
  return { from, to };
}
function quoteResult(result: any, from: Token, to: Token, expectedUnits: string) {
  if (!result || typeof result.fromTokenAmount !== "string" || typeof result.toTokenAmount !== "string") throw new ProviderError("OKX returned an invalid quote.");
  if (result.chainIndex !== "501" || result.fromToken?.tokenContractAddress !== from.mint ||
      result.toToken?.tokenContractAddress !== to.mint || result.fromTokenAmount !== expectedUnits ||
      !/^\d+$/.test(result.toTokenAmount) || BigInt(result.toTokenAmount) <= 0n) {
    throw new ProviderError("OKX quote did not match the requested Solana swap.");
  }
  return {
    fromMint: from.mint, toMint: to.mint,
    amountIn: fromUnits(result.fromTokenAmount, from.decimals),
    amountOut: fromUnits(result.toTokenAmount, to.decimals),
    fromSymbol: from.symbol, toSymbol: to.symbol,
    priceImpactPercent: String(result.priceImpactPercent ?? "0"),
    ...(result.tradeFee ? { tradeFeeUsd: String(result.tradeFee) } : {}),
  };
}
function verifyTransaction(raw: string, wallet: string) {
  let bytes: Uint8Array;
  try { bytes = bs58.decode(raw); } catch { throw new ProviderError("OKX returned malformed transaction bytes."); }
  if (bytes.length > 10_000) throw new ProviderError("OKX transaction is too large.");
  try {
    const tx = VersionedTransaction.deserialize(bytes);
    if (tx.message.staticAccountKeys[0]?.toBase58() !== wallet ||
        tx.message.header.numRequiredSignatures !== 1 || tx.signatures.length !== 1) {
      throw new ProviderError("OKX transaction signer did not match the connected wallet.");
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    let tx: Transaction;
    try { tx = Transaction.from(bytes); } catch { throw new ProviderError("OKX returned an invalid Solana transaction."); }
    if (tx.feePayer?.toBase58() !== wallet || tx.signatures.length !== 1 ||
        tx.signatures[0]?.publicKey.toBase58() !== wallet) {
      throw new ProviderError("OKX transaction signer did not match the connected wallet.");
    }
  }
}
router.get("/swap/okx/tokens", async (req, res) => {
  const parsed = SearchOkxTokensQueryParams.safeParse(req.query);
  if (!parsed.success) return void res.status(400).json({ error: "Search is too long." });
  if (limited(req.ip, 40)) return void res.status(429).json({ error: "Please wait before searching again." });
  try {
    const exactTerm = (parsed.data.term || "").trim(), term = exactTerm.toLowerCase();
    const matches = (await supportedTokens()).filter(t => !term || t.symbol.toLowerCase().includes(term) || t.name.toLowerCase().includes(term) || t.mint === exactTerm);
    matches.sort((a, b) => {
      const rank = (symbol: string) => ({ SOL: 0, USDC: 1, USDT: 2 }[symbol.toUpperCase()] ?? 10);
      return rank(a.symbol) - rank(b.symbol);
    });
    res.json(SearchOkxTokensResponse.parse({ tokens: matches.slice(0, 50) }));
  } catch (error) { req.log.warn({ err: error }, "OKX token lookup failed"); fail(res, error); }
});
router.get("/swap/okx/quote", async (req, res) => {
  const parsed = GetOkxQuoteQueryParams.safeParse(req.query);
  if (!parsed.success) return void res.status(400).json({ error: "Select two tokens and enter an amount." });
  if (limited(req.ip, 30)) return void res.status(429).json({ error: "Please wait before requesting another quote." });
  try {
    const { fromMint, toMint, amount } = parsed.data;
    const { from, to } = pair(await supportedTokens(), fromMint, toMint);
    const inputUnits = units(amount, from.decimals);
    const data = await okxRequest("quote", new URLSearchParams({
      chainIndex: "501", amount: inputUnits,
      fromTokenAddress: from.mint, toTokenAddress: to.mint,
    }));
    res.json(GetOkxQuoteResponse.parse(quoteResult(data[0], from, to, inputUnits)));
  } catch (error) { req.log.warn({ err: error }, "OKX quote failed"); fail(res, error); }
});
router.post("/swap/okx/transaction", async (req, res) => {
  const parsed = BuildOkxTransactionBody.safeParse(req.body);
  if (!parsed.success || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(parsed.data.wallet)) return void res.status(400).json({ error: "Connect a Solana wallet and choose a valid pair." });
  if (limited(req.ip, 10)) return void res.status(429).json({ error: "Please wait before building another transaction." });
  try {
    const { fromMint, toMint, amount, wallet } = parsed.data;
    const { from, to } = pair(await supportedTokens(), fromMint, toMint);
    const inputUnits = units(amount, from.decimals);
    try { new PublicKey(wallet); } catch { throw new ProviderError("Invalid Solana wallet address.", 400); }
    const data = await okxRequest("swap", new URLSearchParams({
      chainIndex: "501", amount: inputUnits,
      fromTokenAddress: from.mint, toTokenAddress: to.mint,
      userWalletAddress: wallet, slippagePercent: "0.5",
    }));
    const result = data[0], quote = quoteResult(result?.routerResult, from, to, inputUnits);
    if (!result?.tx?.data || typeof result.tx.data !== "string" || result.tx.data.length > 200_000) throw new ProviderError("OKX returned an invalid transaction.");
    if (result.tx.from !== wallet || typeof result.tx.minReceiveAmount !== "string" ||
        !/^\d+$/.test(result.tx.minReceiveAmount) ||
        BigInt(result.tx.minReceiveAmount) <= 0n ||
        BigInt(result.tx.minReceiveAmount) > BigInt(result.routerResult.toTokenAmount)) {
      throw new ProviderError("OKX returned invalid transaction limits.");
    }
    verifyTransaction(result.tx.data, wallet);
    res.json(BuildOkxTransactionResponse.parse({
      transaction: result.tx.data, amountIn: quote.amountIn, amountOut: quote.amountOut,
      minAmountOut: fromUnits(result.tx.minReceiveAmount, to.decimals),
      fromSymbol: from.symbol, toSymbol: to.symbol,
    }));
  } catch (error) { req.log.warn({ err: error }, "OKX transaction failed"); fail(res, error); }
});
export default router;