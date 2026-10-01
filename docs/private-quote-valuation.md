# Private quote USD valuation evidence

Checked September 28, 2026 using GET requests only.

- https://api-partner.houdiniswap.com/v2/openapi.json defines `QuoteV2.amountInUsd` as an optional number, with no string representation or required-field guarantee.
- https://docs.houdiniswap.com/developer-hub/core-concepts/tokens-networks documents `Token.price` as “Current USD price”.
- The v2 OpenAPI documents `GET /tokens/{id}` returning the token itself, keyed by its exact ObjectId. Its price is nullable. There is no price-specific timestamp or guaranteed freshness SLA in this contract; the implementation makes a new request rather than using cached catalog prices.
- Live native SOL → native ZEC provider quotes included numeric input/output amounts and output USD values, but omitted input USD values. Output USD is not an input valuation.
- After the fix, the development app’s GET token and quote endpoints returned eight accepted 1 SOL → native ZEC quotes, with input USD value 118.58 from the exact source token lookup. This is point-in-time quote evidence, not production deployment, execution, settlement, or shielding evidence.

Missing input USD permits the documented source-price path. Explicit invalid USD fields do not. Nonpositive/nonfinite prices, lookup failures, wrong token identity/chain, disabled tokens, amount mismatches, and nonfinite multiplication cannot authorize quotes. A valid value below $3 still gets rejected before a quote ticket is issued. No client-supplied price is accepted.

Regression command:

```sh
pnpm --dir scripts exec tsx --test ../artifacts/api-server/src/lib/private-quote-value.test.ts ../artifacts/api-server/src/routes/swap.test.ts
```

No chains were enabled, orders created, or funds transferred.

## Price freshness verification — deferred until live

Rechecked the public sources on September 28, 2026 with unauthenticated GET
requests only:

- The Tokens & Networks page still describes `price` as “Current USD price”.
  Its recommendation to refresh the bulk token catalog every 24 hours is not a
  price freshness guarantee.
- The live v2 OpenAPI `Token` schema makes `price` optional and nullable. It
  exposes `created` and optional `modified` date-time fields, but does not
  document either as the price observation/update time. No price-specific
  timestamp, stale-feed indicator, or maximum price age is specified.
- `QuoteV2.amountInUsd` is still optional, with no documented valuation
  timestamp. Quote validity is not proof of the age of its USD valuation.
- The [Partner FAQs](https://docs.houdiniswap.com/partner-faqs) do not define
  stale/unavailable price-feed behavior. The official
  [support page](https://docs.houdiniswap.com/faqs/contact-support) links to
  https://t.me/HoudiniSwapSupport_bot.

**Status:** Public-document verification is complete; direct provider
confirmation and any supported age validation are deferred until DarkSwap is
live, at the user's request on September 30, 2026. No support message has
been sent and no provider reply has been received. This deferral is not a
freshness approval. A successful token GET proves retrieval time, not the
age of the underlying market observation.

### Questions to send through the partner contact or official support

1. For `GET /v2/tokens/{id}`, what exactly does `price` contain when the USD
   feed is unavailable or stale: omitted, null, zero, an error, or the last
   known positive value? If the last value is retained, for how long?
2. Is a price-specific observation/update timestamp available? Please provide
   the endpoint, field name, format/units, timezone, and missing-value behavior.
   Does `modified` change on every price refresh, and can unrelated token
   metadata changes advance it without refreshing the price?
3. What maximum price age or freshness SLA is guaranteed? Are there
   token-specific differences, and is there a stale-feed status flag?
4. Does `QuoteV2.amountInUsd` use the same feed and freshness rules? Is its
   valuation timestamp available, and is it omitted/rejected when stale?

### Implementation boundary pending confirmation

No runtime behavior was changed. Existing invalid/missing-value rejection and
the $3 minimum remain in place. These checks do **not** establish that a
positive provider price is fresh; undetectably stale positive values remain
an unresolved provider-contract risk.

Do not substitute HTTP response time, local fetch time, quote expiry, or
generic token `modified` for a confirmed price timestamp. Once the provider
confirms the contract, record the reply and implement age validation if
supported, including rejection tests for stale, missing, malformed, and
unreasonably future timestamps. Keep the minimum at $3 and do not create
orders or transfer funds during verification.