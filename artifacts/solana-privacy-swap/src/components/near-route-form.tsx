import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowDownUp, ArrowRight, Check, Clock3, LockKeyhole, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { createNearOrder, getGetNearTokensQueryKey, useGetNearQuote, useGetNearTokens } from '@workspace/api-client-react';
import type { NearOrder, NearQuote, NearToken } from '@workspace/api-client-react';
import { isShieldedZcashAddress, MAX_ZCASH_ADDRESS_LENGTH, SHIELDED_ZCASH_HINT } from '@workspace/zcash-address';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import { CautionBanner, CautionBannerDescription, CautionBannerTitle } from '@workspace/darkswap-design-system/components/ui/caution-banner';
import { errorText, Footer, Header } from './swap-ui';
import { RewardOrderChoice } from './reward-enrollment';
import { RouteTabs, carriedAmount } from './route-tabs';
import { NearServiceNotice, useNearRouteSafety } from './near-service-notice';
import { NearAssetPicker } from './near-asset-picker';
import { useRewards } from '../hooks/use-rewards';
import { trackEvent, type SwapRoute } from '../lib/analytics';
import { nearTrackingLink, saveNearReceipt } from '../lib/near-receipt-access';
import { nearRouteReady } from '../lib/near-funding-safety';
import { flipTarget, MAX_ADDRESS_LENGTH, readClipboardAddress, sourceTokenParams, type NearFormMode } from '../lib/near-route-form';
import { originTerms, withArticle } from '../lib/origin-terms';
import '../pages/near.css';
import '../pages/swap.css';

const MINIMUM_SWAP_USD = 3;
const displayAmount = (value: string) => {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return value;
  const [whole, fraction] = value.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
};
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Quote rows for the bridge, in the order the bridge brief lists them. Fees keep the units they are charged in. */
function BridgeQuoteRows({ preview }: { preview: NearQuote }) {
  const rows: { label: string; value: string; testId?: string }[] = [
    { label: 'Estimated output', value: `${displayAmount(preview.amountOut)} ${preview.to.symbol}`, testId: 'text-near-quote-output' },
    { label: 'Minimum received', value: `${displayAmount(preview.minAmountOut)} ${preview.to.symbol}`, testId: 'text-near-quote-minimum' },
    { label: 'Estimated time', value: `~${Math.ceil(preview.estimatedSeconds / 60)} min` },
    { label: 'Max slippage', value: '1%' },
    { label: 'Route', value: 'NEAR Intents · confidential', testId: 'text-near-quote-route' },
    ...(preview.appFeeBps !== undefined ? [{ label: 'DarkSwap fee', value: `${(preview.appFeeBps / 100).toFixed(2)}%`, testId: 'text-near-quote-appfee' }] : []),
    ...(preview.withdrawFee !== undefined ? [{ label: 'Withdrawal fee', value: `${displayAmount(preview.withdrawFee)} ${preview.to.symbol}`, testId: 'text-near-quote-withdraw-fee' }] : []),
    ...(preview.refundFee !== undefined ? [{ label: 'Possible refund fee', value: `${displayAmount(preview.refundFee)} ${preview.from.symbol}`, testId: 'text-near-quote-refund-fee' }] : []),
  ];
  return <div className="near-quote-grid">{rows.map(row => <div key={row.label}><small>{row.label}</small><strong data-testid={row.testId}>{row.value}</strong></div>)}</div>;
}

/**
 * The NEAR Intents order form. mode="solana" is the Privacy swap, funded from
 * Solana only; mode="bridge" accepts any origin the API enables. Both create
 * instruction-only orders through the same quote, review and receipt steps.
 */
export function NearRouteForm({ mode }: { mode: NearFormMode }) {
  const bridge = mode === 'bridge';
  const analyticsRoute: SwapRoute = bridge ? 'bridge' : 'privacy_swap';
  const [, navigate] = useLocation();
  const rewards = useRewards();
  const [rewardOptIn, setRewardOptIn] = useState(false);
  const [rewardError, setRewardError] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [from, setFrom] = useState<NearToken | null>(null);
  const [to, setTo] = useState<NearToken | null>(null);
  // The Privacy swap checks Solana before an origin is chosen; the bridge checks only what was chosen.
  const routeSafety = useNearRouteSafety(bridge ? from?.chain : from?.chain ?? 'sol', to?.chain);
  const [amount, setAmount] = useState(carriedAmount);
  const [recipient, setRecipient] = useState('');
  const [refundTo, setRefundTo] = useState('');
  const [preview, setPreview] = useState<NearQuote | null>(null);
  const [quotedAt, setQuotedAt] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<NearOrder | null>(null);
  const [requestId, setRequestId] = useState('');
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const quote = useGetNearQuote();
  const create = useMutation({ mutationFn: ({ data, token }: { data: Parameters<typeof createNearOrder>[0]; token?: string }) =>
    createNearOrder(data, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined) });
  // The bridge keeps the enabled origin catalog at hand so a flip only ever sends from an allowed origin.
  const sourceParams = sourceTokenParams('bridge', '');
  const sources = useGetNearTokens(sourceParams, { query: { queryKey: getGetNearTokensQueryKey(sourceParams), enabled: bridge, retry: 1, staleTime: 30_000 } });
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const invalidate = () => { if (requestId || create.isPending || creatingToken) return; generation.current++; setPreview(null); setConfirm(false); setCreatedOrder(null); quote.reset(); create.reset(); };
  const origin = from ? originTerms(from) : null;
  const originNetwork = origin?.network ?? 'the origin network';
  const flipped = flipTarget(mode, to, sources.data?.tokens);
  const canFlip = bridge && (!!from || !!to) && (!to || !!flipped);
  const flip = () => {
    if (!canFlip || requestId || create.isPending || creatingToken) return;
    setFrom(to ? flipped : null);
    setTo(from);
    setRecipient('');
    setRefundTo('');
    invalidate();
  };
  const paste = async (apply: (value: string) => void, maxLength: number) => {
    const text = await readClipboardAddress(typeof navigator === 'undefined' ? null : navigator.clipboard, maxLength);
    if (text === null) return;
    apply(text);
    invalidate();
  };
  const pickSource = (token: NearToken) => {
    if (!bridge) { setFrom(token); setTo(null); setRecipient(''); invalidate(); return; }
    // A different origin network needs a refund address of its own shape.
    if (from?.chain !== token.chain) setRefundTo('');
    if (to?.id === token.id) { setTo(null); setRecipient(''); }
    setFrom(token);
    invalidate();
  };
  const amountValid = /^(?:\d+)(?:\.\d+)?$/.test(amount) && Number(amount) > 0 && amount.length <= 40 && (!from || (amount.split('.')[1]?.length || 0) <= from.decimals);
  const estimatedUsd = from && typeof from.price === 'number' && Number.isFinite(from.price) && from.price > 0 && amountValid ? from.price * Number(amount) : null;
  const belowMinimum = estimatedUsd !== null && estimatedUsd < MINIMUM_SWAP_USD;
  const priceUnavailable = !!from && amountValid && estimatedUsd === null;
  const shieldedDestination = to?.chain === 'zec';
  const recipientLimit = shieldedDestination ? MAX_ZCASH_ADDRESS_LENGTH : MAX_ADDRESS_LENGTH;
  const shieldedRecipientValid = !shieldedDestination || isShieldedZcashAddress(recipient.trim());
  const canQuote = Boolean(from && to && from.id !== to.id && amountValid && !belowMinimum && !priceUnavailable && recipient.trim().length > 0 && recipient.trim().length <= recipientLimit && shieldedRecipientValid && refundTo.trim().length > 0 && refundTo.trim().length <= MAX_ADDRESS_LENGTH);
  const nearBlocker = !from ? bridge ? 'Choose the network and asset you send' : 'Choose the Solana asset you send'
    : !amount ? 'Enter an amount to send'
    : !amountValid ? `Enter a valid amount${from ? ` (up to ${from.decimals} decimals)` : ''}`
    : priceUnavailable ? 'A USD price is unavailable for this asset right now'
    : belowMinimum ? `Minimum swap is $${MINIMUM_SWAP_USD} USD`
    : !to ? 'Choose what you receive'
    : from.id === to.id ? 'Choose two different assets'
    : !recipient.trim() ? `Enter your ${to.symbol} address on ${to.chainName}`
    : !shieldedRecipientValid ? 'Enter a valid shielded-only Zcash Unified Address (u1)'
    : !refundTo.trim() ? bridge ? `Enter ${withArticle(originNetwork)} refund address` : 'Enter a Solana refund address'
    : quote.isPending ? 'Requesting quote…'
    : '';
  const expiresAt = preview ? Math.min(new Date(preview.validUntil).getTime(), quotedAt + 45_000) : 0;
  const secondsLeft = preview ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const live = !!preview && Number.isFinite(expiresAt) && secondsLeft > 0;
  const requestQuote = () => {
    if (!canQuote || !from || !to || quote.isPending || requestId || create.isPending || creatingToken) return;
    const request = ++generation.current;
    setPreview(null);
    setConfirm(false);
    quote.mutate({ data: { from: from.id, to: to.id, amount, recipient: recipient.trim(), refundTo: refundTo.trim() } }, {
      onSuccess: result => { trackEvent('swap_quote_requested', { route: analyticsRoute, outcome: 'received' }); if (generation.current === request) { setPreview(result); setQuotedAt(Date.now()); } },
      onError: () => trackEvent('swap_quote_requested', { route: analyticsRoute, outcome: 'unavailable' }),
    });
  };
  const createOrder = async () => {
    if (!preview || !live || create.isPending || creatingToken || requestId || !routeSafety.ready || !navigator.onLine) return;
    setRewardError('');
    setCreatingToken(true);
    let token: string | undefined;
    try {
      if (rewardOptIn) token = await rewards.getEnrolledToken();
      const checked = await routeSafety.query.refetch();
      if (!nearRouteReady({
        status: checked.data, updatedAt: checked.dataUpdatedAt, error: checked.isError,
        fetchStatus: checked.fetchStatus, online: navigator.onLine, now: Date.now(),
      })) {
        setRewardError('Current route impact could not be verified. No order was submitted. Keep this quote or check route status again.');
        setCreatingToken(false);
        return;
      }
    } catch (cause) {
      setRewardError(`${errorText(cause)} No order was created. Turn off rewards below to continue as a guest, or try again.`);
      setCreatingToken(false);
      return;
    }
    setCreatingToken(false);
    if (Date.now() >= expiresAt || !navigator.onLine) {
      setRewardError('The quote expired or connectivity changed. No order was submitted. Check the route and quote again.');
      return;
    }
    const id = crypto.randomUUID();
    setRequestId(id);
    saveNearReceipt(id);
    create.mutate({ data: { quoteId: preview.quoteId, requestId: id }, token }, {
      onError: () => trackEvent('swap_order_failed', { route: analyticsRoute }),
      onSuccess: order => {
        trackEvent('swap_order_created', { route: analyticsRoute });
        if (token) void rewards.refresh();
        saveNearReceipt(id, order.depositAddress, order.depositMemo || '');
        setCreatedOrder(order);
        setConfirm(true);
        void routeSafety.query.refetch();
      }
    });
  };
  const viewInstructions = () => {
    if (!createdOrder || !requestId) return;
    navigate(nearTrackingLink(requestId, createdOrder.depositAddress, createdOrder.depositMemo || ''));
  };
  const pasteButton = (name: string, apply: (value: string) => void, testId: string) =>
    <Button type="button" variant="outline" size="sm" onClick={() => void paste(apply, testId === 'button-paste-near-recipient' ? recipientLimit : MAX_ADDRESS_LENGTH)} aria-label={`Paste ${name} from clipboard`} data-testid={testId}>Paste</Button>;
  const recipientInput = <input id="near-recipient" className="near-input" value={recipient} maxLength={recipientLimit} onChange={e => { setRecipient(e.target.value); invalidate(); }} placeholder={shieldedDestination ? 'Shielded-only Zcash Unified Address (u1…)' : 'Address that will receive the output'} aria-describedby={shieldedDestination ? 'near-zcash-policy' : undefined} autoComplete="off" data-testid="input-near-recipient"/>;
  const refundInput = <input id="near-refund" className="near-input" value={refundTo} maxLength={MAX_ADDRESS_LENGTH} onChange={e => { setRefundTo(e.target.value); invalidate(); }} placeholder={bridge ? `Your ${origin ? origin.network : 'origin network'} address for a possible refund` : 'Your Solana address for a possible refund'} autoComplete="off" data-testid="input-near-refund"/>;
  return <div className="near-shell"><Header/>
    <main className="near-main">
      {bridge
        ? <div className="sx-intro near-intro-compact"><h1 className="sx-title">Bridge between networks.</h1><p className="sx-sub">Move assets across the networks listed below with confidential routing built on NEAR Intents. You send from your own wallet. DarkSwap prepares the order and never holds your funds.</p></div>
        : <div className="sx-intro near-intro-compact"><h1 className="sx-title">Privacy swap from Solana.</h1><p className="sx-sub">Confidential routing built on NEAR Intents, with a Solana refund address. Review the terms, then decide whether to send.</p></div>}
      <section className="near-panel" aria-label={bridge ? 'Bridge form' : 'Privacy swap form'}>
        <div className="near-tabs-wrap"><RouteTabs active={bridge ? 'bridge' : 'near'} amount={amount}/></div>
        <div className="near-panel-body">
          <fieldset className="near-form-lock" disabled={!!requestId || create.isPending || creatingToken}>
          <div className="near-field"><div className="near-label"><label htmlFor="near-amount">You send</label><small>{bridge ? from?.chainName || 'Choose a network' : 'Solana network'}</small></div><div className="near-asset-row"><input id="near-amount" className="near-amount" type="text" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); invalidate(); }} placeholder="0.00" autoComplete="off" data-testid="input-near-amount"/><NearAssetPicker mode={mode} side="source" token={from} onPick={pickSource}/></div><p className="near-hint">Minimum swap: $3 USD of the asset you send. The provider may require more.</p>{amount && !amountValid && <p className="near-error" role="alert">Enter a positive amount with no more than {from?.decimals ?? 12} decimal places.</p>}{belowMinimum && <p className="near-error" role="alert" data-testid="status-near-amount-minimum">Estimated input is below $3 USD. Increase the amount to continue.</p>}{priceUnavailable && <p className="near-error" role="alert">Unable to verify this asset's USD price. Try another asset or try again later.</p>}</div>
          {bridge
            ? <div className="near-divide near-divide--flip"><Button type="button" variant="outline" size="icon" className="rounded-full bg-card" onClick={flip} disabled={!canFlip} aria-label="Swap origin and destination" data-testid="button-near-flip"><ArrowDownUp aria-hidden="true"/></Button></div>
            : <div className="near-divide"><ArrowDown size={15}/></div>}
          <div className="near-field"><div className="near-label"><span>Estimated receive</span><small>{to?.chainName || 'Choose a network'}</small></div><div className="near-asset-row"><div className="near-amount" data-testid="text-near-estimated-receive">{live ? displayAmount(preview!.amountOut) : '—'}</div><NearAssetPicker mode={mode} side="destination" token={to} selectedSource={from} onPick={v => { setTo(v); setRecipient(''); invalidate(); }}/></div>{from && to && from.id === to.id && <p className="near-error" role="alert">Choose a different destination asset.</p>}</div>
          <div className="near-field"><div className="near-label"><label htmlFor="near-recipient">Recipient address</label><small>{to?.chainName || 'Destination network'}</small></div>{bridge ? <div className="near-address-row">{recipientInput}{pasteButton('recipient address', setRecipient, 'button-paste-near-recipient')}</div> : recipientInput}<p className="near-hint">Check the destination network and address carefully. Transfers cannot be reversed.</p></div>
          {bridge
            ? <div className="near-field"><div className="near-label"><label htmlFor="near-refund">{origin ? `Refund address · ${origin.network}` : 'Refund address'}</label>{!origin && <small>Origin network</small>}</div><div className="near-address-row">{refundInput}{pasteButton('refund address', setRefundTo, 'button-paste-near-refund')}</div><p className="near-hint">{`Use an address you control on ${originNetwork}. If a refund applies, it is sent to this address.`}</p></div>
            : <div className="near-field"><div className="near-label"><label htmlFor="near-refund">Refund address</label><small>Solana network</small></div>{refundInput}<p className="near-hint">Use an address you control on Solana. A refund, if applicable, is not guaranteed.</p></div>}
          {shieldedDestination && <p id="near-zcash-policy" className="near-notice" data-testid="text-near-zcash-policy">{SHIELDED_ZCASH_HINT} Native Zcash payout; not the Solana ZEC token. This route is awaiting its first owner-verified shielded payout.</p>}
          <div className="near-inline-notice"><NearServiceNotice safety={routeSafety}/></div>
          {bridge
            ? <CautionBanner tone="brand" data-testid="near-bridge-notice"><CautionBannerTitle>Confidential routing, not ZK shielding.</CautionBannerTitle><CautionBannerDescription>{`This route requests confidential execution inside NEAR Intents. Your deposit on ${originNetwork} is public, and the destination transfer may be public. This does not deposit into a shielded pool.`}</CautionBannerDescription></CautionBanner>
            : <div className="near-notice"><strong>Confidential routing, not ZK shielding.</strong> This route requests confidential execution; it does not deposit funds into a Zcash shielded pool. Native Zcash is not enabled here. Your Solana deposit remains public, and destination transfers may be public. Anonymity, unlinkability and route availability are not guaranteed.</div>}
          <div className="near-quote" aria-live="polite"><div className="near-quote-top"><span>ROUTE PREVIEW</span><span>{live ? `${secondsLeft}s LEFT` : preview ? 'EXPIRED' : 'NOT REQUESTED'}</span></div>
             {quote.isPending && !preview ? <><div className="near-skeleton"/><div className="near-skeleton"/></> : live && preview ? bridge ? <BridgeQuoteRows preview={preview}/> : <div className="near-quote-grid"><div><small>Estimated output</small><strong data-testid="text-near-quote-output">{displayAmount(preview.amountOut)} {preview.to.symbol}</strong></div><div><small>Minimum output</small><strong data-testid="text-near-quote-minimum">{displayAmount(preview.minAmountOut)} {preview.to.symbol}</strong></div><div><small>Expected duration</small><strong>~{Math.ceil(preview.estimatedSeconds / 60)} min</strong></div><div><small>Max slippage</small><strong>1%</strong></div>{preview.appFeeBps !== undefined && <div><small>DarkSwap fee (included in the quote)</small><strong data-testid="text-near-quote-appfee">{(preview.appFeeBps / 100).toFixed(2)}%</strong></div>}{preview.withdrawFee !== undefined && <div><small>Withdrawal fee (included in output)</small><strong>{displayAmount(preview.withdrawFee)} {preview.to.symbol}</strong></div>}{preview.refundFee !== undefined && <div><small>Possible refund fee</small><strong>{displayAmount(preview.refundFee)} {preview.from.symbol}</strong></div>}</div> : <p data-testid="status-near-quote">{preview ? 'This quote has expired. Request a fresh quote before continuing.' : 'Nothing is reserved yet. Complete the fields, then request a dry quote to see the route.'}</p>}
            {quote.isError && !preview && <p className="near-error" role="alert" data-testid="status-near-quote-error">{errorText(quote.error)}</p>}
          </div>
           {bridge && <p className="near-hint" data-testid="text-near-bridge-fee-note">Fees are included in the quote. Your wallet also pays its usual network fee to send the deposit.</p>}
           <button type="button" className="near-button near-button--wide" onClick={requestQuote} disabled={!canQuote || quote.isPending || create.isPending || !!requestId || creatingToken} data-testid="button-request-near-quote">{quote.isPending ? 'Requesting quote…' : preview ? 'Request fresh quote' : 'Request quote'} <ArrowRight size={16}/></button>
           {!preview && <p className={`sx-blocker ${nearBlocker ? '' : 'is-clear'}`} role="status" data-testid="status-near-quote-blocker">{nearBlocker || 'Ready for a quote. Requesting one sends nothing.'}</p>}
            {live && <button type="button" className="near-button near-button--wide near-button--subtle" disabled={!routeSafety.ready || !!requestId} onClick={() => { create.reset(); setRewardError(''); setRewardOptIn(false); setConfirm(true); trackEvent('swap_review_opened', { route: analyticsRoute }); }} data-testid="button-review-near-route">Review and create order <ArrowRight size={16}/></button>}
          </fieldset>
          {requestId && <div className="near-notice near-notice--warn" style={{ marginTop: 18 }} data-testid="near-request-preserved">
            <p>{createdOrder ? 'Order created. Review its final terms before continuing.' : 'This request may already have created an order. Do not submit a replacement. Check this saved receipt or contact support.'}</p>
            {createdOrder && <button type="button" className="near-button near-button--subtle" onClick={() => setConfirm(true)}>Review final order</button>}
            <Link href="/near-order" onClick={() => nearTrackingLink(requestId)} className="near-button near-button--text">Open saved receipt <ArrowRight size={14}/></Link>
          </div>}
          <p className="near-hint" style={{ textAlign: 'center', marginTop: 15 }}>Creating an order only prepares deposit instructions; it does not send funds.</p>
        </div>
        <div className="near-footline"><span><LockKeyhole size={13}/> Manual funding only</span><span><Clock3 size={13}/> Route status tracked separately</span></div>
      </section>
      <p className="near-below"><Link href="/docs/confidential-routing">How confidential routing differs from ZK shielding <ArrowRight size={13} aria-hidden="true"/></Link></p>
      <p className="near-below">Already created an order? <Link href="/near-order" data-testid="link-track-near-order">Track by deposit address</Link>. Never share a seed phrase with a swap service.</p>
    </main><Footer/>
    {confirm && preview && <div className="near-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !create.isPending && !creatingToken) setConfirm(false); }}><div className="near-modal" role="dialog" aria-modal="true" aria-labelledby="near-confirm-title">
      <div className="near-modal-head"><div><div className="near-kicker">{createdOrder ? 'ORDER CREATED / FINAL TERMS' : `QUOTE REVIEW / ${live ? `${secondsLeft}s LEFT` : 'EXPIRED'}`}</div><h2 id="near-confirm-title">{createdOrder ? 'Review the final order.' : 'Check every detail.'}</h2></div><button type="button" className="near-button near-button--text" aria-label="Close review" onClick={() => setConfirm(false)} disabled={create.isPending || creatingToken} data-testid="button-close-near-review"><X size={20}/></button></div>
      <p>{createdOrder ? 'The provider has issued an order. Its final output and fees may differ from the preview. No funds have moved.' : 'These are preview terms. No deposit address exists until the order is created.'}</p>
      {(!routeSafety.ready || (createdOrder?.routeStatus && createdOrder.routeStatus.eligibility !== 'allowed')) && <p className="near-notice near-notice--warn" role="status">New orders and funding guidance are paused while route impact is not verified. Existing receipt and live order tracking remain available.</p>}
      {(() => {
        const terms = createdOrder || preview;
        // Wording follows the origin of these exact terms, not the form's current picks.
        const sent = originTerms(terms.from);
        return <>
          <div className="near-detail"><span>Exact input</span><strong>{displayAmount(terms.amountIn)} {terms.from.symbol} · {sent.network}</strong></div>
          <div className="near-detail near-detail--stack"><span>{`${sent.network} asset ${sent.kind === 'token' ? sent.contractNoun : 'type'}`}</span><strong>{sent.assetDescription}{sent.evm && sent.kind === 'token' && <><br/>{sent.tokenTransfer}</>}</strong></div>
          <div className="near-detail"><span>Estimated output</span><strong>{displayAmount(terms.amountOut)} {terms.to.symbol} · {terms.to.chainName}</strong></div>
          {terms.to.chain === 'zec' && <div className="near-detail"><span>Payout receiver</span><strong>Native Zcash · shielded-only · no transparent fallback</strong></div>}
          <div className="near-detail"><span>{bridge ? 'Minimum received' : 'Minimum output'}</span><strong>{displayAmount(terms.minAmountOut)} {terms.to.symbol}</strong></div>
          {terms.appFeeBps !== undefined && <div className="near-detail"><span>DarkSwap fee (included in the quote)</span><strong>{(terms.appFeeBps / 100).toFixed(2)}%</strong></div>}
          {terms.withdrawFee !== undefined && <div className="near-detail"><span>Withdrawal fee (included in output)</span><strong>{displayAmount(terms.withdrawFee)} {terms.to.symbol}</strong></div>}
          {terms.refundFee !== undefined && <div className="near-detail"><span>Possible refund fee</span><strong>{displayAmount(terms.refundFee)} {terms.from.symbol}</strong></div>}
          <div className="near-detail"><span>Max slippage</span><strong>1%</strong></div>
          {bridge && <div className="near-detail"><span>Route</span><strong>NEAR Intents · confidential</strong></div>}
          <div className="near-detail near-detail--stack"><span>Recipient</span><strong>{terms.recipient}</strong></div>
          <div className="near-detail near-detail--stack"><span>{`Refund on ${sent.network}`}</span><strong>{terms.refundTo}</strong></div>
        </>;
      })()}
      {createdOrder ? <div className="near-detail"><span>Deposit deadline</span><strong>{new Date(createdOrder.deadline).toLocaleString()}</strong></div>
        : <div className="near-detail"><span>Quote expiry · 45s maximum</span><strong>{live ? `${secondsLeft} seconds remaining` : 'Expired'} · {new Date(expiresAt).toLocaleTimeString()}</strong></div>}
      <div className="near-notice near-notice--warn" style={{ marginTop: 18 }}>{createdOrder ? `Review the final terms above before opening the deposit instructions. ${capitalize(withArticle(originTerms(createdOrder.from).network))} deposit is public; only send if you accept these final details.` : `Creating an order does not transfer assets. You choose whether to send from your own ${originTerms(preview.from).network} wallet after seeing the final terms and deposit instructions.`}</div>
       {!createdOrder && <RewardOrderChoice opted={rewardOptIn} disabled={creatingToken || create.isPending} onChange={value => { setRewardOptIn(value); setRewardError(''); }}/>}
       {rewardError && <p className="near-error" role="alert">{rewardError}</p>}
      {create.isError && !createdOrder && <><p className="near-error" role="alert" data-testid="status-near-create-error">{errorText(create.error)}</p>{requestId && <Link href="/near-order" onClick={() => nearTrackingLink(requestId)} className="near-button near-button--subtle">Check if the order was created <ArrowRight size={14}/></Link>}</>}
       {createdOrder ? <button type="button" className="near-button near-button--wide" onClick={viewInstructions} data-testid="button-view-near-instructions">I reviewed the final terms · Check live order <ArrowRight size={16}/></button>
          : <button type="button" className="near-button near-button--wide" onClick={() => void createOrder()} disabled={!live || !routeSafety.ready || create.isPending || creatingToken || !!requestId} data-testid="button-confirm-near-order">{creatingToken ? 'Checking email session…' : create.isPending ? 'Creating instructions…' : requestId ? 'Check existing request before trying again' : !routeSafety.ready ? 'Route check required before creating' : rewardOptIn ? 'Create linked deposit instructions' : 'Create guest deposit instructions'} <Check size={16}/></button>}
       <button type="button" className="near-button near-button--text" style={{ display: 'flex', margin: '12px auto 0' }} onClick={() => setConfirm(false)} disabled={create.isPending || creatingToken} data-testid="button-cancel-near-order">{requestId ? 'Close review (saved receipt retained)' : 'Go back and edit'}</button>
    </div></div>}
  </div>;
}
