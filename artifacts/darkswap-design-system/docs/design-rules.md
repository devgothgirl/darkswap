# DarkSwap design rules

The decisions behind the tokens, and the rules a consuming artifact inherits
when it adopts this system. Read this alongside the platform guide for whatever
you are building (`consuming-web.md`, `consuming-expo.md`,
`consuming-slides.md`).

The evidence these rules were derived from is retained in
`docs/references/`, with a manifest in `docs/references/README.md`.

## How a consumer adopts the system

1. Add `@workspace/darkswap-design-system` as a `workspace:*` dependency and run
   `pnpm install`. Never copy token values or component source into the app.
2. Import the theme once, at the app's CSS entry:
   `@import "@workspace/darkswap-design-system/styles.css";`
3. Put `class="dark"` on the root element and keep it there. Dark is the
   default (see below), not an opt-in.
4. Import primitives from `@workspace/darkswap-design-system/components/ui/...`
   rather than keeping a local copy. A freshly scaffolded app that still has its
   own `components/ui/` counts as a migration — follow `migrating-web.md`.
5. Render one primitive and run the consumer's typecheck and dev server before
   migrating anything else.

Product data, routing, application state, and product-specific compositions stay
in the app. Only product-agnostic visual primitives belong in this package.

Migration is deliberately out of scope for the system's own release: the main
site, the launch app, the API preview, and the canvas sandbox are untouched and
are migrated one artifact at a time, each as its own piece of work.

## Dark is the default, and it is the brand

The brand art is near-black with a violet ramp. That is the real product, and
the dark theme is what every surface should be designed and reviewed in first.

The dark values were re-sampled from the 2026 campaign art (the monolith, dark
pool, wallet and "public by default" renders). Three things changed and are now
the brand kit:

- **The page got darker.** `background` is `#07060b` and card and popover
  surfaces sit just above it. The art has almost no mid-grey; depth comes from
  a hairline border, not a lighter panel.
- **Text is warm cream, not white.** `foreground` is `#f5f2ea`. Cool white
  reads as a different brand next to the art and should not be reintroduced.
- **One violet carries everything.** `primary` is `#8b50e8`, the bright violet
  of the campaign type, with `ring` (`#a376f2`) as the lighter step for links,
  inline emphasis and focus. No second accent hue, and no coral or orange —
  the previous site's warm accents are not roles here.

The light theme exists because the token schema requires a complete pair and
because some contexts (print, an embedded view, a user's forced preference)
cannot render dark. It is derived from the same violet ramp — a darker step of
the primary so white label text still clears AA, lavender-tinted surfaces, the
same chart hues — not a second brand with its own personality.

Practical consequence: if a screen only looks right in light mode, it is wrong.
Check surfaces, borders, focus rings, disabled states, and overlays in dark
before anything ships, because that is where a dark-first palette breaks.

## No lime

The previous site leaned on a lime accent (`#c8ed78`) — it was the single
most-used colour in its stylesheet. It appears nowhere in the supplied brand
art, and replacing that look is the point of this system. Lime, and yellow-green
generally, is not a role here and must not be reintroduced as one, including as
a "success" colour, a chart series, or a highlight.

## No green either

There is no success colour. A completed, verified, or private state reads as the
brand violet with a check mark and a word. This keeps the palette honest — one
brand hue, one red — and keeps red meaningful, because it is spent only on
genuine failure and refusal.

## Provider branding stays out

Third-party execution providers are named in the product's own Docs surface and
nowhere else. That rule extends to this package without exception:

- No provider wordmark, logo, brand colour, or copy in the tokens, the
  components, the preview, or these guidelines.
- Route and option components describe a route by **what it does**, never by who
  runs it.
- The layout captures retained under `docs/references/patterns/` were used for
  component shape only. Their identities are deliberately not recorded in the
  manifest, and reproducing them is out of bounds.

## Typography

- **Sans — Inter.** UI, body, and display. The launch banner's headline is a
  heavier grotesque that was never supplied as a font file. Inter is a recorded
  **substitution** for it, set at 800–900 for display type. Do not describe it
  as the banner's face; if the original is ever licensed, swap the token.
- **Mono — JetBrains Mono.** Every figure a reader might compare, copy, or
  verify: amounts, rates, fees, balances, addresses. Always with tabular
  figures.
- **Serif — Source Serif 4.** The brand art uses no serif. The role is filled
  deliberately, for long-form editorial copy only.

Headings are bold and conventional. Weight and size carry the hierarchy;
stretched or heavily letter-spaced display lettering does not.

## Colour roles, not hex values

Every colour in the system is a role, and roles are what flip between themes. A
consuming app that hard-codes a hex value breaks the light theme and silently
diverges the next time a token moves. `tokens.json` is the only place a value is
edited; `src/index.css` and `src/generated/tokens.tsx` are generated and must
never be hand-edited.

Where the brand art gave no signal for a role — the light surfaces, the serif,
the red — the value was chosen deliberately for legibility and is annotated in
`tokens.json`. Two values were lifted off the art rather than copied from it:
the muted foreground, which was too dark at its sampled value for body text, and
the border, which was invisible on near-black.

## When to reach for each swap family

These six families exist because the stock component library has no vocabulary
for a transactional flow. They are generic: no product logic, no provider
wiring, no live data.

| Family | Reach for it when |
| --- | --- |
| `WidgetShell` | A flow needs a single framed panel with a tab bar, a settings affordance, and a footer action. One shell per page — a second competing panel splits attention. |
| `RouteCard` | The user chooses between comparable options and needs to see the figure they differ on. Keep the metadata labels identical across a list so the eye scans one column. |
| `AssetRow` | An asset is listed or selected. Always carries its network identity, because the same symbol exists on several networks. |
| `AmountField` | A number is entered or quoted. Shortcuts belong on the input side only; the converted line stays visible even at zero. |
| `StatusPill` | A route, order, or row has a state worth one or two words. Never more than two pills on a row. |
| `CautionBanner` | A warning qualifies a specific field or action. It goes beside that thing, inside the flow — not at the top of the page. |

Each family's preview page carries its own do/don't list; that is the detailed
version of this table.

## Accessibility floor

- Body, muted, and label text clears WCAG AA at body size on the surface it is
  paired with, in **both** themes. The muted foreground was lifted specifically
  to hold this, and the failure red was lifted so error text passes as well as
  the filled destructive button.
- **Brand violet is a fill, not body text.** `primary` on a dark card measures
  about 4:1 — fine for a filled button's label, a border, an icon, or large
  display text, but short of AA for small text. For violet text on a dark
  surface — a link, an inline emphasis — use the lighter lavender held in
  `ring` (`text-ring`), which clears AA on every surface in both themes. The
  `link` button variant already does this.
- Selection, state, and validity never rely on colour alone. The selected route
  card pairs its tint with a border and an indicator; an invalid amount pairs
  its red border with a message; a status pill pairs its tone with a word.
- Banner icons are decorative and hidden from assistive technology. The copy
  carries the meaning.
- The focus ring is a bright lavender chosen to be unmistakable against
  near-black. Do not remove it or tone it down.
