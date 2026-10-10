import { Link } from 'wouter';
import { ArrowRight, BookOpen, ChevronRight } from 'lucide-react';
import { Footer, Header } from '../components/swap-ui';
import './docs.css';

const topics = [
  ['confidential-processing', 'Confidential processing'],
  ['zk-shielding', 'ZK shielding comparison'],
  ['darkswap-support', 'What DarkSwap supports'],
  ['sources', 'Sources & review'],
] as const;

export default function ConfidentialRoutingDocs() {
  return <div className="app-shell docs-shell">
    <Header />
    <div className="docs-banner"><BookOpen size={17} aria-hidden="true"/><span>DARKSWAP / PRODUCT GUIDE</span><span className="docs-banner-rule"/><span>Confidential routing</span></div>
    <div className="docs-layout">
      <aside className="docs-sidebar" aria-label="Documentation navigation">
        <div className="docs-sidebar-top"><span>DOCUMENTATION</span></div>
        <nav className="docs-nav-group" aria-label="Related documentation">
          <span>REFERENCE</span>
          <Link href="/docs" data-testid="link-article-docs">Product guide <ChevronRight size={15} aria-hidden="true"/></Link>
          <Link href="/docs/confidential-routing" aria-current="page" data-testid="link-article-current">Confidential routing &amp; ZK <ChevronRight size={15} aria-hidden="true"/></Link>
          <Link href="/docs#privacy" data-testid="link-article-sidebar-limits">Privacy limitations <ChevronRight size={15} aria-hidden="true"/></Link>
          <Link href="/docs#near-zec" data-testid="link-article-route-comparison">Route capabilities <ChevronRight size={15} aria-hidden="true"/></Link>
        </nav>
        <div className="docs-sidebar-bottom"><span>READY TO CHECK A ROUTE?</span><Link href="/near-swap" data-testid="link-article-sidebar-swap">Review Privacy swap <ArrowRight size={16} aria-hidden="true"/></Link></div>
      </aside>
      <main className="docs-main docs-article-main">
        <div className="docs-breadcrumb"><Link href="/docs" data-testid="link-article-breadcrumb">DOCUMENTATION</Link><ChevronRight size={13} aria-hidden="true"/><span>CONFIDENTIAL ROUTING</span></div>
        <article aria-labelledby="confidential-routing-title">
          <header className="docs-intro">
            <p className="docs-kicker">ROUTING / PRIVACY MECHANISMS</p>
            <h1 id="confidential-routing-title">Confidential routing and ZK shielding</h1>
            <p className="docs-article-reviewed">Reviewed <time dateTime="2026-10-01">October 1, 2026</time> · Original DarkSwap guide</p>
            <p>Confidential routing adds restricted processing to a cross-chain swap. It can keep processing details away from public execution while coordinating a supported route. Zcash shielding is a different privacy mechanism, not another name for this routing.</p>
          </header>
          <section id="confidential-processing" className="docs-section">
            <h2>Confidential processing, not a shielded pool</h2>
            <p>NEAR’s May 27, 2026 explanation describes a private shard with independent, permissioned validators. Encryption and restricted visibility protect processing within that environment, rather than requiring client-side proof generation. The useful distinction is confidential execution of swap details inside a provider boundary—not erasure of the source or destination chain’s history.</p>
            <p>This is not a ZK shielded pool. The permissioned validators are part of the trust boundary. It does not establish guarantees of anonymity, unlinkability, or MEV protection.</p>
          </section>
          <section id="zk-shielding" className="docs-section">
            <h2>How Zcash shielding differs</h2>
            <p>Zcash’s shielded pools use zero-knowledge proofs to validate transfers without publicly revealing protected transaction details. Privacy depends on the actual addresses, wallet and transfer path; a transparent transfer is not shielding.</p>
            <p>Galaxy’s November 4, 2025 research discusses Zcash’s shielded pools and Zashi wallet’s cross-chain intent integration. That context is not evidence that DarkSwap integrates Zashi, shields funds, delivers native ZEC through Privacy swap, or guarantees no transaction links.</p>
          </section>
          <section id="darkswap-support" className="docs-section">
            <h2>What DarkSwap supports today</h2>
            <p>Privacy swap requests NEAR Intents 1Click <strong>basic confidentiality</strong> for both the dry preview and deposit order. The quickstart supports origin-chain to destination-chain confidential swaps without requiring embedded balances or signed-intent execution. DarkSwap uses that manual-deposit flow: choose a Solana input and supported destination, supply a recipient and Solana refund address, review the quote, then fund the instructions yourself. DarkSwap does not sign your wallet transaction.</p>
            <p>The live Privacy swap route has no advanced-mode UI, confidential wallet balance, or Zcash shielded-pool integration. Confidential balances are proposed for the separate Dark Pool on NEAR Confidential Intents, which is in development and not available to use. Its late October 2026 target depends on NEAR enabling access and is not a launch commitment. Privacy swap permits Solana, NEAR, Ethereum, Arbitrum, Base, Optimism, Polygon and BNB Chain, subject to a live quote—not native Zcash. The provider’s broader chain documentation lists only transparent Zcash t1/t3 addresses; that does not enable ZEC delivery here.</p>
            <div className="docs-caution">Solana deposits are public, and destination transfers may be public. Amounts, timing, provider records and external data may associate activity. Not connecting a wallet is a funding choice, not a privacy guarantee.</div>
            <p className="docs-resource-note">For both routes’ capabilities and verification limits, read the <Link href="/docs#near-zec" data-testid="link-article-capabilities">route comparison</Link> and <Link href="/docs#privacy" data-testid="link-article-privacy">privacy limitations</Link>.</p>
          </section>
          <section id="sources" className="docs-section docs-article-sources">
            <h2>Sources &amp; review</h2>
            <p>Original summary; all four sources reviewed October 1, 2026. Documentation and live support can change.</p>
            <ul className="docs-checklist">
              <li><a href="https://www.near.org/blog/how-confidential-intents-works" target="_blank" rel="noopener noreferrer" data-testid="link-source-near-confidential">NEAR: How Confidential Intents works</a> — May 27, 2026.</li>
              <li><a href="https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/confidential-swaps" target="_blank" rel="noopener noreferrer" data-testid="link-source-confidential-quickstart">NEAR Intents: Confidential swaps quickstart</a> — reviewed October 1, 2026.</li>
              <li><a href="https://docs.near-intents.org/resources/chain-support" target="_blank" rel="noopener noreferrer" data-testid="link-source-chain-support">NEAR Intents: Chain support</a> — reviewed October 1, 2026.</li>
              <li><a href="https://www.galaxy.com/insights/research/zcash-price-zec-near-intents-zashi-wallet-privacy-zero-knowledge-proofs" target="_blank" rel="noopener noreferrer" data-testid="link-source-galaxy-zcash">Galaxy: Zcash, privacy and Zashi research</a> — November 4, 2025.</li>
            </ul>
          </section>
        </article>
        <div className="docs-next"><span>REVIEW BEFORE FUNDING</span><strong>Check the live route and its limits.</strong><Link href="/near-swap" data-testid="link-article-review-swap">Review Privacy swap <ArrowRight size={18} aria-hidden="true"/></Link><Link className="docs-article-back" href="/docs" data-testid="link-article-back-docs">Back to Docs</Link></div>
      </main>
      <aside className="docs-toc" aria-label="On this page"><span>ON THIS PAGE</span>{topics.map(([id, label]) => <a key={id} href={`#${id}`} data-testid={`link-article-topic-${id}`}>{label}</a>)}<div className="docs-toc-note">Confidential processing and Zcash shielding have different mechanisms and trust boundaries.</div></aside>
    </div>
    <Footer />
  </div>;
}