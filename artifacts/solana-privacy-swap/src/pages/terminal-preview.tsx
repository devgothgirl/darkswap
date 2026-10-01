import { useEffect, useId, useMemo, useState } from 'react';
import { Search, X, FlaskConical } from 'lucide-react';
import { Footer, Header } from '../components/swap-ui';
import { TerminalEconomics } from '../components/terminal-economics';
import { DEMO_FEE_RATE, DEMO_GROUPS, DEMO_TOKENS, fmtCompact, fmtPrice, type DemoToken } from './terminal-preview-data';
import './terminal-preview.css';

type Side = 'buy' | 'sell';
type Result = { side: Side; symbol: string; amount: number; total: number; fee: number } | null;

function Sparkline({ token }: { token: DemoToken }) {
  const s = token.series; const min = Math.min(...s); const max = Math.max(...s); const r = max - min || 1;
  const pts = s.map((v, i) => `${(i / (s.length - 1)) * 100},${40 - ((v - min) / r) * 36 - 2}`).join(' ');
  const up = token.change24h >= 0;
  return <svg className="tp-spark" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`Synthetic demo price series for ${token.symbol}, ${up ? 'rising' : 'falling'}`}>
    <polyline points={pts} fill="none" stroke={up ? '#8fe3b8' : '#ff9aa8'} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
  </svg>;
}

export default function TerminalPreview() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(DEMO_TOKENS[0].id);
  const [side, setSide] = useState<Side>('buy');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result>(null);
  const amountId = useId();

  useEffect(() => {
    const title = document.title;
    const t = 'Terminal Preview (demo) | DarkSwap';
    document.title = t;
    const updates = [
      ['meta[name="description"]', 'Preview DarkSwap’s planned cross-chain trading terminal with NEAR Intents. Fictional demo tokens only; no wallet, live prices, or transactions.'],
      ['meta[property="og:title"]', t],
      ['meta[property="og:description"]', 'Fictional demo tokens, synthetic market values and a simulated order panel. Nothing is executed.'],
    ] as const;
    const prev = updates.map(([sel, content]) => { const el = document.querySelector<HTMLMetaElement>(sel); const o = el?.content; if (el) el.content = content; return { el, o }; });
    return () => { document.title = title; prev.forEach(({ el, o }) => { if (el && o !== undefined) el.content = o; }); };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => DEMO_TOKENS.filter(t => !q || t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q)), [q]);
  const token = DEMO_TOKENS.find(t => t.id === selectedId) ?? DEMO_TOKENS[0];

  const clearSim = () => { setResult(null); setError(''); };
  const select = (id: string) => { setSelectedId(id); clearSim(); };

  const n = Number(amount);
  const valid = amount.trim() !== '' && Number.isFinite(n) && n > 0 && n <= 1e9;
  const gross = valid ? n * token.price : 0;
  const fee = gross * DEMO_FEE_RATE;

  function simulate(e: React.FormEvent) {
    e.preventDefault();
    if (amount.trim() === '') { setError('Enter an amount.'); setResult(null); return; }
    if (!Number.isFinite(n)) { setError('Amount must be a finite number.'); setResult(null); return; }
    if (n <= 0) { setError('Amount must be greater than zero.'); setResult(null); return; }
    if (n > 1e9) { setError('Amount must be at most 1,000,000,000 for this demo.'); setResult(null); return; }
    setError('');
    setResult({ side, symbol: token.symbol, amount: n, total: side === 'buy' ? gross + fee : gross - fee, fee });
  }

  return <div className="app-shell tp-page">
    <Header />
    <main className="tp-main">
      <div className="tp-banner" role="note" data-testid="status-demo"><FlaskConical size={16} aria-hidden="true" /><span><strong>READ-ONLY DEMO.</strong> Fictional tokens and fixed sample values, not live market data. Simulations make no trading requests, connect no wallet and create no deposits or transactions.</span></div>
      <div className="tp-eyebrow">DARKSWAP / TERMINAL PREVIEW</div>
      <h1>Terminal <span>preview.</span></h1>
      <p>Cross-chain trading terminal with NEAR Intents — planned product, read-only demo. Live cross-chain terminal execution is not enabled.</p>

      <div className="tp-grid">
        <aside className="tp-list" aria-label="Demo token search">
          <div className="tp-search">
            <Search size={15} aria-hidden="true" />
            <label className="tp-sr" htmlFor="tp-q">Search demo tokens</label>
            <input id="tp-q" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search demo tokens" autoComplete="off" data-testid="input-search" />
            {query && <button type="button" className="tp-clear" onClick={() => setQuery('')} aria-label="Clear search" data-testid="button-clear-search"><X size={14} /></button>}
          </div>
          <p className="tp-sr" aria-live="polite">{filtered.length} demo tokens shown</p>
          {filtered.length === 0 ? <div className="tp-empty" data-testid="text-empty">
            <p>No demo token matches "{query.trim()}".</p>
            <button type="button" className="tp-btn-ghost" onClick={() => setQuery('')} data-testid="button-reset-search">Reset search</button>
          </div> : DEMO_GROUPS.map(g => {
            const items = filtered.filter(t => t.group === g);
            if (!items.length) return null;
            return <div key={g} className="tp-group">
              <div className="tp-group-h">{g} <span>/ dUSD</span></div>
              <ul>{items.map(t => <li key={t.id}>
                <button type="button" className={`tp-row${t.id === token.id ? ' is-on' : ''}`} aria-pressed={t.id === token.id} onClick={() => select(t.id)} data-testid={`button-token-${t.id}`}>
                  <span className="tp-row-sym">{t.symbol}<small>{t.name}</small></span>
                  <span className="tp-row-num">{fmtPrice(t.price)}<small className={t.change24h >= 0 ? 'up' : 'dn'}>{t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(2)}%</small></span>
                </button>
              </li>)}</ul>
            </div>;
          })}
        </aside>

        <section className="tp-detail" aria-labelledby="tp-token-h">
          <div className="tp-detail-top">
            <div><h2 id="tp-token-h" data-testid="text-token-name">{token.name} <span>{token.symbol} / dUSD</span></h2><span className="tp-tag">DEMO TOKEN</span></div>
            <div className="tp-price" data-testid="text-token-price">${fmtPrice(token.price)}<small className={token.change24h >= 0 ? 'up' : 'dn'}>{token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}% 24h</small></div>
          </div>
          <Sparkline token={token} />
          <p className="tp-note">Synthetic 32-point series. Sample values, not live.</p>
          <dl className="tp-metrics">
            <div><dt>24h volume</dt><dd data-testid="text-volume">{fmtCompact(token.volume24h)}</dd></div>
            <div><dt>Liquidity</dt><dd data-testid="text-liquidity">{fmtCompact(token.liquidity)}</dd></div>
            <div><dt>Holders</dt><dd>{token.holders.toLocaleString('en-US')}</dd></div>
            <div><dt>Period high</dt><dd>${fmtPrice(Math.max(...token.series))}</dd></div>
            <div><dt>Period low</dt><dd>${fmtPrice(Math.min(...token.series))}</dd></div>
            <div><dt>Group</dt><dd>{token.group}</dd></div>
          </dl>
        </section>

        <form className="tp-order" onSubmit={simulate} noValidate aria-labelledby="tp-order-h">
          <h2 id="tp-order-h">Simulated order</h2>
          <div className="tp-sides" role="group" aria-label="Order side">
            {(['buy', 'sell'] as const).map(s => <button key={s} type="button" aria-pressed={side === s} className={`tp-side ${s}${side === s ? ' is-on' : ''}`} onClick={() => { setSide(s); clearSim(); }} data-testid={`button-side-${s}`}>{s === 'buy' ? 'Buy' : 'Sell'}</button>)}
          </div>
          <label htmlFor={amountId}>Amount ({token.symbol})</label>
          <input id={amountId} inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); clearSim(); }} placeholder="0.00" aria-invalid={!!error} aria-describedby={error ? `${amountId}-err` : undefined} data-testid="input-amount" />
          {error && <p id={`${amountId}-err`} className="tp-err" role="alert" data-testid="text-error">{error}</p>}
          <dl className="tp-quote">
            <div><dt>Demo price</dt><dd>${fmtPrice(token.price)}</dd></div>
            <div><dt>Subtotal</dt><dd>{valid ? `$${gross.toFixed(2)}` : '-'}</dd></div>
            <div><dt>Demo fee (0.3%)</dt><dd>{valid ? `$${fee.toFixed(2)}` : '-'}</dd></div>
          </dl>
          <button type="submit" className={`tp-submit ${side}`} data-testid="button-simulate">Simulate {side}</button>
          <div aria-live="polite">{result && <div className="tp-result" data-testid="status-simulation">
            <strong>Simulation complete. Nothing was executed.</strong>
            <span>Demo {result.side} of {result.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {result.symbol} would {result.side === 'buy' ? 'cost' : 'return'} ${result.total.toFixed(2)} including ${result.fee.toFixed(2)} demo fee.</span>
          </div>}</div>
          <p className="tp-note">The arbitrary 0.3% demo fee is not a live quote or the proposed 3% token fee. Slippage and rewards are excluded. No wallet, funds, points or account state are touched.</p>
        </form>
      </div>

      <section className="tp-econ"><TerminalEconomics /></section>
    </main>
    <Footer />
  </div>;
}
