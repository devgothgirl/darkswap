import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routes = JSON.parse(await readFile(path.join(root, 'src/seo-routes.json'), 'utf8'));
const app = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
const poolPaths = JSON.parse(await readFile(path.join(root, 'src/pool/routes.json'), 'utf8'));
const poolPage = await readFile(path.join(root, 'src/pool/pool-page.tsx'), 'utf8');
const tabs = [...poolPage.matchAll(/\{ id: '([^']+)', label:/g)].map(match => `/pool/${match[1]}`);
assert.deepEqual(new Set(poolPaths), new Set(['/pool', '/pool/what-stays-public', ...tabs]), 'Classify every real pool tab before publishing');
assert.match(app, /poolPaths\.includes\(/, 'App must use the finite public pool route registry');
const definedRoutes = [...app.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]).concat(poolPaths);
const classifiedRoutes = [
  ...routes.indexable,
  ...routes.nonIndexable,
  ...Object.keys(routes.aliases),
  ...Object.keys(routes.externalRedirects ?? {}),
  '/order/:id',
];

assert.deepEqual(new Set(definedRoutes), new Set(classifiedRoutes), 'Classify every App route in seo-routes.json before publishing the sitemap');
assert.equal(definedRoutes.length, classifiedRoutes.length, 'Duplicate route classification');
for (const destination of Object.values(routes.externalRedirects ?? {})) {
  assert.match(destination, /^https:\/\/[^/]+/, 'External redirects must use HTTPS');
}
assert.match(routes.origin, /^https:\/\/[^/]+$/, 'Use a verified HTTPS production origin');
for (const [alias, destination] of Object.entries(routes.aliases)) {
  assert.ok(routes.nonIndexable.includes(destination) || routes.indexable.includes(destination), `Unknown alias target: ${alias}`);
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.indexable.map((route) => `  <url><loc>${routes.origin}${route}</loc></url>`).join('\n')}
</urlset>
`;
const robots = `User-agent: *
Allow: /
Sitemap: ${routes.origin}/sitemap.xml
Sitemap: ${routes.origin}/launch/sitemap.xml
`;

for (const [name, content] of [['sitemap.xml', sitemap], ['robots.txt', robots]]) {
  const destination = path.join(root, 'public', name);
  if (process.argv.includes('--check')) {
    assert.equal(await readFile(destination, 'utf8'), content, `${name} is out of sync; run pnpm --filter @workspace/solana-privacy-swap run seo:generate`);
  } else {
    await writeFile(destination, content);
  }
}