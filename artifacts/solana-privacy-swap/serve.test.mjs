import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createInterface } from 'node:readline';
import { aliases, externalRedirects, hostRedirects, isKnownRoute, siteOrigin } from './seo-html.mjs';

// Run after the artifact build: test the actual production handler and output.
async function startProductionServer(t) {
  const child = spawn(process.execPath, ['serve.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  let errors = '';
  child.stderr.on('data', bytes => { errors += bytes; });
  const lines = createInterface({ input: child.stdout });
  t.after(() => lines.close());
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${errors}`)), 15_000);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
    lines.on('line', line => {
      const match = line.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  const get = (path, options) => fetch(`http://127.0.0.1:${port}${path}`, options);
  get.port = Number(port);
  return get;
}

// fetch() cannot override Host, so domain-specific behaviour uses a raw request.
function requestAs(port, path, headers, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, res => { res.resume(); resolve(res); });
    req.on('error', reject).end();
  });
}

test('production HTML exposes public guides and uses correct HTTP status codes', async t => {
  const get = await startProductionServer(t);
  const routes = JSON.parse(await readFile(new URL('./src/seo-routes.json', import.meta.url), 'utf8'));
  for (const path of [...routes.indexable, ...routes.nonIndexable, '/founder', '/previews', '/terminal-preview',
    '/screener-beta', '/split-mixer-preview', '/privacy-bundle-preview',
    '/near-order', '/explore', '/privacy-terminal', '/public-swap', '/order/test-id', '/order/test.id']) {
    assert.ok(isKnownRoute(path), path);
    assert.equal((await get(path)).status, 200, path);
  }
  for (const [path, destination] of Object.entries(aliases)) {
    const response = await get(`${path}/`, { redirect: 'manual' });
    assert.equal(response.status, 308, path);
    assert.equal(response.headers.get('location'), destination);
  }
  for (const [path, destination] of Object.entries(externalRedirects)) {
    const response = await get(`${path}/`, { redirect: 'manual' });
    assert.equal(response.status, 302, path);
    assert.equal(response.headers.get('location'), destination);
  }
  for (const path of ['/missing-page', '/docs/typo', '/pool/unknown', '/pool/shield/extra', '/order', '/order/id/extra', '/constructor', '/__proto__']) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    const html = await response.text();
    assert.match(html, /Page unavailable/);
    assert.match(html, /noindex, nofollow/);
    assert.doesNotMatch(html, /rel="canonical"/);
    const head = await get(path, { method: 'HEAD' });
    assert.equal(head.status, 404);
    assert.equal(await head.text(), '');
  }
  const docs = await (await get('/docs/?utm_source=test')).text();
  assert.equal((docs.match(/<h1[ >]/g) || []).length, 1);
  for (const id of ['availability', 'manual-flow', 'route-availability', 'tracking',
    'safety', 'privacy', 'confidential-routing', 'near-zec', 'fees-rewards', 'providers', 'roadmap']) {
    assert.ok(docs.includes(`id="${id}"`), `missing documentation section: ${id}`);
  }
  assert.match(docs, /partner provider/i);
  assert.doesNotMatch(docs, /Houdini|Nullmask|does not operate its own pools/);
  assert.match(docs, /NEAR Intents 1Click API/);
  assert.match(docs, /Solana deposits remain visible on-chain/);
  assert.match(docs, /href="\/docs\/confidential-routing"/);
  const help = await (await get('/help')).text();
  // Verify every reviewed question and answer from the same generated source.
  const guides = JSON.parse(await readFile(new URL('./dist/public-guides.json', import.meta.url), 'utf8'));
  const poolPaths = JSON.parse(await readFile(new URL('./src/pool/routes.json', import.meta.url), 'utf8'));
  for (const path of poolPaths) {
    const html = await (await get(`${path}/?orderId=private-query-value&recipient=private-recipient-value`)).text();
    assert.ok(guides[path], `missing public guide for ${path}`);
    assert.ok(html.includes(guides[path]), path);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, path);
    assert.doesNotMatch(html, /Page unavailable|private-query-value|private-recipient-value/);
    if (path.startsWith('/pool')) {
      assert.match(html, /<title>[^<]*local-development preview/);
      assert.match(html, /not deployed on any public network or audited/);
      assert.match(html, /Development proving keys could forge proofs/);
      assert.match(html, /Do not deposit real funds/);
      assert.doesNotMatch(html, /testnet mode/i);
      assert.match(html, /Local-development preview\. Development proving keys, which could be used to forge proofs\. Do not deposit real funds\. Not deployed on any public network\. Not audited\./);
      if (path !== '/pool/what-stays-public') assert.match(html, /No network is connected yet\./);
      // Rendered content only: the shared head script names a receipt storage key.
      assert.doesNotMatch(html.slice(html.indexOf('<body')), /<form|input-pool|shielded-balance|recent-order/);
    }
    assert.match(html, routes.indexable.includes(path) ? /index, follow/ : /noindex, nofollow/);
  }
  const darkPool = await (await get('/docs/dark-pool')).text();
  assert.match(darkPool, /This is the intended design, not a live product/);
  assert.match(darkPool, /Scheduled. Not available to use. Target: late October 2026, subject to NEAR enabling access/);
  assert.match(darkPool, /Status: scheduled|scheduled/);
  assert.doesNotMatch(docs, /id="further-reading"|href="#further-reading"|did not verify net receipts/);
  const llms = await get('/llms.txt');
  assert.match(llms.headers.get('content-type') || '', /text\/plain/);
  const llmsText = await llms.text();
  assert.match(llmsText, /## Built, not deployed/);
  assert.match(llmsText, /Whitepaper v0\.4/);
  assert.match(llmsText, /and a second partner route/);
  assert.match(await (await get('/robots.txt')).text(), /https:\/\/darkswap\.app\/llms\.txt/);
  const explanation = await (await get('/pool/what-stays-public')).text();
  for (const phrase of ['Public, on chain', 'Not revealed by the pool', 'What weakens it', 'What DarkSwap sees', 'This local-development pool is small']) assert.ok(explanation.includes(phrase), phrase);
  for (const path of ['/near-trends', '/near-discovery']) {
    const html = await (await get(path)).text();
    assert.match(html, /Public NEAR pool snapshot/);
    assert.match(html, /not verified tokens.*executable quotes/);
    assert.match(html, /Source: GeckoTerminal|GeckoTerminal feed unavailable/);
  }
  assert.ok(help.includes(guides['/help']));
  const articlePath = '/docs/confidential-routing';
  const article = await (await get(`${articlePath}/?recipient=private-recipient-value&refund=private-refund-value&orderId=private-order-value&utm_source=private-query-value`)).text();
  assert.ok(guides[articlePath], 'build must generate the complete public article');
  assert.ok(article.includes(guides[articlePath]));
  assert.equal((article.match(/<h1[ >]/g) || []).length, 1);
  assert.match(article, /<meta name="robots" content="index, follow"/);
  assert.match(article, /<link rel="canonical" href="https:\/\/darkswap\.app\/docs\/confidential-routing"/);
  assert.match(article, /Confidential routing and ZK shielding/);
  assert.match(article, /Confidential routing adds restricted processing to a cross-chain swap/);
  assert.match(article, /private shard with independent, permissioned validators/);
  assert.match(article, /rather than requiring client-side proof generation/);
  assert.match(article, /This is not a ZK shielded pool/);
  assert.match(article, /Zcash’s shielded pools use zero-knowledge proofs/);
  assert.match(article, /for both the dry preview and deposit order/);
  assert.match(article, /DarkSwap does not sign your wallet transaction/);
  assert.match(article, /live Privacy swap route has no advanced-mode UI, confidential wallet balance/);
  assert.match(article, /Confidential balances are proposed for the separate Dark Pool on NEAR Confidential Intents/);
  assert.match(article, /transparent Zcash t1\/t3 addresses/);
  assert.match(article, /Not connecting a wallet is a funding choice, not a privacy guarantee/);
  assert.match(article, /May 27, 2026/);
  assert.match(article, /November 4, 2025/);
  assert.match(article, /October 1, 2026/);
  for (const source of [
    'https://www.near.org/blog/how-confidential-intents-works',
    'https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/confidential-swaps',
    'https://docs.near-intents.org/resources/chain-support',
    'https://www.galaxy.com/insights/research/zcash-price-zec-near-intents-zashi-wallet-privacy-zero-knowledge-proofs',
  ]) assert.ok(article.includes(`href="${source}"`), source);
  assert.match(article, /href="\/near-swap"[^>]*>Review Privacy swap/);
  assert.match(article, /href="\/docs#privacy"/);
  assert.match(article, /href="\/docs"[^>]*>Back to Docs/);
  assert.doesNotMatch(article, /export default|import\.meta|function ConfidentialRoutingDocs|className=|private-(recipient|refund|order|query)-value|<form|input-order-id/);
  const articleBody = article.match(/<article\b[\s\S]*?<\/article>/)?.[0];
  assert.ok(articleBody, 'article must use a semantic article element');
  const articleWords = articleBody.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
  assert.ok(articleWords <= 650, `article exceeds 650 words: ${articleWords}`);
  const articleHead = await get(articlePath, { method: 'HEAD' });
  assert.equal(articleHead.status, 200);
  assert.equal(await articleHead.text(), '');
  for (const id of ['wrong-token-network', 'slow-swap', 'memo-amount', 'refunds',
    'track-order', 'privacy', 'contact', 'before-deposit']) {
    assert.ok(help.includes(`id="${id}"`), `missing FAQ: ${id}`);
  }
  assert.match(help, /Stop\. Do not resend/);
  assert.doesNotMatch(help, /<form|case-token|input-support|textarea-support/);
  const order = await (await get('/order/private-reference')).text();
  assert.match(order, /noindex, nofollow/);
  assert.doesNotMatch(order, /private-reference|Reviewed FAQ|Houdini/);
  assert.equal((await get('/favicon.ico')).status, 200);
  assert.equal((await get('/missing.js')).status, 404);
  assert.equal((await get('/docs', { method: 'POST' })).status, 405);
  const head = await get('/docs', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

// Keep these checks independent: a pool or other guide failure must not prevent
// the production handler's whitepaper assertions from running.
test('production whitepaper exposes the complete reviewed guide and correct HTTP statuses', async t => {
  const get = await startProductionServer(t);
  const path = '/docs/whitepaper';
  const guides = JSON.parse(await readFile(new URL('./dist/public-guides.json', import.meta.url), 'utf8'));
  assert.ok(guides[path], 'build must generate the complete whitepaper');
  for (const url of [path, `${path}/?orderId=private-query-value&recipient=private-recipient-value`]) {
    const response = await get(url);
    assert.equal(response.status, 200, url);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    const html = await response.text();
    assert.ok(html.includes(guides[path]), 'production HTML must contain the complete generated whitepaper');
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, url);
    assert.doesNotMatch(html, /Page unavailable|private-query-value|private-recipient-value/);
    assert.match(html, /<meta name="robots" content="index, follow"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/darkswap\.app\/docs\/whitepaper"/);
  }
  const whitepaper = await (await get(path)).text();
  assert.match(whitepaper, /What privacy you get, and what you do not/);
  assert.match(whitepaper, /<title>DarkSwap Whitepaper v0\.4<\/title>/);
  assert.match(whitepaper, /Version 0\.4 · October 6, 2026 · Supersedes v0\.3\./);
  assert.match(whitepaper, /DARKSWAP WHITEPAPER · V0\.4/);
  const decisionsBox = whitepaper.match(/<aside\b[^>]*aria-label="Open decisions">([\s\S]*?)<\/aside>/)?.[1];
  const changesBox = whitepaper.match(/<aside\b[^>]*aria-label="What changed in v0\.4">([\s\S]*?)<\/aside>/)?.[1];
  assert.equal((decisionsBox?.match(/<li\b/g) || []).length, 7);
  assert.equal((changesBox?.match(/<li\b/g) || []).length, 9);
  assert.match(decisionsBox || '', /Tests use 0\.5%; the contract allows anything up to 1%/);
  assert.match(changesBox || '', /Risks: eight added\./);
  assert.match(whitepaper, /Live routes start on Solana only\./);
  assert.match(whitepaper, /and the plan is to add fees from our own ZK pools to it/);
  assert.match(whitepaper, /Sections that describe a product carry a status tag; read the tag before the text\./);
  const sectionHead = id => whitepaper.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?<h2[^>]*>`))?.[0] || '';
  assert.doesNotMatch(sectionHead('comparison'), /wp-tags|wp-tag-proposed/);
  assert.match(sectionHead('revenue'), /Status: live, built, proposed/);
  assert.match(sectionHead('roadmap'), /Status: live, scheduled, built/);
  assert.doesNotMatch(whitepaper, /planned Dark Pool on Base|No ZEC has been paid yet|in testnet mode/);
  const head = await get(path, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const missing = await get(`${path}/missing`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Page unavailable/);
  const missingHead = await get(`${path}/missing`, { method: 'HEAD' });
  assert.equal(missingHead.status, 404);
  assert.equal(await missingHead.text(), '');
  const post = await get(path, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('extra domains redirect to their page on the main origin', async t => {
  const get = await startProductionServer(t);
  assert.equal(hostRedirects['bridge.darkswap.app'], '/bridge');
  for (const [host, destination] of Object.entries(hostRedirects)) {
    const cases = [
      ['/', { host }, `${siteOrigin}${destination}`],
      ['/?utm_source=team', { host: `${host.toUpperCase()}:443` }, `${siteOrigin}${destination}?utm_source=team`],
      ['/near-order/abc?view=1', { host }, `${siteOrigin}/near-order/abc?view=1`],
      ['/', { host: '127.0.0.1', 'x-forwarded-host': `${host}, proxy.internal` }, `${siteOrigin}${destination}`],
      ['//evil.example/steal', { host }, `${siteOrigin}/steal`],
    ];
    for (const [path, headers, location] of cases) {
      const response = await requestAs(get.port, path, headers);
      assert.equal(response.statusCode, 302, `${host}${path}`);
      assert.equal(response.headers.location, location, `${host}${path}`);
    }
    const head = await requestAs(get.port, '/', { host }, 'HEAD');
    assert.equal(head.statusCode, 302);
    assert.equal(head.headers.location, `${siteOrigin}${destination}`);
  }
  for (const host of [new URL(siteOrigin).host, 'launch.darkswap.app', 'darkswap.app.evil.example']) {
    const response = await requestAs(get.port, '/', { host });
    assert.equal(response.statusCode, 200, host);
  }
});