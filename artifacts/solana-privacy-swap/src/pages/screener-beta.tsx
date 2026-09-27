import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowRight, ArrowUp, Download, ExternalLink, Search, SlidersHorizontal } from 'lucide-react';
import { Footer, Header } from '../components/swap-ui';
import { CATALOG_AS_OF, RWA_CATALOG, type RwaCatalogEntry } from './screener-catalog';
import './screener-preview.css';

type CategoryFilter = 'all' | RwaCatalogEntry['category'];
type SortKey = 'name' | 'symbol' | 'category';

const categoryName = (value: RwaCatalogEntry['category']) => value === 'xstock' ? 'xStock' : 'PreStock';
const csvCell = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;

export default function ScreenerBeta() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('symbol');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const title = document.title;
    document.title = 'Screener Beta | DarkSwap';
    const updates = [
      ['meta[name="description"]', 'Search a dated catalog of Solana xStock and PreStock entries in your browser. No live market feed, price quotes, or per-search API requests.'],
      ['meta[property="og:title"]', 'Screener Beta | DarkSwap'],
      ['meta[property="og:description"]', 'Browse a dated Solana RWA catalog with local search. Listings are provider-reported, not independently verified.'],
    ] as const;
    const previous = updates.map(([selector, content]) => {
      const element = document.querySelector<HTMLMetaElement>(selector);
      const original = element?.content;
      if (element) element.content = content;
      return { element, original };
    });
    return () => {
      document.title = title;
      previous.forEach(({ element, original }) => { if (element && original !== undefined) element.content = original; });
    };
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return RWA_CATALOG.filter(item =>
      (category === 'all' || item.category === category) &&
      (!needle || `${item.name} ${item.symbol} ${item.mint} ${categoryName(item.category)}`.toLocaleLowerCase().includes(needle))
    ).sort((a, b) => {
      const value = a[sortKey].localeCompare(b[sortKey], undefined, { sensitivity: 'base' });
      return (direction === 'asc' ? value : -value) || a.symbol.localeCompare(b.symbol);
    });
  }, [query, category, sortKey, direction]);
  const selected = results.find(item => item.mint === selectedMint) ?? null;

  function reset() {
    setQuery('');
    setCategory('all');
    setSortKey('symbol');
    setDirection('asc');
    setAnnouncement('Search and filters cleared.');
  }
  function toggleSort(key: SortKey) {
    if (key === sortKey) setDirection(value => value === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setDirection('asc'); }
  }
  function exportCSV() {
    if (!results.length) return;
    const lines = [
      ['Screener Beta — provider-reported catalog snapshot', `Captured ${CATALOG_AS_OF}; not a live quote or verified issuance.`],
      [],
      ['Symbol', 'Name', 'Catalog category', 'Solana mint (provider-reported)'],
      ...results.map(item => [item.symbol, item.name, categoryName(item.category), item.mint]),
    ];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `darkswap-rwa-catalog-${CATALOG_AS_OF}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement(`Exported ${results.length} catalog entries.`);
  }

  return (
    <div className="app-shell sp-page">
      <Header />
      <main className="sp-wrap" id="main-content">
        <section className="sp-hero" aria-labelledby="sp-title">
          <div>
            <div className="sp-kicker">DarkSwap / Solana research / beta</div>
            <h1 id="sp-title">Screener<span> Beta</span></h1>
            <p>Search Solana xStock and PreStock catalog entries by name, ticker, category, or mint. Browse locally, then verify the details independently before relying on an asset.</p>
          </div>
          <div className="sp-edition"><strong>Browser-side search</strong>No polling<br />No search API calls</div>
        </section>
        <section className="sp-disclosure" aria-label="Catalog provenance">
          <span className="sp-disclosure-mark">CATALOG SNAPSHOT</span>
          <div><strong>Provider-reported entries, captured {CATALOG_AS_OF}.</strong>
            <p>Source: StonkFun public pair catalog. This is not a live feed. Mint addresses and labels have not been independently verified by DarkSwap; listing here does not prove backing, redemption rights, availability, price, or liquidity. No trading signals or investment advice.</p>
          </div>
          <span className="sp-disclosure-tail">Dated catalog<br />No live refresh</span>
        </section>
        <section className="sp-statline" aria-label="Catalog overview">
          <div className="sp-stat"><span>Catalog entries</span><strong>{RWA_CATALOG.length} <small>provider-reported</small></strong></div>
          <div className="sp-stat"><span>xStock entries</span><strong>{RWA_CATALOG.filter(item => item.category === 'xstock').length}</strong></div>
          <div className="sp-stat"><span>PreStock entries</span><strong>{RWA_CATALOG.filter(item => item.category === 'prestock').length}</strong></div>
          <div className="sp-stat"><span>Market data</span><strong className="sp-stat-small">Not connected</strong></div>
        </section>
        <div className="sp-workspace-head">
          <div><div className="sp-kicker">01 / Search the catalog</div><h2>RWA directory</h2></div>
          <p>SNAPSHOT {CATALOG_AS_OF} · Filter locally</p>
        </div>
        <div className="sp-workspace">
          <section className="sp-main" aria-label="Searchable RWA catalog">
            <div className="sp-toolbar">
              <div className="sp-toolbar-top"><span className="sp-toolbar-label">Catalog categories</span><button type="button" className="sp-clear" onClick={reset}>Clear search</button></div>
              <div className="sp-presets" role="group" aria-label="Filter category">
                {(['all', 'xstock', 'prestock'] as const).map(value => (
                  <button key={value} type="button" className="sp-preset" aria-pressed={category === value}
                    onClick={() => setCategory(value)} data-testid={`button-category-${value}`}>
                    {value === 'all' ? 'All entries' : categoryName(value)}
                  </button>
                ))}
              </div>
              <div className="sp-filters sp-filters-catalog">
                <div className="sp-field">
                  <label htmlFor="sp-search">Search by name, symbol, or mint</label>
                  <div className="sp-input-shell"><Search size={15} aria-hidden="true" /><input id="sp-search" type="search" className="sp-input" placeholder="Try NVDA, gold, or a mint address" value={query} onChange={event => setQuery(event.target.value)} data-testid="input-search-rwa" /></div>
                </div>
                <button className="sp-export" type="button" onClick={exportCSV} disabled={!results.length} data-testid="button-export-rwa-csv"><Download size={14} aria-hidden="true" /> Export results</button>
              </div>
            </div>
            <div className="sp-resultbar" role="status"><span><strong>{results.length}</strong> of {RWA_CATALOG.length} catalog entries</span><span>Search runs in your browser; no per-query request</span></div>
            {results.length ? (
              <div className="sp-table-scroll" role="region" tabIndex={0} aria-label="Scrollable RWA catalog table">
                <table className="sp-table">
                  <thead><tr>
                    {([
                      ['symbol', 'Symbol'], ['name', 'Name'], ['category', 'Catalog category'],
                    ] as const).map(([key, label]) => (
                      <th key={key} scope="col" aria-sort={sortKey === key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className="sp-sort" onClick={() => toggleSort(key)} aria-label={`Sort by ${label}`}>
                          {label}{sortKey === key ? (direction === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />) : <ArrowDownUp size={12} aria-hidden="true" />}
                        </button>
                      </th>
                    ))}
                    <th scope="col">Mint (provider-reported)</th><th scope="col">Detail</th>
                  </tr></thead>
                  <tbody>{results.map(item => (
                    <tr key={item.mint} className={selected?.mint === item.mint ? 'sp-selected' : undefined}>
                      <td><button type="button" className="sp-asset-link sp-asset" onClick={() => setSelectedMint(item.mint)} data-testid={`button-select-${item.symbol}`}><span className="sp-asset-mark" aria-hidden="true">{item.symbol.slice(0, 2)}</span><strong>{item.symbol}</strong></button></td>
                      <td>{item.name}</td>
                      <td><span className="sp-tag">{categoryName(item.category)}</span></td>
                      <td className="sp-mint">{item.mint}</td>
                      <td><button type="button" className="sp-view" onClick={() => setSelectedMint(item.mint)} aria-label={`Inspect ${item.symbol}`} data-testid={`button-detail-${item.symbol}`}>Inspect <ArrowRight size={13} aria-hidden="true" /></button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div className="sp-empty" role="status"><SlidersHorizontal size={22} aria-hidden="true" /><strong>No catalog matches.</strong><p>Try another symbol, name, or mint, or clear the category filter. This snapshot may not contain every RWA on Solana.</p><button className="sp-clear" type="button" onClick={reset}>Clear search</button></div>
            )}
            <div className="sp-table-foot"><span>Source: StonkFun public pair catalog · {CATALOG_AS_OF}</span><span>Not live · No prices or quotes</span></div>
          </section>
          <aside className="sp-detail" aria-label="Catalog entry details">
            <div className="sp-detail-top"><span>02 / Entry details</span><span>NOT VERIFIED</span></div>
            {selected ? (
              <div className="sp-detail-body" key={selected.mint}>
                <div className="sp-detail-symbol" aria-hidden="true">{selected.symbol.slice(0, 2)}</div>
                <h3>{selected.symbol}</h3>
                <span className="sp-detail-id">{selected.name} · {categoryName(selected.category)}</span>
                <p className="sp-detail-copy">This name and mint were reported in StonkFun’s catalog on {CATALOG_AS_OF}. Verify the issuer, on-chain mint, asset rights, and current availability yourself.</p>
                <dl className="sp-detail-list">
                  <div><dt>Category</dt><dd>{categoryName(selected.category)}</dd></div>
                  <div><dt>Price / liquidity</dt><dd>Not available</dd></div>
                  <div><dt>Issuer / backing</dt><dd>Not verified</dd></div>
                </dl>
                <div className="sp-mint-detail"><span>Provider-reported Solana mint</span><code>{selected.mint}</code></div>
                <a className="sp-external" href={`https://solscan.io/token/${selected.mint}`} target="_blank" rel="noopener noreferrer">Inspect mint on Solscan <ExternalLink size={14} aria-hidden="true" /></a>
                <button type="button" className="sp-detail-close" onClick={() => setSelectedMint(null)}>Clear selection</button>
              </div>
            ) : (
              <div className="sp-detail-body sp-detail-placeholder"><div className="sp-target" aria-hidden="true" /><h3>Choose an entry.</h3><p>Select a row to inspect its reported symbol and Solana mint. This page does not fetch a quote or open a trade.</p><span className="sp-detail-counter">{RWA_CATALOG.length} / DATED CATALOG ENTRIES</span></div>
            )}
          </aside>
        </div>
        <section className="sp-method" aria-labelledby="sp-method-title">
          <div><div className="sp-kicker">03 / What this beta does</div><h2 id="sp-method-title">Search first. Verify independently.</h2><p>The catalog is bundled with this site. Search, filtering, sorting, inspection, and CSV export happen locally; none of those actions request market data. Results can become outdated after the snapshot date.</p></div>
          <aside><strong>Research boundary</strong>A provider category is not proof of an issued security or underlying ownership. Confirm current details with primary issuer materials before making financial decisions. The separate Explore and public swap areas remain closed.</aside>
        </section>
        <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
      </main>
      <Footer />
    </div>
  );
}