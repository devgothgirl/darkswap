import { createServer } from 'node:http';
import { realpath, readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import seoConfig from './src/seo-config.json' with { type: 'json' };

const root = fileURLToPath(new URL('.', import.meta.url));
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const basePath = seoConfig.basePath.endsWith('/') ? seoConfig.basePath : `${seoConfig.basePath}/`;
const baseWithoutSlash = basePath.slice(0, -1) || '/';
const canonicalOrigin = seoConfig.origin.replace(/\/+$/, '');
const apiOrigin = production
  ? canonicalOrigin
  : process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : null;
const publicDirectory = resolve(root, production ? 'dist/public' : 'public');
const templatePath = resolve(root, production ? 'dist/public/index.html' : 'index.html');
const typeByExtension = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.otf', 'font/otf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

let template;
let initializationError = null;
let vite;
let serverModulePromise;

try {
  template = await readFile(templatePath, 'utf8');
} catch (error) {
  initializationError = error;
}

if (!production) {
  try {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({
      appType: 'custom',
      server: { middlewareMode: true },
    });
  } catch (error) {
    initializationError ??= error;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function sendHtmlError(res, status, message, method = 'GET') {
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>DarkSwap Launch unavailable</title></head>
<body><main><h1>DarkSwap Launch is temporarily unavailable</h1><p>${escapeHtml(message)}</p></main></body></html>`;
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.end(method === 'HEAD' ? undefined : body);
}

function parseRequest(req) {
  const requestTarget = req.url || '/';
  const rawPath = requestTarget.split(/[?#]/, 1)[0] || '/';
  const decodedRawPath = decodeURIComponent(rawPath);
  if (
    decodedRawPath.includes('\0') ||
    decodedRawPath.includes('\\') ||
    decodedRawPath.split('/').some(segment => segment === '.' || segment === '..')
  ) {
    throw new URIError('Unsafe request path');
  }

  const url = new URL(requestTarget, 'http://darkswap.invalid');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.includes('\0') || pathname.includes('\\')) throw new URIError('Unsafe request path');
  const isUnderBase = pathname === baseWithoutSlash || pathname.startsWith(basePath);
  const relativePath = isUnderBase
    ? pathname.slice(baseWithoutSlash.length) || '/'
    : pathname;

  return {
    originalUrl: `${url.pathname}${url.search}`,
    pathname,
    relativePath,
    relativePathWithQuery: `${relativePath}${url.search}`,
    search: url.search,
  };
}

function sendRobots(res, method) {
  const privateRoutes = (seoConfig.private ?? []).map(route =>
    `${basePath}${route.replace(/^\/+/, '')}`,
  );
  const body = [
    'User-agent: *',
    `Allow: ${basePath}`,
    ...privateRoutes.map(route => `Disallow: ${route}`),
    `Disallow: ${basePath}api/`,
    `Sitemap: ${canonicalOrigin}${basePath}sitemap.xml`,
    '',
  ].join('\n');
  res.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end(method === 'HEAD' ? undefined : body);
}

async function sendSitemap(res, method, catalogPage) {
  try {
    const entry = await loadServerModule();
    if (typeof entry.sitemap !== 'function') throw new Error('Sitemap renderer is unavailable');
    const xml = await entry.sitemap(requireApiOrigin(), catalogPage);
    if (typeof xml !== 'string' || !xml.trim()) throw new Error('Sitemap renderer returned no XML');
    res.writeHead(200, {
      'Cache-Control': 'public, max-age=60, s-maxage=60',
      'Content-Type': 'application/xml; charset=utf-8',
    });
    res.end(method === 'HEAD' ? undefined : xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sitemap error';
    res.writeHead(503, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    res.end(method === 'HEAD' ? undefined : `Sitemap unavailable: ${message}`);
  }
}

function requireApiOrigin() {
  if (!apiOrigin) throw new Error('REPLIT_DEV_DOMAIN is required to render public launch data');
  return apiOrigin;
}

async function sendAsset(res, method, relativePath) {
  const localPath = resolve(publicDirectory, `.${relativePath}`);
  const localRelativePath = relative(publicDirectory, localPath);
  if (
    !localRelativePath ||
    localRelativePath === 'index.html' ||
    localRelativePath === '..' ||
    localRelativePath.startsWith(`..${sep}`) ||
    localRelativePath.startsWith(sep)
  ) {
    res.writeHead(404).end();
    return;
  }

  try {
    const [realDirectory, realFile, fileInfo] = await Promise.all([
      realpath(publicDirectory),
      realpath(localPath),
      stat(localPath),
    ]);
    const realRelativePath = relative(realDirectory, realFile);
    if (
      !fileInfo.isFile() ||
      realRelativePath === '..' ||
      realRelativePath.startsWith(`..${sep}`) ||
      realRelativePath.startsWith(sep)
    ) {
      res.writeHead(404).end();
      return;
    }
    const bytes = await readFile(realFile);
    const immutableAsset = realRelativePath.split(sep).includes('assets');
    res.writeHead(200, {
      'Cache-Control': immutableAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
      'Content-Length': bytes.length,
      'Content-Type': typeByExtension.get(extname(realFile).toLowerCase()) ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(404).end();
  }
}

async function loadServerModule() {
  if (!serverModulePromise) {
    serverModulePromise = production
      ? import(pathToFileURL(resolve(root, 'dist/server/entry-server.js')).href)
      : vite
        ? vite.ssrLoadModule('/src/entry-server.tsx')
        : Promise.reject(initializationError ?? new Error('Vite development server is unavailable'));
  }
  return serverModulePromise;
}

async function handleRequest(req, res, parsed) {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const routePath = parsed.relativePath.replace(/\/+$/, '') || '/';
  if (routePath === '/healthz') {
    try {
      if (initializationError) throw initializationError;
      if (!template) throw new Error('HTML template is unavailable');
      const entry = await loadServerModule();
      if (typeof entry.render !== 'function') throw new Error('Page renderer is unavailable');
      res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
      res.end(method === 'HEAD' ? undefined : '{"status":"ready"}');
    } catch {
      res.writeHead(503, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
      res.end(method === 'HEAD' ? undefined : '{"status":"not_ready"}');
    }
    return;
  }
  if (routePath === '/robots.txt') {
    sendRobots(res, method);
    return;
  }
  const catalogSitemap = routePath.match(/^\/sitemap-tokens-([1-9]\d?|100)\.xml$/);
  if (routePath === '/sitemap.xml' || catalogSitemap) {
    await sendSitemap(res, method, catalogSitemap ? Number(catalogSitemap[1]) : undefined);
    return;
  }

  const pathForAssets = routePath === '/' ? '' : routePath;
  if (extname(pathForAssets)) {
    await sendAsset(res, method, pathForAssets);
    return;
  }

  try {
    if (initializationError) throw initializationError;
    if (!template) throw new Error('HTML template is unavailable');
    const entry = await loadServerModule();
    if (typeof entry.render !== 'function') throw new Error('Page renderer is unavailable');
    const htmlTemplate = vite
      ? await vite.transformIndexHtml(parsed.originalUrl, template)
      : template;
    // Only the configured API origin is passed to SSR. Incoming cookies and
    // request headers are intentionally never forwarded to API requests.
    const result = await entry.render(parsed.relativePathWithQuery, requireApiOrigin());
    if (
      !result ||
      typeof result.body !== 'string' ||
      typeof result.head !== 'string' ||
      typeof result.state !== 'string'
    ) {
      throw new Error('Page renderer returned an invalid response');
    }

    if (!htmlTemplate.includes('<!--page-head-->') || !htmlTemplate.includes('<!--page-state-->')) {
      throw new Error('HTML template is missing page metadata placeholders');
    }
    let html = htmlTemplate
      .replace('<!--page-head-->', () => result.head)
      .replace('<!--page-state-->', () => result.state);
    const rootPattern = /<div\s+id=(["'])root\1\s*><\/div>/;
    if (!rootPattern.test(html)) throw new Error('HTML template is missing the #root mount point');
    html = html.replace(rootPattern, () => `<div id="root">${result.body}</div>`);

    const status = Number.isInteger(result.status) && result.status >= 200 && result.status <= 599
      ? result.status
      : 200;
    res.writeHead(status, {
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(html),
      'Content-Type': 'text/html; charset=utf-8',
      ...(status === 404 || status >= 500 ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
    });
    res.end(method === 'HEAD' ? undefined : html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown rendering error';
    sendHtmlError(res, 503, `Page rendering failed: ${message}`, method);
  }
}

const rawPort = process.env.PORT;
const port = Number(rawPort);
if (!rawPort || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`A valid PORT environment variable is required; received "${rawPort ?? ''}".`);
}

const server = createServer((req, res) => {
  let parsed;
  try {
    parsed = parseRequest(req);
  } catch {
    res.writeHead(400, { 'Cache-Control': 'no-store' }).end();
    return;
  }

  const routePath = parsed.relativePath.replace(/\/+$/, '') || '/';
  // Generated routes take precedence over Vite's public-directory middleware,
  // including the checked-in development robots.txt file.
  if (routePath === '/healthz' || routePath === '/robots.txt' || routePath === '/sitemap.xml' ||
      /^\/sitemap-tokens-(?:[1-9]\d?|100)\.xml$/.test(routePath)) {
    void handleRequest(req, res, parsed);
    return;
  }

  if (vite) {
    vite.middlewares(req, res, error => {
      if (error) {
        const message = error instanceof Error ? error.message : 'Development middleware failed';
        sendHtmlError(res, 503, `Page rendering failed: ${message}`, req.method ?? 'GET');
        return;
      }
      void handleRequest(req, res, parsed);
    });
    return;
  }
  void handleRequest(req, res, parsed);
});

server.listen(port, '0.0.0.0');