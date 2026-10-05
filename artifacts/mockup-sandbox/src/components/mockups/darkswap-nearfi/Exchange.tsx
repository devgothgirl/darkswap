import { useState } from 'react';
import { ArrowRight, ArrowLeftRight, ChevronDown, Check, LockKeyhole, X, ExternalLink, Info } from 'lucide-react';
import { DEST_ASSETS, FlowFooter, formatNumber, ShellNav, SOURCE_ASSETS, TRACKING_URL } from './_flow';
import './_husher.css';

type Source = typeof SOURCE_ASSETS[number];
type Destination = typeof DEST_ASSETS[number];

function AssetSelect<T extends Source | Destination>({ assets, selected, onSelect, kind }: {
  assets: readonly T[];
  selected: T;
  onSelect: (asset: T) => void;
  kind: string;
}) {
  const [open, setOpen] = useState(false);
  return <div style={{ position: 'relative' }}>
    <button className="ds-asset" type="button" aria-label={`Choose ${kind} asset`} aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className={`ds-coin ${selected.name !== 'Solana' ? 'ds-coin--near' : ''}`}>{selected.symbol.slice(0, 1)}</span>{selected.symbol}<ChevronDown size={13}/>
    </button>
    {open && <div className="ds-dropdown" role="listbox" aria-label={`${kind} assets`}>
      {assets.map(asset => <button key={asset.symbol} type="button" role="option" aria-selected={selected.symbol === asset.symbol} onClick={() => { onSelect(asset); setOpen(false); }}>
        <span className={`ds-coin ${asset.name !== 'Solana' ? 'ds-coin--near' : ''}`}>{asset.symbol.slice(0, 1)}</span>
        <span><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
      </button>)}
    </div>}
  </div>;
}

export function Exchange() {
  const [from, setFrom] = useState<Source>(SOURCE_ASSETS[0]);
  const [to, setTo] = useState<Destination>(DEST_ASSETS[0]);
  const [amount, setAmount] = useState('1');
  const [recipient, setRecipient] = useState('');
  const [refund, setRefund] = useState('');
  const [quoteRequested, setQuoteRequested] = useState(false);
  const [review, setReview] = useState(false);
  const [instructionsReady, setInstructionsReady] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const numericAmount = Number(amount);
  const amountValid = /^\d+(?:\.\d+)?$/.test(amount) && amount.length <= 40 && numericAmount > 0 && (amount.split('.')[1]?.length ?? 0) <= from.decimals;
  const usd = amountValid ? numericAmount * from.price : 0;
  const meetsMinimum = usd >= 3;
  const recipientValid = /^(?:[a-fA-F0-9]{64}|[a-z0-9._-]+\.near)$/.test(recipient.trim());
  const refundValid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(refund.trim());
  const exampleOutput = amountValid ? numericAmount * from.price / to.price : 0;
  const outputLabel = amountValid ? `≈ ${formatNumber(exampleOutput, 5)}` : '—';
  const clearQuote = () => { setQuoteRequested(false); setReview(false); setInstructionsReady(false); };
  const request = () => {
    setAttempted(true);
    if (!amountValid || !meetsMinimum || !recipientValid || !refundValid) return;
    setQuoteRequested(true);
  };
  return <div className="ds-flow">
    <ShellNav current="exchange"/>
    <main className="ds-main">
      <div className="ds-intro">
        <div className="ds-eyebrow">Solana → NEAR · Manual deposit</div>
        <h1>Privacy swap</h1>
        <p>Set a route to your own NEAR address. Review the example before any deposit instructions.</p>
      </div>
      <section className="ds-card" aria-label="Prepare a privacy swap">
        <div className="ds-card-inner">
          <div className="ds-tabs" aria-label="Route mode"><span>Privacy swap</span><span>Solana to NEAR</span></div>
          <div className="ds-pair">
            <div>
              <div className="ds-labelrow"><label htmlFor="ds-amount">Send</label><small>Solana network</small></div>
              <div className="ds-box">
                <input id="ds-amount" className="ds-amount" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); clearQuote(); }} aria-describedby="ds-minimum" placeholder="0.00"/>
                <AssetSelect assets={SOURCE_ASSETS} selected={from} kind="send" onSelect={(asset: Source) => { setFrom(asset); clearQuote(); }}/>
              </div>
              <div className="ds-underbox"><span id="ds-minimum">Minimum $3 USD input</span><span>{amountValid ? `≈ $${formatNumber(usd, 2)} example` : 'Enter an amount'}</span></div>
            </div>
            <div className="ds-swap-icon" aria-hidden="true"><ArrowLeftRight size={19}/></div>
            <div>
              <div className="ds-labelrow"><span>Receive</span><small>NEAR network</small></div>
              <div className="ds-box">
                <div className="ds-amount" aria-live="polite">{outputLabel}</div>
                <AssetSelect assets={DEST_ASSETS} selected={to} kind="receive" onSelect={(asset: Destination) => { setTo(asset); clearQuote(); }}/>
              </div>
              <div className="ds-underbox"><span>Illustrative estimate only</span><span>No live market rate</span></div>
            </div>
          </div>
          {amount && (!amountValid || !meetsMinimum) && <p className="ds-error" role="alert">{!amountValid ? `Enter a positive amount with at most ${from.decimals} decimals.` : 'Input is below the $3 USD minimum.'}</p>}
          <div className="ds-field">
            <label htmlFor="ds-recipient">Destination · your NEAR trading wallet</label>
            <input id="ds-recipient" className="ds-input" spellCheck={false} autoComplete="off" maxLength={120} value={recipient} onChange={e => { setRecipient(e.target.value); clearQuote(); }} placeholder="Paste your NearFi Terminal trading-wallet address" aria-invalid={attempted && !recipientValid}/>
            <p className="ds-help">Connect your NEAR wallet at <a href="https://terminal.nearfi.trade/wallet" target="_blank" rel="noopener noreferrer" style={{ color: '#d9bfff', textDecoration: 'underline' }}>NearFi Terminal <ExternalLink size={10} style={{ display: 'inline' }}/></a>, then copy the deposit address of <strong>your own trading wallet</strong>. That wallet is managed within NearFi Terminal; it is distinct from the wallet you connected.</p>
            {attempted && !recipientValid && <p className="ds-error" role="alert">Enter a NEAR account ending in .near or a 64-character NEAR address. Check it against your Terminal wallet.</p>}
          </div>
          <div className="ds-field">
            <label htmlFor="ds-refund">Solana refund address</label>
            <input id="ds-refund" className="ds-input" spellCheck={false} autoComplete="off" maxLength={120} value={refund} onChange={e => { setRefund(e.target.value); clearQuote(); }} placeholder="Your Solana address, in case a refund applies" aria-invalid={attempted && !refundValid}/>
            <p className="ds-help">Use a Solana address you control. A refund is not guaranteed.</p>
            {attempted && !refundValid && <p className="ds-error" role="alert">Enter a valid 32–44 character Solana address.</p>}
          </div>
          {quoteRequested && <div className="ds-quote" aria-live="polite">
            <div className="ds-quote-head"><span>EXAMPLE ROUTE PREVIEW</span><span>NOT A LIVE QUOTE</span></div>
            <div className="ds-quote-grid">
              <div><span>Illustrative receive</span><strong>{formatNumber(exampleOutput, 5)} {to.symbol}</strong></div>
              <div><span>Source value</span><strong>≈ ${formatNumber(usd, 2)} USD</strong></div>
            </div>
            <p className="ds-help">No rate, minimum output, fee, or availability has been verified. Actual route terms must be checked before funding.</p>
          </div>}
          <div className="ds-split">
            <div className="ds-privacy"><LockKeyhole size={16}/><span>Manual funding · you send from your own wallet</span></div>
            {!quoteRequested
              ? <button type="button" className="ds-primary" onClick={request}>Preview route <ArrowRight size={15}/></button>
              : <button type="button" className="ds-primary" onClick={() => setReview(true)}>Review details <ArrowRight size={15}/></button>}
          </div>
          <p className="ds-footnote">Solana deposits are public. A privacy route does not guarantee anonymity or unlinkability.</p>
        </div>
      </section>
      <div className="ds-context"><Info size={14} style={{ verticalAlign: 'middle', marginRight: 7, color: '#c4a7f8' }}/><strong>Your destination, your decision.</strong> This preview prepares a route concept only. NearFi Terminal requires you to connect a NEAR wallet to access its trading wallet, then fund that trading wallet. <a href="https://terminal.nearfi.trade/wallet" target="_blank" rel="noopener noreferrer">Open Terminal wallet ↗</a></div>
      <p className="ds-bottom">Already have a demo order? <a href={TRACKING_URL}>View deposit instructions and progress →</a></p>
    </main>
    <FlowFooter/>
    {review && <div className="ds-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setReview(false); }}>
      <section className="ds-modal" role="dialog" aria-modal="true" aria-labelledby="ds-review-title">
        <div className="ds-modal-top"><div><div className="ds-eyebrow">Step 2 / Review</div><h2 id="ds-review-title" style={{ marginTop: 7 }}>Check the destination</h2></div><button className="ds-iconbtn" aria-label="Close review" onClick={() => setReview(false)}><X size={15}/></button></div>
        <p>This is an illustrative review, not a provider order. No funds have moved and no deposit address has been issued.</p>
        <div className="ds-data"><span>Send from Solana</span><strong>{amount} {from.symbol} · ≈ ${formatNumber(usd, 2)} example</strong></div>
        <div className="ds-data"><span>Illustrative receive on NEAR</span><strong>{formatNumber(exampleOutput, 5)} {to.symbol}</strong></div>
        <div className="ds-data"><span>Your NearFi Terminal destination</span><strong>{recipient.trim()}</strong></div>
        <div className="ds-data"><span>Solana refund address</span><strong>{refund.trim()}</strong></div>
        <div className="ds-warning">Confirm the destination belongs to your own NearFi Terminal trading wallet. Its wallet is managed inside NearFi Terminal. Example output is not executable or reserved; never fund using this preview.</div>
        <button type="button" className="ds-primary ds-full" onClick={() => setInstructionsReady(true)}><Check size={15}/> {instructionsReady ? 'Demo instructions ready' : 'Continue to demo instructions'}</button>
        {instructionsReady && <p style={{ textAlign: 'center' }}>This creates only a demonstration instruction screen. <a href={TRACKING_URL} style={{ color: '#d8beff', textDecoration: 'underline' }}>View demo instructions →</a></p>}
        <button type="button" className="ds-inline" style={{ display: 'block', margin: '17px auto 0' }} onClick={() => setReview(false)}>Back to edit</button>
      </section>
    </div>}
  </div>;
}

export default Exchange;