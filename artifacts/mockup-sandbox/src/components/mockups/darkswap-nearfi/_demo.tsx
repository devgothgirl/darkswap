import { useEffect, useRef, useState, type AnchorHTMLAttributes, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check, Copy, X } from 'lucide-react';

// SANDBOX ONLY: these are non-routable demonstration strings, not wallet addresses.
export const DEMO_ADDRESS = 'DEMO_ONLY_NOT_A_REAL_WALLET_ADDRESS_0001';
export const DEMO_RECIPIENT = 'DEMO_RECIPIENT_NOT_A_REAL_WALLET_ADDRESS';
export const DEMO_REFUND = 'DEMO_REFUND_NOT_A_REAL_WALLET_ADDRESS_00';
const EXCHANGE = '/__mockup/preview/darkswap-nearfi/CurrentExchange';
const TRACKING = '/__mockup/preview/darkswap-nearfi/CurrentTracking';

export type NearToken = { id: string; symbol: string; chainName: string; decimals: number; price?: number; contractAddress?: string };
export type NearQuote = {
  quoteId: string; from: NearToken; to: NearToken; amountIn: string; amountOut: string;
  minAmountOut: string; recipient: string; refundTo: string; validUntil: string;
  estimatedSeconds: number; withdrawFee?: string; refundFee?: string;
};
export type NearOrder = NearQuote & {
  depositAddress: string; depositMemo?: string; deadline: string; updatedAt?: string;
  status: 'PENDING_DEPOSIT' | 'KNOWN_DEPOSIT_TX' | 'INCOMPLETE_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
};

const SOL: NearToken = { id: 'sol', symbol: 'SOL', chainName: 'Solana', decimals: 9, price: 150 };
const USDC: NearToken = { id: 'usdc-near', symbol: 'USDC', chainName: 'NEAR', decimals: 6, price: 1 };
const NEAR: NearToken = { id: 'near', symbol: 'NEAR', chainName: 'NEAR', decimals: 24, price: 4 };
const TOKENS = { source: [SOL, { id: 'usdc-sol', symbol: 'USDC', chainName: 'Solana', decimals: 6, price: 1 }], destination: [USDC, NEAR] };
export const DEMO_ORDER: NearOrder = {
  quoteId: 'DEMO-QUOTE-NO-PROVIDER', from: SOL, to: USDC, amountIn: '1.25', amountOut: '182.50',
  minAmountOut: '180.67', recipient: DEMO_RECIPIENT, refundTo: DEMO_REFUND,
  validUntil: new Date(Date.now() + 45_000).toISOString(), estimatedSeconds: 1200,
  withdrawFee: '0.50', refundFee: '0.01', depositAddress: DEMO_ADDRESS,
  depositMemo: 'DEMO-NOT-A-TRANSFER-MEMO', deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
  updatedAt: new Date().toISOString(), status: 'PENDING_DEPOSIT'
};

export function getGetNearTokensQueryKey(params: { side: 'source' | 'destination'; term?: string }) { return [params.side, params.term]; }
export function useGetNearTokens(params: { side: 'source' | 'destination'; term?: string }, _options?: unknown) {
  const term = params.term?.toLowerCase();
  return { data: { tokens: TOKENS[params.side].filter(t => !term || `${t.symbol} ${t.chainName}`.toLowerCase().includes(term)) }, isLoading: false, isFetching: false, isError: false, error: null, refetch: () => {} };
}
export function useGetNearQuote() {
  const [isPending, setPending] = useState(false);
  return {
    isPending, isError: false, error: null,
    reset: () => setPending(false),
    mutate: ({ data }: { data: { from: string; to: string; amount: string; recipient: string; refundTo: string } }, { onSuccess }: { onSuccess: (quote: NearQuote) => void }) => {
      const from = TOKENS.source.find(t => t.id === data.from);
      const to = TOKENS.destination.find(t => t.id === data.to);
      if (!from || !to) return;
      setPending(true);
      // Local demonstration calculation only; not a market rate or provider quote.
      const amountOut = (Number(data.amount) * (from.price || 0) / (to.price || 1) * 0.973).toFixed(2);
      onSuccess({ quoteId: 'DEMO-QUOTE-NO-PROVIDER', from, to, amountIn: data.amount,
        amountOut, minAmountOut: (Number(amountOut) * 0.99).toFixed(2), recipient: data.recipient,
        refundTo: data.refundTo, validUntil: new Date(Date.now() + 45_000).toISOString(),
        estimatedSeconds: 1200, withdrawFee: '0.50', refundFee: '0.01' });
      setPending(false);
    }
  };
}
export function useCreateNearOrder() {
  const [isPending, setPending] = useState(false);
  return {
    isPending, isError: false, error: null, reset: () => setPending(false),
    mutate: (_request: unknown, { onSuccess }: { onSuccess: (order: NearOrder) => void }) => {
      setPending(true);
      onSuccess({ ...DEMO_ORDER, deadline: new Date(Date.now() + 30 * 60_000).toISOString() });
      setPending(false);
    }
  };
}
export function getGetNearOrderReceiptQueryKey(requestId: string) { return [requestId]; }
export function getGetNearOrderStatusQueryKey(params: { depositAddress: string; depositMemo?: string }) { return [params.depositAddress, params.depositMemo]; }
export function useGetNearOrderReceipt(_requestId: string, _options?: unknown) {
  return { data: undefined as NearOrder | undefined, isLoading: false, isError: true, error: new Error('Receipts are unavailable in the static demo. No provider was contacted.'), isFetching: false, refetch: () => {} };
}
export function useGetNearOrderStatus(params: { depositAddress: string; depositMemo?: string }, _options?: unknown) {
  const valid = params.depositAddress === DEMO_ADDRESS;
  return { data: valid ? DEMO_ORDER : undefined, isLoading: false, isError: !valid, error: new Error('Only the labeled demo order can be shown here. No provider was contacted.'), isFetching: false, refetch: () => {} };
}

function previewHref(href: string) {
  if (href.startsWith('/near-order')) return TRACKING + href.slice('/near-order'.length);
  if (href === '/near-swap' || href === '/') return EXCHANGE;
  return EXCHANGE;
}
export function navigate(href: string) { window.location.assign(previewHref(href)); }
export function Link({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) {
  return <a href={previewHref(href)} {...props}>{children}</a>;
}
export function errorText(error: unknown) { return error instanceof Error ? error.message : 'This demonstration cannot reach a provider.'; }

// Header, footer, and copy control extracted from src/components/swap-ui.tsx.
// Links remain inside the sandbox; order lookup cannot query the production API.
export function Header() {
  const [lookupOpen, setLookupOpen] = useState(false);
  const [id, setId] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); setLookupOpen(false); navigate('/near-order'); };
  return <>
    <header className="topbar">
      <Link href="/" className="brand" data-testid="link-home"><img className="brand-icon" src="/__mockup/images/darkswap-nearfi/icon.png" alt=""/><img className="brand-wordmark" src="/__mockup/images/darkswap-nearfi/wordmark.png" alt="DarkSwap"/></Link>
      <nav className="site-nav" aria-label="Main navigation">
        <Link href="/swap" data-testid="link-nav-private">Private route</Link>
        <Link href="/near-swap" className="active" data-testid="link-nav-near"><span className="nav-near-glyph" aria-hidden="true">⋈</span> Privacy swap</Link>
        <Link href="/docs" data-testid="link-nav-docs">Docs</Link>
      </nav>
      <div className="top-right"><button className="nav-link" onClick={() => setLookupOpen(true)} data-testid="button-lookup-order">Track order <ArrowRight size={13} style={{display:'inline',verticalAlign:'middle',marginLeft:3}} /></button></div>
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
  return <footer className="footer">
    <span>DARKSWAP / PRIVATE BETA</span>
    <span>Routes live: <Link href="/swap" style={{color:'#d2b5ff'}}>private route</Link> and <Link href="/near-swap" style={{color:'#d2b5ff'}}>Privacy swap</Link> · Explore and public swap are closed beta</span>
    <span className="footer-external">NEAR memecoin trades: <a href="https://nearfi.trade/#bot" target="_blank" rel="noopener noreferrer">NearFi bot (external) ↗</a></span>
  </footer>;
}
export function CopyButton({ value, name }: { value: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    // Never put demonstration addresses/memos onto a clipboard.
    if (value.startsWith('DEMO')) { setCopied(false); return; }
    try {
      await navigator.clipboard.writeText(value); setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  };
  return <button className="secondary-button" type="button" onClick={copy} disabled={value.startsWith('DEMO')} aria-label={`Copy ${name}`} data-testid={`button-copy-${name.replace(/\s+/g,'-')}`}>{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? 'Copied' : 'Copy'}</button>;
}