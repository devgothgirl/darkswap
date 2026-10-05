import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { aliases, externalRedirects, isKnownRoute } from './seo-html.mjs';

// Run after the artifact build: test the actual production handler and output.
test('production HTML exposes public guides and uses correct HTTP status codes', async t => {
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
    'safety', 'privacy', 'confidential-routing', 'near-zec', 'fees-rewards', 'providers', 'further-reading']) {
    assert.ok(docs.includes(`id="${id}"`), `missing documentation section: ${id}`);
  }
  assert.match(docs, /Houdini \/ HoudiniSwap/);
  assert.match(docs, /NEAR Intents 1Click API/);
  assert.match(docs, /Solana deposits remain visible on-chain/);
  assert.match(docs, /href="\/docs\/confidential-routing"/);
  const help = await (await get('/help')).text();
  // Verify every reviewed question and answer from the same generated source.
  const guides = JSON.parse(await readFile(new URL('./dist/public-guides.json', import.meta.url), 'utf8'));
  const poolPaths = JSON.parse(await readFile(new URL('./src/pool/routes.json', import.meta.url), 'utf8'));
  for (const path of ['/docs/whitepaper', ...poolPaths]) {
    const html = await (await get(`${path}/?orderId=private-query-value&recipient=private-recipient-value`)).text();
    assert.ok(guides[path], `missing public guide for ${path}`);
    assert.ok(html.includes(guides[path]), path);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, path);
    assert.doesNotMatch(html, /Page unavailable|private-query-value|private-recipient-value/);
    if (path.startsWith('/pool')) {
      assert.match(html, /Testnet. Development proving keys. Do not deposit real funds/);
      assert.doesNotMatch(html, /<form|input-pool|shielded-balance|recent-order/);
    }
    assert.match(html, routes.indexable.includes(path) ? /index, follow/ : /noindex, nofollow/);
  }
  const whitepaper = await (await get('/docs/whitepaper')).text();
  assert.match(whitepaper, /What privacy you get, and what you do not/);
  assert.match(whitepaper, /v0.2/);
  const explanation = await (await get('/pool/what-stays-public')).text();
  for (const phrase of ['Public, on chain', 'Not revealed by the pool', 'What weakens it', 'What DarkSwap sees', 'This testnet pool is small']) assert.ok(explanation.includes(phrase), phrase);
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
  assert.match(article, /There is no advanced-mode UI, confidential wallet balance/);
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