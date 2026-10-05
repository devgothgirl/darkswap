import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { getGetNearOrderReceiptQueryKey, getGetNearOrderStatusQueryKey, useGetNearOrderReceipt, useGetNearOrderStatus } from '@workspace/api-client-react';
import { CopyButton, errorText, Footer, Header } from '../components/swap-ui';
import { ClosedNotice, DepositCard, InfoTips, OrderMeta, SwapPair, UpdatesSignup, WaitingStepper } from '../components/waiting';
import { NearServiceNotice, useNearRouteSafety } from '../components/near-service-notice';
import { NearOrderReview } from '../components/near-order-review';
import { nearFundingReady, nearOrderFingerprint } from '../lib/near-funding-safety';
import { trackEvent } from '../lib/analytics';
import './near.css';
import './near-order.css';

const RECENT_KEY = 'dark-swap:near-recent-order';
const formatAmount = (value: string) => {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return value;
  const [whole, fraction] = value.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
};
const dateText = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
function recentOrder(): { address: string; memo: string; requestId?: string } | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || 'null');
    if (parsed && typeof parsed === 'object' && 'address' in parsed && typeof parsed.address === 'string' && 'memo' in parsed && typeof parsed.memo === 'string') return { address: parsed.address, memo: parsed.memo, ...('requestId' in parsed && typeof parsed.requestId === 'string' ? { requestId: parsed.requestId } : {}) };
  } catch { /* Storage is unavailable. */ }
  return null;
}

export default function NearOrderPage() {
  const [, navigate] = useLocation();
  const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const address = (search.get('address') || '').trim();
  const memo = (search.get('memo') || '').trim();
  const requestId = (search.get('requestId') || '').trim();
  const validRequestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId);
  const [lookupAddress, setLookupAddress] = useState('');
  const [lookupMemo, setLookupMemo] = useState('');
  const [lookupOpen, setLookupOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (address && address.length >= 32 && address.length <= 120) {
      try { localStorage.setItem(RECENT_KEY, JSON.stringify({ address, memo })); } catch { /* Storage is unavailable. */ }
    }
  }, [address, memo]);
  const receipt = useGetNearOrderReceipt(requestId, { query: { queryKey: getGetNearOrderReceiptQueryKey(requestId), enabled: !address && validRequestId, retry: 1, refetchInterval: 15_000 } });
  useEffect(() => {
    if (!receipt.data || address) return;
    const params = new URLSearchParams({ address: receipt.data.depositAddress });
    if (receipt.data.depositMemo) params.set('memo', receipt.data.depositMemo);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify({ address: receipt.data.depositAddress, memo: receipt.data.depositMemo || '', requestId })); } catch { /* Storage may be unavailable. */ }
    navigate(`/near-order?${params.toString()}`);
  }, [receipt.data, address, requestId, navigate]);
  const params = { depositAddress: address, ...(memo ? { depositMemo: memo } : {}) };
  const validAddress = address.length >= 32 && address.length <= 120 && memo.length <= 120;
  const result = useGetNearOrderStatus(params, { query: { queryKey: getGetNearOrderStatusQueryKey(params), enabled: validAddress, refetchInterval: 15_000, refetchOnMount: 'always', refetchOnWindowFocus: 'always', staleTime: 0, retry: 1 } });
  const order = result.data;
  const routeSafety = useNearRouteSafety(order?.from.chain ?? 'sol', order?.to.chain);
  const [acceptedFingerprint, setAcceptedFingerprint] = useState<string | null>(null);
  const fingerprint = order ? nearOrderFingerprint(order) : null;
  useEffect(() => { setAcceptedFingerprint(null); }, [fingerprint, address, memo]);
  const accepted = !!fingerprint && acceptedFingerprint === fingerprint;
  const deadline = order ? new Date(order.deadline).getTime() : 0;
  const deadlinePassed = !!order && (!Number.isFinite(deadline) || deadline <= now);
  const remaining = order && !deadlinePassed ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
  const status = order?.status;
  const waiting = status === 'PENDING_DEPOSIT';
  const partial = status === 'INCOMPLETE_DEPOSIT';
  const processing = status === 'KNOWN_DEPOSIT_TX' || status === 'PROCESSING';
  const success = status === 'SUCCESS';
  const stopped = status === 'FAILED' || status === 'REFUNDED';
  const canFund = nearFundingReady({
    order, acceptedFingerprint, orderUpdatedAt: result.dataUpdatedAt,
    orderError: result.isError || !result.isFetchedAfterMount, orderFetchStatus: result.fetchStatus,
    routeStatus: routeSafety.query.data, routeUpdatedAt: routeSafety.query.dataUpdatedAt,
    routeError: routeSafety.query.isError || !routeSafety.query.isFetchedAfterMount,
    routeFetchStatus: routeSafety.query.fetchStatus, online: routeSafety.online, now: Math.max(now, routeSafety.now),
  });
  const canReview = !!order && !result.isError && result.isFetchedAfterMount &&
    routeSafety.online && result.fetchStatus !== 'paused' && now - result.dataUpdatedAt <= 30_000;
  const statusName: Record<string, string> = {
    PENDING_DEPOSIT: 'Awaiting deposit', KNOWN_DEPOSIT_TX: 'Deposit detected', INCOMPLETE_DEPOSIT: 'Partial deposit',
    PROCESSING: 'Processing route', SUCCESS: 'Completed', REFUNDED: 'Refunded', FAILED: 'Failed'
  };
  const stage = success ? 3 : status === 'PROCESSING' ? 2 : status === 'KNOWN_DEPOSIT_TX' || partial ? 1 : status === 'REFUNDED' || status === 'FAILED' ? 1 : 0;
  // The provider's stage name only; never the order identifier, amount or addresses.
  const trackedStatus = useRef('');
  useEffect(() => {
    const name = status && Object.hasOwn(statusName, status) ? status.toLowerCase() : '';
    if (!name || trackedStatus.current === name) return;
    trackedStatus.current = name;
    trackEvent('order_status_viewed', { route: 'privacy_swap', status: name });
  }, [status]);
  const submitLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lookupAddress.trim().length < 32 || lookupAddress.trim().length > 120 || lookupMemo.trim().length > 120) return;
    const next = new URLSearchParams({ address: lookupAddress.trim() });
    if (lookupMemo.trim()) next.set('memo', lookupMemo.trim());
    setLookupOpen(false);
    navigate(`/near-order?${next.toString()}`);
  };
  const recent = recentOrder();
  const lookupForm = <form onSubmit={submitLookup}>
    <div className="near-field" style={{ marginTop: 23 }}><label className="near-label" htmlFor="near-lookup-address">Deposit address</label><input id="near-lookup-address" className="near-input" value={lookupAddress} onChange={e => setLookupAddress(e.target.value)} placeholder="Paste the deposit address" maxLength={120} autoComplete="off" data-testid="input-near-lookup-address"/></div>
    <div className="near-field"><label className="near-label" htmlFor="near-lookup-memo">Deposit memo, if provided</label><input id="near-lookup-memo" className="near-input" value={lookupMemo} onChange={e => setLookupMemo(e.target.value)} placeholder="Optional memo" maxLength={120} autoComplete="off" data-testid="input-near-lookup-memo"/></div>
    <button className="near-button near-button--wide" type="submit" disabled={lookupAddress.trim().length < 32 || lookupAddress.trim().length > 120 || lookupMemo.trim().length > 120} data-testid="button-lookup-near-order">Find order <ArrowRight size={16}/></button>
  </form>;
  const review = order && <NearOrderReview order={order} accepted={accepted} canReview={canReview} onAccept={() => { if (canReview) setAcceptedFingerprint(nearOrderFingerprint(order)); }}/>;
  const detailsButton = <button type="button" className="near-button near-button--subtle" onClick={() => setDetailsOpen(!detailsOpen)} aria-expanded={detailsOpen} aria-controls="near-full-order-record" data-testid="button-near-show-route-details">{detailsOpen ? 'Hide' : 'Show'} route details</button>;
  return <div className="near-shell near-tracking-shell"><Header/>
    <main className="near-main near-main--order">
      <Link href="/near-swap" className="near-button near-button--text nt-back" data-testid="link-back-near-swap"><ArrowLeft size={14}/> Back to privacy swap</Link>
      <div className="near-intro nt-intro"><div className="near-kicker">Order progress / Privacy swap</div><h1>Follow your route</h1><p>Deposit instructions and status, together in one place.</p></div>
      {(!validAddress || result.isLoading || result.isError || !order) && <NearServiceNotice safety={routeSafety}/>}
       {!address && requestId ? <section className="near-order-card" style={{ maxWidth: 590, margin: '0 auto' }}>
         <div className="near-kicker">RECOVER YOUR ORDER</div><h2>Checking the saved receipt.</h2>
         {receipt.isLoading ? <p className="near-hint">Checking whether the provider issued deposit instructions. No funds have moved.</p>
           : receipt.data ? <p className="near-hint">Order found. Opening its final details…</p>
           : <><p className="near-error" role="alert" data-testid="status-near-receipt-error">{validRequestId && receipt.isError ? errorText(receipt.error) : 'This receipt ID is invalid.'} No deposit instructions are available. Do not send funds.</p><button className="near-button near-button--subtle" type="button" onClick={() => receipt.refetch()} disabled={!validRequestId || receipt.isFetching}><RefreshCw size={14}/> Check again</button><p className="near-hint">Keep this saved receipt and check again, or contact support with the receipt ID. Do not create a replacement order while this request is uncertain, and do not use an address you cannot verify here.</p></>}
         <Link href="/near-order" className="near-button near-button--text" style={{ marginTop: 14 }}>Look up by deposit address</Link>
       </section> : !address ? <section className="near-order-card" style={{ maxWidth: 590, margin: '0 auto' }}>
        <div className="near-kicker">FIND AN ORDER</div><h2>Look up by deposit address</h2><p className="near-hint">Enter the Solana deposit address from your order. Include its memo if one was provided.</p>
        {lookupForm}
         {recent && (recent.address || recent.requestId) && <button className="near-button near-button--subtle" type="button" style={{ marginTop: 18 }} onClick={() => { const next = recent.address ? new URLSearchParams({ address: recent.address }) : new URLSearchParams({ requestId: recent.requestId! }); if (recent.address && recent.memo) next.set('memo', recent.memo); navigate(`/near-order?${next.toString()}`); }} data-testid="button-open-recent-near-order">Open recent order <ArrowRight size={14}/></button>}
        <div style={{ marginTop: 22 }}><UpdatesSignup/></div>
      </section> : !validAddress ? <section className="near-order-card" style={{ maxWidth: 590, margin: '0 auto' }}><ShieldAlert size={25} color="#af83f1"/><h2 style={{ marginTop: 15 }}>Check the deposit address</h2><p className="near-error" role="alert" data-testid="status-near-order-invalid">The address must be 32–120 characters and the memo no more than 120 characters. Nothing has been sent.</p><Link href="/near-order" className="near-button near-button--subtle" data-testid="link-retry-near-lookup">Look up another address</Link></section>
      : result.isLoading ? <div className="near-order-grid" data-testid="status-near-order-loading"><div className="near-order-card"><div className="near-skeleton"/><div className="near-skeleton"/><div className="near-skeleton"/></div><div className="near-order-card"><div className="near-skeleton"/><div className="near-skeleton"/></div></div>
      : result.isError || !order ? <section className="near-order-card" style={{ maxWidth: 590, margin: '0 auto' }}><ShieldAlert size={25} color="#af83f1"/><h2 style={{ marginTop: 15 }}>We could not retrieve this order.</h2><p className="near-error" role="alert" data-testid="status-near-order-error">{result.isError ? errorText(result.error) : 'The provider returned no order for this address.'}</p><p className="near-hint">Check the deposit address and any required memo for typos. If the order was just created, wait a moment and retry. Do not send funds until the order details appear.</p><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 19 }}><button type="button" className="near-button near-button--subtle" onClick={() => result.refetch()} data-testid="button-retry-near-order"><RefreshCw size={14}/> Try again</button><Link href="/near-order" className="near-button near-button--subtle" data-testid="link-edit-near-lookup">Use another address</Link></div></section>
      : <><div className="ws-wrap" data-testid="waiting-view">
          <WaitingStepper tracking stage={stage} reviewFirst={waiting && !accepted} halted={stopped || partial || (waiting && !canFund)} haltLabel={waiting && !canFund ? deadlinePassed ? 'Deadline passed' : 'Funding checks required' : statusName[order.status] || order.status}/>
          <OrderMeta items={[{ label: 'Route', value: `${order.from.chainName} → ${order.to.chainName}` }, { label: 'Status', value: <span role="status" data-testid="status-near-order">{statusName[order.status] || order.status}</span> }, ...(order.updatedAt ? [{ label: 'Provider updated', value: dateText(order.updatedAt) }] : [])]}/>
          <SwapPair tracking inAmount={formatAmount(order.amountIn)} inSymbol={order.from.symbol} outAmount={formatAmount(order.amountOut)} outSymbol={order.to.symbol} outNetwork={order.to.chainName} inputLabel={canFund ? 'Send' : 'Quoted input'} estimated/>
          {!routeSafety.ready && <NearServiceNotice safety={routeSafety}/>}
          {!accepted ? review : <details className="nt-disclosure nt-reviewed"><summary data-testid="toggle-near-accepted-review">Final terms reviewed · Review accepted terms</summary>{review}</details>}
          <div className="nt-deposit-grid">
            {canFund ? <DepositCard amount={order.amountIn} symbol={order.from.symbol} assetKind={order.from.contractAddress ? 'spl' : 'native'} mint={order.from.contractAddress || undefined} address={order.depositAddress} memo={order.depositMemo || undefined} recipient={order.recipient} deadlineText={dateText(order.deadline)} remainingText={`${Math.floor(remaining / 60)}m ${remaining % 60}s left`} deadlineInSidePanel actions={detailsButton}/>
              : <div className="nt-paused-deposit"><ClosedNotice title={success ? 'Completed. Do not send more funds.' : stopped ? 'Order closed. Do not send funds.' : partial ? 'Partial deposit detected. Do not send again without guidance.' : processing ? 'Deposit detected. Do not send again.' : deadlinePassed ? 'Deposit deadline passed. Do not send funds.' : 'Deposit guidance paused. Do not send funds.'}>{success ? 'The provider reports the destination transfer as complete.' : processing ? 'The route is in progress. Follow the live status below.' : waiting ? !accepted ? 'Review and accept the final live order terms above. Fresh order and route checks are also required before any deposit guidance appears.' : 'Fresh online order status and a verified route incident check are required. Keep this receipt and check again; do not create a replacement order.' : 'Keep your transaction hash for a support inquiry if you already sent. Recovery is not guaranteed.'}</ClosedNotice><div className="nt-deposit-actions">{detailsButton}</div></div>}
            <aside className="nt-deadline" aria-label="Deposit deadline and manual guidance">
              <Clock3 size={30} aria-hidden="true"/>
              <span className="nt-deadline-label">{canFund ? 'Deposit time left' : 'Deposit guidance'}</span>
              <strong data-testid="text-near-live-countdown">{canFund ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : success ? 'Completed' : stopped ? 'Order closed' : partial ? 'Partial deposit' : processing ? 'In progress' : deadlinePassed ? 'Deadline passed' : 'Funding paused'}</strong>
              <span className="nt-deadline-label">Deposit deadline</span>
              <time dateTime={order.deadline} data-testid="text-near-live-deadline">{dateText(order.deadline)}</time>
              <p>{canFund ? 'Manual deposit only. Use your own Solana wallet and send once before the deadline.' : 'Do not send funds. Keep your order record and follow the live status.'}</p>
              <small>No payable QR code.<br/>No wallet connected.</small>
            </aside>
          </div>
          {canFund && <InfoTips assetKind={order.from.contractAddress ? 'spl' : 'native'} symbol={order.from.symbol} hasMemo={!!order.depositMemo} showPrivacyTip tracking/>}
          {routeSafety.ready && <details className="nt-disclosure"><summary data-testid="toggle-near-route-check">Route incident check · View live check and safety notes</summary><NearServiceNotice safety={routeSafety}/></details>}
        </div>
        <details className="ws-details" id="near-full-order-record" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary data-testid="toggle-near-order-details">{detailsOpen ? 'Hide' : 'Show'} route details · Full order record, status history and fees</summary>
        <div className="near-order-grid">
        <section className="near-order-card">
          <div className="near-kicker">01 / DEPOSIT DETAILS</div><h2>{canFund ? 'Your decision to fund' : 'Deposit record'}</h2>
          {canFund ? <div className="near-notice">This order is awaiting a deposit. If you decide to proceed, manually send the exact amount on Solana before the deadline. No wallet is connected here.</div>
            : <div className="near-notice near-notice--warn" role="status" data-testid="status-near-deposit-guidance">{success ? 'This order is complete. Do not send any more funds.' : stopped ? 'This order is closed. Do not send funds to this address. Keep your transaction details for a support inquiry if needed.' : partial ? 'A partial deposit was detected. Do not send another transfer without provider guidance. Keep your transaction hash and request help; recovery is not guaranteed.' : deadlinePassed ? 'The deposit deadline passed. Do not send funds to this address. If you already sent, keep your transaction hash for a support inquiry.' : processing ? 'A deposit was detected and the route is in progress. Do not send again.' : 'The current status is not an invitation to send funds. Check provider guidance before taking action.'}</div>}
          <div className="near-order-amount"><small>{canFund ? 'SEND EXACTLY / SOLANA NETWORK' : 'QUOTED INPUT / SOLANA NETWORK'}</small><strong data-testid="text-near-deposit-amount">{formatAmount(order.amountIn)} <em>{order.from.symbol}</em></strong></div>
           <div className="near-detail near-detail--stack"><span>Solana asset {order.from.contractAddress ? 'mint · SPL token transfer' : 'type · native SOL transfer'}</span><strong data-testid="text-near-source-mint">{order.from.contractAddress || 'Native SOL (not an SPL token)'}</strong></div>
          <div className="near-detail near-detail--stack"><span>Solana deposit address{!canFund && ' · record only'}</span><div className="near-copy-row"><strong data-testid="text-near-deposit-address">{order.depositAddress}</strong>{canFund && <CopyButton value={order.depositAddress} name="deposit address"/>}</div></div>
          {order.depositMemo && <div className="near-detail near-detail--stack"><span>Deposit memo {canFund ? '— include with transfer' : '· record only'}</span><div className="near-copy-row"><strong data-testid="text-near-deposit-memo">{order.depositMemo}</strong>{canFund && <CopyButton value={order.depositMemo} name="deposit memo"/>}</div></div>}
          <div className="near-detail"><span>Deposit deadline</span><strong data-testid="text-near-deadline">{dateText(order.deadline)} {canFund && <small style={{ display: 'block', color: '#c9a8f6', marginTop: 5 }}>{Math.floor(remaining / 60)}m {remaining % 60}s left</small>}</strong></div>
          {canFund && <p className="near-hint" style={{ marginTop: 15 }}>Solana only. If your wallet deducts a fee from the entered amount, ensure the amount received matches the exact quoted input. If a memo is shown, include it.</p>}
        </section>
        <div style={{ display: 'grid', gap: 18 }}>
          <section className="near-order-card" aria-live="polite"><div className="near-kicker">02 / PROVIDER STATUS</div><h2>Route progress</h2><span className={`near-status ${partial || stopped || deadlinePassed && waiting ? 'near-status--warn' : ''}`}>{statusName[order.status] || order.status}</span>
            <ol className="near-steps"><li><b>01</b><span>Order created · deposit instructions issued</span></li><li><b>02</b><span>{waiting ? 'Awaiting a Solana deposit' : partial ? 'Partial deposit reported' : 'Deposit stage updated by provider'}</span></li><li><b>03</b><span>{success ? 'Destination transfer reported complete' : stopped ? 'Route closed without a completed transfer' : processing ? 'Route processing' : 'Destination transfer not confirmed'}</span></li></ol>
            <p className="near-hint">Checks automatically every 15 seconds. {order.updatedAt ? `Provider updated ${dateText(order.updatedAt)}.` : 'Provider update time unavailable.'} Estimated route time: ~{Math.ceil(order.estimatedSeconds / 60)} min.</p>
          </section>
           <section className="near-order-card"><div className="near-kicker">03 / ORDER RECORD</div><h2>Keep these details</h2><div className="near-detail"><span>Estimated output</span><strong data-testid="text-near-order-output">{formatAmount(order.amountOut)} {order.to.symbol} · {order.to.chainName}</strong></div><div className="near-detail"><span>Minimum output</span><strong>{formatAmount(order.minAmountOut)} {order.to.symbol}</strong></div>{order.appFeeBps !== undefined && <div className="near-detail"><span>DarkSwap fee (included in the quote)</span><strong>{(order.appFeeBps / 100).toFixed(2)}%</strong></div>}{order.withdrawFee !== undefined && <div className="near-detail"><span>Withdrawal fee (included in output)</span><strong>{formatAmount(order.withdrawFee)} {order.to.symbol}</strong></div>}{order.refundFee !== undefined && <div className="near-detail"><span>Possible refund fee</span><strong>{formatAmount(order.refundFee)} {order.from.symbol}</strong></div>}<div className="near-detail near-detail--stack"><span>Recipient</span><strong data-testid="text-near-order-recipient">{order.recipient}</strong></div><div className="near-detail near-detail--stack"><span>Solana refund address</span><strong data-testid="text-near-order-refund">{order.refundTo}</strong></div><p className="near-hint" style={{ marginTop: 17 }}><Clock3 size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }}/>Origin deposits on Solana are public. Confidential mode is requested for this route, not a guarantee of anonymity or unlinkability.</p></section>
        </div>
      </div></details>
        <div className="nt-bottom-actions">
          <button type="button" className="near-button near-button--subtle" disabled={result.isFetching} onClick={() => result.refetch()} data-testid="button-refresh-near-order"><RefreshCw size={14}/>{result.isFetching ? 'Checking…' : 'Check status'}</button>
          <button type="button" className="nt-inline" onClick={() => setLookupOpen(!lookupOpen)} aria-expanded={lookupOpen} aria-controls="near-bottom-lookup" data-testid="button-toggle-near-lookup">{lookupOpen ? 'Close lookup' : 'Look up an order'}</button>
        </div>
        <p className="nt-polling" role="status" data-testid="status-near-live-polling">{result.isFetching ? 'Checking live order status…' : 'Checks automatically every 15 seconds.'} {order.updatedAt ? `Provider updated ${dateText(order.updatedAt)}.` : 'Provider update time unavailable.'}</p>
        {lookupOpen && <section className="near-order-card nt-lookup" id="near-bottom-lookup"><h2>Look up by deposit address</h2><p className="near-hint">Use your saved Solana deposit address and include its memo if provided.</p>{lookupForm}</section>}
        <p className="nt-bottom">Need a different destination? <Link href="/near-swap" data-testid="link-near-prepare-new-route">Prepare a new route →</Link></p>
        <details className="nt-disclosure nt-updates"><summary data-testid="toggle-near-updates">Optional · Discounts and product updates</summary><UpdatesSignup/></details>
      </>}
    </main><Footer/>
  </div>;
}