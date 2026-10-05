import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRenderer } from '../../deploy/launch-standalone/serve.mjs';

const scriptPath = fileURLToPath(new URL('../../deploy/launch-standalone/serve.mjs', import.meta.url));
const apiOrigin = 'https://public-api.fixture.invalid';
const targetOrigin = 'https://darkswap.world';
const mint = 'So11111111111111111111111111111111111111112';
const seoConfig = {
  origin: targetOrigin,
  basePath: '/',
  indexable: ['/', '/explore', '/docs', '/terms', '/privacy', '/risk'],
  dynamic: ['/token/:mint'],
  private: ['/create', '/creator', '/admin'],
};
const template = '<!doctype html><html><head><!--page-head--></head><body><div id="root"></div><!--page-state--><script type="module" src="/assets/site.js"></script></body></html>';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'launch-renderer-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'public/assets'), { recursive: true });
  await writeFile(join(directory, 'public/index.html'), template);
  await writeFile(join(directory, 'public/assets/site.js'), '// test fixture only');
  await writeFile(join(directory, 'seo-config.json'), JSON.stringify(seoConfig));
  const calls = [];
  const result = {
    body: '<main><h1>Fixture Launch page</h1><p>Server-rendered $& public content.</p></main>',
    head: '<title>Fixture Launch</title><meta name="robots" content="index, follow" /><link rel="canonical" href="https://wrong.fixture.invalid/launch/" />',
    state: '<script type="application/json" id="launch-public-state">{"public":"$&"}</script>',
    status: 200,
  };
  const entry = {
    async render(...args) {
      calls.push({ function: 'render', args });
      return { ...result };
    },
    async sitemap(...args) {
      calls.push({ function: 'sitemap', args });
      return `<?xml version="1.0"?><urlset><url><loc>${targetOrigin}/docs</loc></url></urlset>`;
    },
  };
  return { directory, calls, entry, result };
}

async function listen(t, options) {
  const server = await createRenderer({ apiOrigin, ...options });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const port = server.address().port;
  return (path, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
    // node:http preserves the original request target, including malformed paths;
    // URL/fetch normalization would hide precisely the cases under test.
    const req = request({ hostname: '127.0.0.1', port, path, method, headers, agent: false }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function assertNoindex(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow');
  if (response.body) assert.match(response.body, /<meta name="robots" content="noindex, nofollow"/);
}

test('SSR replaces all Vite placeholders literally, preserving scripts and fixed canonical targets', async t => {
  const f = await fixture(t);
  const get = await listen(t, f);
  for (const route of [...seoConfig.indexable, `/token/${mint}`]) {
    const response = await get(route);
    assert.equal(response.status, 200, route);
    assert.match(response.body, /<div id="root"><main><h1>Fixture Launch page/);
    assert.ok(response.body.includes(f.result.body));
    assert.ok(response.body.includes(f.result.state));
    assert.match(response.body, /<title>Fixture Launch<\/title>/);
    assert.ok(response.body.includes(`<link rel="canonical" href="${targetOrigin}${route}" />`));
    assert.match(response.body, /src="\/assets\/site\.js"/);
    assert.ok(!response.body.includes('<!--page-'));
    assert.ok(!response.body.includes('wrong.fixture.invalid'));
    assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(Number(response.headers['content-length']), Buffer.byteLength(response.body));
  }
  assert.deepEqual(f.calls.map(call => call.args), [
    ...seoConfig.indexable.map(route => [route, apiOrigin]),
    [`/token/${mint}`, apiOrigin],
  ]);
});

test('queries reach SSR unchanged; canonical excludes query and variants are noindex', async t => {
  const f = await fixture(t);
  const get = await listen(t, f);
  const path = '/explore/?q=public%20token&pair=a%2Fb&view=new';
  const response = await get(path);
  assertNoindex(response, 200);
  assert.ok(response.body.includes(`<link rel="canonical" href="${targetOrigin}/explore" />`));
  assert.ok(!response.body.includes('content="index, follow"'));
  assert.deepEqual(f.calls, [{ function: 'render', args: [path, apiOrigin] }]);
});

test('all classified private pages are rendered anonymously, forced noindex and no-store', async t => {
  const f = await fixture(t);
  const get = await listen(t, f);
  for (const route of seoConfig.private) {
    const response = await get(route, {
      headers: {
        Host: 'attacker.fixture.invalid',
        Cookie: 'session=unit-test-sensitive-cookie',
        Authorization: 'Bearer unit-test-sensitive-token',
        Forwarded: 'host=attacker.fixture.invalid;proto=http',
        'X-Forwarded-Host': 'attacker.fixture.invalid',
        'X-Forwarded-Proto': 'http',
        'X-Launch-CSRF': 'unit-test-sensitive-csrf',
      },
    });
    assertNoindex(response, 200);
    assert.ok(response.body.includes(f.result.body));
    assert.ok(response.body.includes(`${targetOrigin}${route}`));
    assert.ok(!/attacker|sensitive|index, follow/.test(response.body));
  }
  assert.deepEqual(f.calls.map(call => call.args), seoConfig.private.map(route => [route, apiOrigin]));
});

test('missing assets, raw index, API and unrelated paths never invoke rendering or proxying', async t => {
  const f = await fixture(t);
  const get = await listen(t, f);
  for (const path of [
    '/assets/missing.js', '/assets/site.js', '/favicon.svg', '/index.html',
    '/server/entry-server.js', '/seo-config.json', '/api', '/api/',
    '/api/launch/config', '/api/launch/auth/session', '/api/stonkfun/tokens',
    '/launch/docs', '/unclassified', '/docs/extra', '/token/not-a-mint', `/token/${mint}/extra`,
  ]) {
    assertNoindex(await get(path), 404);
  }
  assert.deepEqual(f.calls, []);
});

test('malformed original paths are rejected before normalization or route dispatch', async t => {
  const f = await fixture(t);
  const get = await listen(t, f);
  for (const path of [
    '/./docs', '/explore/../docs', '/%2e/docs', '/%2E%2e/docs',
    '/explore/%2e./docs', '/explore/.%2e/docs', '/%2fdocs', '/%2Fdocs',
    '/docs%2f', '/docs%5c', '/docs\\', '/%252fdocs', '/%252e/docs',
    '/docs%', '/docs%GG', '/docs%00', '/docs%0a', '/docs%7f', '/docs%20',
    '//docs', '/explore//', '/docs#fragment', 'https://attacker.fixture.invalid/docs',
  ]) {
    assertNoindex(await get(path), 400);
  }
  assert.deepEqual(f.calls, []);
});

test('GET and HEAD only: other methods fail explicitly without dispatch', async t => {
  const f = await fixture(t);
  const get = await listen(t, f);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    for (const path of ['/docs', '/sitemap.xml', '/robots.txt', '/api/launch/config']) {
      const response = await get(path, { method });
      assertNoindex(response, 405);
      assert.equal(response.headers.allow, 'GET, HEAD');
    }
  }
  assert.deepEqual(f.calls, []);
});

test('HEAD returns matching SSR, crawler and error headers with no response body', async t => {
  const f = await fixture(t);
  const get = await listen(t, f);
  for (const path of ['/docs', '/admin', '/explore?q=token', '/robots.txt', '/sitemap.xml', '/assets/missing.js', '/%2fdocs']) {
    const full = await get(path);
    const head = await get(path, { method: 'HEAD' });
    assert.equal(head.status, full.status);
    assert.equal(head.body, '');
    for (const key of ['content-type', 'content-length', 'cache-control', 'x-robots-tag']) {
      assert.equal(head.headers[key], full.headers[key], `${path}: ${key}`);
    }
  }
});

test('robots uses only target origin and classifications; sitemap uses only the fixed public API origin', async t => {
  const f = await fixture(t);
  const get = await listen(t, f);
  const robots = await get('/robots.txt', { headers: { Host: 'attacker.fixture.invalid' } });
  assert.equal(robots.status, 200);
  assert.equal(robots.headers['content-type'], 'text/plain; charset=utf-8');
  for (const route of seoConfig.private) assert.ok(robots.body.includes(`Disallow: ${route}\n`));
  assert.ok(robots.body.includes('Disallow: /api/\n'));
  assert.ok(robots.body.includes(`Sitemap: ${targetOrigin}/sitemap.xml\n`));
  assert.ok(!robots.body.includes('attacker'));
  assert.deepEqual(f.calls, []);
  const sitemap = await get('/sitemap.xml?source=caller', {
    headers: { Authorization: 'Bearer test-only', 'X-Forwarded-Host': 'attacker.fixture.invalid' },
  });
  assert.equal(sitemap.status, 200);
  assert.equal(sitemap.headers['content-type'], 'application/xml; charset=utf-8');
  assert.ok(sitemap.body.includes(`<loc>${targetOrigin}/docs</loc>`));
  assert.deepEqual(f.calls, [{ function: 'sitemap', args: [apiOrigin] }]);
});

test('render and upstream failures are explicit 503s without sensitive details', async t => {
  const f = await fixture(t);
  const sensitive = 'unit-test-sensitive-token https://private.fixture.invalid/internal';
  f.entry.render = async () => { throw new Error(sensitive); };
  f.entry.sitemap = async () => { throw new Error(sensitive); };
  const get = await listen(t, f);
  for (const path of ['/docs', '/sitemap.xml']) {
    const response = await get(path);
    assertNoindex(response, 503);
    assert.match(response.body, /temporarily unavailable/);
    assert.ok(!/sensitive|private\.fixture|internal/.test(response.body));
    assertNoindex(await get(path, { method: 'HEAD' }), 503);
  }
});

test('entry-returned upstream errors and token 404s cannot remain indexable', async t => {
  const f = await fixture(t);
  const get = await listen(t, f);
  for (const status of [404, 503]) {
    f.result.status = status;
    const response = await get(`/token/${mint}`);
    assertNoindex(response, status);
    assert.ok(!response.body.includes('content="index, follow"'));
  }
});

test('invalid renderer outputs become generic unavailable responses', async t => {
  const f = await fixture(t);
  let output;
  f.entry.render = async () => output;
  f.entry.sitemap = async () => output;
  const get = await listen(t, f);
  for (const invalid of [
    null, {}, { ...f.result, body: null }, { ...f.result, state: {} },
    { ...f.result, head: undefined }, { ...f.result, status: '200' },
    { ...f.result, status: 999 }, { ...f.result, status: 199 },
  ]) {
    output = invalid;
    assertNoindex(await get('/docs'), 503);
  }
  for (const invalid of [null, '', '   ', {}]) {
    output = invalid;
    assertNoindex(await get('/sitemap.xml'), 503);
  }
});

test('runtime imports the exported self-contained ESM entry when no test entry is injected', async t => {
  const f = await fixture(t);
  await mkdir(join(f.directory, 'server'));
  await writeFile(join(f.directory, 'package.json'), '{"type":"module"}');
  await writeFile(join(f.directory, 'server/entry-server.js'), `
export async function render(path, origin) {
  return { body: '<main>Imported fixture</main>', head: '<title>Imported fixture</title>',
    state: '<script type="application/json" id="launch-public-state">{}</script>', status: 200 };
}
export async function sitemap(origin) { return '<urlset></urlset>'; }
`);
  const get = await listen(t, { directory: f.directory });
  assert.match((await get('/docs')).body, /<div id="root"><main>Imported fixture<\/main><\/div>/);
  assert.equal((await get('/sitemap.xml')).body, '<urlset></urlset>');
});

test('API origin validation rejects normalization, credentials, non-HTTPS and absent values', async t => {
  const f = await fixture(t);
  for (const origin of [
    undefined, null, '', 'http://127.0.0.1:3000', 'http://public.fixture.invalid',
    'https://user:password@public.fixture.invalid', 'https://public.fixture.invalid/',
    'https://public.fixture.invalid/api', 'https://public.fixture.invalid?key=test-sensitive',
    'https://public.fixture.invalid#fragment', 'https://PUBLIC.fixture.invalid',
    'https://public.fixture.invalid:443', ' https://public.fixture.invalid',
    'https://public.fixture.invalid ', '//public.fixture.invalid', 'file:///tmp/fixture',
  ]) {
    await assert.rejects(createRenderer({ ...f, apiOrigin: origin }), /exact HTTPS origin/);
  }
  const server = await createRenderer({ ...f, apiOrigin: 'https://public.fixture.invalid:8443' });
  assert.equal(server.listening, false);
});

test('startup refuses absent files, incompatible SEO config, missing placeholders and missing exports', async t => {
  const f = await fixture(t);
  for (const config of [
    { ...seoConfig, origin: 'https://darkswap.app' },
    { ...seoConfig, basePath: '/launch/' },
    { ...seoConfig, indexable: ['/api/launch/config'] },
    { ...seoConfig, dynamic: ['/token/:anything'] },
    { ...seoConfig, private: ['/docs'] },
    { ...seoConfig, private: undefined },
  ]) {
    await writeFile(join(f.directory, 'seo-config.json'), JSON.stringify(config));
    await assert.rejects(createRenderer({ ...f, apiOrigin }), /configuration/);
  }
  await writeFile(join(f.directory, 'seo-config.json'), JSON.stringify(seoConfig));
  for (const html of [
    template.replace('<!--page-head-->', ''),
    template.replace('<!--page-state-->', ''),
    template.replace('<div id="root"></div>', '<div id="root">old content</div>'),
    `${template}<!--page-head-->`,
  ]) {
    await writeFile(join(f.directory, 'public/index.html'), html);
    await assert.rejects(createRenderer({ ...f, apiOrigin }), /SSR placeholders/);
  }
  await writeFile(join(f.directory, 'public/index.html'), template);
  await assert.rejects(createRenderer({ ...f, apiOrigin, entry: {} }), /exports are unavailable/);
  await assert.rejects(createRenderer({ directory: join(f.directory, 'absent'), apiOrigin }), /files are unavailable/);
});

test('CLI requires strict LAUNCH_SSR_PORT and HTTPS LAUNCH_PUBLIC_API_ORIGIN without disclosing values', () => {
  for (const port of ['', '0', '65536', '-1', '3.5', '1e3', '+4173', '04173', ' 4173', '4173 ']) {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, PORT: '4173', LAUNCH_SSR_PORT: port, LAUNCH_PUBLIC_API_ORIGIN: apiOrigin },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /LAUNCH_SSR_PORT must be an integer between 1 and 65535/);
    assert.equal(result.stdout, '');
  }
  for (const origin of ['', 'http://127.0.0.1:3000', 'https://public.fixture.invalid?key=unit-test-sensitive']) {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, LAUNCH_SSR_PORT: '4173', LAUNCH_PUBLIC_API_ORIGIN: origin,
        REPLIT_DEV_DOMAIN: 'attacker.fixture.invalid' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /LAUNCH_PUBLIC_API_ORIGIN must be an exact HTTPS origin/);
    assert.ok(!/sensitive|attacker|127\.0\.0\.1/.test(result.stderr));
    assert.equal(result.stdout, '');
  }
});

test('Nginx template keeps API gateway restrictions, classified SSR routes and static 404 fallback separate', async () => {
  const nginx = await readFile(new URL('../../deploy/launch-standalone/nginx.conf.template', import.meta.url), 'utf8');
  assert.ok(nginx.includes('proxy_pass http://127.0.0.1:${LAUNCH_SSR_PORT};'));
  assert.ok(nginx.includes('proxy_pass https://launch_api/launch$request_uri;'));
  assert.ok(nginx.includes('if ($launch_api_allowed = 0) { return 404'));
  assert.ok(nginx.includes('if ($http_host != "darkswap.world") { return 421; }'));
  assert.ok(nginx.includes('if ($http_x_forwarded_proto != "https") { return 400; }'));
  assert.ok(nginx.includes('if ($launch_bad_path = 1) { return 400; }'));
  assert.ok(nginx.includes('explore|docs|terms|privacy|risk|create|creator|admin|token/'));
  assert.ok(nginx.includes('robots\\.txt|sitemap\\.xml'));
  assert.ok(nginx.includes('proxy_pass_request_headers off;'));
  assert.ok(nginx.includes('proxy_pass_request_body off;'));
  assert.ok(nginx.includes('location = /index.html { return 404; }'));
  assert.ok(nginx.includes('try_files $uri =404;'));
  assert.ok(!nginx.includes('try_files /index.html'));
  assert.ok(nginx.includes('proxy_ssl_verify on;'));
  assert.ok(nginx.includes('proxy_set_header Cookie $http_cookie;'));
  assert.ok(nginx.includes('proxy_set_header X-Launch-CSRF $http_x_launch_csrf;'));
});