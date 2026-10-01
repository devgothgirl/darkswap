import { useState } from "react";
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
import "./Launch.css";

const faqs = [
  {
    question: "What does “private route” mean here?",
    answer:
      "The available route is provided by Houdini for a Solana-origin swap or bridge. DarkSwap does not connect your wallet, and the order is created before you manually send funds. Privacy is route-specific; it is not a guarantee of anonymity.",
  },
  {
    question: "Do I connect a wallet to use it?",
    answer:
      "No wallet connection is needed to request and create an order. After reviewing the quote, you send the exact deposit amount yourself from a Solana wallet to the deposit address shown in the order.",
  },
  {
    question: "Which assets and destinations are supported?",
    answer:
      "Availability depends on Houdini’s live quote for your selected amount and destination. Support is not universal, and the quote screen is the source of truth before you create an order.",
  },
  {
    question: "Is execution instant or guaranteed private?",
    answer:
      "No. Private execution can take longer than a direct swap, routes can be unavailable, and no service can promise absolute anonymity. Review the quote, fees, limits, and deposit instructions before sending.",
  },
];

function RouteIllustration() {
  return (
    <div className="launch-visual" aria-label="Illustration of a manually deposited Solana route">
      <div className="visual-cap">
        <span><i /> ROUTE MODEL / 01</span>
        <span>NOT A WALLET CONNECTION</span>
      </div>
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
        <path d="M105 282 C155 282 146 130 236 130 S304 300 382 300 S435 164 528 164" fill="none" stroke="url(#route-ribbon)" strokeWidth="2" strokeDasharray="5 9" strokeLinecap="round" />
        <path d="M105 282 C155 282 146 130 236 130 S304 300 382 300 S435 164 528 164" fill="none" stroke="#ff8b73" strokeOpacity=".16" strokeWidth="34" strokeLinecap="round" />
        <circle cx="105" cy="282" r="43" fill="#211a30" stroke="#ff826c" strokeWidth="1.5" />
        <circle cx="105" cy="282" r="28" fill="none" stroke="#ff826c" strokeOpacity=".36" />
        <path d="M105 266v32m-11-10 11 10 11-10" fill="none" stroke="#ffd1bb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="236" cy="130" r="24" fill="#211a30" stroke="#ffb49a" strokeWidth="1.5" />
        <circle cx="236" cy="130" r="5" fill="#ffb49a" />
        <circle cx="382" cy="300" r="24" fill="#211a30" stroke="#c0aaff" strokeWidth="1.5" />
        <circle cx="382" cy="300" r="5" fill="#c0aaff" />
        <circle cx="528" cy="164" r="43" fill="#211a30" stroke="#a493ff" strokeWidth="1.5" />
        <circle cx="528" cy="164" r="28" fill="none" stroke="#a493ff" strokeOpacity=".36" />
        <path d="M515 164h26m-10-10 10 10-10 10" fill="none" stroke="#ded4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <g fill="#c8bdcc" fontFamily="DM Sans, sans-serif" fontSize="11" letterSpacing="1.5">
          <text x="68" y="350">YOUR SOLANA WALLET</text>
          <text x="204" y="89">DEPOSIT</text>
          <text x="348" y="349">ROUTE IN PROGRESS</text>
          <text x="490" y="228">DESTINATION</text>
        </g>
        <g fill="#ffb49a" fontFamily="Space Mono, monospace" fontSize="9">
          <text x="160" y="235">MANUAL SEND</text>
          <text x="396" y="223">HOUDINI ROUTE</text>
        </g>
        <path d="M182 221l-14 7m262-8-12 7" stroke="#ffb49a" strokeWidth="1" strokeDasharray="2 3" />
      </svg>
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

export function Launch() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="ds-launch">
      <div className="launch-ribbon"><span className="ribbon-dot" /> PRIVATE BETA IS LIVE <span className="ribbon-rule" /> SOLANA ORIGIN · HOUDINI ROUTE</div>
      <header className="launch-header">
        <a href="#top" className="launch-brand" aria-label="DarkSwap home">
          <span className="brand-symbol"><span /></span>
          <span>dark<span>swap</span></span>
        </a>
        <button className="mobile-menu-toggle" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"}>
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
        <nav className={`launch-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#scope" onClick={() => setMenuOpen(false)}>Beta scope</a>
          <a href="#questions" onClick={() => setMenuOpen(false)}>Questions</a>
          <a className="header-cta" href="/swap">Open private route <ArrowUpRight size={15} /></a>
        </nav>
      </header>

      <main id="top">
        <section className="launch-hero">
          <div className="hero-copy-block">
            <div className="overline"><span className="overline-square" /> A PRIVATE ROUTE OUT OF SOLANA</div>
            <h1>Move value.<br /><em>Leave less</em><br />behind.</h1>
            <p className="hero-lede">A deposit-based route for Solana holders who want more separation between the wallet they send from and where assets arrive.</p>
            <div className="hero-qualifier"><LockKeyhole size={15} /><span>No wallet connection. No automatic send.<br /><b>You review, then deposit manually.</b></span></div>
            <a className="hero-cta" href="/swap">Start a private route <ArrowRight size={17} /></a>
            <p className="cta-note">Opens the Houdini route flow · Quote availability varies</p>
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
            <div><span className="overline"><span className="overline-square" /> BETA, WITH BOUNDARIES</span><h2>One live route.<br /><em>More in the making.</em></h2></div>
            <p>We’re opening the useful part first. The rest stays clearly labeled until it’s ready.</p>
          </div>
          <div className="scope-grid">
            <article className="scope-card scope-live">
              <div className="scope-card-top"><span className="scope-status"><i /> LIVE IN PRIVATE BETA</span><span className="scope-code">01</span></div>
              <div className="scope-emblem"><span className="emblem-core" /><span className="emblem-orbit orbit-a" /><span className="emblem-orbit orbit-b" /><span className="emblem-axis" /></div>
              <h3>Houdini private route</h3>
              <p>Solana-origin swap or bridge, when a live quote is available. Manual deposit. No wallet connection to DarkSwap.</p>
              <a href="/swap" className="scope-link">Open the available route <ArrowUpRight size={15} /></a>
            </article>
            <article className="scope-card scope-closed">
              <div className="scope-card-top"><span className="scope-status closed"><i /> CLOSED BETA</span><span className="scope-code">02</span></div>
              <div className="closed-art closed-art-grid" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
              <h3>Token research</h3>
              <p>Explore is being developed separately. It is not open or linked from this launch page.</p>
              <span className="scope-lock"><LockKeyhole size={13} /> NOT AVAILABLE YET</span>
            </article>
            <article className="scope-card scope-closed">
              <div className="scope-card-top"><span className="scope-status closed"><i /> CLOSED BETA</span><span className="scope-code">03</span></div>
              <div className="closed-art public-art" aria-hidden="true"><span className="public-line line-one" /><span className="public-line line-two" /><span className="public-node node-one" /><span className="public-node node-two" /><span className="public-node node-three" /></div>
              <h3>OKX public swap</h3>
              <p>A separate, on-chain same-chain swap. It is not private and is not a bridge. Closed beta.</p>
              <span className="scope-lock"><LockKeyhole size={13} /> NOT AVAILABLE YET</span>
            </article>
          </div>
          <p className="scope-footnote"><Check size={14} /> No implied support beyond the route and assets shown in the live quote.</p>
        </section>

        <section className="trust-section">
          <div className="trust-visual">
            <div className="trust-orbit"><span className="trust-center"><LockKeyhole size={24} /></span><span className="orbit-ring ring-1" /><span className="orbit-ring ring-2" /><span className="orbit-point point-a" /><span className="orbit-point point-b" /><span className="orbit-point point-c" /></div>
            <div className="trust-caption">A QUIETER ROUTE<br /><span>NOT A PROMISE OF INVISIBILITY</span></div>
          </div>
          <div className="trust-copy">
            <span className="overline"><span className="overline-square" /> PRIVACY, PRECISELY</span>
            <h2>Designed for<br /><em>less linkage.</em></h2>
            <p>DarkSwap does not ask to connect to your wallet. The available order is handled by Houdini’s route; you review it and make a separate, manual deposit.</p>
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
          <a className="hero-cta closing-button" href="/swap">Open the Houdini route <ArrowRight size={17} /></a>
          <span className="closing-note"><LockKeyhole size={13} /> No wallet connection required</span>
        </section>
      </main>

      <footer className="launch-footer">
        <a href="#top" className="launch-brand footer-brand"><span className="brand-symbol"><span /></span><span>dark<span>swap</span></span></a>
        <span className="footer-caption">SOLANA ORIGIN · HOUDINI PRIVATE ROUTE · PRIVATE BETA</span>
        <a href="/swap" className="footer-route">Enter route <ArrowUpRight size={14} /></a>
      </footer>
    </div>
  );
}