# DarkSwap Launch — handoff to the other Replit project

## Scope and approval

The owner confirms that `https://darkswap.world` is hosted in a **different Replit
project** and chooses that domain as the new Launch preparation target.

Only preparation is approved. Do not replace the current live site, publish,
change DNS, change production configuration/storage permissions or apply schema
changes without explicit release approval. Keep `https://darkswap.app` and this
source project's root artifact unchanged.

Replit Agent works within its current project. A project link or custom-domain
URL does not let this session edit another project. Continue hosting preparation
in the editor of the project already serving `darkswap.world`.

## Transfer only the prepared package

The curated `exports/launch-world-handoff.zip` contains:

- `frontend/public/`: production root-built Launch assets and HTML template;
- `frontend/server/`, `frontend/serve.mjs`, `frontend/seo-config.json` and
  `frontend/package.json`: bundled Node SSR renderer and target-specific settings;
- `frontend/nginx.conf.template`: proposed restricted API gateway, **not a
  validated or installed Replit configuration**;
- `frontend/standalone-manifest.json` and `frontend/README.md`: target and
  preparation-only status;
- `docs/`: this handoff, the release/serving instructions and API contract.

Download this archive from this project's Files panel, then upload it into the
other project. Extract it into a new, isolated directory. Do not overwrite that
project's files, root routing or deployment settings on extraction. Do not
transfer the entire source workspace, secrets, private uploads or database data.
The frontend export is compiled client/SSR output, not the editable monorepo source.
Future frontend changes should be built here and exported again.

The package needs both its loopback SSR renderer and a real backend gateway.
Merely uploading `public/` or setting a custom domain does not enable page SSR,
wallet sessions, drafts or uploads. Older static-only handoff ZIPs are superseded;
use the refreshed archive with manifest `schemaVersion: 2`.

## Prompt for Agent in the destination project

> Prepare this project to serve DarkSwap Launch at https://darkswap.world using
> the uploaded launch-world-handoff.zip. Preparation only: do not publish,
> replace the live site, change DNS or production settings, or apply database
> changes. Inspect the existing project and hosting configuration first. Extract
> the package into an isolated directory without overwriting existing files.
> Read docs/launch-standalone-deployment.md, docs/launch-release.md,
> docs/launch-api-contract.md and the preparation manifest.
>
> Preserve a recovery path for the current site before proposing its replacement.
> The original https://darkswap.app and its shared API/database/storage remain
> in the source project; do not duplicate its API workers, secrets or data here.
> Inspect the suggested Nginx template, but do not assume this project's current
> hosting can run it unchanged. Any artifact configuration changes must use the
> validated artifact workflow rather than direct edits.
> The updated package requires a supervised loopback Node SSR process alongside
> the gateway. Configure LAUNCH_SSR_PORT and a verified LAUNCH_PUBLIC_API_ORIGIN;
> do not replace SSR with a static HTML fallback. Preserve all public information
> routes including /docs, /terms, /privacy and /risk.
>
> Verify a restricted same-origin /api gateway to the source project's
> Launch-only /launch/api ingress. The backend must receive Host: darkswap.world,
> effective protocol https, and the unchanged browser Origin, cookies, CSRF and
> fetch-site headers. Preserve verified upstream TLS and meaningful client-IP
> limits. Proxying normally to darkswap.app is not proven to preserve that Host.
> Do not weaken backend origin checks or trust arbitrary forwarded-host headers.
> If managed ingress cannot satisfy the contract, report the blocker and propose
> a separately reviewed topology rather than claiming auth works.
>
> Keep all actual execution unavailable. Do not claim the target is live or
> verified from a workspace/local build. After preparation, report exactly which
> hosting and source-project backend changes still need separate approval.

## Responsibilities that remain in the source project

- Review any proposed API ingress/trust change independently.
- Propose `LAUNCH_ALLOWED_ORIGINS=https://darkswap.world` in production, but do
  not apply it before release authorization.
- Keep administrators denied by default unless independently authorized.
- Review the full managed Publish schema diff and private storage/CORS.
  Earlier read-only checks found no production Launch tables; recheck before
  release rather than assuming that observation remains current.
- Do not migrate production schema by script or copy provider/database secrets
  into the frontend project.

## What counts as completion

This handoff is not completion of live-domain verification. After both projects'
changes and any domain updates receive approval, run the real HTTPS acceptance
checklist in `launch-standalone-deployment.md`: routing, DNS/TLS, secure cookies,
wallet isolation, draft create/edit/delete, owner-only browser uploads, admin
denial, unavailable execution, and preservation of the original DarkSwap site.
Return sanitized findings from the destination project to the source project.
Do not include cookie values, wallet proofs or signed storage URLs in that report.