import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { aliases, renderPageHtml } from './seo-html.mjs';

const directory = resolve(import.meta.dirname, 'dist/public');
const template = await readFile(resolve(directory, 'index.html'), 'utf8');
const types = {
  '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.txt': 'text/plain', '.xml': 'application/xml', '.json': 'application/json',
};

createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const path = pathname.replace(/\/+$/, '') || '/';
  if (Object.hasOwn(aliases, path)) {
    res.writeHead(308, { Location: aliases[path] }).end();
    return;
  }
  // Serve only known static assets. Never allow dot segments or an arbitrary
  // path to read files outside the build directory.
  if (extname(path)) {
    const file = resolve(directory, `.${path}`);
    if (!file.startsWith(`${directory}/`) || file === resolve(directory, 'index.html')) {
      res.writeHead(404).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const bytes = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      res.writeHead(404).end();
    }
    return;
  }
  const html = renderPageHtml(template, path);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : html);
}).listen(Number(process.env.PORT), '0.0.0.0');