import { useMemo } from 'react';
import { Link } from 'wouter';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight, Lock, Star, Network, Compass, PenLine, Layers, ShieldAlert, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useGetStonkfunTokens,
  getGetStonkfunTokensQueryKey,
  useGetLaunchConfig,
  getGetLaunchConfigQueryKey,
  getStonkfunToken,
  getGetStonkfunTokenQueryKey,
  type GetStonkfunTokensParams,
  type StonkfunToken,
} from '@workspace/api-client-react';
import { Page } from '@/components/layout';
import { TokenCard } from '@/components/token-card';
import { CardGridSkeleton, EmptyState, ErrorState, SectionHead, SourceNote, Pill } from '@/components/bits';
import { usePageMeta } from '@/lib/seo';
import { asset, readError, DARK_ACTIVATION_COPY } from '@/lib/api';

function TokenModule({ params, emptyTitle, emptyBody, exploreView }: { params: GetStonkfunTokensParams; emptyTitle: string; emptyBody: string; exploreView: string }) {
  const q = useGetStonkfunTokens(params, { query: { queryKey: getGetStonkfunTokensQueryKey(params), staleTime: 60_000 } });
  if (q.isLoading) return <CardGridSkeleton count={6} />;
  if (q.isError) return <ErrorState message={readError(q.error, 'Discovery provider is unavailable.').message} onRetry={() => q.refetch()} />;
  const tokens = q.data?.tokens ?? [];
  if (tokens.length === 0) return <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tokens.slice(0, 6).map((t, i) => <TokenCard key={t.mint} token={t} index={i} />)}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <SourceNote source={q.data?.source} />
        <Link href={`/explore?view=${exploreView}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline" data-testid={`link-more-${exploreView}`}>
          See all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

const qualifies = (t: StonkfunToken) => t.darkPair && !t.underReview && !t.metadataSuppressed;
/** Rank by provider 24h volume (missing last), then provider listing time. No other signals. */
function rank(a: StonkfunToken, b: StonkfunToken) {
  const va = a.metrics.volume24hUsd, vb = b.metrics.volume24hUsd;
  if (va != null || vb != null) {
    if (va == null) return 1;
    if (vb == null) return -1;
    if (vb !== va) return vb - va;
  }
  return (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0);
}

function DarkFeatured({ featuredMints }: { featuredMints: string[] }) {
  const mints = featuredMints.slice(0, 24);
  const results = useQueries({
    queries: mints.map((m) => ({ queryKey: getGetStonkfunTokenQueryKey(m), queryFn: () => getStonkfunToken(m), staleTime: 60_000, retry: false })),
  });
  const dark = useGetStonkfunTokens({ view: 'dark', pageSize: 24 }, { query: { queryKey: getGetStonkfunTokensQueryKey({ view: 'dark', pageSize: 24 }), staleTime: 60_000 } });
  const loading = results.some((r) => r.isLoading) || dark.isLoading;
  const curated = useMemo(
    () => results.map((r) => r.data).filter((d): d is NonNullable<typeof d> => !!d && !d.source.stale && qualifies(d.token)).map((d) => d.token).sort(rank),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results.map((r) => r.dataUpdatedAt).join(',')],
  );
  const notIndexed = results.filter((r) => r.isError).length;
  const excluded = results.filter((r) => r.data && (r.data.source.stale || !qualifies(r.data.token))).length;
  const ranked = useMemo(() => {
    if (dark.data?.source.stale) return [];
    return (dark.data?.tokens ?? []).filter(qualifies).sort(rank);
  }, [dark.data]);

  if (loading) return <CardGridSkeleton count={3} />;
  const useCurated = curated.length > 0;
  const list = (useCurated ? curated : ranked).slice(0, 6);
  if (!useCurated && dark.isError) return <ErrorState message={readError(dark.error, 'Discovery provider is unavailable.').message} onRetry={() => dark.refetch()} />;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill tone="purple"><Star className="h-3 w-3" />{useCurated ? 'Curated by DarkSwap' : 'Ranked $DARK-paired'}</Pill>
        <span className="font-mono text-[11px] text-muted-foreground" data-testid="text-featured-coverage">
          {useCurated
            ? `Showing ${list.length} of ${featuredMints.length} featured mints${notIndexed ? ` · ${notIndexed} not indexed` : ''}${excluded ? ` · ${excluded} excluded (not verified $DARK pair, under review, suppressed or stale)` : ''}${featuredMints.length > 24 ? ' · first 24 checked' : ''}`
            : `${featuredMints.length ? 'No featured mint currently qualifies. ' : ''}Top ${list.length} of ${ranked.length} verified $DARK-paired tokens in the first provider page`}
          {' · '}ranked by 24h volume, then listing time
        </span>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No qualifying $DARK launches yet">Nothing quoted in the verified $DARK mint passes review and freshness checks right now.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="grid-dark-featured">{list.map((t) => <TokenCard key={t.mint} token={t} />)}</div>
      )}
    </div>
  );
}

export default function Home() {
  usePageMeta({ description: 'Launch tokens directly into the DarkSwap ecosystem. Discover Solana launches with sourced facts and prepare your own launch privately.' });
  const cfg = useGetLaunchConfig({ query: { queryKey: getGetLaunchConfigQueryKey(), staleTime: 60_000 } });
  const config = cfg.data;
  const darkLive = !!config?.darkPairAvailable;

  return (
    <>
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="grid-lines absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_70%)]" />
        <img src={asset('/hero-monolith.jpg')} alt="" aria-hidden className="pointer-events-none absolute right-0 top-0 h-full w-full object-cover object-right opacity-70 md:w-[62%] [mask-image:linear-gradient(90deg,transparent,black_45%)]" />
        <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-20 md:px-6 md:pb-32 md:pt-28">
          <div className="fade-up flex flex-wrap gap-2">
            <Pill tone="purple">Solana mainnet-beta</Pill>
            <Pill>Preparation only · execution not yet live</Pill>
          </div>
          <h1 className="fade-up d1 mt-6 max-w-3xl text-[clamp(3rem,9vw,7.5rem)] font-extrabold leading-[0.9] tracking-[-0.045em]" data-testid="text-hero">
            launch in <span className="text-gradient">the dark.</span>
          </h1>
          <p className="fade-up d2 mt-6 max-w-xl text-lg text-muted-foreground md:text-xl" data-testid="text-hero-sub">
            Launch tokens directly into the DarkSwap ecosystem.
          </p>
          <div className="fade-up d3 mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-12 px-6 font-semibold tracking-wide">
              <Link href="/create" data-testid="button-create-token">CREATE TOKEN <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 bg-background/40 px-6 font-semibold tracking-wide backdrop-blur">
              <Link href="/explore" data-testid="button-explore-launches">EXPLORE LAUNCHES</Link>
            </Button>
          </div>
          <p className="fade-up d4 mt-8 max-w-lg text-xs text-muted-foreground">
            Drafts are saved privately to your verified wallet. No token is created, no transaction is requested and no fee is charged in this release.
          </p>
        </div>
      </section>

      <Page className="space-y-24">
        <section aria-labelledby="trending">
          <SectionHead eyebrow="01 / Activity" title="Trending on DarkSwap" action={null}>
            Ranked by provider-reported 24h volume, not market cap. Holder, buyer and transaction counts are not available from the current source.
          </SectionHead>
          <TokenModule params={{ view: 'trending', pageSize: 12 }} exploreView="trending" emptyTitle="Nothing trending right now" emptyBody="The discovery source returned no active tokens for this view." />
        </section>

        <section aria-labelledby="new">
          <SectionHead eyebrow="02 / Recency" title="New launches">Newest first, as listed by the provider. Listing time is a provider timestamp, not a verified chain launch time.</SectionHead>
          <TokenModule params={{ view: 'new', pageSize: 12 }} exploreView="new" emptyTitle="No new launches listed" emptyBody="Check back shortly; the catalog refreshes on a short cache." />
        </section>

        <section aria-labelledby="dark">
          <SectionHead eyebrow="03 / Ecosystem" title="Built around $DARK">Build around $DARK. Only tokens quoted in the configured, verified $DARK mint on mainnet-beta appear here. Ticker look-alikes never qualify.</SectionHead>
          {cfg.isLoading ? (
            <CardGridSkeleton count={3} />
          ) : cfg.isError ? (
            <ErrorState title="Launch configuration unavailable" message={`${readError(cfg.error).message} $DARK pairing status cannot be shown until configuration loads.`} onRetry={() => cfg.refetch()} />
          ) : darkLive ? (
            <TokenModule params={{ view: 'dark', pageSize: 12 }} exploreView="dark" emptyTitle="No $DARK-paired launches yet" emptyBody="Pairing is verified, but no tokens quoted in $DARK are listed yet." />
          ) : (
            <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-accent/60 via-card to-card p-8 md:p-12" data-testid="card-dark-locked">
              <div className="scan absolute right-10 top-0 h-full w-px bg-gradient-to-b from-transparent via-primary to-transparent" />
              <Lock className="h-6 w-6 text-accent-foreground" />
              <h3 className="mt-4 max-w-xl text-2xl font-extrabold md:text-3xl">{config?.darkPairMessage || DARK_ACTIVATION_COPY}</h3>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                The configured $DARK pairing is not currently verified as launch-ready on the discovery source. This module stays empty until it is; nothing is shown in its place.
              </p>
              <a href="https://darkswap.app/token" target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline">About $DARK <ArrowRight className="h-3.5 w-3.5" /></a>
            </div>
          )}
        </section>

        <section aria-labelledby="near">
          <SectionHead eyebrow="04 / Ecosystem" title="NEAR ecosystem launches">
            Solana tokens quoted in an evidence-backed NEAR-symbol Solana mint. This does not imply native NEAR-chain support or bridging.
          </SectionHead>
          {config && !config.nearPairingEnabled ? (
            <EmptyState title="NEAR grouping is not enabled">DarkSwap has not enabled evidence-backed NEAR pair grouping yet.</EmptyState>
          ) : (
            <TokenModule params={{ view: 'near', pageSize: 12 }} exploreView="near" emptyTitle="No NEAR-grouped launches found" emptyBody="No tokens matched a verified NEAR-group quote mint in the current results." />
          )}
        </section>

        <section aria-labelledby="dark-launching">
          <SectionHead eyebrow="05 / Featured" title="Launching in the Dark">Featured $DARK-paired launches only. Admin-curated mints appear first when verified; otherwise verified $DARK-paired tokens ranked by available 24h volume, then listing time.</SectionHead>
          {cfg.isLoading ? <CardGridSkeleton count={3} /> : cfg.isError ? (
            <ErrorState title="Launch configuration unavailable" message={readError(cfg.error).message} onRetry={() => cfg.refetch()} />
          ) : darkLive ? <DarkFeatured featuredMints={config?.featuredMints ?? []} /> : (
            <EmptyState title="Locked until $DARK pairing is verified" icon={<Lock className="h-5 w-5 text-accent-foreground" />} >
              {config?.darkPairMessage || DARK_ACTIVATION_COPY} The configured pairing is not currently verified, so no featured tokens are shown.
            </EmptyState>
          )}
        </section>

        <section aria-labelledby="infra" className="rounded-3xl border border-primary/25 bg-gradient-to-br from-accent/40 to-card p-8 md:p-10">
          <div className="flex flex-wrap items-center gap-2"><Pill tone="warn">Planned</Pill><Pill>Not live</Pill></div>
          <h2 id="infra" className="mt-4 flex items-center gap-3 text-2xl font-extrabold md:text-4xl"><Network className="h-7 w-7 text-accent-foreground" />$DARK + NEAR ecosystem infrastructure</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">A planned direction for linking $DARK launches with NEAR ecosystem liquidity. Today, everything here is Solana mainnet-beta and preparation only: NEAR-group pairs are Solana mints, and there is no native NEAR-chain execution, bridging or redemption.</p>
        </section>

        <section aria-labelledby="dark-launch" className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="eyebrow mb-2">06 / Process</div>
            <h2 id="dark-launch" className="text-3xl font-extrabold md:text-5xl">Prepare your launch</h2>
            <p className="mt-4 max-w-md text-muted-foreground">
              Prepare everything a launch needs, privately, with every unknown labeled. When verified execution arrives, your reviewed draft is ready.
            </p>
            <div className="mt-8 rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4 text-chart-5" />Current readiness</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>Execution: <span className="text-foreground">{config?.unavailableReason ?? 'Unavailable'}</span></li>
                <li>Provider launch fee: <span className="text-foreground">Not verified, nothing charged</span></li>
                <li>Launch destination: <span className="text-foreground">Not verified</span></li>
                <li>Privacy: drafts are private to your wallet session. On-chain activity is public; no anonymity is promised.</li>
              </ul>
            </div>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {[
              { i: Wallet, t: 'Verify your wallet', d: 'Sign a plain message. No transaction, no approval, no fee.' },
              { i: PenLine, t: 'Shape the identity', d: 'Name, ticker, story, socials and a validated logo with live preview.' },
              { i: Layers, t: 'Pick a pair', d: '$DARK first when verified, then NEAR-group, stablecoin and other launchable pairs.' },
              { i: Compass, t: 'Review and hold', d: 'Supply and allocations totaling exactly 100%, confirmed and saved for later.' },
            ].map((s, idx) => (
              <li key={s.t} className="lift rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center justify-between">
                  <s.i className="h-5 w-5 text-accent-foreground" />
                  <span className="font-mono text-xs text-muted-foreground">0{idx + 1}</span>
                </div>
                <div className="mt-6 font-display text-lg font-bold">{s.t}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
            <li className="sm:col-span-2">
              <Button asChild className="w-full h-12"><Link href="/create" data-testid="button-start-draft">Start a private draft <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </li>
          </ol>
        </section>
      </Page>
    </>
  );
}
