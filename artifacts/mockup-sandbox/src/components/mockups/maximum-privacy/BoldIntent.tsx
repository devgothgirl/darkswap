import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Menu, X } from "lucide-react";
import "./_group.css";
import "./BoldIntent.css";

// Independent, purpose-first adaptation of Current.tsx. All actions stay local.
const faqs = [
  { question: "What does “maximum privacy” mean?", answer: "It describes DarkSwap’s design goal, not a verified ranking or an absolute result. The live routes use a deposit-based flow where creating an order moves no funds. Privacy depends on the chosen route and its providers. Solana deposits remain public, and destination transfers may also be public." },
  { question: "Do I connect a wallet to use it?", answer: "No. You review the quote and create an order first — creating an order moves no funds. If you decide to proceed, you send the exact deposit amount yourself from a Solana wallet. DarkSwap does not automatically send your funds." },
  { question: "Which assets and destinations are supported?", answer: "Availability depends on the live quote for your selected amount and destination. Support is not universal. Before creating an order, review the quoted assets, recipient, fees, limits and estimated time. This preview does not request quotes or create orders." },
  { question: "Is execution instant or guaranteed?", answer: "No. Private execution can take longer than a direct swap, and routes can be unavailable. Execution, timing and privacy are not guaranteed. Check the deposit instructions carefully before sending; crypto transfers carry risk." },
  { question: "Are DARK holder rewards live?", answer: "No. NEAR + ZEC loyalty rewards are planned, not active payouts or yield. The proposal starts eligibility after a three-day holder streak. Rewards accrued by team allocations would be split 50% toward holder-streak bonuses and 50% toward buyback + burn. The daily formula and rates are not finalized. Eligibility, funding and implementation remain subject to the Tokenomics plan." },
];

const localPanels = {
  Docs: {
    title: "Know the route before you send.",
    paragraphs: [
      "Local Docs overview · No external navigation or live service calls in this exploration.",
      "Both live Solana-origin routes prepare deposit instructions after you review a quote and create an order. You then manually send the exact amount. Creating an order moves no funds; there is no automatic send.",
      "Solana deposits remain public; destination transfers may be public. Privacy depends on the route and providers. Check assets, fees, limits, recipient and refund details before making a deposit.",
    ],
  },
  Tokenomics: {
    title: "A plan. Not a payout.",
    paragraphs: [
      "Local Tokenomics overview · NEAR + ZEC holder loyalty is planned; treasury payouts are not active. No fixed yield or guaranteed return.",
      "The proposal starts eligibility after a three-day holder streak. Team-accrued rewards are planned to be allocated 50% toward holder-streak bonuses and 50% toward buyback + burn.",
      "Daily progression, the formula and rates are not finalized. Funding, eligibility and implementation must be established before any payouts.",
    ],
  },
  "Founder previews": {
    title: "Separate from the live routes.",
    paragraphs: [
      "Local Founder previews overview · Research and read-only demos are not live swap flows.",
      "The planned cross-chain trading terminal with NEAR Intents is a separate wallet-based experience. Live terminal trading is not enabled.",
      "This homepage exploration does not connect wallets, request quotes, create orders or move funds.",
    ],
  },
};
type Panel = keyof typeof localPanels;

function Brand() {
  return <a href="#bi-top" className="bi-brand" aria-label="DarkSwap home"><img src="/__mockup/images/maximum-privacy/icon.png" alt="" /><img src="/__mockup/images/maximum-privacy/wordmark.png" alt="DarkSwap" /></a>;
}

function RouteIllustration() {
  // The route geometry is retained from the extracted homepage, edited into
  // a compact schematic rather than suggesting an order or live progress.
  return <div className="bi-diagram" aria-label="Illustrative manual-deposit route, not live order progress">
    <span>ROUTE MODEL<br />Illustration, not order status</span>
    <svg viewBox="0 0 640 130" role="img" aria-label="Your Solana wallet, manual deposit, private routing, destination">
      <path d="M40 65 C105 65 115 27 210 27 S300 102 390 102 S470 65 595 65" fill="none" stroke="#735886" strokeWidth="2" />
      <path d="M210 27 C290 27 300 102 390 102 S470 65 505 65" fill="none" stroke="#d0aeff" strokeWidth="3" strokeDasharray="5 7" />
      <g fill="#21152f" stroke="#d0aeff" strokeWidth="2"><circle cx="40" cy="65" r="11" /><circle cx="210" cy="27" r="8" /><circle cx="390" cy="102" r="8" /><circle cx="595" cy="65" r="11" /></g>
      <g fill="#e8d8f3" fontFamily="Source Sans 3, sans-serif" fontSize="13"><text x="9" y="105">YOUR WALLET</text><text x="140" y="16">MANUAL DEPOSIT</text><text x="330" y="62">PRIVATE ROUTING</text><text x="523" y="105">DESTINATION</text></g>
    </svg>
  </div>;
}

export function BoldIntent() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [selectedRoute, setSelectedRoute] = useState<"Private route" | "Privacy swap" | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!panel) return;
    previousFocus.current = document.activeElement as HTMLElement;
    closeRef.current?.focus();
    return () => previousFocus.current?.focus();
  }, [panel]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); setPanel(null); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const openPanel = (name: Panel) => { setMenuOpen(false); setPanel(name); };
  const chooseRoute = (name: "Private route" | "Privacy swap") => { setSelectedRoute(name); setMenuOpen(false); };
  return <div className="maximum-privacy-bold" id="bi-top">
    <header className="bi-header">
      <div className="bi-wrap bi-header-inner">
        <Brand />
        <button className="bi-menu" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="bi-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        <nav className={`bi-nav ${menuOpen ? "is-open" : ""}`} id="bi-navigation" aria-label="Main navigation">
          <a href="#bi-routes" onClick={() => chooseRoute("Private route")}>Private route</a>
          <a href="#bi-routes" onClick={() => chooseRoute("Privacy swap")}>Privacy swap</a>
          <button onClick={() => openPanel("Tokenomics")}>Tokenomics</button>
          <button onClick={() => openPanel("Docs")}>Docs <ArrowUpRight size={13} style={{ display: "inline" }} /></button>
        </nav>
      </div>
    </header>
    <main>
      <section className="bi-hero bi-wrap">
        <div className="bi-hero-top bi-label"><div className="bi-beta"><i /> PRIVATE BETA IS LIVE</div><span>SOLANA ORIGIN / DARKSWAP</span></div>
        <h1>Maximum privacy,{" "}<span>as intended.</span></h1>
        <div className="bi-hero-bottom">
          <div><p className="bi-lede">Private routing for Solana holders.<br />Your wallet stays yours. The send stays your decision.</p>
            <p className="bi-qualifier"><strong>Our design goal, not an absolute guarantee.</strong> Privacy varies by route. Solana deposits remain public; destination transfers may be public.</p></div>
          <div className="bi-actions"><a className="bi-button" href="#bi-routes">Explore the live routes <ArrowRight size={20} /></a><small>Local route overview · No funds move in this preview</small></div>
        </div>
        <div className="bi-principles"><span><Check /> Orders move no funds</span><span><Check /> No automatic send</span><span><Check /> Manual deposit</span></div>
      </section>
      <section className="bi-process" id="bi-process">
        <div className="bi-wrap">
          <div className="bi-section-head"><div><span className="bi-label">01 / INTENT INTO PRACTICE</span><h2>Nothing moves<br />until you do.</h2></div><p>DarkSwap prepares the order. You review the details and decide whether to make the deposit. That separation is built into the flow.</p></div>
          <div className="bi-process-track">
            <article><span className="bi-label">01 / REQUEST</span><h3>Choose a route.</h3><p>Select a Solana asset, a supported destination and a receiving address. Nothing moves at this step.</p></article>
            <article><span className="bi-label">02 / REVIEW</span><h3>Check the details.</h3><p>Review the quote, fees, limits, recipient and estimated time before creating an order.</p></article>
            <article><span className="bi-label">03 / DEPOSIT</span><h3>Send it yourself.</h3><p>Send the exact Solana deposit amount manually. Then track the order while the route completes.</p></article>
          </div>
          <RouteIllustration />
        </div>
      </section>
      <section className="bi-section bi-wrap" id="bi-routes">
        <div className="bi-section-head"><div><span className="bi-label">02 / LIVE IN PRIVATE BETA</span><h2>Two routes.<br />The same deliberate start.</h2></div><p>Both begin on Solana. Both let you review before you deposit. Assets and destinations depend on the available quote.</p></div>
        <div className="bi-route-list">
          <article className="bi-route"><img src="/__mockup/images/maximum-privacy/atom.png" alt="" /><div><h3>Private route</h3><span className="bi-label">EXISTING ROUTE / LIVE</span></div><p>Solana-origin swap or bridge, when a live quote is available. Manual deposit. Creating an order moves no funds.</p><button aria-label="Explore Private route locally" onClick={() => chooseRoute("Private route")} aria-expanded={selectedRoute === "Private route"}><ArrowUpRight size={21} /></button></article>
          <article className="bi-route"><img src="/__mockup/images/maximum-privacy/shield.png" alt="" /><div><h3>Privacy swap</h3><span className="bi-label">CONFIDENTIAL HANDLING / LIVE</span></div><p>Request confidential handling. Review the quote, recipient and refund addresses, then choose whether to deposit.</p><button aria-label="Explore Privacy swap locally" onClick={() => chooseRoute("Privacy swap")} aria-expanded={selectedRoute === "Privacy swap"}><ArrowUpRight size={21} /></button></article>
        </div>
        <p className="bi-preview-note">Exploration only. The routes are live in the product; this local overview cannot request quotes, create orders or receive funds.</p>
        {selectedRoute && <div className="bi-local-detail" aria-live="polite"><span className="bi-label">LOCAL ROUTE OVERVIEW / NO LIVE REQUESTS</span><h3>{selectedRoute}</h3><p>{selectedRoute === "Privacy swap" ? "In the real flow, you request a confidential Solana-origin quote, check recipient and refund details, then create an order before depositing manually." : "In the real flow, you check an available Solana-origin swap or bridge quote, create an order, then use its deposit instructions to send manually."} Route availability, timing and privacy vary. No anonymity guarantee.</p></div>}
      </section>
      <section className="bi-boundaries">
        <div className="bi-wrap bi-boundary-grid"><div><span className="bi-label">03 / THE BOUNDARIES MATTER</span><h2>Private routing.<br />Not invisibility.</h2><p>Confidence comes from knowing what a route does—and what it cannot promise.</p></div>
          <ul className="bi-facts"><li><b>Public chains stay public.</b><span>Your Solana deposit is public. Destination transfers may be public too.</span></li><li><b>The route makes a difference.</b><span>Privacy depends on the route and its providers. No route guarantees anonymity or unlinkability.</span></li><li><b>Review before committing.</b><span>Execution can take longer than a direct swap. Availability, fees, limits and timing vary.</span></li></ul>
        </div>
      </section>
      <section className="bi-section bi-wrap" id="bi-questions">
        <div className="bi-faq-grid"><div><span className="bi-label">04 / BEFORE YOU SEND</span><h2>Plain answers.<br />Better decisions.</h2><p>The useful details, without the mystery.</p></div>
          <div className="bi-faq">{faqs.map((faq,index) => <article className="bi-faq-item" key={faq.question}><h3><button aria-expanded={openFaq === index} aria-controls={`bi-answer-${index}`} onClick={() => setOpenFaq(openFaq === index ? null : index)}><span>{faq.question}</span><ChevronDown /></button></h3><div className="bi-answer" id={`bi-answer-${index}`} hidden={openFaq !== index}>{faq.answer}</div></article>)}</div>
        </div>
      </section>
      <section className="bi-closing"><div className="bi-wrap"><div><h2>Start with the details.</h2><p>Choose a route. Review first. Send only when you decide.</p></div><a href="#bi-routes" className="bi-button">Explore the live routes <ArrowRight size={20} /></a></div></section>
    </main>
    <footer className="bi-footer"><div className="bi-wrap"><div className="bi-footer-top"><Brand /><div className="bi-footer-links"><button onClick={() => openPanel("Tokenomics")}>Tokenomics</button><button onClick={() => openPanel("Docs")}>Docs</button><button onClick={() => openPanel("Founder previews")}>Founder previews <ArrowUpRight size={13} style={{ display: "inline" }} /></button></div></div><p className="bi-risk">SOLANA ORIGIN · MANUAL DEPOSIT · PRIVATE BETA<br />Crypto transfers involve risk. Verify the recipient, network, exact amount and deposit instructions before sending. Privacy is route-dependent, not guaranteed. DARK holder rewards are planned, not active payouts. This is a local design exploration, not a live swap interface.</p></div></footer>
    {panel && <div className="bi-dialog-shade" onClick={() => setPanel(null)}><div className="bi-dialog" role="dialog" aria-modal="true" aria-labelledby="bi-dialog-title" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); } }}><div className="bi-dialog-top"><span className="bi-label">{panel} / LOCAL OVERVIEW</span><button ref={closeRef} aria-label="Close overview" onClick={() => setPanel(null)}><X size={20} /></button></div><h2 id="bi-dialog-title">{localPanels[panel].title}</h2>{localPanels[panel].paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div></div>}
  </div>;
}