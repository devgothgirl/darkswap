import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const config = JSON.parse(await readFile(new URL('../src/seo-config.json', import.meta.url), 'utf8'));
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1]);
const classified = [...config.indexable, ...config.dynamic, ...config.private];
assert.deepEqual([...routes].sort(), [...classified].sort(), 'Classify all Launch routes before publishing');
assert.match(config.origin, /^https:\/\/[^/]+$/);
assert.match(config.basePath, /^\/.*\/$/);
if (process.env.BASE_PATH) {
  assert.equal(process.env.BASE_PATH, config.basePath, 'Serving base path and verified canonical base must agree');
}