import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowUpRight, ChevronDown, Database, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { getGetNearTrendsQueryKey, useGetNearTrends, type NearTrendPool } from '@workspace/api-client-react';
import { Footer, Header } from '../components/swap-ui';
import './near-discovery.css';

type Feed = 'all' | 'trending' | 'new';
type Sort = 'feed' | 'volume' | 'liquidity' | 'change' | 'newest' | 'activity';
type ListedPool = { pool: NearTrendPool; feeds: Set<'trending' | 'new'> };
const trendingParams = { view: 'trending' as const };
const newParams = { view: 'new' as const };

function secureUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function money(value: number | null, compact = false) {
  if (value === null || !Number.isFinite(value)) return 'Unavailable';
  if (value > 0 && value < .0001 && !compact) return `$${value.toPrecision(3)}`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    ...(compact ? { notation: 'compact', maximumFractionDigits: 2 } : { maximumFractionDigits: 4 }),
  }).format(value);
}

function dateText(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
  }).format(date);
}

function PoolAvatar({ pool }: { pool: NearTrendPool }) {
  const [broken, setBroken] = useState(false);
  const image = secureUrl(pool.tokenImage);
  return <span className="discovery-avatar">
    {image && !broken ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : pool.tokenSymbol.slice(0, 2).toUpperCase()}
  </span>;
}

function PoolCard({ item, index }: { item: ListedPool; index: number }) {
  const { pool, feeds } = item;
  const url = secureUrl(pool.url);
  const change = pool.priceChange24h;
  const validChange = change !== null && Number.isFinite(change);
  return <article className="discovery-card" style={{ '--i': index } as CSSProperties} data-testid={`card-discovery-pool-${pool.id}`}>
    <div className="discovery-card-head">
      <div className="discovery-identity">
        <PoolAvatar pool={pool} />
        <div className="discovery-identity-text">
          <strong data-testid={`text-discovery-symbol-${pool.id}`} title={pool.tokenSymbol}>{pool.tokenSymbol}</strong>
          <small title={pool.tokenName}>{pool.tokenName}</small>
        </div>
      </div>
      <span className="discovery-tag">{feeds.size === 2 ? 'Both feeds' : feeds.has('new') ? 'New feed' : 'Trending'}</span>
    </div>
    <div className="discovery-feature">
      <div><span>Pool token price</span><strong data-testid={`text-discovery-price-${pool.id}`}>{money(pool.priceUsd)}</strong></div>
      <div className={`discovery-change${!validChange ? ' missing' : change < 0 ? ' down' : ''}`} data-testid={`text-discovery-change-${pool.id}`}>
        {validChange ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%` : 'Unavailable'}
      </div>
    </div>
    <div className="discovery-metrics">
      <div className="discovery-metric"><span>24h volume</span><strong data-testid={`text-discovery-volume-${pool.id}`}>{money(pool.volume24h, true)}</strong></div>
      <div className="discovery-metric"><span>Liquidity</span><strong data-testid={`text-discovery-liquidity-${pool.id}`}>{money(pool.liquidityUsd, true)}</strong></div>
      <div className="discovery-metric"><span>24h buys / sells</span><strong>{pool.buys24h.toLocaleString()} / {pool.sells24h.toLocaleString()}</strong></div>
    </div>
    <div className="discovery-card-bottom">
      <div><span>DEX / created</span><small>{pool.dex} · {dateText(pool.createdAt)}</small></div>
      {url ? <a className="discovery-pool-link" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`View ${pool.tokenSymbol} pool on external source`} data-testid={`link-discovery-pool-${pool.id}`}>View pool <ArrowUpRight size={15} /></a> : <span className="discovery-unavailable">No secure link</span>}
    </div>
  </article>;
}

export default function NearDiscovery() {
  const [search, setSearch] = useState('');
  const [feed, setFeed] = useState<Feed>('all');
  const [dex, setDex] = useState('all');
  const [sort, setSort] = useState<Sort>('feed');
  const trends = useGetNearTrends(trendingParams, { query: { queryKey: getGetNearTrendsQueryKey(trendingParams), staleTime: 30_000, refetchInterval: 60_000 } });
  const fresh = useGetNearTrends(newParams, { query: { queryKey: getGetNearTrendsQueryKey(newParams), staleTime: 30_000, refetchInterval: 60_000 } });

  const listed = useMemo(() => {
    const map = new Map<string, ListedPool>();
    for (const [source, pools] of [['trending', trends.data?.pools], ['new', fresh.data?.pools]] as const) {
      for (const pool of pools ?? []) {
        const existing = map.get(pool.id);
        if (existing) existing.feeds.add(source);
        else map.set(pool.id, { pool, feeds: new Set([source]) });
      }
    }
    return [...map.values()];
  }, [trends.data?.pools, fresh.data?.pools]);

  const dexes = useMemo(() => [...new Set(listed.map(item => item.pool.dex))].sort((a, b) => a.localeCompare(b)), [listed]);
  const results = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const matching = listed.filter(({ pool, feeds }) =>
      (feed === 'all' || feeds.has(feed)) &&
      (dex === 'all' || pool.dex === dex) &&
      (!term || [pool.tokenSymbol, pool.tokenName, pool.tokenAddress, pool.address, pool.dex, pool.id].some(value => value.toLocaleLowerCase().includes(term)))
    );
    if (sort === 'feed') return matching;
    const metric = (pool: NearTrendPool) => {
      switch (sort) {
        case 'volume': return pool.volume24h;
        case 'liquidity': return pool.liquidityUsd;
        case 'change': return pool.priceChange24h;
        case 'activity': return pool.buys24h + pool.sells24h;
        case 'newest': {
          const time = pool.createdAt ? Date.parse(pool.createdAt) : NaN;
          return Number.isFinite(time) ? time : null;
        }
      }
    };
    return [...matching].sort((a, b) => {
      const left = metric(a.pool), right = metric(b.pool);
      if (left === null || !Number.isFinite(left)) return right === null || !Number.isFinite(right) ? 0 : 1;
      if (right === null || !Number.isFinite(right)) return -1;
      return right - left;
    });
  }, [listed, search, feed, dex, sort]);

  const initialLoading = !trends.data && !fresh.data && (trends.isPending || fresh.isPending);
  const totalError = !trends.data && !fresh.data && trends.isError && fresh.isError;
  const refresh = () => { void trends.refetch(); void fresh.refetch(); };
  const clear = () => { setSearch(''); setFeed('all'); setDex('all'); setSort('feed'); };
  const partialError = (trends.isError || fresh.isError) && !totalError;

  return <div className="app-shell">
    <Header />
    <main className="discovery-page page-enter">
      <section className="discovery-hero" aria-labelledby="discovery-title">
        <div>
          <div className="discovery-kicker">DARKSWAP / NEAR FIELD NOTES</div>
          <h1 id="discovery-title">Find the<br /><span>pool, not hype.</span></h1>
          <p className="discovery-hero-copy">A quieter way to scan NEAR liquidity pools. Explore the trending and newly listed feeds together, then follow the source to inspect a pool yourself.</p>
        </div>
        <aside className="discovery-hero-aside">
          <div className="discovery-orbit" aria-hidden="true" />
          <span className="discovery-label">01 / Scope of view</span>
          <strong>A window, not the whole market.</strong>
          <p>Discovery covers up to 20 pools per feed, not all NEAR tokens. These listings are not verified memes or a safety assessment.</p>
        </aside>
      </section>

      <section aria-label="Discover NEAR liquidity pools">
        <div className="discovery-toolbar">
          <div className="discovery-toolbar-head"><h2>Pool directory</h2><span>READ-ONLY / NO WALLET REQUIRED</span></div>
          <div className="discovery-controls">
            <label className="discovery-control"><Search size={17} aria-hidden="true" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search loaded pools, tokens, addresses" aria-label="Search loaded pools" data-testid="input-discovery-search" /></label>
            <label className="discovery-control"><select value={feed} onChange={event => setFeed(event.target.value as Feed)} aria-label="Filter by feed" data-testid="select-discovery-feed"><option value="all">Both feeds</option><option value="trending">Trending feed</option><option value="new">New feed</option></select><ChevronDown size={15} aria-hidden="true" /></label>
            <label className="discovery-control"><select value={dex} onChange={event => setDex(event.target.value)} aria-label="Filter by DEX" data-testid="select-discovery-dex"><option value="all">All DEXs</option>{dexes.map(value => <option value={value} key={value}>{value}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></label>
            <label className="discovery-control"><select value={sort} onChange={event => setSort(event.target.value as Sort)} aria-label="Sort pools" data-testid="select-discovery-sort"><option value="feed">Feed order</option><option value="volume">Highest 24h volume</option><option value="liquidity">Highest liquidity</option><option value="change">Highest 24h change</option><option value="activity">Most 24h trades</option><option value="newest">Newest created</option></select><ChevronDown size={15} aria-hidden="true" /></label>
          </div>
        </div>
        <div className="discovery-feedbar">
          <p data-testid="text-discovery-summary"><strong>{listed.length} unique pools loaded</strong> from two limited feeds · {results.length} shown{(trends.isFetching || fresh.isFetching) && (trends.data || fresh.data) ? ' · Updating feeds' : ''}</p>
          <button className="discovery-refresh" type="button" onClick={refresh} disabled={trends.isFetching || fresh.isFetching} data-testid="button-discovery-refresh"><RefreshCw size={14} /> Refresh feeds</button>
        </div>
        <div className="discovery-sources" aria-label="Feed attribution and update times">
          <span data-testid="text-discovery-trending-source"><strong>Trending</strong> · {trends.data ? `${trends.data.source} · ${dateText(trends.data.updatedAt)} · ${trends.data.pools.length} pools` : trends.isError ? 'Feed unavailable' : 'Loading source and timestamp'}</span>
          <span data-testid="text-discovery-new-source"><strong>New</strong> · {fresh.data ? `${fresh.data.source} · ${dateText(fresh.data.updatedAt)} · ${fresh.data.pools.length} pools` : fresh.isError ? 'Feed unavailable' : 'Loading source and timestamp'}</span>
        </div>
        {partialError && <div className="discovery-alert" role="alert" data-testid="status-discovery-partial-error"><span>One feed could not be loaded. Results may be incomplete; the available feed remains visible.</span><button type="button" onClick={refresh} data-testid="button-discovery-retry-partial">Retry feeds</button></div>}
        {initialLoading ? <div className="discovery-loading" role="status" aria-label="Loading NEAR pool feeds" data-testid="status-discovery-loading">{[0, 1, 2, 3].map(index => <div className="discovery-loading-card" key={index}><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>)}</div>
          : totalError ? <div className="discovery-state" role="alert" data-testid="status-discovery-error"><Database size={26} /><h3>Both feeds are out of reach.</h3><p>Pool data could not be loaded right now. No wallet or order data is involved. Try requesting the feeds again.</p><button type="button" onClick={refresh} data-testid="button-discovery-retry">Try again</button></div>
          : results.length === 0 ? <div className="discovery-state" data-testid="status-discovery-empty"><SlidersHorizontal size={26} /><h3>{listed.length ? 'Nothing in this slice.' : 'No pools in the loaded feeds.'}</h3><p>{listed.length ? 'Try another search, feed, or DEX. Search only covers the pools already loaded here.' : 'The sources have no pools to display at the moment. Refresh later to check again.'}</p>{listed.length ? <button type="button" onClick={clear} data-testid="button-discovery-clear">Clear filters</button> : <button type="button" onClick={refresh} data-testid="button-discovery-retry-empty">Refresh feeds</button>}</div>
          : <><div className="discovery-count"><span>Directory / <em>{results.length} pools</em></span><span>24h figures where available</span></div><div className="discovery-grid" data-testid="list-discovery-pools">{results.map((item, index) => <PoolCard key={item.pool.id} item={item} index={index} />)}</div></>}
        <div className="discovery-disclosure"><strong>Before you leave DarkSwap:</strong> Pool activity and recency do not indicate quality or safety. Prices and 24-hour figures may be delayed or unavailable. Search and filters only apply to the loaded feeds of up to 20 pools each, not the full NEAR token universe. External pool links open a third-party site; verify addresses independently.</div>
      </section>
    </main>
    <Footer />
  </div>;
}