import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ClipboardPaste, RefreshCw, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { createPrivateOrder, getGetPrivateQuotesQueryKey, useGetPrivateQuotes } from '@workspace/api-client-react';
import type { PrivateQuote, SwapToken } from '@workspace/api-client-react';
import { errorText, Footer, Header, TokenPicker, useRecentOrder } from '../components/swap-ui';
import { RewardOrderChoice } from '../components/reward-enrollment';
import { RouteTabs, carriedAmount } from '../components/route-tabs';
import { useRewards } from '../hooks/use-rewards';
import { trackEvent } from '../lib/analytics';
import './swap.css';

const formatNumber = (n:number, maximumFractionDigits=8) => new Intl.NumberFormat('en-US',{maximumFractionDigits}).format(n);
const formatUsd = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const formatTtl = (s:number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
const MINIMUM_SWAP_USD = 3;
const QUOTE_MAX_AGE_S = 240;
const AUTO_REFRESH_S = 60;

export default function Home() {
  const [, navigate] = useLocation();
  const rewards = useRewards();
  const [rewardOptIn, setRewardOptIn] = useState(false);
  const [rewardError, setRewardError] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const recent = useRecentOrder();
  const [from, setFrom] = useState<SwapToken|null>(null);
  const [to, setTo] = useState<SwapToken|null>(null);
  const [amount, setAmount] = useState(carriedAmount);
  const [debouncedAmount, setDebouncedAmount] = useState(amount);
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pasteNote, setPasteNote] = useState('');
  const [routeReset, setRouteReset] = useState(false);
  const lastQuoteAt = useRef(0);
  const trackedQuoteKey = useRef('');
  const [now, setNow] = useState(Date.now());
  useEffect(()=>{const t=setTimeout(()=>setDebouncedAmount(amount),450);return()=>clearTimeout(t);},[amount]);
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  const numericAmount = Number(debouncedAmount);
  const amountNumber = Number(amount);
  const amountEntered = amount.trim() !== '';
  const estimatedUsd = from && typeof from.price === 'number' && Number.isFinite(from.price) && from.price > 0 && Number.isFinite(amountNumber) ? from.price * amountNumber : null;
  const belowMinimum = estimatedUsd !== null && estimatedUsd < MINIMUM_SWAP_USD;
  const readyForQuote = Boolean(from && to && Number.isFinite(numericAmount) && numericAmount > 0 && debouncedAmount === amount && from.id !== to.id && !belowMinimum);
  const params = {from:from?.id || '',to:to?.id || '',amount:numericAmount || 0,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'};
  const quotes = useGetPrivateQuotes(params,{query:{queryKey:getGetPrivateQuotesQueryKey(params),enabled:readyForQuote,refetchInterval:confirmOpen ? false : 60_000,refetchOnWindowFocus:!confirmOpen,staleTime:10_000,retry:1}});
  const availableQuotes = (quotes.data?.quotes || []).filter(q=>!q.error && !q.requiresRefundAddress && q.quoteId);
  const selected = availableQuotes.find(q=>q.quoteId===selectedId) || availableQuotes[0];
  const expired = selected?.validUntil ? new Date(selected.validUntil).getTime() <= now : !!selected && now - quotes.dataUpdatedAt > 4 * 60_000;
  const ageS = quotes.dataUpdatedAt ? Math.max(0, Math.floor((now - quotes.dataUpdatedAt)/1000)) : 0;
  // Without a provider expiry, the quote is treated as expired after 4 minutes (see `expired`), so count down to that.
  const ttl = selected?.validUntil ? Math.max(0,Math.ceil((new Date(selected.validUntil).getTime()-now)/1000)) : selected ? Math.max(0, QUOTE_MAX_AGE_S - ageS) : null;
  const refreshIn = Math.max(0, AUTO_REFRESH_S - ageS);
  useEffect(() => {
    if (!quotes.dataUpdatedAt || quotes.dataUpdatedAt === lastQuoteAt.current) return;
    lastQuoteAt.current = quotes.dataUpdatedAt;
    // One event per pair/amount combination, not per auto-refresh. The key stays in memory and is never sent.
    const key = `${from?.id}|${to?.id}|${amount}`;
    if (key !== trackedQuoteKey.current) { trackedQuoteKey.current = key; trackEvent('swap_quote_requested', { route: 'private_route', outcome: availableQuotes.length ? 'received' : 'unavailable' }); }
    // Refreshed quotes get new IDs and no stable route name, so a manual route pick cannot be carried over honestly.
    if (selectedId && !availableQuotes.some(q => q.quoteId === selectedId)) { setSelectedId(''); setRouteReset(true); }
  }, [quotes.dataUpdatedAt, selectedId, availableQuotes, from?.id, to?.id, amount]);
  useEffect(() => {
    if (!quotes.isError) return;
    const key = `${from?.id}|${to?.id}|${amount}`;
    if (key !== trackedQuoteKey.current) { trackedQuoteKey.current = key; trackEvent('swap_quote_requested', { route: 'private_route', outcome: 'error' }); }
  }, [quotes.isError, from?.id, to?.id, amount]);
  const quoteIssues = quotes.data?.quotes?.filter(q=>q.error || q.requiresRefundAddress) || [];
  const amountOutside = selected && ((selected.min !== undefined && amountNumber<selected.min) || (selected.max !== undefined && amountNumber>selected.max));
  const addressValid = address.trim().length > 0 && address.trim().length <= 200;
  // Advisory only: named accounts (e.g. alice.near) are short, raw addresses rarely are.
  const addressLooksShort = addressValid && address.trim().length < 20 && !address.includes('.');
  const memoValid = !to?.requiresMemo || (memo.trim().length > 0 && memo.trim().length <= 64);
  const canProceed = !!selected && !expired && !amountOutside && addressValid && memoValid && !quotes.isFetching;
  const quoteLoading = Boolean(from && to && amountEntered && amountNumber > 0 && !belowMinimum && from.id !== to.id && (!readyForQuote || quotes.isLoading));
  // The single thing standing between the user and the review step, shown beside the button.
  const blocker = !from ? 'Choose the Solana asset you send'
    : !amountEntered ? 'Enter an amount to send'
    : !Number.isFinite(amountNumber) || amountNumber <= 0 ? 'Enter an amount greater than zero'
    : belowMinimum ? `Minimum swap is ${formatUsd(MINIMUM_SWAP_USD)} USD`
    : !to ? 'Choose what you receive'
    : from.id === to.id ? 'Choose two different assets'
    : quoteLoading ? 'Getting a live quote…'
    : quotes.isError ? 'Quote unavailable — retry above'
    : !selected ? 'No route for this pair and amount'
    : amountOutside ? 'Amount is outside the route limits'
    : expired ? 'Quote expired — refresh it above'
    : !addressValid ? `Enter your ${to.symbol} address on ${to.chainName}`
    : !memoValid ? 'Destination memo or tag required'
    : quotes.isFetching ? 'Refreshing quote…'
    : '';
  const create = useMutation({ mutationFn: ({ data, token }: { data: Parameters<typeof createPrivateOrder>[0]; token?: string }) =>
    createPrivateOrder(data, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined) });
  const handleFrom = (value:SwapToken) => {setRouteReset(false);setFrom(value);setTo(null);setAddress('');setMemo('');setSelectedId('');setConfirmOpen(false);};
  const handleTo = (value:SwapToken) => {setRouteReset(false);setTo(value);setSelectedId('');setAddress('');setMemo('');setConfirmOpen(false);};
  const paste = async () => {
    setPasteNote('');
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setAddress(text.slice(0, 200)); else setPasteNote('Clipboard is empty.');
    } catch { setPasteNote('Paste is blocked by this browser. Long-press or use Ctrl/Cmd+V.'); }
  };
  const placeOrder = async () => {
    if (!canProceed || !selected || creatingToken || create.isPending) return;
    setRewardError('');
    setCreatingToken(true);
    let token: string | undefined;
    try {
      if (rewardOptIn) token = await rewards.getEnrolledToken();
    } catch (cause) {
      setRewardError(`${errorText(cause)} No order was created. Turn off rewards below to continue as a guest, or try again.`);
      setCreatingToken(false);
      return;
    }
    setCreatingToken(false);
    create.mutate({data:{quoteId:selected.quoteId,addressTo:address.trim(),...(memo.trim() ? {destinationTag:memo.trim()} : {})},token},{
      onSuccess:(order)=>{trackEvent('swap_order_created',{route:'private_route'});if (token) void rewards.refresh();recent.save(order.houdiniId);setConfirmOpen(false);navigate(`/order/${encodeURIComponent(order.houdiniId)}`);},
      onError:()=>trackEvent('swap_order_failed',{route:'private_route'})
    });
  };
  const showQuote = !!selected && !expired;
  const rate = selected && selected.amountIn > 0 ? selected.amountOut / selected.amountIn : null;

  return <div className="app-shell">
    <Header/>
    <main className="sx-main">
      <div className="sx-intro page-enter">
        <h1 className="sx-title">Swap from Solana to another chain.</h1>
        <p className="sx-sub">Live quote, your review, a manual deposit.</p>
      </div>

      <section className="sx-card page-enter" aria-label="Private route swap">
        <RouteTabs active="private" amount={amount}/>
        <div className="sx-body">
          <div className="sx-field">
            <div className="sx-label"><label htmlFor="swap-amount">You send</label><span>On Solana</span></div>
            <div className="sx-box">
              <input id="swap-amount" className="sx-amount" type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setSelectedId('');setRouteReset(false);setConfirmOpen(false);}} placeholder="0.00" data-testid="input-amount"/>
              <TokenPicker side="source" token={from} onChange={handleFrom}/>
            </div>
            <div className="sx-meta"><span>{estimatedUsd !== null && amountNumber > 0 ? `≈ ${formatUsd(estimatedUsd)}` : from ? from.name : 'Pick a Solana asset'}</span><span>Min {formatUsd(MINIMUM_SWAP_USD)}</span></div>
          </div>

          <div className="sx-arrow" aria-hidden="true"><ArrowDown size={15}/></div>

          <div className="sx-field">
            <div className="sx-label"><span>You receive <em>(estimate)</em></span><span>{to?.chainName || 'Any supported network'}</span></div>
            <div className="sx-box">
              <span className={`sx-amount sx-receive ${showQuote ? 'is-live' : ''}`} data-testid="text-estimated-output">{quoteLoading || (quotes.isFetching && !showQuote) ? <span className="skeleton" style={{width:110,height:22,display:'inline-block'}}/> : showQuote ? formatNumber(selected.amountOut) : '0.00'}</span>
              <TokenPicker side="destination" token={to} selectedSource={from} onChange={handleTo}/>
            </div>
            <div className="sx-meta"><span data-testid="text-quote-rate">{showQuote && rate !== null && from && to ? `1 ${from.symbol} ≈ ${formatNumber(rate, 6)} ${to.symbol}` : to ? `${to.name} · ${to.chainName}` : 'Pick a network, then an asset'}</span>{showQuote && <span className="sx-live"><span className="live-dot"/>Live</span>}</div>
          </div>

          <div className="sx-quote" aria-live="polite">
            {!from || !to || !amountEntered || belowMinimum || amountNumber <= 0 || from.id === to.id ? null
            : quoteLoading ? <p className="sx-quiet" data-testid="status-quote-loading">Finding the best live route…</p>
            : quotes.isError ? <div className="sx-issue"><p data-testid="status-quote-error">{errorText(quotes.error)}</p><button type="button" className="sx-link-button" onClick={()=>quotes.refetch()} data-testid="button-retry-quotes"><RefreshCw size={12}/> Retry</button></div>
            : availableQuotes.length===0 ? <div className="sx-issue"><p data-testid="status-quote-unavailable">{quoteIssues[0]?.requiresRefundAddress ? 'This pair needs a refund address, which this route does not collect.' : quoteIssues[0]?.error || 'No route for this pair and amount right now.'}</p><span className="sx-issue-actions"><button type="button" className="sx-link-button" onClick={()=>quotes.refetch()} data-testid="button-refresh-quotes"><RefreshCw size={12}/> Refresh</button><Link href={`/near-swap${amount ? `?amount=${encodeURIComponent(amount)}` : ''}`} className="sx-link-button" data-testid="link-try-privacy-swap">Try Privacy swap <ArrowRight size={12}/></Link></span></div>
            : selected && <>
              {availableQuotes.length>1 && <div className="sx-routes" role="radiogroup" aria-label="Available routes">{availableQuotes.map((q:PrivateQuote,i)=><button key={q.quoteId} type="button" role="radio" aria-checked={selected.quoteId===q.quoteId} className={`sx-route ${selected.quoteId===q.quoteId ? 'is-active' : ''}`} onClick={()=>{setSelectedId(q.quoteId);setRouteReset(false);}} data-testid={`button-quote-${q.quoteId}`}>Route {i+1}<b>{formatNumber(q.amountOut, 6)} {to.symbol}</b></button>)}</div>}
              <dl className="sx-facts">
                <div><dt>Route fee</dt><dd data-testid="text-quote-fee">{selected.feeUsd !== undefined ? formatUsd(selected.feeUsd) : 'In final quote'}</dd></div>
                <div><dt>Expected time</dt><dd data-testid="text-quote-duration">{selected.duration !== undefined ? `~${selected.duration} min` : 'Varies'}</dd></div>
                <div><dt>{selected.validUntil ? 'Quote valid' : 'Quote'}</dt><dd data-testid="text-quote-expiry">{expired ? 'Expired' : selected.validUntil && ttl !== null ? formatTtl(ttl) : quotes.isFetching ? 'Updating…' : `New in ${refreshIn}s`}</dd></div>
              </dl>
              {routeReset && <p className="sx-quiet" role="status" data-testid="status-route-reset">Quotes refreshed, so the best route is selected again. Pick another route if you prefer.</p>}
              {(selected.min !== undefined || selected.max !== undefined) && <p className="sx-quiet">Limits {selected.min !== undefined ? formatNumber(selected.min) : '—'}–{selected.max !== undefined ? formatNumber(selected.max) : '—'} {from.symbol}</p>}
              {amountOutside && <p className="sx-error" data-testid="status-amount-limits">Change the amount to fit the route limits.</p>}
              {expired && <button type="button" className="sx-link-button" onClick={()=>quotes.refetch()} data-testid="button-refresh-expired"><RefreshCw size={12}/> Get a fresh quote</button>}
            </>}
          </div>

          <div className="sx-field">
            <div className="sx-label"><label htmlFor="recipient-address">Destination address</label><span>{to ? `${to.symbol} on ${to.chainName}` : 'Destination chain'}</span></div>
            <div className="sx-box sx-box--input">
              <input id="recipient-address" className="sx-input" value={address} onChange={e=>setAddress(e.target.value)} maxLength={200} placeholder={to ? `Your ${to.symbol} (${to.chainName}) address` : 'Your receiving address'} autoComplete="off" spellCheck={false} data-testid="input-recipient-address"/>
              <button type="button" className="sx-paste" onClick={()=>void paste()} aria-label="Paste address from clipboard" data-testid="button-paste-address"><ClipboardPaste size={16}/><span>Paste</span></button>
            </div>
            <div className="sx-meta"><span className={addressLooksShort && !pasteNote ? 'sx-warn' : ''} data-testid="text-address-hint">{pasteNote || (addressLooksShort ? `This looks short for a ${to?.chainName || 'destination'} address. Double-check it.` : 'Check the chain and address. Transfers cannot be reversed.')}</span></div>
            {to?.chain === 'near' && to.symbol === 'NEAR' && <p className="sx-quiet">Funding a <a href="https://terminal.nearfi.trade/wallet" target="_blank" rel="noopener noreferrer">NearFi Terminal wallet ↗</a>? Use the address NearFi shows you and confirm both sides say NEAR on the NEAR network. Direct Terminal funding is not yet verified.</p>}
          </div>

          {to?.requiresMemo && <div className="sx-field">
            <div className="sx-label"><label htmlFor="destination-memo">Destination memo / tag</label><span className="sx-required">Required</span></div>
            <div className="sx-box sx-box--input"><input id="destination-memo" className="sx-input" value={memo} onChange={e=>setMemo(e.target.value)} maxLength={64} placeholder="Memo or tag from the receiving platform" data-testid="input-destination-memo"/></div>
          </div>}

          <button className="sx-primary" type="button" disabled={!canProceed} aria-describedby="swap-blocker" onClick={()=>{create.reset();setRewardError('');setRewardOptIn(false);setConfirmOpen(true);trackEvent('swap_review_opened',{route:'private_route'});}} data-testid="button-review-order">Review swap <ArrowRight size={17}/></button>
          <p id="swap-blocker" className={`sx-blocker ${blocker ? '' : 'is-clear'}`} role="status" data-testid="status-review-blocker">{blocker || 'Ready to review. Nothing is sent until you deposit manually.'}</p>
        </div>
        <p className="sx-foot">Creating an order moves no funds · <Link href="/docs">How it works</Link></p>
      </section>

      {recent.id && <Link href={`/order/${encodeURIComponent(recent.id)}`} className="sx-recent" data-testid="link-recent-order">Continue tracking your recent order <ArrowUpRight size={14}/></Link>}

      <ol className="sx-steps" aria-label="How a swap works">
        <li><span>1</span><div><strong>Get a live quote</strong><p>Pick assets and an amount. Quotes refresh automatically.</p></div></li>
        <li><span>2</span><div><strong>Review and create</strong><p>Check the receive estimate, fee and address. No funds move.</p></div></li>
        <li><span>3</span><div><strong>Deposit and track</strong><p>Send the exact amount from your own wallet, then follow the order.</p></div></li>
      </ol>
    </main>
    <Footer/>

    {confirmOpen && selected && from && to && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget && !create.isPending && !creatingToken)setConfirmOpen(false);}}>
      <div className="modal sx-review" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="sx-review-head"><h2 id="confirm-title">Review your swap</h2><button className="secondary-button" type="button" disabled={create.isPending} onClick={()=>setConfirmOpen(false)} aria-label="Close" data-testid="button-close-confirm"><X size={15}/></button></div>
        <dl className="sx-review-rows">
          <div><dt>You send</dt><dd>{formatNumber(selected.amountIn)} {from.symbol} <small>Solana</small></dd></div>
          <div><dt>You receive (est.)</dt><dd>{formatNumber(selected.amountOut)} {to.symbol} <small>{to.chainName}</small></dd></div>
          <div><dt>Destination</dt><dd className="sx-mono-wrap">{address.trim()}</dd></div>
          {memo.trim() && <div><dt>Memo / tag</dt><dd className="sx-mono-wrap">{memo.trim()}</dd></div>}
          <div><dt>Route fee</dt><dd>{selected.feeUsd !== undefined ? formatUsd(selected.feeUsd) : 'In final quote'}</dd></div>
          <div><dt>Quote valid</dt><dd data-testid="text-review-expiry">{expired ? 'Expired' : ttl !== null ? formatTtl(ttl) : 'Fresh'} <button type="button" className="sx-link-button" disabled={quotes.isFetching || create.isPending} onClick={()=>{trackEvent('swap_quote_refreshed',{route:'private_route',location:'review'});void quotes.refetch();}} data-testid="button-review-refresh"><RefreshCw size={12}/> {quotes.isFetching ? 'Refreshing…' : 'Refresh quote'}</button></dd></div>
        </dl>
        {routeReset && <p className="sx-quiet" role="status">Quotes refreshed: the best route is now selected. Go back to pick another.</p>}
        <p className="sx-caution">Creating the order sends nothing. Next you get a deposit address: send the exact amount on Solana yourself, including any deposit memo. Private routing is slower and is not an anonymity guarantee.</p>
        <details className="sx-optional"><summary>Optional: link to account points</summary>
          <RewardOrderChoice opted={rewardOptIn} disabled={creatingToken || create.isPending} onChange={value=>{setRewardOptIn(value);setRewardError('');}}/>
        </details>
        {rewardError && <p className="sx-error" role="alert">{rewardError}</p>}
        {create.isError && <p className="sx-error" role="alert" data-testid="status-create-error">{errorText(create.error)}</p>}
        {expired && <p className="sx-error">This quote expired. Refresh it above to continue.</p>}
        <button className="sx-primary" type="button" disabled={create.isPending || creatingToken || !canProceed} onClick={()=>void placeOrder()} data-testid="button-confirm-order">{creatingToken ? 'Checking email session…' : create.isPending ? 'Creating order…' : rewardOptIn ? 'Create linked order' : 'Create order'} {create.isPending ? <span className="skeleton" style={{width:20,height:10}}/> : <Check size={16}/>}</button>
        <button type="button" className="nav-link sx-back" disabled={create.isPending} onClick={()=>setConfirmOpen(false)} data-testid="button-cancel-order">Go back and edit</button>
      </div>
    </div>}
  </div>;
}
