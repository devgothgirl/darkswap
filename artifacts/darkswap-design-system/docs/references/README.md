# Retained references

The visual evidence this design system was built from. A later "build this
screen in our look" request should start here rather than re-deriving the brand.

Nothing in this folder is a licence to copy another product's identity. The
`patterns/` captures are third-party product screenshots retained **for layout
and component structure only** — their wordmarks, logos, brand colours and copy
are deliberately absent from the tokens, the components, the preview and every
guideline in this package. Provider names belong in the product's own Docs
surface, never in the design system.

## Logos — `logos/`

Real uploaded files. Never redraw, recolour or approximate the mark.

| File | Subject | Kind | Source | Captured | Used for |
| --- | --- | --- | --- | --- | --- |
| `logos/logo-mark-gradient.png` | **Primary mark** — DarkSwap glyph, transparent background | `brand-asset` | Provided by the project owner | 2026-10-02 | The primary logo. Drives the preview header and the Brand > Logo page. The violet ramp (`#c789fc` → `#a161fc` → `#7443d0`) is where `primary`, `ring` and the chart series come from. |
| `logos/logo-mark-on-dark.png` | DarkSwap glyph on a near-black plate | `brand-asset` | Provided by the project owner | 2026-10-02 | Confirms the near-black backdrop (`#06070b`) the mark is designed to sit on. Use when a transparent mark would land on an unknown surface. |
| `logos/logo-wordmark-lockup.png` | DarkSwap wordmark lockup with tagline, on near-black | `brand-asset` | Provided by the project owner | 2026-10-02 | The horizontal lockup. Source of the page background (`#06060e`), the foreground (`#efeff6`) and the wordmark lavenders (`#9769f2`, `#b68cf2`, `#c399f6`). |

`public/logo-mark.png` and `public/logo-wordmark.png` are trimmed, downscaled
copies of the first and third rows, served to the preview through
`import.meta.env.BASE_URL`. The originals above stay full-resolution.

## Brand art — `brand/`

| File | Subject | Kind | Source | Captured | Extracted |
| --- | --- | --- | --- | --- | --- |
| `brand/launch-banner.png` | Product launch banner — mark, wordmark, headline, swap widget vignette | `brand-asset` | Provided by the project owner | 2026-10-02 | Page background `#0a0915`, violet panel `#2a1f53`, foreground `#eae8f0`, primary-action violet `#7052ec`–`#9761f1`. Established the heavy-grotesque headline weight that `typography.fontFamily.sans` substitutes for. |
| `brand/tokenomics-explainer.png` | Tokenomics explainer page — headline, stat cards, numbered rows, footnote strip | `app-ui` | Provided by the project owner | 2026-10-02 | Raised surface `#100b1b`, violet card `#281846`, muted label grey `#9b96a7` (lifted to `#a39cb8` for contrast), light-violet emphasis `#c18bf7` / `#a663ea`. Card radius and the numbered-row rhythm. |

## Layout patterns — `patterns/`

Third-party swap-product captures. **Layout and component patterns only** — no
palette, no type, no copy, no identity was taken from these.

| File | Subject | Kind | Source | Captured | Extracted |
| --- | --- | --- | --- | --- | --- |
| `patterns/swap-widget-with-routes.png` | Swap page — widget beside a routes column | `app-ui` | Third-party swap product (name withheld; provider names live in product Docs only) | 2026-10-02 | The two-column widget + route-list shape, the selected-route treatment, and the status-pill-on-a-route-card pattern. Informed `WidgetShell`, `RouteCard` and `StatusPill`. |
| `patterns/swap-page-full-width.png` | Swap page at full width, with the page chrome visible | `app-ui` | Third-party swap product (name withheld) | 2026-10-02 | Widget max-width versus page width, and the tab-bar-plus-settings-affordance header. Informed `WidgetShellHeader`. |
| `patterns/send-tab-single-column.png` | Send tab — single-column widget, no route column | `app-ui` | Third-party swap product (name withheld) | 2026-10-02 | How the same widget shell collapses to one column, and the amount-field-over-address-field stack. Informed `AmountField` and the shell's single-column mode. |
| `patterns/request-payment-form.png` | Request-payment form with an inline announcement and two-up option cards | `app-ui` | Third-party swap product (name withheld) | 2026-10-02 | The inline notice above a form, and selectable option cards. Informed `CautionBanner` and `RouteCard`'s selectable behaviour. |
| `patterns/multi-recipient-batch-form.png` | Multi-recipient batch form — routing choices, a token pair, and a numbered empty state | `app-ui` | Third-party swap product (name withheld) | 2026-10-02 | Side-by-side routing option cards and the asset-plus-network row. Informed `AssetRow` and the network-identity badge. |

## Written source

| File | Subject | Kind | Source | Captured | Extracted |
| --- | --- | --- | --- | --- | --- |
| `site-audit-nav-and-swap-page.md` | Site audit — navigation, swap page and quality-of-life findings | written audit | Provided by the project owner | 2026-10-01 | The component vocabulary a unified swap page needs: one widget with a tab bar, route cards beside it, asset rows carrying a network badge, amount fields with percentage shortcuts and a live secondary value, and inline cautions. Retained verbatim as the owner wrote it; the product and provider names inside it are the author's own notes, not design-system content. |

## What was deliberately **not** taken

- **The current live site's lime accent (`#c8ed78`).** It is the most-used colour
  in the existing stylesheet and appears nowhere in the supplied art, so it is
  not a role in this system and must not be reintroduced as one.
- **Any provider wordmark, logo, brand colour or copy** from `patterns/`.
