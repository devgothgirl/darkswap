import assert from 'node:assert/strict';
import { build, createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// Test the actual config's resolution, not a second copy of its release rule.
process.env.PORT ||= '18223';
process.env.BASE_PATH ||= '/';
const root = new URL('../', import.meta.url).pathname;
const configFile = `${root}vite.config.ts`;
const importer = `${root}src/components/token-launch-popup.tsx`;
const specifier = './announcement-countdown';
const productionKey = 'darkswap:darkpool-phase-2-litepaper-v2-dismissed';
const previewKey = 'darkswap:darkpool-phase-2-countdown-v3-dismissed';

const server = await createServer({
  configFile, mode: 'development', server: { middlewareMode: true }, appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const resolved = await server.pluginContainer.resolveId(specifier, importer);
  assert.ok(resolved.id.endsWith('announcement-countdown.preview.tsx'));
  const preview = await server.ssrLoadModule(resolved.id);
  assert.equal(preview.ANNOUNCEMENT_KEY, previewKey);
  const markup = renderToStaticMarkup(createElement(preview.AnnouncementCountdown));
  assert.ok(markup.includes('data-testid="darkpool-countdown"'));
  assert.ok(markup.includes('2026-10-12T13:00:00-08:00'));
} finally {
  await server.close();
}

// SSR emits a directly renderable production module. Also assert the module
// graph excludes countdown dependencies (including CSS), in BOTH build modes.
for (const mode of ['production', 'development']) {
  let moduleIds = [];
  const result = await build({
    configFile, mode,
    plugins: [{
      name: 'verify-countdown-module-graph',
      resolveId(id) { if (id === 'virtual:countdown-boundary') return '\0countdown-boundary'; },
      load(id) {
        if (id === '\0countdown-boundary') {
          return `export { AnnouncementCountdown, ANNOUNCEMENT_KEY } from ${JSON.stringify(specifier)};`;
        }
      },
      generateBundle() { moduleIds = [...this.getModuleIds()]; },
    }],
    build: {
      ssr: true,
      write: false, minify: false,
      rollupOptions: {
        // An entry importing the boundary ensures Vite applies the same alias
        // used by the real popup.
        input: 'virtual:countdown-boundary',
      },
    },
    logLevel: 'error',
  });
  assert.ok(!moduleIds.some(id => /darkpool-countdown|announcement-countdown\.preview/.test(id)));
  const chunk = result.output.find(item => item.type === 'chunk' && item.isEntry);
  assert.ok(chunk);
  const production = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
  assert.equal(production.ANNOUNCEMENT_KEY, productionKey);
  assert.equal(renderToStaticMarkup(createElement(production.AnnouncementCountdown)), '');
}
console.log('Development renders the countdown; all build modes render nothing and retain the original dismissal key.');
