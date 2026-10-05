import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import workspaceConfig from './vite.config';

// Only the dedicated exporter uses this configuration. Never edit the verified
// workspace SEO settings or route base to prepare an independent root host.
const origin = process.env.LAUNCH_STANDALONE_ORIGIN;
if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://')) {
  throw new Error('An exact HTTPS LAUNCH_STANDALONE_ORIGIN is required.');
}
if (process.env.BASE_PATH !== '/') throw new Error('Standalone builds must be root mounted.');
const seoPath = path.resolve(import.meta.dirname, 'src/seo-config.json');
const seo = { ...JSON.parse(readFileSync(seoPath, 'utf8')), origin, basePath: '/' };

export default mergeConfig(workspaceConfig, defineConfig({
  plugins: [{
    name: 'standalone-launch-seo',
    enforce: 'pre',
    load(id) {
      if (id.split('?')[0] === seoPath) return JSON.stringify(seo);
    },
  }],
  // The exported renderer must work outside this monorepo, without its
  // node_modules or workspace packages. Node built-ins remain external.
  ssr: { noExternal: true },
}));