import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);

async function runServer(script, check, fetchSetup) {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  // Any accidental API dependency must fail, even if the network is healthy.
  const noNetwork = 'data:text/javascript,' + encodeURIComponent(
    fetchSetup ?? 'globalThis.fetch = async () => { throw new Error("Network forbidden in readiness test"); };',
  );
  const child = spawn(process.execPath, ['--import', noNetwork, script, '--production'], {
    env: { ...process.env, PORT: String(port) }, stdio: 'pipe',
  });
  let logs = '';
  child.stderr.on('data', chunk => { logs += chunk; });
  const stopped = once(child, 'exit');
  try {
    let response;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/launch/healthz`, { signal: AbortSignal.timeout(2000) });
        break;
      } catch {
        if (child.exitCode !== null) throw new Error(logs);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    assert.ok(response, `Server did not respond: ${logs}`);
    await check(response, `http://127.0.0.1:${port}`);
  } finally {
    child.kill('SIGTERM');
    await stopped;
  }
}

test('production readiness succeeds without market/API requests and supports HEAD', async () => {
  await runServer(new URL('serve.mjs', root).pathname, async (response, origin) => {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ready' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const head = await fetch(`${origin}/launch/healthz`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const post = await fetch(`${origin}/launch/healthz`, { method: 'POST' });
    assert.equal(post.status, 405);
  });
});

test('production sitemap routes serve bounded XML children and reject inaccessible pages', async () => {
  const mint = '55555555555555555555555555555555';
  const fetchSetup = `
    globalThis.fetch = async input => {
      const url = new URL(input);
      if (url.pathname !== '/launch/api/stonkfun/tokens' ||
          url.searchParams.get('view') !== 'new' || url.searchParams.get('pageSize') !== '100') {
        throw new Error('Unexpected public facade request');
      }
      const page = Number(url.searchParams.get('page'));
      return Response.json({
        source: { stale: false },
        tokens: [{ mint: '${mint}', network: 'mainnet-beta', name: 'Public', symbol: 'PUB', description: 'Public token', metrics: {} }],
        pagination: { page, pageSize: 100, total: 200, totalPages: 2, maxAccessiblePage: 2, returned: 1 },
      });
    };
  `;
  await runServer(new URL('serve.mjs', root).pathname, async (_response, origin) => {
    const index = await fetch(`${origin}/launch/sitemap.xml`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /application\/xml/);
    assert.match(await index.text(), /https:\/\/darkswap.app\/launch\/sitemap-tokens-2.xml/);
    const child = await fetch(`${origin}/launch/sitemap-tokens-2.xml`);
    assert.equal(child.status, 200);
    assert.match(child.headers.get('cache-control'), /max-age=60/);
    assert.match(await child.text(), new RegExp(`/token/${mint}`));
    const head = await fetch(`${origin}/launch/sitemap-tokens-1.xml`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const missing = await fetch(`${origin}/launch/sitemap-tokens-3.xml`);
    assert.equal(missing.status, 503);
    assert.equal(missing.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(missing.headers.get('cache-control'), 'no-store');
    const invalid = await fetch(`${origin}/launch/sitemap-tokens-101.xml`);
    assert.equal(invalid.status, 404);
    const post = await fetch(`${origin}/launch/sitemap-tokens-2.xml`, { method: 'POST' });
    assert.equal(post.status, 405);
  }, fetchSetup);
});

test('readiness fails closed when the production build is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'launch-health-'));
  try {
    await mkdir(join(dir, 'src'));
    await copyFile(new URL('serve.mjs', root), join(dir, 'serve.mjs'));
    await copyFile(new URL('src/seo-config.json', root), join(dir, 'src/seo-config.json'));
    await runServer(join(dir, 'serve.mjs'), async response => {
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: 'not_ready' });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});