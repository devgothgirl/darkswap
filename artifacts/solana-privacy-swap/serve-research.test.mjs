import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

test('production HTTP publishes real public-feed fields without client JavaScript or private query data', async t => {
  // Stub only the upstream API boundary inside the test child, not the HTML
  // renderer. Never modify a running API or use live financial records.
  const preload = `globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/api/near/trends') throw new Error('unexpected upstream');
    const view = url.searchParams.get('view');
    if (url.searchParams.size !== 1) throw new Error('private query forwarded');
    return Response.json({
      view, source: 'GeckoTerminal', updatedAt: new Date().toISOString(),
      privateOrder: 'PRIVATE_UPSTREAM_RECORD',
      pools: [{ id: 'fixture', address: 'fixture.pool.near', tokenAddress: 'fixture.token.near', tokenSymbol: 'PUBLIC_FIXTURE', tokenName: 'Public fixture token',
        dex: 'Fixture DEX', priceUsd: 2.5, volume24h: 1200, liquidityUsd: 8000, priceChange24h: 3, buys24h: 5, sells24h: 2 }]
    });
  };`;
  const child = spawn(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'serve.mjs'], {
    cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  const lines = createInterface({ input: child.stdout });
  t.after(() => lines.close());
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${errors}`)), 15_000);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
    lines.on('line', line => {
      const port = line.match(/listening on port (\d+)/)?.[1];
      if (port) { clearTimeout(timeout); resolve(port); }
    });
  });
  for (const path of ['/near-trends', '/near-discovery']) {
    const response = await fetch(`http://127.0.0.1:${port}${path}?recipient=PRIVATE_RECIPIENT&orderId=PRIVATE_ORDER`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
    assert.match(html, /PUBLIC_FIXTURE — Public fixture token/);
    assert.match(html, /Pool address: fixture.pool.near/);
    assert.match(html, /Token address: fixture.token.near/);
    assert.match(html, /Source: GeckoTerminal/);
    assert.match(html, /<time datetime=/);
    assert.match(html, /\$1,200/);
    assert.match(html, /https:\/\/www.geckoterminal.com\/near\/pools\/fixture.pool.near/);
    assert.doesNotMatch(html, /PRIVATE_UPSTREAM_RECORD|PRIVATE_RECIPIENT|PRIVATE_ORDER/);
    assert.match(html, /index, follow/);
    if (path === '/near-discovery') assert.match(html, /New pools/);
  }
});