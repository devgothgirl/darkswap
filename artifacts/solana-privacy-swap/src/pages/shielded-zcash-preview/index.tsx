import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, Check, Copy, Eye } from 'lucide-react';
import { Link } from 'wouter';
import {
  AmountField,
  AmountFieldAsset,
  AmountFieldFooter,
  AmountFieldHeader,
  AmountFieldHint,
  AmountFieldInput,
  AmountFieldLabel,
  AmountFieldRow,
  AmountFieldSecondary,
} from '@workspace/darkswap-design-system/components/ui/amount-field';
import { AssetRow, AssetRowAvatar, AssetRowText } from '@workspace/darkswap-design-system/components/ui/asset-row';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import { CautionBanner, CautionBannerDescription, CautionBannerTitle } from '@workspace/darkswap-design-system/components/ui/caution-banner';
import { Input } from '@workspace/darkswap-design-system/components/ui/input';
import { Label } from '@workspace/darkswap-design-system/components/ui/label';
import { StatusPill } from '@workspace/darkswap-design-system/components/ui/status-pill';
import {
  WidgetShell,
  WidgetShellActions,
  WidgetShellBody,
  WidgetShellDivider,
  WidgetShellFooter,
  WidgetShellHeader,
  WidgetShellNote,
} from '@workspace/darkswap-design-system/components/ui/widget-shell';
import { Footer, Header } from '../../components/swap-ui';
import './shielded-zcash-preview.css';

// Concept preview only. Nothing here quotes, creates orders or calls an API.
// The route stays closed until a routing partner confirms payouts can go
// straight to a shielded Zcash address; transparent delivery is not a fallback.

// Identifies the Solana ZEC token. It is never an address to send funds to.
const SOLANA_ZEC_MINT = 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS';

const steps = [
  {
    title: 'Paste your shielded address',
    copy: 'Copy a shielded receiving address from the Zcash wallet you choose, and add a Solana address for refunds. Transparent addresses are refused, with no fallback.',
  },
  {
    title: 'Review a fresh quote',
    copy: 'Check the minimum you receive, the fees and when the quote expires. Creating an order moves no funds.',
  },
  {
    title: 'Send from your own wallet',
    copy: "Send the exact Solana ZEC amount to the order's deposit address from your wallet app. DarkSwap never asks for keys, seed phrases or signatures.",
  },
  {
    title: 'Confirm it arrived shielded',
    copy: 'Track the order until it pays out, then check that your Zcash wallet shows the funds in its shielded balance.',
  },
];

const gates = [
  {
    title: 'The exact token is listed',
    copy: 'Routing partner catalogs list this Solana ZEC mint with 8 decimals. A listing is not a working route.',
    status: 'Checked',
    tone: 'brand',
    done: true,
  },
  {
    title: 'Payouts go straight to a shielded address',
    copy: 'Current partner documentation and address checks cover transparent Zcash addresses only. This needs written partner confirmation.',
    status: 'Unconfirmed',
    tone: 'outline',
    done: false,
  },
  {
    title: 'A live quote for this exact pair',
    copy: 'A test quote at a small amount returned no route.',
    status: 'None yet',
    tone: 'neutral',
    done: false,
  },
  {
    title: 'One small live order, end to end',
    copy: 'A funded test into a shielded wallet, approved separately, before the flow opens to anyone.',
    status: 'Not started',
    tone: 'neutral',
    done: false,
  },
] as const;

const visibleFacts = [
  'Your Solana deposit is public: the sending address, the amount and the time.',
  'The routing partner sees the deposit and your payout address, and may hold an order for compliance review.',
  'Matching amounts and timing can still link the two sides. There is no anonymity guarantee.',
  'Solana ZEC is a bridged token, not native ZEC. This page makes no claim about its backing or redemption.',
];

const fieldLabel = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';

function AssetChip({ sigil, network }: { sigil: string; network: string }) {
  // A fixed label, not a picker: this flow has one pair.
  return (
    <AssetRow className="pointer-events-none w-auto py-1.5 pl-1.5 pr-3">
      <AssetRowAvatar fallback="ZEC" network={sigil} aria-hidden="true" />
      <AssetRowText symbol="ZEC" network={network} />
    </AssetRow>
  );
}

function SampleCard() {
  return (
    <WidgetShell data-testid="card-shielded-zcash-sample">
      <WidgetShellHeader>
        <p className="px-1 text-sm font-semibold">Solana ZEC to shielded ZEC</p>
        <WidgetShellActions>
          <StatusPill tone="outline" size="sm">Sample</StatusPill>
        </WidgetShellActions>
      </WidgetShellHeader>
      <WidgetShellBody>
        <AmountField>
          <AmountFieldHeader>
            <AmountFieldLabel htmlFor="szp-send">You send</AmountFieldLabel>
          </AmountFieldHeader>
          <AmountFieldRow>
            <AmountFieldInput id="szp-send" disabled />
            <AmountFieldAsset>
              <AssetChip sigil="S" network="Solana, bridged" />
            </AmountFieldAsset>
          </AmountFieldRow>
          <AmountFieldFooter>
            <AmountFieldSecondary>≈ $0.00</AmountFieldSecondary>
            <AmountFieldHint>From your own wallet</AmountFieldHint>
          </AmountFieldFooter>
        </AmountField>
        <WidgetShellDivider>
          <span className="flex size-8 items-center justify-center rounded-full border bg-card text-muted-foreground [&_svg]:size-4" aria-hidden="true">
            <ArrowDown />
          </span>
        </WidgetShellDivider>
        <AmountField>
          <AmountFieldHeader>
            <AmountFieldLabel htmlFor="szp-receive">You receive</AmountFieldLabel>
          </AmountFieldHeader>
          <AmountFieldRow>
            <AmountFieldInput id="szp-receive" disabled readOnly />
            <AmountFieldAsset>
              <AssetChip sigil="Z" network="Zcash, shielded" />
            </AmountFieldAsset>
          </AmountFieldRow>
          <AmountFieldFooter>
            <AmountFieldSecondary>≈ $0.00</AmountFieldSecondary>
            <AmountFieldHint>Minimum shown with a live quote</AmountFieldHint>
          </AmountFieldFooter>
        </AmountField>
        <div className="flex flex-col gap-1.5 pt-2">
          <Label htmlFor="szp-destination" className={fieldLabel}>Shielded Zcash address</Label>
          <div className="flex gap-2">
            <Input id="szp-destination" disabled placeholder="Paste from your Zcash wallet" />
            <Button type="button" variant="secondary" className="h-9 py-0" disabled>Paste</Button>
          </div>
          <p className="text-xs text-muted-foreground">Shielded receivers only. No transparent fallback.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="szp-refund" className={fieldLabel}>Refund address on Solana</Label>
          <Input id="szp-refund" disabled placeholder="Your own Solana address" />
        </div>
        <CautionBanner icon={<Eye />}>
          <CautionBannerTitle>Your Solana deposit is public.</CautionBannerTitle>
          <CautionBannerDescription>The routing partner sees it and your payout address, and may hold an order for review.</CautionBannerDescription>
        </CautionBanner>
      </WidgetShellBody>
      <WidgetShellFooter>
        <Button type="button" className="w-full" disabled aria-describedby="szp-blocked" data-testid="button-review-quote">Review quote</Button>
        <WidgetShellNote id="szp-blocked">Unavailable until a routing partner confirms direct shielded delivery.</WidgetShellNote>
      </WidgetShellFooter>
    </WidgetShell>
  );
}

export default function ShieldedZcashPreview() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copyMint() {
    try {
      await navigator.clipboard.writeText(SOLANA_ZEC_MINT);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="app-shell szp-page">
      <Header />
      <main className="szp-main" id="main-content">
        <section className="szp-hero" aria-labelledby="szp-title">
          <div>
            <p className="szp-eyebrow"><span className="szp-eyebrow-line" aria-hidden="true" />DARKSWAP / FOUNDER PREVIEWS / CONCEPT</p>
            <h1 id="szp-title">Solana ZEC to <span>shielded Zcash.</span></h1>
            <p className="szp-lede">The flow we are designing: send the Solana ZEC token from your own wallet and receive native ZEC at a shielded address in the Zcash wallet you choose.</p>
            <p className="szp-lede szp-lede-quiet">It is not open. It can open only after a routing partner confirms that payouts go straight to a shielded address and a small live test passes.</p>
            <div className="szp-pills">
              <StatusPill tone="accent" dot>Concept preview</StatusPill>
              <StatusPill tone="outline">Not open</StatusPill>
            </div>
          </div>
          <figure className="szp-figure">
            <SampleCard />
            <figcaption>Sample layout. It does not quote, create orders or accept deposits.</figcaption>
          </figure>
        </section>

        <section className="szp-section" aria-labelledby="szp-steps-title">
          <p className="szp-kicker">01 / THE FLOW</p>
          <h2 id="szp-steps-title">How it would work.</h2>
          <ol className="szp-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className="szp-step-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="szp-section szp-split" aria-labelledby="szp-gates-title">
          <div>
            <p className="szp-kicker">02 / BEFORE IT OPENS</p>
            <h2 id="szp-gates-title">What has to be true first.</h2>
            <p className="szp-section-intro">Checked October 9, 2026. Every item has to pass before the flow can open.</p>
          </div>
          <ol className="szp-gates">
            {gates.map((gate, index) => (
              <li key={gate.title}>
                <span className="szp-gate-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{gate.title}</h3>
                  <p>{gate.copy}</p>
                </div>
                <StatusPill tone={gate.tone} dot={!gate.done}>
                  {gate.done ? <Check aria-hidden="true" /> : null}
                  {gate.status}
                </StatusPill>
              </li>
            ))}
          </ol>
        </section>

        <section className="szp-section szp-split" aria-labelledby="szp-visible-title">
          <div>
            <p className="szp-kicker">03 / LIMITS</p>
            <h2 id="szp-visible-title">What stays visible.</h2>
            <p className="szp-section-intro">Shielded delivery protects the Zcash side. It does not hide the Solana side.</p>
          </div>
          <div>
            <ul className="szp-visible">
              {visibleFacts.map(fact => <li key={fact}>{fact}</li>)}
            </ul>
            <div className="szp-token">
              <p className="szp-token-label">EXACT TOKEN / SOLANA ZEC MINT</p>
              <code className="szp-mint" data-testid="text-solana-zec-mint">{SOLANA_ZEC_MINT}</code>
              <div className="szp-token-row">
                <p>Identifies the token. It is not an address to send funds to.</p>
                <Button type="button" variant="outline" size="sm" onClick={copyMint} data-testid="button-copy-mint">
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  <span aria-live="polite">{copied ? 'Copied' : 'Copy mint'}</span>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <div className="szp-end">
          <p>Design preview only. Nothing on this page moves funds.</p>
          <Button asChild variant="link" className="px-0">
            <Link href="/founder" data-testid="link-founder-previews"><ArrowLeft aria-hidden="true" />All founder previews</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
