import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Vite compiles the same TSX and imports used by the client. Effects and event
// handlers do not run during static rendering; no support/order data is loaded.
const server = await createServer({
  configFile: new URL('../vite.config.ts', import.meta.url).pathname,
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { renderPublicGuides } = await server.ssrLoadModule('/src/seo-public-guides.tsx');
  await writeFile(new URL('../dist/public-guides.json', import.meta.url), JSON.stringify(renderPublicGuides()));
} finally {
  await server.close();
}