# Canvas retired marketing claims

Run `pnpm --filter @workspace/mockup-sandbox run check:claims` or the
`retired-claims` validation workflow. Canvas development startup and builds
also run the check.

Maintain the list in **scripts/retired-marketing-claims.json**. Add a phrase to
`retiredPhrases` when it is retired. Matching is case-insensitive and tolerates
whitespace and line wrapping. The scanner checks source, text assets, and
documentation throughout `artifacts/mockup-sandbox`, excluding dependencies,
generated output, caches, and artifact metadata. It is a source-text guard,
not a rendered-copy or image OCR check.

Prefer custody-fact copy such as “Creating an order moves no funds.”
If a retired phrase is necessary in a factual explanation, review it and
add an `allowedContexts` entry with the exact relative file, complete factual
text, and reason. Exceptions cover only the first exact occurrence of that
text in that file, never an entire file or a phrase everywhere.
Remove obsolete exceptions when their factual explanation is removed.

Run regression tests with
`pnpm --filter @workspace/mockup-sandbox run test:claims`.