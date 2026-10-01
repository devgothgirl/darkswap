import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Page } from '@/components/layout';
import { usePageMeta } from '@/lib/seo';

function Doc({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <Page className="max-w-3xl">
      <div className="eyebrow mb-2">{eyebrow}</div>
      <h1 className="text-4xl font-extrabold md:text-5xl">{title}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{intro}</p>
      <div className="prose prose-invert mt-10 max-w-none prose-headings:font-display prose-headings:font-extrabold prose-a:text-accent-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground">
        {children}
      </div>
      <p className="mt-12 font-mono text-xs text-muted-foreground">Questions: support@darkswap.app · <Link href="/" className="underline">Back to Launch</Link></p>
    </Page>
  );
}

export function Docs() {
  usePageMeta({ title: 'Docs', description: 'How DarkSwap Launch discovery, wallet verification, drafts and pair selection work, and what is not yet available.' });
  return (
    <Doc eyebrow="Documentation" title="How Launch works" intro="DarkSwap Launch is a discovery and private launch-preparation tool for Solana creators. This page explains exactly what it does today.">
      <h2>Release boundary</h2>
      <p>This release does not create tokens, submit transactions or charge fees. The final LAUNCH action is disabled for every pair until a verified upstream transaction specification, destination program and fee terms exist. A saved draft is never a launch.</p>
      <h2>Discovery data</h2>
      <ul>
        <li>Token and pair data come from the StonkFun public discovery API through the DarkSwap server, with caching and freshness labels.</li>
        <li>Search is provider-wide on name, ticker and mint. You can filter by an exact pair (quote) mint. Creator lookup is unavailable because no verified attribution source exists.</li>
        <li>Holders, transactions, unique buyers and holder growth are not provided by the source and are shown as unavailable, never zero.</li>
        <li>Graduating and Graduated views use the provider's own status categories. Progress values are raw provider numbers.</li>
        <li>A mint that is not in the catalog is "not indexed", which is different from "does not exist".</li>
      </ul>
      <h2>Wallet verification</h2>
      <p>Connecting Phantom or Solflare only shares your public address. To open private drafts you sign a plain-text challenge that is single-use, expires quickly and is bound to Solana mainnet-beta and this domain. No transaction, approval or fee is involved. Switching accounts or disconnecting immediately clears the previous wallet's private view and revokes the session.</p>
      <h2>Pairs</h2>
      <ul>
        <li>$DARK is the recommended DarkSwap Ecosystem Pair, but only once a configured, verified $DARK mint is live upstream. Until then: "$DARK pairing is being activated for the DarkSwap ecosystem."</li>
        <li>Pairs are identified by network and mint, never ticker. Shared tickers show full addresses.</li>
        <li>NEAR-group pairs are Solana mints with evidence of NEAR ecosystem association. No native NEAR-chain execution or bridging is offered.</li>
        <li>Only pairs that are launchable and launch-lab-ready upstream can be chosen for preparation.</li>
      </ul>
      <h2>Drafts and logos</h2>
      <p>Drafts are stored privately against your verified wallet and can be resumed from the creator dashboard. Logos (PNG or JPEG, 1 MB max) upload directly to private storage and are validated by the server before use.</p>
      <h2>Wallet network</h2>
      <p>Message signing does not depend on a network, so most wallets cannot report which cluster they are on. You confirm mainnet-beta before signing; if a wallet does report a different network we reject it. We do not claim universal network detection.</p>
      <h2>Development vs production</h2>
      <p>In development the app is served under a path prefix, so its robots.txt is advisory only; crawlers read the root robots file. Private API responses also send an X-Robots-Tag noindex header and private pages set a noindex meta tag in every environment.</p>
      <h2>Incentives</h2>
      <p>Fields such as dark_pair, dark_points, referral_volume, creator_score, campaign_eligible and builder_eligible exist as planned, unverified states only. No points are earned or claimable, and nothing here relates to DarkSwap swap rewards.</p>
    </Doc>
  );
}

export function Terms() {
  usePageMeta({ title: 'Terms', description: 'Terms of use for DarkSwap Launch.' });
  return (
    <Doc eyebrow="Legal" title="Terms of use" intro="By using DarkSwap Launch you agree to these terms.">
      <h2>Service</h2>
      <p>DarkSwap Launch provides informational token discovery and private draft preparation. It does not create, sell, list or promote tokens, and does not execute transactions in this release.</p>
      <h2>No advice</h2>
      <p>Nothing on this site is financial, legal or tax advice, an endorsement of any token, or a statement that a token or ticker is authentic.</p>
      <h2>Third-party data</h2>
      <p>Discovery data comes from third parties and may be delayed, incomplete or wrong. Token names, images, descriptions and links are provider content we do not verify.</p>
      <h2>Your responsibilities</h2>
      <ul>
        <li>You control your wallet and keys. We never ask for seed phrases or private keys.</li>
        <li>You are responsible for the content of your drafts and for compliance with laws that apply to you.</li>
        <li>Do not submit malicious, infringing or deceptive metadata. We may suppress metadata or flag wallets for review.</li>
      </ul>
      <h2>Availability</h2>
      <p>Features may be paused, changed or removed. Drafts carry no guarantee of future launch eligibility, fees or terms.</p>
      <h2>Liability</h2>
      <p>To the extent permitted by law, the service is provided as-is without warranties, and DarkSwap is not liable for losses arising from its use.</p>
    </Doc>
  );
}

export function Privacy() {
  usePageMeta({ title: 'Privacy', description: 'What DarkSwap Launch stores and why.' });
  return (
    <Doc eyebrow="Legal" title="Privacy" intro="We keep the minimum needed to run private drafts.">
      <h2>What we store</h2>
      <ul>
        <li>Your public wallet address and a session cookie after you verify ownership.</li>
        <li>Draft contents and uploaded logos, linked to your wallet and visible only to you (and administrators for moderation).</li>
        <li>Administrator review flags and audit records.</li>
      </ul>
      <h2>What we do not do</h2>
      <ul>
        <li>We never request or store seed phrases or private keys.</li>
        <li>We do not include wallet or financial identifiers in engagement analytics.</li>
        <li>We do not join launch identities with DarkSwap marketing data or private swap histories.</li>
      </ul>
      <h2>Public by nature</h2>
      <p>Blockchain activity is public. Using Launch does not make your wallet or future on-chain activity anonymous.</p>
      <h2>Your choices</h2>
      <p>Delete drafts any time from the creator dashboard. Sign out or disconnect to end your session. Contact support@darkswap.app for other requests.</p>
    </Doc>
  );
}

export function Risk() {
  usePageMeta({ title: 'Risk disclosure', description: 'Risks of token discovery and token launches on Solana.' });
  return (
    <Doc eyebrow="Disclosure" title="Risk disclosure" intro="Newly launched tokens are extremely risky. Read this before acting on anything you see here.">
      <h2>Market risk</h2>
      <p>New tokens can lose all value quickly. Liquidity can be thin or withdrawn. Displayed prices and volumes are provider data and may not reflect executable prices.</p>
      <h2>Impersonation</h2>
      <p>Anyone can create a token with any name or ticker, including $DARK or NEAR. Always verify the mint address. Only the configured, verified $DARK mint receives DarkSwap ecosystem badges.</p>
      <h2>Unverified data</h2>
      <p>Creator, holder and transaction data are unavailable from the current source. Absence of a warning is not evidence of safety.</p>
      <h2>Launch preparation</h2>
      <p>Economics you enter are preparation-only and may not match what any launch program accepts. No launch fee, destination or term is verified yet. Execution is unavailable.</p>
      <h2>Ecosystem pairs</h2>
      <p>NEAR-group pairs are Solana tokens. They do not provide native NEAR-chain execution, bridging or redemption.</p>
      <h2>Privacy</h2>
      <p>DarkSwap Launch does not provide anonymity. On-chain actions are publicly visible.</p>
      <h2>Incentives</h2>
      <p>No rewards, points or payouts are active. Any future program would have its own published terms.</p>
    </Doc>
  );
}
