import { useEffect, useState } from 'react';
import { useSearch, useLocation } from 'wouter';
import { Search, ChevronLeft, ChevronRight, Info, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useGetStonkfunTokens,
  getGetStonkfunTokensQueryKey,
  useGetLaunchConfig,
  getGetLaunchConfigQueryKey,
  type GetStonkfunTokensParams,
  type GetStonkfunTokensView,
} from '@workspace/api-client-react';
import { Page } from '@/components/layout';
import { TokenCard } from '@/components/token-card';
import { CardGridSkeleton, EmptyState, ErrorState, SourceNote } from '@/components/bits';
import { usePageMeta } from '@/lib/seo';
import { readError, SOLANA_ADDRESS, DARK_ACTIVATION_COPY } from '@/lib/api';
import { cn } from '@/lib/utils';

const VIEWS: { id: GetStonkfunTokensView; label: string }[] = [
  { id: 'trending', label: 'Trending' },
  { id: 'new', label: 'New' },
  { id: 'dark', label: '$DARK Pairs' },
  { id: 'near', label: 'NEAR' },
  { id: 'graduating', label: 'Graduating' },
  { id: 'graduated', label: 'Graduated' },
];

export default function Explore() {
  usePageMeta({ title: 'Explore launches', description: 'Search and browse Solana token launches by name, ticker, mint or pair mint, with sourced data and clear coverage notes.' });
  const search = useSearch();
  const [, setLocation] = useLocation();
  const sp = new URLSearchParams(search);
  const cfg = useGetLaunchConfig({ query: { queryKey: getGetLaunchConfigQueryKey(), staleTime: 60_000 } });

  const urlView = sp.get('view') as GetStonkfunTokensView | null;
  const view = urlView && VIEWS.some((v) => v.id === urlView) ? urlView : null;
  const effectiveView: GetStonkfunTokensView = view ?? (cfg.data?.defaultView ?? 'trending');
  const page = Math.min(100, Math.max(1, Math.floor(Number(sp.get('page')) || 1)));
  const [qInput, setQInput] = useState(sp.get('q') ?? '');
  const q = sp.get('q') ?? '';
  const pairMint = sp.get('pair') ?? '';
  const urlSort = sp.get('sort');
  const sort = urlSort === 'newest' || urlSort === 'volume' ? urlSort : 'default';

  // The URL is authoritative for committed filters and pagination, including
  // direct loads and browser navigation. Never reset a deep-linked page on mount.
  const navigate = (patch: Record<string, string>, replace = false) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    setLocation(`/explore${next.size ? `?${next}` : ''}`, { replace });
  };
  useEffect(() => { setQInput(q); }, [q]);
  useEffect(() => {
    if (qInput.trim() === q) return;
    const t = window.setTimeout(() => {
      const next = new URLSearchParams(search);
      if (qInput.trim()) next.set('q', qInput.trim()); else next.delete('q');
      next.delete('page');
      setLocation(`/explore${next.size ? `?${next}` : ''}`, { replace: true });
    }, 350);
    return () => window.clearTimeout(t);
  }, [qInput, q, search, setLocation]);

  const pairValid = pairMint === '' || SOLANA_ADDRESS.test(pairMint);
  const usePair = pairMint !== '' && pairValid && effectiveView !== 'dark';
  const params: GetStonkfunTokensParams = {
    view: effectiveView,
    page,
    pageSize: 24,
    ...(q ? { q } : {}),
    ...(sort !== 'default' ? { sort } : {}),
    ...(usePair ? { quoteMint: pairMint } : {}),
  };
  const enabled = cfg.isFetched || view !== null;
  const tq = useGetStonkfunTokens(params, { query: { queryKey: getGetStonkfunTokensQueryKey(params), enabled, staleTime: 30_000 } });
  const data = tq.data;
  const maxPage = data?.pagination.maxAccessiblePage ?? 1;
  const looksLikeCreatorSearch = SOLANA_ADDRESS.test(q);

  return (
    <Page>
      <div className="eyebrow mb-2">Discovery</div>
      <h1 className="text-4xl font-extrabold md:text-6xl">Explore launches</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">Every number below is provider-sourced. Missing data is shown as unavailable, never zero.</p>

      <div role="tablist" aria-label="Discovery views" className="mt-8 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card/60 p-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={effectiveView === v.id}
            onClick={() => navigate({ view: v.id, page: '' })}
            className={cn('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground', effectiveView === v.id && 'bg-primary text-primary-foreground hover:text-primary-foreground')}
            data-testid={`tab-${v.id}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" maxLength={120} value={qInput} onChange={(e) => { setQInput(e.target.value); if (!e.target.value) navigate({ q: '', page: '' }, true); }} placeholder="Name, ticker or token mint" className="h-11 pl-9" aria-label="Search tokens" data-testid="input-search" />
        </div>
        <div>
          <Input value={pairMint} onChange={(e) => navigate({ pair: e.target.value.trim(), page: '' }, true)} placeholder="Exact pair (quote) mint address" className={cn('h-11 font-mono text-xs', !pairValid && 'border-destructive')} aria-label="Filter by pair mint" aria-invalid={!pairValid} disabled={effectiveView === 'dark'} data-testid="input-pair-mint" />
          {!pairValid && <p className="mt-1 text-xs text-destructive">Enter a full Solana mint address.</p>}
        </div>
        <Select value={sort} onValueChange={(v) => navigate({ sort: v === 'default' ? '' : v, page: '' })}>
          <SelectTrigger className="h-11" aria-label="Sort" data-testid="select-sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default order</SelectItem>
            <SelectItem value="volume">24h volume</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        <p className="flex items-start gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Search runs provider-wide on name, ticker and mint. Creator lookup is unavailable: the source has no verified creator attribution.</p>
        {looksLikeCreatorSearch && <p className="text-chart-5">Address searches match token mints only, not creator wallets.</p>}
        {data?.coverage.viewFilterScope === 'current_page' && <p className="text-chart-5">This view is filtered locally on the current provider page only; results are not a complete catalog search.</p>}
        {data?.coverage.warnings.map((w) => <p key={w} className="text-chart-5">{w}</p>)}
      </div>

      <div className="mt-8">
        {effectiveView === 'dark' && cfg.data && !cfg.data.darkPairAvailable ? (
          <EmptyState title="$DARK pairs are not live yet" icon={<Lock className="h-5 w-5 text-accent-foreground" />}>{cfg.data.darkPairMessage || DARK_ACTIVATION_COPY}</EmptyState>
        ) : tq.isLoading || !enabled ? (
          <CardGridSkeleton count={9} />
        ) : tq.isError ? (
          <ErrorState message={readError(tq.error, 'The discovery provider failed to respond.').message} onRetry={() => tq.refetch()} />
        ) : !data || data.tokens.length === 0 ? (
          <EmptyState title="No matching tokens" action={q || pairMint ? <Button variant="outline" size="sm" onClick={() => { setQInput(''); navigate({ q: '', pair: '', page: '' }); }}>Clear filters</Button> : undefined}>
            {q ? `No provider results for "${q}" in this view.` : 'This view has no tokens on the current page.'}
          </EmptyState>
        ) : (
          <>
            <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3 transition-opacity', tq.isFetching && 'opacity-60')}>
              {data.tokens.map((t, i) => <TokenCard key={t.mint} token={t} index={(page - 1) * 24 + i} />)}
            </div>
            <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 md:flex-row">
              <div className="space-y-1">
                <div className="font-mono text-xs text-muted-foreground" data-testid="text-pagination">
                  Page {data.pagination.page} of {maxPage} · {data.pagination.total.toLocaleString()} provider results · {data.pagination.returned} shown
                  {data.pagination.totalPages > maxPage && ` · browsing capped at ${maxPage} pages`}
                </div>
                <SourceNote source={data.source} />
              </div>
              <nav className="flex items-center gap-2" aria-label="Pagination">
                <Button variant="outline" size="sm" disabled={page <= 1 || tq.isFetching} onClick={() => navigate({ page: page === 2 ? '' : String(page - 1) })} data-testid="button-prev-page"><ChevronLeft className="mr-1 h-4 w-4" />Prev</Button>
                <Button variant="outline" size="sm" disabled={page >= maxPage || tq.isFetching} onClick={() => navigate({ page: String(page + 1) })} data-testid="button-next-page">Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
              </nav>
            </div>
          </>
        )}
      </div>
    </Page>
  );
}
