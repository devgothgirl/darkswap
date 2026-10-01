/** A wallet balance observation. Exactly one of `raw` (base units, integer string) or `amount` (decimal string) should be set. */
export type WalletBalance = {
  wallet: string;
  /** Raw integer base units, e.g. "123450000". Requires `decimals`. */
  raw?: string;
  /** Human decimal string, e.g. "123.45". */
  amount?: string;
  /** Token decimals used to interpret `raw` and to normalize `amount`. */
  decimals: number;
};

export type RankedHolder = { rank: number; wallet: string; units: bigint; display: string };

const INT = /^\d+$/;
const DEC = /^\d+(\.\d+)?$/;

/** Converts a balance to integer base units as bigint; throws on malformed input or excess precision. */
export function toBaseUnits(b: WalletBalance): bigint {
  if ((b.raw !== undefined) === (b.amount !== undefined)) throw new Error(`Provide exactly one balance representation for ${b.wallet}`);
  if (!Number.isInteger(b.decimals) || b.decimals < 0 || b.decimals > 30) throw new Error(`Invalid decimals for ${b.wallet}`);
  if (b.raw !== undefined) {
    if (!INT.test(b.raw)) throw new Error(`Invalid raw balance for ${b.wallet}`);
    return BigInt(b.raw);
  }
  if (b.amount !== undefined) {
    if (!DEC.test(b.amount)) throw new Error(`Invalid amount for ${b.wallet}`);
    const [whole, frac = ''] = b.amount.split('.');
    const trimmed = frac.replace(/0+$/, '');
    if (trimmed.length > b.decimals) throw new Error(`Amount exceeds token precision for ${b.wallet}`);
    return BigInt(whole + trimmed.padEnd(b.decimals, '0'));
  }
  throw new Error(`Missing balance for ${b.wallet}`);
}

export function formatUnits(units: bigint, decimals: number): string {
  const s = units.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = decimals ? s.slice(s.length - decimals).replace(/0+$/, '') : '';
  return frac ? `${whole}.${frac}` : whole;
}

/** Aggregates per wallet, sorts by holdings descending (bigint, precision-safe), ties broken by wallet string ascending. Shared rank for equal holdings (1,1,3). */
export function rankHolders(balances: readonly WalletBalance[]): RankedHolder[] {
  if (balances.length === 0) return [];
  const decimals = balances[0].decimals;
  const totals = new Map<string, bigint>();
  for (const b of balances) {
    if (b.decimals !== decimals) throw new Error('All balances must share the same token decimals');
    const wallet = b.wallet.trim();
    if (!wallet) throw new Error('Wallet address is required');
    totals.set(wallet, (totals.get(wallet) ?? 0n) + toBaseUnits(b));
  }
  const sorted = [...totals].sort(([wa, a], [wb, b]) => (a === b ? (wa < wb ? -1 : wa > wb ? 1 : 0) : a > b ? -1 : 1));
  let rank = 0;
  return sorted.map(([wallet, units], i) => {
    if (i === 0 || units !== sorted[i - 1][1]) rank = i + 1;
    return { rank, wallet, units, display: formatUnits(units, decimals) };
  });
}
