import { Link, useParams } from 'wouter';
import { ArrowLeft, ExternalLink, Globe, Send, Github, MessageCircle, ShieldAlert } from 'lucide-react';
import { SiX } from 'react-icons/si';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetStonkfunToken, getGetStonkfunTokenQueryKey } from '@workspace/api-client-react';
import { Page } from '@/components/layout';
import { CopyAddress, EmptyState, ErrorState, Metric, Pill, SourceNote, TokenAvatar } from '@/components/bits';
import { usePageMeta } from '@/lib/seo';
import { fmtDate, fmtNum, fmtUsd, readError, SOLANA_ADDRESS, statusLabel, shortAddr } from '@/lib/api';

export default function TokenPage() {
  const { mint = '' } = useParams<{ mint: string }>();
  const valid = SOLANA_ADDRESS.test(mint);
  const q = useGetStonkfunToken(mint, { query: { queryKey: getGetStonkfunTokenQueryKey(mint), enabled: valid, retry: false } });
  const token = q.data?.token;
  usePageMeta({
    title: token ? `${token.metadataSuppressed ? 'Token' : token.name} ($${token.symbol})` : 'Token',
    description: token ? `Sourced identity, pair and market facts for ${token.symbol} on Solana mainnet-beta.` : 'Solana token details on DarkSwap Launch.',
  });

  const back = (
    <Link href="/explore" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back"><ArrowLeft className="h-4 w-4" />Explore</Link>
  );

  if (!valid) return <Page>{back}<EmptyState title="Invalid mint address">That does not look like a Solana mint address.</EmptyState></Page>;
  if (q.isLoading) return <Page>{back}<Skeleton className="h-24 w-full" /><div className="mt-6 grid gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div></Page>;
  if (q.isError) {
    const e = readError(q.error);
    return (
      <Page>
        {back}
        {e.code === 'NOT_INDEXED' ? (
          <EmptyState title="Not indexed yet">This mint is not in the DarkSwap Launch discovery catalog. That does not mean it does not exist on-chain. <div className="mt-3"><CopyAddress value={mint} /></div></EmptyState>
        ) : e.code === 'NOT_FOUND' || e.status === 404 ? (
          <EmptyState title="Token not found">A verified source reports no token for this mint.</EmptyState>
        ) : (
          <ErrorState title="Provider unavailable" message={e.message} onRetry={() => q.refetch()} />
        )}
      </Page>
    );
  }
  if (!token) return null;
  const sup = token.metadataSuppressed;
  const m = token.metrics;
  const links = sup ? null : token.links;
  const linkItems = links ? ([
    ['Website', links.website, Globe],
    ['X', links.x, SiX],
    ['Telegram', links.telegram, Send],
    ['Discord', links.discord, MessageCircle],
    ['GitHub', links.github, Github],
  ] as const).filter(([, u]) => !!u) : [];

  return (
    <Page>
      {back}
      {(token.underReview || sup) && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-chart-5/40 bg-chart-5/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-chart-5" />
          <div>{sup ? 'Metadata for this token is locally suppressed after review. Name, image, description and links are hidden.' : 'This token is under review by DarkSwap. It cannot be featured while the review is open.'}</div>
        </div>
      )}
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <TokenAvatar src={sup ? null : token.imageUrl} label={token.symbol} size={88} className="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="purple">Solana · {token.network}</Pill>
            {token.darkPair && <Pill tone="purple">DarkSwap ecosystem pair</Pill>}
            <Pill>{statusLabel(token.status)}</Pill>
          </div>
          <h1 className="mt-3 break-words text-4xl font-extrabold md:text-5xl" data-testid="text-token-name">{sup ? 'Metadata suppressed' : token.name}</h1>
          <div className="mt-1 font-mono text-lg text-muted-foreground">${token.symbol}</div>
          <div className="mt-4"><CopyAddress value={token.mint} testId="button-copy-mint" /></div>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-accent/50 to-card p-6">
            <div className="eyebrow mb-3">Pair</div>
            {token.quote ? (
              <div className="flex items-center gap-4">
                <TokenAvatar src={token.quote.logoUrl} label={token.quote.symbol} size={48} />
                <div className="min-w-0">
                  <div className="font-display text-2xl font-bold">{token.symbol} / {token.quote.symbol}</div>
                  <div className="text-sm text-muted-foreground">{token.quote.name}{token.quote.categoryLabel ? ` · ${token.quote.categoryLabel}` : ''}</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">Quote mint {shortAddr(token.quote.mint, 6)} · {token.quote.verified ? 'matched in current pair catalog' : 'not matched in pair catalog'}</div>
                </div>
              </div>
            ) : <p className="text-muted-foreground">Quote pair unavailable from source.</p>}
            {token.pool && <div className="mt-4 font-mono text-xs text-muted-foreground">Pool {token.pool}</div>}
          </section>

          <section>
            <div className="eyebrow mb-3">Market</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Metric label="Price" value={fmtUsd(m.priceUsd)} testId="metric-price" />
              <Metric label="Market cap" value={fmtUsd(m.marketCapUsd)} />
              <Metric label="FDV" value={fmtUsd(m.fdvUsd)} />
              <Metric label="24h volume" value={fmtUsd(m.volume24hUsd)} />
              <Metric label="Liquidity" value={fmtUsd(m.liquidityUsd)} />
              <Metric label="Peak mkt cap" value={fmtUsd(m.peakMarketCapUsd)} />
              <Metric label="24h change" value={m.priceChange24h == null ? null : String(m.priceChange24h)} hint="Raw provider value; units not inferred" />
              <Metric label="Holders" value={fmtNum(m.holders)} />
              <Metric label="Transactions" value={fmtNum(m.transactions)} />
            </div>
          </section>

          {!sup && token.description && (
            <section className="rounded-2xl border border-border bg-card/60 p-6">
              <div className="eyebrow mb-3">Description (provider text)</div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{token.description}</p>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-border bg-card/60 p-6">
            <div className="eyebrow mb-4">Launch facts</div>
            <dl className="space-y-3 text-sm">
              {[
                ['Creator', token.creatorWallet ?? 'Unavailable (no verified attribution)'],
                ['Launchpad', token.launchpad ?? 'Unavailable'],
                ['Mode', token.mode ?? 'Unavailable'],
                ['Graduation progress', token.graduationProgress == null ? 'Unavailable' : `${token.graduationProgress} (raw provider value)`],
                ['Listed', fmtDate(token.createdAt)],
                ['Graduated', token.graduatedAt ? fmtDate(token.graduatedAt) : 'Not reported'],
                ['Transfer fee metadata', token.transferFeeBps == null ? 'Unavailable' : `${token.transferFeeBps} bps (not a launch fee)`],
                ['Quote-only fees', token.quoteOnlyFees == null ? 'Unavailable' : token.quoteOnlyFees ? 'Yes' : 'No'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-mono text-xs break-all">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          {linkItems.length > 0 && (
            <section className="rounded-2xl border border-border bg-card/60 p-6">
              <div className="eyebrow mb-3">Links (unverified)</div>
              <div className="flex flex-wrap gap-2">
                {linkItems.map(([label, url, Icon]) => (
                  <Button key={label} asChild variant="outline" size="sm"><a href={url!} target="_blank" rel="noopener noreferrer nofollow ugc"><Icon className="mr-1.5 h-3.5 w-3.5" />{label}</a></Button>
                ))}
              </div>
            </section>
          )}
          <Button asChild variant="outline" className="w-full"><a href={`https://solscan.io/token/${token.mint}`} target="_blank" rel="noopener noreferrer">View mint on Solscan <ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>
          <SourceNote source={q.data?.source} />
          <p className="text-xs text-muted-foreground">No price chart or holder list is shown because no verified source provides them.</p>
        </aside>
      </div>
    </Page>
  );
}
