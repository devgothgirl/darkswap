import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderPageHtml, aliases, externalRedirects, isKnownRoute } from './seo-html.mjs';

const template = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const publicRoutes = ['/', '/swap', '/near-swap', '/docs', '/docs/confidential-routing', '/docs/whitepaper', '/pool', '/pool/what-stays-public', '/help', '/near-trends', '/near-discovery', '/rewards'];
const previews = ['/founder', '/previews', '/terminal-preview', '/screener-beta', '/split-mixer-preview', '/privacy-bundle-preview'];

test('each public route has unique crawlable content and an absolute canonical', () => {
  const titles = new Set();
  for (const path of publicRoutes) {
    const html = renderPageHtml(template, path);
    const url = `https://darkswap.app${path}`;
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    assert.ok(title, path);
    assert.ok(!titles.has(title), `duplicate title for ${path}`);
    titles.add(title);
    assert.match(html, /<h1>[^<]+<\/h1>/);
    assert.match(html, /<nav aria-label="Main navigation">/);
    assert.match(html, /<meta name="robots" content="index, follow"/);
    assert.ok(html.includes(`<link rel="canonical" href="${url}"`), path);
    assert.ok(html.includes(`<meta property="og:url" content="${url}"`), path);
    assert.match(html, /<meta property="og:site_name" content="DarkSwap"/);
    assert.match(html, /<meta name="twitter:description"/);
    assert.ok(!html.includes('<!--SEO_'), path);
  }
});

test('private and unknown URLs have no canonical or indexable order data', () => {
  for (const path of ['/order/sensitive-id', '/near-order', '/not-found', '/public-swap', ...previews]) {
    const html = renderPageHtml(template, path);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(html, /rel="canonical"|property="og:url"|sensitive-id/);
  }
});

test('confidential routing article is a classified public route with factual fallback content', async () => {
  const path = '/docs/confidential-routing';
  const routes = JSON.parse(await readFile(new URL('./src/seo-routes.json', import.meta.url), 'utf8'));
  const sitemap = await readFile(new URL('./public/sitemap.xml', import.meta.url), 'utf8');
  const app = await readFile(new URL('./src/App.tsx', import.meta.url), 'utf8');
  const html = renderPageHtml(template, `${path}/`);
  assert.ok(routes.indexable.includes(path));
  assert.ok(!routes.nonIndexable.includes(path));
  assert.ok(isKnownRoute(path));
  assert.ok(isKnownRoute(`${path}/`));
  assert.match(app, /<Route path="\/docs\/confidential-routing" component=\{ConfidentialRoutingDocs\}/);
  assert.ok(sitemap.includes(`<loc>https://darkswap.app${path}</loc>`));
  assert.match(html, /<title>Confidential routing and ZK shielding \| DarkSwap Docs<\/title>/);
  assert.match(html, /<h1>Confidential routing and ZK shielding<\/h1>/);
  assert.match(html, /private shard with independent, permissioned validators/);
  assert.match(html, /rather than client-side proof generation/);
  assert.match(html, /This is not a ZK shielded pool/);
  assert.match(html, /Zcash shielded pools use zero-knowledge proofs/);
  assert.match(html, /basic confidentiality for both its dry preview and deposit order/);
  assert.match(html, /transparent t1\/t3 only/);
  assert.match(html, /Not connecting a wallet is not a privacy guarantee/);
  assert.match(html, /October 1, 2026/);
  assert.match(html, /href="\/near-swap">Review Privacy swap/);
  assert.match(html, /href="\/docs#privacy">Privacy limitations/);
  assert.doesNotMatch(html, /export default|import\.meta|function ConfidentialRoutingDocs|private-query-value/);
  assert.match(renderPageHtml(template, '/docs'), /href="\/docs\/confidential-routing"/);
});

test('homepage and Privacy swap metadata describe reviewed routing, not wallet privacy or shielding', () => {
  const launch = renderPageHtml(template, '/');
  const swap = renderPageHtml(template, '/near-swap');
  assert.match(launch, /<h1>Swap through Privacy Routers\.<\/h1>/);
  assert.match(launch, /Review a supported Solana-origin route, check fees and destination details/);
  assert.match(swap, /basic confidential processing/);
  assert.match(swap, /Confidential routing is not ZK shielding/);
  // The NEAR Intents positioning is intentional public copy since the partnership pivot.
  assert.match(swap, /NEAR Intents/);
  assert.doesNotMatch(swap, /wallet-free|Zashi/);
});

test('aliases point only to canonical routes', () => {
  for (const destination of Object.values(aliases)) assert.ok([...publicRoutes, ...previews].includes(destination));
});

test('tokenomics is paused: navigation points to the rewards site', async () => {
  const html = renderPageHtml(template, '/');
  const nav = html.match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav);
  assert.match(nav, /href="https:\/\/rewards\.darkswap\.app"/);
  assert.doesNotMatch(nav, /\/tokenomics|terminal-preview|founder|near-trends|near-discovery/);
  for (const path of ['/tokenomics', '/tokenomics/leaderboard']) {
    assert.equal(externalRedirects[path], 'https://rewards.darkswap.app');
    assert.ok(isKnownRoute(`${path}/`));
  }
  const routes = JSON.parse(await readFile(new URL('./src/seo-routes.json', import.meta.url), 'utf8'));
  const sitemap = await readFile(new URL('./public/sitemap.xml', import.meta.url), 'utf8');
  assert.ok(![...routes.indexable, ...routes.nonIndexable].some(path => path.startsWith('/tokenomics')));
  assert.doesNotMatch(sitemap, /tokenomics/);
  const swapUi = await readFile(new URL('./src/components/swap-ui.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(swapUi, /href="\/tokenomics"/);
  assert.match(swapUi, /href="https:\/\/rewards\.darkswap\.app"/);
});

test('landing stays brief, links no docs and keeps the rewards boundaries', async () => {
  const launch = await readFile(new URL('./src/pages/launch.tsx', import.meta.url), 'utf8');
  const nav = launch.match(/<nav id="launch-navigation"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav, 'landing must retain its accessible navigation');
  assert.match(nav, /href="\/swap"/);
  assert.match(nav, /href="\/near-swap"/);
  assert.match(nav, /href="https:\/\/rewards\.darkswap\.app"/);
  assert.doesNotMatch(nav, /\/tokenomics"|terminal-preview|founder|near-trends|near-discovery|Coming soon/);
  const footer = launch.match(/<footer className="[^"]*launch-footer[^"]*"[\s\S]*?<\/footer>/)?.[0];
  assert.match(footer || '', /href="\/docs"/);
  // Navigation stays free of docs links; the footer carries the only one.
  assert.doesNotMatch(nav, /\/docs/);
  assert.match(launch, /RiskDisclaimer showDocsLink=\{false\}/);
  assert.match(launch, /compounded in the creator wallet/);
  // The NEAR Intents positioning must survive future copy edits.
  assert.match(launch, /Built on NEAR Intents/);
  assert.match(launch, /Dark Pool/);
  assert.match(launch, /<RewardsEstimate/);
  assert.doesNotMatch(launch, /704\.7|3,140,000|2,000,000 DARK|226\.25/);
  assert.match(launch, /https:\/\/rewards\.darkswap\.app/);
  assert.match(launch, /creator fees received in wNEAR/);
  assert.doesNotMatch(launch, /No automatic snapshot system or payouts are active|PAYOUTS NOT LIVE|12-hour snapshots|qualifying week|targeting 20%|20% share of|3% holder-rewards|\$20-or-more|token and payouts are not live/);
});

test('official DARK identity is exact and does not activate rewards or holder data', async () => {
  const identity = JSON.parse(await readFile(new URL('./src/token-identity.json', import.meta.url), 'utf8'));
  const address = '7KEPApdbBMByrmqihz3bht2uMhFQcatjfSFQCKq66kH3';
  assert.equal(identity.address, address);
  assert.equal(identity.chain, 'Solana');
  assert.equal(identity.explorerUrl, `https://solscan.io/token/${address}`);
  assert.equal(identity.listingUrl, `https://www.stonkfun.xyz/token/${address}`);
});
