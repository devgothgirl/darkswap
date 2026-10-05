# Separate Launch frontend: preparation and release gate

## Authorization and current status

The owner approved **preparation of a separate deployment only**. No publishing,
DNS/TLS changes, production environment changes, schema changes, or replacement
of the existing DarkSwap root were authorized. This is not a live-domain signoff.

Read `launch-release.md` and `launch-serving-verification.md` alongside this file.
The existing workspace Launch and API artifact configurations remain unchanged.
Launch stays at `/launch/` here; DarkSwap still owns `/`.

**Current selected target: `https://darkswap.world`.** The owner confirmed that
Launch should be prepared to replace the site currently at that root, rather than
use `launch.darkswap.app`. This changes the preparation target only; actually
replacing the live site remains unauthorized. Preserve `https://darkswap.app/`.

Read-only observations on 2026-10-01:

- Deployment service: `https://darkswap.app`, public autoscale, successful build;
  additional URL `https://solana-privacy-swap.replit.app`.
- DNS lookups for `launch.darkswap.app` returned `ENOTFOUND` for CNAME, A and
  AAAA. HTTPS could not resolve the host. No TLS or browser claim is possible.
- Production configuration lookup found neither `LAUNCH_ALLOWED_ORIGINS` nor
  `LAUNCH_ADMIN_WALLETS` configured.
- Production secret-existence lookup confirmed storage and database settings
  exist, **not their values, permissions, bucket privacy, or runtime health**.
- A read-only production schema query found no `public.launch_*` tables.
  The schema-diff helper was unavailable in this session; the complete
  development-to-production diff remains unreviewed.

These are dated observations, not assumptions for a future release.

### Subsequent read-only domain check

After the owner supplied `https://darkswap.world` as a proposed hosting target,
another read-only check on 2026-10-01 found:

- `darkswap.world` resolves and returns HTTPS 200 with the HTML title
  `DarkSwap — NEAR Markets & Wallet-Approved Swaps`. HTTP redirects to HTTPS.
  It is not an empty hostname; replacing its current site requires clarification
  and explicit release approval. A public domain URL does not identify the
  separate hosting project or establish administrative access.
- The deployment service now lists `https://launch.darkswap.app` as an additional
  URL of the existing public deployment. HTTPS requests to both its root and
  `https://darkswap.app/` return 200 with the title
  `DarkSwap | Solana-origin private swaps`, not the Launch frontend title.
  This supersedes the earlier unresolved-DNS observation but does **not** verify
  correct Launch routing, sessions, storage or browser behavior.
- `darkswap.world` is not listed among this project's deployment URLs. Its
  independent hosting configuration has not been identified or changed.

The owner subsequently confirmed `darkswap.world` as the preparation target.
The source gateway and proposed API origin now use that exact hostname. The
owner then confirmed that it is hosted in a different Replit project. Work in
that hosting project must continue from its own editor/Agent session; the public
domain does not grant this session access to that project. No publication or DNS
change was performed during these checks. See `launch-world-handoff.md`.

## Chosen topology

Prepare a separate frontend hosting target/project, not another root artifact
in this project:

```text
Browser → HTTPS darkswap.world
           ├─ assets → root-built Launch public/ bundle
           ├─ pages, robots, sitemap → loopback Node SSR renderer
           └─ /api/… → restricted gateway → verified shared API ingress
                                                /launch/api/…
```

The API, managed database and private storage remain in their existing project.
Do not copy database/provider secrets into the frontend host. Do not start a
second copy of the shared API: its startup also runs existing background workers.
An extra custom domain on this workspace is not hostname-specific artifact
routing. Replit's separate-project guidance:
https://docs.replit.com/features/projects-and-artifacts/multiple-artifacts-vs-projects

### Blocking ingress contract

Wallet authentication binds sessions and challenges to
`req.protocol + "://" + Host`. It intentionally does **not** trust
`X-Forwarded-Host` as a replacement. The backend must see:

- `Host: darkswap.world`
- effective protocol `https`
- unchanged browser `Origin`, including absence on GET
- unchanged cookies, CSRF header and fetch-site header.

The upstream TLS connection must still verify the certificate for the **actual
upstream ingress hostname**, not disable certificate checks to preserve Host.
Managed ingress may reject a Launch Host or overwrite it. A normal proxy to
`https://darkswap.app` is therefore **not an approved working solution**.
An owner-provided upstream endpoint that supports this contract is still needed.
Do not use this template against darkswap.app merely because it resolves.

If the selected host cannot provide this contract, stop and obtain approval for
a different ingress or a separately reviewed Launch-only backend trust design.
Do not weaken origin checks, trust arbitrary forwarded-host headers, or change
the shared API's global `trust proxy` to make sign-in pass.

The shared API currently trusts one hop. Document every TLS terminator/proxy
between browser and API. Confirm client-IP behavior and enforce meaningful
per-client edge limits without trusting caller-supplied forwarding headers.
The supplied template discards forwarding chains; until a trusted real-IP
configuration is reviewed, multiple users may share an edge IP and its limits.

## Build a portable frontend package

From the repository root:

```sh
node scripts/src/prepare-launch-standalone.mjs --help
node scripts/src/prepare-launch-standalone.mjs
```

The default output is the ignored `.local/launch-standalone-world/` directory.
The earlier `.local/launch-standalone/` export is superseded and must not be
deployed; it was prepared for the old subdomain. Existing output is never
silently overwritten.
Use `--outDir` for a different **new** output directory. The script refuses to
overwrite existing content, builds with production `BASE_PATH=/` into temporary
storage, and exports frontend assets, a self-contained SSR bundle/runner, a
target-specific SEO config, a preparation manifest, instructions, and the
gateway template. It does not alter managed `dist/public` or `dist/server`, artifact
routing, running workflows, environment settings, database or DNS.

The package is a **hosting input**, not a new Replit project or a deployed service.
Upload/copy only that package into the independent frontend host. If that host
builds from source instead, preserve the monorepo dependencies and run the dedicated
exporter. It validates source route classification, then invokes Vite directly
for both client and SSR with isolated output directories and a standalone config.
Do not append `--outDir` to the artifact's chained build script: it would reach
only the last command and overwrite managed client output. The standalone config
overrides canonical origin/base in memory for both bundles; it never edits the
source `seo-config.json`.
Never modify this workspace's `/launch/` setting to generate a root build.

### Separate frontend runtime

The current frontend requires SSR; do not deploy a static `index.html` fallback
as a substitute. The export includes `serve.mjs`, `server/entry-server.js`,
`seo-config.json` and a module-only `package.json`, with SSR dependencies bundled.
Keep these files outside `public/`.

Run `node serve.mjs` from the exported frontend directory under the target
project's process manager, with:

- `LAUNCH_SSR_PORT`: a distinct internal listener port; the server binds loopback.
- `LAUNCH_PUBLIC_API_ORIGIN`: an exact, verified HTTPS origin serving the source
  project's public `/api/stonkfun` and `/api/launch/config` endpoints.

These are renderer settings, not browser API routing. Public SSR requests never
forward incoming cookies, proofs or authentication headers. Private browser APIs
still require the authority-preserving gateway contract above. A working public
SSR API origin does not prove that private ingress works.

The gateway listens on the target platform's `PORT` and routes recognized page,
robots and sitemap requests to the internal `LAUNCH_SSR_PORT`. It serves assets
from `public/`, denies missing assets/unknown paths, and routes allowlisted browser
APIs separately. Both processes need supervised startup/shutdown in the destination
project. This source project's managed workflows are not changed.

## Restricted gateway template

`deploy/launch-standalone/nginx.conf.template` is a proposed Nginx configuration,
not an active workspace service. It is not automatically installed by the export.
It requires an Nginx-capable host behind a trusted HTTPS edge; a static-only
hosting plan is insufficient unless it supplies equivalent verified API routing.

The template:

- restricts API methods and paths, forwarding only to `/launch/api/…`;
- denies unrelated swap, marketing, rewards and arbitrary proxy requests;
- keeps submit unconditionally unavailable, with no backend execution request;
- preserves session/CSRF and binary responses and separate `Set-Cookie` headers;
- disables proxy caching, retries and redirects and verifies upstream TLS;
- renders explicit direct page routes, including `/docs`, `/terms`, `/privacy`
  and `/risk`, with missing assets returning 404;
- adds private-page noindex and no-store headers and disables access logging.

On the independent host, supply these named placeholders:

| Placeholder | Required value |
| --- | --- |
| `PORT` | That host's assigned listener port |
| `LAUNCH_SSR_PORT` | Internal loopback Node renderer port, distinct from `PORT` |
| `PUBLIC_DIR` | Absolute path to exported `public/` |
| `RUNTIME_DIR` | Writable private runtime directory, with `client_temp` and `proxy_temp` children |
| `LAUNCH_UPSTREAM_HOST` | Verified API ingress DNS hostname only; no scheme/path/credentials |
| `CA_CERTIFICATES_FILE` | Host's maintained CA certificate bundle path |
`LAUNCH_UPSTREAM_HOST` also sets TLS SNI/certificate verification. Substitute
only the named `${…}` placeholders; do **not** expand Nginx variables such as
`$request_uri` and `$http_cookie`. Paths and hostnames must be operator-controlled
and correctly quoted for Nginx, never taken from browser input.

Before running, validate the rendered config with `nginx -t -c <absolute-config>`.
Run it with `nginx -c <absolute-config> -g 'daemon off;'` under that host's process
manager. Bind to the platform `PORT`; do not start a duplicate workflow here.
Health checks must use the intended Host and trusted HTTPS-forwarded headers.
`/healthz` checks the gateway only, not renderer, API, storage or database readiness.

Only the trusted edge may reach the plaintext listener. It must redirect public
HTTP to HTTPS, reject alternate hosts, and overwrite forwarded headers. The
template's header check is **not** a substitute for network isolation.
Configure exact trusted edge addresses for real-IP recovery at the independent
host, then verify what the API actually receives. Do not broaden shared backend
proxy trust. Fail the release if client-IP rate limits can be spoofed or all
clients unexpectedly share a limiter.

Nginx is not installed in this workspace. This template must undergo syntax and
real-ingress testing on the selected host; bundle generation is not that test.

## Production settings and managed data

These settings are proposed, **not applied**:

| Where | Setting / action |
| --- | --- |
| Existing API, production only | `LAUNCH_ALLOWED_ORIGINS=https://darkswap.world` exactly; no wildcard, path, trailing slash or development origin |
| Existing API, production only | Leave `LAUNCH_ADMIN_WALLETS` unset/empty to deny all admin access unless the owner independently authorizes specific public wallets |
| Existing API | Keep managed private storage attached; never copy its secrets to frontend hosting |
| Independent frontend | Root-built assets and the reviewed restricted same-origin gateway |
| Existing managed database | Review the complete schema diff in Publish; apply only through that owner-approved flow |

Do not add startup/build DDL, migrate via a custom script, copy development data
over production, or silently accept destructive schema changes. Launch schema is
defined in `lib/db/src/schema/launch.ts` and `launch-catalog.ts`. Review **all**
pending project changes, not just Launch tables, before approving publication.
No production Launch tables were visible during preparation, so wallet proofs,
drafts and related features must not be described as production-ready.

For storage, verify bucket IAM/public access and raw as well as sanitized logos
remain private. Keep the existing wallet authentication/ownership rules. Confirm
CORS permits the exact Launch HTTPS origin and necessary signed PUT headers,
without replacing rules other products need. Do not proxy arbitrary upload URLs
through the frontend gateway or make the private directory publicly readable.
Record only pass/fail evidence; never persist signed URLs or wallet proofs.

## Owner-approved release sequence (not authorized yet)

1. Owner identifies/creates the independent hosting project, with reviewed
   gateway support, access and cost. Confirm the ingress contract above.
2. Verify rendered gateway syntax and behavior against an isolated backend,
   including preservation of Host, Origin, CSRF, cookies and binary logo bytes;
   unknown APIs/methods and ambiguous paths must not reach the backend.
3. Review the complete managed production schema diff, exact environment settings,
   storage privacy/CORS and admin default-deny. Request explicit approval for the
   existing API publication and any required settings/storage changes.
4. Obtain separate explicit approval to replace the existing `darkswap.world`
   site, publish the independent frontend, and make any specifically reviewed
   DNS changes for that domain. Preserve/export its current hosting configuration
   and DNS records to support recovery before replacing anything. Use the host's
   actual domain setup values; do not invent CNAME/A/TXT targets or change mail,
   www, `darkswap.app` or `launch.darkswap.app` records. Approve apex changes
   individually if the chosen host requires them.
5. After approved publishing/domain setup, verify DNS, certificate hostname,
   validity and chain, HTTP→HTTPS redirect and root host isolation.
6. Run the real HTTPS acceptance checks below. Until they pass, report the release
   as unverified; if any gate fails, do not widen permissions to make it pass.

### Real HTTPS acceptance checklist

- [ ] `https://darkswap.app/` remains the existing swap app, without Launch assets
      or redirects. Existing API gates remain intact.
- [ ] `https://darkswap.world/` serves Launch instead of the previous swap site,
      under the separately approved replacement plan.
- [ ] Launch `/`, `/explore`, `/create`, `/creator`, `/admin` and a discovered
      token's direct URL render after fresh navigation/reload.
- [ ] Root assets load; a nonexistent script is a non-HTML 404.
- [ ] Real `/api/stonkfun/tokens`, `/api/stonkfun/pairs` and
      `/api/launch/config` return expected JSON, not an SPA or proxy error.
- [ ] Swap, rewards, marketing and unknown API routes are denied at Launch.
- [ ] Browser message proof creates a session with host-only cookies, `Secure`,
      `HttpOnly`, `SameSite=Strict`, `Path=/`; multiple cookies survive proxying.
      No transaction signing or funds are involved.
- [ ] Missing/wrong Origin, missing/wrong CSRF, cross-site requests, replayed
      proofs, stale sessions and a mismatched Host are rejected.
- [ ] Create/save/edit/reload/delete an explicitly designated test draft.
      Wallet switch, logout and another wallet cannot read it.
- [ ] In the real browser, request a test PNG upload, PUT directly to its signed
      storage URL, complete, save and reload. Confirm private image bytes render
      only for the owner. Deny anonymous/cross-wallet access; confirm raw and
      sanitized objects cannot be fetched publicly.
- [ ] Non-admin wallet cannot read/write admin APIs. No admin is implicitly
      granted by connecting a wallet; test an allowlisted admin only if separately
      authorized.
- [ ] No-store/noindex headers reach private pages and responses. Logging and
      proxy caches do not retain proofs, cookies or signed upload URLs.
- [ ] Upstream failure is explicit; no POST retries or stale private data are
      served. Actual client IP and protocol meet the reviewed proxy trust model.
- [ ] Submit remains unavailable; no execution, token creation, fees or payouts.

Record timestamps, hostname, deployed version, sanitized statuses and checks
actually performed. Local bundle tests, workspace screenshots and the previous
modeled serving harness do not replace this acceptance record.

## Preparation verification performed

On 2026-10-01:

- `node --test scripts/src/prepare-launch-standalone.test.mjs`: 12 passed using
  isolated build doubles; covers output protection, environment filtering,
  failed-build cleanup, export contents and CLI behavior.
- `node scripts/src/prepare-launch-standalone.mjs`: real production root build
  succeeded and exported `.local/launch-standalone/`. Existing non-fatal
  UI-library sourcemap and bundle-size warnings remain.
- Checked the actual export's root asset references, preparation-only manifest
  and byte-for-byte gateway-template copy.
- Workspace `/launch/` returned HTTP 200 and its unchanged homepage rendered in
  a screenshot. The browser logged two resource 403s; this observation is not a
  clean end-to-end/API verification and no custom-domain browser test was run.
- No managed workflow or artifact configuration changed. No production
  environment, storage, schema, publishing or DNS change was made.

Remaining release prerequisites: access from the separate hosting project's own session; a verified
authority-preserving upstream; rendered gateway validation; owner-authorized
production configuration/schema/storage changes; publishing/DNS approval; and
the real HTTPS acceptance checklist. Live-domain verification has not been
completed by this project.

After the owner confirmed the `darkswap.world` target:

- Updated the gateway's exact Host checks and forwarding authority, proposed
  `LAUNCH_ALLOWED_ORIGINS`, release instructions and export metadata.
- `node --test scripts/src/prepare-launch-standalone.test.mjs`: 13 passed,
  including the selected-hostname regression check.
- The actual root production build succeeded again, exporting
  `.local/launch-standalone-world/` without overwriting the old package or
  managed preview assets. The existing non-fatal build warnings remain.
- Verified the exported manifest identifies `https://darkswap.world`, marks
  live replacement as unapproved, and includes the exact updated template.
- No running service, production setting, domain or live site was changed.
  The owner subsequently identified the host as a different Replit project.
  Its hosting changes and checks must be performed from that project's session.

## Owner-requested handoff closure

The destination project is named **Launch Terminal**. The owner reported
"done this is finished" after the archive handoff instructions and requested
closure of this work. The completed scope is the preparation and handoff for
`darkswap.world`, not the original full live-domain verification.

The accessible top-level copy is `LAUNCH-TERMINAL-HANDOFF.zip`; the curated
archive was also provided at `exports/launch-world-handoff.zip`. This closure
does not establish that the other project imported or deployed the package, or
that routing, cookies, production schema, storage and browser uploads passed.
No publishing or DNS approval is inferred from the owner's completion message.

### Handoff refreshed for current SSR build

The original static-only ZIP was generated before the Launch frontend gained SSR.
The export path now builds client and bundled SSR separately using an isolated
standalone Vite configuration. The gateway forwards every classified page,
including `/docs`, `/terms`, `/privacy` and `/risk`, to the bundled renderer.
Do not use the older static-only archive.

Verification of the refreshed export:

- Exporter unit suite: 13 passed, including source-route/gateway coverage.
- Standalone renderer suite: 16 passed (request parsing, private/error headers,
  methods, SSR composition, fixed anonymous API origin and failure handling).
- `node scripts/src/verify-launch-standalone.mjs --outDir .local/launch-standalone-world-ssr`
  passed against the **real current client and SSR builds**. It verified all
  exported assets and rendered seven information/private routes with root
  `darkswap.world` canonicals from an isolated directory outside the monorepo.
- The integration regression compared before/after hashes, modes and mtimes for
  managed build files, and checked source SEO and artifact routing configurations.
  They were unchanged. Existing non-fatal build warnings remain.
- The curated handoff archives are refreshed from this SSR export (manifest
  `schemaVersion: 2`). The export contains no backend credentials or database data.

This strengthens the local preparation evidence only. Nginx syntax on the
destination host, actual API ingress and all real-domain checks remain release
gates, not claimed successes.