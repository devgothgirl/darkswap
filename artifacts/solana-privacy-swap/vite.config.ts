import path from 'path';
import { createRequire } from 'module';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { aliases, renderPageHtml } from './seo-html.mjs';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const require = createRequire(import.meta.url);
const browserBuffer = require.resolve('buffer/', {
  paths: [path.dirname(require.resolve('@solana/web3.js'))],
});

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
          if (aliases[path as keyof typeof aliases]) {
            res.statusCode = 308;
            res.setHeader('Location', aliases[path as keyof typeof aliases]);
            res.end();
            return;
          }
          next();
        });
      },
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          if (!ctx.server) return html;
          const pathname = new URL(ctx.originalUrl || '/', 'http://localhost').pathname;
          return renderPageHtml(html, pathname);
        },
      },
    },
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
