import { renderToString } from 'react-dom/server';
import { QueryClient, dehydrate, type QueryKey } from '@tanstack/react-query';
import {
  getGetLaunchConfigQueryKey, getGetStonkfunTokensQueryKey, getGetStonkfunTokenQueryKey,
  getGetLaunchAuthSessionQueryKey,
  type GetStonkfunTokensParams, type GetStonkfunTokensView,
  type StonkfunTokensResponse, type StonkfunTokenResponse, type LaunchConfig,
} from '@workspace/api-client-react';
import App from './App';
import { MetaContext, pageUrl, socialImage, type PageMeta } from './lib/seo';
import { BASE_PATH, SOLANA_ADDRESS } from './lib/api';
import config from './seo-config.json';

// Only the public facade is used. No sessions, drafts, logos or admin data are read.
async function publicData<T>(origin: string, path: string, params?: object): Promise<T> {
  const url = new URL(`${BASE_PATH}/api/${path}`, origin);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, String(value));
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: 'error' });
  if (!response.ok) throw Object.assign(new Error('Public discovery unavailable'), { status: response.status });
  return response.json();
}

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const eligible = (t: StonkfunTokensResponse['tokens'][number]) =>
  SOLANA_ADDRESS.test(t.mint) && t.network === 'mainnet-beta' && !t.underReview && !t.metadataSuppressed &&
  !!t.name?.trim() && !!t.symbol?.trim() &&
  !!(t.description?.trim() || t.quote || t.launchpad || Object.values(t.metrics).some(v => v != null));

// These match the public facade's page/pageSize limits. Each child sitemap
// reads one page, avoiding an inventory-sized fetch or provider rate-limit burst.
const catalogPageLimit = 100;
const catalogPageSize = 100;
export async function sitemap(apiOrigin: string, catalogPage?: number) {
  const page = catalogPage ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > catalogPageLimit) throw new Error('Invalid sitemap catalog page');
  const data = await publicData<StonkfunTokensResponse>(apiOrigin, 'stonkfun/tokens', { view: 'new', page, pageSize: catalogPageSize });
  if (!data.source || data.source.stale !== false || !Array.isArray(data.tokens)) throw new Error('Fresh public catalog required for sitemap');
  const pagination = data.pagination;
  if (!pagination || pagination.page !== page || pagination.pageSize !== catalogPageSize ||
      !Number.isSafeInteger(pagination.totalPages) || pagination.totalPages < 0 ||
      pagination.maxAccessiblePage !== Math.max(1, Math.min(catalogPageLimit, pagination.totalPages)) ||
      data.tokens.length > catalogPageSize || pagination.returned !== data.tokens.length ||
      page > pagination.maxAccessiblePage) throw new Error('Valid public catalog pagination required for sitemap');
  if (catalogPage === undefined && pagination.maxAccessiblePage > 1) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Array.from(
      { length: pagination.maxAccessiblePage },
      (_, index) => `  <sitemap><loc>${escape(pageUrl(`/sitemap-tokens-${index + 1}.xml`))}</loc></sitemap>`,
    ).join('\n')}\n</sitemapindex>\n`;
  }
  const routes = [...(page === 1 ? config.indexable : []), ...new Set(data.tokens.filter(eligible).map(t => `/token/${t.mint}`))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(route => `  <url><loc>${escape(pageUrl(route))}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export async function render(path: string, apiOrigin: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: 60_000 } } });
  const location = new URL(path, 'http://render.invalid');
  const route = location.pathname.replace(/\/$/, '') || '/';
  const meta: { current?: PageMeta } = {};
  let status = 200;
  let forceNoindex = !config.indexable.includes(route) && !route.startsWith('/token/');
  if (location.search) forceNoindex = true;
  // An anonymous initial state prevents any authenticated state from reaching HTML.
  client.setQueryData(getGetLaunchAuthSessionQueryKey(), { wallet: null, csrfToken: null, expiresAt: null, isAdmin: false });
  async function load<T>(key: QueryKey, path: string, params?: object) {
    try {
      return await client.fetchQuery<T>({ queryKey: key, queryFn: () => publicData<T>(apiOrigin, path, params) });
    } catch {
      status = 503;
      forceNoindex = true;
      return undefined;
    }
  }
  const dynamic = route.startsWith('/token/');
  if (route === '/' || route === '/explore' || dynamic) {
    const cfg = await load<LaunchConfig>(getGetLaunchConfigQueryKey(), 'launch/config');
    const list = (params: GetStonkfunTokensParams) => load<StonkfunTokensResponse>(getGetStonkfunTokensQueryKey(params), 'stonkfun/tokens', params);
    if (route === '/') {
      await Promise.all([list({ view: 'trending', pageSize: 12 }), list({ view: 'new', pageSize: 12 }),
        ...(cfg?.darkPairAvailable ? [list({ view: 'dark', pageSize: 12 }), list({ view: 'dark', pageSize: 24 })] : []),
        ...(cfg?.nearPairingEnabled ? [list({ view: 'near', pageSize: 12 })] : [])]);
      if (cfg?.darkPairAvailable) {
        // Match the homepage's bounded curated queries, without accessing admin APIs.
        for (const mint of cfg.featuredMints.slice(0, 24)) {
          if (SOLANA_ADDRESS.test(mint)) await load<StonkfunTokenResponse>(getGetStonkfunTokenQueryKey(mint), `stonkfun/tokens/${mint}`);
        }
      }
    } else if (route === '/explore') {
      const sp = location.searchParams;
      const views = ['trending', 'new', 'dark', 'near', 'graduating', 'graduated'];
      const view = (views.includes(sp.get('view') ?? '') ? sp.get('view') : cfg?.defaultView ?? 'trending') as GetStonkfunTokensView;
      const pair = sp.get('pair') ?? '';
      await list({
        view, page: Math.min(100, Math.max(1, Math.floor(Number(sp.get('page')) || 1))), pageSize: 24,
        ...(sp.get('q') ? { q: sp.get('q')! } : {}),
        ...(['newest', 'volume'].includes(sp.get('sort') ?? '') ? { sort: sp.get('sort') as 'newest' | 'volume' } : {}),
        ...(pair && SOLANA_ADDRESS.test(pair) && view !== 'dark' ? { quoteMint: pair } : {}),
      });
    } else {
      const mint = route.slice('/token/'.length);
      if (!SOLANA_ADDRESS.test(mint)) { status = 404; forceNoindex = true; }
      else {
        try {
          const data = await publicData<StonkfunTokenResponse>(apiOrigin, `stonkfun/tokens/${mint}`);
          client.setQueryData(getGetStonkfunTokenQueryKey(mint), data);
          forceNoindex ||= !eligible(data.token) || data.source.stale;
        } catch (error) {
          const code = (error as { status?: number }).status;
          status = code === 404 ? 404 : 503;
          forceNoindex = true;
          // Keep the token error visible in the initial React HTML.
          await client.fetchQuery({ queryKey: getGetStonkfunTokenQueryKey(mint), queryFn: () => Promise.reject({ status, data: { code: status === 404 ? 'NOT_INDEXED' : 'UNAVAILABLE', error: 'Public token data is unavailable.' } }) }).catch(() => {});
        }
      }
    }
  } else if (!config.indexable.includes(route) && !config.private.includes(route)) status = 404;
  const body = renderToString(<MetaContext.Provider value={meta}><App client={client} ssrPath={`${BASE_PATH}${path}`} /></MetaContext.Provider>);
  const page = meta.current ?? { title: 'Not found', description: 'This page is not part of DarkSwap Launch.', noindex: true };
  const title = page.title ? `${page.title} | DarkSwap Launch` : 'DarkSwap Launch — launch in the dark.';
  const url = pageUrl(route);
  const noindex = forceNoindex || page.noindex;
  const head = `<title>${escape(title)}</title>
<meta name="description" content="${escape(page.description)}" />
<meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow'}" />
<link rel="canonical" href="${escape(url)}" />
<meta property="og:title" content="${escape(title)}" />
<meta property="og:description" content="${escape(page.description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="DarkSwap Launch" />
<meta property="og:locale" content="en_US" />
<meta property="og:url" content="${escape(url)}" />
<meta property="og:image" content="${escape(socialImage)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escape(title)}" />
<meta name="twitter:description" content="${escape(page.description)}" />
<meta name="twitter:url" content="${escape(url)}" />
<meta name="twitter:image" content="${escape(socialImage)}" />
<script type="application/ld+json">${json({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${config.origin}/#organization`, name: 'DarkSwap', url: `${config.origin}/`,
      logo: pageUrl('/icon.png'), email: 'support@darkswap.app' },
    { '@type': 'WebSite', '@id': `${pageUrl('/')}#website`, name: 'DarkSwap Launch', url: pageUrl('/'),
      inLanguage: 'en', publisher: { '@id': `${config.origin}/#organization` } },
    { '@type': 'WebPage', '@id': `${url}#webpage`, name: title, description: page.description, url,
      inLanguage: 'en', isPartOf: { '@id': `${pageUrl('/')}#website` },
      publisher: { '@id': `${config.origin}/#organization` } },
  ],
})}</script>`;
  const state = `<script type="application/json" id="launch-public-state">${json(dehydrate(client, {
    shouldDehydrateQuery: query => query.state.status === 'success' &&
      (query.queryKey[0] === '/api/launch/config' || String(query.queryKey[0]).startsWith('/api/stonkfun/')),
  }))}</script>`;
  client.clear();
  return { body, head, state, status };
}