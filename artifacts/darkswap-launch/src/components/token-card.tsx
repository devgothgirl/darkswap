import { Link } from 'wouter';
import type { StonkfunToken } from '@workspace/api-client-react';
import { TokenAvatar, Pill } from './bits';
import { ago, fmtUsd, statusLabel } from '@/lib/api';

export function TokenCard({ token, index }: { token: StonkfunToken; index?: number }) {
  const suppressed = token.metadataSuppressed;
  const vol = fmtUsd(token.metrics.volume24hUsd);
  const mcap = fmtUsd(token.metrics.marketCapUsd);
  return (
    <Link
      href={`/token/${token.mint}`}
      className="lift group block rounded-2xl border border-border bg-card/60 p-4 edge-glow focus-visible:outline-2"
      data-testid={`card-token-${token.mint}`}
    >
      <div className="flex items-start gap-3">
        <TokenAvatar src={suppressed ? null : token.imageUrl} label={token.symbol} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{suppressed ? 'Metadata suppressed' : token.name}</span>
            {typeof index === 'number' && <span className="ml-auto font-mono text-[10px] text-muted-foreground">#{index + 1}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <span className="text-foreground/80">${token.symbol}</span>
            {token.quote && <span>/ {token.quote.symbol}</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {token.darkPair && <Pill tone="purple">DarkSwap ecosystem</Pill>}
        <Pill>{statusLabel(token.status)}</Pill>
        {token.underReview && <Pill tone="warn">Under review</Pill>}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
        <div>
          <dt className="text-muted-foreground">24h vol</dt>
          <dd className={vol ? 'mt-0.5 font-mono' : 'mt-0.5 font-mono text-muted-foreground/70'}>{vol ?? 'n/a'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Mkt cap</dt>
          <dd className={mcap ? 'mt-0.5 font-mono' : 'mt-0.5 font-mono text-muted-foreground/70'}>{mcap ?? 'n/a'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Listed</dt>
          <dd className="mt-0.5 truncate font-mono">{ago(token.createdAt) ?? 'n/a'}</dd>
        </div>
      </dl>
    </Link>
  );
}
