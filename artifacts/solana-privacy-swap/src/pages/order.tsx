import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Clock3, RefreshCw, ShieldCheck, Share2 } from 'lucide-react';
import { Link, useParams } from 'wouter';
import { getGetPrivateOrderQueryKey, useGetPrivateOrder } from '@workspace/api-client-react';
import { CopyButton, errorText, Footer, Header, useRecentOrder } from '../components/swap-ui';
import { ClosedNotice, DepositCard, InfoTips, OrderMeta, SwapPair, UpdatesSignup, WaitingStepper } from '../components/waiting';
import { trackEvent } from '../lib/analytics';

const readableTime = (value:string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
};
const formatAmount = (n:number) => new Intl.NumberFormat('en-US',{maximumFractionDigits:12}).format(n);

export default function OrderPage() {
  const params = useParams<{id:string}>();
  const id = params.id || '';
  const recent = useRecentOrder();
  const [now,setNow] = useState(Date.now());
  const [shareFeedback,setShareFeedback] = useState('');
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const result = useGetPrivateOrder(id,{query:{enabled:!!id,queryKey:getGetPrivateOrderQueryKey(id),refetchInterval:15_000,retry:1}});
  const order = result.data;
  useEffect(()=>{if(order?.houdiniId) { try { localStorage.setItem('solana-privacy-swap:recent-order',order.houdiniId); } catch { /* Storage unavailable. */ } }},[order?.houdiniId]);
  const expiresAt = order ? new Date(order.expires).getTime() : 0;
  const status = order?.displayStatus || 'Status unavailable';
  const lowerStatus = status.toLowerCase();
  const code = order?.status;
  const completed = code === 4 || (code === undefined && /complet|finish|success|deliver/.test(lowerStatus));
  const failed = (code !== undefined && [6, 7, 8].includes(code)) || (code === undefined && /fail|refund|cancel|error|delet/.test(lowerStatus));
  const awaiting = code === 0 || (code === undefined && /wait|pend|creat|new/.test(lowerStatus));
  const expired = code === 5 || (awaiting && !Number.isNaN(expiresAt) && expiresAt <= now);
  const remaining = order && awaiting && !Number.isNaN(expiresAt) ? Math.max(0,Math.ceil((expiresAt-now)/1000)) : null;
  const shouldSend = !expired && !completed && !failed && awaiting && !result.isError;
  const stage = completed ? 3 : expired || code === 0 || (awaiting && code === undefined) ? 0 : code === 2 || code === 3 ? 2 : 1;
  // The stage an order reaches, never its identifier, amount or addresses.
  const statusKey = completed ? 'completed' : expired ? 'deposit_window_closed' : failed ? 'needs_attention' : awaiting ? 'awaiting_deposit' : 'processing';
  const trackedStatus = useRef('');
  useEffect(() => {
    if (!order || trackedStatus.current === statusKey) return;
    trackedStatus.current = statusKey;
    trackEvent('order_status_viewed', { route: 'private_route', status: statusKey });
  }, [order, statusKey]);
  const shareOrder = async () => {
    if (!order) return;
    const currentStatus = completed ? 'Completed' : expired ? 'Deposit window closed' : failed ? 'Needs attention' : awaiting ? 'Awaiting deposit' : 'Processing';
    const url = new URL(`/order/${encodeURIComponent(order.houdiniId)}`, window.location.origin).toString();
    const text = `DarkSwap order update: ${currentStatus} as of ${new Date().toLocaleString()}. Check the latest status at this link. DarkSwap also lets you explore Solana-origin private routes; always review your own deposit instructions before sending.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'DarkSwap order status', text, url });
        trackEvent('order_shared', { route: 'private_route', method: 'share_sheet' });
        setShareFeedback('Shared. The recipient can view this order’s details.');
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        trackEvent('order_shared', { route: 'private_route', method: 'copied_link' });
        setShareFeedback('Update and link copied. Share only with someone you trust.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareFeedback('Could not share. Check your browser’s sharing or clipboard permissions.');
    }
  };
  return <div className="app-shell">
    <Header/>
    <main className="order-layout page-enter">
      <Link href="/swap" className="nav-link" style={{display:'inline-flex',alignItems:'center',gap:8}} data-testid="link-back-to-swap"><ArrowLeft size={14}/> Back to exchange</Link>
       <div style={{marginTop:45}} className="eyebrow"><span className="eyebrow-line"/> DARKSWAP / ORDER TRACKING</div>
       <h1 className="order-heading">Your transfer,<br/><span style={{color:'#cdaef8'}}>step by step.</span></h1>
      {result.isLoading ? <div className="order-grid" data-testid="status-order-loading"><div className="order-panel"><div className="skeleton" style={{width:'52%',height:25,marginBottom:30}}/><div className="skeleton" style={{width:'70%',height:80,marginBottom:20}}/><div className="skeleton" style={{width:'88%',marginBottom:15}}/><div className="skeleton" style={{width:'65%'}}/></div><div className="order-panel"><div className="skeleton" style={{width:'50%',height:25,marginBottom:30}}/><div className="skeleton" style={{width:'80%',marginBottom:15}}/><div className="skeleton" style={{width:'60%'}}/></div></div>
      : result.isError || !order ? <div className="order-panel" style={{maxWidth:600,marginTop:35}}>
           <AlertCircle size={25} color="#b286f3"/><h2 style={{marginTop:20}}>We couldn't find this order.</h2>
          <p className="quote-error" data-testid="status-order-error">{result.isError ? errorText(result.error) : 'The order is unavailable. Check the ID and try again.'}</p>
          <p className="muted-note">Check the order ID for typos. If you just created it, allow a moment for the route to appear.</p>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:23}}><button className="secondary-button" onClick={()=>result.refetch()} data-testid="button-retry-order"><RefreshCw size={13}/> Try again</button>{recent.id && recent.id!==id && <Link href={`/order/${encodeURIComponent(recent.id)}`} className="secondary-button" style={{textDecoration:'none'}} data-testid="link-recent-order-recovery">Open recent order <ArrowRight size={13}/></Link>}</div>
        </div>
      : <>
        <p className="hero-copy" style={{maxWidth:620,margin:0}}>{completed ? 'The route reports your transfer as completed. Keep this order ID for your records.' : expired ? 'The deposit window has closed. Do not send funds to this address.' : failed ? 'This route needs attention. Review the current status and recovery guidance below.' : awaiting ? 'Your order is created, but no assets have moved yet. Follow the deposit instructions precisely and keep this page open to track progress.' : 'Your deposit is being processed by the route provider. Do not send again; follow the live status below.'}</p>
        <div className="ws-wrap" data-testid="waiting-view">
          {shouldSend ? <DepositCard amount={String(order.inAmount)} symbol={order.inSymbol} assetKind="unknown" address={order.depositAddress} memo={order.depositTag || undefined} recipient={order.receiverAddress} recipientTag={order.receiverTag || undefined} deadlineText={readableTime(order.expires)} remainingText={remaining!==null ? `${Math.floor(remaining/60)}m ${remaining%60}s left` : undefined}/>
            : <ClosedNotice title={completed ? 'Completed. Do not send more funds.' : expired ? 'Deposit window expired. Do not send funds.' : failed ? 'Route stopped. Do not send funds.' : 'Deposit instructions hidden.'}>{completed ? 'The provider reports this transfer as completed.' : expired || failed ? 'If you already sent a deposit, keep your transaction hash and order ID for a support inquiry. Recovery is not guaranteed.' : result.isError ? 'We could not refresh this order, so its current status is uncertain. Do not send funds until a fresh status loads.' : 'This order is already past the deposit stage or its status is uncertain. Never send twice to the same order; follow the live status below.'}</ClosedNotice>}
          <WaitingStepper stage={stage} halted={expired || failed} haltLabel={expired ? 'Deposit window closed' : status}/>
          <SwapPair inAmount={formatAmount(order.inAmount)} inSymbol={order.inSymbol} outAmount={formatAmount(order.outAmount)} outSymbol={order.outSymbol} estimated/>
          <OrderMeta items={[{label:'Order ID',value:order.houdiniId},{label:'Status',value:status},{label:'Created',value:readableTime(order.created)}]}/>
          {shouldSend && <InfoTips assetKind="unknown" symbol={order.inSymbol} hasMemo={!!order.depositTag}/>}
          <UpdatesSignup/>
        </div>
        <details style={{margin:'20px 0'}} data-testid="order-share-details">
          <summary style={{cursor:'pointer',color:'#cdaef8'}}>Share a status update</summary>
          <p className="muted-note">The link reveals this order’s status and deposit details to anyone who has it. Share only with someone you trust. The status in your message is a snapshot; the link shows the latest available status.</p>
          <button type="button" className="secondary-button" onClick={shareOrder} data-testid="button-share-order"><Share2 size={14}/> Share order update</button>
          {shareFeedback && <p className="muted-note" role="status">{shareFeedback}</p>}
        </details>
        <details className="ws-details"><summary data-testid="toggle-order-details">Full order record, status history and recovery</summary>
        <div className="order-grid">
          <section className="order-panel">
             <div style={{display:'flex',alignItems:'start',justifyContent:'space-between',gap:15,flexWrap:'wrap'}}><div><span className="section-label">Step 01 / Fund the order</span><h2 style={{marginBottom:0}}>Deposit instructions</h2></div><span className={`status-indicator ${expired || failed ? 'status-alert' : ''}`} data-testid="status-order"><span className="live-dot"/> {status}</span></div>
            {expired && !completed && <div className="warning-box" role="alert" data-testid="status-order-expired"><strong>Deposit window expired.</strong> Do not send funds to this address. If you already sent a deposit, keep your transaction details and use the order ID when contacting the route provider.</div>}
            {!expired && !completed && !failed && !awaiting && <div className="warning-box" data-testid="status-order-in-progress">This order is already in progress. Check its live status before sending any additional funds. Never send twice to the same order.</div>}
            {failed && <div className="warning-box" data-testid="status-order-attention">This route reports an issue. Do not send another deposit. Keep your transaction details and order ID for support or recovery.</div>}
            <div className="deposit-feature">
              <span className="section-label">{shouldSend ? 'Send exactly this amount' : 'Quoted deposit amount'}</span>
              <div className="deposit-amount" data-testid="text-deposit-amount">{formatAmount(order.inAmount)} <span>{order.inSymbol}</span></div>
               <div style={{fontSize:14,color:'#d6c4ee',marginTop:10}}>Network: <strong style={{color:'#cdaef8'}}>Solana only</strong> · Do not send via another network.</div>
            </div>
            <div className="detail-row"><span className="section-label">Solana deposit address</span><div className="detail-flex"><span className="detail-value" data-testid="text-deposit-address">{order.depositAddress}</span><CopyButton value={order.depositAddress} name="deposit address"/></div></div>
            {order.depositTag && <div className="detail-row"><span className="section-label">Required deposit memo / tag</span><div className="detail-flex"><span className="detail-value" data-testid="text-deposit-tag">{order.depositTag}</span><CopyButton value={order.depositTag} name="deposit memo"/></div><p className="quote-error" style={{marginBottom:0}}>Include this memo with your Solana transfer. Missing it can prevent your deposit from being matched.</p></div>}
             <div className="detail-row"><span className="section-label">Deposit deadline</span><div className="detail-flex"><span className="detail-value" data-testid="text-deposit-expiry">{readableTime(order.expires)}</span>{remaining!==null && <span style={{font:'500 13px "Source Sans 3",sans-serif',whiteSpace:'nowrap',color:expired?'#b286f3':'#cdaef8'}}>{expired?'Expired':`${Math.floor(remaining/60)}m ${remaining%60}s left`}</span>}</div></div>
            <div className="warning-box" style={{marginBottom:0}}>Send only the exact amount shown, on Solana, before the deadline. If your wallet deducts a fee from the amount you enter, adjust it so the received deposit is exact. An order is not a completed transfer.</div>
          </section>
          <aside style={{display:'flex',flexDirection:'column',gap:24}}>
            <section className="order-panel">
              <span className="section-label">Step 02 / Follow progress</span><h2>Live order status</h2>
               <span className={`status-indicator ${expired || failed ? 'status-alert' : ''}`} data-testid="text-live-status"><span className="live-dot"/>{status}</span>
              <p className="muted-note" style={{marginTop:13}}>Updated automatically every 15 seconds. Private execution can take longer than a standard swap.</p>
              <ol className="timeline">
                <li className="active"><span className="timeline-dot"/><div><strong>Order created</strong><span>{readableTime(order.created)}</span></div></li>
                <li className={!expired && !failed && !completed ? 'active' : ''}><span className="timeline-dot"/><div><strong>{awaiting ? 'Awaiting your deposit' : 'Deposit detected / processing'}</strong><span>Follow the live status above for the actual route state.</span></div></li>
                <li className={completed ? 'active' : ''}><span className="timeline-dot"/><div><strong>Destination transfer</strong><span>{completed ? 'Route reports completion.' : 'Not confirmed by the route yet.'}</span></div></li>
              </ol>
              <button className="secondary-button" onClick={()=>result.refetch()} disabled={result.isFetching} data-testid="button-refresh-order"><RefreshCw size={13}/> {result.isFetching?'Checking…':'Check now'}</button>
              {order.eta!==undefined && <p className="muted-note" style={{marginTop:16}}><Clock3 size={12} style={{display:'inline',verticalAlign:'middle',marginRight:5}}/>Route ETA: approximately {order.eta} minutes. This is an estimate.</p>}
            </section>
            <section className="order-panel">
              <span className="section-label">Order record</span><h2>Keep these details</h2>
              <div className="detail-row"><span className="section-label">Order ID</span><div className="detail-flex"><span className="detail-value" data-testid="text-order-id">{order.houdiniId}</span><CopyButton value={order.houdiniId} name="order ID"/></div></div>
              <div className="detail-row"><span className="section-label">Receiving</span><span className="detail-value" data-testid="text-receiving-amount">{formatAmount(order.outAmount)} {order.outSymbol}</span></div>
              <div className="detail-row"><span className="section-label">Recipient address</span><span className="detail-value" data-testid="text-recipient-address">{order.receiverAddress}</span></div>
              {order.receiverTag && <div className="detail-row"><span className="section-label">Recipient memo / tag</span><span className="detail-value" data-testid="text-recipient-tag">{order.receiverTag}</span></div>}
              {order.outTransactionOutHash && <div className="detail-row"><span className="section-label">Outbound transaction</span><div className="detail-flex"><span className="detail-value" data-testid="text-output-transaction">{order.outTransactionOutHash}</span><CopyButton value={order.outTransactionOutHash} name="outbound transaction"/></div></div>}
            </section>
             <section className="order-panel" style={{background:'#191620'}}>
               <ShieldCheck size={22} color="#cdaef8" style={{marginBottom:14}}/><h2>Need to recover?</h2>
              <p className="muted-note">If you sent the wrong amount, used a different network, omitted a required deposit memo, or the order is stuck, do not send another payment. Keep your order ID and your sending transaction hash for a support or recovery inquiry. Recovery is not guaranteed.</p>
              <p className="muted-note" style={{marginTop:14}}>For support, email <a href="mailto:support@darkswap.app" style={{color:'#cdaef8'}}>support@darkswap.app</a> or <a href="https://x.com/darkswapapp" target="_blank" rel="noopener noreferrer" style={{color:'#cdaef8'}}>DM @darkswapapp on X</a>. Keep your order ID and transaction hash handy, but never share a seed phrase.</p>
              <p className="muted-note" style={{marginTop:14}}><Check size={12} style={{display:'inline',verticalAlign:'middle',marginRight:5}}/>This interface never asks you to connect a wallet or share a seed phrase.</p>
            </section>
          </aside>
        </div>
        </details>
      </>}
    </main>
    <Footer/>
  </div>;
}