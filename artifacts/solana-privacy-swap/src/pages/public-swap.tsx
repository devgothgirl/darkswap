import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronDown, ExternalLink, RefreshCw, Search, ShieldAlert, Wallet, X } from 'lucide-react';
import { Link } from 'wouter';
import { getGetOkxQuoteQueryKey, getSearchOkxTokensQueryKey, useBuildOkxTransaction, useGetOkxQuote, useSearchOkxTokens } from '@workspace/api-client-react';
import type { OkxToken, OkxTransaction } from '@workspace/api-client-react';
import { errorText, Footer, Header } from '../components/swap-ui';
import { deserializeSwapTransaction, getWallet, isValidMint } from '../components/solana-wallet';

function PublicTokenPicker({label,token,onChange}: {label:string;token:OkxToken|null;onChange:(token:OkxToken)=>void}) {
  const [open,setOpen]=useState(false);
  const [term,setTerm]=useState('');
  const [debounced,setDebounced]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(term.trim()),250);return()=>clearTimeout(timer);},[term]);
  const params={...(debounced?{term:debounced}:{})};
  const results=useSearchOkxTokens(params,{query:{queryKey:getSearchOkxTokensQueryKey(params),enabled:open,staleTime:60_000}});
  return <div className="public-picker">
    <button className="token-trigger" type="button" onClick={()=>setOpen(!open)} aria-expanded={open} data-testid={`button-select-${label}`}><span className="token-icon">{token?.symbol.slice(0,2).toUpperCase() || <Search size={14}/>}</span><span className="label">{token?.symbol || 'Select token'}</span><ChevronDown size={14}/></button>
    {open && <div className="token-popover"><div className="search-wrap"><Search size={15}/><input autoFocus className="input-standard" value={term} onChange={e=>setTerm(e.target.value)} placeholder="Search OKX Solana tokens" data-testid={`input-search-${label}`}/></div><div className="token-list">
      {results.isLoading ? <div style={{padding:12}}><div className="skeleton" style={{marginBottom:12}}/><div className="skeleton" style={{width:'70%'}}/></div>
      : results.isError ? <div className="blank-state" style={{padding:15}}><p className="quote-error">{errorText(results.error)}</p><button type="button" className="secondary-button" onClick={()=>results.refetch()} data-testid={`button-retry-${label}`}>Retry</button></div>
      : !results.data?.tokens.length ? <div className="token-empty"><Search size={16}/><p className="muted-note">No supported Solana tokens found.</p></div>
      : results.data.tokens.map(item=><button key={item.mint} className="token-option" type="button" onClick={()=>{onChange(item);setOpen(false);}} data-testid={`button-${label}-token-${item.mint}`}><span className="token-icon">{item.symbol.slice(0,2).toUpperCase()}</span><span><strong>{item.symbol}</strong><small>{item.name}</small></span></button>)}
    </div></div>}
  </div>;
}

export default function PublicSwap() {
  const initialMint = new URLSearchParams(window.location.search).get('mint') || '';
  const validInitialMint = isValidMint(initialMint) ? initialMint : '';
  const [from,setFrom]=useState<OkxToken|null>(null);
  const [to,setTo]=useState<OkxToken|null>(null);
  const [amount,setAmount]=useState('');
  const [debounced,setDebounced]=useState('');
  const [walletAddress,setWalletAddress]=useState('');
  const [walletError,setWalletError]=useState('');
  const [review,setReview]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [sendError,setSendError]=useState('');
  const [signature,setSignature]=useState('');
  const [built,setBuilt]=useState<{value:OkxTransaction;at:number}|null>(null);
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(amount),400);return()=>clearTimeout(timer);},[amount]);
  const prefillParams={term:validInitialMint};
  const prefill=useSearchOkxTokens(prefillParams,{query:{queryKey:getSearchOkxTokensQueryKey(prefillParams),enabled:!!validInitialMint,staleTime:60_000}});
  useEffect(()=>{if(!from && validInitialMint && prefill.data?.tokens) {const match=prefill.data.tokens.find(t=>t.mint===validInitialMint);if(match)setFrom(match);}},[from,validInitialMint,prefill.data]);
  const validAmount=/^(?:\d+)(?:\.\d+)?$/.test(amount) && Number.isFinite(Number(amount)) && Number(amount)>0 && amount.length<=32 && (from ? (amount.split('.')[1]?.length || 0)<=from.decimals : true);
  const ready=!!from && !!to && from.mint!==to.mint && validAmount && debounced===amount;
  const quoteParams={fromMint:from?.mint||'',toMint:to?.mint||'',amount:debounced};
  const quote=useGetOkxQuote(quoteParams,{query:{queryKey:getGetOkxQuoteQueryKey(quoteParams),enabled:ready,staleTime:15_000,refetchOnWindowFocus:!review}});
  const build=useBuildOkxTransaction();
  const change=()=>{setReview(false);setBuilt(null);setSendError('');setSignature('');build.reset();};
  const connect=async()=>{
    setWalletError('');
    const provider=getWallet();
    if(!provider){setWalletError('No Phantom-compatible Solana wallet was found. Install or enable a wallet extension, then try again.');return;}
    try { const result=await provider.connect(); const address=result.publicKey?.toBase58() || provider.publicKey?.toBase58(); if(!address || !isValidMint(address)) throw new Error('Wallet did not provide a valid Solana address.'); setWalletAddress(address); }
    catch(error){setWalletError(errorText(error));}
  };
  const disconnect=async()=>{try{await getWallet()?.disconnect?.();}catch{/* local disconnect still clears state */}setWalletAddress('');setReview(false);setBuilt(null);};
  const closeReview=()=>{setReview(false);setBuilt(null);setSendError('');};
  const send=async()=>{
    if(!ready || !walletAddress || !quote.data || submitting || !from || !to) return;
    setSubmitting(true);setSendError('');
    try {
      const provider=getWallet();
      if(!provider) throw new Error('Wallet is no longer available. Reconnect and try again.');
      if(provider.publicKey?.toBase58() !== walletAddress) throw new Error('Wallet account changed. Reconnect and review the swap again.');
      if(!built) {
        const result=await build.mutateAsync({data:{fromMint:from.mint,toMint:to.mint,amount,wallet:walletAddress}});
        if(!result.transaction) throw new Error('No transaction was returned. Nothing was sent.');
        setBuilt({value:result,at:Date.now()});
        return;
      }
      if(Date.now()-built.at>30_000) {
        setBuilt(null);
        throw new Error('The prepared transaction is older than 30 seconds. Build a fresh route before signing.');
      }
      const transaction=deserializeSwapTransaction(built.value.transaction);
      const sent=await provider.signAndSendTransaction(transaction);
      const txSignature=typeof sent==='string'?sent:sent?.signature;
      if(!txSignature) throw new Error('Wallet did not return a transaction signature. Check your wallet activity before trying again.');
      setSignature(txSignature);setReview(false);setBuilt(null);
    }catch(error){setSendError(errorText(error));}
    finally{setSubmitting(false);}
  };
  return <div className="app-shell"><Header/><main className="workspace-layout page-enter">
    <div className="eyebrow"><span className="eyebrow-line"/> DARKSWAP / TRANSPARENT EXECUTION</div>
    <div className="workspace-heading"><h1>The public<br/><span>route.</span></h1><p>An OKX-powered swap between Solana assets. Connect a wallet only here, and inspect the quote before explicitly signing.</p></div>
    <div className="public-disclosure" role="note"><ShieldAlert size={19}/><div><strong>This is not a private exchange.</strong><p>Your wallet address, swap and transaction are public on Solana. This separate OKX route is same-chain only. For a private route, return to <Link href="/" style={{color:'#ffe8bd',textDecoration:'underline'}} data-testid="link-private-from-public">private exchange</Link>.</p></div></div>
    <div className="public-layout">
      <section className="swap-card" aria-label="Public Solana swap">
        <div className="card-header"><div><div className="card-heading">Public Solana swap</div><div className="card-subtitle" style={{marginTop:5}}>OKX / SOLANA → SOLANA</div></div><Wallet size={21} color="#c8ed78"/></div>
        <div className="card-body">
          <div className="public-pair"><div><span className="section-label">You send · Solana</span><PublicTokenPicker label="from" token={from} onChange={v=>{setFrom(v);change();}}/></div><div><span className="section-label">You receive · Solana</span><PublicTokenPicker label="to" token={to} onChange={v=>{setTo(v);change();}}/></div></div>
          {validInitialMint && !from && prefill.isLoading && <p className="muted-note">Checking whether the selected mint is supported by OKX…</p>}
          {validInitialMint && !from && prefill.isSuccess && !prefill.data?.tokens.some(t=>t.mint===validInitialMint) && <p className="quote-error">This Solana mint is not in OKX's supported list. Choose a token above.</p>}
          {validInitialMint && !from && prefill.isError && <p className="quote-error">Could not check the selected mint. Choose a token above or try again later.</p>}
          <label className="section-label" htmlFor="public-amount">Amount to swap</label>
          <div className="field-box amount-row"><input id="public-amount" type="text" inputMode="decimal" className="amount-input" placeholder="0.00" maxLength={32} value={amount} onChange={e=>{setAmount(e.target.value);change();}} data-testid="input-public-amount"/><span className="card-subtitle">{from?.symbol||'TOKEN'}</span></div>
          {amount && !validAmount && <p className="quote-error" role="alert" data-testid="status-public-amount-invalid">Enter a positive amount with no more than {from?.decimals ?? 'the token’s'} decimal places.</p>}
          {from && to && from.mint===to.mint && <p className="quote-error" role="alert">Choose two different Solana tokens.</p>}
          <div className="public-quote" aria-live="polite"><div className="quote-top"><span className="quote-title">Indicative public quote</span><span className="quote-live"><span className="live-dot"/> OKX ROUTE</span></div>
            {!from || !to || !amount ? <p className="muted-note" style={{paddingTop:17}}>Select two supported tokens and enter an amount to see a quote.</p>
            : !ready || quote.isLoading ? <div style={{paddingTop:18}} data-testid="status-public-quote-loading"><div className="skeleton" style={{width:'70%',marginBottom:13}}/><div className="skeleton" style={{width:'50%'}}/></div>
            : quote.isError ? <div style={{paddingTop:14}}><p className="quote-error" role="alert" data-testid="status-public-quote-error">{errorText(quote.error)}</p><button className="secondary-button" type="button" onClick={()=>quote.refetch()} data-testid="button-retry-public-quote"><RefreshCw size={13}/> Retry quote</button></div>
            : quote.data ? <><div className="detail-row detail-flex"><span className="metric-label">Estimated receive</span><strong data-testid="text-public-output">{quote.data.amountOut} {quote.data.toSymbol}</strong></div><div className="detail-row detail-flex"><span className="metric-label">Price impact</span><strong>{quote.data.priceImpactPercent}%</strong></div><div className="detail-row detail-flex"><span className="metric-label">Trade fee</span><strong>{quote.data.tradeFeeUsd == null ? 'Included in route' : `$${quote.data.tradeFeeUsd}`}</strong></div></>
            : null}
          </div>
          {!walletAddress ? <button className="primary-button" type="button" onClick={connect} data-testid="button-connect-wallet"><Wallet size={16}/> Connect Solana wallet</button>
          : <><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:14}}><span className="wallet-address" data-testid="text-wallet-address">{walletAddress.slice(0,6)}…{walletAddress.slice(-6)} · Connected</span><button className="nav-link" type="button" onClick={disconnect} data-testid="button-disconnect-wallet">Disconnect</button></div><button className="primary-button" type="button" disabled={!ready || !quote.data || quote.isFetching} onClick={()=>{setSendError('');setReview(true);}} data-testid="button-review-public-swap">Review public swap <ArrowRight size={16}/></button></>}
          {walletError && <p className="quote-error" role="alert" data-testid="status-wallet-error">{walletError}</p>}
          {signature && <div className="success-panel" role="status" data-testid="status-public-sent"><strong>Transaction submitted to Solana.</strong><p className="muted-note" style={{marginBottom:12}}>Submission is not confirmation. Check status in an explorer.</p><a href={`https://solscan.io/tx/${encodeURIComponent(signature)}`} target="_blank" rel="noopener noreferrer" data-testid="link-solscan-transaction">View {signature.slice(0,14)}… on Solscan <ExternalLink size={12} style={{display:'inline'}}/></a></div>}
          <p className="fine-print">Nothing is submitted until you confirm in your wallet. Network fees apply.</p>
        </div>
      </section>
       <aside className="public-info"><span className="eyebrow">ROUTE BOUNDARIES</span><h2 style={{marginTop:17}}>Know which path<br/>you are taking.</h2><div className="detail-row"><strong>01 / Public execution</strong><span>OKX builds a same-chain Solana transaction. Your connected wallet reviews, signs and sends it. Activity is visible on-chain.</span></div><div className="detail-row"><strong>02 / Fixed slippage</strong><span>A fresh route uses 0.5% slippage. Its output may differ from the indicative quote; review the fresh minimum before opening your wallet.</span></div><div className="detail-row"><strong>03 / Cross-chain transfers</strong><span>Bridging is not integrated in this page because a Solana-origin bridge API route has not been verified. OKX offers a separate public bridge product; use it directly if you choose, or return to Houdini for supported private routes.</span></div><a href="https://web3.okx.com/dex-swap/bridge" target="_blank" rel="noopener noreferrer" className="secondary-button" style={{textDecoration:'none',marginTop:23}} data-testid="link-okx-bridge">Open OKX Bridge (external) <ExternalLink size={13}/></a><Link href="/" className="secondary-button" style={{textDecoration:'none',marginTop:10,marginLeft:8}} data-testid="link-private-route">Explore private routes <ArrowUpRight size={13}/></Link></aside>
    </div>
  </main><Footer/>
   {review && from && to && quote.data && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget && !submitting)closeReview();}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="public-review-title"><div style={{display:'flex',justifyContent:'space-between',alignItems:'start',gap:15}}><div><span className="section-label">Wallet authorization</span><h2 id="public-review-title">Review public swap.</h2></div><button type="button" className="secondary-button" onClick={closeReview} disabled={submitting} aria-label="Close review" data-testid="button-close-public-review"><X size={15}/></button></div><p>This is a transparent on-chain transaction, not the private Houdini route. Review the transaction again in your wallet before approving.</p><div className="modal-row"><span>Send</span><strong>{amount} {from.symbol} · Solana</strong></div><div className="modal-row"><span>Indicative receive</span><strong>{quote.data.amountOut} {to.symbol} · Solana</strong></div>{built && <><div className="modal-row"><span>Fresh OKX estimate</span><strong>{built.value.amountOut} {built.value.toSymbol}</strong></div><div className="modal-row"><span>Minimum receive at 0.5% slippage</span><strong>{built.value.minAmountOut} {built.value.toSymbol}</strong></div></>}<div className="modal-row"><span>Signing wallet</span><strong>{walletAddress}</strong></div><div className="warning-box">{built ? 'Compare the fresh estimate and minimum above with the indicative quote. The transaction is public. Continuing opens your wallet for an additional approval; reject it if the details differ from what you expect.' : 'Build a fresh OKX route with 0.5% slippage first. Nothing is signed or sent at this step. Your wallet address and trade will be public.'}</div>{sendError && <p className="quote-error" role="alert" data-testid="status-public-send-error">{sendError}</p>}<button className="primary-button" type="button" disabled={submitting} onClick={send} data-testid="button-sign-send-public">{submitting ? built ? 'Waiting for wallet…' : 'Building fresh route…' : built ? 'Open wallet to sign & send' : 'Build fresh OKX route'} <ArrowDown size={16}/></button><button className="nav-link" type="button" disabled={submitting} onClick={closeReview} style={{display:'block',margin:'17px auto 0'}} data-testid="button-cancel-public">Cancel</button></div></div>}
  </div>;
}