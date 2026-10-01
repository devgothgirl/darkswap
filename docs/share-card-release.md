# DarkSwap share-card-only release

## Current state

- The workspace has the revised Open Graph/Twitter metadata in `artifacts/solana-privacy-swap/index.html` and the 1200×630 image at `artifacts/solana-privacy-swap/public/brand/social-share-private-swaps.jpg`.
- These two files were changed together in the isolated Git commit `bf483b3`. Later commits include unfinished email-rewards work and must not be included in a share-card-only release.
- The published site was still serving the previous card when checked on September 28, 2026. The new image URL returned the app's HTML fallback rather than `image/jpeg`, confirming that the new card was not yet published.
- Replit publishing captures the **whole project**. It cannot publish two selected files or directly publish a selected Git commit/branch. Do **not** click Publish on the current workspace expecting a share-card-only release.

## Safe release path

1. Preserve the current workspace and its checkpoints. Identify the **exact snapshot currently published**, rather than assuming that the parent of `bf483b3` is the published baseline.
2. Prepare a separate release workspace from that published snapshot. Copy **only** the two files above from the current workspace into that release workspace. Do not copy the rest of `bf483b3`'s descendants, run pending database migrations, or transfer development secrets unnecessarily.
3. Confirm that the release workspace's diff contains only those two paths. Build it and check the resulting HTML has the revised `og:title`, `og:description`, `og:image`, and `twitter:*` tags, and the image is an actual 1200×630 JPEG. Check that the image's text avoids promises of instant settlement, complete anonymity, or zero tracking.
4. Only after the release workspace is independently verified, arrange a publishing/domain cutover for `darkswap.app`. A separate Replit deployment does not automatically inherit the existing domain; plan the domain handoff and possible brief interruption. Do not publish or switch the domain without the owner's explicit approval.
5. After cutover, fetch `https://darkswap.app/` without JavaScript and verify the revised tags. Fetch `https://darkswap.app/brand/social-share-private-swaps.jpg` and verify HTTP 200 with `Content-Type: image/jpeg`, dimensions 1200×630, and image bytes rather than an HTML fallback. Then paste the public URL into iMessage and Telegram; their cached previews may take time to refresh.

## Lower-risk alternative

Wait until the unfinished rewards work is complete and verified, then publish the complete workspace as a normal release. This avoids a separate deployment and domain handoff, but does **not** get the new card live independently.