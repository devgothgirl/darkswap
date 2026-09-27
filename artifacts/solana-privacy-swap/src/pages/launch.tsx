import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  LockKeyhole,
  Menu,
  MoveUpRight,
  Shield,
  X,
} from "lucide-react";
import "./launch.css";

const faqs = [
  {
    question: "What does “private route” mean here?",
    answer:
      "Both live Solana-origin routes create deposit instructions before you manually send funds. Privacy swap requests confidential handling; Solana deposits remain public. Neither route guarantees anonymity.",
  },
  {
    question: "Do I connect a wallet to use it?",
    answer:
      "No wallet connection is needed to request and create an order. After reviewing the quote, you send the exact deposit amount yourself from a Solana wallet to the deposit address shown in the order.",
  },
  {
    question: "Which assets and destinations are supported?",
    answer:
      "Availability depends on the live quote for your selected amount and destination. Support is not universal, and the quote screen is the source of truth before you create an order.",
  },
  {
    question: "Is execution instant or guaranteed private?",
    answer:
      "No. Private execution can take longer than a direct swap, routes can be unavailable, and no service can promise absolute anonymity. Review the quote, fees, limits, and deposit instructions before sending.",
  },
];

const routePoints = [
  { id: "wallet", label: "Your Solana wallet", code: "01 / YOUR WALLET", detail: "Your wallet stays yours. DarkSwap never sends a transaction for you.", left: "16.4%", top: "65.6%" },
  { id: "deposit", label: "Order deposit", code: "02 / DEPOSIT", detail: "Create an order first, then check its exact Solana deposit address and amount.", left: "36.9%", top: "30.2%" },
  { id: "progress", label: "Route in progress", code: "03 / IN PROGRESS", detail: "Track the order after you send. Timing and availability depend on the route.", left: "59.7%", top: "69.8%" },
  { id: "destination", label: "Destination", code: "04 / DESTINATION", detail: "If the route completes, assets arrive at the receiving address you provided.", left: "82.5%", top: "38.1%" },
] as const;

function RouteIllustration() {
  const [activePoint, setActivePoint] = useState<(typeof routePoints)[number]["id"] | null>(null);
  const selectedPoint = routePoints.find((point) => point.id === activePoint);

  return (
    <div className="launch-visual" aria-label="Illustration of a manually deposited Solana route">
      <div className="visual-cap">
        <span><i /> ROUTE MODEL / 01</span>
        <span>NOT A WALLET CONNECTION</span>
      </div>
      <div className="route-stage" data-active={activePoint ?? ""}>
      <svg className="route-art" viewBox="0 0 640 430" role="img" aria-labelledby="route-title route-desc">
        <title id="route-title">A measured route from Solana deposit to destination</title>
        <desc id="route-desc">An original abstract diagram showing a deposit point, a private route, and a destination point.</desc>
        <defs>
          <pattern id="route-grid" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M 26 0 L 0 0 0 26" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="1" />
          </pattern>
          <linearGradient id="route-ribbon" x1="0" x2="1">
            <stop offset="0" stopColor="#ff735d" />
            <stop offset=".52" stopColor="#ffb69d" />
            <stop offset="1" stopColor="#9f8cff" />
          </linearGradient>
        </defs>
        <rect x="20" y="22" width="600" height="386" rx="4" fill="url(#route-grid)" />
        <path d="M105 282 C155 282 146 130 236 130 S304 300 382 300 S435 164 528 164" fill="none" stroke="#382e4b" strokeWidth="17" strokeLinecap="round" />
        <path d="M105 282 C155 282 146 130 236 130 S304 300 382 300 S435 164 528 164" fill="none" stroke="#ff8b73" strokeOpacity=".16" strokeWidth="34" strokeLinecap="round" />
        <path className="route-tracer" d="M105 282 C155 282 146 130 236 130 S304 300 382 300 S435 164 528 164" fill="none" stroke="url(#route-ribbon)" strokeWidth="2" strokeDasharray="5 9" strokeLinecap="round" />
        <path className="route-glint" d="M105 282 C155 282 146 130 236 130 S304 300 382 300 S435 164 528 164" fill="none" stroke="#f5dfff" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="2 98" />
        <circle className="route-pulse route-pulse-wallet" cx="105" cy="282" r="46" fill="none" stroke="#ff9c83" strokeWidth="2" />
        <circle className="route-pulse route-pulse-deposit" cx="236" cy="130" r="28" fill="none" stroke="#ffb49a" strokeWidth="2" />
        <circle className="route-pulse route-pulse-progress" cx="382" cy="300" r="28" fill="none" stroke="#c0aaff" strokeWidth="2" />
        <circle className="route-pulse route-pulse-destination" cx="528" cy="164" r="46" fill="none" stroke="#a493ff" strokeWidth="2" />
        <circle className="route-node route-node-wallet" cx="105" cy="282" r="43" fill="#211a30" stroke="#ff826c" strokeWidth="1.5" />
        <circle cx="105" cy="282" r="28" fill="none" stroke="#ff826c" strokeOpacity=".36" />
        <path d="M105 266v32m-11-10 11 10 11-10" fill="none" stroke="#ffd1bb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="route-node route-node-deposit" cx="236" cy="130" r="24" fill="#211a30" stroke="#ffb49a" strokeWidth="1.5" />
        <circle cx="236" cy="130" r="5" fill="#ffb49a" />
        <circle className="route-node route-node-progress" cx="382" cy="300" r="24" fill="#211a30" stroke="#c0aaff" strokeWidth="1.5" />
        <circle cx="382" cy="300" r="5" fill="#c0aaff" />
        <circle className="route-node route-node-destination" cx="528" cy="164" r="43" fill="#211a30" stroke="#a493ff" strokeWidth="1.5" />
        <circle cx="528" cy="164" r="28" fill="none" stroke="#a493ff" strokeOpacity=".36" />
        <path d="M515 164h26m-10-10 10 10-10 10" fill="none" stroke="#ded4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <g fill="#e5d9f0" fontFamily="DM Sans, sans-serif" fontSize="13" letterSpacing="1">
          <text x="68" y="350">YOUR SOLANA WALLET</text>
          <text x="204" y="89">DEPOSIT</text>
          <text x="348" y="349">ROUTE IN PROGRESS</text>
          <text x="490" y="228">DESTINATION</text>
        </g>
        <g fill="#d2afff" fontFamily="Space Mono, monospace" fontSize="11">
          <text x="160" y="235">MANUAL SEND</text>
          <text x="396" y="223">PRIVATE ROUTE</text>
        </g>
        <path d="M182 221l-14 7m262-8-12 7" stroke="#ffb49a" strokeWidth="1" strokeDasharray="2 3" />
      </svg>
      {routePoints.map((point) => (
        <button
          key={point.id}
          type="button"
          className="route-hotspot"
          style={{ left: point.left, top: point.top }}
          aria-label={`${point.label}: ${point.detail}`}
          aria-pressed={activePoint === point.id}
          onPointerEnter={(event) => { if (event.pointerType === "mouse") setActivePoint(point.id); }}
          onPointerLeave={(event) => { if (event.pointerType === "mouse") setActivePoint(null); }}
          onFocus={() => setActivePoint(point.id)}
          onBlur={() => setActivePoint(null)}
          onClick={() => setActivePoint(point.id)}
        />
      ))}
      </div>
      <div className="route-readout" aria-live="polite">
        <span className="route-readout-code">{selectedPoint?.code ?? "EXPLORE THE MODEL"}</span>
        <span className="route-readout-copy">{selectedPoint?.detail ?? "Hover, focus, or tap a route point to learn what happens."}</span>
      </div>
      <div className="visual-foot">
        <span><span className="signal-mark">01</span> Create an order</span>
        <span className="visual-separator" />
        <span><span className="signal-mark">02</span> Send manually</span>
        <span className="visual-separator" />
        <span><span className="signal-mark">03</span> Track progress</span>
      </div>
    </div>
  );
}

export default function Launch() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="ds-launch">
      <div className="launch-ribbon"><span className="ribbon-dot" /> PRIVATE BETA IS LIVE</div>
      <header className="launch-header">
        <Link href="/" className="launch-brand" aria-label="DarkSwap home"><img className="launch-brand-icon" src={`${import.meta.env.BASE_URL}brand/icon.png`} alt=""/><img className="launch-brand-wordmark" src={`${import.meta.env.BASE_URL}brand/wordmark.png`} alt="DarkSwap"/></Link>
        <button className="mobile-menu-toggle" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"}>
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
        <nav className={`launch-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#scope" onClick={() => setMenuOpen(false)}>Beta scope</a>
          <a href="#questions" onClick={() => setMenuOpen(false)}>Questions</a>
          <Link href="/docs" onClick={() => setMenuOpen(false)}>Docs</Link>
          <Link href="/previews" onClick={() => setMenuOpen(false)}>Previews</Link>
          <Link className="header-cta" href="/near-swap">Privacy swap <ArrowUpRight size={15} /></Link>
        </nav>
      </header>

      <main id="top">
        <section className="launch-hero">
          <div className="hero-copy-block">
            <div className="overline"><span className="overline-square" /> SOLANA ORIGIN: NEAR POWERED</div>
            <h1>Move value.<br /><em>Leave less</em><br />behind.</h1>
            <p className="hero-lede">A deposit-based route for Solana holders who want more separation between the wallet they send from and where assets arrive.</p>
            <div className="hero-qualifier"><LockKeyhole size={15} /><span>No wallet connection. No automatic send.<br /><b>You review, then deposit manually.</b></span></div>
            <Link className="hero-cta" href="/near-swap">Open Privacy swap <ArrowRight size={17} /></Link>
            <p className="cta-note">Or <Link href="/swap">use the existing private route</Link> · Quote availability varies</p>
          </div>
          <RouteIllustration />
          <div className="hero-index"><span>01</span><span className="index-line" /> <span>PRIVATE ROUTING, IN BETA</span></div>
        </section>

        <section className="manifesto" aria-label="Product statement">
          <div className="manifesto-side"><span className="manifesto-kicker">THE IDEA</span><span className="manifesto-mark">DS / 01</span></div>
          <div className="manifesto-copy">
            <p>Some routes deserve <i>a little distance.</i></p>
            <span>DarkSwap gives you a clear place to request a supported Solana-origin private swap or bridge—without connecting a wallet to the app.</span>
          </div>
          <div className="manifesto-stamp"><Shield size={22} strokeWidth={1.35} /><span>LESS<br />LINKED</span></div>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="section-heading">
            <div><span className="overline"><span className="overline-square" /> A DELIBERATE FLOW</span><h2>Nothing moves<br />until <em>you do.</em></h2></div>
            <p>DarkSwap prepares the order. You decide whether to make the deposit. Clear steps, clear responsibility.</p>
          </div>
          <div className="steps-track">
            <article className="step-card">
              <span className="step-count">01 / REQUEST</span>
              <div className="step-icon"><ArrowDownLeft size={22} /></div>
              <h3>Choose a route</h3>
              <p>Select a Solana asset, a destination supported by the live quote, and enter the receiving address.</p>
              <span className="step-foot">NO WALLET CONNECTED</span>
            </article>
            <div className="step-connector"><span /></div>
            <article className="step-card">
              <span className="step-count">02 / REVIEW</span>
              <div className="step-icon"><CircleHelp size={22} /></div>
              <h3>Check the details</h3>
              <p>Review the route quote, fees, limits, recipient and estimated time before creating an order.</p>
              <span className="step-foot">QUOTE BEFORE COMMITMENT</span>
            </article>
            <div className="step-connector"><span /></div>
            <article className="step-card">
              <span className="step-count">03 / DEPOSIT</span>
              <div className="step-icon"><MoveUpRight size={22} /></div>
              <h3>Send it yourself</h3>
              <p>Manually send the exact deposit amount on Solana. Track the order while the route completes.</p>
              <span className="step-foot">YOU CONTROL THE SEND</span>
            </article>
          </div>
          <div className="steps-disclaimer"><Clock3 size={15} /><span>Private execution can take longer. Availability and timing vary by route.</span></div>
        </section>

        <section className="scope-section" id="scope">
          <div className="scope-header">
            <div><span className="overline"><span className="overline-square" /> BETA, WITH BOUNDARIES</span><h2>Two live routes.<br /><em>More in the making.</em></h2></div>
            <p>We’re opening the useful part first. The rest stays clearly labeled until it’s ready.</p>
          </div>
          <div className="scope-grid">
            <article className="scope-card scope-live">
              <div className="scope-card-top"><span className="scope-status"><i /> LIVE IN PRIVATE BETA</span><span className="scope-code">01</span></div>
              <div className="scope-emblem"><img src={`${import.meta.env.BASE_URL}brand/atom.png`} alt="" /></div>
              <h3>Existing private route</h3>
              <p>Solana-origin swap or bridge, when a live quote is available. Manual deposit. No wallet connection to DarkSwap.</p>
              <Link href="/swap" className="scope-link">Open existing route <ArrowUpRight size={15} /></Link>
            </article>
            <article className="scope-card scope-live">
              <div className="scope-card-top"><span className="scope-status"><i /> LIVE IN PRIVATE BETA</span><span className="scope-code">02</span></div>
              <div className="scope-emblem"><span className="scope-near-mark" aria-hidden="true">⋈</span></div>
              <h3>Privacy swap</h3>
              <p>Request a confidential Solana-origin quote, review recipient and refund addresses, then decide whether to deposit manually. No anonymity guarantee.</p>
              <Link href="/near-swap" className="scope-link">Open Privacy swap <ArrowUpRight size={15} /></Link>
            </article>
            <article className="scope-card scope-closed">
              <div className="scope-card-top"><span className="scope-status closed"><i /> CLOSED BETA</span><span className="scope-code">03</span></div>
              <div className="closed-art closed-art-grid" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
              <h3>Token research</h3>
              <p>Explore remains closed. Search a dated catalog of Solana xStock and PreStock entries in Screener Beta, without live market requests.</p>
              <Link href="/screener-beta" className="scope-preview-link">Open Screener Beta <ArrowUpRight size={15} /></Link>
              <span className="scope-lock"><LockKeyhole size={13} /> LIVE RESEARCH NOT AVAILABLE YET</span>
            </article>
            <article className="scope-card scope-closed">
              <div className="scope-card-top"><span className="scope-status closed"><i /> CLOSED BETA</span><span className="scope-code">04</span></div>
              <div className="closed-art public-art" aria-hidden="true"><span className="public-line line-one" /><span className="public-line line-two" /><span className="public-node node-one" /><span className="public-node node-two" /><span className="public-node node-three" /></div>
              <h3>OKX public swap</h3>
              <p>A separate, on-chain same-chain swap. It is not private and is not a bridge. Closed beta.</p>
              <span className="scope-lock"><LockKeyhole size={13} /> NOT AVAILABLE YET</span>
            </article>
          </div>
          <p className="scope-footnote"><Check size={14} /> No implied support beyond the route and assets shown in the live quote.</p>
          <p className="scope-footnote"><Link href="/previews" className="scope-preview-link">Also in preview: Split Mixer for Solana and Privacy Bundle for Launchers <ArrowUpRight size={15} /></Link></p>
        </section>

        <section className="trust-section">
          <div className="trust-visual">
            <div className="trust-orbit"><span className="trust-center"><img src={`${import.meta.env.BASE_URL}brand/shield.png`} alt="" /></span><span className="orbit-ring ring-1" /><span className="orbit-ring ring-2" /><span className="orbit-point point-a" /><span className="orbit-point point-b" /><span className="orbit-point point-c" /></div>
            <div className="trust-caption">A QUIETER ROUTE<br /><span>NOT A PROMISE OF INVISIBILITY</span></div>
          </div>
          <div className="trust-copy">
            <span className="overline"><span className="overline-square" /> PRIVACY, PRECISELY</span>
            <h2>Designed for<br /><em>less linkage.</em></h2>
             <p>DarkSwap does not ask to connect to your wallet. You review the available order and make a separate, manual deposit if you choose.</p>
            <div className="trust-note"><span className="note-bar" /><p>Privacy depends on the route and its providers. DarkSwap does not promise absolute anonymity, hide every on-chain detail, or make a route risk-free.</p></div>
            <a href="#questions" className="text-link">Read the practical details <ArrowRight size={15} /></a>
          </div>
        </section>

        <section className="faq-section" id="questions">
          <div className="faq-title">
            <span className="overline"><span className="overline-square" /> BEFORE YOU SEND</span>
            <h2>Good to know.</h2>
            <p>Financial routes deserve plain answers.</p>
          </div>
          <div className="faq-list">
            {faqs.map((faq, index) => (
              <div className={`faq-item ${openFaq === index ? "faq-open" : ""}`} key={faq.question}>
                <h3>
                  <button type="button" aria-expanded={openFaq === index} aria-controls={`faq-answer-${index}`} onClick={() => setOpenFaq(openFaq === index ? null : index)}>
                    <span className="faq-num">0{index + 1}</span><span>{faq.question}</span><ChevronDown size={17} />
                  </button>
                </h3>
                <div id={`faq-answer-${index}`} className="faq-answer" hidden={openFaq !== index}><p>{faq.answer}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="closing-cta">
          <div className="closing-index"><span className="ribbon-dot" /> PRIVATE BETA / LIVE ROUTE</div>
          <h2>Start with a quote.<br /><em>Decide from there.</em></h2>
          <p>Check the supported options first. Creating an order does not move your funds; deposit instructions come after order creation.</p>
           <Link className="hero-cta closing-button" href="/near-swap">Open Privacy swap <ArrowRight size={17} /></Link>
          <p className="cta-note">Prefer the original flow? <Link href="/swap">Open the existing route</Link></p>
          <span className="closing-note"><LockKeyhole size={13} /> No wallet connection required</span>
        </section>
        <div className="launch-banner-wrap" id="brand-banner">
          <img
            className="launch-banner"
            src={`${import.meta.env.BASE_URL}brand/x-banner.png`}
            alt="DarkSwap — Private swaps on Solana"
            loading="lazy"
            decoding="async"
            width="1500"
            height="500"
          />
        </div>
      </main>

      <footer className="launch-footer">
         <Link href="/" className="launch-brand footer-brand"><img className="launch-brand-icon" src={`${import.meta.env.BASE_URL}brand/icon.png`} alt=""/><img className="launch-brand-wordmark" src={`${import.meta.env.BASE_URL}brand/wordmark.png`} alt="DarkSwap"/></Link>
         <span className="footer-caption">SOLANA ORIGIN · MANUAL DEPOSIT · PRIVATE BETA</span>
         <Link href="/docs" className="footer-route">Read docs <ArrowUpRight size={14} /></Link>
      </footer>
    </div>
  );
}