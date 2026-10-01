# Launch serving and isolated regression verification

## Production serving harness — passed

Executed after the frontend implementation completed:

```sh
node scripts/src/verify-launch-serving.mjs
```

Optional single-scenario invocations:

```sh
node scripts/src/verify-launch-serving.mjs --scenario=prefix
node scripts/src/verify-launch-serving.mjs --scenario=root
```

The script builds the actual `@workspace/darkswap-launch` artifact twice, with
`NODE_ENV=production`, explicit `BASE_PATH=/launch/` or `/`, and an available
explicit `PORT`. It appends `--outDir` pointing at a separate temporary directory
for each build, avoiding the artifact's managed preview output. Each scenario
starts a **one-off child-process static test server** on that same test port,
checks responses, terminates the process and removes its temporary build.
No workflow, Vite configuration, runtime artifact TOML or application source is
modified. No provider or funded requests are made.

Checks in each scenario:

- Production build succeeds with the supplied environment.
- Built HTML has DarkSwap Launch title and nonempty description, `og:title` and
  `og:description` metadata, plus its SPA mount.
- Direct homepage, `/explore`, `/create`, `/creator`, `/admin`, and a
  `/token/:mint` URL return the **exact built SPA shell**, without needing a prior
  client navigation. Under `/launch/`, all those paths have that prefix.
- Prefix `/launch` redirects to `/launch/`, while outside-root `/explore` and
  lookalike `/launch-other/explore` paths remain outside this artifact.
- A clearly test-only `/api` JSON sentinel runs **before** the SPA fallback,
  including in the root-mounted scenario. `/api/launch/config` is a test 404 JSON
  response, not a fabricated real config response.
- Missing JavaScript returns 404, not an HTML shell.
- Local script/stylesheet/modulepreload/icon HTML references have the proper
  prefix and are served with non-HTML content types.
- All built JavaScript/CSS files are served, and production text assets contain
  no literal `https://www.stonkfun.xyz/api/public/v1` discovery base URL.

### Scope limitations

This verifies generated build assets and a **modeled static hosting/SPA/API
ordering arrangement**, not the deployment's actual reverse proxy or the live
API backend. It does not prove custom-domain DNS/TLS, subdomain API ingress,
browser hydration, wallet interactions, UI route rendering or per-route runtime
metadata/noindex. The token-route check is a shell fallback check, not an assertion
that its mint is indexed. The provider check is a static literal URL scan, not
proof against dynamically constructed or obfuscated URLs. No browser testing is
performed. API sentinel objects are explicit test fixtures only.

Both scenarios passed: 13 prefix checks and 12 root checks. The production builds
reported non-fatal UI-library sourcemap warnings and a bundle-size warning.
These checks do not establish real custom-domain ingress behavior.

Harness preparation checks actually executed successfully:

```sh
node --check scripts/src/verify-launch-serving.mjs
node scripts/src/verify-launch-serving.mjs --help
pnpm --filter @workspace/scripts run typecheck
```

These establish syntax/help/package typecheck readiness, not production build
or serving success.

## Existing product regression checks actually executed

Before these checks, API-server dependencies were import-resolved successfully
for `express`, `drizzle-orm`, `zod`, `cookie-parser`, `@google-cloud/storage` and
`sharp`. PostgreSQL `initdb`/`pg_ctl`/`psql` were available.

### Order recovery, including swap and NEAR route regressions

```sh
pnpm --filter @workspace/api-server run test:order-recovery
```

**PASS: 7 tests, 0 failed, 0 skipped.**
The existing script unsets the workspace `DATABASE_URL`, initializes a temporary
PostgreSQL database on a temporary port with its isolated test schema, runs the
tests, then shuts down/removes that database.
Coverage includes exact-match Houdini recovery, no/multiple/mismatched order
rejection, NEAR history/status reconciliation, saved quote/history requirements,
storage-failure deposit withholding, NEAR memo handling, and quote USD minimum
enforcement. Provider behavior is mocked by the existing tests.

### Rewards authorization and concurrency

```sh
pnpm --filter @workspace/api-server run test:rewards
```

**PASS: 4 tests, 0 failed, 0 skipped.**
The existing script likewise uses a temporary isolated PostgreSQL test database.
Coverage includes linked-email handling, numeric Houdini terminal statuses,
concurrent duplicate/cap/terminal decision enforcement, and fail-closed bearer
order requests when rewards configuration is disabled.

### Separate route-unit run

```sh
env -u DATABASE_URL pnpm --dir scripts exec tsx --test \
  ../artifacts/api-server/src/routes/near.test.ts \
  ../artifacts/api-server/src/routes/swap.test.ts \
  ../artifacts/api-server/src/routes/near-trends.test.ts
```

**PASS: 3 tests, 0 failed, 0 skipped.**
Coverage: NEAR memo recovery validation, swap quote USD-minimum enforcement, and
NEAR search validation, search beyond the initial feed, normalized-cache reuse.
This run uses mocked providers; the swap/NEAR tests supply non-production database
configuration and perform no database operations.

These isolated regression commands did not change production schema/data or make
live funded provider requests. The parent implementation separately started the
managed preview workflows and performed live read-only discovery/API smoke checks.