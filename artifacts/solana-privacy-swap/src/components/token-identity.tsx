import { useId } from 'react';
import { ArrowUpRight } from 'lucide-react';
import tokenIdentity from '../token-identity.json';
import { CopyButton } from './swap-ui';
import './token-identity.css';

export function TokenIdentity({ compact = false, context }: { compact?: boolean; context: string }) {
  const titleId = useId();

  return <section
    className={`dark-token-identity${compact ? ' dark-token-identity--compact' : ''}`}
    aria-labelledby={titleId}
    data-testid={`card-token-identity-${context}`}
  >
    <div className="dark-token-identity__heading">
      <strong id={titleId} data-testid={`text-token-identity-title-${context}`}>Official ${tokenIdentity.symbol} address</strong>
      <span data-testid={`text-token-identity-chain-${context}`}>{tokenIdentity.chain} mint</span>
    </div>
    <div className="dark-token-identity__address">
      <code aria-label={`Official ${tokenIdentity.symbol} ${tokenIdentity.chain} mint address`} data-testid={`text-token-identity-address-${context}`}>{tokenIdentity.address}</code>
      <CopyButton value={tokenIdentity.address} name="DARK token address" />
    </div>
    <a
      className="dark-token-identity__explorer"
      href={tokenIdentity.explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View official ${tokenIdentity.symbol} mint on Solscan (opens in a new tab)`}
      data-testid={`link-token-identity-solscan-${context}`}
    >View on Solscan <ArrowUpRight size={14} aria-hidden="true" /></a>
    {' · '}
    <a
      className="dark-token-identity__explorer"
      href={tokenIdentity.listingUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${tokenIdentity.symbol} on StonkFun (opens in a new tab)`}
      data-testid={`link-token-identity-stonkfun-${context}`}
    >View on StonkFun <ArrowUpRight size={14} aria-hidden="true" /></a>
    <p className="dark-token-identity__note" data-testid={`text-token-identity-limits-${context}`}>
      {compact
        ? 'StonkFun reports $DARK as graduated. wNEAR rewards have been distributed to qualifying holders; one ZEC-token award has been paid, and further awards need separate approval.'
        : 'StonkFun reports $DARK as graduated and paired with NEAR. This listing does not verify supply, mint/freeze authorities, liquidity or reward funding. wNEAR rewards have been distributed to qualifying holders; one ZEC-token award has been paid, and further awards need separate approval.'}
    </p>
  </section>;
}