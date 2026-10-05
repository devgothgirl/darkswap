import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, Database, Search, SlidersHorizontal } from 'lucide-react';
import { getGetNearTrendsQueryKey, getSearchNearPoolsQueryKey, useGetNearTrends, useSearchNearPools, type GetNearTrendsView, type NearTrendPool } from '@workspace/api-client-react';
import { Footer, Header } from '../components/swap-ui';
import { selectNearPoolState } from './near-trends-state';
import './near-trends.css';

type SortKey = 'default' | 'volume' | 'liquidity' | 'change' | 'price' | 'trades' | 'newest';

function usd(value: number | null, compact = false) {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  if (!compact && Math.abs(value) < .01) return `$${value.toLocaleString('en-US', { maximumSignificantDigits: 4 })}`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    ...(compact ? { notation: 'compact', maximumFractionDigits: 2 } : { maximumFractionDigits: 4 }),
  }).format(value);
}

function dateLabel(value: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}

function safePoolUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

function TokenMark({ pool }: { pool: NearTrendPool }) {
  const [broken, setBroken] = useState(false);
  return <span className="trends-avatar">
    {pool.tokenImage && safePoolUrl(pool.tokenImage) && !broken
      ? <img src={pool.tokenImage} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      : pool.tokenSymbol.slice(0, 2).toUpperCase()}
  </span>;
}

function PoolRow({ pool }: { pool: NearTrendPool }) {
  const [expanded, setExpanded] = useState(false);
  const link = safePoolUrl(pool.url);
  const change = pool.priceChange24h;
  return <tbody className="trends-entry" role="rowgroup" data-testid={`row-near-pool-${pool.id}`}>
    <tr className="trends-row" role="row">
      <td className="trends-token" role="cell" headers="near-pools-token">
        <TokenMark pool={pool} />
        <div className="trends-token-copy"><strong data-testid={`text-token-symbol-${pool.id}`}>{pool.tokenSymbol}</strong><small title={pool.tokenName}>{pool.tokenName}</small></div>
      </td>
      <td role="cell" headers="near-pools-price" className={`trends-value${pool.priceUsd === null ? ' muted' : ''}`} data-testid={`text-price-${pool.id}`}>{usd(pool.priceUsd)}</td>
      <td role="cell" headers="near-pools-change" className={`trends-value ${change === null ? 'muted' : change > 0 ? 'up' : change < 0 ? 'down' : ''}`} data-testid={`text-change-${pool.id}`}>{change === null || !Number.isFinite(change) ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`}</td>
      <td role="cell" headers="near-pools-volume" className={`trends-value${pool.volume24h === null ? ' muted' : ''}`} data-testid={`text-volume-${pool.id}`}>{usd(pool.volume24h, true)}</td>
      <td role="cell" headers="near-pools-liquidity" className={`trends-value${pool.liquidityUsd === null ? ' muted' : ''}`} data-testid={`text-liquidity-${pool.id}`}>{usd(pool.liquidityUsd, true)}</td>
      <td role="cell" headers="near-pools-trades" className="trends-trades" data-testid={`text-trades-${pool.id}`}>{pool.buys24h.toLocaleString()} buys<small>{pool.sells24h.toLocaleString()} sells</small></td>
      <td role="cell" headers="near-pools-dex" className="trends-dex" data-testid={`text-dex-${pool.id}`}>{pool.dex}</td>
      <td role="cell" headers="near-pools-inspect" className="trends-actions">
        <button type="button" className="trends-detail-trigger" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} details for ${pool.tokenSymbol}`} onClick={() => setExpanded(!expanded)} data-testid={`button-details-${pool.id}`}><ChevronDown size={16} /></button>
        {link && <a className="trends-out" href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Open ${pool.tokenSymbol} pool in external source`} data-testid={`link-pool-${pool.id}`}>Pool <ArrowUpRight size={14} /></a>}
      </td>
    </tr>
    {expanded && <tr role="row"><td role="cell" colSpan={8} className="trends-details-cell"><div className="trends-details" data-testid={`details-pool-${pool.id}`}>
      <div><span>Pool address</span><code>{pool.address}</code></div>
      <div><span>Token address</span><code>{pool.tokenAddress}</code></div>
      <div><span>Pool created</span><code>{dateLabel(pool.createdAt)}</code></div>
      <div><span>Pool ID</span><code>{pool.id}</code></div>
      <div><span>DEX</span><code>{pool.dex}</code></div>
      <div><span>Source link</span><code>{link ? 'Available via Open pool' : 'No secure external link available'}</code></div>
    </div></td></tr>}
  </tbody>;
}

export default function NearTrends() {
  const [view, setView] = useState<GetNearTrendsView>('trending');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [sort, setSort] = useState<SortKey>('default');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const searching = search.trim().length > 0;
  const searchReady = search.trim().length >= 2 && debouncedSearch === search.trim();
  const params = { view };
  const trends = useGetNearTrends(params, { query: { queryKey: getGetNearTrendsQueryKey(params), staleTime: 30_000, refetchInterval: searching ? false : 60_000 } });
  const searchParams = { query: debouncedSearch, page: searchPage };
  const results = useSearchNearPools(searchParams, { query: { queryKey: getSearchNearPoolsQueryKey(searchParams), enabled: searchReady, staleTime: 30_000 } });
  const { activeData, isPending, isFetching, state } = selectNearPoolState(search, debouncedSearch, trends, results, searchPage);
  const pools = useMemo(() => {
    const matches = activeData?.pools ?? [];
    if (sort === 'default') return matches;
    const metric = (pool: NearTrendPool): number | null => {
      switch (sort) {
        case 'volume': return pool.volume24h;
        case 'liquidity': return pool.liquidityUsd;
        case 'change': return pool.priceChange24h;
        case 'price': return pool.priceUsd;
        case 'trades': return pool.buys24h + pool.sells24h;
        case 'newest': {
          const time = pool.createdAt ? Date.parse(pool.createdAt) : NaN;
          return Number.isFinite(time) ? time : null;
        }
      }
    };
    return [...matches].sort((a, b) => {
      const left = metric(a), right = metric(b);
      if (left === null || !Number.isFinite(left)) return right === null || !Number.isFinite(right) ? 0 : 1;
      if (right === null || !Number.isFinite(right)) return -1;
      return right - left;
    });
  }, [activeData?.pools, sort]);

  return <div className="app-shell">
    <Header />
    <main className="trends-page page-enter">
      <div className="trends-intro">
        <div>
          <span className="trends-kicker">NEAR / POOL OBSERVATORY</span>
          <h1>Watch the market.<br /><span>Keep your judgment.</span></h1>
          <p>Explore activity across NEAR liquidity pools. Search tokens, compare 24-hour signals, and inspect the pool behind each listing.</p>
        </div>
        <aside className="trends-caution" aria-label="Market data disclosure">
          <strong>Observation, not endorsement</strong>
          <p>Trending means activity, not quality or safety. Pools can be volatile, illiquid, or misleading. Verify token and pool addresses before making any decision.</p>
        </aside>
      </div>

      <section className="trends-board" aria-label="NEAR pool activity">
        <div className="trends-board-top">
          <div><h2>Pool activity</h2><p>Public market data · read-only · no wallet required</p></div>
          <div className="trends-tabs" role="tablist" aria-label="Pool view">
            <button id="near-tab-trending" type="button" role="tab" aria-controls="near-pool-results" aria-selected={view === 'trending'} onClick={() => { setView('trending'); setSort('default'); }} data-testid="button-view-trending">Trending</button>
            <button id="near-tab-new" type="button" role="tab" aria-controls="near-pool-results" aria-selected={view === 'new'} onClick={() => { setView('new'); setSort('default'); }} data-testid="button-view-new">New pools</button>
          </div>
        </div>
        <div className="trends-tools">
          <label className="trends-search"><Search size={17} aria-hidden="true" /><input type="search" value={search} maxLength={100} onChange={event => { setSearch(event.target.value); setSearchPage(1); }} placeholder="Search NEAR tokens or pool addresses" aria-label="Search NEAR pools via GeckoTerminal" data-testid="input-search-pools" /></label>
          <label className="trends-sort-label" htmlFor="trends-sort">{searching ? 'SORT THIS PAGE' : 'SORT BY'}</label>
          <div className="trends-sort-wrap"><select className="trends-sort" id="trends-sort" value={sort} onChange={event => setSort(event.target.value as SortKey)} data-testid="select-sort-pools">
            <option value="default">Source order</option><option value="volume">24h volume</option><option value="liquidity">Liquidity</option><option value="change">24h change</option><option value="price">Price</option><option value="trades">24h trades</option><option value="newest">Newest created</option>
          </select><ChevronDown size={14} aria-hidden="true" /></div>
        </div>
        <div id="near-pool-results" role="tabpanel" aria-labelledby={`near-tab-${view}`} tabIndex={0}>
        <div className="trends-meta">
          <span data-testid="text-trends-source">{activeData ? <><strong>{pools.length} pools{searching ? ` on search page ${searchPage}` : ''}</strong> · Source: {activeData.source} · Updated {dateLabel(activeData.updatedAt)} · {searching ? 'NEAR search matches' : view === 'new' ? 'New pools' : 'Trending'}</> : 'Public NEAR pool data · Source: GeckoTerminal · update time shown when available'}</span>
          <button type="button" onClick={() => searching ? results.refetch() : trends.refetch()} disabled={isFetching || (searching && !searchReady)} data-testid="button-refresh-pools">{isFetching && !isPending ? 'Refreshing…' : 'Refresh data'}</button>
        </div>
        <table className="trends-table" role="table" aria-label="NEAR pool metrics" data-testid={state === 'list' ? 'list-near-pools' : undefined}>
        <thead role="rowgroup"><tr className="trends-columns" role="row">
          <th role="columnheader" scope="col" id="near-pools-token">Token / pool</th>
          <th role="columnheader" scope="col" id="near-pools-price">Price</th>
          <th role="columnheader" scope="col" id="near-pools-change">24h change</th>
          <th role="columnheader" scope="col" id="near-pools-volume">24h volume</th>
          <th role="columnheader" scope="col" id="near-pools-liquidity">Liquidity</th>
          <th role="columnheader" scope="col" id="near-pools-trades">24h trades</th>
          <th role="columnheader" scope="col" id="near-pools-dex">DEX</th>
          <th role="columnheader" scope="col" id="near-pools-inspect">Inspect</th>
        </tr></thead>
        {state === 'list' ? pools.map(pool => <PoolRow key={pool.id} pool={pool} />) : <tbody role="rowgroup"><tr role="row"><td role="cell" colSpan={8} className="trends-state-cell">
        {state === 'short' ? <div className="trends-state" role="status"><Search size={23} /><h3>Enter at least two characters.</h3><p>Search the NEAR pools indexed by GeckoTerminal using a token name, symbol, or address.</p></div>
          : state === 'loading' ? <div className="trends-loading" role="status" aria-label="Loading NEAR pools" data-testid="status-trends-loading">{Array.from({ length: 6 }, (_, index) => <div className="trends-loading-row" key={index}><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>)}</div>
          : state === 'error' ? <div className="trends-state" role="alert" data-testid="status-trends-error"><Database size={23} /><h3>Pool data is unavailable.</h3><p>We could not load {searching ? 'search results' : 'the public feed'} right now. Try again in a moment; no order or wallet data is involved.</p><button type="button" onClick={() => searching ? results.refetch() : trends.refetch()} data-testid="button-retry-pools">Try again</button></div>
          : state === 'empty' ? <div className="trends-state" data-testid="status-trends-empty"><SlidersHorizontal size={23} /><h3>{searching ? 'No displayable pools on this search page.' : 'No pools in this view.'}</h3><p>{searching ? 'Use Previous page to return to earlier matches, or Next page if available. You can also try another name, symbol, or exact address. An empty page does not mean a token or pool does not exist.' : 'The source has no pools to show here at the moment. Check the other view or refresh later.'}</p>{searching && <button type="button" onClick={() => { setSearch(''); setSearchPage(1); }} data-testid="button-clear-pool-search">Clear search</button>}</div>
          : null}
        </td></tr></tbody>}
        </table>
        {searching && searchReady && <nav className="trends-pagination" aria-label="NEAR search result pages" data-testid="pagination-near-search">
          <button type="button" className="secondary-button" onClick={() => setSearchPage(page => Math.max(1, page - 1))} disabled={searchPage <= 1 || isPending || isFetching} data-testid="button-search-previous">Previous page</button>
          <span role="status" aria-live="polite" data-testid="text-search-page">Search page {searchPage} · up to 10 pages</span>
          <button type="button" className="secondary-button" onClick={() => setSearchPage(page => Math.min(10, page + 1))} disabled={isPending || isFetching || state === 'error' || results.data?.page !== searchPage || !results.data?.hasNextPage} data-testid="button-search-next">Next page</button>
          {state !== 'loading' && state !== 'error' && results.data?.page === searchPage && !results.data.hasNextPage && <p role="status">{searchPage === 10 ? 'Search page limit reached. Refine your query for other matches.' : 'The provider returned an empty page. Earlier pages remain available.'} This is not an exhaustive directory.</p>}
        </nav>}
        <div className="trends-footnote">{searching ? 'Search queries GeckoTerminal one NEAR pool page at a time, up to 10 pages. Another page may be empty; results are provider-limited and are not an exhaustive token directory. Sorting applies only to the current page.' : 'Each feed shows up to 20 pools. Search GeckoTerminal above for older or less active NEAR pools.'} This is not a verified memecoin list. Prices and 24h figures may be delayed or unavailable. Opening a pool leaves DarkSwap.</div>
        </div>
      </section>
    </main>
    <Footer />
  </div>;
}