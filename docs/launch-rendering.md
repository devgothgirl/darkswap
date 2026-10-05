# DarkSwap Launch rendering runtime

The Launch artifact is served by `artifacts/darkswap-launch/serve.mjs`. Development
uses Vite in middleware mode: page requests are transformed with
`transformIndexHtml`, and `src/entry-server.tsx` is loaded through
`ssrLoadModule`. Production uses the built `dist/public/index.html` template and
imports `dist/server/entry-server.js`. Its `render(relativePathIncludingQuery,
apiOrigin)` export supplies the HTML body, head markup, serialized state, and
HTTP status; the server inserts those into `#root`, `<!--page-head-->`, and
`<!--page-state-->`.

Build the client and SSR entry using the artifact's build command, then run
`node serve.mjs --production` with `NODE_ENV=production`, `PORT`, and
`BASE_PATH=/launch/` set. The normal development command is `node serve.mjs`;
it also requires `PORT` and `BASE_PATH`. The server binds `0.0.0.0:$PORT`.
Production loads only the build output at runtime; Vite is loaded for
development middleware only.

`src/seo-config.json` is the canonical origin and route-policy source. Production
passes that configured origin to SSR; development passes
`https://${REPLIT_DEV_DOMAIN}` for API reads. The HTTP `Host` header is never
used to construct canonical URLs. SSR receives only the API origin, not incoming
cookies or other request headers. Public page HTML is always `no-store` so
moderation and page-specific visibility decisions are refreshed on every
request. Hashed build assets may be cached immutably; other static assets have a
short cache lifetime. Missing asset paths return 404 rather than the application
shell, and decoded traversal paths cannot escape the static directory.

The server generates `/launch/robots.txt`, including disallows for the configured
private routes and API path, and points its sitemap directive at the canonical
`https://darkswap.app/launch/sitemap.xml`. Sitemap requests call the SSR
entry's async `sitemap(apiOrigin)` export. That export must use bounded, fresh
public data; its successful response is cached for at most 60 seconds. If
required public data is stale or unavailable, the endpoint returns 503 rather
than an empty or stale sitemap or an HTML page shell.

## Coordinate with the domain-root robots file

Robots rules are discovered from the domain root. Publishing
`/launch/robots.txt` does not replace or automatically update
`https://darkswap.app/robots.txt`. The root-site robots generator and checked-in
file also advertise the canonical Launch sitemap URL:

```text
Sitemap: https://darkswap.app/launch/sitemap.xml
```

Keep the launch sitemap bounded to currently fresh public routes; do not list
private pages, query-string variants, stale catalog entries, or routes whose
data cannot be safely verified.

The token subset is deliberately bounded to the first 100 newest public catalog
records, deduplicated and filtered for substantive identity/facts, mainnet,
freshness and moderation eligibility. This is not a claim to index the entire
provider inventory. Page rendering reads current detail data independently and
marks reviewed, suppressed, stale, unavailable and unknown tokens noindex.
Private routes and filter/search URL combinations are never sitemap entries.

Canonical URLs use the verified primary origin `https://darkswap.app` and its
observed `/launch/` mount. A deployment alias alone does not verify that the
Launch artifact is correctly mounted at that alias's root. A future root-host
move must update the canonical configuration, service base and API ingress
together and pass serving checks before publication.

## Verification

Run the build, `pnpm --filter @workspace/darkswap-launch run typecheck`, and
`pnpm --filter @workspace/darkswap-launch run seo:test`. Build-time route checks
reject unclassified routes or a base-path mismatch. The rendering tests cover
public HTML, metadata, accessible regions/headings/filter buttons, public-only
state, excluded routes and unavailable/stale discovery data.