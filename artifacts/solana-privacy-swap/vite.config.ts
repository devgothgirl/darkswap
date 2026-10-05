import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { aliases, externalRedirects, isKnownRoute, renderPageHtml } from './seo-html.mjs';
import { getResearchHtml } from './near-research-snapshot.mjs';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const require = createRequire(import.meta.url);
const browserBuffer = require.resolve('buffer/', {
  paths: [path.dirname(require.resolve('@solana/web3.js'))],
});


// Shielded pool (TESTNET) proving keys: served and emitted straight from the
// reviewed package so no second copy of the 13 MB of keys is committed.
const POOL_KEYS_DIR = path.resolve(import.meta.dirname, '../../packages/darkswap-pool/keys-dev');
const POOL_KEY_FILES = ['transaction2.wasm', 'transaction2.zkey'];
const poolKeys = {
  name: 'pool-proving-keys',
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use((req, res, next) => {
      const name = new URL(req.url || '/', 'http://localhost').pathname.split('/pool-keys/')[1];
      if (!name || !POOL_KEY_FILES.includes(name)) return next();
      res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
      fs.createReadStream(path.join(POOL_KEYS_DIR, name)).pipe(res);
    });
  },
  generateBundle(this: import('vite').Rollup.PluginContext) {
    for (const name of POOL_KEY_FILES)
      this.emitFile({ type: 'asset', fileName: `pool-keys/${name}`, source: fs.readFileSync(path.join(POOL_KEYS_DIR, name)) });
  },
};

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    {
      name: 'public-page-html',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = new URL(req.url || '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/';
          if (Object.hasOwn(aliases, path)) {
            res.statusCode = 308;
            res.setHeader('Location', aliases[path as keyof typeof aliases]);
            res.end();
            return;
          }
          if (Object.hasOwn(externalRedirects, path)) {
            res.statusCode = 302;
            res.setHeader('Location', externalRedirects[path]);
            res.end();
            return;
          }
          // Apply the same 404 policy to HTML navigation in development;
          // leave Vite's modules, assets and API requests alone.
          if (req.headers.accept?.includes('text/html') && !isKnownRoute(path)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(renderPageHtml(fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8'), path));
            return;
          }
          next();
        });
      },
      transformIndexHtml: {
        order: 'post',
        async handler(html, ctx) {
          if (!ctx.server) return html;
          const pathname = new URL(ctx.originalUrl || '/', 'http://localhost').pathname;
          const path = pathname.replace(/\/+$/, '') || '/';
          const publicGuides = ['/docs', '/docs/confidential-routing', '/docs/whitepaper', '/help'].includes(path) || path === '/pool' || path.startsWith('/pool/')
            ? (await ctx.server.ssrLoadModule('/src/seo-public-guides.tsx')).renderPublicGuides()
            : {};
          return renderPageHtml(html, pathname, publicGuides, await getResearchHtml(path));
        },
      },
    },
    poolKeys,
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      buffer: browserBuffer,
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
