import { readFile } from 'node:fs/promises';

const LIMIT = 12;
const FRESH_MS = 120_000;
const MAX_AGE_MS = 15 * 60_000;
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 500;
const metric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const money = value => value === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 6 }).format(value);

// Consume only the existing public API. No provider keys, cookies, incoming
// query strings, account data, order data or personal headers are forwarded.
let apiOrigin;
async function fetchPublicFeed(view) {
  if (!apiOrigin) {
    const config = await readFile(new URL('../api-server/.replit-artifact/artifact.toml', import.meta.url), 'utf8');
    const port = config.match(/^localPort\s*=\s*(\d+)\s*$/m)?.[1];
    if (!port) throw new Error('Public API service port is not configured');
    apiOrigin = `http://127.0.0.1:${port}`;
  }
  const response = await fetch(`${apiOrigin}/api/near/trends?view=${view}`, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`Public market feed HTTP ${response.status}`);
  return response.json();
}

function normalize(feed, view, now) {
  const timestamp = Date.parse(feed?.updatedAt);
  if (feed?.view !== view || feed?.source !== 'GeckoTerminal' || !Array.isArray(feed.pools)
    || !Number.isFinite(timestamp) || timestamp > now + 60_000 || now - timestamp > MAX_AGE_MS) {
    throw new Error('Invalid or expired public market feed');
  }
  const pools = feed.pools.slice(0, LIMIT).map(pool => {
    if (!pool || !['id', 'address', 'tokenAddress', 'tokenName', 'tokenSymbol', 'dex'].every(key => text(pool[key]))) {
      throw new Error('Invalid public pool identity');
    }
    // Explicit projection: unexpected fields can never reach initial HTML.
    return {
      id: pool.id, address: pool.address, tokenAddress: pool.tokenAddress,
      tokenName: pool.tokenName, tokenSymbol: pool.tokenSymbol, dex: pool.dex,
      priceUsd: metric(pool.priceUsd), volume24h: metric(pool.volume24h),
      liquidityUsd: metric(pool.liquidityUsd), priceChange24h: metric(pool.priceChange24h),
      buys24h: Number.isInteger(pool.buys24h) && pool.buys24h >= 0 ? pool.buys24h : null,
      sells24h: Number.isInteger(pool.sells24h) && pool.sells24h >= 0 ? pool.sells24h : null,
      url: `https://www.geckoterminal.com/near/pools/${encodeURIComponent(pool.address)}`,
    };
  });
  return { view, source: feed.source, updatedAt: new Date(timestamp).toISOString(), pools };
}

// Finite two-key cache, coalesced refreshes, and cached failures protect both
// HTML latency and the API's market budget. Expired data is never shown as live.
export function createResearchSnapshots({ fetchFeed = fetchPublicFeed, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  async function load(view) {
    const previous = cache.get(view);
    if (previous && previous.retryAt > now()) return previous;
    if (pending.has(view)) return pending.get(view);
    const work = (async () => {
      try {
        const value = normalize(await fetchFeed(view), view, now());
        const entry = { value, failed: false, retryAt: now() + 90_000 };
        cache.set(view, entry);
        return entry;
      } catch {
        const entry = { value: previous?.value, failed: true, retryAt: now() + 30_000 };
        cache.set(view, entry);
        return entry;
      }
    })();
    pending.set(view, work);
    try { return await work; } finally { pending.delete(view); }
  }
  return async function researchHtml(pathname) {
    const path = pathname.replace(/\/+$/, '') || '/';
    if (!['/near-trends', '/near-discovery'].includes(path)) return '';
    const views = path === '/near-discovery' ? ['trending', 'new'] : ['trending'];
    const feeds = await Promise.all(views.map(load));
    const sections = feeds.map((entry, i) => {
      const label = views[i] === 'new' ? 'New pools' : 'Trending pools';
      const feed = entry.value;
      if (!feed || now() - Date.parse(feed.updatedAt) > MAX_AGE_MS) {
        return `<section><h3>${label}</h3><p>GeckoTerminal feed unavailable. No recent public snapshot is available. Try refreshing the interactive page later.</p></section>`;
      }
      const stale = entry.failed || now() - Date.parse(feed.updatedAt) > FRESH_MS;
      return `<section><h3>${label}</h3><p>Source: ${escape(feed.source)} · Updated <time datetime="${feed.updatedAt}">${feed.updatedAt}</time> · ${stale ? 'Stale snapshot — refresh unavailable or delayed; not live data.' : 'Recent public snapshot.'} Showing at most ${LIMIT} pools.</p>
        ${feed.pools.length ? `<ul>${feed.pools.map(pool => `<li><article><h4>${escape(pool.tokenSymbol)} — ${escape(pool.tokenName)}</h4>
          <p>DEX: ${escape(pool.dex)} · Pool address: ${escape(pool.address)} · Token address: ${escape(pool.tokenAddress)}</p>
          <dl><dt>Token price (USD)</dt><dd>${money(pool.priceUsd)}</dd><dt>24h volume (USD)</dt><dd>${money(pool.volume24h)}</dd><dt>Liquidity (USD)</dt><dd>${money(pool.liquidityUsd)}</dd><dt>24h price change</dt><dd>${pool.priceChange24h === null ? 'Unavailable' : `${pool.priceChange24h}%`}</dd><dt>24h buys / sells</dt><dd>${pool.buys24h ?? 'Unavailable'} / ${pool.sells24h ?? 'Unavailable'}</dd></dl>
          <a href="${escape(pool.url)}" rel="noopener noreferrer" referrerpolicy="no-referrer">Inspect ${escape(pool.tokenSymbol)} pool on GeckoTerminal</a></article></li>`).join('')}</ul>` : '<p>No pools in the public feed at this update.</p>'}</section>`;
    }).join('');
    return `<section aria-labelledby="public-pool-snapshot"><h2 id="public-pool-snapshot">Public NEAR pool snapshot</h2><p>Read-only research. Listings are not verified tokens, a safety assessment, investment advice or executable quotes. Trending means activity, not quality or safety. Verify token and pool addresses. Search and filters remain interactive; this bounded snapshot is not the full catalog.</p>${sections}</section>`;
  };
}

export const getResearchHtml = createResearchSnapshots();