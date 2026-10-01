import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleAlert, Clock3, Copy, Info, LockKeyhole, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { DEMO_DEPOSIT, EXCHANGE_URL, FlowFooter, formatNumber, ShellNav } from './_flow';
import './_husher.css';

type Stage = 'send' | 'processing' | 'exchanging' | 'completed' | 'partial' | 'failed' | 'refunded';
const stages = [
  { key: 'send', title: 'Send', icon: Send, sub: 'On your wallet' },
  { key: 'processing', title: 'Processing', icon: Clock3, sub: 'Deposit detected' },
  { key: 'exchanging', title: 'Exchanging', icon: ArrowRight, sub: 'Route in progress' },
  { key: 'completed', title: 'Completed', icon: Check, sub: 'Output reported' },
] as const;

export function Tracking() {
  const [stage, setStage] = useState<Stage>('send');
  const [refreshed, setRefreshed] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookup, setLookup] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const activeIndex = Math.max(0, stages.findIndex(item => item.key === stage));
  const canSend = stage === 'send';
  const status = stage === 'send' ? 'Awaiting a manual deposit' : stage === 'processing' ? 'Example deposit detected' : stage === 'exchanging' ? 'Example route processing' : stage === 'completed' ? 'Example route completed' : stage === 'partial' ? 'Partial deposit example' : stage === 'refunded' ? 'Refunded example' : 'Failed example';
  return <div className="ds-flow">
    <ShellNav current="tracking"/>
    <main className="ds-main ds-main--track">
      <a className="ds-back" href={EXCHANGE_URL}><ArrowLeft size={14}/> Back to privacy swap</a>
      <div className="ds-intro" style={{ marginTop: 19, marginBottom: 15 }}>
        <div className="ds-eyebrow">Order progress / Example only</div>
        <h1 style={{ fontSize: 'clamp(26px, 3.4vw, 36px)' }}>Follow your route</h1>
        <p>Deposit instructions and status, together in one place.</p>
      </div>
      <div className="ds-progress" aria-label={`Demonstration progress: ${status}`}>
        {stages.map((item, index) => <div key={item.key} className={`ds-stage ${index <= activeIndex && !['partial', 'failed', 'refunded'].includes(stage) ? 'is-active' : ''}`}>
          <span className="ds-stage-icon"><item.icon size={15}/></span><span><b>{item.title}</b><small>{item.sub}</small></span>
        </div>)}
      </div>
      <div className="ds-meta"><span>Order ID: <strong>DEMO-ORDER-NOT-LIVE</strong></span><span>Route: <strong>Privacy swap</strong></span><span>Status: <strong>{status}</strong></span></div>
      <section className="ds-summary" aria-label="Example route">
        <span className="ds-coin">S</span><strong>1 SOL</strong><span>Solana</span><ArrowRight size={17}/><span className="ds-coin ds-coin--near">N</span><strong>{formatNumber(147.25 / 6.29, 5)} NEAR</strong><span>NEAR</span>
      </section>
      <div className="ds-deposit-grid">
        <section className="ds-deposit" aria-label="Deposit instructions">
          <h2>{canSend ? 'Please send ' : 'Deposit record · '}<strong>1 SOL</strong> <span style={{ fontSize: 10, color: '#b3a0f3' }}>EXAMPLE</span></h2>
          <p style={{ fontSize: 11, color: '#aebbd0', margin: '0 0 11px' }}>{canSend ? 'On the Solana network, to the address below — only if this were a verified, live order.' : 'The example instruction is no longer an invitation to send funds.'}</p>
          <div className="ds-data"><span>Solana deposit address</span><strong>{DEMO_DEPOSIT}</strong></div>
          <p className="ds-error" role="note"><ShieldAlert size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }}/>Not a valid wallet address. Do not send assets or copy this as a payment destination.</p>
          <div className="ds-data"><span>Receiving destination</span><strong>YOUR TERMINAL TRADING WALLET · DEMO ONLY</strong></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap' }}>
            <button type="button" className="ds-secondary" disabled title="Demo addresses cannot be copied"><Copy size={13}/> Copy disabled</button>
            <button type="button" className="ds-secondary" onClick={() => setDetailsOpen(!detailsOpen)} aria-expanded={detailsOpen}>{detailsOpen ? 'Hide' : 'Show'} route details</button>
          </div>
          {detailsOpen && <div className="ds-warning" style={{ marginBottom: 0 }}>The illustrated output, address, and progress have not been verified with a provider. Your connected NEAR wallet is not automatically the NearFi Terminal trading wallet. Check the deposit address shown under <a href="https://terminal.nearfi.trade/wallet" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>your own Terminal wallet</a> before any real route.</div>}
        </section>
        <aside className="ds-qrbox" aria-label="Non-payable QR placeholder">
          <div className="ds-qr-placeholder" aria-hidden="true"/>
          <span>QR PLACEHOLDER<br/>NOT SCANNABLE · NOT FOR PAYMENT</span>
        </aside>
      </div>
      <section className="ds-tips">
        <h2>Information tips</h2>
        <div className="ds-tip"><Info size={16}/><span><strong>Only send on Solana.</strong> A deposit made on another network may not be recoverable. This demo cannot receive funds.</span></div>
        <div className="ds-tip"><LockKeyhole size={16}/><span><strong>Check the exact asset and amount.</strong> Verify live order terms before sending. The output here is an illustrative calculation, not a rate or minimum return.</span></div>
        <div className="ds-tip"><CircleAlert size={16}/><span><strong>A public origin.</strong> Solana deposits are visible on-chain. Privacy routing does not promise anonymity or unlinkability.</span></div>
        <div className="ds-tip"><RefreshCw size={16}/><span><strong>Progress is illustrative.</strong> Use the selector below to preview status states; this page does not poll a provider and makes no processing-time or confirmation guarantees.</span></div>
      </section>
      <div className="ds-context" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div><strong>Preview status states</strong><br/>Switch between sample stages without contacting a provider.</div>
        <select className="ds-select" aria-label="Choose demo status" value={stage} onChange={e => { setStage(e.target.value as Stage); setRefreshed(false); }}>
          <option value="send">Awaiting deposit</option>
          <option value="processing">Processing</option>
          <option value="exchanging">Exchanging</option>
          <option value="completed">Completed</option>
          <option value="partial">Partial deposit</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>
      {!canSend && <div className="ds-warning" role="status">{stage === 'completed' ? 'The sample route is complete. Do not send more funds.' : stage === 'partial' ? 'A partial deposit would need provider guidance. Do not send another transfer based on this demo.' : stage === 'failed' || stage === 'refunded' ? 'This sample order is closed. Do not send funds.' : 'Deposit stage has advanced in this example. Do not send again.'}</div>}
      <div className="ds-split" style={{ marginTop: 12 }}>
        <button className="ds-secondary" type="button" onClick={() => setRefreshed(true)}><RefreshCw size={14}/> Check status</button>
        <button className="ds-inline" type="button" onClick={() => setLookupOpen(!lookupOpen)} aria-expanded={lookupOpen}>{lookupOpen ? 'Close lookup' : 'Look up an order'}</button>
      </div>
      {refreshed && <p role="status" className="ds-help">Demo status unchanged. No live service was contacted.</p>}
      {lookupOpen && <form className="ds-context" onSubmit={e => { e.preventDefault(); setLookupMessage(lookup.trim() === 'DEMO-ORDER-NOT-LIVE' ? 'Demo order open above. No provider was contacted.' : 'Only DEMO-ORDER-NOT-LIVE can be opened in this local preview. No lookup was sent.'); }}>
        <label htmlFor="ds-lookup" style={{ display: 'block', marginBottom: 9, fontWeight: 700, color: '#eee6fc' }}>Order ID</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input id="ds-lookup" className="ds-input" value={lookup} onChange={e => setLookup(e.target.value)} placeholder="Enter a demo order ID" style={{ flex: '1 1 220px' }}/><button type="submit" className="ds-secondary" disabled={!lookup.trim()}>Find demo order</button></div>
        {lookupMessage && <p role="status" style={{ marginBottom: 0 }}>{lookupMessage}</p>}
      </form>}
      <p className="ds-bottom">Need a different destination? <a href={EXCHANGE_URL}>Prepare a new route →</a></p>
    </main>
    <FlowFooter/>
  </div>;
}

export default Tracking;