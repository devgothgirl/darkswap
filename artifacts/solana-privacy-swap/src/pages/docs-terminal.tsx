import { Link } from 'wouter';

export function TerminalDocs() {
  return <section id="terminal" className="docs-section">
    <span className="docs-section-num">PLANNED PRODUCT / READ-ONLY PREVIEW</span>
    <h2>Cross-chain trading terminal with NEAR Intents</h2>
    <p>The terminal is DarkSwap’s planned wallet-based trading experience across supported chains. It brings asset discovery, quote review, and trading into one interface. It is separate from the live manual-deposit private swap routes.</p>
    <div className="docs-caution"><strong>What you can use today:</strong> the read-only terminal demo in Founder previews, a public area linked from the footer—not a live launch feature. Its tokens and market values are fictional, and buy/sell calculations are simulations. It connects no wallet, makes no trading requests, and creates no deposits or transactions.</div>
    <h3>What is planned—not live</h3>
    <ul className="docs-checklist">
      <li><strong>Cross-chain trading:</strong> supported assets and source/destination pairs must be verified before launch. A token in a catalog does not establish liquidity or execution support.</li>
      <li><strong>Embedded wallets:</strong> a separate wallet-based experience with explicit transaction approval. Opening the demo does not create or fund a trading wallet.</li>
      <li><strong>Reviewed execution:</strong> live fees, minimum output, signing, and recovery need to be verified for each supported route. No terminal fee rate or execution-time guarantee is announced.</li>
    </ul>
    <p>NEAR Intents already powers the separate <Link href="/near-swap">Privacy swap</Link> flow. That existing integration does not make the terminal live or mean the two experiences have identical privacy properties. The terminal is not advertised as an anonymous trading system.</p>
    <p>DarkSwap uses provider-backed liquidity rather than operating its own liquidity pools. Routing services are underlying infrastructure, not separate product features. See <a href="#providers">technical providers</a> for the implementation details.</p>
  </section>;
}