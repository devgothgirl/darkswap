import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderPageHtml, aliases } from './seo-html.mjs';

const template = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const publicRoutes = ['/', '/swap', '/near-swap', '/docs', '/tokenomics', '/help', '/near-trends', '/near-discovery', '/rewards'];
const previews = ['/founder', '/previews', '/terminal-preview', '/screener-beta', '/split-mixer-preview', '/privacy-bundle-preview', '/tokenomics/leaderboard'];

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

test('aliases point only to canonical routes', () => {
  for (const destination of Object.values(aliases)) assert.ok([...publicRoutes, ...previews].includes(destination));
});

test('launch navigation separates public tokenomics from founder tools', () => {
  const html = renderPageHtml(template, '/tokenomics');
  const nav = html.match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav);
  assert.match(nav, /href="\/tokenomics"/);
  assert.doesNotMatch(nav, /terminal-preview|founder|near-trends|near-discovery/);
  assert.match(html, /50% into DARK buyback \+ burn/);
  assert.match(html, /formula and rates are undecided/);
  assert.match(html, /statistics are unavailable rather than assumed to be zero/);
});

test('landing navigation and FAQ match the launch holder model', async () => {
  const launch = await readFile(new URL('./src/pages/launch.tsx', import.meta.url), 'utf8');
  const nav = launch.match(/<nav id="launch-navigation"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav, 'landing must retain its accessible navigation');
  assert.match(nav, /href="\/swap"/);
  assert.match(nav, /href="\/near-swap"/);
  assert.match(nav, /href="\/tokenomics"/);
  assert.doesNotMatch(nav, /terminal-preview|founder|near-trends|near-discovery|Coming soon/);
  const footer = launch.match(/<footer className="launch-footer"[\s\S]*?<\/footer>/)?.[0];
  assert.match(footer || '', /href="\/founder"/);
  assert.match(launch, /50% for \$DARK buyback and burn/);
  assert.match(launch, /50% converted to ZEC for loyalty airdrops/);
  assert.doesNotMatch(launch, /qualifying week|targeting 20%|20% share of/);
});

test('tokenomics pages expose distinct prelaunch metadata and nested navigation', () => {
  const parent = renderPageHtml(template, '/tokenomics');
  const child = renderPageHtml(template, '/tokenomics/leaderboard/');
  assert.match(parent, /<title>\$DARK tokenomics &amp; holder streaks \| DarkSwap<\/title>/);
  assert.match(parent, /href="\/tokenomics\/leaderboard"/);
  assert.match(child, /<title>\$DARK Holdings Leaderboard \| DarkSwap<\/title>/);
  assert.match(child, /property="og:title" content="\$DARK Holdings Leaderboard \| DarkSwap"/);
  assert.match(child, /highest first/);
  assert.match(child, /mint is unconfirmed/);
  assert.match(child, /href="\/tokenomics"/);
  assert.match(child, /noindex, nofollow/);
});