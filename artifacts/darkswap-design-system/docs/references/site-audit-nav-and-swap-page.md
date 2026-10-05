# DarkSwap Site Audit: Nav, Swap Page & QOL

Oct 1, 2026 · @matthew coyle

## Summary

DarkSwap has two swap pages with near-identical names ("Private route" at /swap and "Privacy swap" at /near-swap), and its token picker failed in testing. Both Houdini and Husher run one swap widget with the privacy option inside it. Do the same, in this order:

1. **Fix the token picker.** On /near-swap it opened to "No supported assets found" with nothing typed, and on /swap it hung the tab for over 45 seconds.
2. **Merge /swap and /near-swap into one Swap page** with a route toggle (Private / Privacy), and shareable URLs like `/swap/sol-near?amount=10&route=privacy`.
3. **Cut the nav to 4 items:** Swap, Track, $DARK, Docs, plus one "Launch swap" button.
4. **Pin NEAR, SOL and ZEC at the top of every token list**, then the rest by popularity, with recent picks as chips.
5. **Remove privacy leaks on a privacy site:** wallet SDKs and Replit analytics load on pages that promise no wallet connection, and one auth call returns 403.
6. **QOL:** 25/50/MAX buttons, paste buttons on address fields, address validation, an order history drawer, and a quieter $DARK popup.

The Replit prompts below cover all of this in 3 batched prompts instead of a dozen small ones.

## What Houdini and Husher do well

Both put every route on one swap page. The privacy choice is a toggle or a route card, never a separate page. huster.io doesn't resolve; I assumed you meant husher.io.

| Pattern | Houdini | Husher | Take for DarkSwap |
| --- | --- | --- | --- |
| Swap page | One widget, tabs: Swap / Multiswap / Send | One widget, tabs: Normal Exchange / Multi Exchange | One widget; skip Multi for now |
| Privacy choice | Route cards beside the widget: Private, Onchain DEX or Bridge, No Wallet Connect | "Private exchange" toggle under the fields | Route toggle: Private route / Privacy swap |
| Route sorting | Best / Fastest switch, "More (181)" for extra routes | Provider picker + smart routing | Best / Fastest once there are 2+ quotes |
| Nav | Swap, Payment, Analytics, Rewards, Partner; right: Orders, search, network, Connect Wallet | Home, Leaderboard, Marketplace, Products ▾; right: socials, settings, account | 4 items + one button |
| Token picker | Search + "All Networks" filter, Past Searches chips, Top list | Asset + chain badge on each token | Pinned NEAR/SOL/ZEC, recent chips, network filter |
| Amount | Live USD value under the amount | 25% / 50% / 75% / MAX + USD value | Add both |
| Address field | Single field | Paste, QR scan, address book and wallet icons | Paste + validate per chain |
| Order history | "Orders" in the nav | "History" drawer pinned to the left edge | Recent orders drawer, stored in the browser only |
| Incentive | Rewards page | "Earn 824 Husher Points cashback on this order" under the button | Later: $DARK rewards line, once live |

Sources: [Houdini Swap app](https://app.houdiniswap.com/), [Husher](https://www.husher.io/), [Husher docs](https://docs.husher.io/).
