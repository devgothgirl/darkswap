import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchSnapshots } from './near-research-snapshot.mjs';

const start = Date.parse('2026-10-05T12:00:00Z');
function fixture(view, time = start) {
  return {
    view, source: 'GeckoTerminal', updatedAt: new Date(time).toISOString(),
    account: 'private-account-value',
    pools: Array.from({ length: 20 }, (_, i) => ({
      id: `pool-${i}`, address: `pool.near-${i}`, tokenAddress: 'token.near',
      tokenSymbol: i ? `TOKEN${i}` : '<script>alert("x")</script>',
      tokenName: 'Public token', dex: 'Public DEX', priceUsd: 1.25,
      volume24h: 4000, liquidityUsd: null, priceChange24h: -2.5,
      buys24h: 3, sells24h: 2, url: 'javascript:alert(1)',
      order: 'private-order-value', createdAt: null,
    })),
  };
}

test('bounded public listings have identities, available metrics, timestamps, secure sources and warnings', async () => {
  let calls = 0;
  const htmlFor = createResearchSnapshots({ now: () => start, fetchFeed: async view => { calls++; return fixture(view); } });
  assert.equal(await htmlFor('/docs'), '');
  assert.equal(calls, 0, 'nonresearch pages must not depend on market data');
  const html = await htmlFor('/near-trends');
  assert.equal(calls, 1);
  assert.equal((html.match(/<article>/g) ?? []).length, 12);
  assert.match(html, /TOKEN11/);
  assert.doesNotMatch(html, /TOKEN12|<script>|javascript:|private-account-value|private-order-value/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Pool address: pool.near-0/);
  assert.match(html, /Token address: token.near/);
  assert.match(html, /Token price \(USD\).*?\$1.25/s);
  assert.match(html, /24h volume \(USD\).*?\$4,000/s);
  assert.match(html, /Liquidity \(USD\)<\/dt><dd>Unavailable/);
  assert.match(html, /24h price change<\/dt><dd>-2.5%/);
  assert.match(html, /2026-10-05T12:00:00.000Z/);
  assert.match(html, /href="https:\/\/www.geckoterminal.com\/near\/pools\/pool.near-0"/);
  assert.match(html, /not verified tokens.*executable quotes/);
  assert.match(html, /Trending means activity, not quality or safety/);
  const discovery = await htmlFor('/near-discovery/');
  assert.equal(calls, 2, 'both pages share the trending cache');
  assert.match(discovery, /Trending pools/);
  assert.match(discovery, /New pools/);
  assert.equal((discovery.match(/<article>/g) ?? []).length, 24);
});

test('refresh coalescing, failure caching, stale retention and expiry are transparent', async () => {
  let time = start;
  let calls = 0;
  let fails = false;
  const htmlFor = createResearchSnapshots({
    now: () => time,
    fetchFeed: async view => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); if (fails) throw new Error('unavailable'); return fixture(view, time); },
  });
  await Promise.all(Array.from({ length: 25 }, () => htmlFor('/near-trends')));
  assert.equal(calls, 1);
  fails = true;
  time += 91_000;
  assert.match(await htmlFor('/near-trends'), /Stale snapshot/);
  assert.equal(calls, 2);
  await htmlFor('/near-trends');
  assert.equal(calls, 2, 'failure must be cached');
  time = start + 16 * 60_000;
  const expired = await htmlFor('/near-trends');
  assert.match(expired, /feed unavailable/);
  assert.doesNotMatch(expired, /TOKEN1|<article>/);
  fails = false;
  time += 31_000;
  assert.match(await htmlFor('/near-trends'), /Recent public snapshot/);
});

test('partial, empty and malformed feeds never fabricate listings', async () => {
  const partial = createResearchSnapshots({ now: () => start, fetchFeed: async view => {
    if (view === 'new') throw new Error('Unavailable');
    return { ...fixture(view), pools: [] };
  } });
  const html = await partial('/near-discovery');
  assert.match(html, /No pools in the public feed/);
  assert.match(html, /New pools<\/h3><p>GeckoTerminal feed unavailable/);
  assert.doesNotMatch(html, /<article>/);
  for (const bad of [
    { ...fixture('trending'), updatedAt: 'invalid' },
    { ...fixture('trending'), pools: [{}] },
    fixture('trending', start - 16 * 60_000),
    fixture('trending', start + 90_000),
    { ...fixture('trending'), source: '<script>' },
  ]) {
    const invalid = createResearchSnapshots({ now: () => start, fetchFeed: async () => bad });
    assert.match(await invalid('/near-trends'), /feed unavailable/);
  }
});