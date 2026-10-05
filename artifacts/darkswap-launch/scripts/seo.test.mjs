import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { render, sitemap } from '../dist/server/entry-server.js';

const mint = '11111111111111111111111111111111';
const token = {
  mint, network: 'mainnet-beta', pool: null, name: 'Public <Token>', symbol: 'TEST',
  description: 'Public catalog description, not a private draft.', imageUrl: null,
  links: { website: 'https://example.com', x: null, telegram: null, discord: null, github: null },
  quote: { mint, symbol: 'SOL', name: 'Solana', verified: true }, launchpad: 'launchlab',
  mode: null, quoteOnlyFees: null, transferFeeBps: null,
  metrics: { priceUsd: 1, marketCapUsd: null, fdvUsd: null, volume24hUsd: 10, liquidityUsd: null,
    peakMarketCapUsd: null, priceChange24h: null, holders: null, transactions: null },
  status: 'new', graduationProgress: null, createdAt: null, graduatedAt: null, creatorWallet: null,
  darkPair: false, underReview: false, metadataSuppressed: false,
};
const source = { provider: 'StonkFun', stale: false, fetchedAt: '2026-10-01T00:00:00Z', warnings: [] };
const config = {
  defaultView: 'trending', darkPairAvailable: false, nearPairingEnabled: false,
  featuredMints: [], paused: false, banner: null, unavailableReason: 'Execution not live',
};
const originalFetch = globalThis.fetch;
let calls = [];
let tokens = [token];
let stale = false;
let detailStatus = 200;
let catalogResponses = null;
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  const path = new URL(url).pathname;
  if (path.endsWith('/launch/config')) return Response.json(config);
  if (path.endsWith('/stonkfun/tokens') && catalogResponses) {
    return Response.json(catalogResponses(Number(new URL(url).searchParams.get('page'))));
  }
  if (path.endsWith('/stonkfun/tokens')) return Response.json({
    tokens, source: { ...source, stale },
    pagination: { page: 1, pageSize: Number(new URL(url).searchParams.get('pageSize')), total: tokens.length, totalPages: 1, returned: tokens.length, maxAccessiblePage: 1 },
    coverage: { viewFilterScope: 'provider', warnings: [] },
  });
  if (path.endsWith(`/stonkfun/tokens/${mint}`)) return Response.json({ token, source }, { status: detailStatus });
  throw new Error(`Unexpected request: ${path}`);
};
test.after(() => { globalThis.fetch = originalFetch; });
test.beforeEach(() => {
  calls = []; tokens = [token]; stale = false; detailStatus = 200; catalogResponses = null;
});

function identity(head) {
  return JSON.parse(head.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'];
}

test('every static public route has crawler-visible content, unique metadata and aligned URLs', async () => {
  const titles = new Set();
  for (const route of ['/', '/explore', '/docs', '/terms', '/privacy', '/risk']) {
    const r = await render(route, 'https://api.example.test');
    assert.equal(r.status, 200, route);
    assert.equal((r.body.match(/<h1\b/g) ?? []).length, 1, route);
    const title = r.head.match(/<title>(.*?)<\/title>/)[1];
    assert.ok(!titles.has(title), title);
    titles.add(title);
    const url = `https://darkswap.app/launch/${route.slice(1)}`;
    assert.ok(r.head.includes(`rel="canonical" href="${url}"`), route);
    assert.ok(r.head.includes(`property="og:url" content="${url}"`), route);
    assert.match(r.head, /property="og:image" content="https:\/\/darkswap.app\/launch\/hero-monolith.jpg"/);
    assert.match(r.head, /name="twitter:image"/);
    assert.match(r.head, /application\/ld\+json/);
    assert.match(r.head, /property="og:site_name" content="DarkSwap Launch"/);
    assert.match(r.head, /property="og:locale" content="en_US"/);
    const [organization, site, page] = identity(r.head);
    assert.equal(organization['@type'], 'Organization');
    assert.equal(organization.name, 'DarkSwap');
    assert.equal(organization.url, 'https://darkswap.app/');
    assert.equal(organization.logo, 'https://darkswap.app/launch/icon.png');
    assert.equal(organization.email, 'support@darkswap.app');
    assert.equal(site['@type'], 'WebSite');
    assert.equal(site.name, 'DarkSwap Launch');
    assert.equal(site.url, 'https://darkswap.app/launch/');
    assert.equal(site.publisher['@id'], organization['@id']);
    assert.equal(page['@type'], 'WebPage');
    assert.equal(page.url, url);
    assert.equal(page.isPartOf['@id'], site['@id']);
    assert.equal(page.publisher['@id'], organization['@id']);
    assert.equal(page.inLanguage, 'en');
    assert.match(r.head, /index, follow/);
    assert.ok(!r.state.includes('csrfToken'), 'Only public query data may be embedded');
  }
  assert.ok(calls.every(c => !c.options.headers?.cookie && !/draft|admin|auth|creator/.test(c.url)));
});

test('homepage regions and filter buttons have valid semantics in rendered HTML', async () => {
  const home = await render('/', 'https://api.example.test');
  for (const id of ['trending', 'new', 'dark', 'near', 'dark-launching']) {
    assert.ok(home.body.includes(`aria-labelledby="${id}"`));
    assert.ok(home.body.includes(`<h2 id="${id}"`));
  }
  const explore = await render('/explore', 'https://api.example.test');
  assert.match(explore.body, /role="group" aria-label="Filter launches"/);
  assert.match(explore.body, /aria-pressed="true"/);
  assert.doesNotMatch(explore.body, /role="tab(?:list)?"/);
  assert.ok(explore.body.includes('Public &lt;Token&gt;'));
});

test('public token HTML includes identity, primary facts, headings and escaped metadata', async () => {
  const r = await render(`/token/${mint}`, 'https://api.example.test');
  assert.equal(r.status, 200);
  assert.match(r.body, /<h1[^>]*>Public &lt;Token&gt;<\/h1>/);
  for (const label of ['Pair', 'Market', 'Description (provider text)', 'Launch facts', 'Links (unverified)']) {
    assert.ok(r.body.includes(`>${label}</h2>`), label);
  }
  assert.ok(r.body.includes(token.description));
  assert.ok(r.head.includes('Public &lt;Token&gt; ($TEST)'));
  assert.ok(r.head.includes(`https://darkswap.app/launch/token/${mint}`));
  assert.equal(identity(r.head)[2].name, 'Public <Token> ($TEST) | DarkSwap Launch');
  assert.equal(identity(r.head)[2].url, `https://darkswap.app/launch/token/${mint}`);
  assert.doesNotMatch(r.head, /<Token>/);
});

test('private, unknown, filters and unavailable tokens do not become indexable', async () => {
  for (const route of ['/create', '/creator', '/admin', '/unknown', '/explore?q=example']) {
    const r = await render(route, 'https://api.example.test');
    assert.match(r.head, /noindex, nofollow/);
    assert.equal(r.status, route === '/unknown' ? 404 : 200);
  }
  assert.equal((await render('/token/invalid', 'https://api.example.test')).status, 404);
  detailStatus = 404;
  const missing = await render(`/token/${mint}`, 'https://api.example.test');
  assert.equal(missing.status, 404);
  assert.match(missing.head, /noindex, nofollow/);
  assert.match(missing.body, /Not indexed yet/);
  detailStatus = 200;
});

test('sitemap uses only substantive fresh public catalog records plus classified routes', async () => {
  tokens = [token, token, { ...token, mint: '22222222222222222222222222222222', underReview: true },
    { ...token, mint: '33333333333333333333333333333333', metadataSuppressed: true },
    { ...token, mint: '44444444444444444444444444444444', name: '' }];
  const xml = await sitemap('https://api.example.test');
  assert.match(xml, /^<\?xml version="1.0"/);
  assert.match(xml, /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  assert.equal((xml.match(/<loc>/g) ?? []).length, 7);
  assert.match(xml, new RegExp(`/token/${mint}`));
  assert.doesNotMatch(xml, /222222|333333|444444|create|creator|admin|api\/|launch.darkswap.app/);
  assert.ok([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].every(m => !m[1].includes('?')));
  stale = true;
  await assert.rejects(sitemap('https://api.example.test'), /Fresh public catalog/);
  stale = false;
  tokens = [token];
});

test('sitemap index discovers later catalog pages with one bounded request per child', async () => {
  const laterMint = '55555555555555555555555555555555';
  catalogResponses = page => ({
    tokens: page === 1 ? [token] : [{ ...token, mint: laterMint }, { ...token, mint: laterMint },
      { ...token, mint: '66666666666666666666666666666666', network: 'devnet' }],
    source,
    pagination: { page, pageSize: 100, total: 103, totalPages: 2, returned: page === 1 ? 1 : 3, maxAccessiblePage: 2 },
  });
  const index = await sitemap('https://api.example.test');
  assert.match(index, /<sitemapindex xmlns=/);
  assert.equal((index.match(/<sitemap>/g) ?? []).length, 2);
  assert.match(index, /https:\/\/darkswap.app\/launch\/sitemap-tokens-2.xml/);
  assert.equal(calls.length, 1);
  const first = await sitemap('https://api.example.test', 1);
  const second = await sitemap('https://api.example.test', 2);
  assert.equal((first.match(/<loc>/g) ?? []).length, 7);
  assert.equal((second.match(/<loc>/g) ?? []).length, 1);
  assert.match(second, new RegExp(`/token/${laterMint}`));
  assert.doesNotMatch(second, /666666|explore|create|admin/);
  assert.deepEqual(calls.map(c => new URL(c.url).searchParams.get('page')), ['1', '1', '2']);
  assert.ok(calls.every(c => new URL(c.url).searchParams.get('view') === 'new' &&
    new URL(c.url).searchParams.get('pageSize') === '100'));
});

test('sitemap validates facade bounds and fails closed on stale, failed or malformed child pages', async () => {
  const response = { tokens: [token], source,
    pagination: { page: 1, pageSize: 100, total: 10001, totalPages: 101, returned: 1, maxAccessiblePage: 100 } };
  catalogResponses = page => ({ ...response, pagination: { ...response.pagination, page } });
  const index = await sitemap('https://api.example.test');
  assert.equal((index.match(/<sitemap>/g) ?? []).length, 100);
  assert.match(index, /sitemap-tokens-100.xml/);
  assert.doesNotMatch(index, /sitemap-tokens-101.xml/);
  await sitemap('https://api.example.test', 100);
  const count = calls.length;
  for (const page of [0, -1, 101, 1.5, NaN]) {
    await assert.rejects(sitemap('https://api.example.test', page), /Invalid sitemap catalog page/);
  }
  assert.equal(calls.length, count, 'Invalid pages must not reach the facade');
  for (const pagination of [
    null, { ...response.pagination, totalPages: -1 }, { ...response.pagination, totalPages: '101' },
    { ...response.pagination, maxAccessiblePage: 101 }, { ...response.pagination, page: 2 },
    { ...response.pagination, pageSize: 24 }, { ...response.pagination, returned: 2 },
  ]) {
    catalogResponses = () => ({ ...response, pagination });
    await assert.rejects(sitemap('https://api.example.test'), /Valid public catalog pagination/);
  }
  catalogResponses = () => ({ ...response, source: { ...source, stale: true } });
  await assert.rejects(sitemap('https://api.example.test', 2), /Fresh public catalog/);
  catalogResponses = () => { throw new Error('Facade unavailable'); };
  await assert.rejects(sitemap('https://api.example.test', 2), /Facade unavailable/);
  catalogResponses = () => ({ ...response, pagination: { ...response.pagination, page: 2, totalPages: 1, maxAccessiblePage: 1 } });
  await assert.rejects(sitemap('https://api.example.test', 2), /Valid public catalog pagination/);
  catalogResponses = () => ({ ...response, tokens: [], pagination: { ...response.pagination, totalPages: 0, maxAccessiblePage: 1, total: 0, returned: 0 } });
  assert.equal(((await sitemap('https://api.example.test')).match(/<loc>/g) ?? []).length, 6);
});

test('font stylesheet is asynchronous with swap and a no-JavaScript fallback', async () => {
  const shell = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const asyncLink = shell.match(/<link rel="stylesheet" media="print"[^>]*>/)[0];
  assert.match(asyncLink, /onload="this.onload=null;this.media='all'"/);
  assert.match(asyncLink, /family=Inter/);
  assert.match(asyncLink, /family=JetBrains\+Mono/);
  assert.match(asyncLink, /display=swap/);
  assert.match(shell, /<noscript><link rel="stylesheet"[^>]*display=swap"><\/noscript>/);
  assert.doesNotMatch(shell.replace(/<noscript>.*?<\/noscript>/s, ''), /<link rel="stylesheet" href="https:\/\/fonts.googleapis.com/);
});

test('publishing routes stay classified and root-origin robots advertises Launch sitemap', async () => {
  const robots = await readFile(new URL('../../solana-privacy-swap/public/robots.txt', import.meta.url), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/darkswap.app\/launch\/sitemap.xml/);
  const shell = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(shell, /maximum-scale|user-scalable/);
  await import('./check-routes.mjs');
});