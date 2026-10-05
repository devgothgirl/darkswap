import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronDown, Copy, LockKeyhole, Menu, Search, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { getGetSwapChainsQueryKey, getSearchSwapTokensQueryKey, useGetSwapChains, useSearchSwapTokens } from '@workspace/api-client-react';
import { compareDestinations } from '../lib/destination-sort';
import type { SwapToken } from '@workspace/api-client-react';
import { RiskDisclaimer } from './risk-disclaimer';
import { trackEvent } from '../lib/analytics';
import { NearFiLink } from './nearfi-link';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [id, setId] = useState('');
  useEffect(() => { setMenuOpen(false); }, [location]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!id.trim()) return;
    setLookupOpen(false);
    navigate(`/order/${encodeURIComponent(id.trim())}`);
  };
  return <>
     <header className={`topbar ${menuOpen ? 'menu-open' : ''}`}>
       <Link href="/" className="brand" data-testid="link-home"><img className="brand-icon" src={`${import.meta.env.BASE_URL}brand/icon.png`} alt=""/><img className="brand-wordmark" src={`${import.meta.env.BASE_URL}brand/wordmark.png`} alt="DarkSwap"/></Link>
       <nav id="site-navigation" className={`site-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          <Link href="/swap" className={location==='/swap'||location==='/near-swap'||location==='/near-order'||location.startsWith('/order/')?'active':''} onClick={() => setMenuOpen(false)} data-testid="link-nav-swap">Swap</Link>
          <a href="https://rewards.darkswap.app" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)} data-testid="link-nav-rewards">Rewards ↗</a>
          <Link href="/pool" className={location.startsWith('/pool')?'active':''} onClick={() => setMenuOpen(false)} data-testid="link-nav-pool">Pool <span className="nav-testnet-tag">testnet</span></Link>
          <Link href="/docs" className={location==='/docs'?'active':''} onClick={() => setMenuOpen(false)} data-testid="link-nav-docs">Docs</Link>
          <NearFiLink onClick={() => setMenuOpen(false)} />
          <button type="button" className="site-nav-track" onClick={() => { setMenuOpen(false); setLookupOpen(true); }}>Track order <ArrowRight size={15}/></button>
      </nav>
      <div className="top-right">
         <button className="nav-link top-track-order" onClick={() => setLookupOpen(true)} data-testid="button-lookup-order">Track order <ArrowRight size={13} style={{display:'inline',verticalAlign:'middle',marginLeft:3}} /></button>
         <button className="site-menu-toggle" type="button" aria-controls="site-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={20}/> : <Menu size={20}/>}</button>
      </div>
    </header>
     {menuOpen && <button className="site-menu-backdrop" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}/>}
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
  return <><RiskDisclaimer/><footer className="footer">
    <span>DARKSWAP / PRIVATE BETA</span>
    <span>Live: <Link href="/swap" style={{color:'#d5bbf9'}}>private route</Link> and <Link href="/near-swap" style={{color:'#d5bbf9'}}>Privacy swap</Link>. Founder demos are not live.</span>
    <span>Privacy swap is built on <a href="https://near-intents.org/" target="_blank" rel="noopener noreferrer" style={{color:'#d5bbf9'}}>NEAR Intents</a>.</span>
    <span><Link href="/rewards" style={{color:'#d5bbf9'}} data-testid="link-footer-account-points">Account points</Link> · <Link href="/founder" style={{color:'#d5bbf9'}} data-testid="link-footer-founder">Founder preview</Link> · <Link href="/help" style={{color:'#d5bbf9'}} data-testid="link-footer-help">Help &amp; support</Link></span>
    <span className="footer-external">NEAR memecoin trades: <a href="https://t.me/nearfi_bot?start=ref_ydy5qj9v" target="_blank" rel="noopener noreferrer">NearFi bot (external) ↗</a> · <a href="https://nearly.trade/" target="_blank" rel="noopener noreferrer" className="nearly-link" data-testid="link-footer-nearly">Nearly ↗</a></span>
  </footer></>;
}

// Only the static field label and route are sent, never the copied value.
const COPY_FIELDS: Record<string, string> = { 'exact amount': 'exact_amount', 'deposit address': 'deposit_address', 'deposit memo': 'deposit_memo', 'order ID': 'order_id', 'outbound transaction': 'outbound_transaction' };
function trackCopy(name: string) {
  const path = window.location.pathname;
  if (name === 'DARK token address') {
    // A public contract address, so only where it was copied from is recorded.
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    trackEvent('token_address_copied', { location: path === base || path === `${base}/` ? 'home' : path.includes('/docs') ? 'docs' : 'other' });
    return;
  }
  const field = COPY_FIELDS[name];
  if (!field) return;
  const route = path.includes('/near-order') ? 'privacy_swap' : path.includes('/order/') ? 'private_route' : '';
  if (route) trackEvent('order_detail_copied', { field, route });
}

export function CopyButton({ value, name }: {value: string; name: string}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      trackCopy(name);
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

export function TokenPicker({side, token, onChange, selectedSource}: {side:'source'|'destination'; token: SwapToken | null; onChange:(token:SwapToken)=>void; selectedSource?: SwapToken | null}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [chain, setChain] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setTimeout(() => setDebounced(term.trim()), 220); return () => clearTimeout(timer); }, [term]);
  useEffect(() => {
    if (!open) return;
    const close = (e:MouseEvent) => { if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e:KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown',close); document.addEventListener('keydown',esc);
    return () => { document.removeEventListener('mousedown',close); document.removeEventListener('keydown',esc); };
  },[open]);
  const destination = side === 'destination';
  const chains = useGetSwapChains({query:{queryKey:getGetSwapChainsQueryKey(),staleTime:60_000,enabled:open && destination}});
  const params = {side, ...(destination && chain ? {chain} : {}), ...(debounced && (!destination || chain) ? {term:debounced} : {})};
  const results = useSearchSwapTokens(params, {query:{queryKey:getSearchSwapTokensQueryKey(params),staleTime:60_000,enabled:open && (!destination || !!chain)}});
  const tokens = (results.data?.tokens || []).filter(t => (side !== 'source' || /sol/i.test(t.chain) || /solana/i.test(t.chainName)) &&
    (!selectedSource || t.chain !== selectedSource.chain || t.symbol !== selectedSource.symbol || t.name !== selectedSource.name));
  const availableChains = (chains.data?.chains || []).filter(c => !term || `${c.name} ${c.id}`.toLowerCase().includes(term.toLowerCase())).slice().sort(compareDestinations);
  const searchLabel = side === 'source' ? 'Search Solana assets' : !chain ? 'Search destination networks' : 'Search assets on this network';
  return <div ref={wrapper} style={{position:'relative'}}>
    <button type="button" className="token-trigger" onClick={()=>{setOpen(!open);setTerm('');setDebounced('');setChain(null);}} aria-expanded={open} aria-label={`Select ${side} token`} data-testid={`button-select-${side}`}>
      {token ? <TokenBadge token={token}/> : <span className="token-icon"><Search size={13}/></span>}
      <span className="label">{token?.symbol || 'Select'}</span><ChevronDown size={14}/>
    </button>
    {open && <div className="token-popover">
       {destination && chain && <button className="secondary-button" type="button" style={{marginBottom:10}} onClick={()=>{setChain(null);setTerm('');setDebounced('');}}>← All networks</button>}
       <div style={{position:'relative'}}><Search size={15} style={{position:'absolute',left:11,top:13,color:'#a37eda'}}/><input className="input-standard" style={{paddingLeft:34}} autoFocus value={term} onChange={e=>setTerm(e.target.value)} aria-label={searchLabel} placeholder={searchLabel} data-testid={`input-search-${side}`}/></div>
      <div className="token-list">
         {destination && !chain ? chains.isLoading ? <div className="skeleton" style={{margin:15}}/>
           : chains.isError ? <div style={{padding:'15px 5px'}}><p className="quote-error">{errorText(chains.error)}</p><button className="secondary-button" type="button" onClick={()=>chains.refetch()}>Try again</button></div>
           : availableChains.length === 0 ? <p className="muted-note" style={{padding:12}}>No destination networks found.</p>
           : availableChains.map(c => <button key={c.id} className="token-option" type="button" onClick={()=>{setChain(c.id);setTerm('');setDebounced('');}} data-testid={`button-destination-chain-${c.id}`}><span><strong>{c.name}</strong><small>View available assets</small></span><ChevronDown size={14}/></button>)
         : results.isLoading || results.isFetching && !results.data ? <div style={{padding:'15px 4px'}}><div className="skeleton" style={{width:'80%',marginBottom:14}}/><div className="skeleton" style={{width:'60%',marginBottom:14}}/><div className="skeleton" style={{width:'75%'}}/></div>
        : results.isError ? <div style={{padding:'15px 5px'}}><p className="quote-error" data-testid={`status-token-error-${side}`}>{errorText(results.error)}</p><button className="secondary-button" type="button" onClick={()=>results.refetch()} data-testid={`button-retry-${side}`}>Try again</button></div>
         : tokens.length === 0 ? <div className="token-empty" data-testid={`status-token-empty-${side}`}><Search size={16}/><p className="muted-note">No {side === 'source' ? 'Solana assets' : 'supported assets'} found. Try a different search.</p></div>
         : tokens.map(t => <button key={t.id} type="button" className="token-option" onClick={()=>{onChange(t);setOpen(false);setChain(null);setTerm('');setDebounced('');}} data-testid={`button-token-${side}-${t.id}`}><TokenBadge token={t}/><span><strong>{t.symbol}</strong><small>{t.name}</small></span><span className="chain-name">{t.chainName}</span></button>)}
      </div>
       {destination && chain && (results.data?.total ?? 0) > (results.data?.tokens.length ?? 0) && <p className="muted-note" style={{marginTop:8}}>Search to find more assets on this network.</p>}
       {destination && <p className="muted-note" style={{marginTop:8}}>A live quote confirms whether your selected pair is available.</p>}
    </div>}
  </div>;
}

export function PrivacyNote() {
  return <span style={{display:'inline-flex',gap:7,alignItems:'center'}}><LockKeyhole size={12}/> Manual deposit</span>;
}
