import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Clock3,
  LockKeyhole,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import "./_group.css";

type Token = { symbol: string; name: string; chainName: string; id: string };

const sol: Token = { id: "sol", symbol: "SOL", name: "Solana", chainName: "Solana", };
const usdc: Token = { id: "usdc", symbol: "USDC", name: "USD Coin", chainName: "Ethereum", };
const btc: Token = { id: "btc", symbol: "BTC", name: "Bitcoin", chainName: "Bitcoin", };
const routes = [
  { amount: "0.08421", fee: "$0.18", time: "~18 min" },
  { amount: "0.08394", fee: "$0.11", time: "~24 min" },
];

function TokenBadge({ token }: { token: Token }) {
  return <span className="token-icon">{token.symbol.slice(0, 2)}</span>;
}

function TokenPicker({
  token,
  destination,
  onChange,
}: {
  token: Token;
  destination?: boolean;
  onChange: (token: Token) => void;
}) {
  const [open, setOpen] = useState(false);
  const choices = destination ? [usdc, btc] : [sol];
  return (
    <div className="picker-wrap">
      <button className="token-trigger" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <TokenBadge token={token} /><span className="label">{token.symbol}</span><ChevronDown size={14} />
      </button>
      {open && <div className="token-popover">
        <div className="search-field"><Search size={14} /><input autoFocus placeholder={destination ? "Search tokens or chains" : "Search Solana assets"} /></div>
        <div className="token-list">{choices.map((choice) => (
          <button className="token-option" type="button" key={choice.id} onClick={() => { onChange(choice); setOpen(false); }}>
            <TokenBadge token={choice} /><span><strong>{choice.symbol}</strong><small>{choice.name}</small></span><span className="chain-name">{choice.chainName}</span>
          </button>
        ))}</div>
      </div>}
    </div>
  );
}

function Header({ onTrack }: { onTrack: () => void }) {
  return <header className="topbar">
    <a className="brand" href="#private"><span className="brand-mark">∿</span><span>Dark<span className="signal">Swap</span></span></a>
    <nav className="site-nav"><a className="active" href="#private">Private swap</a><a href="#explore">Explore</a><a href="#public">Public swap</a></nav>
    <div className="top-right"><span className="network-pill"><i /> Solana in · any chain out</span><button className="nav-link" onClick={onTrack}>Track an order <ArrowRight size={13} /></button></div>
  </header>;
}

function TrackModal({ close }: { close: () => void }) {
  const [id, setId] = useState("");
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="modal"><div className="modal-head"><div><span className="section-label">Order lookup</span><h2>Find your transfer.</h2></div><button className="secondary-button" onClick={close} aria-label="Close"><X size={15} /></button></div>
      <p>Enter the order ID from your deposit instructions. Tracking is read-only.</p>
      <label className="section-label">Order ID</label><input className="input-standard" value={id} onChange={(event) => setId(event.target.value)} placeholder="Paste your order ID" />
      <button className="primary-button" disabled={!id.trim()} style={{ marginTop: 15 }}>Find order <ArrowRight size={16} /></button>
    </div>
  </div>;
}

export function Current() {
  const [from, setFrom] = useState(sol);
  const [to, setTo] = useState(usdc);
  const [amount, setAmount] = useState("1.25");
  const [address, setAddress] = useState("0x7a3f…91c2");
  const [route, setRoute] = useState(0);
  const [review, setReview] = useState(false);
  const [tracking, setTracking] = useState(false);
  const selected = routes[route];
  return <div className="darkswap-beta">
    <Header onTrack={() => setTracking(true)} />
    <main className="main-grid">
      <div className="page-enter">
        <div className="eyebrow"><span className="eyebrow-line" /> DARKSWAP / PRIVATE ROUTING</div>
        <h1 className="hero-title">Move value.<br /><em>Leave less</em><br />behind.</h1>
        <p className="hero-copy">A quieter way out of Solana. Compare a live private route, choose where your assets land, then send from any Solana wallet. Creating an order moves no funds.</p>
        <div className="hero-stamp"><LockKeyhole size={28} strokeWidth={1.3} /></div>
        <ol className="flow-list">
          <li className="flow-item"><span className="flow-num">01</span><div><strong>Choose your route</strong><p>Start with a Solana asset. Find a destination on a supported chain.</p></div></li>
          <li className="flow-item"><span className="flow-num">02</span><div><strong>Review the live quote</strong><p>See the estimated output and fees before committing.</p></div></li>
          <li className="flow-item"><span className="flow-num">03</span><div><strong>Send to the deposit address</strong><p>Create an order, then manually send the exact amount. Track it here.</p></div></li>
        </ol>
      </div>
      <section className="swap-card page-enter" aria-label="Private swap">
        <div className="card-header"><div><div className="card-heading">Private exchange</div><div className="card-subtitle">Solana → another chain</div></div><ShieldCheck size={22} color="#c8ed78" strokeWidth={1.5} /></div>
        <div className="card-body">
          <label className="section-label">You send <span className="label-right">On Solana</span></label>
          <div className="field-box amount-row"><input className="amount-input" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /><TokenPicker token={from} onChange={setFrom} /></div>
          <div className="field-help">≈ $162.84 USD</div>
          <div className="direction-divider"><span className="direction-icon"><ArrowDown size={15} /></span></div>
          <label className="section-label">They receive <span className="label-right">{to.chainName}</span></label>
          <div className="field-box receive-row"><span className="receive-amount">{selected.amount}</span><TokenPicker token={to} destination onChange={setTo} /></div>
          <div className="field-help">{to.name} · {to.chainName}</div>
          <div className="quote-panel"><div className="quote-top"><span className="quote-title">Private route quote</span><span className="quote-live"><span className="live-dot" /> LIVE DATA</span></div>
            <div className="route-tabs">{routes.map((item, index) => <button type="button" className={`secondary-button ${index === route ? "chosen" : ""}`} key={item.time} onClick={() => setRoute(index)}>Route {index + 1} · {item.amount} {to.symbol}</button>)}</div>
            <div className="quote-grid"><div><span className="metric-label">Estimated receive</span><span className="metric-value">{selected.amount} {to.symbol}</span></div><div><span className="metric-label">Route fee</span><span className="metric-value">{selected.fee}</span></div><div><span className="metric-label">Expected time</span><span className="metric-value">{selected.time}</span></div><div><span className="metric-label">Quote freshness</span><span className="metric-value">3:42</span></div></div>
          </div>
          <div className="address-block"><label className="section-label">Recipient address <span className="label-right">On {to.chainName}</span></label><input className="input-standard" value={address} onChange={(event) => setAddress(event.target.value)} /><p className="field-help">Double-check the chain and address. Transfers cannot be reversed.</p></div>
          <button className="primary-button" style={{ marginTop: 23 }} onClick={() => setReview(true)}>Review order <ArrowRight size={17} /></button>
          <p className="fine-print">Creating an order does not move your funds. You make the deposit yourself.</p>
        </div>
        <div className="trust-strip"><span><LockKeyhole size={12} /> Orders move no funds</span><span><Clock3 size={12} /> Private execution takes longer</span></div>
      </section>
    </main>
    <footer className="footer"><span>DARKSWAP / PRIVATE AND PUBLIC ROUTES ARE DISTINCT.</span><span>Private exchange · Public Solana swap</span></footer>
    {review && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReview(false); }}><div className="modal"><div className="modal-head"><div><span className="section-label">Final review</span><h2>Confirm your route.</h2></div><button className="secondary-button" onClick={() => setReview(false)}><X size={15} /></button></div><p>Check the recipient carefully. The deposit address is provided only after you create the order.</p><div className="modal-row"><span>You will send</span><strong>{amount} {from.symbol} · Solana</strong></div><div className="modal-row"><span>Estimated receive</span><strong>{selected.amount} {to.symbol} · {to.chainName}</strong></div><div className="modal-row"><span>Recipient</span><strong>{address}</strong></div><div className="warning-box">Creating this order does not send any assets. You must manually transfer the exact deposit amount on Solana to the address on the next screen.</div><button className="primary-button" onClick={() => setReview(false)}>Confirm &amp; create order</button></div></div>}
    {tracking && <TrackModal close={() => setTracking(false)} />}
  </div>;
}