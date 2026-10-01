export type DemoToken = {
  id: string; name: string; symbol: string; group: 'Majors' | 'Privacy' | 'Emerging';
  price: number; change24h: number; volume24h: number; liquidity: number; holders: number; series: number[];
};

function series(seed: number, base: number, drift: number): number[] {
  let s = seed; let v = base * (1 - drift * 0.5);
  const out: number[] = [];
  for (let i = 0; i < 32; i++) {
    s = (s * 9301 + 49297) % 233280;
    v = v * (1 + ((s / 233280) - 0.5) * 0.06 + drift / 32);
    out.push(v);
  }
  out[out.length - 1] = base;
  return out;
}

const raw: Omit<DemoToken, 'series'>[] = [
  { id: 'dmo-umbra', name: 'Demo Umbra', symbol: 'dUMBRA', group: 'Privacy', price: 2.8417, change24h: 6.42, volume24h: 1843210, liquidity: 4120550, holders: 12874 },
  { id: 'dmo-veil', name: 'Demo Veil', symbol: 'dVEIL', group: 'Privacy', price: 0.07318, change24h: -3.17, volume24h: 612480, liquidity: 1893020, holders: 5431 },
  { id: 'dmo-cipher', name: 'Demo Cipher', symbol: 'dCPHR', group: 'Privacy', price: 14.206, change24h: 1.08, volume24h: 2987115, liquidity: 9310440, holders: 20117 },
  { id: 'dmo-sol', name: 'Demo Sol Wrapped', symbol: 'dwSOL', group: 'Majors', price: 143.62, change24h: 2.37, volume24h: 18420915, liquidity: 52810300, holders: 88203 },
  { id: 'dmo-usd', name: 'Demo Dollar', symbol: 'dUSD', group: 'Majors', price: 1.0003, change24h: 0.02, volume24h: 9871230, liquidity: 30455010, holders: 64112 },
  { id: 'dmo-btc', name: 'Demo Bitcoin Bridged', symbol: 'dxBTC', group: 'Majors', price: 61284.5, change24h: -0.84, volume24h: 7312840, liquidity: 21774600, holders: 31270 },
  { id: 'dmo-lantern', name: 'Demo Lantern', symbol: 'dLTRN', group: 'Emerging', price: 0.004127, change24h: 18.9, volume24h: 241305, liquidity: 318720, holders: 1207 },
  { id: 'dmo-moth', name: 'Demo Moth', symbol: 'dMOTH', group: 'Emerging', price: 0.3391, change24h: -11.26, volume24h: 98422, liquidity: 207410, holders: 842 },
  { id: 'dmo-quill', name: 'Demo Quill', symbol: 'dQUIL', group: 'Emerging', price: 5.772, change24h: 4.61, volume24h: 433190, liquidity: 1102380, holders: 2968 },
];

export const DEMO_TOKENS: DemoToken[] = raw.map((t, i) => ({ ...t, series: series(i * 7919 + 13, t.price, t.change24h / 100) }));
export const DEMO_GROUPS = ['Majors', 'Privacy', 'Emerging'] as const;
export const DEMO_FEE_RATE = 0.003;

export function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(4);
}
export function fmtCompact(n: number) {
  return '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
}
