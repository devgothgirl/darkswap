import { Link } from './preview-link';
import './risk-disclaimer.css';

export function RiskDisclaimer() {
  return <aside className="risk-disclaimer" aria-label="Risk disclaimer" data-testid="risk-disclaimer">
    <div className="risk-disclaimer-inner">
      <strong>Risk disclaimer</strong>
      <p>Cryptocurrency swaps carry risks, including price changes, delays, failed routes, and loss from an incorrect network, asset, address, amount, or memo. Quotes and delivery times are estimates. Solana deposits are public, and a private route does not guarantee anonymity. DarkSwap provides an interface to third-party routes; it does not control their execution or hold your funds. Review all details before sending. Information on this site is not financial, legal, or tax advice. <Link href="/docs">Read the route limitations</Link>.</p>
    </div>
  </aside>;
}