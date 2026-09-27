import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronDown, Clock3, LockKeyhole, Search, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { getGetNearTokensQueryKey, useCreateNearOrder, useGetNearQuote, useGetNearTokens } from '@workspace/api-client-react';
import type { NearOrder, NearQuote, NearToken } from '@workspace/api-client-react';
import { errorText, Footer, Header } from '../components/swap-ui';
import './near.css';

const RECENT_KEY = 'dark-swap:near-recent-order';
const displayAmount = (value: string) => {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return value;
  const [whole, fraction] = value.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
};

function AssetPicker({ side, token, onPick }: { side: 'source' | 'destination'; token: NearToken | null; onPick: (token: NearToken) => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSearch(term.trim()), 250); return () => clearTimeout(timer); }, [term]);
  const params = { side, ...(search ? { term: search } : {}) };
  const tokens = useGetNearTokens(params, { query: { queryKey: getGetNearTokensQueryKey(params), enabled: open, retry: 1, staleTime: 30_000 } });
  return <>
    <button className="near-asset-trigger" type="button" aria-expanded={open} aria-label={`Choose ${side} asset`} onClick={() => setOpen(!open)} data-testid={`button-near-${side}-asset`}>
      {token && <span className="near-token-glyph">{token.symbol.slice(0, 1)}</span>}
      <span>{token ? token.symbol : 'Select asset'}</span><ChevronDown size={14}/>
    </button>
    {open && <div className="near-picker">
      <div className="near-picker-title"><span>{side === 'source' ? 'SOLANA ASSETS' : 'DESTINATION ASSETS'}</span><button className="near-button near-button--text" type="button" onClick={() => setOpen(false)} aria-label="Close asset list" data-testid={`button-close-near-${side}-assets`}><X size={16}/></button></div>
      <div style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', top: 16, left: 12, color: '#ac9dbc' }}/><input className="near-input" style={{ paddingLeft: 34 }} value={term} onChange={e => setTerm(e.target.value)} placeholder="Search assets or networks" aria-label={`Search ${side} assets`} autoFocus data-testid={`input-search-near-${side}`}/></div>
      <div className="near-picker-list" role="listbox" aria-label={`${side} assets`}>
        {tokens.isLoading || (tokens.isFetching && search !== term.trim()) ? <><div className="near-skeleton"/><div className="near-skeleton"/></>
          : tokens.isError ? <div><p className="near-error" role="alert">{errorText(tokens.error)}</p><button className="near-button near-button--subtle" type="button" onClick={() => tokens.refetch()} data-testid={`button-retry-near-${side}-assets`}>Try again</button></div>
          : !tokens.data?.tokens.length ? <p className="near-hint" data-testid={`status-near-${side}-empty`}>No supported assets found. Try another search.</p>
          : tokens.data.tokens.map(asset => <button className="near-picker-item" role="option" aria-selected={token?.id === asset.id} key={asset.id} type="button" onClick={() => { onPick(asset); setOpen(false); setTerm(''); setSearch(''); }} data-testid={`button-near-${side}-token-${asset.id}`}>
            <span className="near-token-glyph">{asset.symbol.slice(0, 1)}</span><span>{asset.symbol}<small>{asset.id}</small></span><em>{asset.chainName}</em>
          </button>)}
      </div>
    </div>}
  </>;
}

export default function NearSwapPage() {
  const [, navigate] = useLocation();
  const [from, setFrom] = useState<NearToken | null>(null);
  const [to, setTo] = useState<NearToken | null>(null);
  const [amount, setAmount] = useState('');
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
  const create = useCreateNearOrder();
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const invalidate = () => { generation.current++; setPreview(null); setConfirm(false); setCreatedOrder(null); setRequestId(''); quote.reset(); create.reset(); };
  const amountValid = /^(?:\d+)(?:\.\d+)?$/.test(amount) && Number(amount) > 0 && amount.length <= 40 && (!from || (amount.split('.')[1]?.length || 0) <= from.decimals);
  const canQuote = Boolean(from && to && from.id !== to.id && amountValid && recipient.trim().length > 0 && recipient.trim().length <= 120 && refundTo.trim().length > 0 && refundTo.trim().length <= 120);
  const expiresAt = preview ? Math.min(new Date(preview.validUntil).getTime(), quotedAt + 45_000) : 0;
  const secondsLeft = preview ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const live = !!preview && Number.isFinite(expiresAt) && secondsLeft > 0;
  const requestQuote = () => {
    if (!canQuote || !from || !to || quote.isPending) return;
    const request = ++generation.current;
    setPreview(null);
    setConfirm(false);
    quote.mutate({ data: { from: from.id, to: to.id, amount, recipient: recipient.trim(), refundTo: refundTo.trim() } }, {
      onSuccess: result => { if (generation.current === request) { setPreview(result); setQuotedAt(Date.now()); } }
    });
  };
  const createOrder = () => {
    if (!preview || !live || create.isPending) return;
    const id = crypto.randomUUID();
    setRequestId(id);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify({ address: '', memo: '', requestId: id })); } catch { /* Storage may be unavailable. */ }
    create.mutate({ data: { quoteId: preview.quoteId, requestId: id } }, {
      onSuccess: order => {
        try { localStorage.setItem(RECENT_KEY, JSON.stringify({ address: order.depositAddress, memo: order.depositMemo || '', requestId: id })); } catch { /* Storage may be unavailable. */ }
        setCreatedOrder(order);
      }
    });
  };
  const viewInstructions = () => {
    if (!createdOrder) return;
    const params = new URLSearchParams({ address: createdOrder.depositAddress });
    if (createdOrder.depositMemo) params.set('memo', createdOrder.depositMemo);
    navigate(`/near-order?${params.toString()}`);
  };
  return <div className="near-shell"><Header/>
    <main className="near-main">
      <div className="near-intro"><div className="near-kicker"><span className="near-symbol" aria-hidden="true">⋈</span> DARKSWAP / PRIVACY SWAP</div><h1>Review the route.<br/>Then decide.</h1><p>A wallet-free way to prepare a Solana-origin swap. Request a confidential-mode route, inspect its terms, and decide whether to fund it yourself.</p></div>
      <section className="near-panel" aria-label="Privacy swap form">
        <div className="near-panel-head"><div><strong>Prepare your swap</strong><span>SOLANA ORIGIN → SUPPORTED DESTINATION</span></div><span className="near-route-mark" aria-hidden="true">⋈</span></div>
        <div className="near-panel-body">
          <div className="near-field"><div className="near-label"><label htmlFor="near-amount">You send</label><small>Solana network</small></div><div className="near-asset-row"><input id="near-amount" className="near-amount" type="text" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); invalidate(); }} placeholder="0.00" autoComplete="off" data-testid="input-near-amount"/><AssetPicker side="source" token={from} onPick={v => { setFrom(v); invalidate(); }}/></div>{amount && !amountValid && <p className="near-error" role="alert">Enter a positive amount with no more than {from?.decimals ?? 12} decimal places.</p>}</div>
          <div className="near-divide"><ArrowDown size={15}/></div>
          <div className="near-field"><div className="near-label"><span>Estimated receive</span><small>{to?.chainName || 'Choose a network'}</small></div><div className="near-asset-row"><div className="near-amount" data-testid="text-near-estimated-receive">{live ? displayAmount(preview!.amountOut) : '—'}</div><AssetPicker side="destination" token={to} onPick={v => { setTo(v); invalidate(); }}/></div>{from && to && from.id === to.id && <p className="near-error" role="alert">Choose a different destination asset.</p>}</div>
          <div className="near-field"><div className="near-label"><label htmlFor="near-recipient">Recipient address</label><small>{to?.chainName || 'Destination network'}</small></div><input id="near-recipient" className="near-input" value={recipient} maxLength={120} onChange={e => { setRecipient(e.target.value); invalidate(); }} placeholder="Address that will receive the output" autoComplete="off" data-testid="input-near-recipient"/><p className="near-hint">Check the destination network and address carefully. Transfers cannot be reversed.</p></div>
          <div className="near-field"><div className="near-label"><label htmlFor="near-refund">Refund address</label><small>Solana network</small></div><input id="near-refund" className="near-input" value={refundTo} maxLength={120} onChange={e => { setRefundTo(e.target.value); invalidate(); }} placeholder="Your Solana address for a possible refund" autoComplete="off" data-testid="input-near-refund"/><p className="near-hint">Use an address you control on Solana. A refund, if applicable, is not guaranteed.</p></div>
          <div className="near-notice">This route requests confidential handling. Your Solana origin deposit is public. This does not guarantee anonymity, unlinkability, or route availability.</div>
          <div className="near-quote" aria-live="polite"><div className="near-quote-top"><span>ROUTE PREVIEW</span><span>{live ? `${secondsLeft}s LEFT` : preview ? 'EXPIRED' : 'NOT REQUESTED'}</span></div>
             {quote.isPending && !preview ? <><div className="near-skeleton"/><div className="near-skeleton"/></> : live && preview ? <div className="near-quote-grid"><div><small>Estimated output</small><strong data-testid="text-near-quote-output">{displayAmount(preview.amountOut)} {preview.to.symbol}</strong></div><div><small>Minimum output</small><strong data-testid="text-near-quote-minimum">{displayAmount(preview.minAmountOut)} {preview.to.symbol}</strong></div><div><small>Expected duration</small><strong>~{Math.ceil(preview.estimatedSeconds / 60)} min</strong></div><div><small>Max slippage</small><strong>1%</strong></div>{preview.withdrawFee !== undefined && <div><small>Withdrawal fee (included in output)</small><strong>{displayAmount(preview.withdrawFee)} {preview.to.symbol}</strong></div>}{preview.refundFee !== undefined && <div><small>Possible refund fee</small><strong>{displayAmount(preview.refundFee)} {preview.from.symbol}</strong></div>}</div> : <p data-testid="status-near-quote">{preview ? 'This quote has expired. Request a fresh quote before continuing.' : 'Nothing is reserved yet. Complete the fields, then request a dry quote to see the route.'}</p>}
            {quote.isError && !preview && <p className="near-error" role="alert" data-testid="status-near-quote-error">{errorText(quote.error)}</p>}
          </div>
          <button type="button" className="near-button near-button--wide" onClick={requestQuote} disabled={!canQuote || quote.isPending || create.isPending} data-testid="button-request-near-quote">{quote.isPending ? 'Requesting quote…' : preview ? 'Request fresh quote' : 'Request quote'} <ArrowRight size={16}/></button>
          {live && <button type="button" className="near-button near-button--wide near-button--subtle" onClick={() => { create.reset(); setConfirm(true); }} data-testid="button-review-near-route">Review and create order <ArrowRight size={16}/></button>}
          <p className="near-hint" style={{ textAlign: 'center', marginTop: 15 }}>No wallet connection. Creating an order only prepares deposit instructions; it does not send funds.</p>
        </div>
        <div className="near-footline"><span><LockKeyhole size={13}/> Manual funding only</span><span><Clock3 size={13}/> Route status tracked separately</span></div>
      </section>
      <p className="near-below">Already created an order? <Link href="/near-order" data-testid="link-track-near-order">Track by deposit address</Link>. Never share a seed phrase with a swap service.</p>
    </main><Footer/>
    {confirm && preview && <div className="near-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !create.isPending) setConfirm(false); }}><div className="near-modal" role="dialog" aria-modal="true" aria-labelledby="near-confirm-title">
      <div className="near-modal-head"><div><div className="near-kicker">{createdOrder ? 'ORDER CREATED / FINAL TERMS' : `QUOTE REVIEW / ${live ? `${secondsLeft}s LEFT` : 'EXPIRED'}`}</div><h2 id="near-confirm-title">{createdOrder ? 'Review the final order.' : 'Check every detail.'}</h2></div><button type="button" className="near-button near-button--text" aria-label="Close review" onClick={() => setConfirm(false)} disabled={create.isPending} data-testid="button-close-near-review"><X size={20}/></button></div>
      <p>{createdOrder ? 'The provider has issued an order. Its final output and fees may differ from the preview. No funds have moved.' : 'These are preview terms. No deposit address exists until the order is created.'}</p>
      {(() => {
        const terms = createdOrder || preview;
        return <>
          <div className="near-detail"><span>Exact input</span><strong>{displayAmount(terms.amountIn)} {terms.from.symbol} · Solana</strong></div>
          <div className="near-detail near-detail--stack"><span>Solana asset {terms.from.contractAddress ? 'mint' : 'type'}</span><strong>{terms.from.contractAddress || 'Native SOL (not an SPL token)'}</strong></div>
          <div className="near-detail"><span>Estimated output</span><strong>{displayAmount(terms.amountOut)} {terms.to.symbol} · {terms.to.chainName}</strong></div>
          <div className="near-detail"><span>Minimum output</span><strong>{displayAmount(terms.minAmountOut)} {terms.to.symbol}</strong></div>
          {terms.withdrawFee !== undefined && <div className="near-detail"><span>Withdrawal fee (included in output)</span><strong>{displayAmount(terms.withdrawFee)} {terms.to.symbol}</strong></div>}
          {terms.refundFee !== undefined && <div className="near-detail"><span>Possible refund fee</span><strong>{displayAmount(terms.refundFee)} {terms.from.symbol}</strong></div>}
          <div className="near-detail"><span>Max slippage</span><strong>1%</strong></div>
          <div className="near-detail near-detail--stack"><span>Recipient</span><strong>{terms.recipient}</strong></div>
          <div className="near-detail near-detail--stack"><span>Refund on Solana</span><strong>{terms.refundTo}</strong></div>
        </>;
      })()}
      {createdOrder ? <div className="near-detail"><span>Deposit deadline</span><strong>{new Date(createdOrder.deadline).toLocaleString()}</strong></div>
        : <div className="near-detail"><span>Quote expiry · 45s maximum</span><strong>{live ? `${secondsLeft} seconds remaining` : 'Expired'} · {new Date(expiresAt).toLocaleTimeString()}</strong></div>}
      <div className="near-notice near-notice--warn" style={{ marginTop: 18 }}>{createdOrder ? 'Review the final terms above before opening the deposit instructions. A Solana deposit is public; only send if you accept these final details.' : 'Creating an order does not transfer assets. You choose whether to send from your own Solana wallet after seeing the final terms and deposit instructions.'}</div>
      {create.isError && !createdOrder && <><p className="near-error" role="alert" data-testid="status-near-create-error">{errorText(create.error)}</p>{requestId && <Link href={`/near-order?requestId=${encodeURIComponent(requestId)}`} className="near-button near-button--subtle">Check if the order was created <ArrowRight size={14}/></Link>}</>}
      {createdOrder ? <button type="button" className="near-button near-button--wide" onClick={viewInstructions} data-testid="button-view-near-instructions">I reviewed the final terms · View deposit instructions <ArrowRight size={16}/></button>
        : <button type="button" className="near-button near-button--wide" onClick={createOrder} disabled={!live || create.isPending || !!requestId} data-testid="button-confirm-near-order">{create.isPending ? 'Creating instructions…' : requestId ? 'Check existing request before trying again' : 'Create deposit instructions'} <Check size={16}/></button>}
      <button type="button" className="near-button near-button--text" style={{ display: 'flex', margin: '12px auto 0' }} onClick={() => setConfirm(false)} disabled={create.isPending} data-testid="button-cancel-near-order">{createdOrder ? 'Leave this order (recover from Track)' : 'Go back and edit'}</button>
    </div></div>}
  </div>;
}