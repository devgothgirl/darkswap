import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runtimeDirectory = fileURLToPath(new URL('.', import.meta.url));
const canonicalOrigin = 'https://darkswap.world';
const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function validateApiOrigin(value) {
  // Exact serialized HTTPS origin only: no implicit normalization, credentials,
  // trailing slash, path, query, fragment, or caller-controlled request authority.
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('LAUNCH_PUBLIC_API_ORIGIN must be an exact HTTPS origin.');
  }
  if (
    typeof value !== 'string' ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.origin !== value
  ) {
    throw new Error('LAUNCH_PUBLIC_API_ORIGIN must be an exact HTTPS origin.');
  }
  return value;
}

function validateConfig(config) {
  if (!config || config.origin !== canonicalOrigin || config.basePath !== '/') {
    throw new Error('Standalone SEO configuration must target https://darkswap.world at /.');
  }
  const seen = new Set();
  for (const classification of ['indexable', 'private', 'dynamic']) {
    const routes = config[classification];
    if (!Array.isArray(routes)) throw new Error('Invalid standalone route configuration.');
    for (const route of routes) {
      const valid = classification === 'dynamic'
        ? route === '/token/:mint'
        : typeof route === 'string' &&
          (route === '/' || /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(route)) &&
          !/^\/(?:api|assets|server)(?:\/|$)/.test(route);
      if (!valid || seen.has(route)) throw new Error('Invalid standalone route configuration.');
      seen.add(route);
    }
  }
  return config;
}

function parseTarget(target) {
  if (
    typeof target !== 'string' ||
    !target.startsWith('/') ||
    target.startsWith('//') ||
    /[\u0000-\u0020\u007f#]/.test(target)
  ) {
    throw new URIError('Invalid request target');
  }
  const queryIndex = target.indexOf('?');
  const rawPath = queryIndex < 0 ? target : target.slice(0, queryIndex);
  const search = queryIndex < 0 ? '' : target.slice(queryIndex);
  if (/%(?:2f|5c)/i.test(rawPath) || rawPath.includes('\\')) {
    throw new URIError('Invalid request path');
  }
  const pathname = decodeURIComponent(rawPath);
  if (
    /[\u0000-\u0020\u007f\\%]/.test(pathname) ||
    pathname.includes('//') ||
    pathname.split('/').some(segment => segment === '.' || segment === '..')
  ) {
    throw new URIError('Invalid request path');
  }
  const route = pathname.replace(/\/$/, '') || '/';
  return { route, search, path: `${pathname}${search}` };
}

function send(res, method, status, body, type, extraHeaders = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(method === 'HEAD' ? undefined : body);
}

function sendError(res, method, status, extraHeaders = {}) {
  const message = status === 503
    ? 'DarkSwap Launch is temporarily unavailable.'
    : status === 405
      ? 'Method not allowed.'
      : status === 400
        ? 'Invalid request.'
        : 'Not found.';
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>DarkSwap Launch</title></head><body><main><h1>${message}</h1></main></body></html>`;
  send(res, method, status, body, 'text/html; charset=utf-8', {
    'X-Robots-Tag': 'noindex, nofollow',
    ...extraHeaders,
  });
}

function compose(template, result, route, forceNoindex) {
  if (
    !result ||
    typeof result.body !== 'string' ||
    typeof result.head !== 'string' ||
    typeof result.state !== 'string' ||
    (result.status !== undefined &&
      (!Number.isInteger(result.status) || result.status < 200 || result.status > 599))
  ) {
    throw new Error('Invalid render result');
  }
  const status = result.status ?? 200;
  const noindex = forceNoindex || status >= 400;
  let head = result.head;
  if (noindex) {
    // The runtime enforces this even if an entry module omits private metadata.
    head = head.replace(/<meta\b[^>]*\bname\s*=\s*(["'])robots\1[^>]*>/gi, '');
    head += '\n<meta name="robots" content="noindex, nofollow" />';
  }
  // Canonicals never inherit queries, Host, Forwarded, or the public API origin.
  head = head.replace(/<link\b[^>]*\brel\s*=\s*(["'])canonical\1[^>]*>/gi, '');
  head += `\n<link rel="canonical" href="${canonicalOrigin}${route}" />`;
  const html = template
    .replace('<!--page-head-->', () => head)
    .replace('<!--page-state-->', () => result.state)
    .replace(/<div\s+id=(["'])root\1\s*>\s*<\/div>/, () => `<div id="root">${result.body}</div>`);
  return { html, status, noindex: noindex || /<meta\b[^>]*\bname\s*=\s*(["'])robots\1[^>]*\bnoindex\b/i.test(head) };
}

/**
 * Return an unstarted Node HTTP server. Tests may inject an entry object exposing
 * render(path, apiOrigin) and sitemap(apiOrigin); it is never derived from HTTP.
 * directory contains public/index.html, seo-config.json, server/entry-server.js.
 * apiOrigin is an explicit, exact HTTPS origin (also enforced for test callers).
 */
export async function createRenderer({ directory = runtimeDirectory, entry, apiOrigin } = {}) {
  const fixedApiOrigin = validateApiOrigin(apiOrigin);
  let template;
  let config;
  try {
    [template, config] = await Promise.all([
      readFile(resolve(directory, 'public/index.html'), 'utf8'),
      readFile(resolve(directory, 'seo-config.json'), 'utf8').then(JSON.parse),
    ]);
  } catch {
    throw new Error('Standalone renderer files are unavailable.');
  }
  validateConfig(config);
  if (
    template.split('<!--page-head-->').length !== 2 ||
    template.split('<!--page-state-->').length !== 2 ||
    (template.match(/<div\s+id=(["'])root\1\s*>\s*<\/div>/g) ?? []).length !== 1
  ) {
    throw new Error('Standalone HTML template is missing SSR placeholders.');
  }
  let serverEntry;
  try {
    serverEntry = entry ?? (directory === runtimeDirectory
      ? await import('./server/entry-server.js')
      : await import(pathToFileURL(resolve(directory, 'server/entry-server.js')).href));
  } catch {
    throw new Error('Standalone renderer module is unavailable.');
  }
  if (typeof serverEntry.render !== 'function' || typeof serverEntry.sitemap !== 'function') {
    throw new Error('Standalone renderer exports are unavailable.');
  }
  const publicRoutes = new Set(config.indexable);
  const privateRoutes = new Set(config.private);
  const hasTokenRoute = config.dynamic.includes('/token/:mint');
  const robots = [
    'User-agent: *',
    'Allow: /',
    ...config.private.map(route => `Disallow: ${route}`),
    'Disallow: /api/',
    `Sitemap: ${canonicalOrigin}/sitemap.xml`,
    '',
  ].join('\n');

  return createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      sendError(res, method, 405, { Allow: 'GET, HEAD' });
      return;
    }
    let parsed;
    try {
      parsed = parseTarget(req.url);
    } catch {
      sendError(res, method, 400);
      return;
    }
    const { route, path, search } = parsed;
    if (route === '/robots.txt') {
      send(res, method, 200, robots, 'text/plain; charset=utf-8');
      return;
    }
    if (route === '/sitemap.xml') {
      try {
        const xml = await serverEntry.sitemap(fixedApiOrigin);
        if (typeof xml !== 'string' || !xml.trim()) throw new Error('Invalid sitemap result');
        send(res, method, 200, xml, 'application/xml; charset=utf-8');
      } catch {
        // Never expose upstream errors, URLs, cookies, or request headers.
        sendError(res, method, 503);
      }
      return;
    }
    const dynamicRoute = hasTokenRoute &&
      route.startsWith('/token/') && mintPattern.test(route.slice('/token/'.length));
    if (!publicRoutes.has(route) && !privateRoutes.has(route) && !dynamicRoute) {
      // Assets are exclusively Nginx's job; this is not a static server or proxy.
      sendError(res, method, 404);
      return;
    }
    try {
      // No authentication headers, cookies, or request-derived origin are passed.
      const result = await serverEntry.render(path, fixedApiOrigin);
      const rendered = compose(template, result, route, privateRoutes.has(route) || !!search);
      send(res, method, rendered.status, rendered.html, 'text/html; charset=utf-8',
        rendered.noindex ? { 'X-Robots-Tag': 'noindex, nofollow' } : {});
    } catch {
      sendError(res, method, 503);
    }
  });
}

async function main() {
  const rawPort = process.env.LAUNCH_SSR_PORT;
  if (
    typeof rawPort !== 'string' ||
    !/^[1-9]\d{0,4}$/.test(rawPort) ||
    Number(rawPort) > 65535
  ) {
    throw new Error('LAUNCH_SSR_PORT must be an integer between 1 and 65535.');
  }
  const server = await createRenderer({ apiOrigin: process.env.LAUNCH_PUBLIC_API_ORIGIN });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', () => rejectListen(new Error('Standalone renderer could not listen.')));
    server.listen(Number(rawPort), '127.0.0.1', resolveListen);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // All errors reaching this boundary have deliberately generic messages.
    console.error(error.message);
    process.exitCode = 1;
  });
}