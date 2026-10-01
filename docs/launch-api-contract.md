# DarkSwap Launch API contract handoff

The authoritative contract is `lib/api-spec/openapi.yaml`. All paths below have
the `/api` prefix. This is additive: existing swap/reward routes are unchanged.
The first release supports discovery and private preparation, **never execution**.
Every `executionAvailable` is the literal `false`; an admin cannot change it.

## Provider evidence and supported discovery

Initial bounded read-only GETs to
`https://www.stonkfun.xyz/api/public/v1/tokens?sort=newest&page=1` and
`https://www.stonkfun.xyz/api/public/v1/pairs?launchable=true` returned 200:
25 tokens, 157300 catalog entries / 6292 pages, network `mainnet-beta`; 532
pairs, `selectBy=mint`, 25 ambiguous symbols. These are temporary observations,
not hardcoded production totals or a permanent allowlist.

The owning agent additionally verified official `/developers` documentation and
its linked `/api/public/v1/openapi.json`, live provider-wide `q`, page/pageSize,
status and quote-mint filtering. The provider documents `sort=newest|volume`
(also marketCap, deliberately not exposed here), token statuses
`new|aboutToGraduate|graduated`, and q matching token name/symbol/mint.
Provider q matching case/prefix/fuzzy rules are **not** established.
Provider-wide search replaces the earlier page-only q proposal. Creator lookup
and pair-symbol search remain unavailable.

Provider tokens use `data.tokens`, `data.pagination`, `data.network` and
`meta.generatedAt`; pairs use `data.pairs`, `data.selectBy`,
`data.ambiguousSymbolCount` and `meta.generatedAt`. There is no verified
provider token-detail endpoint. Pair `mint` identifies the quote asset; token
`mint` identifies the base asset; `pool` is not the base mint.
Provider discovery does not prove creator attribution, holders, transactions,
fee/destination terms, financial authenticity, or launch execution permission.

### GET `/stonkfun/tokens` — `getStonkfunTokens`

Queries (reject unknown/unsupported queries):

| Field | Contract |
| --- | --- |
| `page` | integer 1–100, default 1 |
| `pageSize` | integer 1–100, default 25 |
| `view` | `trending|new|dark|near|graduating|graduated`, default trending |
| `sort` | optional `newest|volume`; omitted means volume for trending, newest otherwise |
| `q` | string <=120, default empty; forwarded to documented provider-wide name/symbol/mint search |
| `quoteMint` | optional base58 32-byte Solana quote identity |
| `status` | optional `new|aboutToGraduate|graduated` |

View graduating binds provider `status=aboutToGraduate`, graduated binds
`status=graduated`. Never recompute these from current market cap.
New is recency sorting, not an invented lifecycle filter.
DARK requires configured enabled, verified DARK network+mint and readiness;
then bind provider `quoteMint` to that mint. Unavailable DARK is an honest empty
activation state, not a ticker match. NEAR filters verified evidence-backed
quote mints; multiple-mint local filtering must disclose `current_page` scope.
Conflicting explicit status/DARK quote-mint filters are 400.
The provider-wide q scope does not make an additional local NEAR view exhaustive.

Success 200 is **flat**, not the upstream envelope:

```text
{
  tokens: StonkfunToken[],
  pagination: {page,pageSize,total,totalPages,returned,maxAccessiblePage},
  network: "mainnet-beta", view, q, sort,
  quoteMint: string|null, status: string|null,
  source: StonkfunSource, coverage: StonkfunCoverage
}
```

Provider pagination totals include upstream filters but precede additional local
view filtering. `returned` is actual normalized count. `maxAccessiblePage` is
min(provider totalPages,100), at least 1. Empty filtered pages are not provider
failure. Trending uses provider volume sorting, never market-cap-only ranking.

### Shared discovery shapes

`StonkfunSource`:
`{provider:"stonkfun", fetchedAt:ISO, generatedAt:ISO|null, stale:boolean,
cacheAgeSeconds:number>=0}`. Stale data must be labeled, not silently treated as
current. Respect provider 429/Retry-After; bound time, bytes and schema parsing.

`StonkfunCoverage`:
`{scope:"provider_page"|"indexed_catalog",
searchScope:"provider_catalog"|"none",
viewFilterScope:"provider_catalog"|"current_page"|"none",
creatorSearchAvailable:false, holderMetricsAvailable:false,
transactionMetricsAvailable:false, graduationStatusVerified:boolean,
rankingSignals:("provider_volume"|"provider_newest")[], warnings:string[]}`.
Documented status categories are verified; exact graduation algorithm is not.

`StonkfunToken` (every property required, missing evidence explicitly null):

```text
{
  mint, network:"mainnet-beta", pool:string|null, name, symbol,
  description:string|null, imageUrl:string|null,
  links:{website,x,telegram,discord,github}, // each string|null
  quote: null | {
    mint,symbol,name,logoUrl:string|null,category:string|null,
    categoryLabel:string|null,group:"dark"|"near"|"stablecoin"|"other",
    verified:boolean
  },
  launchpad:string|null, mode:string|null, quoteOnlyFees:boolean|null,
  transferFeeBps:number|null,
  metrics:{
    priceUsd,marketCapUsd,fdvUsd,volume24hUsd,liquidityUsd,peakMarketCapUsd,
    priceChange24h,holders,transactions,uniqueBuyers,holderGrowth
  }, // every metric number|null, holder/transaction/buyer counts integer|null
  status:string|null, graduationProgress:number|null,
  createdAt:ISO|null, graduatedAt:ISO|null, creatorWallet:string|null,
  darkPair:boolean, underReview:boolean, metadataSuppressed:boolean
}
```

Map provider `market` to `metrics`, `transferFee.bps` to `transferFeeBps`, and
`links.twitter` to `links.x` where verified. Transfer fees are **not launch fees**.
Resolve origin-relative provider image URLs against `https://www.stonkfun.xyz`,
preserving the query. Only safe HTTP(S) metadata links/images; no executable HTML
or unsafe URI schemes. Image/network availability is not guaranteed.
Missing creator/holders/transactions/buyers/growth remain null, never inferred
or rendered as zero. Preserve raw progress and unknown future status strings.
Provider `graduatedAt` may precede `createdAt`; neither is promised as immutable
on-chain launch time.

### GET `/stonkfun/pairs` — `getStonkfunPairs`

No local query parameters. Fetch documented upstream `launchable=true`; no
invented pair search/pagination. 200:
`{pairs:StonkfunPair[],network:"mainnet-beta",selectBy:"mint",
ambiguousSymbolCount:number,source:StonkfunSource}`.

Each pair has all properties:
`{mint,network:"mainnet-beta",symbol,name,decimals:number|null,
logoUrl:string|null,category:string|null,categoryLabel:string|null,
tokenProgram:string|null,launchable:boolean,launchLabReady:boolean|null,
symbolAmbiguous:boolean,group:"dark"|"near"|"stablecoin"|"other",
enabled:boolean,priority:integer1..10000,evidenceUrl:string|null,
executionAvailable:false,unavailableReason:string}`.

Local `enabled` means preparation-selection enablement, never executable.
Require both upstream `launchable===true` and `launchLabReady===true` for a
preparation choice. Missing readiness is unknown, not ready. Explicitly
false-ready pairs may appear but must be unavailable. Order verified DARK, NEAR,
stablecoin, other, then priority. The locked promotional DARK card comes from
config, **not a fabricated pair**.

Observed NEAR mint:
`3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG` is a Solana quote token, not
proof of native NEAR support/backing/redemption. Observed USDC is not automatically
NEAR. No DARK-symbol pair was observed; verified configured mint is authoritative,
not ticker presence/absence. Ecosystem grouping requires evidence, never symbols.

### GET `/stonkfun/tokens/{mint}` — `getStonkfunToken`

200 `{token:StonkfunToken,source:StonkfunSource,coverage:StonkfunCoverage}` from a
bounded persistent verified catalog. Unindexed mint: 404 `NOT_INDEXED`, not proof
of nonexistence. Use `NOT_FOUND` only with evidence of absence. Distinguish provider
failure (502/503). Do not invent an upstream lookup URL.

## Sessions and private operations

Cookie scheme: `darkswap_launch_session`, HttpOnly, SameSite, Secure under HTTPS.
Use same-origin credentials. Private responses use `Cache-Control: no-store`.
Every private/admin mutation requires allowed Origin and **`X-Launch-CSRF`**
containing the authenticated `csrfToken`. Auth challenge/verify require allowed
Origin and rate limiting rather than an already-authenticated CSRF token.
Cross-wallet resource IDs return 404. Administrator status is independently
server-enforced; missing admin allowlist/configuration denies access.

| Method/path | Operation ID | JSON / success |
| --- | --- | --- |
| POST `/launch/auth/challenge` | `createLaunchAuthChallenge` | `{wallet,network:"mainnet-beta"}` → 200 `{id,message,expiresAt:ISO}` |
| POST `/launch/auth/verify` | `verifyLaunchAuth` | `{id,signature}` → 200 `{wallet,csrfToken,expiresAt:ISO,isAdmin}` + session cookie |
| GET `/launch/auth/session` | `getLaunchAuthSession` | 200 same session fields, or wallet/csrfToken/expiresAt null and isAdmin false |
| POST `/launch/auth/logout` | `logoutLaunchAuth` | authenticated + CSRF → 204, revoke session and cookie |

Signature is canonical base64 of the 64-byte Ed25519 `signMessage` result (88
characters ending `==`). Sign exactly challenge UTF-8 message. Challenge is
expiring, single-use, wallet/domain/network bound. Authentication is not a launch,
fee, spending approval or transaction. Switching/disconnecting accounts clears
private query state and invalidates the prior wallet session/view.

### Drafts

`LaunchDraftInput` is the full replacement editable shape; all fields required:

```text
{
  name:"", symbol:"", description:"",
  website:"", x:"", telegram:"", discord:"", github:"",
  logoId:null, pairMint:null, network:"mainnet-beta", supply:"1000000000",
  allocations:{creator:0,developer:0,liquidity:100,community:0}
}
```

The above is a **default form configuration**, not mock catalog data. Drafts may
have incomplete identity. Name max80; symbol max16 `[A-Za-z0-9_-]*`; description
max2000. Social strings empty or valid HTTP(S), max500. Logo ID is owned, completed
private asset or null; pairMint valid Solana mint or null. Supply is a positive
integer decimal string, up to 78 digits. Allocations each numeric 0–100 and must
sum exactly 100; backend must implement the cross-field check.

`LaunchDraft` includes every input property plus:
`{id,wallet,status:"preparation-ready",executionAvailable:false,
unavailableReason,createdAt:ISO,updatedAt:ISO,incentives:LaunchIncentiveState}`.
Preparation-ready means saved preparation, **not complete launch readiness**.
Edits invalidate prior review/consent; neither save nor a selected pair proves
provider acceptance.

| Method/path | Operation ID | Success |
| --- | --- | --- |
| GET `/launch/drafts` | `getLaunchDrafts` | 200 `{drafts:LaunchDraft[]}` owned only, updated newest first |
| POST `/launch/drafts` | `createLaunchDraft` | full LaunchDraftInput → 201 LaunchDraft |
| GET `/launch/drafts/{id}` | `getLaunchDraft` | 200 LaunchDraft |
| PUT `/launch/drafts/{id}` | `updateLaunchDraft` | full LaunchDraftInput → 200 LaunchDraft |
| DELETE `/launch/drafts/{id}` | `deleteLaunchDraft` | 204 |

### Private direct logo uploads

There is **no raw `/launch/logos` upload endpoint**.

1. POST `/launch/logos/request-url` (`requestLaunchLogoUpload`):
   JSON `{name:string1..200,size:integer1..1048576,
   contentType:"image/png"|"image/jpeg"}` → 201 `{id,uploadURL}`.
2. PUT file bytes **directly to presigned `uploadURL`**, with declared
   `Content-Type`. Never use the filename as a storage key. URL is short-lived,
   private, and must not be saved in drafts or analytics.
3. POST `/launch/logos/{id}/complete` (`completeLaunchLogoUpload`), no request body
   → 200 `{id}` only after actual-byte size, magic, MIME, safe decoding/dimension
   checks and metadata-stripping re-encoding to a separate private safe object.
   Reject SVG, corrupt/missing/oversized images and decompression bombs.
   Completion is idempotent for an already validated owned ID.
4. GET `/launch/logos/{id}` (`getLaunchLogo`) → 200 safe image bytes
   (`image/png` or `image/jpeg`), authenticated owner only, private no-store and
   nosniff. Never serve unfinished uploads or original raw bytes.

### Creator

GET `/launch/creator` (`getLaunchCreator`) authenticated → 200:
`{wallet,drafts:LaunchDraft[],launches:StonkfunToken[],
metrics:{totalVolumeUsd,darkVolumeUsd,holders,feesUsd,referrals,darkPoints},
incentives:LaunchIncentiveState,warnings:string[]}`.
All metrics nullable; holder/referral counts integer. Launches require verified
creator attribution, currently absent from discovery; honest empty list.
Distinct-holder totals cannot be computed by summing token holders.

`LaunchIncentiveState` exact fields:
`{dark_pair:boolean|null,dark_points:number|null,referral_volume:number|null,
creator_score:number|null,campaign_eligible:boolean|null,
builder_eligible:boolean|null,state:"planned"|"unverified"|"under_review",
under_review:boolean}`. Missing evidence stays null. These are launch-specific,
not swap reward balances, active earning formulas or claimable value.

## Public config and protected administration

GET `/launch/config` (`getLaunchConfig`) and authorized GET
`/launch/admin/config` (`getLaunchAdminConfig`) both return `LaunchConfig`.
PUT `/launch/admin/config` (`updateLaunchAdminConfig`) is an admin+CSRF full
replacement `LaunchConfigInput`, returns 200 `LaunchConfig`, and appends audit.

`LaunchConfigInput` has all fields required:

```text
{
  darkPairingEnabled:boolean,       // default false
  darkTokenAddress:string|null,     // initially null
  darkPairSymbol:"DARK",
  darkPairPriority:integer1..10000,  // default 1
  nearPairingEnabled:boolean,       // default false
  pairOverrides:[{
    mint,network:"mainnet-beta",enabled:boolean,priority:integer1..10000,
    group:"other"|"near"|"stablecoin",evidenceUrl:HTTP(S)
  }],
  featuredPair:null|{mint,network:"mainnet-beta"},
  featuredMints:mint[], paused:boolean, banner:string|null,
  feeProposal:null|{amount:string|null,currency:string|null,notes:string},
  campaignProposal:null|{name:string,description:string,eligibilityNotes:string},
  pointsProposal:null|{name:string,description:string,formulaProposal:string}
}
```

Overrides max1000, featuredMints unique/max100. Banner plain max500; proposal
name max120, text max2000. Fee amount decimal string max80, currency max64.
No `dark` override group: verified configured DARK mint owns DARK grouping.
`executionAvailable` is **forbidden in config input**, not silently mutable.

`LaunchConfig` adds:
`{network:"mainnet-beta",executionAvailable:false,executionState:"unavailable",
unavailableReason,darkPairAvailable:boolean,darkPairMessage,
defaultView:"trending"|"dark",providerLaunchFee:null,
launchDestination:null,updatedAt:ISO}`.
DARK available requires current validated mint match, configured enablement and
both upstream readiness gates. Default view dark only when verified ecosystem
discovery is live. Locked copy:
“$DARK pairing is being activated for the DarkSwap ecosystem.”
Fee/campaign/points controls are **inactive local proposals**. They never create
upstream facts, charge fees, issue rewards or bypass capability gates.

### Reviews and audit

POST `/launch/admin/reviews` (`createLaunchAdminReview`) admin+CSRF:

```text
{
  targetType:"token"|"wallet",target:SolanaAddress,network:"mainnet-beta",
  reason:"malicious_metadata"|"self_referral"|"circular_activity"|
         "transaction_spam"|"suspected_wallet_cluster"|"other",
  evidenceUrls:HTTP(S)[],notes:string,suppressMetadata:boolean
}
```

Evidence 1–10 URLs/max1000 each; notes nonempty/max2000. Metadata suppression
only for token targets. 201 review adds
`{id,status:"under_review",createdBy:wallet,createdAt:ISO}`.
Flags block automatic eligibility/featured promotion; heuristics are not identity
proof. Suppression is local, not an upstream mutation.

GET `/launch/admin/reviews` (`getLaunchAdminReviews`) → 200
`{reviews:LaunchReview[],detectors:[{name,active:boolean,reason}]}`.
Detector names `self_referral|circular_activity|transaction_spam|wallet_cluster`;
absent evidence means inactive. Aggregate catalog alone does not establish these.

GET `/launch/admin/audit?limit=50` (`getLaunchAdminAudit`), limit integer1..100,
→ 200 `{records:[{id,actorWallet,action:"config_updated"|"review_created",
targetId:string|null,summary,createdAt:ISO}]}`, newest first.
Never include session secrets or join to private swap/marketing histories.

## Execution and errors

POST `/launch/submit` (`submitLaunch`) declares JSON `{draftId:string1..128}`.
**Every direct request returns 503**, even bad input/unauthenticated requests;
do not route this endpoint through earlier auth/body gates that change the
always-unavailable result. Body is for future intent shape only. Response:
`{error:string,code:"EXECUTION_UNAVAILABLE",executionAvailable:false}`.
No success response, transaction signature, fee collection or fabricated token.

Shared errors use `{error:string,code,executionAvailable:false}`.
Codes: `INVALID_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
`NOT_INDEXED`, `RATE_LIMITED`, `PROVIDER_FAILURE`, `STORAGE_UNAVAILABLE`,
`SERVICE_UNAVAILABLE`, `EXECUTION_UNAVAILABLE`.
Usual statuses 400/401/403/404/429/502/503; logo size rejection may use 413.
Discovery 429 honors Retry-After. Private-other-owner resource IDs are 404.

## Generated integration notes

Codegen: `pnpm --filter @workspace/api-spec run codegen`.
Generated files: `lib/api-client-react/src/generated/api.ts`,
`api.schemas.ts`, `lib/api-zod/src/generated/api.ts` and generated types.
Generation and its chained `typecheck:libs` completed successfully.

Frontend imports generated functions/hooks/types from `@workspace/api-client-react`;
server imports operation Zod schemas from `@workspace/api-zod`.
Query hooks are `useGetStonkfunTokens`, `useGetStonkfunPairs`,
`useGetStonkfunToken`, `useGetLaunchConfig`, `useGetLaunchAuthSession`,
`useGetLaunchDrafts`, `useGetLaunchDraft`, `useGetLaunchCreator`,
`useGetLaunchAdminConfig`, `useGetLaunchAdminReviews`, `useGetLaunchAdminAudit`.
Mutation hooks follow operation names (`useCreateLaunchDraft`,
`useUpdateLaunchDraft`, `useRequestLaunchLogoUpload`, etc.).

Pass CSRF through generated request options:
`{headers:{"X-Launch-CSRF":csrfToken},credentials:"same-origin"}`.
Orval does not turn header parameters into positional arguments.
Use `getLaunchLogo(id,{responseType:"blob"})` for private binary previews.
ISO timestamps are strings on the wire/client; generated Zod responses coerce
dates to Date, so serialize validated Date values normally.

**Backend enforcement beyond generated validation:** generated Zod objects do
not automatically enforce OpenAPI `additionalProperties:false`; apply `.strict()`
to request objects and explicitly reject unsupported nested fields. Cross-field
allocation sums, decoded address length, URL safety, mint/network evidence,
readiness, session/replay/role/CSRF/ownership and actual image checks must be
server-enforced. Do not rely on client state or configuration alone.