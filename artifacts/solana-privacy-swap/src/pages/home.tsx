import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Clock3, LockKeyhole, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { createPrivateOrder, getGetPrivateQuotesQueryKey, getSearchSwapTokensQueryKey, useGetPrivateQuotes, useSearchSwapTokens } from '@workspace/api-client-react';
import type { PrivateQuote, SwapToken } from '@workspace/api-client-react';
import { errorText, Footer, Header, PrivacyNote, TokenPicker, useRecentOrder } from '../components/swap-ui';
import { RewardOrderChoice } from '../components/reward-enrollment';
import { useRewards } from '../hooks/use-rewards';

const formatNumber = (n:number, maximumFractionDigits=8) => new Intl.NumberFormat('en-US',{maximumFractionDigits}).format(n);
const formatUsd = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const MINIMUM_SWAP_USD = 3;

export default function Home() {
  const [, navigate] = useLocation();
  const rewards = useRewards();
  const [rewardOptIn, setRewardOptIn] = useState(false);
  const [rewardError, setRewardError] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const recent = useRecentOrder();
  const [from, setFrom] = useState<SwapToken|null>(null);
  const [to, setTo] = useState<SwapToken|null>(null);
  const [amount, setAmount] = useState('');
  const [debouncedAmount, setDebouncedAmount] = useState('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [findingNear, setFindingNear] = useState(false);
  const [nearSelectionError, setNearSelectionError] = useState('');
  const solParams = { side: 'source' as const, term: 'SOL' };
  const nearParams = { side: 'destination' as const, term: 'NEAR' };
  const solLookup = useSearchSwapTokens(solParams, { query: { queryKey: getSearchSwapTokensQueryKey(solParams), enabled: findingNear, staleTime: 60_000, retry: 1 } });
  const nearLookup = useSearchSwapTokens(nearParams, { query: { queryKey: getSearchSwapTokensQueryKey(nearParams), enabled: findingNear, staleTime: 60_000, retry: 1 } });
  useEffect(() => {
    if (!findingNear || solLookup.isFetching || nearLookup.isFetching) return;
    if (solLookup.isError || nearLookup.isError) {
      setNearSelectionError('Could not check the available SOL → NEAR assets. Try again or select them manually.');
      setFindingNear(false);
      return;
    }
    if (!solLookup.data || !nearLookup.data) return;
    const nativeSol = solLookup.data.tokens.find(t => t.symbol === 'SOL' && /sol/i.test(t.chain));
    const nativeNear = nearLookup.data.tokens.find(t => t.symbol === 'NEAR' && t.chain === 'near');
    if (!nativeSol || !nativeNear) {
      setNearSelectionError('This provider does not currently list SOL → NEAR. Select another pair or try later.');
    } else {
      setFrom(nativeSol);
      setTo(nativeNear);
      setSelectedId('');
      setAddress('');
      setMemo('');
      setConfirmOpen(false);
      setNearSelectionError('');
      document.getElementById('swap-amount')?.focus();
    }
    setFindingNear(false);
  }, [findingNear, solLookup.data, solLookup.isFetching, solLookup.isError, nearLookup.data, nearLookup.isFetching, nearLookup.isError]);
  useEffect(()=>{const t=setTimeout(()=>setDebouncedAmount(amount),450);return()=>clearTimeout(t);},[amount]);
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  const numericAmount = Number(debouncedAmount);
  const estimatedUsd = from && typeof from.price === 'number' && Number.isFinite(from.price) && from.price > 0 && Number.isFinite(Number(amount)) ? from.price * Number(amount) : null;
  const belowMinimum = estimatedUsd !== null && estimatedUsd < MINIMUM_SWAP_USD;
  const readyForQuote = Boolean(from && to && Number.isFinite(numericAmount) && numericAmount > 0 && debouncedAmount === amount && from.id !== to.id && !belowMinimum);
  const params = {from:from?.id || '',to:to?.id || '',amount:numericAmount || 0,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'};
  const quotes = useGetPrivateQuotes(params,{query:{queryKey:getGetPrivateQuotesQueryKey(params),enabled:readyForQuote,refetchInterval:confirmOpen ? false : 60_000,refetchOnWindowFocus:!confirmOpen,staleTime:10_000,retry:1}});
  const availableQuotes = (quotes.data?.quotes || []).filter(q=>!q.error && !q.requiresRefundAddress && q.quoteId);
  const selected = availableQuotes.find(q=>q.quoteId===selectedId) || availableQuotes[0];
  const expired = selected?.validUntil ? new Date(selected.validUntil).getTime() <= now : !!selected && now - quotes.dataUpdatedAt > 4 * 60_000;
  const ttl = selected?.validUntil ? Math.max(0,Math.ceil((new Date(selected.validUntil).getTime()-now)/1000)) : null;
  const quoteIssues = quotes.data?.quotes?.filter(q=>q.error || q.requiresRefundAddress) || [];
  const amountOutside = selected && ((selected.min !== undefined && Number(amount)<selected.min) || (selected.max !== undefined && Number(amount)>selected.max));
  const addressValid = address.trim().length > 0 && address.trim().length <= 200;
  const memoValid = !to?.requiresMemo || (memo.trim().length > 0 && memo.trim().length <= 64);
  const canProceed = !!selected && !expired && !amountOutside && addressValid && memoValid && !quotes.isFetching;
  const create = useMutation({ mutationFn: ({ data, token }: { data: Parameters<typeof createPrivateOrder>[0]; token?: string }) =>
    createPrivateOrder(data, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined) });
  const handleFrom = (value:SwapToken) => {setFrom(value);setTo(null);setAddress('');setMemo('');setSelectedId('');setConfirmOpen(false);};
  const handleTo = (value:SwapToken) => {setTo(value);setSelectedId('');setAddress('');setMemo('');setConfirmOpen(false);};
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
      onSuccess:(order)=>{if (token) void rewards.refresh();recent.save(order.houdiniId);setConfirmOpen(false);navigate(`/order/${encodeURIComponent(order.houdiniId)}`);}
    });
  };

  return <div className="app-shell">
    <Header/>
    <main className="main-grid">
      <div className="page-enter">
        <div className="eyebrow"><span className="eyebrow-line"/> DARKSWAP / PRIVATE ROUTING</div>
        <h1 className="hero-title">Move value.<br/><em>Leave less</em><br/>behind.</h1>
        <p className="hero-copy">A quieter way out of Solana. Compare a live private route, choose where your assets land, then send from any Solana wallet. Nothing to connect here.</p>
        {recent.id && <Link href={`/order/${encodeURIComponent(recent.id)}`} className="secondary-button" style={{marginTop:24,textDecoration:'none'}} data-testid="link-recent-order">Continue tracking recent order <ArrowUpRight size={14}/></Link>}
        <div className="hero-stamp"><LockKeyhole size={28} strokeWidth={1.3}/></div>
        <ol className="flow-list">
          <li className="flow-item"><span className="flow-num">01</span><div><strong>Choose your route</strong><p>Start with a Solana asset. Find a destination on a supported chain.</p></div></li>
          <li className="flow-item"><span className="flow-num">02</span><div><strong>Review the live quote</strong><p>See the estimated output and fees before committing.</p></div></li>
          <li className="flow-item"><span className="flow-num">03</span><div><strong>Send to the deposit address</strong><p>Create an order, then manually send the exact amount. Track it here.</p></div></li>
        </ol>
      </div>
      <section className="swap-card page-enter" style={{animationDelay:'.08s'}} aria-label="Private swap">
        <div className="card-header"><div><h2 className="card-heading">Private exchange</h2><div className="card-subtitle" style={{marginTop:5}}>Solana → another chain</div></div><ShieldCheck size={22} color="#c7a7ff" strokeWidth={1.5}/></div>
        <div className="card-body">
          <div className="near-route-shortcut">
            <button className="secondary-button" type="button" disabled={findingNear} onClick={() => { setNearSelectionError(''); setFindingNear(true); }} data-testid="button-find-sol-near">
              {findingNear ? 'Finding SOL → NEAR…' : 'Find SOL → NEAR route'} <ArrowRight size={14}/>
            </button>
            <p className="field-help">Selects the provider's current SOL and NEAR-network assets. A live quote is still required.</p>
            {nearSelectionError && <p className="quote-error" role="alert" data-testid="status-near-selection-error">{nearSelectionError}</p>}
          </div>
          <label className="section-label" htmlFor="swap-amount">You send <span style={{float:'right',fontWeight:400,letterSpacing:0,textTransform:'none'}}>On Solana</span></label>
          <div className="field-box amount-row">
            <input id="swap-amount" className="amount-input" type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setSelectedId('');setConfirmOpen(false);}} placeholder="0.00" data-testid="input-amount"/>
            <TokenPicker side="source" token={from} onChange={handleFrom}/>
          </div>
          <div className="field-help">{estimatedUsd !== null && Number(amount)>0 ? `≈ ${formatUsd(estimatedUsd)} USD · $3 USD minimum` : from ? `${from.name} · $3 USD minimum` : 'Select a Solana asset to start · $3 USD minimum'}</div>
          <div className="direction-divider"><span className="direction-icon"><ArrowDown size={15}/></span></div>
          <div className="section-label">They receive <span style={{float:'right',fontWeight:400,letterSpacing:0,textTransform:'none'}}>{to?.chainName || 'Choose a network'}</span></div>
          <div className="field-box receive-row"><span className="receive-amount" data-testid="text-estimated-output" style={selected && !expired ? {color:'#f1f4e8'} : undefined}>{selected && !expired ? formatNumber(selected.amountOut) : '0.00'}</span><TokenPicker side="destination" token={to} selectedSource={from} onChange={handleTo}/></div>
          <div className="field-help">{to ? `${to.name} · ${to.chainName}` : 'Search supported destinations'}</div>

          <div className="quote-panel" aria-live="polite">
            <div className="quote-top"><span className="quote-title">Private route quote</span><span className="quote-live"><span className="live-dot"/>{readyForQuote ? 'LIVE DATA' : 'AWAITING INPUT'}</span></div>
            {!from || !to || !amount ? <p className="muted-note" style={{paddingTop:16}} data-testid="status-quote-empty">Select both assets and enter an amount to request a live quote.</p>
            : !Number.isFinite(Number(amount)) || Number(amount)<=0 ? <p className="quote-error" style={{paddingTop:14}} data-testid="status-amount-invalid">Enter an amount greater than zero.</p>
             : belowMinimum ? <p className="quote-error" style={{paddingTop:14}} data-testid="status-amount-minimum">Minimum swap amount is $3 USD. Increase the amount you send before requesting a quote.</p>
            : from.id===to.id ? <p className="quote-error" style={{paddingTop:14}} data-testid="status-pair-invalid">Choose two different assets for your route.</p>
            : !readyForQuote || quotes.isLoading ? <div style={{paddingTop:18}} data-testid="status-quote-loading"><div className="skeleton" style={{width:'68%',marginBottom:13}}/><div className="skeleton" style={{width:'88%'}}/></div>
             : quotes.isError ? <div style={{paddingTop:14}}><p className="quote-error" data-testid="status-quote-error">{errorText(quotes.error)}</p><button type="button" className="secondary-button" onClick={()=>quotes.refetch()} data-testid="button-retry-quotes"><RefreshCw size={12}/> Retry quote</button><p className="muted-note" style={{marginTop:14}}>Private routes require a live quote. Explore and Privacy Trading Terminal remain closed beta.</p><Link href="/privacy-terminal" className="secondary-button" style={{marginTop:10,textDecoration:'none'}} data-testid="link-public-fallback-error">View Privacy Trading Terminal status <ArrowUpRight size={13}/></Link></div>
              : availableQuotes.length===0 ? <div style={{paddingTop:14}}><p className="quote-error" data-testid="status-quote-unavailable">{quoteIssues[0]?.error || (quoteIssues[0]?.requiresRefundAddress ? 'This route requires a refund address, which this order flow cannot provide. Choose another route.' : 'No private route is available for this pair and amount right now.')}</p><button type="button" className="secondary-button" onClick={()=>quotes.refetch()} data-testid="button-refresh-quotes"><RefreshCw size={12}/> Refresh</button><p className="muted-note" style={{marginTop:14}}>No quote is available for this pair and amount right now. Privacy Trading Terminal remains closed beta.</p><Link href="/privacy-terminal" className="secondary-button" style={{marginTop:10,textDecoration:'none'}} data-testid="link-public-fallback-unavailable">View Privacy Trading Terminal status <ArrowUpRight size={13}/></Link></div>
            : <div>
                   {availableQuotes.length>1 && <div style={{display:'flex',gap:7,overflowX:'auto',paddingTop:14}}>{availableQuotes.map((q:PrivateQuote,i)=><button key={q.quoteId} type="button" className="secondary-button" style={{background:selected?.quoteId===q.quoteId?'#4a345d':undefined,borderColor:selected?.quoteId===q.quoteId?'#bc9aff':undefined,whiteSpace:'nowrap'}} onClick={()=>setSelectedId(q.quoteId)} data-testid={`button-quote-${q.quoteId}`}>Route {i+1} · {formatNumber(q.amountOut)} {to.symbol}</button>)}</div>}
                <div className="quote-grid">
                  <div><span className="metric-label">Estimated receive</span><span className="metric-value" data-testid="text-quote-output">{formatNumber(selected.amountOut)} {to.symbol}</span></div>
                  <div><span className="metric-label">Route fee</span><span className="metric-value" data-testid="text-quote-fee">{selected.feeUsd !== undefined ? formatUsd(selected.feeUsd) : 'See final quote'}</span></div>
                  <div><span className="metric-label">Expected time</span><span className="metric-value" data-testid="text-quote-duration">{selected.duration !== undefined ? `~${selected.duration} min` : 'Varies by route'}</span></div>
                   <div><span className="metric-label">Quote freshness</span><span className="metric-value" data-testid="text-quote-expiry">{ttl !== null ? expired ? 'Expired' : `${Math.floor(ttl/60)}:${String(ttl%60).padStart(2,'0')}` : expired ? 'Refresh needed' : 'Auto-refreshing'}</span></div>
                </div>
                {(selected.min !== undefined || selected.max !== undefined) && <p className="muted-note" style={{marginTop:15}}>Route limits: {selected.min !== undefined ? formatNumber(selected.min) : '—'}–{selected.max !== undefined ? formatNumber(selected.max) : '—'} {from.symbol}</p>}
                {amountOutside && <p className="quote-error" data-testid="status-amount-limits">This amount is outside the route limits. Change the amount to get a new quote.</p>}
                {expired && <button type="button" className="secondary-button" style={{marginTop:12}} onClick={()=>quotes.refetch()} data-testid="button-refresh-expired"><RefreshCw size={12}/> Request fresh quote</button>}
              </div>}
          </div>
          <div style={{marginTop:24}}>
            <label className="section-label" htmlFor="recipient-address">Recipient address <span style={{float:'right',fontWeight:400,letterSpacing:0,textTransform:'none'}}>On {to?.chainName || 'destination chain'}</span></label>
            <input id="recipient-address" className="input-standard" value={address} onChange={e=>setAddress(e.target.value)} maxLength={200} placeholder="Paste the receiving address" autoComplete="off" data-testid="input-recipient-address"/>
            <p className="field-help" style={{lineHeight:1.5}}>Double-check the chain and address. Transfers cannot be reversed.</p>
            {to?.chain === 'near' && to.symbol === 'NEAR' && <p className="near-terminal-note">Funding a <a href="https://terminal.nearfi.trade/wallet" target="_blank" rel="noopener noreferrer">NearFi Terminal wallet (external) ↗</a>? First copy your own trading-wallet address from NearFi. NearFi holds that wallet's key. Check that its deposit instructions and the final DarkSwap order both specify NEAR on the NEAR network before sending anything. Direct funding to Terminal has not yet been verified.</p>}
          </div>
          {to?.requiresMemo && <div style={{marginTop:17}}><label className="section-label" htmlFor="destination-memo">Destination memo / tag <span style={{color:'#ffae91'}}>required</span></label><input id="destination-memo" className="input-standard" value={memo} onChange={e=>setMemo(e.target.value)} maxLength={64} placeholder="Enter the recipient memo or tag" data-testid="input-destination-memo"/></div>}
          <button className="primary-button" type="button" style={{marginTop:23}} disabled={!canProceed} onClick={()=>{create.reset();setRewardError('');setRewardOptIn(false);setConfirmOpen(true);}} data-testid="button-review-order">Review order <ArrowRight size={17}/></button>
          <p className="fine-print">No wallet connection. Creating an order does not move your funds.</p>
        </div>
        <div className="trust-strip"><PrivacyNote/><span><Clock3 size={12}/> Private execution takes longer</span></div>
      </section>
    </main>
    <Footer/>
    {confirmOpen && selected && from && to && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget && !create.isPending && !creatingToken)setConfirmOpen(false);}}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',gap:10}}><div><span className="section-label">Final review</span><h2 id="confirm-title">Confirm your route.</h2></div><button className="secondary-button" type="button" disabled={create.isPending} onClick={()=>setConfirmOpen(false)} aria-label="Close" data-testid="button-close-confirm"><X size={15}/></button></div>
        <p>Check the recipient carefully. The deposit address is provided only after you create the order.</p>
        <div className="modal-row"><span>You will send</span><strong>{formatNumber(selected.amountIn)} {from.symbol} · Solana</strong></div>
        <div className="modal-row"><span>Estimated receive</span><strong>{formatNumber(selected.amountOut)} {to.symbol} · {to.chainName}</strong></div>
        <div className="modal-row"><span>Recipient</span><strong>{address.trim()}</strong></div>
        {memo.trim() && <div className="modal-row"><span>Destination memo</span><strong>{memo.trim()}</strong></div>}
        <div className="warning-box">Creating this order does not send any assets. You must manually transfer the exact deposit amount on Solana to the address on the next screen, including a deposit memo if one is provided. Private execution is slower and does not guarantee absolute anonymity.</div>
         <RewardOrderChoice opted={rewardOptIn} disabled={creatingToken || create.isPending} onChange={value=>{setRewardOptIn(value);setRewardError('');}}/>
         {rewardError && <p className="quote-error" role="alert">{rewardError}</p>}
        {create.isError && <p className="quote-error" role="alert" data-testid="status-create-error">{errorText(create.error)}</p>}
        {expired && <p className="quote-error">This quote expired. Close this dialog and request a fresh quote.</p>}
         <button className="primary-button" type="button" disabled={create.isPending || creatingToken || !canProceed} onClick={()=>void placeOrder()} data-testid="button-confirm-order">{creatingToken ? 'Checking email session…' : create.isPending ? 'Creating order…' : rewardOptIn ? 'Create linked order' : 'Confirm & create guest order'} {create.isPending ? <span className="skeleton" style={{width:20,height:10}}/> : <Check size={16}/>}</button>
        <button type="button" className="nav-link" style={{display:'block',margin:'15px auto 0'}} disabled={create.isPending} onClick={()=>setConfirmOpen(false)} data-testid="button-cancel-order">Go back and edit</button>
      </div>
    </div>}
  </div>;
}
