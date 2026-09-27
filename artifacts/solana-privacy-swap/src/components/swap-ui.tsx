import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronDown, Copy, LockKeyhole, Search, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { getSearchSwapTokensQueryKey, useSearchSwapTokens } from '@workspace/api-client-react';
import type { SwapToken } from '@workspace/api-client-react';

export const RECENT_ORDER_KEY = 'solana-privacy-swap:recent-order';

function safeErrorText(message: string): string {
  return /houdini(?:swap)?/i.test(message)
    ? 'The private route is temporarily unavailable. Please try again.'
    : message;
}

export function errorText(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.';
  if (typeof error === 'string') return safeErrorText(error);
  if (typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e.message === 'string') return safeErrorText(e.message);
    if (typeof e.error === 'string') return safeErrorText(e.error);
    if (e.data && typeof e.data === 'object') {
      const data = e.data as Record<string, unknown>;
      if (typeof data.message === 'string') return safeErrorText(data.message);
      if (typeof data.error === 'string') return safeErrorText(data.error);
    }
  }
  return 'The request could not be completed. Please try again.';
}

export function useRecentOrder() {
  const [id, setId] = useState(() => {
    try { return localStorage.getItem(RECENT_ORDER_KEY) || ''; } catch { return ''; }
  });
  return { id, save: (next: string) => {
    try { localStorage.setItem(RECENT_ORDER_KEY, next); } catch { /* Storage may be unavailable. */ }
    setId(next);
  } };
}

export function Header() {
  const [location, navigate] = useLocation();
  const [lookupOpen, setLookupOpen] = useState(false);
  const [id, setId] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!id.trim()) return;
    setLookupOpen(false);
    navigate(`/order/${encodeURIComponent(id.trim())}`);
  };
  return <>
    <header className="topbar">
       <Link href="/" className="brand" data-testid="link-home"><img className="brand-icon" src={`${import.meta.env.BASE_URL}brand/icon.png`} alt=""/><img className="brand-wordmark" src={`${import.meta.env.BASE_URL}brand/wordmark.png`} alt="DarkSwap"/></Link>
      <nav className="site-nav" aria-label="Main navigation">
        <Link href="/" className={location==='/'?'active':''} data-testid="link-nav-home">Landing</Link>
        <Link href="/swap" className={location==='/swap'?'active':''} data-testid="link-nav-private">Private route · live</Link>
        <Link href="/near-swap" className={location==='/near-swap'||location==='/near-order'?'active':''} data-testid="link-nav-near"><span className="nav-near-glyph" aria-hidden="true">⋈</span> Privacy swap</Link>
        <Link href="/docs" className={location==='/docs'?'active':''} data-testid="link-nav-docs">Docs</Link>
        <Link href="/previews" className={['/previews','/screener-beta','/screener-preview','/split-mixer-preview','/splitwise-preview','/privacy-bundle-preview'].includes(location)?'active':''} data-testid="link-nav-previews">Previews</Link>
        <Link href="/explore" className={location==='/explore'?'active':''} data-testid="link-nav-explore">Explore · closed beta</Link>
        <Link href="/public-swap" className={location==='/public-swap'?'active':''} data-testid="link-nav-public">Public · closed beta</Link>
      </nav>
      <div className="top-right">
        <span className="network-pill"><i /> {location==='/swap' ? 'Private route · live quote' : location==='/near-swap'||location==='/near-order' ? 'Privacy swap · live quote' : location==='/screener-beta'||location==='/screener-preview' ? 'Screener Beta · dated catalog' : location==='/split-mixer-preview'||location==='/splitwise-preview'||location==='/privacy-bundle-preview'||location==='/previews' ? 'Feature previews · no transfers' : location==='/explore' ? 'Explore · closed beta' : location==='/public-swap' ? 'Public swap · closed beta' : 'Private beta · Solana origin'}</span>
        <button className="nav-link" onClick={() => setLookupOpen(true)} data-testid="button-lookup-order">Track an order <ArrowRight size={13} style={{display:'inline',verticalAlign:'middle',marginLeft:3}} /></button>
      </div>
    </header>
    {lookupOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setLookupOpen(false); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lookup-title">
        <div style={{display:'flex',justifyContent:'space-between',gap:15,alignItems:'start'}}>
          <div><span className="section-label">Order lookup</span><h2 id="lookup-title">Find your transfer.</h2></div>
          <button className="secondary-button" onClick={() => setLookupOpen(false)} aria-label="Close" data-testid="button-close-lookup"><X size={15}/></button>
        </div>
        <p>Enter the order ID from your deposit instructions. No wallet connection needed.</p>
        <form onSubmit={submit}>
          <label className="section-label" htmlFor="lookup-id" style={{marginTop:22}}>Order ID</label>
          <input id="lookup-id" className="input-standard" autoFocus value={id} onChange={e=>setId(e.target.value)} placeholder="Paste your order ID" data-testid="input-order-id"/>
          <button className="primary-button" type="submit" disabled={!id.trim()} style={{marginTop:15}} data-testid="button-find-order">Find order <ArrowRight size={16}/></button>
        </form>
        <p style={{marginTop:20}}>Using Privacy swap? <Link href="/near-order" onClick={() => setLookupOpen(false)}>Track by deposit address <ArrowRight size={13} style={{display:'inline',verticalAlign:'middle'}} /></Link></p>
      </div>
    </div>}
  </>;
}

export function Footer() {
  return <footer className="footer"><span>DARKSWAP / PRIVATE BETA</span><span>Routes live: <Link href="/swap" style={{color:'#d2b5ff'}}>private route</Link> and <Link href="/near-swap" style={{color:'#d2b5ff'}}>Privacy swap</Link> · Explore and public swap are closed beta</span></footer>;
}

export function CopyButton({ value, name }: {value: string; name: string}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  };
  return <button className="secondary-button" type="button" onClick={copy} aria-label={`Copy ${name}`} data-testid={`button-copy-${name.replace(/\s+/g,'-')}`}>{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? 'Copied' : 'Copy'}</button>;
}

function TokenBadge({token}: {token: SwapToken}) {
  const [broken, setBroken] = useState(false);
  return <span className="token-icon">{token.icon && !broken ? <img src={token.icon} alt="" onError={() => setBroken(true)}/> : token.symbol.slice(0,2).toUpperCase()}</span>;
}

export function TokenPicker({side, token, onChange}: {side:'source'|'destination'; token: SwapToken | null; onChange:(token:SwapToken)=>void}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setTimeout(() => setDebounced(term.trim()), 220); return () => clearTimeout(timer); }, [term]);
  useEffect(() => {
    if (!open) return;
    const close = (e:MouseEvent) => { if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e:KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown',close); document.addEventListener('keydown',esc);
    return () => { document.removeEventListener('mousedown',close); document.removeEventListener('keydown',esc); };
  },[open]);
  const params = {side, ...(debounced ? {term:debounced} : {})};
  const results = useSearchSwapTokens(params, {query:{queryKey:getSearchSwapTokensQueryKey(params),staleTime:60_000,enabled:open}});
  const tokens = (results.data?.tokens || []).filter(t => side !== 'source' || /sol/i.test(t.chain) || /solana/i.test(t.chainName));
  return <div ref={wrapper} style={{position:'relative'}}>
    <button type="button" className="token-trigger" onClick={()=>{setOpen(!open);setTerm('');setDebounced('');}} aria-expanded={open} aria-label={`Select ${side} token`} data-testid={`button-select-${side}`}>
      {token ? <TokenBadge token={token}/> : <span className="token-icon"><Search size={13}/></span>}
      <span className="label">{token?.symbol || 'Select token'}</span><ChevronDown size={14}/>
    </button>
    {open && <div className="token-popover">
       <div style={{position:'relative'}}><Search size={15} style={{position:'absolute',left:11,top:13,color:'#a8beb1'}}/><input className="input-standard" style={{paddingLeft:34}} autoFocus value={term} onChange={e=>setTerm(e.target.value)} placeholder={side === 'source' ? 'Search Solana assets' : 'Search tokens or chains'} data-testid={`input-search-${side}`}/></div>
      <div className="token-list">
        {results.isLoading || results.isFetching && !results.data ? <div style={{padding:'15px 4px'}}><div className="skeleton" style={{width:'80%',marginBottom:14}}/><div className="skeleton" style={{width:'60%',marginBottom:14}}/><div className="skeleton" style={{width:'75%'}}/></div>
        : results.isError ? <div style={{padding:'15px 5px'}}><p className="quote-error" data-testid={`status-token-error-${side}`}>{errorText(results.error)}</p><button className="secondary-button" type="button" onClick={()=>results.refetch()} data-testid={`button-retry-${side}`}>Try again</button></div>
         : tokens.length === 0 ? <div className="token-empty" data-testid={`status-token-empty-${side}`}><Search size={16}/><p className="muted-note">No {side === 'source' ? 'Solana assets' : 'supported assets'} found. Try a different search.</p></div>
        : tokens.map(t => <button key={t.id} type="button" className="token-option" onClick={()=>{onChange(t);setOpen(false);}} data-testid={`button-token-${side}-${t.id}`}><TokenBadge token={t}/><span><strong>{t.symbol}</strong><small>{t.name}</small></span><span className="chain-name">{t.chainName}</span></button>)}
      </div>
    </div>}
  </div>;
}

export function PrivacyNote() {
  return <span style={{display:'inline-flex',gap:7,alignItems:'center'}}><LockKeyhole size={12}/> No wallet connection</span>;
}