import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpen, ChevronRight, Search, ShieldAlert, X } from 'lucide-react';
import { Footer, Header } from '../components/swap-ui';
import { trackEvent } from '../lib/analytics';
import './docs.css';
import { RouteEconomicsDocs } from './docs-route-economics';
import { PrivacyRouteDiagram } from '../components/privacy-route-diagram';

const sections = [
  { id: 'overview', label: 'Overview', group: 'START HERE', summary: 'Live Solana-origin private swaps with manual deposits.' },
  { id: 'availability', label: "What's live", group: 'START HERE', summary: 'Two private routes open; the Dark Pool is in development.' },
  { id: 'manual-flow', label: 'Manual deposit flow', group: 'USING THE ROUTE', summary: 'Quote, order, Solana deposit, and tracking.' },
  { id: 'route-availability', label: 'Routes, quotes & limits', group: 'USING THE ROUTE', summary: 'Supported assets and destinations vary by live quote.' },
  { id: 'tracking', label: 'Track an order', group: 'USING THE ROUTE', summary: 'Keep the order ID and check the order page.' },
  { id: 'safety', label: 'Deposit safety', group: 'BEFORE YOU SEND', summary: 'Network, amount, address, memo, and deadline checks.' },
  { id: 'privacy', label: 'Privacy limitations', group: 'BEFORE YOU SEND', summary: 'A private route is not invisibility or anonymity.' },
  { id: 'whitepaper', label: 'Whitepaper, plain language', group: 'REFERENCE', summary: 'The Dark Pool, holder rewards, trust model and limits, written for readers.', href: '/docs/whitepaper' },
  { id: 'confidential-routing', label: 'Confidential routing & ZK', group: 'REFERENCE', summary: 'Private-shard confidential processing, Zcash shielding, trust boundaries, and current support.', href: '/docs/confidential-routing' },
  { id: 'near-zec', label: 'NEAR & ZEC explained', group: 'REFERENCE', summary: 'Route comparison, native Zcash, token representations, and shielding limits.' },
  // The 0.40% figure mirrors NEAR_PARTNER_FEE_BPS on the API server; near-partner-fee-docs.test.ts fails if it drifts.
  { id: 'fees-rewards', label: 'Fees, revenue & rewards', group: 'REFERENCE', summary: 'Provider costs, the 0.40% DarkSwap partner fee, optional non-cash email points, and a proposed rebate.' },
  { id: 'providers', label: 'Technical providers', group: 'REFERENCE', summary: 'The systems behind each route.' },
  { id: 'further-reading', label: 'Independent reading', group: 'REFERENCE', summary: 'External Nullmask documentation about a different EVM privacy protocol.' },
] as const;

function jump(id: string) {
  if (sections.some(section => section.id === id)) trackEvent('docs_topic_opened', { topic: id });
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  window.history.replaceState(null, '', `#${id}`);
}

export default function Docs() {
  const [search, setSearch] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const matches = useMemo(() => sections.filter(s => `${s.label} ${s.group} ${s.summary}`.toLowerCase().includes(search.trim().toLowerCase())), [search]);
  const grouped = ['START HERE', 'USING THE ROUTE', 'BEFORE YOU SEND', 'REFERENCE'] as const;
  useEffect(() => {
    const previous = document.title;
    document.title = 'DarkSwap Docs | Private swaps on Solana';
    const frame = requestAnimationFrame(() => {
      const id = window.location.hash.slice(1);
      if (sections.some(section => section.id === id)) {
        document.getElementById(id)?.scrollIntoView({ behavior: 'instant' });
      }
    });
    return () => { cancelAnimationFrame(frame); document.title = previous; };
  }, []);
  return <div className="app-shell docs-shell">
    <Header />
    <div className="docs-banner"><BookOpen size={17}/><span>DARKSWAP / PRODUCT GUIDE</span><span className="docs-banner-rule"/><span>Live routes, limits, and safety</span></div>
    <div className="docs-layout">
      <aside className={`docs-sidebar ${mobileNav ? 'docs-sidebar-open' : ''}`} aria-label="Documentation topics">
        <div className="docs-sidebar-top"><span>DOCUMENTATION</span><button type="button" onClick={() => setMobileNav(false)} className="docs-mobile-close" aria-label="Close topics"><X size={19}/></button></div>
        <div className="docs-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="Search documentation" placeholder="Search the guide..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-docs-search"/>{search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={16}/></button>}</div>
        {matches.length === 0 ? <p className="docs-no-results">No topics match “{search}”. Try “deposit”, “privacy”, or “order”.</p> : grouped.map(group => {
          const items = matches.filter(s => s.group === group);
          return items.length ? <div className="docs-nav-group" key={group}><span>{group}</span>{items.map(s => 'href' in s ? <Link key={s.id} href={s.href} onClick={() => { trackEvent('docs_topic_opened', { topic: s.id }); setMobileNav(false); }} data-testid={`link-docs-${s.id}`}>{s.label}<ChevronRight size={15}/></Link> : <a key={s.id} href={`#${s.id}`} onClick={e => { e.preventDefault(); jump(s.id); setMobileNav(false); }} data-testid={`link-docs-${s.id}`}>{s.label}<ChevronRight size={15}/></a>)}</div> : null;
        })}
        <div className="docs-sidebar-bottom"><span>READY TO CHECK A ROUTE?</span><Link href="/swap" onClick={() => trackEvent('swap_entry_clicked', { location: 'docs_sidebar', route: 'private_route' })}>Open private route <ArrowRight size={16}/></Link></div>
      </aside>
      <main className="docs-main">
        <button className="docs-mobile-toggle" type="button" onClick={() => setMobileNav(true)} aria-expanded={mobileNav}>Browse topics <ChevronRight size={17}/></button>
        <div className="docs-breadcrumb">DARKSWAP <ChevronRight size={13}/> DOCUMENTATION <ChevronRight size={13}/> OVERVIEW</div>
        <header className="docs-intro" id="overview"><div className="docs-intro-mark"><img src={`${import.meta.env.BASE_URL}brand/darkswap-mark.png`} alt="DarkSwap logo" width={45} height={45} /></div><p className="docs-kicker">THE DARKSWAP PRODUCT GUIDE</p><h1>Private swaps today.<br/><em>Dark Pool in development.</em></h1><p>DarkSwap runs <strong>live Solana-origin private swap routes</strong> with manual deposits: you review the order and send the deposit yourself. Privacy swap is built on the NEAR Intents 1Click API, and the planned cross-chain terminal is being built on NEAR Intents as well. Phase 2, the Dark Pool, is in development. This guide separates what you can use today from what is still a read-only preview.</p></header>
        <div className="docs-alert"><ShieldAlert size={22}/><div><strong>Funds do not move when you create an order.</strong><p>DarkSwap does not connect your wallet or send a transaction for you. You choose whether to deposit after reviewing the order instructions. A deposit may be irreversible.</p></div></div>
        <div className="docs-content">
          <section id="availability" className="docs-section"><span className="docs-section-num">01 / AVAILABILITY</span><h2>What is live today.</h2><p>Two <strong>Solana-origin manual-deposit routes</strong> are available: the <Link href="/swap">existing private route</Link> and <Link href="/near-swap">Privacy swap</Link>. Each needs its own live quote. Neither requires a wallet connection or an account for guest orders.</p><div className="docs-state-grid"><div><span className="docs-state-dot"/><strong>Private swaps</strong><small>Live beta; availability confirmed by each quote</small></div><div><span className="docs-state-dot closed"/><strong>Dark Pool</strong><small>Phase 2; in development, not available to use</small></div><div><span className="docs-state-dot closed"/><strong>Other execution</strong><small>Explore and public swap execution remain closed beta</small></div></div><p>No listed asset, destination, or supported-network catalog is a promise of execution support. Only a live quote and the order instructions it produces describe what a specific transfer will do.</p></section>
                  <section id="manual-flow" className="docs-section"><span className="docs-section-num">02 / PROCESS</span><h2>How a manual deposit works</h2>
            <PrivacyRouteDiagram />
            <ol className="docs-flow"><li><span>01</span><div><strong>Choose your route</strong><p>Select a Solana source asset and a destination asset, then enter an amount. Each provider returns its own supported assets and quote.</p></div></li><li><span>02</span><div><strong>Review before creating</strong><p>Check the quoted output, estimated time, limits, and destination network. Privacy swap requires both a receiving address and a Solana refund address before quoting; check them carefully. A quote can change or become unavailable.</p></div></li><li><span>03</span><div><strong>Create an order</strong><p>Confirm the details to create an order and reveal the deposit instructions. Creating the order does not transfer funds.</p></div></li><li><span>04</span><div><strong>Send manually, if you choose</strong><p>From your own Solana wallet, send exactly the instructed amount to the order’s deposit address on the specified network, with any required deposit memo. Observe the deadline.</p></div></li><li><span>05</span><div><strong>Track progress</strong><p>Keep the original route’s order ID or Privacy swap’s deposit address and track it on the corresponding order page. Completion times can vary.</p></div></li></ol></section>
          <section id="route-availability" className="docs-section"><span className="docs-section-num">03 / QUOTES</span><h2>Routes are conditional.</h2><p>Both private routes require at least <strong>$3 USD of the asset you send</strong>. That is a minimum swap value, not a service fee; providers may require more or charge additional fees.</p><p>Tokens, chains, amounts, fees, limits, and estimated output depend on current provider support and liquidity. A route may require information that this beta flow cannot collect; in that case it cannot be used here. Do not assume a token shown in search will have an executable quote.</p><p>If a quote fails or no route is available, change your pair or amount, or retry later. The closed-beta public swap is <strong>not</strong> an available fallback.</p></section>
          <section id="tracking" className="docs-section"><span className="docs-section-num">04 / STATUS</span><h2>Keep your order details.</h2><p>For the existing route, save the order ID and use <strong>Track an order</strong> in the header. For Privacy swap, save the Solana deposit address and bookmark its <Link href="/near-order">order page</Link>. Status updates reflect what the selected provider reports.</p><p>If the deposit appears delayed or you sent incorrect details, do not send a second payment to “fix” it. Keep the order details and sending transaction hash for support or recovery inquiries. Recovery is not guaranteed.</p><Link className="docs-inline-link" href="/near-swap">Check a Privacy swap quote <ArrowRight size={17}/></Link></section>
          <section id="safety" className="docs-section"><span className="docs-section-num">05 / CHECKLIST</span><h2>Before you send anything.</h2><ul className="docs-checklist"><li>Verify the deposit address against the active order page, not a screenshot or message.</li><li>Send on <strong>Solana only</strong> for a Solana-origin order; verify the asset and exact amount.</li><li>Include a deposit memo if the order shows one. Never guess or reuse instructions from another order.</li><li>Check the receiving address, selected destination network, quote details, and deposit deadline.</li><li>Consider a small amount you can afford to have delayed or lost. Network and provider failures are possible.</li></ul><div className="docs-caution">On-chain transfers generally cannot be reversed. A wrong network, address, asset, amount, or missing memo can lead to loss or difficult recovery.</div></section>
          <section id="privacy" className="docs-section"><span className="docs-section-num">06 / LIMITATIONS</span><h2>Privacy is not invisibility.</h2><p>DarkSwap does not require a wallet connection for its manual-deposit routes. Privacy swap requests <strong>“basic” confidential handling</strong>, distinct from the existing private route. This does <strong>not guarantee anonymity</strong> or mean the originating transfer disappears. Not connecting a wallet is not itself a privacy guarantee.</p><p>Solana deposits remain visible on-chain. Deposit addresses, amounts, timing, destination-chain activity, provider records, exchange compliance processes, and other external data may allow transactions to be associated. The precise privacy properties vary by route and provider. DarkSwap does not promise untraceability or risk-free execution. Read <Link href="/docs/confidential-routing" data-testid="link-docs-privacy-confidential-routing">Confidential routing and ZK shielding</Link> for the mechanism and trust boundary.</p><p>Email rewards are optional. Enrolling and explicitly linking a new order at creation associates that order with an email account; this can reduce privacy. Guest orders remain unlinked and cannot be added to an account later. Signing in alone does not link an order. <Link href="/rewards">Review optional rewards</Link>.</p></section>
          <section id="confidential-routing" className="docs-section"><span className="docs-section-num">PRIVACY REFERENCE</span><h2>Understand the processing layer.</h2><p>Confidential routing uses encrypted, restricted processing; Zcash shielded pools use zero-knowledge proofs. These are different mechanisms with different trust boundaries. Our short guide explains the positive role of confidential routing, how it differs from shielding, and what Privacy swap supports today.</p><Link href="/docs/confidential-routing" className="docs-inline-link" data-testid="link-docs-confidential-article">Confidential routing and ZK shielding <ArrowRight size={17} aria-hidden="true"/></Link></section>
          <RouteEconomicsDocs />
          <section id="providers" className="docs-section">
            <span className="docs-section-num">07 / TECHNICAL REFERENCE</span><h2>Infrastructure, not separate features.</h2>
            <p>The <Link href="/swap">existing private route</Link> uses <strong>Houdini / HoudiniSwap</strong> for discovery, quotes, orders, and status. <Link href="/near-swap">Privacy swap</Link> separately uses the <strong>NEAR Intents 1Click API</strong> with Confidential Intents “basic” mode for dry quotes, manual-deposit instructions, and order tracking. Both depend on live provider availability. DarkSwap never broadcasts your deposit transaction.</p>
            <p>Provider availability, terms, fees, support, and operational conditions can change independently of this guide. Explore and public swap execution remain closed beta, and the Dark Pool is still in development.</p>
            <p><strong>Liquidity:</strong> the providers source quotes and coordinate execution through their supported liquidity networks. DarkSwap does not operate its own pools or market-making system. A supported-chain list is not proof that a particular asset pair, amount, or confidential route can execute.</p>
            <p>Developer references: <a href="https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/confidential-swaps" target="_blank" rel="noopener noreferrer">NEAR Intents confidential swaps</a>, <a href="https://web3.okx.com/onchainos/dev-docs/trade/dex-api-reference" target="_blank" rel="noopener noreferrer">underlying router API</a>, and <a href="https://web3.okx.com/onchainos/dev-docs/trade/dex-use-swap-solana-quick-start" target="_blank" rel="noopener noreferrer">transaction signing and simulation</a>. Current contracts and live route checks take precedence over this guide.</p>
            <div className="docs-end"><img src={`${import.meta.env.BASE_URL}brand/shield.png`} alt=""/><div><strong>Review the live order, not just this guide.</strong><p>Documentation explains the flow. The active quote and order instructions govern the details of a specific transfer.</p></div></div>
          </section>
          <section id="further-reading" className="docs-section"><span className="docs-section-num">08 / EXTERNAL READING</span><h2>Learn about other approaches.</h2><p>Nullmask publishes documentation about its own zero-knowledge privacy protocol for EVM chains. It is an <strong>independent project</strong>, not DarkSwap’s provider or an integration here. Its shielding model and privacy claims do not apply to DarkSwap’s Solana-origin manual-deposit route.</p><div className="docs-resources"><a href="https://docs.nullmask.io/introduction/introduction" target="_blank" rel="noopener noreferrer"><strong>What is Nullmask?</strong><span>Read the independent project’s introduction (external site).</span><ArrowRight size={19} aria-hidden="true"/></a><a href="https://docs.nullmask.io/introduction/how-it-works" target="_blank" rel="noopener noreferrer"><strong>How Nullmask works</strong><span>Compare the concepts behind its EVM-based protocol (external site).</span><ArrowRight size={19} aria-hidden="true"/></a></div><p className="docs-resource-note">Links are for general learning, not an endorsement or a description of DarkSwap’s implementation. Always judge the active DarkSwap quote and order instructions on their own terms.</p></section>
        </div>
        <div className="docs-next"><span>WHEN YOU ARE READY</span><strong>Take the route one step at a time.</strong><Link href="/swap">Check a live quote <ArrowRight size={18}/></Link></div>
      </main>
      <aside className="docs-toc" aria-label="On this page"><span>ON THIS PAGE</span>{sections.map(s => 'href' in s ? <Link href={s.href} key={s.id} data-testid={`link-docs-toc-${s.id}`}>{s.label}</Link> : <a href={`#${s.id}`} key={s.id} onClick={e => { e.preventDefault(); jump(s.id); }}>{s.label}</a>)}<div className="docs-toc-note">Only send funds after checking the active order instructions.</div></aside>
    </div>
    <Footer/>
  </div>;
}
