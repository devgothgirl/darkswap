import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Check, CircleDot, Hourglass, Mail, Repeat, Send, ShieldCheck } from 'lucide-react';
import { useSubscribeUpdates } from '@workspace/api-client-react';
import { CopyButton, errorText } from './swap-ui';
import './waiting.css';

const STAGES = [
  { label: 'Send', sub: 'Manual deposit', icon: Send },
  { label: 'Processing', sub: 'Deposit seen', icon: Hourglass },
  { label: 'Exchanging', sub: 'Route running', icon: Repeat },
  { label: 'Completed', sub: 'Provider confirmed', icon: Check },
];

/** stage: 0-3 index of the current stage. halted: route stopped (failed/expired/refunded). */
export function WaitingStepper({ stage, halted, haltLabel, reviewFirst }: { stage: number; halted?: boolean; haltLabel?: string; reviewFirst?: boolean }) {
  return <ol className="ws-stepper" aria-label="Order progress" data-testid="waiting-stepper">
    {STAGES.map((s, i) => {
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

export function SwapPair({ inAmount, inSymbol, outAmount, outSymbol, outNetwork, estimated, inputLabel = 'Send' }: { inAmount: string; inSymbol: string; outAmount: string; outSymbol: string; outNetwork?: string; estimated?: boolean; inputLabel?: string }) {
  return <div className="ws-pair">
    <div><small>{inputLabel} · Solana</small><strong>{inAmount} <em>{inSymbol}</em></strong></div>
    <ArrowRight size={20} className="ws-pair-arrow" aria-hidden="true" />
    <div><small>{estimated ? 'Estimated receive' : 'Receive'}{outNetwork ? ` · ${outNetwork}` : ''}</small><strong>{outAmount} <em>{outSymbol}</em></strong></div>
  </div>;
}

/** Only render when the order is genuinely fundable. */
export type AssetKind = 'native' | 'spl' | 'unknown';

export function DepositCard({ amount, symbol, assetKind, mint, address, memo, recipient, recipientTag, deadlineText, remainingText }: {
  amount: string; symbol: string; assetKind: AssetKind; mint?: string; address: string; memo?: string;
  recipient: string; recipientTag?: string; deadlineText: string; remainingText?: string;
}) {
  return <section className="ws-card ws-deposit" data-testid="waiting-deposit-card">
    <div className="ws-deposit-line">Please send <b data-testid="text-waiting-amount">{amount} {symbol}</b><CopyButton value={amount} name="exact amount" /></div>
    <div className="ws-deposit-line">on the <b>Solana network</b> {assetKind === 'spl' ? <>as an <b>SPL token transfer</b></> : assetKind === 'native' ? <>as <b>native SOL</b></> : null} to:</div>
    <span className="ws-label">SOLANA DEPOSIT WALLET · {assetKind === 'spl' ? `${symbol} (SPL TOKEN)` : assetKind === 'native' ? 'NATIVE SOL' : symbol}</span>
    <div className="ws-address"><span data-testid="text-waiting-deposit-address">{address}</span><CopyButton value={address} name="deposit address" /></div>
    {assetKind === 'spl' && mint && <p className="ws-small">Token mint: <span className="ws-mono">{mint}</span></p>}
    {memo && <><span className="ws-label ws-label--warn">REQUIRED MEMO · INCLUDE WITH TRANSFER</span><div className="ws-address ws-address--memo"><span data-testid="text-waiting-memo">{memo}</span><CopyButton value={memo} name="deposit memo" /></div></>}
    <div className="ws-deposit-foot">
      <div><span className="ws-label">Deadline</span><b>{deadlineText}</b>{remainingText && <small className="ws-remaining">{remainingText}</small>}</div>
      <div className="ws-recipient"><span className="ws-label">Destination recipient (not a deposit address)</span><span className="ws-mono" data-testid="text-waiting-recipient">{recipient}</span>{recipientTag && <small className="ws-mono">Tag: {recipientTag}</small>}</div>
    </div>
    <p className="ws-small">No wallet is connected here. Send manually from your own Solana wallet.</p>
  </section>;
}

export function ClosedNotice({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ws-card ws-closed" role="alert" data-testid="waiting-closed-notice"><AlertTriangle size={20} /><div><strong>{title}</strong><p>{children}</p></div></section>;
}

export function InfoTips({ assetKind, symbol, hasMemo }: { assetKind: AssetKind; symbol: string; hasMemo: boolean }) {
  const tips = [
    { icon: AlertTriangle, text: `Send only on the Solana network. ${assetKind === 'spl' ? `${symbol} must be sent as an SPL token transfer, not as native SOL.` : assetKind === 'native' ? 'Send native SOL, not a wrapped or SPL version.' : `Send ${symbol} exactly as quoted for this order; check the asset in your wallet matches.`} Assets sent on another network may not be recoverable.` },
    { icon: CircleDot, text: 'Send the exact amount shown. If your wallet deducts a fee from the entered amount, adjust it so the received deposit is exact. A different amount can delay or fail the route.' },
    ...(hasMemo ? [{ icon: Mail, text: 'Include the memo exactly as shown. A missing memo can prevent the deposit from being matched.' }] : []),
    { icon: ShieldCheck, text: 'Send one transfer only, before the deadline, from a wallet you control. Avoid sending through a third-party contract or exchange withdrawal batch.' },
    { icon: Repeat, text: 'Never send twice. If status stalls, keep your order details and sending transaction hash for a support inquiry. Recovery is not guaranteed.' },
  ];
  return <section className="ws-card"><h2 className="ws-h2">Information tips</h2><ul className="ws-tips">{tips.map((t, i) => <li key={i}><span className="ws-tip-icon"><t.icon size={14} /></span><p>{t.text}</p></li>)}</ul></section>;
}

export function UpdatesSignup() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const subscribe = useSubscribeUpdates();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().length <= 254;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid || !consent || subscribe.isPending) return;
    subscribe.mutate({ data: { email: email.trim(), consent: true } });
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
