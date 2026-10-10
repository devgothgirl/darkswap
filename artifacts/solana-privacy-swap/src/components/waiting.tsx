import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Check, CircleAlert, CircleDot, Clock3, Hourglass, Info, LockKeyhole, Mail, RefreshCw, Repeat, Send, ShieldCheck } from 'lucide-react';
import { useSubscribeUpdates } from '@workspace/api-client-react';
import { CautionBanner, CautionBannerDescription } from '@workspace/darkswap-design-system/components/ui/caution-banner';
import { CopyButton, errorText } from './swap-ui';
import { trackEvent } from '../lib/analytics';
import { SOLANA_NETWORK_TERMS, type NetworkTerms } from '../lib/origin-terms';
import './waiting.css';

const STAGES = [
  { label: 'Send', sub: 'Manual deposit', icon: Send },
  { label: 'Processing', sub: 'Deposit seen', icon: Hourglass },
  { label: 'Exchanging', sub: 'Route running', icon: Repeat },
  { label: 'Completed', sub: 'Provider confirmed', icon: Check },
];
const TRACKING_STAGES = [
  { label: 'Send', sub: 'On your wallet', icon: Send },
  { label: 'Processing', sub: 'Deposit detected', icon: Clock3 },
  { label: 'Exchanging', sub: 'Route in progress', icon: ArrowRight },
  { label: 'Completed', sub: 'Output reported', icon: Check },
];

/** stage: 0-3 index of the current stage. halted: route stopped (failed/expired/refunded). */
export function WaitingStepper({ stage, halted, haltLabel, reviewFirst, tracking = false }: { stage: number; halted?: boolean; haltLabel?: string; reviewFirst?: boolean; tracking?: boolean }) {
  return <ol className="ws-stepper" aria-label="Order progress" data-testid="waiting-stepper">
    {(tracking ? TRACKING_STAGES : STAGES).map((s, i) => {
      const Icon = halted && i === stage ? AlertTriangle : s.icon;
      const state = i < stage || (i === 3 && stage === 3 && !halted) ? 'done' : i === stage ? (halted ? 'halt' : 'current') : 'todo';
      return <li key={s.label} className={`ws-step ws-step--${state}`} aria-current={i === stage ? 'step' : undefined}>
        <span className="ws-step-icon"><Icon size={16} /></span>
         <span><strong>{reviewFirst && i === 0 ? 'Review' : s.label}</strong><small>{halted && i === stage ? (haltLabel || 'Stopped') : reviewFirst && i === 0 ? 'Funding checks required' : s.sub}</small></span>
      </li>;
    })}
  </ol>;
}

export function OrderMeta({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <div className="ws-meta">{items.map(item => <span key={item.label}>{item.label}: <b>{item.value}</b></span>)}</div>;
}

/** inNetwork names the network the input is sent on; it defaults to Solana, as every route did before multi-network origins. */
export function SwapPair({ inAmount, inSymbol, outAmount, outSymbol, outNetwork, estimated, inputLabel = 'Send', tracking = false, inNetwork = 'Solana' }: { inAmount: string; inSymbol: string; outAmount: string; outSymbol: string; outNetwork?: string; estimated?: boolean; inputLabel?: string; tracking?: boolean; inNetwork?: string }) {
  if (tracking) return <section className="nt-summary" aria-label={`${inputLabel}: ${inAmount} ${inSymbol} on ${inNetwork}; ${estimated ? 'estimated receive' : 'receive'}: ${outAmount} ${outSymbol}${outNetwork ? ` on ${outNetwork}` : ''}`} data-testid="near-order-swap-summary">
    <span className="nt-coin" aria-hidden="true">{inSymbol.slice(0, 1)}</span>
    <div><strong>{inAmount} {inSymbol}</strong><small>{inputLabel}</small></div><span>{inNetwork}</span>
    <ArrowRight size={17} aria-hidden="true"/>
    <span className="nt-coin nt-coin--output" aria-hidden="true">{outSymbol.slice(0, 1)}</span>
    <div><strong>{outAmount} {outSymbol}</strong>{estimated && <small>Estimated receive</small>}</div><span>{outNetwork}</span>
  </section>;
  return <div className="ws-pair">
    <div><small>{`${inputLabel} · ${inNetwork}`}</small><strong>{inAmount} <em>{inSymbol}</em></strong></div>
    <ArrowRight size={20} className="ws-pair-arrow" aria-hidden="true" />
    <div><small>{estimated ? 'Estimated receive' : 'Receive'}{outNetwork ? ` · ${outNetwork}` : ''}</small><strong>{outAmount} <em>{outSymbol}</em></strong></div>
  </div>;
}

/** Only render when the order is genuinely fundable. 'token' is a contract (SPL or ERC-20) transfer. */
export type AssetKind = 'native' | 'token' | 'unknown';

const EVM_NETWORK_WARNING = (network: string) => `Send on ${network} only. This address looks the same on every EVM network; funds sent on another network may not be recoverable.`;
/** The second EVM deposit warning: how the asset itself must be sent. */
const evmTransferWarning = (assetKind: AssetKind, symbol: string, contract?: string) =>
  assetKind === 'native' ? `Send ${symbol} as a plain transfer.`
    : assetKind === 'token' && contract ? `Send ${symbol} as a token transfer from contract ${contract}.`
    : `Send ${symbol} exactly as quoted for this order; check the asset in your wallet matches.`;

/** origin defaults to Solana wording; the Houdini route relies on that default. */
export function DepositCard({ amount, symbol, assetKind, mint, address, memo, recipient, recipientTag, deadlineText, remainingText, deadlineInSidePanel = false, actions, origin = SOLANA_NETWORK_TERMS }: {
  amount: string; symbol: string; assetKind: AssetKind; mint?: string; address: string; memo?: string;
  recipient: string; recipientTag?: string; deadlineText: string; remainingText?: string;
  deadlineInSidePanel?: boolean; actions?: ReactNode; origin?: NetworkTerms;
}) {
  // Solana's own coin is always SOL; another network's native coin is the deposited symbol.
  const coin = origin.chain === SOLANA_NETWORK_TERMS.chain ? 'SOL' : symbol;
  const assetLabel = assetKind === 'token' ? `${symbol} (${origin.tokenStandard.toUpperCase()} TOKEN)` : assetKind === 'native' ? `NATIVE ${coin}` : symbol;
  return <section className="ws-card ws-deposit" data-testid="waiting-deposit-card">
    <div className="ws-deposit-line">Please send <b data-testid="text-waiting-amount">{amount} {symbol}</b><CopyButton value={amount} name="exact amount" /></div>
    <div className="ws-deposit-line">on the <b>{origin.networkLabel}</b> {assetKind === 'token' ? <>as an <b>{origin.tokenTransfer}</b></> : assetKind === 'native' ? <>as <b>{`native ${coin}`}</b></> : null} to:</div>
    <span className="ws-label">{`${origin.network.toUpperCase()} DEPOSIT WALLET · ${assetLabel}`}</span>
    <div className="ws-address"><span data-testid="text-waiting-deposit-address">{address}</span><CopyButton value={address} name="deposit address" /></div>
    {origin.evm && <CautionBanner tone="caution" className="ws-network-warning" data-testid="text-waiting-network-warning">
      <CautionBannerDescription>{EVM_NETWORK_WARNING(origin.network)}</CautionBannerDescription>
      <CautionBannerDescription>{evmTransferWarning(assetKind, symbol, mint)}</CautionBannerDescription>
    </CautionBanner>}
    {assetKind === 'token' && mint && <p className="ws-small">{`${origin.contractLabel}: `}<span className="ws-mono">{mint}</span></p>}
    {deadlineInSidePanel && assetKind === 'native' && <p className="ws-small">Asset type: <span className="ws-mono">{`Native ${coin} (not an ${origin.tokenStandard} token)`}</span></p>}
    {memo && <><span className="ws-label ws-label--warn">REQUIRED MEMO · INCLUDE WITH TRANSFER</span><div className="ws-address ws-address--memo"><span data-testid="text-waiting-memo">{memo}</span><CopyButton value={memo} name="deposit memo" /></div></>}
    <div className="ws-deposit-foot">
      {!deadlineInSidePanel && <div><span className="ws-label">Deadline</span><b>{deadlineText}</b>{remainingText && <small className="ws-remaining">{remainingText}</small>}</div>}
      <div className="ws-recipient"><span className="ws-label">Destination recipient (not a deposit address)</span><span className="ws-mono" data-testid="text-waiting-recipient">{recipient}</span>{recipientTag && <small className="ws-mono">Tag: {recipientTag}</small>}</div>
    </div>
    <p className="ws-small">{`No wallet is connected here. Send manually from your own ${origin.network} wallet.`}</p>
    {actions && <div className="nt-deposit-actions">{actions}</div>}
  </section>;
}

export function ClosedNotice({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ws-card ws-closed" role="alert" data-testid="waiting-closed-notice"><AlertTriangle size={20} /><div><strong>{title}</strong><p>{children}</p></div></section>;
}

/** origin defaults to Solana wording; contract is the deposited token's contract on an EVM origin. */
export function InfoTips({ assetKind, symbol, hasMemo, showPrivacyTip = false, tracking = false, origin = SOLANA_NETWORK_TERMS, contract }: { assetKind: AssetKind; symbol: string; hasMemo: boolean; showPrivacyTip?: boolean; tracking?: boolean; origin?: NetworkTerms; contract?: string }) {
  const networkTip = origin.evm
    ? `${EVM_NETWORK_WARNING(origin.network)} ${evmTransferWarning(assetKind, symbol, contract)}`
    : `Send only on the Solana network. ${assetKind === 'token' ? `${symbol} must be sent as an SPL token transfer, not as native SOL.` : assetKind === 'native' ? 'Send native SOL, not a wrapped or SPL version.' : `Send ${symbol} exactly as quoted for this order; check the asset in your wallet matches.`} Assets sent on another network may not be recoverable.`;
  const tips = [
    { icon: tracking ? Info : AlertTriangle, text: networkTip },
    { icon: tracking ? LockKeyhole : CircleDot, text: 'Send the exact amount shown. If your wallet deducts a fee from the entered amount, adjust it so the received deposit is exact. A different amount can delay or fail the route.' },
    ...(hasMemo ? [{ icon: Mail, text: 'Include the memo exactly as shown. A missing memo can prevent the deposit from being matched.' }] : []),
    { icon: ShieldCheck, text: 'Send one transfer only, before the deadline, from a wallet you control. Avoid sending through a third-party contract or exchange withdrawal batch.' },
    { icon: tracking ? RefreshCw : Repeat, text: 'Never send twice. If status stalls, keep your order details and sending transaction hash for a support inquiry. Recovery is not guaranteed.' },
    ...(showPrivacyTip ? [{ icon: CircleAlert, text: `A public origin. ${origin.network} deposits are visible on-chain. Confidential mode does not guarantee anonymity or unlinkability.` }] : []),
  ];
  return <section className="ws-card"><h2 className="ws-h2">Information tips</h2><ul className="ws-tips">{tips.map((t, i) => {
    const firstSentence = t.text.indexOf('. ') + 1;
    return <li key={i}><span className="ws-tip-icon"><t.icon size={tracking ? 16 : 14} /></span><p>{tracking && firstSentence > 0 ? <><strong>{t.text.slice(0, firstSentence)}</strong>{t.text.slice(firstSentence)}</> : t.text}</p></li>;
  })}</ul></section>;
}

export function UpdatesSignup() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const subscribe = useSubscribeUpdates();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().length <= 254;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid || !consent || subscribe.isPending) return;
    subscribe.mutate({ data: { email: email.trim(), consent: true } }, {
      // Never the email address; only that an optional signup succeeded, and where.
      onSuccess: () => trackEvent('updates_signup_completed', {
        route: window.location.pathname.includes('/near-order') ? 'privacy_swap' : 'private_route'
      })
    });
  };
  return <section className="ws-card ws-signup" aria-labelledby="ws-signup-title" data-testid="panel-updates-signup">
    <span className="ws-label">OPTIONAL</span>
    <h2 className="ws-h2" id="ws-signup-title">Discounts and product updates</h2>
    <p className="ws-small">Join the list for future DarkSwap discounts and product news. Confirm your email before receiving updates, and unsubscribe at any time. Signup is optional and does not affect your swap. This is not a transaction alert service, and discounts are not guaranteed. We store this signup separately from swap order records.</p>
    {subscribe.isSuccess ? <p className="ws-success" role="status" data-testid="status-subscribe-success"><Check size={15} /> {subscribe.data?.message || 'Please check your inbox to confirm your email.'}</p>
      : <form onSubmit={submit} noValidate>
        <div className="ws-signup-row">
          <label htmlFor="ws-email" className="sr-only">Email address</label>
          <div className="ws-input-wrap"><Mail size={14} aria-hidden="true" /><input id="ws-email" type="email" autoComplete="email" value={email} maxLength={254} onChange={e => { setEmail(e.target.value); subscribe.reset(); }} placeholder="you@example.com" data-testid="input-subscribe-email" /></div>
          <button type="submit" className="ws-button" disabled={!valid || !consent || subscribe.isPending} data-testid="button-subscribe">{subscribe.isPending ? 'Submitting…' : 'Sign up'}</button>
        </div>
        <label className="ws-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="checkbox-subscribe-consent" /> I agree to receive occasional marketing emails about DarkSwap discounts and product news.</label>
        {subscribe.isError && <p className="ws-error" role="alert" data-testid="status-subscribe-error">{errorText(subscribe.error)}</p>}
      </form>}
  </section>;
}
