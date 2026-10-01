import { ArrowUpRight } from 'lucide-react';

export const EXCHANGE_URL = '/__mockup/preview/darkswap-nearfi/Exchange';
export const TRACKING_URL = '/__mockup/preview/darkswap-nearfi/Tracking';
export const DEMO_DEPOSIT = 'DEMO-NOT-FOR-PAYMENT-NO-SOLANA-ADDRESS';
export const SOURCE_ASSETS = [
  { symbol: 'SOL', name: 'Solana', price: 147.25, decimals: 9 },
  { symbol: 'USDC', name: 'Solana', price: 1, decimals: 6 },
] as const;
export const DEST_ASSETS = [
  { symbol: 'NEAR', name: 'NEAR Protocol', price: 6.29 },
  { symbol: 'USDC', name: 'NEAR Protocol', price: 1 },
] as const;

export function ShellNav({ current }: { current: 'exchange' | 'tracking' }) {
  return <>
    <div className="ds-demo" role="note">INTERACTIVE DESIGN DEMO · Example amounts only · No live quote or fundable deposit address</div>
    <header className="ds-nav">
      <a className="ds-brand" href={EXCHANGE_URL} aria-label="DarkSwap privacy swap home">
        <img src="/__mockup/images/darkswap-nearfi/icon.png" alt="" />
        <img src="/__mockup/images/darkswap-nearfi/wordmark.png" alt="DarkSwap" />
      </a>
      <nav className="ds-links" aria-label="Preview navigation">
        <a href={EXCHANGE_URL} aria-current={current === 'exchange' ? 'page' : undefined}>Privacy swap</a>
        <a href={TRACKING_URL} aria-current={current === 'tracking' ? 'page' : undefined}>Track order</a>
        <span title="Documentation is not connected in this design preview">Docs</span>
      </nav>
      <div className="ds-nav-end"><a href={current === 'exchange' ? TRACKING_URL : EXCHANGE_URL}>{current === 'exchange' ? 'Track order' : 'New route'} <ArrowUpRight size={13}/></a></div>
    </header>
  </>;
}

export function FlowFooter() {
  return <footer className="ds-footer">DarkSwap / Privacy swap preview · Manual-deposit route · No assets can be sent from this demo</footer>;
}

export function formatNumber(value: number, max = 6) {
  return value.toLocaleString('en-US', { maximumFractionDigits: max });
}